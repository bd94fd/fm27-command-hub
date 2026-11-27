/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CompactBinaryDiffSnapshot } from './fm27BinaryDictionary';
import type { ClubGovernanceState } from '../types/fmSave';
import type { DecodedFmSavePayload, HydratedSaveState } from './fmSaveHydrator';

/** The part of a save history point that comes from the save itself. */
export interface SaveHistoryPointDraft {
  saveName: string;
  inGameDate: string;
  clubName: string;
  players: HydratedSaveState['updatedSquad'];
  matches: HydratedSaveState['updatedMatches'];
  balance?: string;
  balanceNum: number | null;
  monthlyBurnRate: number | null;
  wagePayrollWeekly: number | null;
  wageBudgetWeekly: number | null;
  leaguePosition: number | null;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  points: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  tacticName: string | null;
  tacticFormation: string | null;
  tacticMentality: string | null;
  activeInjuriesCount: number;
  activeSuspensionsCount: number;
  promisesAtRiskCount: number | null;
  managerExpires: string | null;
  boardGrade: string | null;
  supporterGrade: string | null;
  binaryDiffSnapshot: CompactBinaryDiffSnapshot | null;
}

/** `#3 · 12 GP` and `3` both read as 3; anything else is no position at all. */
export function parseLeaguePosition(label: string | null | undefined): number | null {
  const parsed = Number((label || '').match(/^#?(\d+)/)?.[1] ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function countPromisesAtRisk(
  governance: ClubGovernanceState | null | undefined
): number | null {
  return (
    governance?.playerPromiseAudits.filter(
      (promise) => promise.status === 'breached' || promise.status === 'at_risk'
    ).length ?? null
  );
}

export function buildBinaryDiffSnapshot(
  hydrated: HydratedSaveState,
  decoded: DecodedFmSavePayload
): CompactBinaryDiffSnapshot | null {
  if (!decoded.tactics?.length && !decoded.binaryForensics) return null;
  return {
    label: `${hydrated.saveDateLabel} · ${decoded.meta.fileName || decoded.meta.clubName || 'FM27 Save'}`,
    inGameDate: hydrated.saveDateLabel,
    fmBuild: decoded.binaryForensics?.fmBuild || decoded.meta.build || undefined,
    tactics: decoded.tactics || [],
    binaryForensics: decoded.binaryForensics ?? null,
  };
}

/**
 * Everything a Journey report keeps from one save, in one place, so the cold
 * start path and the import path cannot record different fields.
 */
export function buildSaveHistoryPointDraft(
  hydrated: HydratedSaveState,
  decoded: DecodedFmSavePayload
): SaveHistoryPointDraft {
  const standing = decoded.leagueStanding;
  return {
    saveName: decoded.meta.fileName || decoded.meta.saveName || 'fm27-save',
    inGameDate: hydrated.saveDateLabel,
    clubName: decoded.meta.clubName || 'Managed Club',
    players: hydrated.updatedSquad,
    matches: hydrated.updatedMatches,
    balance: hydrated.balanceLabel || undefined,
    balanceNum: hydrated.canonicalBalanceNum ?? decoded.finances?.balance ?? null,
    monthlyBurnRate: hydrated.financialRunway?.monthlyBurnRate ?? null,
    wagePayrollWeekly: decoded.finances?.wagePayrollWeekly ?? null,
    wageBudgetWeekly: decoded.finances?.wageBudgetWeekly ?? null,
    leaguePosition: standing?.position ?? parseLeaguePosition(hydrated.leagueStandingLabel),
    played: standing?.played ?? null,
    won: standing?.won ?? null,
    drawn: standing?.drawn ?? null,
    lost: standing?.lost ?? null,
    points: standing?.points ?? null,
    goalsFor: standing?.goalsFor ?? null,
    goalsAgainst: standing?.goalsAgainst ?? null,
    tacticName: hydrated.lastMatchTactic?.tacticName ?? null,
    tacticFormation: hydrated.lastMatchTactic?.inPossessionFormation ?? null,
    tacticMentality: hydrated.lastMatchTactic?.mentality ?? null,
    activeInjuriesCount: decoded.activeInjuries?.length ?? 0,
    activeSuspensionsCount: hydrated.activeSuspensions?.length ?? 0,
    promisesAtRiskCount: countPromisesAtRisk(hydrated.governance),
    managerExpires: hydrated.governance?.managerContract.expires ?? null,
    boardGrade: hydrated.governance?.boardConfidence.grade ?? null,
    supporterGrade: hydrated.governance?.supporterConfidence.grade ?? null,
    binaryDiffSnapshot: buildBinaryDiffSnapshot(hydrated, decoded),
  };
}
