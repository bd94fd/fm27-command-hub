import { FmImportScope } from '../types/fmSave';
import {
  DecodedFmSavePayload,
  WORKER_CACHE_BUSTER,
  shouldDefaultFastSync,
} from '../utils/fmSaveHydrator';
import {
  WORKER_INACTIVITY_TIMEOUT_MS,
  WORKER_HARD_CEILING_MS,
  formatWorkerTimeoutMessage,
  isValidSquadCheckpoint,
  buildCheckpointRecoveryWarning,
  applyCheckpointRecoveryWarning,
} from '../workers/fmSaveWorkerClient';
import {
  markSaveLoadStage,
  recordSaveLoadDetails,
} from '../utils/saveLoadBenchmark';
import { resolveFallbackFastSync } from '../utils/saveMemoryBudget';

import {
  UploadController,
  UploadPauseReason,
  createUploadController,
  createUploadSpeedTracker,
  formatBytesMb,
  isNavigatorOffline,
} from '../utils/uploadMetrics';

export type { FmImportScope, UploadController, UploadPauseReason };
export { createUploadController };

export interface FmSaveProgressStage {
  stage: 'boot' | 'install' | 'read' | 'parse';
  step?: string;
  phase?: string;
  progressPct?: number;
  label: string;
  elapsedSec?: number;
  transport?: 'server_upload' | 'server_decode' | 'browser_worker';
  bytesUploaded?: number;
  totalBytes?: number;
  speedBytesPerSec?: number | null;
  etaSec?: number | null;
  paused?: boolean;
  pauseReason?: UploadPauseReason | null;
  canPause?: boolean;
  canFallbackToLocal?: boolean;
  stallTipVisible?: boolean;
}

export interface DecodeFmSaveOptions {
  clubHint?: string;
  scope?: FmImportScope;
  fastSync?: boolean;
  /** Internal/testing override: skip server probe and go straight to browser Pyodide */
  forceBrowserWorker?: boolean;
  /** Optional resumable upload controller (manual pause/resume & local fallback) */
  uploadControl?: UploadController;
  /** Enable automatic pause/resume on browser offline/online transitions */
  enableOfflineAutoPause?: boolean;
  /** Milliseconds a chunk read can take before surfacing the Android Google Drive stall tip */
  stallTipThresholdMs?: number;
  /** Optional progressive hydration callback fired as soon as Stage 2 club core is ready */
  onCheckpoint?: (checkpoint: {
    stage: string;
    payload: DecodedFmSavePayload;
  }) => void;
  /** Optional local-only timing record used by the save-load benchmark harness */
  benchmarkId?: string;
}

export interface ServerDecodeStatus {
  serverDecodeAvailable: boolean;
  pythonVersion?: string | null;
  fmsaveVersion?: string | null;
}

export class ServerDecodeUnavailableError extends Error {
  public readonly statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'ServerDecodeUnavailableError';
    this.statusCode = statusCode;
  }
}

let sharedWorker: Worker | null = null;
let requestCounter = 0;
let activeCancelFn: (() => void) | null = null;
let isJobActive = false;

function getFmSaveWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(`/fm-save-worker.js${WORKER_CACHE_BUSTER}`, {
      type: 'module',
    });
  }
  return sharedWorker;
}

/**
 * Checks whether the Express backend has native Python fmsave available for fast Full Sync decoding.
 */
export async function checkServerDecodeStatus(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ServerDecodeStatus> {
  if (signal?.aborted) {
    throw new Error('CANCELLED_BY_USER');
  }
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const onCallerAbort = () => controller?.abort();
  signal?.addEventListener('abort', onCallerAbort, { once: true });
  const timeout = controller ? setTimeout(() => controller.abort(), 8_000) : null;
  try {
    const res = await fetchImpl('/api/fm27/decode-status', {
      method: 'GET',
      cache: 'no-store',
      signal: controller?.signal,
    });
    if (!res.ok) {
      return { serverDecodeAvailable: false };
    }
    const data = (await res.json()) as Partial<ServerDecodeStatus>;
    return {
      serverDecodeAvailable: Boolean(data?.serverDecodeAvailable),
      pythonVersion: data?.pythonVersion ?? null,
      fmsaveVersion: data?.fmsaveVersion ?? null,
    };
  } catch {
    if (signal?.aborted) {
      throw new Error('CANCELLED_BY_USER');
    }
    return { serverDecodeAvailable: false };
  } finally {
    if (timeout) clearTimeout(timeout);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}

export const SERVER_UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024; // 2 MB per chunk (faster over mobile/Cloudflare & safer against HTTP 520/524 drops)
export const SERVER_UPLOAD_CONCURRENCY = 4; // 4 parallel chunk streams on desktop when server supports parallel writes
export const SERVER_MOBILE_UPLOAD_CONCURRENCY = 4; // 4 parallel chunk writes; file reads stay serialized below
export const SERVER_MAX_SAVE_BYTES = 1024 * 1024 * 1024; // 1024 MB (1 GB) max total .fm save size
export const SERVER_JOB_POLL_INTERVAL_MS = 1_200; // 1.2s polling cadence
export const SERVER_CHUNK_MAX_RETRIES = 3;
export const SERVER_POLL_MAX_RETRIES = 5;
export const SERVER_INIT_TIMEOUT_MS = 15_000;
export const SERVER_CHUNK_READ_TIMEOUT_MS = 25_000;
export const SERVER_CHUNK_UPLOAD_TIMEOUT_MS = 35_000;

const TRANSIENT_SERVER_STATUSES = new Set([408, 429, 502, 503, 504, 520, 522, 524]);

function isTransientServerStatus(status: number): boolean {
  return TRANSIENT_SERVER_STATUSES.has(status);
}

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

class UploadPausedInterruption extends Error {
  constructor() {
    super('UPLOAD_PAUSED');
    this.name = 'UploadPausedInterruption';
  }
}

export const SERVER_STALL_TIP_THRESHOLD_MS = 5_000;

async function readBlobChunkWithTimeout(
  blob: Blob,
  timeoutMs: number,
  signal?: AbortSignal,
  pauseSignal?: AbortSignal,
  stallOptions?: { thresholdMs: number; onStall: () => void }
): Promise<ArrayBuffer> {
  if (signal?.aborted) {
    throw new Error('CANCELLED_BY_USER');
  }
  if (pauseSignal?.aborted) {
    throw new UploadPausedInterruption();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (stallTimer) clearTimeout(stallTimer);
      signal?.removeEventListener('abort', onAbort);
      pauseSignal?.removeEventListener('abort', onPauseAbort);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('CANCELLED_BY_USER'));
    };
    const onPauseAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new UploadPausedInterruption());
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new Error(
          'Could not read this .fm file from cloud storage (such as Google Drive) — the file read timed out. Please download the .fm file to your device storage (Downloads folder) first, then import it from there.'
        )
      );
    }, timeoutMs);
    const stallTimer =
      stallOptions && stallOptions.thresholdMs > 0
        ? setTimeout(() => {
            if (!settled) {
              stallOptions.onStall();
            }
          }, stallOptions.thresholdMs)
        : null;
    signal?.addEventListener('abort', onAbort, { once: true });
    pauseSignal?.addEventListener('abort', onPauseAbort, { once: true });

    blob
      .arrayBuffer()
      .then((buf) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(buf);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(
          new Error(
            `Could not read this .fm file from your device or cloud storage (${err instanceof Error ? err.message : 'file unreadable'}). If importing from Google Drive on mobile, download the .fm file to your phone first and import it from Downloads.`
          )
        );
      });
  });
}

