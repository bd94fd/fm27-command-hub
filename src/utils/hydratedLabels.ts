/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HydratedSaveState } from './fmSaveHydrator';

export interface HydratedHeaderLabels {
  saveDate: string;
  nextFixture?: string;
  leagueStanding?: string;
  wageSpend?: string;
  balance?: string;
}

/**
 * Which header labels a freshly hydrated save may write.
 *
 * An interim checkpoint arrives before fixtures and stats are parsed, so its
 * placeholder `--` must not overwrite a real value the previous save already
 * showed. The final pass may write anything the save carries.
 */
export function selectHydratedHeaderLabels(
  hydrated: HydratedSaveState,
  isInterim: boolean
): HydratedHeaderLabels {
  const keep = (value: string | null | undefined) =>
    value && (!isInterim || value !== '--') ? value : undefined;
  return {
    saveDate: hydrated.saveDateLabel,
    nextFixture: keep(hydrated.nextFixtureLabel),
    leagueStanding: keep(hydrated.leagueStandingLabel),
    wageSpend: hydrated.wageComplianceLabel || undefined,
    balance: hydrated.balanceLabel || undefined,
  };
}
