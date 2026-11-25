import React, {
  Suspense,
  lazy,
  useState,
  useMemo,
  useDeferredValue,
  useEffect,
} from 'react';
import { BarChart3, GitCompare, Table2, TrendingUp, Users } from 'lucide-react';
import { MatchLogEntry, PlayerRecord } from '../types/fm27';
import type {
  ClubGovernanceState,
  DivisionBenchmarks,
  LastMatchTacticBlueprint,
  SquadPlannerSlot,
} from '../types/fmSave';
import {
  buildSquadTransferAudit,
  type ClubFinancialInput,
} from '../utils/transferAudit';
import {
  clearProgressionArchive,
  computeProgressionDiff,
  loadProgressionArchive,
} from '../utils/progressionDiff';
import { clearAllSaveCache } from '../services/saveCache';
import {
  AvailabilityFilter,
  PersistedColumnMap,
  PositionGroupFilter,
  SQUAD_VIEW_PRESETS,
  SquadColumnId,
  SquadSortKey,
  SquadUnitFilter,
  SquadViewPresetId,
  buildEnrichedSquadRows,
  computeSquadSummary,
  countActiveSecondaryFilters,
  countSquadPool,
  extractExpiryYear,
  filterAndSortSquadRows,
  getDefaultSortDirForKey,
  isSquadMissingMatchStats,
  loadPersistedSquadColumns,
  savePersistedSquadColumns,
} from '../utils/squadViewHelpers';
import { STATS_SORT_KEYS } from './squad/squadTableConfig';
import type { ListDisplayMode, SquadViewMode } from './squad/squadTableConfig';
import { SquadListView } from './squad/SquadListView';
import { SelectionCompareDock } from './recruitment/SelectionCompareDock';
import { SquadSubViewSkeleton } from './WorkspaceSkeletons';

const SquadAnalyticsView = lazy(() =>
  import('./squad/SquadAnalyticsView').then((m) => ({
    default: m.SquadAnalyticsView,
  }))
);
const SquadCompareView = lazy(() =>
  import('./squad/SquadCompareView').then((m) => ({
    default: m.SquadCompareView,
  }))
);
const SquadProgressionView = lazy(() =>
  import('./squad/SquadProgressionView').then((m) => ({
    default: m.SquadProgressionView,
  }))
);

interface SquadAnalyticsTableProps {
  players: PlayerRecord[];
  matches?: MatchLogEntry[];
  clubName?: string;
  saveDate?: string;
  finances?: ClubFinancialInput | null;
  divisionBenchmarks?: DivisionBenchmarks | null;
  governance?: ClubGovernanceState | null;
  lastMatchTactic?: LastMatchTacticBlueprint | null;
  squadPlanner?: SquadPlannerSlot[] | null;
  nextCompetitionName?: string | null;
  isFastSync?: boolean;
  playedMatchesCount?: number;
  onSelectPlayer?: (player: PlayerRecord) => void;
}