function sleepWithAbort(
  ms: number,
  signal?: AbortSignal,
  pauseSignal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('CANCELLED_BY_USER'));
      return;
    }
    if (pauseSignal?.aborted) {
      reject(new UploadPausedInterruption());
      return;
    }
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      pauseSignal?.removeEventListener('abort', onPauseAbort);
    };
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error('CANCELLED_BY_USER'));
    };
    const onPauseAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new UploadPausedInterruption());
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
    pauseSignal?.addEventListener('abort', onPauseAbort, { once: true });
  });
}

async function readErrorMessageFromResponse(
  res: Response,
  fallback: string
): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // ignore non-JSON bodies
  }
  return fallback;
}

/**
 * Uploads the .fm save file in 2 MB chunks (4-way parallel when supported by server,
 * sequential fallback on mobile) with resumable pause/auto-pause/resume via:
 *   POST /api/fm27/decode-save/init
 *   POST /api/fm27/decode-save/chunk (2 MB slices)
 *   GET  /api/fm27/decode-save/upload/:uploadId/status (reconciles partial chunks on resume)
 *   POST /api/fm27/decode-save/finish -> { jobId }
 *   GET  /api/fm27/decode-save/job/:jobId (polled every 1.2s until done/error; emits progressive checkpoint)
 * Throws ServerDecodeUnavailableError on 503/502/504/404, network failure, or manual local-fallback request.
 */
