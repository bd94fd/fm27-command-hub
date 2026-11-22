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

export type { FmImportScope };

export interface FmSaveProgressStage {
  stage: 'boot' | 'install' | 'read' | 'parse';
  step?: string;
  phase?: string;
  progressPct?: number;
  label: string;
  elapsedSec?: number;
}

export interface DecodeFmSaveOptions {
  clubHint?: string;
  scope?: FmImportScope;
  fastSync?: boolean;
  /** Internal/testing override: skip server probe and go straight to browser Pyodide */
  forceBrowserWorker?: boolean;
  /** Optional progressive hydration callback fired as soon as Stage 2 club core is ready */
  onCheckpoint?: (checkpoint: {
    stage: string;
    payload: DecodedFmSavePayload;
  }) => void;
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
export const SERVER_MOBILE_UPLOAD_CONCURRENCY = 1; // Sequential 2 MB reads on mobile so Google Drive / iOS Files cloud providers never deadlock
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

async function readBlobChunkWithTimeout(
  blob: Blob,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  if (signal?.aborted) {
    throw new Error('CANCELLED_BY_USER');
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('CANCELLED_BY_USER'));
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
    signal?.addEventListener('abort', onAbort, { once: true });

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

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('CANCELLED_BY_USER'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('CANCELLED_BY_USER'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
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
 * sequential fallback otherwise) via:
 *   POST /api/fm27/decode-save/init
 *   POST /api/fm27/decode-save/chunk (2 MB slices)
 *   POST /api/fm27/decode-save/finish -> { jobId }
 *   GET  /api/fm27/decode-save/job/:jobId (polled every 1.2s until done/error; emits progressive checkpoint)
 * Throws ServerDecodeUnavailableError on 503/502/504/404 or network failure during init so callers fall back cleanly.
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
    onCheckpoint?: (checkpoint: {
      stage: string;
      payload: DecodedFmSavePayload;
    }) => void;
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
  const startedAtMs = Date.now();
  const totalBytes = file.size || 0;
  const totalMbLabel = (totalBytes / (1024 * 1024)).toFixed(1);

  if (totalBytes > SERVER_MAX_SAVE_BYTES) {
    throw new Error(
      `This .fm save (${totalMbLabel} MB) exceeds the 1024 MB (1 GB) server upload limit.`
    );
  }

  const elapsedSec = () =>
    Number(((Date.now() - startedAtMs) / 1000).toFixed(1));

  const fetchOrThrowUnavailable = async (
    url: string,
    init: RequestInit,
    allowFallbackStatus: boolean
  ): Promise<Response> => {
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, signal });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('CANCELLED_BY_USER');
      }
      throw new ServerDecodeUnavailableError(
        'Server decoder unreachable; falling back to local browser Pyodide.'
      );
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

  // 1. Initialize chunked upload session
  onProgress?.({
    stage: 'read',
    step: 'Server Upload',
    elapsedSec: 0,
    label: `Uploading save to server (0.0 / ${totalMbLabel} MB — 0%)...`,
  });

