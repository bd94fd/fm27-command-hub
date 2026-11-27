/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { ParsedPlayerDelta, SquadMergeResult } from '../utils/fmFileImporter';
import type { PlayerRecord } from '../types/fm27';
import type { PlayerAutoUpdate } from '../components/AutoSyncWorkspace';

export interface SquadDeltaUpdatesOptions {
  players: PlayerRecord[];
  setPlayers: Dispatch<SetStateAction<PlayerRecord[]>>;
}

export interface SquadDeltaUpdates {
  bulkMergePlayers: (parsedPlayers: ParsedPlayerDelta[]) => Promise<SquadMergeResult>;
  applyPlayerUpdates: (updates: PlayerAutoUpdate[]) => void;
}

/** Applies parsed or model-suggested player changes onto the live squad. */
export function useSquadDeltaUpdates({
  players,
  setPlayers,
}: SquadDeltaUpdatesOptions): SquadDeltaUpdates {
  const depsRef = useRef({ players, setPlayers });
  depsRef.current = { players, setPlayers };

  const bulkMergePlayers = useCallback(async (parsedPlayers: ParsedPlayerDelta[]) => {
    const { mergeParsedPlayersIntoSquad } = await import('../utils/fmFileImporter');
    const { players: current, setPlayers: update } = depsRef.current;
    const result = mergeParsedPlayersIntoSquad(current, parsedPlayers);
    if (result.matchedCount > 0) update(result.updatedSquad);
    return result;
  }, []);

  const applyPlayerUpdates = useCallback((updates: PlayerAutoUpdate[]) => {
    if (!updates || updates.length === 0) return;
    void import('../utils/tacticalAnalystContext').then(({ applyAnalystPlayerUpdates }) => {
      depsRef.current.setPlayers(
        (prev) => applyAnalystPlayerUpdates(prev, updates).updatedPlayers
      );
    });
  }, []);

  return { bulkMergePlayers, applyPlayerUpdates };
}
