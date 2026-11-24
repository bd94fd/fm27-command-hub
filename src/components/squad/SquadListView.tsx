import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { RotateCcw } from 'lucide-react';
import type { PlayerRecord } from '../../types/fm27';
import type {
  ClubGovernanceState,
  DivisionBenchmarks,
  LastMatchTacticBlueprint,
} from '../../types/fmSave';
import type { TransferActionVerdict } from '../../utils/transferAudit';
import {
  AvailabilityFilter,
  EnrichedSquadRow,
  PositionGroupFilter,
  SquadColumnId,
  SquadSortKey,
  SquadSummaryStats,
  SquadUnitFilter,
  SquadViewPreset,
  SquadViewPresetId,
} from '../../utils/squadViewHelpers';
import type { ListDisplayMode } from './squadTableConfig';
import { SquadListToolbar } from './SquadListToolbar';
import { SquadFilterDrawer } from './SquadFilterDrawer';
import { SquadColumnsPicker } from './SquadColumnsPicker';
import { SquadSummaryStrip } from './SquadSummaryStrip';
import { SquadStatsNotice } from './SquadStatsNotice';
import { SquadCardsList } from './SquadCardsList';
import { SquadDataTable } from './SquadDataTable';
import { SquadListFooter } from './SquadListFooter';

interface SquadListViewProps {
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
  posFilter: PositionGroupFilter;
  setPosFilter: Dispatch<SetStateAction<PositionGroupFilter>>;
  statusFilter: string;
  setStatusFilter: Dispatch<SetStateAction<string>>;
  availabilityFilter: AvailabilityFilter;
  setAvailabilityFilter: Dispatch<SetStateAction<AvailabilityFilter>>;
  availableExpiryYears: string[];
  expiryYearFilter: string;
  setExpiryYearFilter: Dispatch<SetStateAction<string>>;
  handleResetFilters: () => void;
  activePreset: SquadViewPreset;
  handleResetPresetColumns: () => void;
  activeColumns: SquadColumnId[];
  handleToggleColumn: (colId: SquadColumnId) => void;
  summary: SquadSummaryStats;
  showStatsNotice: boolean;
  statsNoticeMode: 'fast_sync' | 'preseason' | 'unavailable';
  filteredRows: EnrichedSquadRow[];
  visibleRows: EnrichedSquadRow[];
  onSelectPlayer?: (player: PlayerRecord) => void;
  divisionBenchmarks: DivisionBenchmarks | null;
  lastMatchTactic: LastMatchTacticBlueprint | null;
  governance: ClubGovernanceState | null;
  transferVerdictById: Map<string, TransferActionVerdict>;
  cardMetricColumns: SquadColumnId[];
  handleHeaderSortClick: (nextKey: SquadSortKey) => void;
  setVisibleRowLimit: Dispatch<SetStateAction<number>>;
}

export const SquadListView: React.FC<SquadListViewProps> = ({
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
  posFilter,
  setPosFilter,
  statusFilter,
  setStatusFilter,
  availabilityFilter,
  setAvailabilityFilter,
  availableExpiryYears,
  expiryYearFilter,
  setExpiryYearFilter,
  handleResetFilters,
  activePreset,
  handleResetPresetColumns,
  activeColumns,
  handleToggleColumn,
  summary,
  showStatsNotice,
  statsNoticeMode,
  filteredRows,
  visibleRows,
  onSelectPlayer,
  divisionBenchmarks,
  lastMatchTactic,
  governance,
  transferVerdictById,
  cardMetricColumns,
  handleHeaderSortClick,
  setVisibleRowLimit,
}) => {
  return (
    <div className="mt-3 space-y-2.5">
      <SquadListToolbar
        youthReservesCount={youthReservesCount}
        firstTeamCount={firstTeamCount}
        players={players}
        squadUnitFilter={squadUnitFilter}
        setSquadUnitFilter={setSquadUnitFilter}
        activePresetId={activePresetId}
        setActivePresetId={setActivePresetId}
        search={search}
        setSearch={setSearch}
        sortBy={sortBy}
        sortDir={sortDir}
        setSortDir={setSortDir}
        handleSortSelect={handleSortSelect}
        filtersOpen={filtersOpen}
        setFiltersOpen={setFiltersOpen}
        columnsOpen={columnsOpen}
        setColumnsOpen={setColumnsOpen}
        activeSecondaryFilterCount={activeSecondaryFilterCount}
        hasCustomColumnsForPreset={hasCustomColumnsForPreset}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        setDisplayManuallySet={setDisplayManuallySet}
      />

      <SquadFilterDrawer
        filtersOpen={filtersOpen}
        posFilter={posFilter}
        setPosFilter={setPosFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        availabilityFilter={availabilityFilter}
        setAvailabilityFilter={setAvailabilityFilter}
        availableExpiryYears={availableExpiryYears}
        expiryYearFilter={expiryYearFilter}
        setExpiryYearFilter={setExpiryYearFilter}
        activeSecondaryFilterCount={activeSecondaryFilterCount}
        search={search}
        handleResetFilters={handleResetFilters}
      />

      <SquadColumnsPicker
        columnsOpen={columnsOpen}
        activePreset={activePreset}
        hasCustomColumnsForPreset={hasCustomColumnsForPreset}
        handleResetPresetColumns={handleResetPresetColumns}
        activeColumns={activeColumns}
        handleToggleColumn={handleToggleColumn}
      />

      <SquadSummaryStrip
        summary={summary}
        setAvailabilityFilter={setAvailabilityFilter}
      />

      <SquadStatsNotice
        showStatsNotice={showStatsNotice}
        statsNoticeMode={statsNoticeMode}
      />

      {filteredRows.length === 0 ? (
    <div className="py-10 text-center space-y-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
        No players match your current filters.
      </p>
      <button
        type="button"
        onClick={handleResetFilters}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Clear Filters
      </button>
    </div>
      ) : displayMode === 'cards' ? (
        <SquadCardsList
          visibleRows={visibleRows}
          players={players}
          onSelectPlayer={onSelectPlayer}
          divisionBenchmarks={divisionBenchmarks}
          lastMatchTactic={lastMatchTactic}
          governance={governance}
          transferVerdictById={transferVerdictById}
          cardMetricColumns={cardMetricColumns}
          activePresetId={activePresetId}
        />
      ) : (
        <SquadDataTable
          activePreset={activePreset}
          activeColumns={activeColumns}
          sortBy={sortBy}
          sortDir={sortDir}
          handleHeaderSortClick={handleHeaderSortClick}
          visibleRows={visibleRows}
          onSelectPlayer={onSelectPlayer}
        />
      )}

      <SquadListFooter
        filteredRows={filteredRows}
        visibleRows={visibleRows}
        setVisibleRowLimit={setVisibleRowLimit}
      />
    </div>
  );
};
