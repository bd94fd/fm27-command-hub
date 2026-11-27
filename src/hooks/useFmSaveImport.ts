/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { recordPreviousSnapshot } from '../services/fmStorage';
import type { DeepJourneyReport } from '../services/saveCache';
import type { MatchLogEntry, PlayerRecord, StaffRecord } from '../types/fm27';
import { selectJourneyPair } from '../utils/saveJourneyTimeline';
import { selectHydratedHeaderLabels } from '../utils/hydratedLabels';
import { buildSaveHistoryPointDraft } from '../utils/saveHistoryPoint';
import { finishSaveLoadBenchmark, markSaveLoadStage } from '../utils/saveLoadBenchmark';
import { emitFeedback } from '../utils/feedbackBus';
import type { BackgroundSyncStatus } from '../components/shell/backgroundSync';
import type { DecodedFmSavePayload, HydratedSaveState } from '../utils/fmSaveHydrator';

export interface PreSyncBaseline {
  saveDate: string;
  clubName: string;
  players: PlayerRecord[];
  matches: MatchLogEntry[];
}

export interface FmSaveImportDeps {
  players: PlayerRecord[];
  matches: MatchLogEntry[];
  saveDate: string;
  hydratedFmSave: HydratedSaveState | null;
  setPlayers: Dispatch<SetStateAction<PlayerRecord[]>>;
  setStaff: Dispatch<SetStateAction<StaffRecord[]>>;
  setMatches: Dispatch<SetStateAction<MatchLogEntry[]>>;
  setSaveDate: Dispatch<SetStateAction<string>>;
  setNextFixture: Dispatch<SetStateAction<string>>;
  setLeagueStandingSub: Dispatch<SetStateAction<string>>;
  setWageSpend: Dispatch<SetStateAction<string>>;
  setBalance: Dispatch<SetStateAction<string>>;
  setHydratedFmSave: Dispatch<SetStateAction<HydratedSaveState | null>>;
  setSnapshotResetNonce: Dispatch<SetStateAction<number>>;
  setLatestJourneyReport: (report: DeepJourneyReport | null) => void;
  setBackgroundSyncStatus: (status: BackgroundSyncStatus | null) => void;
  showGlobalToast: (message: string) => void;
}

export interface FmSaveImport {
  applyDecodedSave: (
    decoded: DecodedFmSavePayload,
    options?: { isInterimCheckpoint?: boolean; benchmarkId?: string }
  ) => Promise<HydratedSaveState>;
  /** The save that was on screen when a background sync started, kept until it finishes. */
  preSyncBaselineRef: MutableRefObject<PreSyncBaseline | null>;
  /** The Journey report write for the last import, so a request can wait for it. */
  latestJourneyPromiseRef: MutableRefObject<Promise<DeepJourneyReport | null> | null>;
}

/**
 * Turns a decoded .fm payload into app state.
 *
 * A large save arrives twice: an interim checkpoint with squad, staff and
 * tactics, then a final pass with fixtures and stats. The interim pass keeps the
 * pre-sync baseline so the final pass can diff against what the user was looking
 * at, and it must not overwrite real header values with placeholders.
 */