  const initRes = await fetchOrThrowUnavailable(
    '/api/fm27/decode-save/init',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalBytes }),
    },
    true
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
  const uploadId = initBody?.uploadId;
  if (!uploadId) {
    throw new Error('Server did not return an uploadId.');
  }

  // Build ordered chunk descriptors
  const chunks: Array<{ offset: number; end: number }> = [];
  for (let off = 0; off < totalBytes; off += chunkSizeBytes) {
    chunks.push({ offset: off, end: Math.min(off + chunkSizeBytes, totalBytes) });
  }

  const uploadSingleChunk = async (
    chunk: { offset: number; end: number },
    effectiveSignal?: AbortSignal
  ): Promise<void> => {
    const activeSignal = effectiveSignal ?? signal;
    const slice = file.slice(chunk.offset, chunk.end);
    // Materialize the 2 MB slice into an ArrayBuffer with a timeout before fetch().
    // On mobile (Android Chrome / iOS Safari), passing a raw Google Drive content:// Blob
    // directly to fetch() can hang indefinitely or fail with ERR_UPLOAD_FILE_CHANGED.
    const chunkBuffer = await readBlobChunkWithTimeout(
      slice,
      SERVER_CHUNK_READ_TIMEOUT_MS,
      activeSignal
    );
    let chunkUploaded = false;

    for (let attempt = 0; attempt <= SERVER_CHUNK_MAX_RETRIES; attempt++) {
      if (effectiveSignal?.aborted || signal?.aborted) {
        throw new Error('CANCELLED_BY_USER');
      }

      let chunkRes: Response | null = null;
      let networkError = false;
      const attemptController =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      const onAttemptAbort = () => attemptController?.abort();
      activeSignal?.addEventListener('abort', onAttemptAbort, { once: true });
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
          },
          body: new Blob([chunkBuffer], { type: 'application/octet-stream' }),
          signal: attemptController?.signal ?? activeSignal,
        });
      } catch (err: unknown) {
        if (!timedOut && (activeSignal?.aborted || (err instanceof Error && err.name === 'AbortError'))) {
          throw new Error('CANCELLED_BY_USER');
        }
        networkError = true;
      } finally {
        if (chunkTimer) clearTimeout(chunkTimer);
        activeSignal?.removeEventListener('abort', onAttemptAbort);
      }

      if (chunkRes && chunkRes.ok) {
        chunkUploaded = true;
        break;
      }

      const status = chunkRes?.status ?? 0;

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
        onProgress?.({
          stage: 'read',
          step: 'Server Upload',
          elapsedSec: elapsedSec(),
          label: `Connection blip${status ? ` (HTTP ${status})` : ''} — retrying chunk (attempt ${nextAttempt}/${maxAttempts})...`,
        });
        await sleepWithAbort(
          retryBaseDelayMs * Math.pow(2, attempt),
          effectiveSignal ?? signal
        );
        continue;
      }

      if (canRetry) {
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

  // 2. Upload chunks — 4-way parallel on desktop when server advertises supportsParallelChunks,
  // sequential (1-way) on mobile so Google Drive / iOS Files cloud providers never deadlock
  const defaultConcurrency = isMobileBrowser()
    ? SERVER_MOBILE_UPLOAD_CONCURRENCY
    : SERVER_UPLOAD_CONCURRENCY;
  const requestedConcurrency = Math.max(
    1,
    Math.min(
      8,
      options.uploadConcurrency ?? defaultConcurrency
    )
  );
  const useParallelUpload =
    initBody.supportsParallelChunks === true &&
    chunks.length > 1 &&
    requestedConcurrency > 1;

  let uploadedBytes = 0;
  const emitUploadProgress = (bytesNow: number) => {
    const uploadedMbLabel = (bytesNow / (1024 * 1024)).toFixed(1);
    const pct =
      totalBytes > 0
        ? Math.min(100, Math.round((bytesNow / totalBytes) * 100))
        : 100;
    onProgress?.({
      stage: 'read',
      step: 'Server Upload',
      elapsedSec: elapsedSec(),
      label: `Uploading save to server (${uploadedMbLabel} / ${totalMbLabel} MB — ${pct}%)...`,
    });
  };

  try {
    if (useParallelUpload) {
      const poolController =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      const onCallerAbort = () => poolController?.abort();
      signal?.addEventListener('abort', onCallerAbort, { once: true });

      let nextIndex = 0;
      let firstError: unknown = null;

      const worker = async () => {
        while (true) {
          if (firstError || signal?.aborted || poolController?.signal.aborted) {
            return;
          }
          const idx = nextIndex++;
          if (idx >= chunks.length) return;
          const chunk = chunks[idx];
          try {
            await uploadSingleChunk(chunk, poolController?.signal ?? signal);
            uploadedBytes += chunk.end - chunk.offset;
            emitUploadProgress(uploadedBytes);
          } catch (err) {
            if (!firstError) {
              firstError = err;
              poolController?.abort();
            }
            return;
          }
        }
      };

      try {
        const workerCount = Math.min(requestedConcurrency, chunks.length);
        await Promise.all(Array.from({ length: workerCount }, () => worker()));
      } finally {
        signal?.removeEventListener('abort', onCallerAbort);
      }

      if (signal?.aborted) {
        throw new Error('CANCELLED_BY_USER');
      }
      if (firstError) {
        throw firstError;
      }
    } else {
      for (const chunk of chunks) {
        await uploadSingleChunk(chunk, signal);
        uploadedBytes += chunk.end - chunk.offset;
        emitUploadProgress(uploadedBytes);
      }
    }
  } catch (uploadErr) {
    void Promise.resolve(
      fetchImpl(`/api/fm27/decode-save/upload/${encodeURIComponent(uploadId)}`, {
        method: 'DELETE',
      })
    ).catch(() => {
      // non-blocking cleanup
    });
    throw uploadErr;
  }

  // 3. Finalize upload & start async Python decode job
  const syncModeLabel = options.fastSync ? 'Fast Sync' : 'Full Sync';
  onProgress?.({
    stage: 'parse',
    step: `Server ${syncModeLabel}`,
    elapsedSec: elapsedSec(),
    label: `Starting native server ${syncModeLabel} decode...`,
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
    true
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
  let lastProgress = 'Opening .fm save...';
  let consecutivePollErrors = 0;
  let emittedCheckpointStage: string | null = null;
  while (true) {
    if (signal?.aborted) {
      throw new Error('CANCELLED_BY_USER');
    }

    let jobRes: Response;
    try {
      jobRes = await fetchImpl(
        `/api/fm27/decode-save/job/${encodeURIComponent(jobId)}`,
        { method: 'GET', cache: 'no-store', signal }
      );
    } catch (err: unknown) {
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
        step: 'Server Full Sync',
        elapsedSec: elapsedSec(),
        label: `Server busy — reconnecting to decode status (${consecutivePollErrors}/${SERVER_POLL_MAX_RETRIES})...`,
      });
      await sleepWithAbort(
        Math.min(3_000, Math.max(pollIntervalMs, retryBaseDelayMs * consecutivePollErrors)),
        signal
      );
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
        step: 'Server Full Sync',
        elapsedSec: elapsedSec(),
        label: `Server busy (HTTP ${jobRes.status}) — reconnecting to decode status (${consecutivePollErrors}/${SERVER_POLL_MAX_RETRIES})...`,
      });
      await sleepWithAbort(
        Math.min(3_000, Math.max(pollIntervalMs, retryBaseDelayMs * consecutivePollErrors)),
        signal
      );
      continue;
    }

    // 404 on an active job means the Render container restarted mid-decode and cleared in-memory jobs -> fall back cleanly
    if (jobRes.status === 404) {
      throw new ServerDecodeUnavailableError(
        'Server restarted during decode; switching to local browser decoder.',
        404
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

    const jobData = (await jobRes.json()) as {
      status?: 'running' | 'done' | 'error';
      progress?: string;
      payload?: DecodedFmSavePayload;
      checkpointStage?: string;
      checkpointPayload?: DecodedFmSavePayload;
      error?: string;
    };

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
        step: 'Server Full Sync',
        elapsedSec: elapsedSec(),
        label: 'Server Full Sync complete — hydrating Command Hub...',
      });
      return jobData.payload;
    }

    if (jobData.status === 'error') {
      throw new Error(jobData.error || 'Server .fm decode failed.');
    }

    onProgress?.({
      stage: 'parse',
      step: 'Server Full Sync',
      elapsedSec: elapsedSec(),
      label: `Server Full Sync: ${lastProgress}`,
    });

    await sleepWithAbort(pollIntervalMs, signal);
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

    const handleVisibilityChange = () => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        !settled &&
        isJobActive
      ) {
        resetInactivityWatchdog();
      }
    };

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

    const resetInactivityWatchdog = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(
        () => failWithTimeout('inactivity', WORKER_INACTIVITY_TIMEOUT_MS),
        WORKER_INACTIVITY_TIMEOUT_MS
      );
    };

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
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
    resetInactivityWatchdog();
    hardCeilingTimer = setTimeout(
      () => failWithTimeout('ceiling', WORKER_HARD_CEILING_MS),
      WORKER_HARD_CEILING_MS
    );

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
  const fallbackFastSync =
    typeof options.fastSync === 'boolean'
      ? options.fastSync
      : typeof options.viewportWidth === 'number'
        ? shouldDefaultFastSync(options.viewportWidth)
        : typeof window !== 'undefined'
          ? shouldDefaultFastSync(window.innerWidth)
          : false;

  if (!options.forceBrowserWorker) {
    const status = await checkServerDecodeStatus(fetchImpl, deps.signal);
    if (deps.signal?.aborted) {
      throw new Error('CANCELLED_BY_USER');
    }
    if (status.serverDecodeAvailable) {
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
            onCheckpoint: options.onCheckpoint,
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
        onProgress?.({
          stage: 'boot',
          step: 'Browser Fallback',
          label:
            'Server decoder unavailable or restarted — switching automatically to local browser decoder...',
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
