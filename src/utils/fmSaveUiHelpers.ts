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
  step_3_4_market_scan: '4.6 Market Scan',
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
