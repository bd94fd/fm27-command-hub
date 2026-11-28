/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { COMPETITIVE_MATCH_LOGS } from '../data/matchAndTacticsData';
import { EMPTY_CLUB_META, SQUAD_PLAYERS } from '../data/squadData';
import type { PersistedCustomSlot, FmHubPersistedState } from '../services/fmStorage';
import type {
  MatchLogEntry,
  PlayerRecord,
  RecruitmentCase,
  ShortlistRecord,
  StaffRecord,
} from '../types/fm27';
import type { RecruitmentTarget } from '../types/fmSave';
import type { FormationPresetKey } from './bestXiSolver';
import type { HydratedSaveState } from './fmSaveHydrator';

/**
 * Everything a save replaces in one go: the squad, the match log, the staff
 * directory, the recruitment lists, the header labels and the decoded save.
 * Kept together because every writer of one also writes the others — a save
 * that lands with a new squad but the old staff is not a state the app has.
 */
export interface CampaignState {
  players: PlayerRecord[];
  matches: MatchLogEntry[];
  staff: StaffRecord[];
  recruitmentCases: RecruitmentCase[];
  shortlists: ShortlistRecord[];
  trackedTargets: RecruitmentTarget[];
  saveDate: string;
  nextFixture: string;
  leagueStandingSub: string;
  wageSpend: string;
  balance: string;
  hydratedFmSave: HydratedSaveState | null;
  activeShape: FormationPresetKey;
  customSlots: PersistedCustomSlot[];
  applyToAnalystOnly: boolean;
}

export const DEFAULT_ACTIVE_SHAPE: FormationPresetKey = '4-3-3 DM Wide';

/** The demo squad the Hub opens with before any save is imported. */
export function initialCampaignState(): CampaignState {
  return {
    players: SQUAD_PLAYERS,
    matches: COMPETITIVE_MATCH_LOGS,
    staff: [],
    recruitmentCases: [],
    shortlists: [],
    trackedTargets: [],
    saveDate: EMPTY_CLUB_META.saveDate,
    nextFixture: EMPTY_CLUB_META.nextFixture,
    leagueStandingSub: '--',
    wageSpend: EMPTY_CLUB_META.wageSpend,
    balance: EMPTY_CLUB_META.balance,
    hydratedFmSave: null,
    activeShape: DEFAULT_ACTIVE_SHAPE,
    customSlots: [],
    applyToAnalystOnly: false,
  };
}

/** What a full reset leaves behind: no squad, no matches, no save, no plans. */
export function clearedCampaignState(): CampaignState {
  return {
    ...initialCampaignState(),
    players: [],
    matches: [],
  };
}

/**
 * Restores a snapshot read back from storage. A field the snapshot does not
 * carry keeps whatever is on screen, so an older snapshot written before a
 * field existed cannot blank it. Unchanged fields keep their identity, which
 * lets React bail out of the re-render.
 */
export function restorePersistedCampaign(
  current: CampaignState,
  saved: FmHubPersistedState
): CampaignState {
  return {
    players: Array.isArray(saved.players) ? saved.players : current.players,
    matches: Array.isArray(saved.matches) ? saved.matches : current.matches,
    staff: saved.staff || current.staff,
    recruitmentCases: saved.recruitmentCases || current.recruitmentCases,
    shortlists: saved.shortlists || current.shortlists,
    trackedTargets: current.trackedTargets,
    saveDate: saved.saveDate || current.saveDate,
    nextFixture: saved.nextFixture || current.nextFixture,
    leagueStandingSub: saved.leagueStandingSub || current.leagueStandingSub,
    wageSpend: saved.wageSpend || current.wageSpend,
    balance: saved.balance || current.balance,
    hydratedFmSave: saved.hydratedFmSave || current.hydratedFmSave,
    activeShape: saved.activeShape || current.activeShape,
    customSlots: saved.customSlots || current.customSlots,
    applyToAnalystOnly:
      typeof saved.applyToAnalystOnly === 'boolean'
        ? saved.applyToAnalystOnly
        : current.applyToAnalystOnly,
  };
}

/**
 * A backup file is a whole campaign, so it replaces the squad, matches and save
 * outright instead of merging. Only the plan fields keep a fallback, because an
 * old backup has no way to carry them.
 */
export function campaignFromBackup(
  imported: FmHubPersistedState,
  current: CampaignState
): CampaignState {
  return {
    players: imported.players,
    matches: imported.matches,
    staff: imported.staff || [],
    recruitmentCases: imported.recruitmentCases || [],
    shortlists: imported.shortlists || [],
    trackedTargets: current.trackedTargets,
    saveDate: imported.saveDate,
    nextFixture: imported.nextFixture,
    leagueStandingSub: imported.leagueStandingSub,
    wageSpend: imported.wageSpend,
    balance: imported.balance,
    hydratedFmSave: imported.hydratedFmSave,
    activeShape: imported.activeShape || current.activeShape,
    customSlots: imported.customSlots ?? [],
    applyToAnalystOnly: Boolean(imported.applyToAnalystOnly),
  };
}

/** The shape written to localStorage, IndexedDB and the backup file. */
export function campaignPersistSnapshot(state: CampaignState) {
  return {
    saveDate: state.saveDate,
    nextFixture: state.nextFixture,
    leagueStandingSub: state.leagueStandingSub,
    wageSpend: state.wageSpend,
    balance: state.balance,
    clubName: state.hydratedFmSave?.decodedPayload?.meta?.clubName,
    players: state.players,
    matches: state.matches,
    staff: state.staff,
    recruitmentCases: state.recruitmentCases,
    shortlists: state.shortlists,
    hydratedFmSave: state.hydratedFmSave,
    activeShape: state.activeShape,
    customSlots: state.customSlots,
    applyToAnalystOnly: state.applyToAnalystOnly,
  };
}

export type CampaignPersistSnapshot = ReturnType<typeof campaignPersistSnapshot>;
