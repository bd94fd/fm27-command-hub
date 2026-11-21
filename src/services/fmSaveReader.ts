import { FmImportScope } from '../types/fmSave';
import { DecodedFmSavePayload, WORKER_CACHE_BUSTER } from '../utils/fmSaveHydrator';

export type { FmImportScope };

export interface FmSaveProgressStage {
  stage: 'boot' | 'install' | 'read' | 'parse';
  step?: string;
  label: string;
}

export interface DecodeFmSaveOptions {
  clubHint?: string;
  scope?: FmImportScope;
}

let sharedWorker: Worker | null = null;
let requestCounter = 0;
let activeCancelFn: (() => void) | null = null;
let isJobActive = false;

// If a single step produces zero progress for 150s, assume mobile WASM freeze/OOM
const STEP_INACTIVITY_TIMEOUT_MS = 150_000;

function getFmSaveWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(`/fm-save-worker.js${WORKER_CACHE_BUSTER}`, {
      type: 'module',
    });
  }
  return sharedWorker;
}

/**
 * Terminates an active .fm save decode immediately so the user can cancel or retry.
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
 * Decodes a real Football Manager (.fm) save file locally inside a browser Web Worker
 * using Pyodide (Python 3.14 WebAssembly) + fmsave 0.14.1.
 * Files never leave the user's device. Enforces concurrency guard (cancels superseded job)
 * and 150s per-step watchdog cleanup.
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

  const clubHint =
    typeof clubHintOrOptions === 'string'
      ? clubHintOrOptions
      : clubHintOrOptions?.clubHint || '';
  const scope: FmImportScope =
    typeof clubHintOrOptions === 'string'
      ? 'managed_club_only'
      : clubHintOrOptions?.scope || 'managed_club_only';

  return new Promise((resolve, reject) => {
    const worker = getFmSaveWorker();
    const requestId = ++requestCounter;
    let lastStageLabel = 'Initializing local .fm reader';
    let settled = false;
    isJobActive = true;

    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

    const resetWatchdog = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        sharedWorker?.terminate();
        sharedWorker = null;
        reject(
          new Error(
            `Save decoding timed out during "${lastStageLabel}". Mobile browsers can run out of WebAssembly RAM on very large .fm saves — close background tabs and retry, or upload from desktop.`
          )
        );
      }, STEP_INACTIVITY_TIMEOUT_MS);
    };

    const cleanup = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
      isJobActive = false;
      activeCancelFn = null;
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.removeEventListener('messageerror', handleMessageError);
    };

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || msg.requestId !== requestId) return;

      if (msg.type === 'stage') {
        lastStageLabel = msg.label || lastStageLabel;
        resetWatchdog();
        if (onProgress) {
          onProgress({
            stage: msg.stage,
            step: msg.step,
            label: msg.label,
          });
        }
      } else if (msg.type === 'result' && (msg.data || msg.payload)) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve((msg.data || msg.payload) as DecodedFmSavePayload);
      } else if (msg.type === 'error') {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(msg.message || 'Failed to decode .fm save file.'));
      }
    };

    const handleError = (err: ErrorEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      sharedWorker?.terminate();
      sharedWorker = null;
      reject(
        new Error(
          err.message ||
            'The local .fm reader worker stopped unexpectedly (often due to browser memory limits on mobile). Please retry or try on desktop.'
        )
      );
    };

    const handleMessageError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      sharedWorker?.terminate();
      sharedWorker = null;
      reject(
        new Error(
          'Could not transfer decoded data from the local .fm reader worker. Please try again.'
        )
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
    resetWatchdog();

    worker.postMessage({
      type: 'parse_fm',
      file,
      requestId,
      clubHint,
      scope,
    });
  });
}