export async function decodeFmSaveViaServer(
  file: File | Blob,
  options: {
    fileName?: string;
    clubHint?: string;
    scope?: FmImportScope;
    fastSync?: boolean;
    chunkSizeBytes?: number;
    pollIntervalMs?: number;
    retryBaseDelayMs?: number;
    uploadConcurrency?: number;
    uploadControl?: UploadController;
    enableOfflineAutoPause?: boolean;
    stallTipThresholdMs?: number;
    /** Injectable offline probe for unit testing */
    isOffline?: () => boolean;
    /** Injectable online/offline EventTarget for unit testing */
    networkEvents?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
    onCheckpoint?: (checkpoint: {
      stage: string;
      payload: DecodedFmSavePayload;
    }) => void;
    benchmarkId?: string;
  } = {},
  onProgress?: (progress: FmSaveProgressStage) => void,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<DecodedFmSavePayload> {
  const fileName =
    options.fileName || (file instanceof File ? file.name : 'save.fm');
  const scopeValue =
    options.scope === 'club_and_division' ||
    options.scope === 'full_division' ||
    options.scope === 'full_league'
      ? 'club_and_division'
      : options.scope === 'full_database' || options.scope === 'full_save'
        ? 'full_database'
        : 'club_only';
  const chunkSizeBytes = Math.max(
    1,
    options.chunkSizeBytes ?? SERVER_UPLOAD_CHUNK_BYTES
  );
  const pollIntervalMs = Math.max(
    10,
    options.pollIntervalMs ?? SERVER_JOB_POLL_INTERVAL_MS
  );
  const retryBaseDelayMs = Math.max(10, options.retryBaseDelayMs ?? 1_000);
  const stallTipThresholdMs =
    options.stallTipThresholdMs ?? SERVER_STALL_TIP_THRESHOLD_MS;
  const startedAtMs = Date.now();
  const totalBytes = file.size || 0;
  const totalMbLabel = formatBytesMb(totalBytes);

  if (totalBytes > SERVER_MAX_SAVE_BYTES) {
    throw new Error(
      `This .fm save (${totalMbLabel} MB) exceeds the 1024 MB (1 GB) server upload limit.`
    );
  }

  const controller = options.uploadControl ?? createUploadController();
  const checkIsOffline = options.isOffline ?? isNavigatorOffline;
  const enableOfflineAutoPause =
    options.enableOfflineAutoPause ??
    (typeof window !== 'undefined' && typeof navigator !== 'undefined');
  const networkTarget =
    options.networkEvents ??
    (enableOfflineAutoPause && typeof window !== 'undefined' ? window : undefined);

  const speedTracker = createUploadSpeedTracker(totalBytes, startedAtMs);
  let stallTipVisible = false;
  let uploadedBytes = 0;
  let lastSpeedBytesPerSec: number | null = null;
  let lastEtaSec: number | null = null;

  const elapsedSec = () =>
    Number(((Date.now() - startedAtMs) / 1000).toFixed(1));

  const throwIfCancelledOrFallback = () => {
    if (signal?.aborted) {
      throw new Error('CANCELLED_BY_USER');
    }
    if (controller.isLocalFallbackRequested()) {
      throw new ServerDecodeUnavailableError(
        'Switching to local on-device decoder as requested.'
      );
    }
  };

  const emitUploadProgress = (
    bytesNow: number,
    overrideLabel?: string,
    recordSample = false
  ) => {
    uploadedBytes = Math.max(0, Math.min(totalBytes || bytesNow, bytesNow));
    let pct =
      totalBytes > 0
        ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100))
        : 100;
    if (recordSample) {
      const snap = speedTracker.record(uploadedBytes);
      pct = snap.percent;
      lastSpeedBytesPerSec = snap.bytesPerSec;
      lastEtaSec = snap.etaSec;
    }
    const paused = controller.isPaused();
    const pauseReason = controller.getPauseReason();
    const uploadedMbLabel = formatBytesMb(uploadedBytes);
    const defaultLabel = paused
      ? pauseReason === 'offline'
        ? `Signal dropped at ${pct}% (${uploadedMbLabel} / ${totalMbLabel} MB) — paused safely. Will auto-resume when signal returns.`
        : `Upload paused at ${pct}% (${uploadedMbLabel} / ${totalMbLabel} MB) — tap Resume to continue.`
      : `Uploading save to server (${uploadedMbLabel} / ${totalMbLabel} MB — ${pct}%)…`;

    onProgress?.({
      stage: 'read',
      step: paused
        ? pauseReason === 'offline'
          ? 'Upload Paused (Offline)'
          : 'Upload Paused'
        : 'Server Upload',
      progressPct: pct,
      elapsedSec: elapsedSec(),
      label: overrideLabel ?? defaultLabel,
      transport: 'server_upload',
      bytesUploaded: uploadedBytes,
      totalBytes,
      speedBytesPerSec: paused ? null : lastSpeedBytesPerSec,
      etaSec: paused ? null : lastEtaSec,
      paused,
      pauseReason,
      canPause: true,
      canFallbackToLocal: true,
      stallTipVisible,
    });
  };

  const onBrowserOffline = () => {
    controller.pause('offline');
  };
  const onBrowserOnline = () => {
    if (controller.getPauseReason() === 'offline') {
      controller.resume();
    }
  };

  const unsubscribeController = controller.subscribe((state) => {
    if (state.paused) {
      speedTracker.markPaused();
      emitUploadProgress(uploadedBytes);
    } else if (!state.localFallbackRequested) {
      speedTracker.markResumed();
      emitUploadProgress(
        uploadedBytes,
        'Resuming upload — checking saved progress on server…'
      );
    }
  });

  if (enableOfflineAutoPause && networkTarget) {
    networkTarget.addEventListener('offline', onBrowserOffline);
    networkTarget.addEventListener('online', onBrowserOnline);
  }

  const cleanupListeners = () => {
    unsubscribeController();
    if (enableOfflineAutoPause && networkTarget) {
      networkTarget.removeEventListener('offline', onBrowserOffline);
      networkTarget.removeEventListener('online', onBrowserOnline);
    }
  };

  const fetchOrThrowUnavailable = async (
    url: string,
    init: RequestInit,
    allowFallbackStatus: boolean,
    timeoutMs?: number,
    pauseSignal?: AbortSignal
  ): Promise<Response> => {
    throwIfCancelledOrFallback();
    let res: Response;
    const reqController =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    const onCallerAbort = () => reqController?.abort();
    const onPauseAbort = () => reqController?.abort();
    signal?.addEventListener('abort', onCallerAbort, { once: true });
    pauseSignal?.addEventListener('abort', onPauseAbort, { once: true });
    let timedOut = false;
    const reqTimer =
      reqController && timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            reqController.abort();
          }, timeoutMs)
        : null;
    try {
      res = await fetchImpl(url, {
        ...init,
        signal: reqController?.signal ?? signal,
      });
    } catch (err: unknown) {
      if (signal?.aborted) {
        throw new Error('CANCELLED_BY_USER');
      }
      if (controller.isLocalFallbackRequested()) {
        throw new ServerDecodeUnavailableError(
          'Switching to local on-device decoder as requested.'
        );
      }
      if (pauseSignal?.aborted || controller.isPaused()) {
        throw new UploadPausedInterruption();
      }
      if (!timedOut && err instanceof Error && err.name === 'AbortError') {
        throw new Error('CANCELLED_BY_USER');
      }
      throw new ServerDecodeUnavailableError(
        timedOut
          ? 'Server decoder timed out while starting; falling back to local browser Pyodide.'
          : 'Server decoder unreachable; falling back to local browser Pyodide.'
      );
    } finally {
      if (reqTimer) clearTimeout(reqTimer);
      signal?.removeEventListener('abort', onCallerAbort);
      pauseSignal?.removeEventListener('abort', onPauseAbort);
    }

    if (
      allowFallbackStatus &&
      (isTransientServerStatus(res.status) || res.status === 404)
    ) {
      throw new ServerDecodeUnavailableError(
        `Server decoder unavailable (HTTP ${res.status}).`,
        res.status
      );
    }
    return res;
  };

  let uploadId = '';
  let supportsParallelChunks = false;

  const initUploadSession = async (): Promise<{
    uploadId: string;
    supportsParallelChunks: boolean;
  }> => {
    const initRes = await fetchOrThrowUnavailable(
      '/api/fm27/decode-save/init',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalBytes }),
      },
      true,
      SERVER_INIT_TIMEOUT_MS,
      controller.getAttemptSignal()
    );
    if (!initRes.ok) {
      throw new Error(
        await readErrorMessageFromResponse(
          initRes,
          `Failed to initialize server upload (HTTP ${initRes.status}).`
        )
      );
    }
    const initBody = (await initRes.json()) as {
      uploadId?: string;
      supportsParallelChunks?: boolean;
    };
    if (!initBody?.uploadId) {
      throw new Error('Server did not return an uploadId.');
    }
    return {
      uploadId: initBody.uploadId,
      supportsParallelChunks: initBody.supportsParallelChunks === true,
    };
  };

  try {
    throwIfCancelledOrFallback();

    // 1. Initialize chunked upload session
    emitUploadProgress(
      0,
      `Uploading save to server (0.0 / ${totalMbLabel} MB — 0%)…`
    );

    const initialized = await initUploadSession();
    uploadId = initialized.uploadId;
    supportsParallelChunks = initialized.supportsParallelChunks;

    // Build ordered chunk descriptors
    const chunks: Array<{ offset: number; end: number }> = [];
    for (let off = 0; off < totalBytes; off += chunkSizeBytes) {
      chunks.push({ offset: off, end: Math.min(off + chunkSizeBytes, totalBytes) });
    }
    const chunkByOffset = new Map<number, { offset: number; end: number }>();
    for (const c of chunks) {
      chunkByOffset.set(c.offset, c);
    }
    const completedOffsets = new Set<number>();

    const recomputeCompletedBytes = (): number => {
      let total = 0;
      for (const off of completedOffsets) {
        const desc = chunkByOffset.get(off);
        if (desc) total += desc.end - desc.offset;
      }
      return total;
    };

    const reconcileWithServerStatus = async (): Promise<
      'reconciled' | 'restarted' | 'still_offline'
    > => {
      throwIfCancelledOrFallback();
      const attemptSignal = controller.getAttemptSignal();
      let statusRes: Response;
      try {
        statusRes = await fetchOrThrowUnavailable(
          `/api/fm27/decode-save/upload/${encodeURIComponent(uploadId)}/status`,
          { method: 'GET', cache: 'no-store' },
          false,
          SERVER_INIT_TIMEOUT_MS,
          attemptSignal
        );
      } catch (err: unknown) {
        if (err instanceof UploadPausedInterruption) {
          return 'still_offline';
        }
        if (
          err instanceof ServerDecodeUnavailableError &&
          enableOfflineAutoPause &&
          checkIsOffline()
        ) {
          controller.pause('offline');
          return 'still_offline';
        }
        throw err;
      }

      if (statusRes.status === 404) {
        // Server restarted or 15-minute inactivity hold expired — start a fresh upload session cleanly
        completedOffsets.clear();
        uploadedBytes = 0;
        speedTracker.reset(totalBytes);
        emitUploadProgress(
          0,
          'Server hold expired — restarting upload cleanly from 0%…'
        );
        const fresh = await initUploadSession();
        uploadId = fresh.uploadId;
        supportsParallelChunks = fresh.supportsParallelChunks;
        return 'restarted';
      }

      if (isTransientServerStatus(statusRes.status)) {
        if (enableOfflineAutoPause && checkIsOffline()) {
          controller.pause('offline');
          return 'still_offline';
        }
        throw new ServerDecodeUnavailableError(
          `Server upload status unavailable (HTTP ${statusRes.status}).`,
          statusRes.status
        );
      }

      if (!statusRes.ok) {
        throw new Error(
          await readErrorMessageFromResponse(
            statusRes,
            `Failed to check resumable upload status (HTTP ${statusRes.status}).`
          )
        );
      }

      const statusBody = (await statusRes.json()) as {
        bytesReceived?: number;
        receivedOffsets?: number[];
        receivedRanges?: Array<{ offset?: number; length?: number }>;
      };

      const validRanges = Array.isArray(statusBody.receivedRanges)
        ? statusBody.receivedRanges.filter(
            (r): r is { offset: number; length: number } =>
              Boolean(r) &&
              typeof r.offset === 'number' &&
              Number.isFinite(r.offset) &&
              typeof r.length === 'number' &&
              r.length > 0
          )
        : [];

      if (validRanges.length > 0) {
        for (const c of chunks) {
          const fullyCovered = validRanges.some(
            (r) => r.offset <= c.offset && r.offset + r.length >= c.end
          );
          if (fullyCovered) {
            completedOffsets.add(c.offset);
          }
        }
      } else if (
        Array.isArray(statusBody.receivedOffsets) &&
        statusBody.receivedOffsets.length > 0
      ) {
        for (const offset of statusBody.receivedOffsets) {
          if (chunkByOffset.has(offset)) {
            completedOffsets.add(offset);
          }
        }
      } else if (
        typeof statusBody.bytesReceived === 'number' &&
        statusBody.bytesReceived > 0
      ) {
        for (const c of chunks) {
          if (c.end <= statusBody.bytesReceived) {
            completedOffsets.add(c.offset);
          }
        }
      }

      uploadedBytes = recomputeCompletedBytes();
      emitUploadProgress(uploadedBytes);
      return 'reconciled';
    };

    // One reader at a time: Google Drive / iOS Files cloud providers deadlock when
    // two content:// reads overlap, even though network writes may run in parallel.
    let readQueueTail: Promise<void> = Promise.resolve();
    const readChunkInOrder = <T>(read: () => Promise<T>): Promise<T> => {
      const result = readQueueTail.then(read, read);
      readQueueTail = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    };

    const uploadSingleChunk = async (
      chunk: { offset: number; end: number },
      effectiveSignal?: AbortSignal,
      pauseSignal?: AbortSignal
    ): Promise<void> => {
      throwIfCancelledOrFallback();
      const activeSignal = effectiveSignal ?? signal;
      // Materialize the 2 MB slice into an ArrayBuffer with a timeout before fetch().
      // On mobile (Android Chrome / iOS Safari), passing a raw Google Drive content:// Blob
      // directly to fetch() can hang indefinitely or fail with ERR_UPLOAD_FILE_CHANGED.
      const chunkBuffer = await readChunkInOrder(() =>
        readBlobChunkWithTimeout(
          file.slice(chunk.offset, chunk.end),
          SERVER_CHUNK_READ_TIMEOUT_MS,
          activeSignal,
          pauseSignal,
          stallTipVisible
            ? undefined
            : {
                thresholdMs: stallTipThresholdMs,
                onStall: () => {
                  stallTipVisible = true;
                  emitUploadProgress(
                    uploadedBytes,
                    `Still reading ${fileName} from device storage (${formatBytesMb(uploadedBytes)} / ${totalMbLabel} MB)…`
                  );
                },
              }
        )
      );
      const chunkByteLength = chunkBuffer.byteLength;
      // Allocate the Blob wrapper once per chunk so retries don't churn mobile GC
      const chunkBlob = new Blob([chunkBuffer], { type: 'application/octet-stream' });
      let chunkUploaded = false;

      for (let attempt = 0; attempt <= SERVER_CHUNK_MAX_RETRIES; attempt++) {
        throwIfCancelledOrFallback();
        if (pauseSignal?.aborted || controller.isPaused()) {
          throw new UploadPausedInterruption();
        }

        let chunkRes: Response | null = null;
        let networkError = false;
        const attemptController =
          typeof AbortController !== 'undefined' ? new AbortController() : null;
        const onAttemptAbort = () => attemptController?.abort();
        const onPauseAbort = () => attemptController?.abort();
        activeSignal?.addEventListener('abort', onAttemptAbort, { once: true });
        pauseSignal?.addEventListener('abort', onPauseAbort, { once: true });
        let timedOut = false;
        const chunkTimer = attemptController
          ? setTimeout(() => {
              timedOut = true;
              attemptController.abort();
            }, SERVER_CHUNK_UPLOAD_TIMEOUT_MS)
          : null;
        try {
          chunkRes = await fetchImpl('/api/fm27/decode-save/chunk', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'x-fm-upload-id': uploadId,
              'x-fm-chunk-offset': String(chunk.offset),
              'x-fm-chunk-length': String(chunkByteLength),
            },
            body: chunkBlob,
            signal: attemptController?.signal ?? activeSignal,
          });
        } catch (err: unknown) {
          if (signal?.aborted) {
            throw new Error('CANCELLED_BY_USER');
          }
          if (controller.isLocalFallbackRequested()) {
            throw new ServerDecodeUnavailableError(
              'Switching to local on-device decoder as requested.'
            );
          }
          if (pauseSignal?.aborted || controller.isPaused()) {
            throw new UploadPausedInterruption();
          }
          if (
            !timedOut &&
            (activeSignal?.aborted || (err instanceof Error && err.name === 'AbortError'))
          ) {
            throw new Error('CANCELLED_BY_USER');
          }
          networkError = true;
        } finally {
          if (chunkTimer) clearTimeout(chunkTimer);
          activeSignal?.removeEventListener('abort', onAttemptAbort);
          pauseSignal?.removeEventListener('abort', onPauseAbort);
        }

        if (chunkRes && chunkRes.ok) {
          chunkUploaded = true;
          break;
        }

        const status = chunkRes?.status ?? 0;

        // If browser went offline mid-chunk, auto-pause cleanly instead of burning retries
        if (networkError && enableOfflineAutoPause && checkIsOffline()) {
          controller.pause('offline');
          throw new UploadPausedInterruption();
        }

        // 404 means server restarted and lost the in-memory upload session -> fall back cleanly
        if (status === 404) {
          throw new ServerDecodeUnavailableError(
            'Server restarted during upload; switching to local browser decoder.',
            404
          );
        }

        const canRetry = networkError || isTransientServerStatus(status);
        if (canRetry && attempt < SERVER_CHUNK_MAX_RETRIES) {
          const nextAttempt = attempt + 2;
          const maxAttempts = SERVER_CHUNK_MAX_RETRIES + 1;
          emitUploadProgress(
            uploadedBytes,
            `Connection blip${status ? ` (HTTP ${status})` : ''} — retrying chunk (attempt ${nextAttempt}/${maxAttempts})…`
          );
          await sleepWithAbort(
            retryBaseDelayMs * Math.pow(2, attempt),
            effectiveSignal ?? signal,
            pauseSignal
          );
          continue;
        }

        if (canRetry) {
          if (enableOfflineAutoPause && checkIsOffline()) {
            controller.pause('offline');
            throw new UploadPausedInterruption();
          }
          throw new ServerDecodeUnavailableError(
            status
              ? `Server upload interrupted (HTTP ${status}); switching to local browser decoder.`
              : 'Server upload unreachable; switching to local browser decoder.',
            status || undefined
          );
        }

        throw new Error(
          chunkRes
            ? await readErrorMessageFromResponse(
                chunkRes,
                `Chunk upload failed (HTTP ${chunkRes.status}).`
              )
            : 'Chunk upload failed.'
        );
      }

      if (!chunkUploaded) {
        throw new ServerDecodeUnavailableError(
          'Server chunk upload did not complete; switching to local browser decoder.'
        );
      }
    };

    // 2. Upload chunks — 4-way parallel when the server advertises supportsParallelChunks.
    // Reads are serialized inside uploadSingleChunk so cloud files stay safe.
    const defaultConcurrency = isMobileBrowser()
      ? SERVER_MOBILE_UPLOAD_CONCURRENCY
      : SERVER_UPLOAD_CONCURRENCY;
    const requestedConcurrency = Math.max(
      1,
      Math.min(8, options.uploadConcurrency ?? defaultConcurrency)
    );

    try {
      while (completedOffsets.size < chunks.length) {
        throwIfCancelledOrFallback();

        if (controller.isPaused()) {
          const resumeOutcome = await controller.waitUntilResumed(signal);
          if (resumeOutcome === 'fallback') {
            throw new ServerDecodeUnavailableError(
              'Switching to local on-device decoder as requested.'
            );
          }
          const rec = await reconcileWithServerStatus();
          if (rec === 'still_offline') {
            continue;
          }
          if (completedOffsets.size >= chunks.length) {
            break;
          }
        }

        const remainingChunks = chunks.filter((c) => !completedOffsets.has(c.offset));
        if (remainingChunks.length === 0) break;

        const pauseSignal = controller.getAttemptSignal();
        const useParallelUpload =
          supportsParallelChunks &&
          remainingChunks.length > 1 &&
          requestedConcurrency > 1;

        try {
          if (useParallelUpload) {
            const poolController =
              typeof AbortController !== 'undefined' ? new AbortController() : null;
            const onCallerAbort = () => poolController?.abort();
            signal?.addEventListener('abort', onCallerAbort, { once: true });

            let nextIndex = 0;
            let firstError: unknown = null;
            let sawPause = false;

            const worker = async () => {
              while (true) {
                if (
                  firstError ||
                  sawPause ||
                  signal?.aborted ||
                  poolController?.signal.aborted ||
                  controller.isPaused() ||
                  controller.isLocalFallbackRequested()
                ) {
                  return;
                }
                const idx = nextIndex++;
                if (idx >= remainingChunks.length) return;
                const chunk = remainingChunks[idx];
                try {
                  await uploadSingleChunk(
                    chunk,
                    poolController?.signal ?? signal,
                    pauseSignal
                  );
                  completedOffsets.add(chunk.offset);
                  emitUploadProgress(recomputeCompletedBytes(), undefined, true);
                } catch (err) {
                  if (err instanceof UploadPausedInterruption) {
                    sawPause = true;
                    return;
                  }
                  if (!firstError) {
                    firstError = err;
                    poolController?.abort();
                  }
                  return;
                }
              }
            };

            try {
              const workerCount = Math.min(requestedConcurrency, remainingChunks.length);
              await Promise.all(Array.from({ length: workerCount }, () => worker()));
            } finally {
              signal?.removeEventListener('abort', onCallerAbort);
            }

            if (signal?.aborted) {
              throw new Error('CANCELLED_BY_USER');
            }
            if (controller.isLocalFallbackRequested()) {
              throw new ServerDecodeUnavailableError(
                'Switching to local on-device decoder as requested.'
              );
            }
            if (sawPause || controller.isPaused()) {
              continue;
            }
            if (firstError) {
              throw firstError;
            }
          } else {
            for (const chunk of remainingChunks) {
              if (controller.isPaused()) {
                throw new UploadPausedInterruption();
              }
              await uploadSingleChunk(chunk, signal, pauseSignal);
              completedOffsets.add(chunk.offset);
              emitUploadProgress(recomputeCompletedBytes(), undefined, true);
            }
          }
        } catch (waveErr: unknown) {
          if (waveErr instanceof UploadPausedInterruption) {
            continue;
          }
          throw waveErr;
        }
      }
    } catch (uploadErr) {
      if (uploadId) {
        void Promise.resolve(
          fetchImpl(`/api/fm27/decode-save/upload/${encodeURIComponent(uploadId)}`, {
            method: 'DELETE',
          })
        ).catch(() => {
          // non-blocking cleanup
        });
      }
      throw uploadErr;
    }

    // 3. Finalize upload & start async Python decode job
    throwIfCancelledOrFallback();
    const syncModeLabel = options.fastSync ? 'Fast Sync' : 'Full Sync';
    onProgress?.({
      stage: 'parse',
      step: `Server ${syncModeLabel}`,
      elapsedSec: elapsedSec(),
      label: `Starting native server ${syncModeLabel} decode…`,
      transport: 'server_decode',
      canPause: false,
      canFallbackToLocal: true,
    });

    const finishRes = await fetchOrThrowUnavailable(
      '/api/fm27/decode-save/finish',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uploadId,
          filename: fileName,
          scope: scopeValue,
          fastSync: Boolean(options.fastSync),
          clubHint: options.clubHint || '',
        }),
      },
      true,
      SERVER_INIT_TIMEOUT_MS,
      controller.getAttemptSignal()
    );

    if (!finishRes.ok) {
      throw new Error(
        await readErrorMessageFromResponse(
          finishRes,
          `Failed to start server decode job (HTTP ${finishRes.status}).`
        )
      );
    }

    const finishBody = (await finishRes.json()) as { jobId?: string };
    const jobId = finishBody?.jobId;
    if (!jobId) {
      throw new Error('Server did not return a decode jobId.');
    }

    // 4. Poll async decode job every 1.2 seconds until done or error
    let lastProgress = 'Opening .fm save…';
    let consecutivePollErrors = 0;
    let emittedCheckpointStage: string | null = null;
    while (true) {
      throwIfCancelledOrFallback();

      let jobRes: Response;
      try {
        jobRes = await fetchImpl(
          `/api/fm27/decode-save/job/${encodeURIComponent(jobId)}`,
          {
            method: 'GET',
            cache: 'no-store',
            signal: signal,
          }
        );
      } catch (err: unknown) {
        if (signal?.aborted) {
          throw new Error('CANCELLED_BY_USER');
        }
        if (controller.isLocalFallbackRequested()) {
          throw new ServerDecodeUnavailableError(
            'Switching to local on-device decoder as requested.'
          );
        }
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error('CANCELLED_BY_USER');
        }
        consecutivePollErrors += 1;
        if (consecutivePollErrors >= SERVER_POLL_MAX_RETRIES) {
          throw new ServerDecodeUnavailableError(
            'Lost connection while checking server decode progress; switching to local browser decoder.'
          );
        }
        onProgress?.({
          stage: 'parse',
          step: `Server ${syncModeLabel}`,
          elapsedSec: elapsedSec(),
          label: `Server busy — reconnecting to decode status (${consecutivePollErrors}/${SERVER_POLL_MAX_RETRIES})…`,
          transport: 'server_decode',
          canPause: false,
          canFallbackToLocal: true,
        });
        try {
          await sleepWithAbort(
            Math.min(3_000, Math.max(pollIntervalMs, retryBaseDelayMs * consecutivePollErrors)),
            signal,
            controller.getAttemptSignal()
          );
        } catch (sleepErr) {
          if (sleepErr instanceof UploadPausedInterruption) {
            throwIfCancelledOrFallback();
          } else {
            throw sleepErr;
          }
        }
        continue;
      }

      if (isTransientServerStatus(jobRes.status)) {
        consecutivePollErrors += 1;
        if (consecutivePollErrors >= SERVER_POLL_MAX_RETRIES) {
          throw new ServerDecodeUnavailableError(
            `Server decoder unavailable (HTTP ${jobRes.status}); switching to local browser decoder.`,
            jobRes.status
          );
        }
        onProgress?.({
          stage: 'parse',
          step: `Server ${syncModeLabel}`,
          elapsedSec: elapsedSec(),
          label: `Server busy (HTTP ${jobRes.status}) — reconnecting to decode status (${consecutivePollErrors}/${SERVER_POLL_MAX_RETRIES})…`,
          transport: 'server_decode',
          canPause: false,
          canFallbackToLocal: true,
        });
        try {
          await sleepWithAbort(
            Math.min(3_000, Math.max(pollIntervalMs, retryBaseDelayMs * consecutivePollErrors)),
            signal,
            controller.getAttemptSignal()
          );
        } catch (sleepErr) {
          if (sleepErr instanceof UploadPausedInterruption) {
            throwIfCancelledOrFallback();
          } else {
            throw sleepErr;
          }
        }
        continue;
      }

      // 404 on an active job means the Render container restarted mid-decode and cleared in-memory jobs -> fall back cleanly
      if (jobRes.status === 404) {
        throw new ServerDecodeUnavailableError(
          'Server restarted during decode; switching to local browser decoder.',
          404
        );
      }

      // 507 = the server memory limit OOM-killed the Python child. Fall back to
      // Pyodide / Fast Sync immediately instead of retrying for minutes.
      if (jobRes.status === 507) {
        throw new ServerDecodeUnavailableError(
          await readErrorMessageFromResponse(
            jobRes,
            'Server ran out of memory while decoding this .fm save; switching to local browser decoder.'
          ),
          507
        );
      }

      consecutivePollErrors = 0;

      if (!jobRes.ok) {
        throw new Error(
          await readErrorMessageFromResponse(
            jobRes,
            `Failed to check server decode status (HTTP ${jobRes.status}).`
          )
        );
      }

      if (options.benchmarkId) {
        markSaveLoadStage(options.benchmarkId, 'transfer_start', { overwrite: true });
      }
      const jobData = (await jobRes.json()) as {
        status?: 'running' | 'done' | 'error';
        progress?: string;
        payload?: DecodedFmSavePayload;
        checkpointStage?: string;
        checkpointPayload?: DecodedFmSavePayload;
        serverStageTimingsMs?: Record<string, number>;
        error?: string;
      };
      if (options.benchmarkId) {
        markSaveLoadStage(options.benchmarkId, 'transfer_complete', { overwrite: true });
      }

      if (options.benchmarkId && jobData.serverStageTimingsMs) {
        recordSaveLoadDetails(options.benchmarkId, jobData.serverStageTimingsMs);
      }

      if (jobData.progress && jobData.progress.trim()) {
        lastProgress = jobData.progress.trim();
      }

      if (
        jobData.status === 'running' &&
        jobData.checkpointPayload &&
        isValidSquadCheckpoint(jobData.checkpointPayload)
      ) {
        const cpStage = jobData.checkpointStage || 'stage_2_club_core';
        if (emittedCheckpointStage !== cpStage) {
          emittedCheckpointStage = cpStage;
          try {
            options.onCheckpoint?.({
              stage: cpStage,
              payload: jobData.checkpointPayload,
            });
          } catch {
            // Never let a UI checkpoint listener abort the background decode
          }
        }
      }

      if (jobData.status === 'done' && jobData.payload) {
        onProgress?.({
          stage: 'parse',
          step: `Server ${syncModeLabel}`,
          progressPct: 100,
          elapsedSec: elapsedSec(),
          label: `Server ${syncModeLabel} complete — hydrating Command Hub…`,
          transport: 'server_decode',
          canPause: false,
          canFallbackToLocal: false,
        });
        return jobData.payload;
      }

      if (jobData.status === 'error') {
        throw new Error(jobData.error || 'Server .fm decode failed.');
      }

      onProgress?.({
        stage: 'parse',
        step: `Server ${syncModeLabel}`,
        elapsedSec: elapsedSec(),
        label: `Server ${syncModeLabel}: ${lastProgress}`,
        transport: 'server_decode',
        canPause: false,
        canFallbackToLocal: true,
      });

      try {
        await sleepWithAbort(
          pollIntervalMs,
          signal,
          controller.getAttemptSignal()
        );
      } catch (sleepErr) {
        if (sleepErr instanceof UploadPausedInterruption) {
          throwIfCancelledOrFallback();
        } else {
          throw sleepErr;
        }
      }
    }
  } finally {
    cleanupListeners();
  }
}

