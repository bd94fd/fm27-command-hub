/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState } from 'react';
import { clearPersistedFmState } from '../services/fmStorage';
import { clearAllChatHistory } from '../services/chatStorage';

interface ClearAllDataOptions {
  /** Autosave has to be paused while the wipe runs, or it writes the old state back. */
  pauseAutosave: () => void;
  cancelPendingRestore: () => void;
  resumeAutosave: () => void;
  onCleared: () => void;
  onResetNonce: () => void;
  showToast: (message: string) => void;
}

const CONFIRM_WINDOW_MS = 5000;

/**
 * The two-press "clear everything" action: first press arms it for five
 * seconds, second press wipes the stored state, the save caches and the chat
 * history. Shared state, so the header can show the armed confirmation.
 */
export function useClearAllData({
  pauseAutosave,
  cancelPendingRestore,
  resumeAutosave,
  onCleared,
  onResetNonce,
  showToast,
}: ClearAllDataOptions) {
  const [confirmResetPending, setConfirmResetPending] = useState(false);
  const confirmTimeoutRef = useRef<number | null>(null);

  const clearConfirmTimer = () => {
    if (confirmTimeoutRef.current !== null) {
      window.clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
  };

  const requestClear = async () => {
    if (!confirmResetPending) {
      setConfirmResetPending(true);
      clearConfirmTimer();
      confirmTimeoutRef.current = window.setTimeout(() => {
        confirmTimeoutRef.current = null;
        setConfirmResetPending(false);
      }, CONFIRM_WINDOW_MS);
      return;
    }

    setConfirmResetPending(false);
    clearConfirmTimer();
    // Block auto-save while the reset is applied, and stop an in-flight IndexedDB
    // restore from writing cleared state back.
    pauseAutosave();
    cancelPendingRestore();
    await clearPersistedFmState();
    const [{ clearProgressionArchive }, { clearAllSaveCache }] = await Promise.all([
      import('../utils/progressionDiff'),
      import('../services/saveCache'),
    ]);
    clearProgressionArchive();
    clearAllChatHistory();
    await clearAllSaveCache();
    // A late auto-save IndexedDB write may land after the wipe; clear once more.
    await clearPersistedFmState();
    onCleared();
    onResetNonce();
    showToast('All saved state, cached saves & snapshots cleared — ready to test fresh');
    window.setTimeout(resumeAutosave, 0);
  };

  return { confirmResetPending, requestClear };
}
