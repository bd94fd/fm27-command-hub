import React, { useEffect, useState } from 'react';
import { BarChart2, ListOrdered } from 'lucide-react';
import type { ChartViewMode } from '../utils/mobileChartHelpers';

export interface ChartRankedListToggleProps {
  mode: ChartViewMode;
  onChange: (mode: ChartViewMode) => void;
  ariaLabel?: string;
  listLabel?: string;
  count?: number;
}

/**
 * Reusable 44px-mobile touch segmented control switching dense analytics charts
 * between visual SVG mode and a scannable ranked list.
 */
export const ChartRankedListToggle: React.FC<ChartRankedListToggleProps> = ({
  mode,
  onChange,
  ariaLabel = 'Switch chart view mode',
  listLabel = 'Ranked List',
  count,
}) => {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/90 p-0.5 shrink-0"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'chart'}
        onClick={() => onChange('chart')}
        className={`min-h-[44px] sm:min-h-[32px] inline-flex items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
          mode === 'chart'
            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
        }`}
      >
        <BarChart2 className="h-3.5 w-3.5 shrink-0" />
        <span>Chart</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'list'}
        onClick={() => onChange('list')}
        className={`min-h-[44px] sm:min-h-[32px] inline-flex items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
          mode === 'list'
            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
        }`}
      >
        <ListOrdered className="h-3.5 w-3.5 shrink-0" />
        <span>
          {listLabel}
          {typeof count === 'number' ? ` (${count})` : ''}
        </span>
      </button>
    </div>
  );
};

/**
 * Tracks whether the viewport is narrow (< 640px) so dense SVG charts can switch
 * to mobile-tuned viewBoxes with larger text and touch hit targets.
 * SSR / Node-test safe.
 */
export function useCompactChartViewport(): boolean {
  const [isCompact, setIsCompact] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(max-width: 639px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsCompact(mq.matches);
    update();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  return isCompact;
}
