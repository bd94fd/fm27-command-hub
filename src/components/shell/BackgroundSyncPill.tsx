/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RefreshCw } from 'lucide-react';
import type { BackgroundSyncStatus } from './backgroundSync';

interface BackgroundSyncPillProps {
  status: BackgroundSyncStatus | null;
  onOpenSync: () => void;
}

/** Shown on other tabs while a save is still being read, so progress is not hidden. */
export function BackgroundSyncPill({ status, onOpenSync }: BackgroundSyncPillProps) {
  if (!status) return null;
  return (
    <div
      className={`rounded-xl border px-3.5 py-2 flex items-center justify-between gap-2 text-xs ${
        status.paused
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <RefreshCw
          className={`w-3.5 h-3.5 shrink-0 ${
            status.paused
              ? 'text-amber-500 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400 animate-spin motion-reduce:animate-none'
          }`}
        />
        <span className="truncate">
          {status.clubCoreReady
            ? `Club core live — finishing in background: ${status.label}`
            : status.label}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onOpenSync()}
        className={`shrink-0 min-h-[44px] md:min-h-[32px] px-3 md:px-2.5 py-1 rounded-lg md:rounded-md text-xs md:text-micro font-semibold border cursor-pointer whitespace-nowrap ${
          status.paused
            ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-100 border-amber-500/40'
            : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-900 dark:text-emerald-100 border-emerald-500/40'
        }`}
      >
      {status.paused ? 'Resume' : 'View Sync'}
      </button>
    </div>
  );
}
