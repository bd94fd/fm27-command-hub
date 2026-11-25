import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerRecord } from '../../types/fm27';
import {
  EnrichedSquadRow,
  SQUAD_COLUMNS,
  SquadColumnId,
  SquadSortKey,
  SquadViewPreset,
} from '../../utils/squadViewHelpers';
import { renderColumnValue } from './squadBadges';
import { CompareTrayToggle } from '../CompareTrayToggle';

interface SquadDataTableProps {
  activePreset: SquadViewPreset;
  activeColumns: SquadColumnId[];
  sortBy: SquadSortKey;
  sortDir: 'asc' | 'desc';
  handleHeaderSortClick: (nextKey: SquadSortKey) => void;
  visibleRows: EnrichedSquadRow[];
  onSelectPlayer?: (player: PlayerRecord) => void;
}

export const SquadDataTable: React.FC<SquadDataTableProps> = ({
  activePreset,
  activeColumns,
  sortBy,
  sortDir,
  handleHeaderSortClick,
  visibleRows,
  onSelectPlayer,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });

  const updateScrollCue = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const canScrollLeft = el.scrollLeft > 4;
    const canScrollRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setScrollState((prev) =>
      prev.canScrollLeft === canScrollLeft && prev.canScrollRight === canScrollRight
        ? prev
        : { canScrollLeft, canScrollRight }
    );
  }, []);

  useEffect(() => {
    updateScrollCue();
    const el = scrollContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateScrollCue());
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScrollCue, activeColumns.length, visibleRows.length]);

  const stickyShadowCls = scrollState.canScrollLeft
    ? 'shadow-[6px_0_12px_-4px_rgba(2,6,23,0.65)]'
    : '';

  const scrollHintLabel =
    scrollState.canScrollLeft && scrollState.canScrollRight
      ? '← Pinned Player · Swipe →'
      : scrollState.canScrollRight
        ? 'Pinned Player · Swipe →'
        : scrollState.canScrollLeft
          ? '← Swipe back'
          : 'All columns visible';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400 px-0.5">
        <span className="truncate">
          {activePreset.label} ({activeColumns.length} cols)
        </span>
        {(scrollState.canScrollLeft || scrollState.canScrollRight) && (
          <span
            data-testid="squad-table-scroll-cue"
            className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
          >
            {scrollHintLabel}
          </span>
        )}
      </div>

      <div className="relative rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Right-edge fade cue whenever more columns exist off-screen */}
        {scrollState.canScrollRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-0 bottom-0 w-7 z-30 bg-gradient-to-l from-white via-white/75 dark:from-slate-950 dark:via-slate-950/75 to-transparent"
          />
        )}

        <div
          ref={scrollContainerRef}
          onScroll={updateScrollCue}
          className="overflow-x-auto"
        >
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <th
                  className={`sticky left-0 z-20 bg-slate-50 dark:bg-slate-950 py-2.5 pl-2.5 pr-2 sm:pl-3 sm:pr-3 border-r border-slate-200 dark:border-slate-800 min-w-[136px] max-w-[158px] sm:min-w-[170px] sm:max-w-[240px] transition-shadow ${stickyShadowCls}`}
                >
                  <button
                    type="button"
                    onClick={() => handleHeaderSortClick('name')}
                    className="inline-flex items-center gap-1 min-h-[32px] hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <span>Player</span>
                    {sortBy === 'name' && (
                      <span className="text-emerald-400">
                        {sortDir === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                </th>
                {activeColumns.map((colId) => {
                  const meta = SQUAD_COLUMNS[colId];
                  const isSorted = meta.sortKey && sortBy === meta.sortKey;
                  return (
                    <th
                      key={colId}
                      title={meta.label}
                      className={`py-2.5 px-3 whitespace-nowrap ${
                        meta.align === 'right' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {meta.sortKey ? (
                        <button
                          type="button"
                          onClick={() => handleHeaderSortClick(meta.sortKey!)}
                          className={`inline-flex items-center gap-1 min-h-[32px] hover:text-slate-900 dark:hover:text-white cursor-pointer ${
                            meta.align === 'right' ? 'justify-end' : ''
                          }`}
                        >
                          <span>{meta.shortLabel}</span>
                          {isSorted && (
                            <span className="text-emerald-400">
                              {sortDir === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </button>
                      ) : (
                        <span>{meta.shortLabel}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {visibleRows.map((row) => {
                const p = row.player;
                const showRolesSubline = !activeColumns.includes('roles');
                return (
                  <tr
                    key={p.id}
                    onClick={() => onSelectPlayer?.(p)}
                    className={`group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${
                      onSelectPlayer ? 'cursor-pointer' : ''
                    }`}
                  >
                    <td
                      className={`sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 py-2.5 pl-2.5 pr-2 sm:pl-3 sm:pr-3 border-r border-slate-200 dark:border-slate-800 min-w-[136px] max-w-[158px] sm:min-w-[170px] sm:max-w-[240px] transition-shadow ${stickyShadowCls}`}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {row.shirtNumber !== null && (
                          <span className="font-mono text-[10px] text-slate-400">
                            #{row.shirtNumber}
                          </span>
                        )}
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {p.name}
                        </span>
                        {row.isBanned && (
                          <span
                            title={row.activeBanTooltip || 'Suspended'}
                            className="rounded bg-rose-500/20 border border-rose-500/50 px-1 py-0.2 text-[9px] font-bold uppercase text-rose-300"
                          >
                            BAN {row.activeBanMatches}m
                          </span>
                        )}
                        {!row.isBanned && row.hasOtherCompBan && (
                          <span
                            title={row.activeBanTooltip || 'Other-competition ban only — eligible next match'}
                            className="rounded bg-amber-500/15 border border-amber-500/45 px-1 py-0.2 text-[9px] font-bold uppercase text-amber-300"
                          >
                            CUP BAN {row.activeBanMatches}m
                          </span>
                        )}
                        {row.isInjured && (
                          <span className="rounded bg-amber-500/20 border border-amber-500/50 px-1 py-0.2 text-[9px] font-bold uppercase text-amber-300">
                            INJ
                          </span>
                        )}
                        {p.onLoan && (
                          <span className="rounded bg-indigo-500/20 border border-indigo-500/45 px-1 py-0.2 text-[9px] font-bold uppercase text-indigo-300">
                            LOAN
                          </span>
                        )}
                        <CompareTrayToggle player={p} iconOnly className="ml-auto" />
                      </div>
                      {showRolesSubline && (p.ipRole || p.oopRole) && (
                        <div className="text-[11px] leading-snug text-slate-500 dark:text-slate-400 truncate mt-0.5 pb-0.5">
                          {p.ipRole}
                          {p.oopRole ? ` / ${p.oopRole}` : ''}
                        </div>
                      )}
                      {row.cleanNote && (
                        <div className="text-[10px] leading-snug text-slate-400 truncate">
                          {row.cleanNote}
                        </div>
                      )}
                    </td>
                    {activeColumns.map((colId) => {
                      const meta = SQUAD_COLUMNS[colId];
                      return (
                        <td
                          key={colId}
                          className={`py-2.5 px-3 whitespace-nowrap ${
                            meta.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {renderColumnValue(row, colId)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
