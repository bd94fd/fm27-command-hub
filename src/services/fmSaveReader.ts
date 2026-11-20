import { DecodedFmSavePayload } from '../utils/fmSaveHydrator';

export type FmImportScope =
  | 'managed_club_only'
  | 'full_division'
  | 'my_club'
  | 'full_league'
  | 'full_save';

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

// If a single step produces zero progress for 150s, assume mobile WASM freeze/OOM
const STEP_INACTIVITY_TIMEOUT_MS = 150_000;

function getFmSaveWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker('/fm-save-worker.js?v=7', { type: 'module' });
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
  }
}

/**
 * Decodes a real Football Manager (.fm) save file locally inside a browser Web Worker
 * using Pyodide (Python 3.14 WebAssembly) + fmsave 0.14.1.
 * Files never leave the user's device.
 */
export function decodeFmSaveFile(
  file: File,
  onProgress?: (progress: FmSaveProgressStage) => void,
  clubHintOrOptions: string | DecodeFmSaveOptions = ''
): Promise<DecodedFmSavePayload> {
  const clubHint =
    typeof clubHintOrOptions === 'string'
      ? clubHintOrOptions
      : clubHintOrOptions?.clubHint || '';
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
    });
  });
}
