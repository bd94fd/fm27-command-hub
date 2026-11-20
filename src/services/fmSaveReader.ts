import type { SaveImportScope } from '../domain/fmSaveImport';

export interface FmSaveProgressStage {
  stage: 'boot' | 'install' | 'read' | 'parse' | 'open' | 'managed' | 'injuries' | 'players' | 'staff' | 'clubs' | 'fixtures' | 'finalize' | 'done';
  step?: string;
  label: string;
  percent?: number;
}

export interface DecodeFmSaveOptions {
  scope?: SaveImportScope;
  clubHint?: string | null;
}

const STEP_INACTIVITY_TIMEOUT_MS = 150_000;

let sharedWorker: Worker | null = null;
let requestCounter = 0;
let activeCancelFn: (() => void) | null = null;
let warmupPromise: Promise<{ fmsaveVersion?: string; pyodideVersion?: string }> | null = null;

function getFmSaveWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker('/fm-save-worker.js', { type: 'module' });
  }
  return sharedWorker;
}

/**
 * Terminates an active .fm save decode immediately so the user can cancel or retry.
 */
export function cancelFmSaveDecode(): void {
  if (activeCancelFn) {
    activeCancelFn();
    activeCancelFn = null;
  } else if (sharedWorker) {
    sharedWorker.terminate();
    sharedWorker = null;
    warmupPromise = null;
  }
}

/**
 * Pre-warms the singleton Pyodide 3.14 + fmsave Web Worker in the background.
 */
export function warmupFmSaveWorker(
  onStage?: (stage: FmSaveProgressStage) => void,
): Promise<{ fmsaveVersion?: string; pyodideVersion?: string }> {
  if (warmupPromise) return warmupPromise;

  warmupPromise = new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = getFmSaveWorker();
    } catch (err) {
      warmupPromise = null;
      reject(err instanceof Error ? err : new Error('Web Workers are unavailable in this environment.'));
      return;
    }

    const requestId = ++requestCounter;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      warmupPromise = null;
      reject(new Error('Timed out while warming up the local .fm parser runtime.'));
    }, STEP_INACTIVITY_TIMEOUT_MS);

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        warmupPromise = null;
        reject(new Error('Timed out while warming up the local .fm parser runtime.'));
      }, STEP_INACTIVITY_TIMEOUT_MS);
    };

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || (msg.requestId !== undefined && msg.requestId !== requestId)) return;

      if (msg.type === 'stage' || msg.type === 'progress') {
        resetTimer();
        onStage?.({
          stage: msg.stage || 'boot',
          step: msg.step,
          label: msg.label || msg.detail || 'Initializing FM27 .fm reader...',
          percent: typeof msg.percent === 'number' ? msg.percent : undefined,
        });
      } else if (msg.type === 'ready') {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({
          fmsaveVersion: msg.fmsaveVersion,
          pyodideVersion: msg.pyodideVersion,
        });
      } else if (msg.type === 'error') {
        if (settled) return;
        settled = true;
        cleanup();
        warmupPromise = null;
        reject(new Error(msg.message || msg.error || 'Failed to initialize .fm parser worker.'));
      }
    };

    const handleError = (err: ErrorEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      warmupPromise = null;
      sharedWorker?.terminate();
      sharedWorker = null;
      reject(new Error(err.message || 'Failed to boot /fm-save-worker.js'));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage({
      type: 'warmup',
      requestId,
      origin: typeof window !== 'undefined' ? window.location.origin : '',
    });
  });

  return warmupPromise;
}

/**
 * Decodes a real Football Manager (.fm) save file locally inside a singleton browser Web Worker
 * using Pyodide 3.14 + fmsave + WORKERFS/chunked MEMFS with a 150s per-step inactivity watchdog.
 */
export function decodeFmSaveFile<T = unknown>(
  file: File,
  options: DecodeFmSaveOptions = {},
  onStage?: (stage: FmSaveProgressStage) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = getFmSaveWorker();
    const requestId = ++requestCounter;
    let lastStageLabel = 'Initializing local .fm reader';
    let settled = false;
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

    const resetWatchdog = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        sharedWorker?.terminate();
        sharedWorker = null;
        warmupPromise = null;
        reject(
          new Error(
            `Save decoding timed out during "${lastStageLabel}" after 150s of inactivity. Mobile browsers can run out of WebAssembly RAM on very large .fm saves — close background tabs, try 'Managed Club Only' scope, or upload from desktop.`,
          ),
        );
      }, STEP_INACTIVITY_TIMEOUT_MS);
    };

    const cleanup = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
      activeCancelFn = null;
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.removeEventListener('messageerror', handleMessageError);
    };

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || (msg.requestId !== undefined && msg.requestId !== requestId)) return;

      if (msg.type === 'stage' || msg.type === 'progress') {
        const label = String(msg.label || msg.detail || lastStageLabel);
        lastStageLabel = label;
        resetWatchdog();
        onStage?.({
          stage: msg.stage || 'parse',
          step: msg.step,
          label,
          percent: typeof msg.percent === 'number' ? msg.percent : undefined,
        });
      } else if (msg.type === 'result') {
        if (settled) return;
        settled = true;
        cleanup();
        const resultData = msg.data ?? msg.payload;
        if (!resultData) {
          reject(new Error('Worker returned an empty result payload.'));
          return;
        }
        resolve(resultData as T);
      } else if (msg.type === 'error') {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(msg.message || msg.error || 'Failed to decode .fm save file.'));
      }
    };

    const handleError = (err: ErrorEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      sharedWorker?.terminate();
      sharedWorker = null;
      warmupPromise = null;
      reject(
        new Error(
          err.message ||
            'The local .fm reader worker stopped unexpectedly (often due to browser memory limits on mobile). Please retry or choose Managed Club Only scope.',
        ),
      );
    };

    const handleMessageError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      sharedWorker?.terminate();
      sharedWorker = null;
      warmupPromise = null;
      reject(
        new Error(
          'Could not transfer decoded data from the local .fm reader worker. Please try again.',
        ),
      );
    };

    activeCancelFn = () => {
      if (settled) return;
      settled = true;
      cleanup();
      sharedWorker?.terminate();
      sharedWorker = null;
      warmupPromise = null;
      reject(new Error('CANCELLED_BY_USER'));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.addEventListener('messageerror', handleMessageError);
    resetWatchdog();

    worker.postMessage({
      type: 'parse',
      file,
      requestId,
      scope: options.scope ?? 'scouting_pool',
      clubHint: options.clubHint ?? null,
      origin: typeof window !== 'undefined' ? window.location.origin : '',
    });
  });
}
