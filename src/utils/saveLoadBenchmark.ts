/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lightweight, local-only save-load timing marks. This records stage boundaries
 * in memory so the benchmark harness and DevTools can read them. It never sends
 * data anywhere and never stores player or save content.
 */

export type SaveLoadStage =
  | 'upload_start'
  | 'upload_complete'
  | 'decode_start'
  | 'transfer_start'
  | 'transfer_complete'
  | 'decode_complete'
  | 'hydrate_start'
  | 'hydrate_complete'
  | 'state_applied'
  | 'first_useful_screen'
  | 'full_tab_ready'
  | 'failed';

export interface SaveLoadBenchmarkRecord {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  mode: 'full' | 'fast';
  cacheHit: boolean;
  startedAtIso: string;
  startedAtMs: number;
  completedAtIso: string | null;
  marksMs: Partial<Record<SaveLoadStage, number>>;
  detailMs: Record<string, number>;
}

export interface StartSaveLoadBenchmarkInput {
  fileName: string;
  fileSizeBytes: number;
  mode: 'full' | 'fast';
}

declare global {
  interface Window {
    __FM27_SAVE_LOAD_BENCHMARKS__?: SaveLoadBenchmarkRecord[];
  }
}

const records = new Map<string, SaveLoadBenchmarkRecord>();
let sequence = 0;

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function cloneRecord(record: SaveLoadBenchmarkRecord): SaveLoadBenchmarkRecord {
  return {
    ...record,
    marksMs: { ...record.marksMs },
    detailMs: { ...record.detailMs },
  };
}

function publishToWindow(): void {
  if (typeof window === 'undefined') return;
  window.__FM27_SAVE_LOAD_BENCHMARKS__ = getSaveLoadBenchmarks();
}

export function startSaveLoadBenchmark(
  input: StartSaveLoadBenchmarkInput
): string {
  sequence += 1;
  const id = `save-load-${Date.now()}-${sequence}`;
  const startedAtMs = nowMs();
  records.set(id, {
    id,
    fileName: input.fileName,
    fileSizeBytes: Math.max(0, Math.round(input.fileSizeBytes)),
    mode: input.mode,
    cacheHit: false,
    startedAtIso: new Date().toISOString(),
    startedAtMs,
    completedAtIso: null,
    marksMs: { upload_start: 0 },
    detailMs: {},
  });
  publishToWindow();
  return id;
}

/**
 * Records a stage boundary. By default the first call wins so retries and
 * re-renders cannot overwrite the original boundary. Pass overwrite for
 * repeating probes (for example the final poll's JSON transfer).
 */
export function markSaveLoadStage(
  id: string,
  stage: SaveLoadStage,
  options: { overwrite?: boolean } = {}
): void {
  const record = records.get(id);
  if (!record) return;
  if (!options.overwrite && record.marksMs[stage] !== undefined) return;

  record.marksMs[stage] = Math.max(0, Math.round(nowMs() - record.startedAtMs));
  if (stage === 'full_tab_ready' || stage === 'failed') {
    record.completedAtIso = new Date().toISOString();
  }
  publishToWindow();
}

export function markSaveLoadCacheHit(id: string): void {
  const record = records.get(id);
  if (!record) return;
  record.cacheHit = true;
  publishToWindow();
}

export function recordSaveLoadDetails(
  id: string,
  details: Record<string, number>
): void {
  const record = records.get(id);
  if (!record) return;
  for (const [key, value] of Object.entries(details)) {
    if (Number.isFinite(value) && value >= 0) {
      record.detailMs[key] = Math.round(value);
    }
  }
  publishToWindow();
}

export function finishSaveLoadBenchmark(id: string): void {
  markSaveLoadStage(id, 'full_tab_ready');
}

export function getSaveLoadBenchmark(id: string): SaveLoadBenchmarkRecord | null {
  const record = records.get(id);
  return record ? cloneRecord(record) : null;
}

export function getSaveLoadBenchmarks(): SaveLoadBenchmarkRecord[] {
  return Array.from(records.values()).map(cloneRecord);
}

export function clearSaveLoadBenchmarks(): void {
  records.clear();
  publishToWindow();
}