export const SquadAnalyticsTable: React.FC<SquadAnalyticsTableProps> = ({
  players,
  matches = [],
  clubName,
  saveDate = '--',
  finances = null,
  divisionBenchmarks = null,
  governance = null,
  lastMatchTactic = null,
  squadPlanner = null,
  nextCompetitionName = null,
  isFastSync = false,
  playedMatchesCount,
  onSelectPlayer,
}) => {
  const [viewMode, setViewMode] = useState<SquadViewMode>('table');
  const [activePresetId, setActivePresetId] = useState<SquadViewPresetId>('overview');
  const [customColumnsMap, setCustomColumnsMap] = useState<PersistedColumnMap>(() =>
    loadPersistedSquadColumns()
  );
  const [displayMode, setDisplayMode] = useState<ListDisplayMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'table'
  );
  const [displayManuallySet, setDisplayManuallySet] = useState(false);

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [squadUnitFilter, setSquadUnitFilter] = useState<SquadUnitFilter>('FIRST_TEAM');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [posFilter, setPosFilter] = useState<PositionGroupFilter>('ALL');
  const [expiryYearFilter, setExpiryYearFilter] = useState<string>('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('ALL');
  const [sortBy, setSortBy] = useState<SquadSortKey>('position');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const [radarPlayerId, setRadarPlayerId] = useState<string>('');
  const [compareAId, setCompareAId] = useState<string>('');
  const [compareBId, setCompareBId] = useState<string>('');
  const [baselineIdx, setBaselineIdx] = useState<number>(0);
  const [showMinorProgressionShifts, setShowMinorProgressionShifts] =
    useState<boolean>(false);
  const [progressionDirection, setProgressionDirection] = useState<
    'ALL' | 'RISERS' | 'FALLERS'
  >('ALL');
  const [expandedMinorUids, setExpandedMinorUids] = useState<Record<number, boolean>>({});
  const [progressionRefreshNonce, setProgressionRefreshNonce] = useState<number>(0);
  const [confirmClearProgression, setConfirmClearProgression] = useState<boolean>(false);

  useEffect(() => {
    if (displayManuallySet || typeof window === 'undefined') return;
    const handleResize = () => {
      setDisplayMode(window.innerWidth < 768 ? 'cards' : 'table');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [displayManuallySet]);

  const activePreset = useMemo(
    () => SQUAD_VIEW_PRESETS.find((p) => p.id === activePresetId) || SQUAD_VIEW_PRESETS[0],
    [activePresetId]
  );

  const activeColumns = useMemo<SquadColumnId[]>(() => {
    const custom = customColumnsMap[activePresetId];
    return custom && custom.length > 0 ? custom : activePreset.defaultColumns;
  }, [customColumnsMap, activePresetId, activePreset]);

  const hasCustomColumnsForPreset = Boolean(
    customColumnsMap[activePresetId] && customColumnsMap[activePresetId]!.length > 0
  );

  const cardMetricColumns = useMemo<SquadColumnId[]>(() => {
    if (hasCustomColumnsForPreset) {
      return activeColumns.filter((c) => c !== 'pos' && c !== 'age' && c !== 'stars').slice(0, 4);
    }
    return activePreset.cardMetrics;
  }, [hasCustomColumnsForPreset, activeColumns, activePreset]);

  const enrichedRows = useMemo(
    () =>
      buildEnrichedSquadRows(
        players,
        undefined,
        nextCompetitionName,
        divisionBenchmarks
      ),
    [players, nextCompetitionName, divisionBenchmarks]
  );

  const squadPoolCounts = useMemo(() => countSquadPool(players), [players]);
  const firstTeamCount = squadPoolCounts.firstTeam;
  const youthReservesCount = squadPoolCounts.youthReserves;
  const effectiveUnitFilter: SquadUnitFilter =
    youthReservesCount === 0 || firstTeamCount === 0 ? 'ALL' : squadUnitFilter;

  const missingMatchStats = useMemo(() => isSquadMissingMatchStats(players), [players]);

  const availableExpiryYears = useMemo(() => {
    const years = new Set<string>();
    for (const p of players) {
      const y = extractExpiryYear(p.expires);
      if (y) years.add(y);
    }
    return Array.from(years).sort();
  }, [players]);

  const filteredRows = useMemo(
    () =>
      filterAndSortSquadRows(enrichedRows, {
        unit: effectiveUnitFilter,
        search: deferredSearch,
        posGroup: posFilter,
        status: statusFilter,
        expiryYear: expiryYearFilter,
        availability: availabilityFilter,
        sortKey: sortBy,
        sortDir,
      }),
    [
      enrichedRows,
      effectiveUnitFilter,
      deferredSearch,
      posFilter,
      statusFilter,
      expiryYearFilter,
      availabilityFilter,
      sortBy,
      sortDir,
    ]
  );

  const [visibleRowLimit, setVisibleRowLimit] = useState<number>(35);

  // Keep the mobile DOM cap effective: a new search/filter/sort starts from the
  // first page of results instead of retaining an expanded "Show All" limit.
  useEffect(() => {
    setVisibleRowLimit(35);
  }, [
    search,
    effectiveUnitFilter,
    posFilter,
    statusFilter,
    expiryYearFilter,
    availabilityFilter,
    sortBy,
    sortDir,
  ]);

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleRowLimit),
    [filteredRows, visibleRowLimit]
  );

  const summary = useMemo(() => computeSquadSummary(filteredRows), [filteredRows]);

  const activeSecondaryFilterCount = countActiveSecondaryFilters({
    posGroup: posFilter,
    status: statusFilter,
    expiryYear: expiryYearFilter,
    availability: availabilityFilter,
  });

  const handleSortSelect = (nextKey: SquadSortKey) => {
    setSortBy(nextKey);
    setSortDir(getDefaultSortDirForKey(nextKey));
  };

  const handleHeaderSortClick = (nextKey: SquadSortKey) => {
    if (sortBy === nextKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(nextKey);
      setSortDir(getDefaultSortDirForKey(nextKey));
    }
  };

  const handleToggleColumn = (colId: SquadColumnId) => {
    const current = activeColumns;
    let next: SquadColumnId[];
    if (current.includes(colId)) {
      if (current.length <= 1) return; // keep at least 1 column
      next = current.filter((c) => c !== colId);
    } else {
      next = [...current, colId];
    }
    const updatedMap: PersistedColumnMap = { ...customColumnsMap, [activePresetId]: next };
    setCustomColumnsMap(updatedMap);
    savePersistedSquadColumns(updatedMap);
  };

  const handleResetPresetColumns = () => {
    const updatedMap: PersistedColumnMap = { ...customColumnsMap };
    delete updatedMap[activePresetId];
    setCustomColumnsMap(updatedMap);
    savePersistedSquadColumns(updatedMap);
  };

  const handleResetFilters = () => {
    setPosFilter('ALL');
    setStatusFilter('ALL');
    setExpiryYearFilter('ALL');
    setAvailabilityFilter('ALL');
    setSearch('');
  };

  const handleClearProgressionSnapshots = async () => {
    if (!confirmClearProgression) {
      setConfirmClearProgression(true);
      window.setTimeout(() => setConfirmClearProgression(false), 5000);
      return;
    }
    setConfirmClearProgression(false);
    clearProgressionArchive();
    await clearAllSaveCache();
    setBaselineIdx(0);
    setProgressionRefreshNonce((n) => n + 1);
  };

  const progressionArchive = useMemo(
    () => loadProgressionArchive(),
    [players, progressionRefreshNonce]
  );

  const squadTransferAudit = useMemo(
    () =>
      buildSquadTransferAudit(
        players,
        saveDate,
        finances ?? undefined,
        divisionBenchmarks
      ),
    [players, saveDate, finances, divisionBenchmarks]
  );

  const transferVerdictById = useMemo(
    () =>
      new Map(
        squadTransferAudit.playerAdvice.map((item) => [
          item.player.id,
          item.verdict,
        ])
      ),
    [squadTransferAudit]
  );

  const progressionDiff = useMemo(() => {
    if (progressionArchive.length < 2) return null;
    const safeBaselineIdx = Math.max(
      0,
      Math.min(baselineIdx, progressionArchive.length - 2)
    );
    const baseline = progressionArchive[safeBaselineIdx];
    const latest = progressionArchive[progressionArchive.length - 1];
    return computeProgressionDiff(baseline, latest);
  }, [progressionArchive, baselineIdx]);

  const activeRadarPlayer = useMemo(() => {
    if (players.length === 0) return null;
    return players.find((p) => p.id === radarPlayerId) || players[0];
  }, [players, radarPlayerId]);

  const comparePlayerA = useMemo(() => {
    if (players.length === 0) return null;
    return players.find((p) => p.id === compareAId) || players[0];
  }, [players, compareAId]);

  const comparePlayerB = useMemo(() => {
    if (players.length < 2) return null;
    return (
      players.find((p) => p.id === compareBId && p.id !== comparePlayerA?.id) ||
      players.find((p) => p.id !== comparePlayerA?.id) ||
      players[1]
    );
  }, [players, compareBId, comparePlayerA]);

  const showStatsNotice =
    missingMatchStats && (activePresetId === 'stats' || STATS_SORT_KEYS.has(sortBy));
  const statsNoticeMode: 'fast_sync' | 'preseason' | 'unavailable' = isFastSync
    ? 'fast_sync'
    : typeof playedMatchesCount === 'number' && playedMatchesCount === 0
      ? 'preseason'
      : 'unavailable';


  return (
    <div className="space-y-4">
      <div className="p-3.5 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
    {/* Compact Header + 4-Tab Bar */}
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-3 border-b border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-2 min-w-0">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
          {clubName && clubName !== '--' ? `${clubName} Squad` : 'Squad Database'}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-300">
            {firstTeamCount} 1st Team
          </span>
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300">
            {squadPoolCounts.fullPool} Pool
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 sm:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-full sm:w-auto">
        {(
          [
            { id: 'table', label: 'Squad', icon: Table2 },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'compare', label: 'Compare', icon: GitCompare },
            { id: 'progression', label: 'Progress', icon: TrendingUp },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setViewMode(id)}
            className={`min-w-0 min-h-[44px] sm:min-h-[36px] inline-flex items-center justify-center gap-1 px-1.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === id
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
            <span className="truncate whitespace-nowrap">{label}</span>
          </button>
        ))}
      </div>
    </div>

        {players.length === 0 ? (
    <div className="py-12 text-center space-y-2">
      <Users className="w-8 h-8 text-emerald-500 mx-auto" />
      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
        Awaiting .fm Save — 0 Players Loaded
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
        Zero pre-filled or fabricated players. Drop or select your{' '}
        <span className="font-mono text-emerald-400">.fm</span> save file in the{' '}
        <strong>Hub</strong> tab to decode your squad&apos;s star ratings,
        attributes, durability, contracts, and season stats.
      </p>
    </div>
        ) : viewMode === 'analytics' ? (
          <Suspense fallback={<SquadSubViewSkeleton variant="analytics" />}>
            <SquadAnalyticsView
              players={players}
              matches={matches}
              saveDate={saveDate}
              divisionBenchmarks={divisionBenchmarks}
              governance={governance}
              lastMatchTactic={lastMatchTactic}
              squadPlanner={squadPlanner}
              onSelectPlayer={onSelectPlayer}
              activeRadarPlayer={activeRadarPlayer}
              setRadarPlayerId={setRadarPlayerId}
              squadTransferAudit={squadTransferAudit}
              transferVerdictById={transferVerdictById}
            />
          </Suspense>
        ) : viewMode === 'compare' ? (
          <Suspense fallback={<SquadSubViewSkeleton variant="compare" />}>
            <SquadCompareView
              players={players}
              comparePlayerA={comparePlayerA}
              comparePlayerB={comparePlayerB}
              setCompareAId={setCompareAId}
              setCompareBId={setCompareBId}
            />
          </Suspense>
        ) : viewMode === 'progression' ? (
          <Suspense fallback={<SquadSubViewSkeleton variant="progression" />}>
            <SquadProgressionView
              progressionArchive={progressionArchive}
              progressionDiff={progressionDiff}
              baselineIdx={baselineIdx}
              setBaselineIdx={setBaselineIdx}
              confirmClearProgression={confirmClearProgression}
              handleClearProgressionSnapshots={handleClearProgressionSnapshots}
              progressionDirection={progressionDirection}
              setProgressionDirection={setProgressionDirection}
              showMinorProgressionShifts={showMinorProgressionShifts}
              setShowMinorProgressionShifts={setShowMinorProgressionShifts}
              expandedMinorUids={expandedMinorUids}
              setExpandedMinorUids={setExpandedMinorUids}
              players={players}
              onSelectPlayer={onSelectPlayer}
            />
          </Suspense>
        ) : (
          /* ── MAIN SQUAD LIST VIEW ── */
          <SquadListView
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
            posFilter={posFilter}
            setPosFilter={setPosFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            availabilityFilter={availabilityFilter}
            setAvailabilityFilter={setAvailabilityFilter}
            availableExpiryYears={availableExpiryYears}
            expiryYearFilter={expiryYearFilter}
            setExpiryYearFilter={setExpiryYearFilter}
            handleResetFilters={handleResetFilters}
            activePreset={activePreset}
            handleResetPresetColumns={handleResetPresetColumns}
            activeColumns={activeColumns}
            handleToggleColumn={handleToggleColumn}
            summary={summary}
            showStatsNotice={showStatsNotice}
            statsNoticeMode={statsNoticeMode}
            filteredRows={filteredRows}
            visibleRows={visibleRows}
            onSelectPlayer={onSelectPlayer}
            divisionBenchmarks={divisionBenchmarks}
            lastMatchTactic={lastMatchTactic}
            governance={governance}
            transferVerdictById={transferVerdictById}
            cardMetricColumns={cardMetricColumns}
            handleHeaderSortClick={handleHeaderSortClick}
            setVisibleRowLimit={setVisibleRowLimit}
          />
        )}
      </div>
      {/* Same shared tray as Transfers, so squad members can be compared with scouted targets. */}
      <SelectionCompareDock auditPlayers={players} />
    </div>
  );
};

export default SquadAnalyticsTable;
