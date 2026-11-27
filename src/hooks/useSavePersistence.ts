/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  loadPersistedFmState,
  loadPersistedFmStateFromIndexedDb,
  savePersistedFmState,
  type FmHubPersistedState,
} from '../services/fmStorage';
import {
  hasPersistedContent,
  isIndexedDbSnapshotNewer,
} from '../utils/persistedStateRecency';
import { selectJourneyPair } from '../utils/saveJourneyTimeline';
import type { DeepJourneyReport, SaveHistoryPoint } from '../services/saveCache';

export type PersistableSnapshot = Omit<FmHubPersistedState, 'version' | 'lastSyncedAt'>;

/** A snapshot is worth writing only when it carries something the user would miss. */
export function hasPersistableContent(snapshot: PersistableSnapshot): boolean {
  return (
    snapshot.players.length > 0 ||
    snapshot.matches.length > 0 ||
    (snapshot.staff?.length ?? 0) > 0 ||
    (snapshot.recruitmentCases?.length ?? 0) > 0 ||
    (snapshot.shortlists?.length ?? 0) > 0
  );
}

export interface SavePersistenceOptions {
  snapshot: PersistableSnapshot;
  onRestore: (saved: FmHubPersistedState) => void;
  onJourneyReport: (report: DeepJourneyReport | null) => void;
  onPersisted: () => void;
}

export interface SavePersistence {
  /** Stops an in-flight IndexedDB read from applying over a save the user just cleared. */
  cancelPendingRestore: () => void;
  pauseAutosave: () => void;
  resumeAutosave: () => void;
}

/**
 * Restores the previous session on cold start, then keeps it saved while the tab
 * is alive. The restore reads localStorage first and only lets a strictly newer
 * IndexedDB snapshot replace it, so a quota-compacted copy cannot win on age.
 */
export function useSavePersistence({
  snapshot,
  onRestore,
  onJourneyReport,
  onPersisted,
}: SavePersistenceOptions): SavePersistence {
  const restoreCancelledRef = useRef(false);
  const autosavePausedRef = useRef(false);
  // Closed until the IndexedDB recency check settles, so an older localStorage
  // restore can never be written back over a newer IndexedDB snapshot.
  const autosaveGateRef = useRef(true);

  const callbacksRef = useRef({ onRestore, onJourneyReport, onPersisted });
  callbacksRef.current = { onRestore, onJourneyReport, onPersisted };

  const cancelPendingRestore = useCallback(() => {
    restoreCancelledRef.current = true;
  }, []);
  const pauseAutosave = useCallback(() => {
    autosavePausedRef.current = true;
  }, []);
  const resumeAutosave = useCallback(() => {
    autosavePausedRef.current = false;
  }, []);

  useEffect(() => {
    restoreCancelledRef.current = false;
    const saved = loadPersistedFmState();
    if (saved && hasPersistedContent(saved)) {
      callbacksRef.current.onRestore(saved);
    }

    void loadPersistedFmStateFromIndexedDb()
      .then((idbSaved) => {
        if (restoreCancelledRef.current) return saved;
        if (!hasPersistedContent(idbSaved)) return saved;
        if (!isIndexedDbSnapshotNewer(idbSaved, saved)) return saved;
        callbacksRef.current.onRestore(idbSaved);
        return idbSaved;
      })
      .then((activeSnapshot) => {
        autosaveGateRef.current = false;
        if (restoreCancelledRef.current) return;
        void import('../services/saveCache').then(({ listSaveHistoryPoints, buildDeepJourneyReport }) =>
          listSaveHistoryPoints().then((items: SaveHistoryPoint[]) => {
            if (restoreCancelledRef.current) return;
            const pair = selectJourneyPair(items);
            if (!pair) return;
            const report = buildDeepJourneyReport(
              pair.previous,
              pair.latest,
              pair.sameClub,
              activeSnapshot?.matches ?? []
            );
            if (report) callbacksRef.current.onJourneyReport(report);
          })
        );
      })
      .catch(() => {
        autosaveGateRef.current = false;
      });

    return () => {
      restoreCancelledRef.current = true;
    };
  }, []);

  // Debounced so a burst of edits does not stringify the whole save on every
  // keystroke; flushed immediately when the tab is hidden or unloaded.
  useEffect(() => {
    if (autosaveGateRef.current || autosavePausedRef.current) return;
    if (!hasPersistableContent(snapshot)) return;

    let cancelled = false;
    let flushed = false;
    const flushSave = () => {
      if (cancelled || flushed || autosavePausedRef.current) return;
      flushed = true;
      void savePersistedFmState(snapshot)
        .then((didSave) => {
          if (!cancelled && didSave) callbacksRef.current.onPersisted();
        })
        .catch((err) => {
          console.warn('Failed to auto-save FM27 state:', err);
        });
    };

    const timer = window.setTimeout(flushSave, 180);
    const handleVisibilityFlush = () => {
      if (document.visibilityState === 'hidden') {
        window.clearTimeout(timer);
        flushSave();
      }
    };
    const handlePageHide = () => {
      window.clearTimeout(timer);
      flushSave();
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityFlush);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityFlush);
    };
  }, [snapshot]);

  return { cancelPendingRestore, pauseAutosave, resumeAutosave };
}
