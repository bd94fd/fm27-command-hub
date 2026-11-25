import { FmImportScope, Pass0ExtractionPayload } from '../types/fmSave';
import { DecodedFmSavePayload, WORKER_CACHE_BUSTER } from '../utils/fmSaveHydrator';

// Worker bundle uses WORKER_CACHE_BUSTER ('?v=24') from fmSaveHydrator.ts
export const WORKER_INACTIVITY_TIMEOUT_MS = 150_000;
export const WORKER_HARD_CEILING_MS = 480_000;

export type FmSavePayloadUnion = Pass0ExtractionPayload | DecodedFmSavePayload;

export interface CheckpointSnapshot<T extends FmSavePayloadUnion = FmSavePayloadUnion> {
  stage: string;
  payload: T;
}

export function isValidSquadCheckpoint(payload: unknown): payload is FmSavePayloadUnion {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as { players?: unknown; squad?: unknown };
  if (Array.isArray(candidate.players) && candidate.players.length > 0) {
    return true;
  }
  if (Array.isArray(candidate.squad) && candidate.squad.length > 0) {
    return true;
  }
  return false;
}

export function formatCheckpointStageLabel(stage: string): string {
  switch (stage) {
    case 'stage_1_squad':
      return 'Stage 1 (Club & Squad)';
    case 'stage_2_club_core':
      return 'Stage 2 (Finances, Staff, Tactics & Mentoring)';
    case 'stage_3_club_ops':
      return 'Stage 3 (Club Ops, Last-5 Form, Contracts & Market Scan)';
    case 'stage_3_fixtures_league':
    case 'stage_4_fixtures_league':
      return 'Stage 4 (Fixtures & Full Domestic League Table)';
    case 'stage_4_club_ops':
      return 'Stage 4 (Club Ops, Market Scan & Match xG)';
    case 'stage_4_player_stats':
      return 'Stage 4 (Match xG, Player Season Stats & Last-5 Form)';
    default:
      return stage || 'Squad Checkpoint';
  }
}

export function buildCheckpointRecoveryWarning(
  reason: 'inactivity' | 'ceiling' | 'error',
  stalledStageLabel: string,
  elapsedSec: number,
  checkpointStage: string,
  limitSec?: number
): string {
  const safeElapsed = Math.max(0, Number(elapsedSec.toFixed(1)));
  const checkpointDesc = formatCheckpointStageLabel(checkpointStage);
  if (reason === 'inactivity') {
    const cap = limitSec ?? Math.round(WORKER_INACTIVITY_TIMEOUT_MS / 1000);
    return `Checkpoint recovery (${checkpointDesc}): "${stalledStageLabel}" stalled for ${cap}s at ${safeElapsed}s total — terminated stuck worker and preserved decoded squad & earlier stages.`;
  }
  if (reason === 'ceiling') {
    const cap = limitSec ?? Math.round(WORKER_HARD_CEILING_MS / 1000);
    return `Checkpoint recovery (${checkpointDesc}): "${stalledStageLabel}" hit the ${cap}s hard ceiling at ${safeElapsed}s total — terminated stuck worker and preserved decoded squad & earlier stages.`;
  }
  return `Checkpoint recovery (${checkpointDesc}): "${stalledStageLabel}" failed at ${safeElapsed}s total — preserved decoded squad & earlier stages.`;
}

export function applyCheckpointRecoveryWarning<T extends FmSavePayloadUnion>(
  checkpointPayload: T,
  warning: string,
  totalElapsedMs?: number
): T {
  const cloned = { ...(checkpointPayload as unknown as Record<string, unknown>) };
  const existingExtraction = Array.isArray(cloned.extractionWarnings)
    ? [...(cloned.extractionWarnings as string[])]
    : [];
  if (!existingExtraction.includes(warning)) {
    existingExtraction.push(warning);
  }
  cloned.extractionWarnings = existingExtraction;

  if ('warnings' in cloned || 'players' in cloned) {
    const existingWarnings = Array.isArray(cloned.warnings)
      ? [...(cloned.warnings as string[])]
      : [];
    if (!existingWarnings.includes(warning)) {
      existingWarnings.push(warning);
    }
    cloned.warnings = existingWarnings;
  }

  if (typeof totalElapsedMs === 'number' && Number.isFinite(totalElapsedMs)) {
    const existingTimings =
      cloned.stepTimingsMs && typeof cloned.stepTimingsMs === 'object'
        ? { ...(cloned.stepTimingsMs as Record<string, number>) }
        : {};
    existingTimings.totalDecodeMs = Math.max(0, Math.round(totalElapsedMs));
    cloned.stepTimingsMs = existingTimings;
  }

  return cloned as unknown as T;
}