/**
 * Terminates an active .fm save decode (server upload or browser worker) immediately.
 */
export function cancelFmSaveDecode(reason: string = 'CANCELLED_BY_USER'): void {
  isJobActive = false;
  if (activeCancelFn) {
    const fn = activeCancelFn;
    activeCancelFn = null;
    fn();
  } else if (sharedWorker) {
    sharedWorker.terminate();
    sharedWorker = null;
  }
  if (reason !== 'CANCELLED_BY_USER') {
    console.warn(`[fmSaveReader] Active decode terminated: ${reason}`);
  }
}

/**
 * Decodes a .fm save locally inside the browser Web Worker (Pyodide + fmsave) with
 * 90s inactivity watchdog, 300s hard ceiling, and Progressive Checkpoint Recovery.
 */
export function decodeFmSaveInBrowserWorker(
  file: File,
  onProgress?: (progress: FmSaveProgressStage) => void,
  options: {
    clubHint?: string;
    scope?: FmImportScope;
    fastSync?: boolean;
    onCheckpoint?: (checkpoint: {
      stage: string;
      payload: DecodedFmSavePayload;
    }) => void;
    benchmarkId?: string;
  } = {}
): Promise<DecodedFmSavePayload> {
  const clubHint = options.clubHint || '';
  const scope: FmImportScope = options.scope || 'managed_club_only';
  const fastSync = Boolean(options.fastSync);

  return new Promise((resolve, reject) => {
    const worker = getFmSaveWorker();
    const requestId = ++requestCounter;
    const startedAtMs = Date.now();
    let lastStageLabel = 'Initializing local .fm reader';
    let latestCheckpoint: { stage: string; payload: DecodedFmSavePayload } | null = null;
    let settled = false;
    isJobActive = true;

    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let hardCeilingTimer: ReturnType<typeof setTimeout> | null = null;
    let hiddenAtMs: number | null = null;
    let ceilingDeadlineMs = 0;

    const cleanup = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
      if (hardCeilingTimer) {
        clearTimeout(hardCeilingTimer);
        hardCeilingTimer = null;
      }
      isJobActive = false;
      activeCancelFn = null;
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.removeEventListener('messageerror', handleMessageError);
    };

    const recoverOrReject = (
      reason: 'inactivity' | 'ceiling' | 'error',
      errorMessage: string,
      limitMs?: number
    ) => {
      if (settled) return;
      settled = true;
      const elapsedMs = Date.now() - startedAtMs;
      const elapsedSec = elapsedMs / 1000;
      cleanup();
      sharedWorker?.terminate();
      sharedWorker = null;

      if (latestCheckpoint && isValidSquadCheckpoint(latestCheckpoint.payload)) {
        const warning = buildCheckpointRecoveryWarning(
          reason,
          lastStageLabel,
          elapsedSec,
          latestCheckpoint.stage,
          limitMs !== undefined ? Math.round(limitMs / 1000) : undefined
        );
        resolve(
          applyCheckpointRecoveryWarning(
            latestCheckpoint.payload,
            warning,
            elapsedMs
          )
        );
        return;
      }

      reject(new Error(errorMessage));
    };

    const failWithTimeout = (kind: 'inactivity' | 'ceiling', limitMs: number) => {
      const elapsedSec = (Date.now() - startedAtMs) / 1000;
      recoverOrReject(
        kind,
        formatWorkerTimeoutMessage(
          kind,
          lastStageLabel,
          elapsedSec,
          Math.round(limitMs / 1000)
        ),
        limitMs
      );
    };

    const scheduleInactivity = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(
        () => failWithTimeout('inactivity', WORKER_INACTIVITY_TIMEOUT_MS),
        WORKER_INACTIVITY_TIMEOUT_MS
      );
    };

    const scheduleCeiling = () => {
      if (hardCeilingTimer) clearTimeout(hardCeilingTimer);
      const remainingMs = Math.max(0, ceilingDeadlineMs - Date.now());
      hardCeilingTimer = setTimeout(
        () => failWithTimeout('ceiling', WORKER_HARD_CEILING_MS),
        remainingMs
      );
    };

    const resetInactivityWatchdog = () => {
      // Background tabs are throttled, so hidden time must not count as a stall.
      if (hiddenAtMs !== null) {
        if (inactivityTimer) {
          clearTimeout(inactivityTimer);
          inactivityTimer = null;
        }
        return;
      }
      scheduleInactivity();
    };

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || settled) return;
      if (document.visibilityState === 'hidden') {
        if (hiddenAtMs === null) {
          hiddenAtMs = Date.now();
          if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
          }
          if (hardCeilingTimer) {
            clearTimeout(hardCeilingTimer);
            hardCeilingTimer = null;
          }
        }
        return;
      }
      if (document.visibilityState !== 'visible' || hiddenAtMs === null) return;
      const hiddenMs = Math.max(0, Date.now() - hiddenAtMs);
      hiddenAtMs = null;
      // Extend the hard ceiling by exactly the time spent suspended.
      ceilingDeadlineMs += hiddenMs;
      if (!isJobActive) return;
      scheduleCeiling();
      scheduleInactivity();
    };

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      if (document.visibilityState === 'hidden') {
        hiddenAtMs = Date.now();
      }
    }

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || msg.requestId !== requestId) return;

      if (msg.type === 'stage') {
        lastStageLabel = msg.label || lastStageLabel;
        resetInactivityWatchdog();
        if (onProgress) {
          onProgress({
            stage: msg.stage,
            step: msg.step,
            phase: typeof msg.phase === 'string' ? msg.phase : undefined,
            progressPct:
              typeof msg.progressPct === 'number' ? msg.progressPct : undefined,
            label: msg.label,
            elapsedSec:
              typeof msg.elapsedSec === 'number'
                ? msg.elapsedSec
                : Number(((Date.now() - startedAtMs) / 1000).toFixed(1)),
            transport: 'browser_worker',
            canPause: false,
            canFallbackToLocal: false,
          });
        }
      } else if (msg.type === 'checkpoint') {
        resetInactivityWatchdog();
        const cpPayload = msg.payload || msg.data;
        if (isValidSquadCheckpoint(cpPayload)) {
          latestCheckpoint = {
            stage: String(msg.stage || 'stage_1_squad'),
            payload: cpPayload as DecodedFmSavePayload,
          };
          try {
            options.onCheckpoint?.(latestCheckpoint);
          } catch {
            // Never let a UI checkpoint listener abort the worker decode
          }
        }
      } else if (msg.type === 'result' && (msg.data || msg.payload)) {
        if (settled) return;
        settled = true;
        cleanup();
        if (options.benchmarkId) {
          markSaveLoadStage(options.benchmarkId, 'transfer_start', { overwrite: true });
          markSaveLoadStage(options.benchmarkId, 'transfer_complete', { overwrite: true });
        }
        resolve((msg.data || msg.payload) as DecodedFmSavePayload);
      } else if (msg.type === 'error') {
        recoverOrReject(
          'error',
          msg.message || 'Failed to decode .fm save file.'
        );
      }
    };

    const handleError = (err: ErrorEvent) => {
      recoverOrReject(
        'error',
        err.message ||
          'The local .fm reader worker stopped unexpectedly (often due to browser memory limits on mobile). Try enabling "Fast Sync (Club Core — Recommended on Mobile)" or retry on desktop.'
      );
    };

    const handleMessageError = () => {
      recoverOrReject(
        'error',
        'Could not transfer decoded data from the local .fm reader worker. Please try again.'
      );
    };

    activeCancelFn = () => {
      if (settled) return;
      settled = true;
      cleanup();
      sharedWorker?.terminate();
      sharedWorker = null;
      reject(new Error('CANCELLED_BY_USER'));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.addEventListener('messageerror', handleMessageError);
    ceilingDeadlineMs = Date.now() + WORKER_HARD_CEILING_MS;
    if (hiddenAtMs === null) {
      resetInactivityWatchdog();
      scheduleCeiling();
    }

    worker.postMessage({
      type: 'parse_fm',
      file,
      requestId,
      clubHint,
      scope,
      fastSync,
    });
  });
}

