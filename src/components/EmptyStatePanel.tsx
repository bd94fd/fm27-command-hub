/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChevronRight, FolderOpen } from 'lucide-react';
import {
  EMPTY_STATE_ACTION,
  EMPTY_STATE_ACTION_HINT,
  type EmptyStateCopy,
} from '../utils/emptyStateCopy';

interface EmptyStatePanelProps {
  copy: EmptyStateCopy;
  /** Takes the reader to the Hub, where the save is chosen. */
  onRequestImport?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export const EmptyStatePanel: React.FC<EmptyStatePanelProps> = ({
  copy,
  onRequestImport,
  icon,
  className = '',
}) => (
  <div
    className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-6 sm:p-8 text-center ${className}`}
  >
    <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
      {icon ?? <FolderOpen className="h-5 w-5" />}
    </div>
    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
      {copy.title}
    </h3>
    <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-600 dark:text-slate-400">
      {copy.detail}
    </p>
    {onRequestImport && (
      <>
        <button
          type="button"
          onClick={onRequestImport}
          className="mt-3.5 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-xs font-bold text-slate-950 transition cursor-pointer hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
        >
          {EMPTY_STATE_ACTION}
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        </button>
        <p className="mx-auto mt-1.5 max-w-xs text-[11px] leading-relaxed text-slate-500 dark:text-slate-500">
          {EMPTY_STATE_ACTION_HINT}
        </p>
      </>
    )}
  </div>
);
