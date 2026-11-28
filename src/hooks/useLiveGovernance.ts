/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import type { ClubGovernanceState, LastMatchTacticBlueprint } from '../types/fmSave';
import type { PlayerRecord } from '../types/fm27';
import type { HydratedSaveState } from '../utils/fmSaveHydrator';

interface LiveGovernanceOptions {
  hydratedFmSave: HydratedSaveState | null;
  players: PlayerRecord[];
  dictionaryVersion: number;
}

/**
 * The governance and last-match tactic the shell shows.
 *
 * The save already carries both, so they are exposed immediately. The decoded
 * payload can then sharpen them, which needs three heavy modules, so that runs
 * as a dynamic import after the first paint and falls back to the save values
 * if it cannot.
 */
export function useLiveGovernance({ hydratedFmSave, players, dictionaryVersion }: LiveGovernanceOptions) {
  const [derivedGovernance, setDerivedGovernance] = useState<ClubGovernanceState | null>(null);
  const [derivedLastMatchTactic, setDerivedLastMatchTactic] = useState<LastMatchTacticBlueprint | null>(null);

  useEffect(() => {
    if (!hydratedFmSave?.decodedPayload) {
      setDerivedGovernance(null);
      setDerivedLastMatchTactic(null);
      return;
    }
    let cancelled = false;
    void Promise.all([
      import('../utils/clubGovernanceAndTactics'),
      import('../utils/fm27BinaryDictionary'),
      import('../utils/fm27TacticRoleInference'),
    ])
      .then(
        ([
          { buildClubGovernanceState, buildLastMatchTacticBlueprint },
          { loadFm27BinaryDictionary },
          { loadTacticRoleOverrides },
        ]) => {
          if (cancelled || !hydratedFmSave.decodedPayload) return;
          const dict = loadFm27BinaryDictionary();
          setDerivedGovernance(buildClubGovernanceState(hydratedFmSave.decodedPayload, players, dict));
          setDerivedLastMatchTactic(
            buildLastMatchTacticBlueprint(
              hydratedFmSave.decodedPayload,
              players,
              0,
              loadTacticRoleOverrides(),
              dict
            ) ??
              hydratedFmSave.lastMatchTactic ??
              null
          );
        }
      )
      .catch(() => {
        // fallback cleanly to hydratedFmSave persisted governance/tactic
      });
    return () => {
      cancelled = true;
    };
  }, [hydratedFmSave, players, dictionaryVersion]);

  const liveGovernance = hydratedFmSave ? derivedGovernance ?? hydratedFmSave.governance ?? null : null;
  const liveLastMatchTactic = hydratedFmSave
    ? derivedLastMatchTactic ?? hydratedFmSave.lastMatchTactic ?? null
    : null;

  return { liveGovernance, liveLastMatchTactic };
}