/**
 * Injectable server-first orchestrator (unit-testable):
 * 1) Checks GET /api/fm27/decode-status.
 * 2) When serverDecodeAvailable is true, sends raw .fm file to POST /api/fm27/decode-save
 *    with Full Sync (fastSync=false by default).
 * 3) Automatically falls back to the local browser Pyodide worker ONLY if the server
 *    returns 503/unreachable or reports serverDecodeAvailable: false.
 */
export async function decodeFmSaveWithServerFirst(
  file: File | Blob,
  onProgress?: (progress: FmSaveProgressStage) => void,
  options: DecodeFmSaveOptions & {
    fileName?: string;
    viewportWidth?: number;
    chunkSizeBytes?: number;
    pollIntervalMs?: number;
    retryBaseDelayMs?: number;
    uploadConcurrency?: number;
    isOffline?: () => boolean;
    networkEvents?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  } = {},
  deps: {
    fetchImpl?: typeof fetch;
    browserFallback?: (
      file: File | Blob,
      onProgress: ((progress: FmSaveProgressStage) => void) | undefined,
      opts: {
        clubHint?: string;
        scope?: FmImportScope;
        fastSync?: boolean;
        onCheckpoint?: (checkpoint: {
          stage: string;
          payload: DecodedFmSavePayload;
        }) => void;
        benchmarkId?: string;
      }
    ) => Promise<DecodedFmSavePayload>;
    signal?: AbortSignal;
  } = {}
): Promise<DecodedFmSavePayload> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const browserFallback =
    deps.browserFallback ??
    ((f, cb, opts) => decodeFmSaveInBrowserWorker(f as File, cb, opts));

  const clubHint = options.clubHint || '';
  const scope: FmImportScope = options.scope || 'managed_club_only';
  const serverFastSync = options.fastSync === true; // Full Sync (false) by default on server!
  const deviceMemoryGb =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined;
  const fallbackFastSync =
    resolveFallbackFastSync({
      requestedFastSync: options.fastSync,
      fileSizeBytes: file.size || 0,
      deviceMemoryGb,
    }) ||
    (options.fastSync === undefined &&
      (typeof options.viewportWidth === 'number'
        ? shouldDefaultFastSync(options.viewportWidth)
        : typeof window !== 'undefined'
          ? shouldDefaultFastSync(window.innerWidth)
          : false));
  const fallbackSyncLabel = fallbackFastSync ? 'Fast Sync' : 'Full Sync';
  const fallbackUpgradedToFastSync =
    options.fastSync === false && fallbackFastSync;

  if (
    !options.forceBrowserWorker &&
    !options.uploadControl?.isLocalFallbackRequested()
  ) {
    const status = await checkServerDecodeStatus(fetchImpl, deps.signal);
    if (deps.signal?.aborted) {
      throw new Error('CANCELLED_BY_USER');
    }
    if (
      status.serverDecodeAvailable &&
      !options.uploadControl?.isLocalFallbackRequested()
    ) {
      try {
        return await decodeFmSaveViaServer(
          file,
          {
            fileName: options.fileName,
            clubHint,
            scope,
            fastSync: serverFastSync,
            chunkSizeBytes: options.chunkSizeBytes,
            pollIntervalMs: options.pollIntervalMs,
            retryBaseDelayMs: options.retryBaseDelayMs,
            uploadConcurrency: options.uploadConcurrency,
            uploadControl: options.uploadControl,
            enableOfflineAutoPause: options.enableOfflineAutoPause,
            stallTipThresholdMs: options.stallTipThresholdMs,
            isOffline: options.isOffline,
            networkEvents: options.networkEvents,
            onCheckpoint: options.onCheckpoint,
            benchmarkId: options.benchmarkId,
          },
          onProgress,
          fetchImpl,
          deps.signal
        );
      } catch (err: unknown) {
        if (!(err instanceof ServerDecodeUnavailableError)) {
          throw err;
        }
        if (deps.signal?.aborted) {
          throw new Error('CANCELLED_BY_USER');
        }
        const manualFallback = Boolean(
          options.uploadControl?.isLocalFallbackRequested()
        );
        onProgress?.({
          stage: 'boot',
          step: manualFallback ? 'On-Device Decode' : 'Browser Fallback',
          transport: 'browser_worker',
          canPause: false,
          canFallbackToLocal: false,
          label: manualFallback
            ? `Switched to on-device decoder (${fallbackSyncLabel}) — starting local browser reader…`
            : fallbackUpgradedToFastSync
              ? 'Server decoder unavailable — switching to on-device Fast Sync to protect phone memory…'
              : `Server decoder unavailable or restarted — switching automatically to local browser decoder (${fallbackSyncLabel})…`,
        });
      }
    }
  }

  if (deps.signal?.aborted) {
    throw new Error('CANCELLED_BY_USER');
  }

  return browserFallback(file, onProgress, {
    clubHint,
    scope,
    fastSync: fallbackFastSync,
    onCheckpoint: options.onCheckpoint,
    benchmarkId: options.benchmarkId,
  });
}

