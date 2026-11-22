import React, { useState, useMemo, useDeferredValue, useEffect } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Columns3,
  Filter,
  GitCompare,
  LayoutList,
  RotateCcw,
  Search,
  Sparkles,
  Table2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { PlayerRecord } from '../types/fm27';
import {
  computeProgressionDiff,
  loadProgressionArchive,
} from '../utils/progressionDiff';
import {
  AttributeRadarChart,
  SquadAgeValueScatterPlot,
} from './FootballAnalyticsCharts';
import {
  ALL_CUSTOMISABLE_COLUMNS,
  AvailabilityFilter,
  EnrichedSquadRow,
  PersistedColumnMap,
  PositionGroupFilter,
  SQUAD_COLUMNS,
  SQUAD_VIEW_PRESETS,
  SquadColumnId,
  SquadSortKey,
  SquadUnitFilter,
  SquadViewPresetId,
  buildEnrichedSquadRows,
  computeSquadSummary,
  countActiveSecondaryFilters,
  extractExpiryYear,
  filterAndSortSquadRows,
  formatCompactCurrency,
  formatWeeklyWage,
  getDefaultSortDirForKey,
  isSquadMissingMatchStats,
  loadPersistedSquadColumns,
  savePersistedSquadColumns,
} from '../utils/squadViewHelpers';

interface SquadAnalyticsTableProps {
  players: PlayerRecord[];
  clubName?: string;
  nextCompetitionName?: string | null;
  onSelectPlayer?: (player: PlayerRecord) => void;
}

type SquadViewMode = 'table' | 'analytics' | 'compare' | 'progression';
type ListDisplayMode = 'cards' | 'table';

const COMPARE_ROWS: Array<{
  label: string;
  key: keyof PlayerRecord['attributes'];
}> = [
  { label: 'Pace', key: 'pace' },
  { label: 'Acceleration', key: 'acceleration' },
  { label: 'Stamina', key: 'stamina' },
  { label: 'Jumping Reach', key: 'jumpingReach' },
  { label: 'Passing', key: 'passing' },
  { label: 'First Touch', key: 'firstTouch' },
  { label: 'Finishing', key: 'finishing' },
  { label: 'Tackling', key: 'tackling' },
  { label: 'Decisions', key: 'decisions' },
  { label: 'Determination', key: 'determination' },
  { label: 'Work Rate', key: 'workRate' },
  { label: 'Off The Ball', key: 'offTheBall' },
];

const SORT_OPTIONS: Array<{ value: SquadSortKey; label: string }> = [
  { value: 'position', label: 'Position (GK → FWD)' },
  { value: 'stars', label: 'Ability Stars' },
  { value: 'potential', label: 'Potential Stars' },
  { value: 'age', label: 'Age' },
  { value: 'dna', label: 'Club DNA Fit %' },
  { value: 'durability', label: 'Durability' },
  { value: 'engine', label: 'Physical Score' },
  { value: 'rating', label: 'Match Rating' },
  { value: 'apps', label: 'Minutes Played' },
  { value: 'goals', label: 'Goals' },
  { value: 'assists', label: 'Assists' },
  { value: 'xGI', label: 'xG + xA' },
  { value: 'wage', label: 'Weekly Wage' },
  { value: 'value', label: 'Market Value' },
  { value: 'expiry', label: 'Contract Expiry' },
  { value: 'name', label: 'Name (A–Z)' },
];

const STATS_SORT_KEYS: ReadonlySet<SquadSortKey> = new Set([
  'rating',
  'apps',
  'goals',
  'assists',
  'xGI',
]);

function durabilityBadgeClass(tier: EnrichedSquadRow['durability']['tier']): string {
  switch (tier) {
    case 'Ironman':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35';
    case 'Reliable':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/35';
    case 'Manage Load':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
    case 'Fragile':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/35';
  }
}

function renewalBadgeClass(risk: EnrichedSquadRow['contract']['renewalRisk']): string {
  switch (risk) {
    case 'Expiring Soon':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/35';
    case 'Monitor':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
    case 'Secure':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35';
  }
}

