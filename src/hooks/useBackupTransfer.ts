/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, type ChangeEvent } from 'react';
import {
  buildFmStateBackupJson,
  exportFmStateBackupJson,
  importFmStateBackupJson,
  loadTrackedScoutTargets,
  type FmHubPersistedState,
} from '../services/fmStorage';
import { emitFeedback } from '../utils/feedbackBus';
import { hasPersistableContent, type PersistableSnapshot } from './useSavePersistence';

export function backupFileName(saveDate: string): string {
  return `fm27-hub-backup-${saveDate.replace(/\//g, '-')}.json`;
}

export interface BackupTransferOptions {
  snapshot: PersistableSnapshot;
  onImport: (imported: FmHubPersistedState) => void;
  onExported: () => void;
  onImportFailed: () => void;
}

export interface BackupTransfer {
  exportBackup: () => Promise<void>;
  importBackup: (event: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Campaign backup out and back in. The export reads stored state first and only
 * falls back to the live snapshot when a large save lives in IndexedDB alone.
 */
export function useBackupTransfer({
  snapshot,
  onImport,
  onExported,
  onImportFailed,
}: BackupTransferOptions): BackupTransfer {
  const depsRef = useRef({ snapshot, onImport, onExported, onImportFailed });
  depsRef.current = { snapshot, onImport, onExported, onImportFailed };

  const exportBackup = useCallback(async () => {
    const { snapshot: current, onExported: notify } = depsRef.current;
    let json = await exportFmStateBackupJson();
    if (!json && hasPersistableContent(current)) {
      const saveHistory = await import('../services/saveCache')
        .then(({ listSaveHistoryPoints }) => listSaveHistoryPoints())
        .catch(() => []);
      json = buildFmStateBackupJson(
        { version: 1, lastSyncedAt: new Date().toISOString(), ...current },
        { trackedScoutTargets: loadTrackedScoutTargets(), saveHistory }
      );
    }
    if (!json) {
      emitFeedback({ text: 'No loaded save data to back up yet', tone: 'info' });
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName(current.saveDate);
    a.click();
    URL.revokeObjectURL(url);
    notify();
  }, []);

  const importBackup = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      const text = loadEvent.target?.result as string;
      if (!text) return;
      try {
        const imported = await importFmStateBackupJson(text);
        if (imported) {
          depsRef.current.onImport(imported);
        } else {
          depsRef.current.onImportFailed();
        }
      } catch (err) {
        console.warn('Failed to import FM27 backup:', err);
        depsRef.current.onImportFailed();
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, []);

  return { exportBackup, importBackup };
}
