/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import type { MatchLogEntry, PlayerRecord, StaffRecord } from '../types/fm27';
import type { HydratedSaveState } from '../utils/fmSaveHydrator';
import { computeCompetitiveSummary } from '../utils/competitiveSummary';
import { buildFinancesPanelFromSave } from '../utils/clubFinances';

interface CampaignSummaryOptions {
  players: PlayerRecord[];
  matches: MatchLogEntry[];
  staff: StaffRecord[];
  saveDate: string;
  balance: string;
  wageSpend: string;
  hydratedFmSave: HydratedSaveState | null;
}

/**
 * The numbers the shell shows that are computed from the campaign rather than
 * read from the save: the league record, the payroll, the manual-match count,
 * the club name and the figures the shared report is built from.
 */
export function useCampaignSummaries({
  players,
  matches,
  staff,
  saveDate,
  balance,
  wageSpend,
  hydratedFmSave,
}: CampaignSummaryOptions) {
  const summary = useMemo(() => computeCompetitiveSummary(matches, saveDate), [matches, saveDate]);

  const playerBasicWeekly = useMemo(
    () => players.reduce((sum, player) => sum + (player.wagePw || 0), 0),
    [players]
  );

  // Chat-logged matches are not part of the .fm snapshot, so the live header
  // must prefer the recomputed summary over the stale save labels.
  const manualMatchCount = useMemo(
    () => matches.filter((match) => match.source === 'CHAT').length,
    [matches]
  );

  const shareFinancesPanel = useMemo(
    () =>
      buildFinancesPanelFromSave({
        hydratedSave: hydratedFmSave,
        players,
        staff,
        balanceLabel: balance,
        wageSpendLabel: wageSpend,
      }),
    [hydratedFmSave, players, staff, balance, wageSpend]
  );

  const clubName = hydratedFmSave?.decodedPayload?.meta?.clubName || 'FM27 Command Hub';
  const managerName = hydratedFmSave?.decodedPayload?.meta?.managerName || '--';

  return {
    summary,
    playerBasicWeekly,
    manualMatchCount,
    hasManualMatches: manualMatchCount > 0,
    shareFinancesPanel,
    clubName,
    managerName,
  };
}
