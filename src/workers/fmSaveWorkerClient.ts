import { FmImportScope, Pass0ExtractionPayload } from '../types/fmSave';
import { DecodedFmSavePayload, WORKER_CACHE_BUSTER } from '../utils/fmSaveHydrator';

export interface WorkerProgressEvent {
  stage: 'boot' | 'install' | 'read' | 'parse';
  step?: string;
  label: string;
}

export class FmSaveWorkerClient {
  private worker: Worker | null = null;
  private activeRequestId: number = 0;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private isJobActive: boolean = false;
  private activeReject: ((err: Error) => void) | null = null;

  private clearWatchdog() {
    if (this.watchdogTimer !== null) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  public getIsJobActive(): boolean {
    return this.isJobActive;
  }

  public cancelActiveJob(reason: string = 'Superceded by new save drop') {
    this.clearWatchdog();
    if (this.worker && this.isJobActive) {
      this.worker.terminate();
      this.worker = null;
      this.isJobActive = false;
      console.warn(`[FmSaveWorkerClient] Active job terminated: ${reason}`);
    }
    if (this.activeReject) {
      const rejectFn = this.activeReject;
      this.activeReject = null;
      rejectFn(new Error(reason));
    }
  }

  public async parseFmSaveFile(
    fileOrBuffer: File | ArrayBuffer,
    options?: {
      clubHint?: string;
      scope?: FmImportScope;
      onProgress?: (progress: WorkerProgressEvent) => void;
    }
  ): Promise<Pass0ExtractionPayload | DecodedFmSavePayload> {
    this.cancelActiveJob('New parse job initiated');

    const requestId = ++this.activeRequestId;
    this.isJobActive = true;
    this.worker = new Worker(`/fm-save-worker.js${WORKER_CACHE_BUSTER}`, {
      type: 'module',
    });

    return new Promise<Pass0ExtractionPayload | DecodedFmSavePayload>(
      (resolve, reject) => {
        const TIMEOUT_MS = 150_000; // 150 seconds watchdog budget
        let lastStageLabel = 'Initializing local .fm reader';

        const resetWatchdog = () => {
          this.clearWatchdog();
          this.watchdogTimer = setTimeout(() => {
            if (this.activeRequestId === requestId) {
              const timeoutErr = new Error(
                `Processing timeout: Save file extraction exceeded 150 seconds budget during "${lastStageLabel}".`
              );
              this.activeReject = null;
              if (this.worker) {
                this.worker.terminate();
                this.worker = null;
              }
              this.isJobActive = false;
              reject(timeoutErr);
            }
          }, TIMEOUT_MS);
        };

        this.activeReject = reject;
        resetWatchdog();

        this.worker!.onmessage = (event: MessageEvent) => {
          if (this.activeRequestId !== requestId) return;
          const data = event.data || {};

          if (data.type === 'stage') {
            lastStageLabel = data.label || lastStageLabel;
            resetWatchdog();
            options?.onProgress?.({
              stage: data.stage,
              step: data.step,
              label: data.label,
            });
            return;
          }

          this.clearWatchdog();
          this.isJobActive = false;
          this.activeReject = null;

          if (data.success || data.type === 'result') {
            resolve((data.payload || data.data) as Pass0ExtractionPayload | DecodedFmSavePayload);
          } else {
            reject(
              new Error(
                data.error || data.message || 'Unknown worker extraction error.'
              )
            );
          }
        };

        this.worker!.onerror = (err: ErrorEvent) => {
          if (this.activeRequestId !== requestId) return;
          this.clearWatchdog();
          this.isJobActive = false;
          this.activeReject = null;
          this.worker?.terminate();
          this.worker = null;
          reject(new Error(`Worker execution failed: ${err.message}`));
        };

        this.worker!.onmessageerror = () => {
          if (this.activeRequestId !== requestId) return;
          this.clearWatchdog();
          this.isJobActive = false;
          this.activeReject = null;
          this.worker?.terminate();
          this.worker = null;
          reject(
            new Error(
              'Could not transfer decoded data from the local .fm reader worker.'
            )
          );
        };

        if (typeof File !== 'undefined' && fileOrBuffer instanceof File) {
          this.worker!.postMessage({
            type: 'parse_fm',
            file: fileOrBuffer,
            requestId,
            clubHint: options?.clubHint || '',
            scope: options?.scope || 'managed_club_only',
          });
        } else {
          const buf = fileOrBuffer as ArrayBuffer;
          this.worker!.postMessage(
            {
              type: 'parse',
              requestId,
              buffer: buf,
              clubHint: options?.clubHint || '',
              scope: options?.scope || 'managed_club_only',
            },
            [buf]
          );
        }
      }
    );
  }
}