function physicalTierClass(tier: EnrichedSquadRow['physical']['tier']): string {
  switch (tier) {
    case 'Elite':
      return 'text-emerald-400';
    case 'Strong':
      return 'text-sky-400';
    case 'Average':
      return 'text-slate-300';
    case 'Below Par':
      return 'text-amber-400';
  }
}

function renderColumnValue(row: EnrichedSquadRow, colId: SquadColumnId): React.ReactNode {
  const p = row.player;
  const attrs = p.attributes;

  switch (colId) {
    case 'pos':
      return (
        <span className="inline-block rounded bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">
          {p.position || '—'}
        </span>
      );
    case 'age':
      return (
        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
          {p.age > 0 ? p.age : '—'}
        </span>
      );
    case 'stars':
      return (
        <span className="font-mono font-bold tabular-nums text-amber-500 whitespace-nowrap">
          {(p.ability || 0).toFixed(1)}★{' '}
          <span className="font-normal text-slate-400">/</span>{' '}
          {(p.potential || 0).toFixed(1)}★
        </span>
      );
    case 'roles':
      return (
        <span className="text-slate-600 dark:text-slate-300 truncate max-w-[200px] inline-block align-bottom">
          {p.ipRole || '—'}
          {p.oopRole ? ` / ${p.oopRole}` : ''}
        </span>
      );
    case 'durability':
      return (
        <span
          title={row.durability.headline}
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${durabilityBadgeClass(
            row.durability.tier
          )}`}
        >
          {row.durability.tier}
        </span>
      );
    case 'dna':
      return (
        <span
          title={`Best DNA archetype: ${row.dnaArchetype}`}
          className={`font-mono font-bold tabular-nums ${
            row.dnaFitPct >= 75
              ? 'text-emerald-400'
              : row.dnaFitPct >= 60
                ? 'text-sky-400'
                : 'text-slate-400'
          }`}
        >
          {row.dnaFitPct}%
        </span>
      );
    case 'availability':
      if (row.isBanned) {
        return (
          <span
            title={row.activeBanTooltip || 'Suspended'}
            className="inline-flex rounded bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.5 text-[10px] font-bold text-rose-300"
          >
            Banned ({row.activeBanMatches}m)
          </span>
        );
      }
      if (row.hasOtherCompBan) {
        return (
          <span
            title={row.activeBanTooltip || 'Other-competition ban only — eligible for next match'}
            className="inline-flex rounded bg-amber-500/15 border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 whitespace-nowrap"
          >
            {row.otherCompBanLabel || 'Cup Ban'} ({row.activeBanMatches}m)
          </span>
        );
      }
      if (row.isInjured) {
        return (
          <span className="inline-flex rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
            Injured
          </span>
        );
      }
      if (p.onLoan) {
        return (
          <span className="inline-flex rounded bg-indigo-500/20 border border-indigo-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
            On Loan
          </span>
        );
      }
      return <span className="text-emerald-400 font-medium">Available</span>;
    case 'staminaFit':
      return (
        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">
          {row.durability.stamina} /{' '}
          {row.durability.naturalFitness !== null ? row.durability.naturalFitness : '—'}
        </span>
      );
    case 'badges': {
      const badges = p.scoutBadges || [];
      if (badges.length === 0) return <span className="text-slate-500">—</span>;
      return (
        <div className="flex flex-wrap gap-1 max-w-[190px]">
          {badges.slice(0, 2).map((b) => (
            <span
              key={b}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap border ${
                b === 'Injury-Prone'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {b}
            </span>
          ))}
        </div>
      );
    }
    case 'foot':
      return (
        <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">
          {p.preferredFoot || '—'}
        </span>
      );
    case 'condSharp': {
      const cond = typeof p.condition === 'number' && Number.isFinite(p.condition) ? `${Math.round(p.condition)}%` : '—';
      const sharp = typeof p.sharpness === 'number' && Number.isFinite(p.sharpness) ? `${Math.round(p.sharpness)}%` : '—';
      if (cond === '—' && sharp === '—') return <span className="text-slate-500">—</span>;
      return (
        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">
          {cond} / {sharp}
        </span>
      );
    }
    case 'morale':
      return (
        <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">
          {p.morale || '—'}
        </span>
      );
    case 'apps':
      return (
        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {row.hasPlayed ? `${p.apps} (${p.minutes}m)` : '—'}
        </span>
      );
    case 'rating':
      return (
        <span className="font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          {typeof p.rating === 'number' && p.rating > 0 ? p.rating.toFixed(2) : '—'}
        </span>
      );
    case 'goalsXg':
      return (
        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {row.hasPlayed ? `${p.goals ?? 0} (${(p.xG ?? 0).toFixed(2)})` : '—'}
        </span>
      );
    case 'assistsXa':
      return (
        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {row.hasPlayed ? `${p.assists ?? 0} (${(p.xA ?? 0).toFixed(2)})` : '—'}
        </span>
      );
    case 'prPasses':
      return (
        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
          {row.hasPlayed && (p.prPassesPer90 ?? 0) > 0
            ? (p.prPassesPer90 ?? 0).toFixed(2)
            : '—'}
        </span>
      );
    case 'duels':
      return (
        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {row.hasPlayed && ((p.hdrPct ?? 0) > 0 || (p.tckPct ?? 0) > 0)
            ? `${p.hdrPct ?? 0}% / ${p.tckPct ?? 0}%`
            : '—'}
        </span>
      );
    case 'last5': {
      const avg = p.last5Form?.averageRating;
      if (!avg || avg <= 0) return <span className="text-slate-500">—</span>;
      const arrow =
        p.last5Form?.trend === 'improving'
          ? '↗'
          : p.last5Form?.trend === 'declining'
            ? '↘'
            : '→';
      return (
        <span className="font-mono tabular-nums text-slate-200 whitespace-nowrap">
          {avg.toFixed(2)} {arrow}
        </span>
      );
    }
    case 'engine':
      return (
        <span
          className={`font-mono font-bold tabular-nums whitespace-nowrap ${physicalTierClass(
            row.physical.tier
          )}`}
        >
          {row.physical.score}/100{' '}
          <span className="text-[10px] font-sans font-semibold opacity-80">
            {row.physical.tier}
          </span>
        </span>
      );
    case 'physCore':
      return (
        <span className="font-mono tabular-nums text-slate-800 dark:text-slate-100 whitespace-nowrap">
          {attrs?.pace ?? 10}/{attrs?.acceleration ?? 10}/{attrs?.stamina ?? 10}/
          {attrs?.jumpingReach ?? 10}
        </span>
      );
    case 'speedJump':
      return (
        <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
          {row.physical.topSpeedKmh}km/h (+{row.physical.jumpHeightMeters}m)
        </span>
      );
    case 'heightFoot':
      return (
        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {p.heightCm ? `${p.heightCm}cm` : '—'} ·{' '}
          {p.preferredFoot ? p.preferredFoot.slice(0, 1) : '—'}
        </span>
      );
    case 'mentalKey':
      return (
        <span className="font-mono tabular-nums text-slate-800 dark:text-slate-100 whitespace-nowrap">
          {attrs?.determination ?? 10}/{attrs?.workRate ?? 10}/{attrs?.decisions ?? 10}/
          {attrs?.offTheBall ?? 10}
        </span>
      );
    case 'techKey':
      if (row.isGoalkeeper) {
        return (
          <span
            title="GK: Reflexes / Handling / Command / Aerial Reach"
            className="font-mono tabular-nums text-sky-300 whitespace-nowrap"
          >
            GK {attrs?.reflexes ?? 10}/{attrs?.handling ?? 10}/{attrs?.commandOfArea ?? 10}/
            {attrs?.aerialReach ?? 10}
          </span>
        );
      }
      return (
        <span
          title="Passing / First Touch / Finishing / Tackling"
          className="font-mono tabular-nums text-slate-800 dark:text-slate-100 whitespace-nowrap"
        >
          {attrs?.passing ?? 10}/{attrs?.firstTouch ?? 10}/{attrs?.finishing ?? 10}/
          {attrs?.tackling ?? 10}
        </span>
      );
    case 'wage':
      return (
        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">
          {formatWeeklyWage(p.wagePw)}
        </span>
      );
    case 'expiry':
      return (
        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {row.expiryYear || '—'}
          {row.optYears > 0 ? (
            <span className="ml-1 text-[10px] text-sky-400">+{row.optYears}y</span>
          ) : null}
        </span>
      );
    case 'renewalRisk':
      return (
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${renewalBadgeClass(
            row.contract.renewalRisk
          )}`}
        >
          {row.contract.renewalRisk}
        </span>
      );
    case 'value':
      return (
        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">
          {formatCompactCurrency(p.marketValue)}
        </span>
      );
    case 'status':
      return (
        <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">
          {p.status}
        </span>
      );
    case 'devStage':
      return (
        <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">
          {row.development.stage === 'High-Upside Prospect'
            ? 'Prospect'
            : row.development.stage}
        </span>
      );
  }
}

