import React from 'react';
import { History, MessageSquare, ShieldCheck, Wallet } from 'lucide-react';

export type MobileHubView = 'chat' | 'finances' | 'journey' | 'data';

export interface MobileHubTabsProps {
  view: MobileHubView;
  onViewChange: (view: MobileHubView) => void;
  turnCount: number;
  hasJourneyReport: boolean;
  /** Null hides the warning dot: no decoded save means nothing to report yet. */
  dataQualityMissing: number | null;
}

export const MobileHubTabs: React.FC<MobileHubTabsProps> = ({
  view,
  onViewChange,
  turnCount,
  hasJourneyReport,
  dataQualityMissing,
}) => (
  <div
    role="tablist"
    aria-label="Mobile Hub view"
    className="md:hidden px-3.5 pt-3 pb-1 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/60"
  >
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-300 dark:border-slate-800">
      <button
        type="button"
        role="tab"
        aria-selected={view === 'chat'}
        onClick={() => onViewChange('chat')}
        className={`min-h-[44px] inline-flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 text-micro sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
          view === 'chat'
            ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/40 shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
        }`}
      >
        <MessageSquare className="w-4 h-4 shrink-0" />
        <span className="truncate">Analyst Chat</span>
        {turnCount > 0 && (
          <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 font-mono text-2xs leading-none text-emerald-800 dark:text-emerald-300 tabular-nums">
            {turnCount}
          </span>
        )}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'finances'}
        onClick={() => onViewChange('finances')}
        className={`min-h-[44px] inline-flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 text-micro sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
          view === 'finances'
            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
        }`}
      >
        <Wallet className="w-4 h-4 shrink-0" />
        <span className="truncate">Finances</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'journey'}
        onClick={() => onViewChange('journey')}
        className={`min-h-[44px] inline-flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 text-micro sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
          view === 'journey'
            ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/40 shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
        }`}
      >
        <History className="w-4 h-4 shrink-0" />
        <span className="truncate">Save Journey</span>
        {hasJourneyReport && (
          <span
            aria-hidden="true"
            className="w-2 h-2 rounded-full bg-sky-500 dark:bg-sky-400 shrink-0"
          />
        )}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'data'}
        onClick={() => onViewChange('data')}
        className={`min-h-[44px] inline-flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 text-micro sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
          view === 'data'
            ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/40 shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
        }`}
      >
        <ShieldCheck className="w-4 h-4 shrink-0" />
        <span className="truncate">Data Quality</span>
        {dataQualityMissing !== null && dataQualityMissing > 0 && (
          <span
            aria-hidden="true"
            className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0"
          />
        )}
      </button>
    </div>
  </div>
);
