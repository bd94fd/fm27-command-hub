import type { SaveLoadBenchmarkRecord } from './saveLoadBenchmark';

export interface DecodeStepProfile {
  key: string;
  label: string;
  ms: number;
  sharePct: number;
}

export interface SaveLoadStageProfile {
  id: string;
  fileName: string;
  fileSizeMb: number;
  mode: 'full' | 'fast';
  uploadMs: number;
  decodeMs: number;
  firstUsefulMs: number;
  transferMs: number;
  hydrateMs: number;
  renderMs: number;
  decoderMeasuredMs: number;
  unattributedDecodeMs: number;
  decodeSteps: DecodeStepProfile[];
  serverDetailMs: Record<string, number>;
}

const STEP_LABELS: Record<string, string> = {
  step_1_open: 'Open save',
  step_2_players: 'Players & attributes',
  step_3_1_finances: 'Finances',
  step_3_2_staff: 'Staff',
  step_3_3_tactics_mentoring: 'Tactics & mentoring',
  step_3_3_injuries: 'Injuries',
  step_3_3_facilities: 'Facilities',
  step_3_3_competition_rules: 'Competition rules',
  step_3_3_transfer_windows: 'Transfer windows',
  step_3_3_secondary_ops: 'Secondary club data',
  step_3_4_market_scan: 'Market scan',
  step_4_1_season_stats: 'Season stats',
  step_4_2_player_match_stats: 'Player match stats',
  step_4_3_season_history: 'Player season history',
  step_4_4_contracts_and_suspensions: 'Contracts & suspensions',
  step_4_team_match_stats: 'Team match stats',
  step_5_fixtures: 'Fixtures & results',
  step_5_2_league_table: 'League table',
};

function positive(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

function duration(
  marks: SaveLoadBenchmarkRecord['marksMs'],
  from: keyof SaveLoadBenchmarkRecord['marksMs'],
  to: keyof SaveLoadBenchmarkRecord['marksMs']
): number {
  const start = marks[from];
  const end = marks[to];
  return typeof start === 'number' && typeof end === 'number' && end >= start
    ? Math.round(end - start)
    : 0;
}

export function summarizeDecodeSteps(
  stepTimingsMs: Record<string, number> | undefined
): DecodeStepProfile[] {
  if (!stepTimingsMs) return [];
  const entries = Object.entries(stepTimingsMs)
    .filter(([key, value]) => key !== 'totalDecodeMs' && positive(value) > 0)
    .map(([key, value]) => ({
      key,
      label: STEP_LABELS[key] ?? key,
      ms: positive(value),
    }))
    .sort((a, b) => b.ms - a.ms);
  const total = entries.reduce((sum, entry) => sum + entry.ms, 0);
  return entries.map((entry) => ({
    ...entry,
    sharePct: total > 0 ? Math.round((entry.ms / total) * 1000) / 10 : 0,
  }));
}

export function buildSaveLoadStageProfile(
  record: SaveLoadBenchmarkRecord,
  stepTimingsMs?: Record<string, number>
): SaveLoadStageProfile {
  const decodeMs = duration(record.marksMs, 'decode_start', 'decode_complete');
  const explicitTotal = positive(stepTimingsMs?.totalDecodeMs);
  const steps = summarizeDecodeSteps(stepTimingsMs);
  const decoderMeasuredMs =
    explicitTotal > 0
      ? explicitTotal
      : steps.reduce((sum, step) => sum + step.ms, 0);

  return {
    id: record.id,
    fileName: record.fileName,
    fileSizeMb: Math.round((record.fileSizeBytes / (1024 * 1024)) * 10) / 10,
    mode: record.mode,
    uploadMs: positive(record.marksMs.upload_complete),
    decodeMs,
    firstUsefulMs: positive(record.marksMs.first_useful_screen),
    transferMs: duration(record.marksMs, 'transfer_start', 'transfer_complete'),
    hydrateMs: duration(record.marksMs, 'hydrate_start', 'hydrate_complete'),
    renderMs: duration(record.marksMs, 'hydrate_complete', 'full_tab_ready'),
    decoderMeasuredMs,
    unattributedDecodeMs: Math.max(0, decodeMs - decoderMeasuredMs),
    decodeSteps: steps,
    serverDetailMs: { ...record.detailMs },
  };
}
