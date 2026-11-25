/**
 * Lightweight UI formatting helpers extracted from fmSaveHydrator so UI cards
 * and cold-start views do not pull the full 1,900-line hydration engine into
 * the initial entry bundle.
 */

export function shouldDefaultFastSync(_viewportWidth: number): boolean {
  // Always default to Full Sync on mobile and desktop so 100% of save data
  // (season stats, Last-5 form, match xG, market scan, career history) is captured.
  // Fast Sync remains available as an explicit manual toggle.
  return false;
}

const STEP_TIMING_LABELS: Record<string, string> = {
  step_1_open: 'Open Save',
  step_2_players: 'Squad (52 Attrs)',
  step_3_1_finances: '2.1 Finances',
  step_3_2_staff: '2.2 Staff',
  step_3_3_tactics_mentoring: '2.3 Tactics/Mentoring',
  step_5_fixtures: '3.1 Fixtures',
  step_5_1_fixtures: '3.1 Fixtures',
  step_5_2_league_table: '3.2 League Table',
  step_6_league_table: '3.2 League Table',
  step_3_3_injuries: '4.1 Global Injuries',
  step_3_3_facilities: '4.2 Facilities',
  step_3_3_competition_rules: '4.3 Comp Rules',
  step_3_3_transfer_windows: '4.4 Transfer Windows',
  step_3_3_secondary_ops: '4.5 Secondary Ops',
  step_3_3_club_ops: '4.x Club Ops',
  step_3_4_market_scan: '4.6 In-Game Shortlist',
  step_4_team_match_stats: '4.7 Team Match Stats',
  step_4_1_season_stats: '4.8 Season Stats',
  step_4_2_player_match_stats: '4.9 Match Form',
  step_4_3_season_history: '4.10 Career History',
  step_4_4_contracts_and_suspensions: '4.11 Contracts/Bans',
  totalDecodeMs: 'Total',
};

export function formatStepTimingLabel(stepKey: string): string {
  return STEP_TIMING_LABELS[stepKey] || stepKey.replace(/_/g, ' ');
}

export type ChatReasoningModeOption = 'fast_lite' | 'deep_high' | 'max_xhigh';

export const DEFAULT_CHAT_REASONING_MODE: ChatReasoningModeOption = 'fast_lite';

/**
 * Quota-smart routing for Free-tier Gemini keys:
 * - First .fm save import audits and Save-to-Save Journey comparisons automatically
 *   use the best model (`deep_high`, or `max_xhigh` if explicitly selected).
 * - Everyday interactive chat defaults to `fast_lite` (Fast Co-Pilot) for higher
 *   Free-tier quota and faster replies while still honouring manual mode switches.
 */
export function resolveChatTurnReasoningMode(
  selectedMode: ChatReasoningModeOption,
  options?: {
    isFmSaveImport?: boolean;
    isJourneyComparison?: boolean;
    explicitOverride?: ChatReasoningModeOption;
  }
): ChatReasoningModeOption {
  if (options?.explicitOverride) {
    return options.explicitOverride;
  }
  if (options?.isFmSaveImport || options?.isJourneyComparison) {
    return selectedMode === 'max_xhigh' ? 'max_xhigh' : 'deep_high';
  }
  return selectedMode;
}

export function formatAnalystModeLabel(mode: string): string {
  if (mode === 'max_xhigh') return 'Max Synthesis';
  if (mode === 'fast_lite') return 'Fast Co-Pilot';
  return 'Deep Analyst';
}

export function trimTrailingPeriod(text: string): string {
  return text.trim().replace(/\.+$/, '');
}

export interface CompactFmImportDeltaInput {
  fileName: string;
  clubName?: string;
  saveDateLabel?: string;
  changedPlayers?: Array<{ name: string; changes?: string[] }>;
  removedPlayers?: Array<string | { name: string }>;
  newMatchesCount?: number;
  extractionWarnings?: string[];
}

/**
 * Builds a concise (~300–1,200 char) delta summary for a newly decoded .fm save
 * so `/api/fm27/tactical-chat` does not send a redundant 17,500-char copy of the
 * full squad/matches alongside `liveAppContext`.
 */
export function buildCompactFmImportDeltaContext(
  input: CompactFmImportDeltaInput
): string {
  const lines: string[] = [
    `[NEWLY IMPORTED .FM SAVE DELTA — ${input.fileName}]`,
    `Club: ${input.clubName || 'Managed Club'} | In-Game Date: ${input.saveDateLabel || '--'}`,
    `Database Sync: ${input.changedPlayers?.length ?? 0} player(s) updated, ${input.removedPlayers?.length ?? 0} removed, ${input.newMatchesCount ?? 0} new match(es) logged.`,
  ];

  const changed = input.changedPlayers ?? [];
  if (changed.length > 0) {
    const sample = changed.slice(0, 8).map((cp) => {
      const detail =
        Array.isArray(cp.changes) && cp.changes.length > 0
          ? cp.changes.slice(0, 3).join(', ')
          : 'updated';
      return `- ${cp.name}: ${detail}`;
    });
    lines.push('Notable Player Diffs:', ...sample);
    if (changed.length > 8) {
      lines.push(`(+${changed.length - 8} more updated players in live context)`);
    }
  }

  const warnings = (input.extractionWarnings ?? []).filter(Boolean).slice(0, 3);
  if (warnings.length > 0) {
    lines.push('Reader Notes:', ...warnings.map((w) => `- ${w.slice(0, 140)}`));
  }

  lines.push(
    'Full squad, War Room XI, Best XI, Depth Chart, Transfers, Set-Pieces, Recent Matches, Governance & Journey are already hydrated in LIVE IN-APP COMMAND HUB CONTEXT.'
  );

  return lines.join('\n').slice(0, 1800);
}

