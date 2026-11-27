/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The recruitment and shortlist domain: tracked scout targets, recruitment
 * cases and shortlists, and the handlers that change them. The state itself
 * stays in App.tsx, which owns persistence, so the hook takes the setters.
 */

import { useCallback } from 'react';
import { feedback } from '../utils/feedbackBus';
import { toggleTrackedScoutTarget } from '../services/fmStorage';
import { buildScoutTargetFromPlayer } from '../utils/scoutTargetFromPlayer';
import {
  addPlayerToShortlist as addPlayerToList,
  appendRecruitmentCase,
  appendShortlist,
  patchRecruitmentCase,
  removePlayerFromShortlist as removePlayerFromList,
  removeRecruitmentCase,
  removeShortlist,
} from '../utils/recruitmentLists';
import type { ActiveTab } from './useAppNavigation';
import type { HydratedSaveState } from '../utils/fmSaveHydrator';
import type { PlayerRecord, RecruitmentCase, ShortlistRecord } from '../types/fm27';
import type { RecruitmentTarget } from '../types/fmSave';

export interface UseRecruitmentStateOptions {
  recruitmentCases: RecruitmentCase[];
  setRecruitmentCases: React.Dispatch<React.SetStateAction<RecruitmentCase[]>>;
  shortlists: ShortlistRecord[];
  setShortlists: React.Dispatch<React.SetStateAction<ShortlistRecord[]>>;
  trackedTargets: RecruitmentTarget[];
  setTrackedTargets: React.Dispatch<React.SetStateAction<RecruitmentTarget[]>>;
  hydratedFmSave: HydratedSaveState | null;
  onSelectTab: (tab: ActiveTab) => void;
  onSelectPlayer: (player: PlayerRecord | null) => void;
}

export interface RecruitmentActions {
  addCase: (entry: Omit<RecruitmentCase, 'id' | 'updatedAt'>) => void;
  trackPlayer: (player: PlayerRecord) => void;
  updateCase: (id: string, patch: Partial<RecruitmentCase>) => void;
  deleteCase: (id: string) => void;
  createShortlist: (name: string, description: string) => void;
  deleteShortlist: (id: string) => void;
  addPlayerToShortlist: (shortlistId: string, playerId: string) => void;
  removePlayerFromShortlist: (shortlistId: string, playerId: string) => void;
  toggleTrackTarget: (target: RecruitmentTarget) => boolean;
  toggleTrackPlayerFromModal: (player: PlayerRecord) => void;
}

export function useRecruitmentState(options: UseRecruitmentStateOptions): RecruitmentActions {
  const {
    recruitmentCases,
    setRecruitmentCases,
    setShortlists,
    trackedTargets,
    setTrackedTargets,
    hydratedFmSave,
    onSelectTab,
    onSelectPlayer,
  } = options;

  const addCase = (entry: Omit<RecruitmentCase, 'id' | 'updatedAt'>) => {
    const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setRecruitmentCases((prev) =>
      appendRecruitmentCase(prev, entry, id, new Date().toISOString())
    );
  };

  const updateCase = (id: string, patch: Partial<RecruitmentCase>) => {
    setRecruitmentCases((prev) =>
      patchRecruitmentCase(prev, id, patch, new Date().toISOString())
    );
  };

  const deleteCase = (id: string) => {
    setRecruitmentCases((prev) => removeRecruitmentCase(prev, id));
  };

  const createShortlist = (name: string, description: string) => {
    const id = `sl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setShortlists((prev) =>
      appendShortlist(prev, name, description, id, new Date().toISOString())
    );
  };

  const deleteShortlist = (id: string) => {
    setShortlists((prev) => removeShortlist(prev, id));
  };

  const addPlayerToShortlist = (shortlistId: string, playerId: string) => {
    setShortlists((prev) => addPlayerToList(prev, shortlistId, playerId));
  };

  const removePlayerFromShortlist = (shortlistId: string, playerId: string) => {
    setShortlists((prev) => removePlayerFromList(prev, shortlistId, playerId));
  };

  const toggleTrackTarget = useCallback(
    (target: RecruitmentTarget): boolean => {
      const previous = trackedTargets;
      const { targets: next, tracked } = toggleTrackedScoutTarget(target, previous);
      setTrackedTargets(next);
      if (tracked) {
        feedback.success(`Added ${target.name} to Shortlist`);
      } else {
        feedback.undo(`Removed ${target.name} from Shortlist`, () =>
          setTrackedTargets(previous)
        );
      }
      return tracked;
    },
    [trackedTargets, setTrackedTargets]
  );

  const toggleTrackPlayerFromModal = (player: PlayerRecord) => {
    const scoutPool =
      hydratedFmSave?.recruitmentTargets ??
      hydratedFmSave?.decodedPayload?.recruitmentTargets ??
      [];
    toggleTrackTarget(buildScoutTargetFromPlayer(player, scoutPool));
  };

  const trackPlayer = (player: PlayerRecord) => {
    const exists = recruitmentCases.some(
      (c) =>
        c.playerId === player.id ||
        c.playerName.toLowerCase() === player.name.toLowerCase()
    );
    if (!exists) {
      addCase({
        playerId: player.id,
        playerName: player.name,
        position: player.position,
        age: player.age,
        currentClub: hydratedFmSave?.decodedPayload?.meta?.clubName || 'Managed Squad',
        targetIpRole: player.ipRole,
        targetOopRole: player.oopRole,
        interest: 'Interested',
        stage: 'Shortlisted',
        estimatedFee: 'In-Squad / Renewal',
        estimatedWagePw: player.wagePw,
        expiresOn: player.expires,
        notes: player.notes,
      });
    }
    onSelectPlayer(null);
    onSelectTab('recruitment');
  };

  return {
    addCase,
    trackPlayer,
    updateCase,
    deleteCase,
    createShortlist,
    deleteShortlist,
    addPlayerToShortlist,
    removePlayerFromShortlist,
    toggleTrackTarget,
    toggleTrackPlayerFromModal,
  };
}