export function formatWorkerTimeoutMessage(
  kind: 'inactivity' | 'ceiling',
  lastStageLabel: string,
  elapsedSec: number,
  limitSec: number
): string {
  const safeElapsed = Math.max(0, Math.round(elapsedSec));
  if (kind === 'inactivity') {
    return `Save decoding stalled for ${limitSec}s with no progress during "${lastStageLabel}" (total elapsed: ${safeElapsed}s). You can enable "Fast Sync (Quick Preview)" next to the .fm file picker for very large saves.`;
  }
  return `Save decoding exceeded the ${limitSec}s hard ceiling during "${lastStageLabel}" (total elapsed: ${safeElapsed}s). You can enable "Fast Sync (Quick Preview)" next to the .fm file picker to decode squad, attributes, league table, fixtures, finances, and staff in seconds.`;
}

export interface WorkerProgressEvent {
  stage: 'boot' | 'install' | 'read' | 'parse';
  step?: string;
  phase?: string;
  progressPct?: number;
  label: string;
  elapsedSec?: number;
}

export interface WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((err: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
  postMessage(message: unknown): void;
  terminate: () => void;
}

export interface FmSaveWorkerClientOptions {
  workerFactory?: (url: string) => WorkerLike;
  inactivityTimeoutMs?: number;
  hardCeilingMs?: number;
}

export class FmSaveWorkerClient {
  private worker: WorkerLike | null = null;
  private activeRequestId: number = 0;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private hardCeilingTimer: ReturnType<typeof setTimeout> | null = null;
  private isJobActive: boolean = false;
  private activeReject: ((err: Error) => void) | null = null;
  private visibilityCleanup: (() => void) | null = null;
  private workerFactory: (url: string) => WorkerLike;
  private inactivityTimeoutMs: number;
  private hardCeilingMs: number;

  constructor(options?: FmSaveWorkerClientOptions) {
    this.workerFactory =
      options?.workerFactory ??
      ((url: string) => new Worker(url, { type: 'module' }));
    this.inactivityTimeoutMs =
      options?.inactivityTimeoutMs ?? WORKER_INACTIVITY_TIMEOUT_MS;
    this.hardCeilingMs = options?.hardCeilingMs ?? WORKER_HARD_CEILING_MS;
  }

  private clearWatchdogs() {
    if (this.inactivityTimer !== null) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    if (this.hardCeilingTimer !== null) {
      clearTimeout(this.hardCeilingTimer);
      this.hardCeilingTimer = null;
    }
  }

  public getIsJobActive(): boolean {
    return this.isJobActive;
  }

  public cancelActiveJob(reason: string = 'Superseded by new save drop') {
    this.clearWatchdogs();
    this.visibilityCleanup?.();
    this.visibilityCleanup = null;
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
      fastSync?: boolean;
      onProgress?: (progress: WorkerProgressEvent) => void;
      onCheckpoint?: (checkpoint: CheckpointSnapshot) => void;
    }
  ): Promise<FmSavePayloadUnion> {
    this.cancelActiveJob('New parse job initiated');
    // Terminate any previous completed worker so its Pyodide WASM heap is released before spawning a new one
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }

    const requestId = ++this.activeRequestId;
    this.isJobActive = true;
    this.worker = this.workerFactory(`/fm-save-worker.js${WORKER_CACHE_BUSTER}`);

    return new Promise<FmSavePayloadUnion>((resolve, reject) => {
      const startedAtMs = Date.now();
      let lastStageLabel = 'Initializing local .fm reader';
      let latestCheckpoint: CheckpointSnapshot | null = null;

      let detachVisibilityListener = () => {};

      const terminateStuckWorker = () => {
        detachVisibilityListener();
        this.visibilityCleanup = null;
        this.clearWatchdogs();
        this.activeReject = null;
        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }
        this.isJobActive = false;
      };

      const recoverOrReject = (
        reason: 'inactivity' | 'ceiling' | 'error',
        errorMessage: string,
        limitMs?: number
      ) => {
        if (this.activeRequestId !== requestId) return;
        const elapsedMs = Date.now() - startedAtMs;
        const elapsedSec = elapsedMs / 1000;
        terminateStuckWorker();

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

      let hiddenAtMs: number | null = null;
      let ceilingDeadlineMs = 0;

      const scheduleInactivity = () => {
        if (this.inactivityTimer !== null) {
          clearTimeout(this.inactivityTimer);
        }
        this.inactivityTimer = setTimeout(
          () => failWithTimeout('inactivity', this.inactivityTimeoutMs),
          this.inactivityTimeoutMs
        );
      };

      const scheduleCeiling = () => {
        if (this.hardCeilingTimer !== null) {
          clearTimeout(this.hardCeilingTimer);
        }
        const remainingMs = Math.max(0, ceilingDeadlineMs - Date.now());
        this.hardCeilingTimer = setTimeout(
          () => failWithTimeout('ceiling', this.hardCeilingMs),
          remainingMs
        );
      };

      const resetInactivityWatchdog = () => {
        // Background tabs are throttled, so hidden time must not count as a stall.
        if (hiddenAtMs !== null) {
          if (this.inactivityTimer !== null) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
          }
          return;
        }
        scheduleInactivity();
      };

      const handleVisibilityChange = () => {
        if (
          typeof document === 'undefined' ||
          this.activeRequestId !== requestId
        ) {
          return;
        }
        if (document.visibilityState === 'hidden') {
          if (hiddenAtMs === null) {
            hiddenAtMs = Date.now();
            if (this.inactivityTimer !== null) {
              clearTimeout(this.inactivityTimer);
              this.inactivityTimer = null;
            }
            if (this.hardCeilingTimer !== null) {
              clearTimeout(this.hardCeilingTimer);
              this.hardCeilingTimer = null;
            }
          }
          return;
        }
        if (document.visibilityState !== 'visible' || hiddenAtMs === null) {
          return;
        }
        const hiddenMs = Math.max(0, Date.now() - hiddenAtMs);
        hiddenAtMs = null;
        // Extend the hard ceiling by exactly the time spent suspended.
        ceilingDeadlineMs += hiddenMs;
        if (!this.isJobActive) return;
        scheduleCeiling();
        scheduleInactivity();
      };
      detachVisibilityListener = () => {
        if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
      };
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        if (document.visibilityState === 'hidden') {
          hiddenAtMs = Date.now();
        }
      }
      this.visibilityCleanup = detachVisibilityListener;

      this.activeReject = (err: Error) => {
        detachVisibilityListener();
        this.visibilityCleanup = null;
        reject(err);
      };
      ceilingDeadlineMs = Date.now() + this.hardCeilingMs;
      if (hiddenAtMs === null) {
        resetInactivityWatchdog();
        scheduleCeiling();
      }

      this.worker!.onmessage = (event: MessageEvent) => {
        if (this.activeRequestId !== requestId) return;
        const data = event.data || {};
        if (data.requestId !== undefined && data.requestId !== requestId) return;

        if (data.type === 'stage') {
          lastStageLabel = data.label || lastStageLabel;
          resetInactivityWatchdog();
          options?.onProgress?.({
            stage: data.stage,
            step: data.step,
            phase: typeof data.phase === 'string' ? data.phase : undefined,
            progressPct:
              typeof data.progressPct === 'number' ? data.progressPct : undefined,
            label: data.label,
            elapsedSec:
              typeof data.elapsedSec === 'number'
                ? data.elapsedSec
                : Number(((Date.now() - startedAtMs) / 1000).toFixed(1)),
          });
          return;
        }

        if (data.type === 'checkpoint') {
          resetInactivityWatchdog();
          const cpPayload = data.payload || data.data;
          if (isValidSquadCheckpoint(cpPayload)) {
            latestCheckpoint = {
              stage: String(data.stage || 'stage_1_squad'),
              payload: cpPayload,
            };
            options?.onCheckpoint?.(latestCheckpoint);
          }
          return;
        }

        if (data.success || data.type === 'result') {
          detachVisibilityListener();
          this.visibilityCleanup = null;
          this.clearWatchdogs();
          this.isJobActive = false;
          this.activeReject = null;
          resolve((data.payload || data.data) as FmSavePayloadUnion);
          return;
        }

        detachVisibilityListener();
        this.visibilityCleanup = null;
        recoverOrReject(
          'error',
          data.error || data.message || 'Unknown worker extraction error.'
        );
      };

      this.worker!.onerror = (err: ErrorEvent) => {
        recoverOrReject('error', `Worker execution failed: ${err.message}`);
      };

      this.worker!.onmessageerror = () => {
        recoverOrReject(
          'error',
          'Could not transfer decoded data from the local .fm reader worker.'
        );
      };

      if (typeof File !== 'undefined' && fileOrBuffer instanceof File) {
        this.worker!.postMessage({
          type: 'parse_fm',
          file: fileOrBuffer,
          requestId,
          clubHint: options?.clubHint || '',
          scope: options?.scope || 'managed_club_only',
          fastSync: Boolean(options?.fastSync),
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
            fastSync: Boolean(options?.fastSync),
          },
          [buf]
        );
      }
    });
  }
}
