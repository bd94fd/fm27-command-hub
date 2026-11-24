/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UploadPauseReason = 'manual' | 'offline';

export interface UploadControllerState {
  paused: boolean;
  pauseReason: UploadPauseReason | null;
  localFallbackRequested: boolean;
}

export interface UploadController {
  pause: (reason?: UploadPauseReason) => void;
  resume: () => void;
  requestLocalFallback: () => void;
  isPaused: () => boolean;
  getPauseReason: () => UploadPauseReason | null;
  isLocalFallbackRequested: () => boolean;
  getState: () => UploadControllerState;
  /** Returns an AbortSignal that aborts whenever the upload pauses or switches to local decode. */
  getAttemptSignal: () => AbortSignal | undefined;
  /** Resolves when upload is unpaused ('resumed') or local fallback is requested ('fallback'). */
  waitUntilResumed: (signal?: AbortSignal) => Promise<'resumed' | 'fallback'>;
  subscribe: (listener: (state: UploadControllerState) => void) => () => void;
}

export function createUploadController(): UploadController {
  let paused = false;
  let pauseReason: UploadPauseReason | null = null;
  let localFallbackRequested = false;
  let attemptController: AbortController | null =
    typeof AbortController !== 'undefined' ? new AbortController() : null;

  const listeners = new Set<(state: UploadControllerState) => void>();
  const waiters = new Set<(outcome: 'resumed' | 'fallback') => void>();

  const getState = (): UploadControllerState => ({
    paused,
    pauseReason,
    localFallbackRequested,
  });

  const emit = () => {
    const snap = getState();
    for (const listener of listeners) {
      try {
        listener(snap);
      } catch {
        // Never allow a UI subscriber error to break upload control
      }
    }
  };

  const resolveWaiters = (outcome: 'resumed' | 'fallback') => {
    if (waiters.size === 0) return;
    const pending = Array.from(waiters);
    waiters.clear();
    for (const resolve of pending) {
      resolve(outcome);
    }
  };

  const pause = (reason: UploadPauseReason = 'manual') => {
    if (localFallbackRequested) return;
    if (paused && pauseReason === reason) return;
    // Manual pause takes precedence over offline auto-pause so signal return
    // won't unexpectedly resume an upload the user explicitly paused.
    if (paused && pauseReason === 'manual' && reason === 'offline') {
      return;
    }
    paused = true;
    pauseReason = reason;
    attemptController?.abort();
    emit();
  };

  const resume = () => {
    if (localFallbackRequested) return;
    if (!paused) return;
    paused = false;
    pauseReason = null;
    attemptController =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    emit();
    resolveWaiters('resumed');
  };

  const requestLocalFallback = () => {
    if (localFallbackRequested) return;
    localFallbackRequested = true;
    paused = false;
    pauseReason = null;
    attemptController?.abort();
    emit();
    resolveWaiters('fallback');
  };

  const waitUntilResumed = (
    signal?: AbortSignal
  ): Promise<'resumed' | 'fallback'> => {
    if (signal?.aborted) {
      return Promise.reject(new Error('CANCELLED_BY_USER'));
    }
    if (localFallbackRequested) {
      return Promise.resolve('fallback');
    }
    if (!paused) {
      return Promise.resolve('resumed');
    }
    return new Promise<'resumed' | 'fallback'>((resolve, reject) => {
      let settled = false;
      const onResumeOrFallback = (outcome: 'resumed' | 'fallback') => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        resolve(outcome);
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        waiters.delete(onResumeOrFallback);
        reject(new Error('CANCELLED_BY_USER'));
      };
      waiters.add(onResumeOrFallback);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  };

  const subscribe = (listener: (state: UploadControllerState) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    pause,
    resume,
    requestLocalFallback,
    isPaused: () => paused,
    getPauseReason: () => pauseReason,
    isLocalFallbackRequested: () => localFallbackRequested,
    getState,
    getAttemptSignal: () => attemptController?.signal,
    waitUntilResumed,
    subscribe,
  };
}

export interface UploadSpeedSnapshot {
  percent: number;
  bytesPerSec: number | null;
  etaSec: number | null;
}

export interface UploadSpeedTracker {
  record: (bytesUploaded: number, nowMs?: number) => UploadSpeedSnapshot;
  markPaused: (nowMs?: number) => void;
  markResumed: (nowMs?: number) => void;
  reset: (totalBytes: number, nowMs?: number) => void;
}

const SPEED_WINDOW_MS = 10_000;

/**
 * Rolling-window upload speed & ETA tracker that excludes paused time so
 * signal drops or manual pauses do not distort MB/s or ETA estimates.
 */
export function createUploadSpeedTracker(
  initialTotalBytes: number,
  startedAtMs: number = Date.now()
): UploadSpeedTracker {
  let totalBytes = Math.max(0, initialTotalBytes);
  let activeTimeOffsetMs = 0;
  let pausedAtMs: number | null = null;
  let samples: Array<{ activeMs: number; bytes: number }> = [
    { activeMs: startedAtMs, bytes: 0 },
  ];

  const toActiveMs = (nowMs: number): number => {
    const refMs = pausedAtMs !== null ? pausedAtMs : nowMs;
    return refMs - activeTimeOffsetMs;
  };

  const computePercent = (bytesUploaded: number): number => {
    if (totalBytes <= 0) return 100;
    return Math.min(100, Math.max(0, Math.round((bytesUploaded / totalBytes) * 100)));
  };

  const record = (
    bytesUploaded: number,
    nowMs: number = Date.now()
  ): UploadSpeedSnapshot => {
    const safeBytes = Math.max(0, Math.min(totalBytes || bytesUploaded, bytesUploaded));
    const activeMs = toActiveMs(nowMs);
    const percent = computePercent(safeBytes);

    // If bytes went backwards (e.g., server session expired and restarted), rebase samples
    const lastSample = samples[samples.length - 1];
    if (lastSample && safeBytes < lastSample.bytes) {
      samples = [{ activeMs, bytes: safeBytes }];
      return { percent, bytesPerSec: null, etaSec: null };
    }

    samples.push({ activeMs, bytes: safeBytes });
    const windowCutoff = activeMs - SPEED_WINDOW_MS;
    while (samples.length > 2 && samples[1].activeMs < windowCutoff) {
      samples.shift();
    }

    const oldest = samples[0];
    const deltaMs = activeMs - oldest.activeMs;
    const deltaBytes = safeBytes - oldest.bytes;

    if (deltaMs < 150 || deltaBytes <= 0) {
      return {
        percent,
        bytesPerSec: null,
        etaSec: safeBytes >= totalBytes && totalBytes > 0 ? 0 : null,
      };
    }

    const bytesPerSec = (deltaBytes * 1000) / deltaMs;
    const remainingBytes = Math.max(0, totalBytes - safeBytes);
    const etaSec =
      remainingBytes === 0
        ? 0
        : bytesPerSec > 0
          ? Math.max(1, Math.ceil(remainingBytes / bytesPerSec))
          : null;

    return {
      percent,
      bytesPerSec,
      etaSec,
    };
  };

  const markPaused = (nowMs: number = Date.now()) => {
    if (pausedAtMs === null) {
      pausedAtMs = nowMs;
    }
  };

  const markResumed = (nowMs: number = Date.now()) => {
    if (pausedAtMs !== null) {
      activeTimeOffsetMs += Math.max(0, nowMs - pausedAtMs);
      pausedAtMs = null;
    }
  };

  const reset = (nextTotalBytes: number, nowMs: number = Date.now()) => {
    totalBytes = Math.max(0, nextTotalBytes);
    activeTimeOffsetMs = 0;
    pausedAtMs = null;
    samples = [{ activeMs: nowMs, bytes: 0 }];
  };

  return { record, markPaused, markResumed, reset };
}

export function formatBytesMb(bytes: number): string {
  return (Math.max(0, bytes) / (1024 * 1024)).toFixed(1);
}

export function formatTransferSpeed(bytesPerSec: number | null | undefined): string | null {
  if (typeof bytesPerSec !== 'number' || !Number.isFinite(bytesPerSec) || bytesPerSec <= 0) {
    return null;
  }
  const mbPerSec = bytesPerSec / (1024 * 1024);
  if (mbPerSec >= 0.1) {
    return `${mbPerSec.toFixed(mbPerSec >= 10 ? 0 : 1)} MB/s`;
  }
  const kbPerSec = Math.max(1, Math.round(bytesPerSec / 1024));
  return `${kbPerSec} KB/s`;
}

export function formatEtaSeconds(etaSec: number | null | undefined): string | null {
  if (typeof etaSec !== 'number' || !Number.isFinite(etaSec) || etaSec < 0) {
    return null;
  }
  if (etaSec === 0) return 'finishing…';
  if (etaSec < 60) return `~${Math.round(etaSec)}s left`;
  const mins = Math.floor(etaSec / 60);
  const secs = Math.round(etaSec % 60);
  return secs > 0 ? `~${mins}m ${secs}s left` : `~${mins}m left`;
}

export function isNavigatorOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