export const SquadAnalyticsTable: React.FC<SquadAnalyticsTableProps> = ({
  players,
  clubName,
  nextCompetitionName = null,
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
    () => buildEnrichedSquadRows(players, undefined, nextCompetitionName),
    [players, nextCompetitionName]
  );

  const firstTeamCount = useMemo(
    () => players.filter((p) => p.teamSlot === undefined || p.teamSlot === 0).length,
    [players]
  );
  const youthReservesCount = players.length - firstTeamCount;
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

  const progressionArchive = useMemo(() => loadProgressionArchive(), [players]);

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

  const showFastSyncNotice =
    missingMatchStats && (activePresetId === 'stats' || STATS_SORT_KEYS.has(sortBy));

  return (
    <div className="space-y-4">
      <div className="p-3.5 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
        {/* Compact Header + 4-Tab Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
              {clubName && clubName !== '--' ? `${clubName} Squad` : 'Squad Database'}
            </h2>
            <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300">
              {players.length}
            </span>
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
                className={`inline-flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  viewMode === id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0 hidden xs:inline sm:inline" />
                <span>{label}</span>
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4">
            <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  6-Axis Attribute Radar
                </span>
                <select
                  aria-label="Select player for attribute radar"
                  value={activeRadarPlayer?.id || ''}
                  onChange={(e) => setRadarPlayerId(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 max-w-[200px]"
                >
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.position})
                    </option>
                  ))}
                </select>
              </div>
              {activeRadarPlayer && (
                <AttributeRadarChart player={activeRadarPlayer} size={270} />
              )}
            </div>

            <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4">
              <SquadAgeValueScatterPlot
                players={players}
                selectedPlayerId={activeRadarPlayer?.id || null}
                onSelectPlayer={(p) => {
                  setRadarPlayerId(p.id);
                  onSelectPlayer?.(p);
                }}
              />
            </div>
          </div>
        ) : viewMode === 'compare' ? (
          <div className="mt-4 space-y-5">
            {players.length < 2 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Load at least 2 players to run a side-by-side radar comparison.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">
                      Player A (Emerald)
                    </label>
                    <select
                      aria-label="Select Player A to compare"
                      value={comparePlayerA?.id || ''}
                      onChange={(e) => setCompareAId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-emerald-500/40 rounded-lg text-slate-100"
                    >
                      {players.map((p) => (
                        <option key={`a-${p.id}`} value={p.id}>
                          {p.name} ({p.position} · {p.ability.toFixed(1)}★ · £{p.wagePw}/wk)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-sky-400 mb-1">
                      Player B (Sky Blue)
                    </label>
                    <select
                      aria-label="Select Player B to compare"
                      value={comparePlayerB?.id || ''}
                      onChange={(e) => setCompareBId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-sky-500/40 rounded-lg text-slate-100"
                    >
                      {players.map((p) => (
                        <option key={`b-${p.id}`} value={p.id}>
                          {p.name} ({p.position} · {p.ability.toFixed(1)}★ · £{p.wagePw}/wk)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {comparePlayerA && comparePlayerB && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-950/60 p-4 flex justify-center">
                      <AttributeRadarChart
                        player={comparePlayerA}
                        comparePlayer={comparePlayerB}
                        size={290}
                      />
                    </div>
                    <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-950/60 p-4 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="py-2 text-left">Attribute</th>
                            <th className="py-2 text-right text-emerald-300">
                              {comparePlayerA.name}
                            </th>
                            <th className="py-2 text-right text-sky-300">
                              {comparePlayerB.name}
                            </th>
                            <th className="py-2 text-right">Delta (A − B)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70 font-mono">
                          {COMPARE_ROWS.map((row) => {
                            const va = Number(comparePlayerA.attributes?.[row.key] ?? 10);
                            const vb = Number(comparePlayerB.attributes?.[row.key] ?? 10);
                            const diff = va - vb;
                            return (
                              <tr key={row.key}>
                                <td className="py-1.5 font-sans text-slate-300">
                                  {row.label}
                                </td>
                                <td className="py-1.5 text-right text-emerald-300 font-semibold">
                                  {va}
                                </td>
                                <td className="py-1.5 text-right text-sky-300 font-semibold">
                                  {vb}
                                </td>
                                <td
                                  className={`py-1.5 text-right font-bold ${
                                    diff > 0
                                      ? 'text-emerald-400'
                                      : diff < 0
                                        ? 'text-rose-400'
                                        : 'text-slate-500'
                                  }`}
                                >
                                  {diff > 0 ? `+${diff}` : diff}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : viewMode === 'progression' ? (
          <div className="pt-4 space-y-5">
            {progressionArchive.length < 2 || !progressionDiff ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-6 text-center space-y-2">
                <TrendingUp className="w-6 h-6 text-emerald-500 mx-auto" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Awaiting Multi-Save Progression Baseline
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                  {progressionArchive.length === 1
                    ? `1 snapshot captured (${progressionArchive[0].saveDate}). Sync a second .fm save from a later in-game date to unlock attribute risers/fallers, Mentoring Determination Jumps, and Youth Intake Radar.`
                    : 'Sync at least two .fm saves from different in-game dates to track rolling 30-save progression diffs.'}
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    Comparing{' '}
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {progressionDiff.baselineSaveDate}
                    </span>{' '}
                    &rarr;{' '}
                    <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {progressionDiff.latestSaveDate}
                    </span>{' '}
                    ({progressionArchive.length}/30 archived saves)
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span>Baseline:</span>
                    <select
                      aria-label="Baseline snapshot"
                      value={Math.min(baselineIdx, progressionArchive.length - 2)}
                      onChange={(e) => setBaselineIdx(Number(e.target.value))}
                      className="px-2.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      {progressionArchive.slice(0, -1).map((snap, idx) => (
                        <option key={snap.saveDate} value={idx}>
                          {snap.saveDate} ({Object.keys(snap.players).length} players)
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Mentoring Determination Jumps */}
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Mentoring Determination Jumps (+2 or more)
                    </h3>
                    <span className="text-xs font-mono text-amber-400">
                      {progressionDiff.mentoringDeterminationJumps.length}
                    </span>
                  </div>
                  {progressionDiff.mentoringDeterminationJumps.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      No Determination jumps of +2 or more between these saves.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {progressionDiff.mentoringDeterminationJumps.map((j) => (
                        <span
                          key={`${j.uid}-${j.attributeName}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30"
                        >
                          <span>{j.playerName}</span>
                          <span className="font-mono font-bold">
                            {j.fromValue}&rarr;{j.toValue} (+{j.delta})
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Risers & Fallers */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                        Top Attribute Risers
                      </h3>
                      <span className="text-xs font-mono text-emerald-400">
                        {progressionDiff.risers.length}
                      </span>
                    </div>
                    {progressionDiff.risers.length === 0 ? (
                      <p className="text-xs text-slate-500">No attribute rises recorded.</p>
                    ) : (
                      <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                        {progressionDiff.risers.slice(0, 12).map((r) => (
                          <li
                            key={`${r.uid}-${r.attributeName}`}
                            className="py-1.5 flex items-center justify-between gap-2"
                          >
                            <span className="truncate text-slate-900 dark:text-slate-100">
                              {r.playerName}{' '}
                              <span className="text-slate-500">({r.attributeName})</span>
                            </span>
                            <span className="font-mono font-semibold text-emerald-500 shrink-0">
                              {r.fromValue}&rarr;{r.toValue} (+{r.delta})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400">
                        Attribute Fallers
                      </h3>
                      <span className="text-xs font-mono text-rose-400">
                        {progressionDiff.fallers.length}
                      </span>
                    </div>
                    {progressionDiff.fallers.length === 0 ? (
                      <p className="text-xs text-slate-500">No attribute declines recorded.</p>
                    ) : (
                      <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                        {progressionDiff.fallers.slice(0, 12).map((f) => (
                          <li
                            key={`${f.uid}-${f.attributeName}`}
                            className="py-1.5 flex items-center justify-between gap-2"
                          >
                            <span className="truncate text-slate-900 dark:text-slate-100">
                              {f.playerName}{' '}
                              <span className="text-slate-500">({f.attributeName})</span>
                            </span>
                            <span className="font-mono font-semibold text-rose-400 shrink-0">
                              {f.fromValue}&rarr;{f.toValue} ({f.delta})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Youth Intake / Newgen Radar */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400">
                        Youth Intake &amp; Newgen Radar (Ranked by Stars · Club DNA Fit % · Physical Score)
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Brand-new player UIDs since {progressionDiff.baselineSaveDate} — strictly zero raw CA/PA.
                      </p>
                    </div>
                    <span className="text-xs font-mono text-sky-400">
                      {progressionDiff.youthIntakeHighlights.length} U18 /{' '}
                      {progressionDiff.newgenRadar.length} total
                    </span>
                  </div>
                  {progressionDiff.newgenRadar.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No new player UIDs added since {progressionDiff.baselineSaveDate}.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {progressionDiff.newgenRadar.map((n, idx) => {
                        const matchedPlayer = players.find((p) => p.uid === n.uid);
                        return (
                          <button
                            key={n.uid}
                            type="button"
                            onClick={() => matchedPlayer && onSelectPlayer?.(matchedPlayer)}
                            className={`text-left rounded-xl p-2.5 text-xs border transition ${
                              n.isYouthIntakeHighlight
                                ? 'bg-sky-500/10 text-sky-200 border-sky-500/40 hover:border-sky-400'
                                : 'bg-slate-800/50 text-slate-300 border-slate-700 hover:border-slate-600'
                            } ${matchedPlayer && onSelectPlayer ? 'cursor-pointer' : ''}`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-bold text-white truncate">
                                #{idx + 1} {n.playerName}
                              </span>
                              {n.isYouthIntakeHighlight && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-sky-500/30 text-sky-100 shrink-0">
                                  U18 INTAKE
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                              <span className="text-slate-300">
                                {n.position} · Age {n.age}
                              </span>
                              <span className="text-amber-400 font-bold">
                                {n.abilityStars.toFixed(1)}★/{n.potentialStars.toFixed(1)}★
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                              <span className="rounded bg-emerald-500/15 border border-emerald-500/35 px-1.5 py-0.5 text-emerald-300 font-semibold">
                                DNA Fit {n.clubDnaFitPct}% ({n.bestArchetypeShortLabel})
                              </span>
                              <span className="rounded bg-indigo-500/15 border border-indigo-500/35 px-1.5 py-0.5 text-indigo-300">
                                Phys {n.physicalEngineScore}/100
                              </span>
                              <span className="text-slate-400">
                                Det {n.determination} · Pac {n.pace}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          /* ── MAIN SQUAD LIST VIEW ── */
          <div className="mt-3 space-y-2.5">
            {/* Row 1: Squad Unit + FM-Style View Presets */}
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

              {/* View Preset Pills (horizontally scrollable on mobile) */}
              <div
                role="tablist"
                aria-label="Squad view presets"
                className="flex items-center gap-1 overflow-x-auto pb-0.5 -mx-1 px-1"
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

            {/* Row 2: Search + Sort + Filters Toggle + Columns Picker + Cards/Table Toggle */}
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

            {/* Collapsible Filter Drawer */}
            {filtersOpen && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
                    {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map((grp) => (
                      <button
                        key={grp}
                        type="button"
                        onClick={() => setPosFilter(grp)}
                        className={`px-2 py-1 text-[11px] font-semibold rounded-md transition cursor-pointer ${
                          posFilter === grp
                            ? 'bg-white dark:bg-slate-900 text-emerald-500 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        {grp}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg overflow-x-auto">
                    {(['ALL', 'Starter', 'Rotation', 'Youth', 'Surplus'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        className={`px-2 py-1 text-[11px] font-medium rounded-md transition whitespace-nowrap cursor-pointer ${
                          statusFilter === st
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg overflow-x-auto">
                    {(
                      [
                        { id: 'ALL', label: 'All Avail.' },
                        { id: 'AVAILABLE', label: 'Available' },
                        { id: 'UNAVAILABLE', label: 'Banned / Inj' },
                        { id: 'EXPIRING', label: 'Expiring ≤6m' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAvailabilityFilter(opt.id)}
                        className={`px-2 py-1 text-[11px] font-medium rounded-md transition whitespace-nowrap cursor-pointer ${
                          availabilityFilter === opt.id
                            ? 'bg-white dark:bg-slate-900 text-emerald-500 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {availableExpiryYears.length > 0 && (
                    <select
                      aria-label="Filter by contract expiry year"
                      value={expiryYearFilter}
                      onChange={(e) => setExpiryYearFilter(e.target.value)}
                      className="px-2.5 py-1 text-[11px] font-medium bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    >
                      <option value="ALL">Expiry: All Years</option>
                      {availableExpiryYears.map((yr) => (
                        <option key={yr} value={yr}>
                          Expires {yr}
                        </option>
                      ))}
                    </select>
                  )}

                  {(activeSecondaryFilterCount > 0 || search) && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 cursor-pointer ml-auto"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Collapsible Custom Columns Picker */}
            {columnsOpen && (
              <div className="rounded-xl border border-sky-500/30 bg-slate-50 dark:bg-slate-950/70 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Columns for {activePreset.label}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {activePreset.description}
                    </div>
                  </div>
                  {hasCustomColumnsForPreset && (
                    <button
                      type="button"
                      onClick={handleResetPresetColumns}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300 shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset Preset
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_CUSTOMISABLE_COLUMNS.map((colId) => {
                    const meta = SQUAD_COLUMNS[colId];
                    const checked = activeColumns.includes(colId);
                    return (
                      <button
                        key={colId}
                        type="button"
                        onClick={() => handleToggleColumn(colId)}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium border transition cursor-pointer ${
                          checked
                            ? 'bg-sky-500/20 border-sky-500/50 text-sky-200'
                            : 'bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {checked ? '✓ ' : '+ '}
                        {meta.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Compact Live Summary Strip */}
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

            {/* Fast Sync Season Stats Notice (shown only when viewing/sorting by stats) */}
            {showFastSyncNotice && (
              <div className="rounded-lg border border-amber-500/35 bg-amber-950/25 px-3 py-2 text-xs text-amber-200">
                <strong>Season match stats not in this snapshot:</strong> This save was
                loaded with Fast Sync, which skips match-by-match stats to stay fast on
                mobile. Re-import with <strong>Full Sync</strong> in the{' '}
                <strong>Hub</strong> tab to populate appearances, ratings, goals, and xG.
              </div>
            )}

            {/* Empty Filter Result */}
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
              /* ── MOBILE-FIRST COMPACT CARD LIST ── */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {visibleRows.map((row) => {
                  const p = row.player;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelectPlayer?.(p)}
                      className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-emerald-500/50 dark:hover:bg-slate-800/40 p-3 transition cursor-pointer"
                    >
                      {/* Top line: Shirt #, Name, Pos, Age, Stars */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                          {row.shirtNumber !== null && (
                            <span className="font-mono text-[11px] font-bold text-slate-400">
                              #{row.shirtNumber}
                            </span>
                          )}
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                            {p.name}
                          </span>
                          <span className="rounded bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:text-slate-200">
                            {p.position}
                          </span>
                          {p.age > 0 && (
                            <span className="text-[11px] font-mono text-slate-400">
                              {p.age}y
                            </span>
                          )}
                        </div>
                        <div className="shrink-0 font-mono text-xs font-bold text-amber-500 tabular-nums">
                          {(p.ability || 0).toFixed(1)}★
                          <span className="text-slate-500 font-normal">
                            /{(p.potential || 0).toFixed(1)}★
                          </span>
                        </div>
                      </div>

                      {/* Second line: Roles + Status/Availability badges */}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {(p.ipRole || p.oopRole) && (
                          <span className="text-slate-500 dark:text-slate-400 truncate max-w-full">
                            {p.ipRole}
                            {p.oopRole ? ` / ${p.oopRole}` : ''}
                          </span>
                        )}
                        {row.isBanned && (
                          <span className="rounded bg-rose-500/20 border border-rose-500/45 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                            BANNED ({row.activeBanMatches}m)
                          </span>
                        )}
                        {row.isInjured && (
                          <span className="rounded bg-amber-500/20 border border-amber-500/45 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                            INJURED
                          </span>
                        )}
                        {p.onLoan && (
                          <span className="rounded bg-indigo-500/20 border border-indigo-500/45 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                            LOAN
                          </span>
                        )}
                        {row.optYears > 0 && (
                          <span className="rounded bg-sky-500/15 border border-sky-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                            +{row.optYears}y Opt
                          </span>
                        )}
                      </div>

                      {row.cleanNote && (
                        <div className="mt-1 text-[11px] text-slate-400 truncate">
                          {row.cleanNote}
                        </div>
                      )}

                      {/* Preset Metric Chips */}
                      <div
                        className={`mt-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800/80 grid gap-2 ${
                          cardMetricColumns.length >= 4
                            ? 'grid-cols-2 sm:grid-cols-4'
                            : 'grid-cols-3'
                        }`}
                      >
                        {cardMetricColumns.map((colId) => {
                          const meta = SQUAD_COLUMNS[colId];
                          return (
                            <div key={colId} className="min-w-0">
                              <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                                {meta.shortLabel}
                              </div>
                              <div className="mt-0.5 text-xs truncate">
                                {renderColumnValue(row, colId)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* ── FROZEN-COLUMN TABLE VIEW ── */
              <div className="overflow-x-auto -mx-1 px-1 rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <th className="sticky left-0 z-20 bg-slate-50 dark:bg-slate-950 py-2.5 pl-3 pr-3 border-r border-slate-200 dark:border-slate-800 min-w-[170px] max-w-[240px]">
                        <button
                          type="button"
                          onClick={() => handleHeaderSortClick('name')}
                          className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
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
                            className={`py-2.5 px-3 whitespace-nowrap ${
                              meta.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {meta.sortKey ? (
                              <button
                                type="button"
                                onClick={() => handleHeaderSortClick(meta.sortKey!)}
                                className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer ${
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
                          <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 py-2.5 pl-3 pr-3 border-r border-slate-200 dark:border-slate-800 min-w-[170px] max-w-[240px]">
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
                            </div>
                            {showRolesSubline && (p.ipRole || p.oopRole) && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {p.ipRole}
                                {p.oopRole ? ` / ${p.oopRole}` : ''}
                              </div>
                            )}
                            {row.cleanNote && (
                              <div className="text-[10px] text-slate-400 truncate">
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
            )}

            {filteredRows.length > visibleRows.length && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
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
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/25 cursor-pointer transition"
                  >
                    Show All ({filteredRows.length})
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SquadAnalyticsTable;