export function useFmSaveImport(deps: FmSaveImportDeps): FmSaveImport {
  // Snapshot at call time, so an import that awaits keeps the state it started with.
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const preSyncBaselineRef = useRef<PreSyncBaseline | null>(null);
  const latestJourneyPromiseRef = useRef<Promise<DeepJourneyReport | null> | null>(null);

  const applyDecodedSave = async (
    decoded: DecodedFmSavePayload,
    options?: { isInterimCheckpoint?: boolean; benchmarkId?: string }
  ): Promise<HydratedSaveState> => {
    const d = depsRef.current;
    const isInterim = Boolean(options?.isInterimCheckpoint);

    if (isInterim && !preSyncBaselineRef.current) {
      preSyncBaselineRef.current = {
        saveDate: d.saveDate,
        clubName: d.hydratedFmSave?.decodedPayload?.meta?.clubName || 'Managed Club',
        players: d.players,
        matches: d.matches,
      };
    }

    const baseline = preSyncBaselineRef.current ?? {
      saveDate: d.saveDate,
      clubName: d.hydratedFmSave?.decodedPayload?.meta?.clubName || 'Managed Club',
      players: d.players,
      matches: d.matches,
    };

    const [
      { hydrateAppFromDecodedFmSave },
      { captureProgressionSnapshot },
      saveCacheMod,
    ] = await Promise.all([
      import('../utils/fmSaveHydrator'),
      import('../utils/progressionDiff'),
      isInterim ? Promise.resolve(null) : import('../services/saveCache'),
    ]);

    if (!isInterim) {
      preSyncBaselineRef.current = null;
      recordPreviousSnapshot(baseline.saveDate, baseline.players, baseline.matches);
      if (baseline.players.length > 0 && baseline.saveDate && baseline.saveDate !== '--') {
        captureProgressionSnapshot(baseline.saveDate, baseline.clubName, baseline.players);
      }
    }

    const hydrated = hydrateAppFromDecodedFmSave(decoded, baseline.players, baseline.matches);
    if (options?.benchmarkId && !isInterim) {
      markSaveLoadStage(options.benchmarkId, 'hydrate_complete');
    }

    if (!isInterim && saveCacheMod) {
      const {
        createSaveHistoryPoint,
        putSaveHistoryPoint,
        listSaveHistoryPoints,
        buildDeepJourneyReport,
      } = saveCacheMod;
      captureProgressionSnapshot(
        hydrated.saveDateLabel,
        decoded.meta.clubName || 'Managed Club',
        hydrated.updatedSquad
      );
      const snapshotPoint = createSaveHistoryPoint(
        buildSaveHistoryPointDraft(hydrated, decoded)
      );
      latestJourneyPromiseRef.current = putSaveHistoryPoint(snapshotPoint)
        .then(async () => {
          const items = await listSaveHistoryPoints();
          d.setSnapshotResetNonce((n) => n + 1);
          const pair = selectJourneyPair(items, snapshotPoint.clubName);
          if (pair) {
            const report = buildDeepJourneyReport(
              pair.previous,
              pair.latest,
              pair.sameClub,
              hydrated.updatedMatches
            );
            d.setLatestJourneyReport(report);
            return report;
          }
          d.setLatestJourneyReport(null);
          return null;
        })
        .catch((err) => {
          console.warn('Failed to persist FM27 save history point:', err);
          emitFeedback({
            text: 'Save history could not be stored on this device (storage may be full) — live analytics are unaffected',
            tone: 'error',
          });
          return null;
        });
    }

    d.setHydratedFmSave(hydrated);
    d.setPlayers(hydrated.updatedSquad);
    d.setStaff(hydrated.updatedStaff || []);
    if (!isInterim || hydrated.updatedMatches.length > 0) {
      d.setMatches(hydrated.updatedMatches);
    }
    const labels = selectHydratedHeaderLabels(hydrated, isInterim);
    d.setSaveDate(labels.saveDate);
    if (labels.nextFixture !== undefined) d.setNextFixture(labels.nextFixture);
    if (labels.leagueStanding !== undefined) d.setLeagueStandingSub(labels.leagueStanding);
    if (labels.wageSpend !== undefined) d.setWageSpend(labels.wageSpend);
    if (labels.balance !== undefined) d.setBalance(labels.balance);

    if (options?.benchmarkId) {
      const benchmarkId = options.benchmarkId;
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          if (isInterim) {
            markSaveLoadStage(benchmarkId, 'first_useful_screen');
            return;
          }
          markSaveLoadStage(benchmarkId, 'state_applied');
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              finishSaveLoadBenchmark(benchmarkId);
            });
          });
        });
      }
    }

    if (isInterim) {
      d.showGlobalToast(
        `${decoded.meta.clubName || 'Club'} squad, staff & tactics ready — finishing fixtures & stats in background…`
      );
    } else {
      d.setBackgroundSyncStatus(null);
      d.showGlobalToast(
        `Synced ${decoded.meta.clubName || 'Club'} (${hydrated.updatedSquad.length} players · ${hydrated.saveDateLabel})`
      );
    }
    return hydrated;
  };

  return { applyDecodedSave, preSyncBaselineRef, latestJourneyPromiseRef };
}
