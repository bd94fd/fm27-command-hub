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
  label: string;
  elapsedSec?: number;
}

export interface DecodeFmSaveOptions {
  clubHint?: string;
  scope?: FmImportScope;
  fastSync?: boolean;
  /** Internal/testing override: skip server probe and go straight to browser Pyodide */
  forceBrowserWorker?: boolean;
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
  fetchImpl: typeof fetch = fetch
): Promise<ServerDecodeStatus> {
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 4_000) : null;
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
    return { serverDecodeAvailable: false };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export const SERVER_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB per chunk (safely under proxy 413 limit & server 8 MB chunk cap)
export const SERVER_MAX_SAVE_BYTES = 1024 * 1024 * 1024; // 1024 MB (1 GB) max total .fm save size
export const SERVER_JOB_POLL_INTERVAL_MS = 1_200; // 1.2s polling cadence

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
 * Uploads the .fm save file in 3 MB sequential chunks via:
 *   POST /api/fm27/decode-save/init
 *   POST /api/fm27/decode-save/chunk (3 MB slices)
 *   POST /api/fm27/decode-save/finish -> { jobId }
 *   GET  /api/fm27/decode-save/job/:jobId (polled every 1.2s until done/error)
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
  } = {},
  onProgress?: (progress: FmSaveProgressStage) => void,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<DecodedFmSavePayload> {
  const fileName =
    options.fileName || (file instanceof File ? file.name : 'save.fm');
  const scopeValue =
    options.scope === 'club_and_division' ? 'club_and_division' : 'club_only';
  const chunkSizeBytes = Math.max(
    1,
    options.chunkSizeBytes ?? SERVER_UPLOAD_CHUNK_BYTES
  );
  const pollIntervalMs = Math.max(
    10,
    options.pollIntervalMs ?? SERVER_JOB_POLL_INTERVAL_MS
  );
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
      (res.status === 503 ||
        res.status === 502 ||
        res.status === 504 ||
        res.status === 404)
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
    { method: 'POST' },
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
  const initBody = (await initRes.json()) as { uploadId?: string };
  const uploadId = initBody?.uploadId;
  if (!uploadId) {
    throw new Error('Server did not return an uploadId.');
  }

  // 2. Upload 3 MB chunks sequentially
  let offset = 0;
  while (offset < totalBytes) {
    if (signal?.aborted) {
      throw new Error('CANCELLED_BY_USER');
    }
    const end = Math.min(offset + chunkSizeBytes, totalBytes);
    const slice = file.slice(offset, end);

    const chunkRes = await fetchOrThrowUnavailable(
      '/api/fm27/decode-save/chunk',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-fm-upload-id': uploadId,
        },
        body: slice,
      },
      false
    );

    if (chunkRes.status === 503) {
      throw new ServerDecodeUnavailableError(
        'Server decoder unavailable (HTTP 503).',
        503
      );
    }
    if (!chunkRes.ok) {
      throw new Error(
        await readErrorMessageFromResponse(
          chunkRes,
          `Chunk upload failed (HTTP ${chunkRes.status}).`
        )
      );
    }

    offset = end;
    const uploadedMbLabel = (offset / (1024 * 1024)).toFixed(1);
    const pct = totalBytes > 0 ? Math.min(100, Math.round((offset / totalBytes) * 100)) : 100;
    onProgress?.({
      stage: 'read',
      step: 'Server Upload',
      elapsedSec: elapsedSec(),
      label: `Uploading save to server (${uploadedMbLabel} / ${totalMbLabel} MB — ${pct}%)...`,
    });
  }

  // 3. Finalize upload & start async Python Full Sync job
  onProgress?.({
    stage: 'parse',
    step: 'Server Full Sync',
    elapsedSec: elapsedSec(),
    label: 'Starting native server Full Sync decode...',
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
    false
  );

  if (finishRes.status === 503) {
    throw new ServerDecodeUnavailableError(
      'Server decoder unavailable (HTTP 503).',
      503
    );
  }
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
      consecutivePollErrors = 0;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('CANCELLED_BY_USER');
      }
      consecutivePollErrors += 1;
      if (consecutivePollErrors >= 3) {
        throw new Error(
          'Lost connection while checking server decode progress. Please retry.'
        );
      }
      await sleepWithAbort(pollIntervalMs, signal);
      continue;
    }

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
      error?: string;
    };

    if (jobData.progress && jobData.progress.trim()) {
      lastProgress = jobData.progress.trim();
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
  options: { clubHint?: string; scope?: FmImportScope; fastSync?: boolean } = {}
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
  } = {},
  deps: {
    fetchImpl?: typeof fetch;
    browserFallback?: (
      file: File | Blob,
      onProgress: ((progress: FmSaveProgressStage) => void) | undefined,
      opts: { clubHint?: string; scope?: FmImportScope; fastSync?: boolean }
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
    const status = await checkServerDecodeStatus(fetchImpl);
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
          },
          onProgress,
          fetchImpl,
          deps.signal
        );
      } catch (err: unknown) {
        if (!(err instanceof ServerDecodeUnavailableError)) {
          throw err;
        }
        onProgress?.({
          stage: 'boot',
          step: 'Browser Fallback',
          label:
            'Server decoder unavailable (503) — falling back to local browser Pyodide worker...',
        });
      }
    }
  }

  return browserFallback(file, onProgress, {
    clubHint,
    scope,
    fastSync: fallbackFastSync,
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
  isJobActive = true;
  activeCancelFn = () => {
    abortController?.abort();
    isJobActive = false;
    activeCancelFn = null;
  };

  return decodeFmSaveWithServerFirst(file, onProgress, parsedOptions, {
    signal: abortController?.signal,
  }).finally(() => {
    isJobActive = false;
    if (activeCancelFn) {
      activeCancelFn = null;
    }
  });
}
