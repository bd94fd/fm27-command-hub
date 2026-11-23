import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  Filter,
  LayoutList,
  Search,
  Table2,
  X,
} from 'lucide-react';
import type { PlayerRecord } from '../../types/fm27';
import {
  SQUAD_VIEW_PRESETS,
  SquadSortKey,
  SquadUnitFilter,
  SquadViewPresetId,
} from '../../utils/squadViewHelpers';
import { SORT_OPTIONS } from './squadTableConfig';
import type { ListDisplayMode } from './squadTableConfig';

interface SquadListToolbarProps {
  youthReservesCount: number;
  firstTeamCount: number;
  players: PlayerRecord[];
  squadUnitFilter: SquadUnitFilter;
  setSquadUnitFilter: Dispatch<SetStateAction<SquadUnitFilter>>;
  activePresetId: SquadViewPresetId;
  setActivePresetId: Dispatch<SetStateAction<SquadViewPresetId>>;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  sortBy: SquadSortKey;
  sortDir: 'asc' | 'desc';
  setSortDir: Dispatch<SetStateAction<'asc' | 'desc'>>;
  handleSortSelect: (nextKey: SquadSortKey) => void;
  filtersOpen: boolean;
  setFiltersOpen: Dispatch<SetStateAction<boolean>>;
  columnsOpen: boolean;
  setColumnsOpen: Dispatch<SetStateAction<boolean>>;
  activeSecondaryFilterCount: number;
  hasCustomColumnsForPreset: boolean;
  displayMode: ListDisplayMode;
  setDisplayMode: Dispatch<SetStateAction<ListDisplayMode>>;
  setDisplayManuallySet: Dispatch<SetStateAction<boolean>>;
}

export const SquadListToolbar: React.FC<SquadListToolbarProps> = ({
  youthReservesCount,
  firstTeamCount,
  players,
  squadUnitFilter,
  setSquadUnitFilter,
  activePresetId,
  setActivePresetId,
  search,
  setSearch,
  sortBy,
  sortDir,
  setSortDir,
  handleSortSelect,
  filtersOpen,
  setFiltersOpen,
  columnsOpen,
  setColumnsOpen,
  activeSecondaryFilterCount,
  hasCustomColumnsForPreset,
  displayMode,
  setDisplayMode,
  setDisplayManuallySet,
}) => {
  return (
    <>
    <div className="flex flex-col lg:flex-row lg:items-center gap-2">
      {youthReservesCount > 0 && firstTeamCount > 0 && (
        <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg self-start shrink-0">
          {(
            [
              { id: 'FIRST_TEAM', label: `1st Team (${firstTeamCount})` },
              { id: 'YOUTH_RESERVES', label: `Youth (${youthReservesCount})` },
              { id: 'ALL', label: `All (${players.length})` },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSquadUnitFilter(opt.id)}
              className={`px-2 py-1 text-[11px] font-semibold rounded-md transition whitespace-nowrap cursor-pointer ${
                squadUnitFilter === opt.id
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* View Preset Pills (wrap cleanly on mobile so Overview is never clipped) */}
      <div
        role="tablist"
        aria-label="Squad view presets"
        className="flex flex-wrap items-center gap-1.5"
      >
        {SQUAD_VIEW_PRESETS.map((preset) => {
          const isActive = preset.id === activePresetId;
          return (
            <button
              key={preset.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              title={preset.description}
              onClick={() => setActivePresetId(preset.id)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border transition whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-emerald-600/20 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {preset.shortLabel}
            </button>
          );
        })}
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      <div className="relative flex-1 min-w-[140px]">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          aria-label="Search squad players"
          placeholder="Search player, pos, role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="inline-flex items-center">
        <select
          aria-label="Sort squad players"
          value={sortBy}
          onChange={(e) => handleSortSelect(e.target.value as SquadSortKey)}
          className="px-2 py-1.5 text-[11px] sm:text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-l-lg"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label={`Sort ${sortDir === 'asc' ? 'descending' : 'ascending'}`}
          title={sortDir === 'asc' ? 'Ascending (click to flip)' : 'Descending (click to flip)'}
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          className="px-2 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-l-0 border-slate-300 dark:border-slate-700 rounded-r-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
        >
          {sortDir === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          setFiltersOpen((v) => !v);
          setColumnsOpen(false);
        }}
        aria-expanded={filtersOpen}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg border transition cursor-pointer ${
          filtersOpen || activeSecondaryFilterCount > 0
            ? 'bg-emerald-600/15 border-emerald-500/50 text-emerald-300'
            : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
        }`}
      >
        <Filter className="w-3.5 h-3.5" />
        <span>Filters</span>
        {activeSecondaryFilterCount > 0 && (
          <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-slate-950">
            {activeSecondaryFilterCount}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => {
          setColumnsOpen((v) => !v);
          setFiltersOpen(false);
        }}
        aria-expanded={columnsOpen}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg border transition cursor-pointer ${
          columnsOpen || hasCustomColumnsForPreset
            ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
            : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
        }`}
      >
        <Columns3 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Columns</span>
        {hasCustomColumnsForPreset && (
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
        )}
      </button>

      <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg">
        <button
          type="button"
          aria-label="Compact card view"
          title="Compact card view"
          onClick={() => {
            setDisplayMode('cards');
            setDisplayManuallySet(true);
          }}
          className={`p-1 rounded-md transition cursor-pointer ${
            displayMode === 'cards'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <LayoutList className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Table view"
          title="Table view (frozen player column)"
          onClick={() => {
            setDisplayMode('table');
            setDisplayManuallySet(true);
          }}
          className={`p-1 rounded-md transition cursor-pointer ${
            displayMode === 'table'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Table2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
    </>
  );
};
