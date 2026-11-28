/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { loadTrackedScoutTargets, type FmHubPersistedState } from '../services/fmStorage';
import type {
  MatchLogEntry,
  PlayerRecord,
  RecruitmentCase,
  ShortlistRecord,
  StaffRecord,
} from '../types/fm27';
import type { RecruitmentTarget } from '../types/fmSave';
import type { FormationPresetKey } from '../utils/bestXiSolver';
import {
  campaignFromBackup,
  campaignPersistSnapshot,
  clearedCampaignState,
  initialCampaignState,
  restorePersistedCampaign,
  type CampaignPersistSnapshot,
  type CampaignState,
} from '../utils/campaignState';
import type { HydratedSaveState } from '../utils/fmSaveHydrator';
import type { PersistedCustomSlot } from '../services/fmStorage';

export interface CampaignStateOwner {
  campaign: CampaignState;
  snapshot: CampaignPersistSnapshot;
  /** A snapshot read back from storage: a field it does not carry keeps what is on screen. */
  restoreSnapshot: (saved: FmHubPersistedState) => void;
  /** A backup file is a whole campaign, so it replaces the squad and the save outright. */
  restoreBackup: (imported: FmHubPersistedState) => void;
  clearCampaign: () => void;
  setPlayers: Dispatch<SetStateAction<PlayerRecord[]>>;
  setMatches: Dispatch<SetStateAction<MatchLogEntry[]>>;
  setStaff: Dispatch<SetStateAction<StaffRecord[]>>;
  setRecruitmentCases: Dispatch<SetStateAction<RecruitmentCase[]>>;
  setShortlists: Dispatch<SetStateAction<ShortlistRecord[]>>;
  setTrackedTargets: Dispatch<SetStateAction<RecruitmentTarget[]>>;
  setSaveDate: Dispatch<SetStateAction<string>>;
  setNextFixture: Dispatch<SetStateAction<string>>;
  setLeagueStandingSub: Dispatch<SetStateAction<string>>;
  setWageSpend: Dispatch<SetStateAction<string>>;
  setBalance: Dispatch<SetStateAction<string>>;
  setHydratedFmSave: Dispatch<SetStateAction<HydratedSaveState | null>>;
  setActiveShape: Dispatch<SetStateAction<FormationPresetKey>>;
  setCustomSlots: Dispatch<SetStateAction<PersistedCustomSlot[]>>;
  setApplyToAnalystOnly: Dispatch<SetStateAction<boolean>>;
}

/**
 * The campaign state owner. The squad, match log, staff, recruitment lists,
 * header labels and the decoded save change together, so one hook holds them
 * and offers three whole-campaign writes — restore a snapshot, restore a
 * backup, clear everything — instead of each caller setting fifteen fields.
 */
export function useCampaignState(): CampaignStateOwner {
  const [opening] = useState(initialCampaignState);
  const [players, setPlayers] = useState<PlayerRecord[]>(opening.players);
  const [matches, setMatches] = useState<MatchLogEntry[]>(opening.matches);
  const [staff, setStaff] = useState<StaffRecord[]>(opening.staff);
  const [recruitmentCases, setRecruitmentCases] = useState<RecruitmentCase[]>(
    opening.recruitmentCases
  );
  const [shortlists, setShortlists] = useState<ShortlistRecord[]>(opening.shortlists);
  const [trackedTargets, setTrackedTargets] = useState<RecruitmentTarget[]>(() =>
    loadTrackedScoutTargets()
  );
  const [saveDate, setSaveDate] = useState<string>(opening.saveDate);
  const [nextFixture, setNextFixture] = useState<string>(opening.nextFixture);
  const [leagueStandingSub, setLeagueStandingSub] = useState<string>(opening.leagueStandingSub);
  const [wageSpend, setWageSpend] = useState<string>(opening.wageSpend);
  const [balance, setBalance] = useState<string>(opening.balance);
  const [hydratedFmSave, setHydratedFmSave] = useState<HydratedSaveState | null>(
    opening.hydratedFmSave
  );
  const [activeShape, setActiveShape] = useState<FormationPresetKey>(opening.activeShape);
  const [customSlots, setCustomSlots] = useState<PersistedCustomSlot[]>(opening.customSlots);
  const [applyToAnalystOnly, setApplyToAnalystOnly] = useState<boolean>(
    opening.applyToAnalystOnly
  );

  const campaign = useMemo<CampaignState>(
    () => ({
      players,
      matches,
      staff,
      recruitmentCases,
      shortlists,
      trackedTargets,
      saveDate,
      nextFixture,
      leagueStandingSub,
      wageSpend,
      balance,
      hydratedFmSave,
      activeShape,
      customSlots,
      applyToAnalystOnly,
    }),
    [
      players,
      matches,
      staff,
      recruitmentCases,
      shortlists,
      trackedTargets,
      saveDate,
      nextFixture,
      leagueStandingSub,
      wageSpend,
      balance,
      hydratedFmSave,
      activeShape,
      customSlots,
      applyToAnalystOnly,
    ]
  );

  // The write callbacks are stable, so they read the newest campaign through a ref.
  const campaignRef = useRef(campaign);
  campaignRef.current = campaign;

  const applyCampaign = useCallback((next: CampaignState) => {
    setPlayers(next.players);
    setMatches(next.matches);
    setStaff(next.staff);
    setRecruitmentCases(next.recruitmentCases);
    setShortlists(next.shortlists);
    setTrackedTargets(next.trackedTargets);
    setSaveDate(next.saveDate);
    setNextFixture(next.nextFixture);
    setLeagueStandingSub(next.leagueStandingSub);
    setWageSpend(next.wageSpend);
    setBalance(next.balance);
    setHydratedFmSave(next.hydratedFmSave);
    setActiveShape(next.activeShape);
    setCustomSlots(next.customSlots);
    setApplyToAnalystOnly(next.applyToAnalystOnly);
  }, []);

  const restoreSnapshot = useCallback(
    (saved: FmHubPersistedState) => {
      applyCampaign(restorePersistedCampaign(campaignRef.current, saved));
    },
    [applyCampaign]
  );

  const restoreBackup = useCallback(
    (imported: FmHubPersistedState) => {
      applyCampaign(campaignFromBackup(imported, campaignRef.current));
    },
    [applyCampaign]
  );

  const clearCampaign = useCallback(() => {
    applyCampaign(clearedCampaignState());
  }, [applyCampaign]);

  const snapshot = useMemo(() => campaignPersistSnapshot(campaign), [campaign]);

  return {
    campaign,
    snapshot,
    restoreSnapshot,
    restoreBackup,
    clearCampaign,
    setPlayers,
    setMatches,
    setStaff,
    setRecruitmentCases,
    setShortlists,
    setTrackedTargets,
    setSaveDate,
    setNextFixture,
    setLeagueStandingSub,
    setWageSpend,
    setBalance,
    setHydratedFmSave,
    setActiveShape,
    setCustomSlots,
    setApplyToAnalystOnly,
  };
}