/**
 * Decodes a real Football Manager (.fm) save file:
 * - Server-first: probes /api/fm27/decode-status and uses native Python Full Sync on server.ts when available.
 * - Automatic fallback: falls back seamlessly to the browser Pyodide Web Worker if server returns 503 or is unreachable.
 */
export function decodeFmSaveFile(
  file: File,
  onProgress?: (progress: FmSaveProgressStage) => void,
  clubHintOrOptions: string | DecodeFmSaveOptions = ''
): Promise<DecodedFmSavePayload> {
  // Concurrency guard: cancel and tear down any in-flight decode before starting a new one
  if (isJobActive || activeCancelFn) {
    cancelFmSaveDecode('Superseded by new .fm save drop');
  }

  const parsedOptions: DecodeFmSaveOptions =
    typeof clubHintOrOptions === 'string'
      ? { clubHint: clubHintOrOptions, scope: 'managed_club_only' }
      : clubHintOrOptions || {};

  const abortController =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const cancelThisJob = () => {
    abortController?.abort();
    if (activeCancelFn === cancelThisJob) {
      isJobActive = false;
      activeCancelFn = null;
    }
  };
  isJobActive = true;
  activeCancelFn = cancelThisJob;

  return decodeFmSaveWithServerFirst(file, onProgress, parsedOptions, {
    signal: abortController?.signal,
  }).finally(() => {
    if (activeCancelFn === cancelThisJob) {
      isJobActive = false;
      activeCancelFn = null;
    }
  });
}
