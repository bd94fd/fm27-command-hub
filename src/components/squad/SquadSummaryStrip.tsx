import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  AvailabilityFilter,
  SquadSummaryStats,
} from '../../utils/squadViewHelpers';
import { formatWeeklyWage } from '../../utils/squadViewHelpers';

interface SquadSummaryStripProps {
  summary: SquadSummaryStats;
  setAvailabilityFilter: Dispatch<SetStateAction<AvailabilityFilter>>;
}

export const SquadSummaryStrip: React.FC<SquadSummaryStripProps> = ({
  summary,
  setAvailabilityFilter,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono">
        <span>
          <strong className="text-slate-800 dark:text-slate-200">{summary.count}</strong>{' '}
          {summary.count === 1 ? 'player' : 'players'}
        </span>
        {summary.avgAge !== null && (
          <span>
            Avg Age{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {summary.avgAge}
            </strong>
          </span>
        )}
        {summary.totalWagePw > 0 && (
          <span>
            Wages{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {formatWeeklyWage(summary.totalWagePw)}
            </strong>
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {summary.bannedCount > 0 && (
          <button
            type="button"
            onClick={() =>
              setAvailabilityFilter((v) =>
                v === 'UNAVAILABLE' ? 'ALL' : 'UNAVAILABLE'
              )
            }
            className="rounded bg-rose-500/15 border border-rose-500/35 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300 cursor-pointer"
          >
            {summary.bannedCount} Banned
          </button>
        )}
        {summary.injuredCount > 0 && (
          <button
            type="button"
            onClick={() =>
              setAvailabilityFilter((v) =>
                v === 'UNAVAILABLE' ? 'ALL' : 'UNAVAILABLE'
              )
            }
            className="rounded bg-amber-500/15 border border-amber-500/35 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 cursor-pointer"
          >
            {summary.injuredCount} Injured
          </button>
        )}
        {summary.expiringSoonCount > 0 && (
          <button
            type="button"
            onClick={() =>
              setAvailabilityFilter((v) => (v === 'EXPIRING' ? 'ALL' : 'EXPIRING'))
            }
            className="rounded bg-amber-500/15 border border-amber-500/35 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 cursor-pointer"
          >
            {summary.expiringSoonCount} Expiring ≤6m
          </button>
        )}
      </div>
    </div>
  );
};
