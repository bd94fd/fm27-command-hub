import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { EnrichedSquadRow } from '../../utils/squadViewHelpers';

interface SquadListFooterProps {
  filteredRows: EnrichedSquadRow[];
  visibleRows: EnrichedSquadRow[];
  setVisibleRowLimit: Dispatch<SetStateAction<number>>;
}

export const SquadListFooter: React.FC<SquadListFooterProps> = ({
  filteredRows,
  visibleRows,
  setVisibleRowLimit,
}) => {
  return (
    <>
    {filteredRows.length > visibleRows.length && (
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
        <span className="text-micro text-slate-500 dark:text-slate-400">
          Showing {visibleRows.length} of {filteredRows.length} players
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVisibleRowLimit((prev) => prev + 35)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition"
          >
            Show 35 More
          </button>
          <button
            type="button"
            onClick={() => setVisibleRowLimit(filteredRows.length)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/25 cursor-pointer transition"
          >
            Show All ({filteredRows.length})
          </button>
        </div>
      </div>
    )}
    </>
  );
};
