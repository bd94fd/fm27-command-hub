import React, { useState, useMemo, useDeferredValue } from 'react';
import {
  BarChart3,
  GitCompare,
  Search,
  Sparkles,
  Table2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { PlayerRecord } from '../types/fm27';
import { computeFm27EngineMetrics } from '../utils/fmSyncEngine';
import {
  computeProgressionDiff,
  loadProgressionArchive,
} from '../utils/progressionDiff';
import {
  AttributeRadarChart,
  SquadAgeValueScatterPlot,
} from './FootballAnalyticsCharts';

interface SquadAnalyticsTableProps {
  players: PlayerRecord[];
  clubName?: string;
  onSelectPlayer?: (player: PlayerRecord) => void;
}

type SquadViewMode = 'table' | 'analytics' | 'compare' | 'progression';
type PositionGroupFilter = 'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD';

function getPositionGroup(pos: string): Exclude<PositionGroupFilter, 'ALL'> {
  const p = (pos || '').toUpperCase();
  if (p.includes('GK')) return 'GK';
  if (p.includes('ST') || p.includes('CF')) return 'FWD';
  if (/\b(DC|DL|DR|CB|WB)\b|D\s*\(/.test(p)) return 'DEF';
  return 'MID';
}

function extractExpiryYear(expires?: string): string | null {
  if (!expires || expires === 'N/A' || expires === '--') return null;
  const m = expires.match(/\b(20\d{2})\b/);
  return m ? m[1] : null;
}

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

export const SquadAnalyticsTable: React.FC<SquadAnalyticsTableProps> = ({
  players,
  clubName,
  onSelectPlayer,
}) => {
  const [viewMode, setViewMode] = useState<SquadViewMode>('table');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [squadUnitFilter, setSquadUnitFilter] = useState<
    'FIRST_TEAM' | 'YOUTH_RESERVES' | 'ALL'
  >('FIRST_TEAM');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [posFilter, setPosFilter] = useState<PositionGroupFilter>('ALL');
  const [expiryYearFilter, setExpiryYearFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<
    'rating' | 'stars' | 'xGI' | 'speed' | 'wage'
  >('rating');
  const [radarPlayerId, setRadarPlayerId] = useState<string>('');
  const [compareAId, setCompareAId] = useState<string>('');
  const [compareBId, setCompareBId] = useState<string>('');
  const [baselineIdx, setBaselineIdx] = useState<number>(0);

  const firstTeamCount = useMemo(
    () => players.filter((p) => p.teamSlot === undefined || p.teamSlot === 0).length,
    [players]
  );
  const youthReservesCount = players.length - firstTeamCount;
  const effectiveUnitFilter =
    youthReservesCount === 0 || firstTeamCount === 0 ? 'ALL' : squadUnitFilter;

  const progressionArchive = useMemo(
    () => loadProgressionArchive(),
    // Re-read when players change (e.g. after a new .fm save sync)
    [players]
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

  const availableExpiryYears = useMemo(() => {
    const years = new Set<string>();
    for (const p of players) {
      const y = extractExpiryYear(p.expires);
      if (y) years.add(y);
    }
    return Array.from(years).sort();
  }, [players]);

  const filteredPlayers = useMemo(() => {
    const query = deferredSearch.toLowerCase();
    return players
      .filter((p) => {
        const isFirstTeam = p.teamSlot === undefined || p.teamSlot === 0;
        const matchesUnit =
          effectiveUnitFilter === 'ALL' ||
          (effectiveUnitFilter === 'FIRST_TEAM' ? isFirstTeam : !isFirstTeam);
        const matchesSearch =
          (p.name || '').toLowerCase().includes(query) ||
          (p.position || '').toLowerCase().includes(query) ||
          (p.ipRole || '').toLowerCase().includes(query);
        const matchesStatus =
          statusFilter === 'ALL' || p.status === statusFilter;
        const matchesPos =
          posFilter === 'ALL' || getPositionGroup(p.position) === posFilter;
        const matchesExpiry =
          expiryYearFilter === 'ALL' ||
          extractExpiryYear(p.expires) === expiryYearFilter;
        return matchesUnit && matchesSearch && matchesStatus && matchesPos && matchesExpiry;
      })
      .sort((a, b) => {
        if (sortBy === 'stars') {
          return (b.ability || 0) - (a.ability || 0);
        }
        if (sortBy === 'rating') {
          return (b.rating || 0) - (a.rating || 0);
        }
        if (sortBy === 'xGI') {
          return (b.xG || 0) + (b.xA || 0) - ((a.xG || 0) + (a.xA || 0));
        }
        if (sortBy === 'speed') {
          return (
            (b.attributes?.pace || 0) +
            (b.attributes?.acceleration || 0) -
            ((a.attributes?.pace || 0) + (a.attributes?.acceleration || 0))
          );
        }
        return (b.wagePw || 0) - (a.wagePw || 0);
      });
  }, [players, effectiveUnitFilter, deferredSearch, statusFilter, posFilter, expiryYearFilter, sortBy]);

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

  return (
    <div className="space-y-6">
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
        <div className="flex flex-col gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {clubName && clubName !== '--'
                  ? `${clubName} · ${players.length}-Man Squad Database & FM27 Physical Engine Decoder`
                  : `Squad Database (${players.length} Players) & FM27 Physical Engine Decoder`}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Relative star ratings, custom FM27 Engine scores, live disciplinary bans,
                season analytics, wages, contract expiries, and zero-dependency SVG analytics.
              </p>
            </div>

            {/* View Switcher: Table / Analytics / Compare / Progression */}
            <div className="grid grid-cols-2 sm:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Table2 className="w-3.5 h-3.5 shrink-0" />
                <span>Squad Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('analytics')}
                className={`inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  viewMode === 'analytics'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                <span>Analytics</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('compare')}
                className={`inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  viewMode === 'compare'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <GitCompare className="w-3.5 h-3.5 shrink-0" />
                <span>Compare</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('progression')}
                className={`inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  viewMode === 'progression'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                <span>Progression</span>
              </button>
            </div>
          </div>

          {viewMode === 'table' && players.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5">
              {youthReservesCount > 0 && firstTeamCount > 0 && (
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {(
                    [
                      { id: 'FIRST_TEAM', label: `First Team (${firstTeamCount})` },
                      { id: 'YOUTH_RESERVES', label: `Youth / Res (${youthReservesCount})` },
                      { id: 'ALL', label: `All (${players.length})` },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSquadUnitFilter(opt.id)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
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

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="Search squad players"
                  placeholder="Search player, pos, role..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map((grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setPosFilter(grp)}
                    className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      posFilter === grp
                        ? 'bg-white dark:bg-slate-900 text-emerald-500 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {grp}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['ALL', 'Starter', 'Rotation', 'Youth', 'Surplus'] as const).map(
                  (st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        statusFilter === st
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {st}
                    </button>
                  )
                )}
              </div>

              {availableExpiryYears.length > 0 && (
                <select
                  aria-label="Filter by contract expiry year"
                  value={expiryYearFilter}
                  onChange={(e) => setExpiryYearFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="ALL">Expiry: All Years</option>
                  {availableExpiryYears.map((yr) => (
                    <option key={yr} value={yr}>
                      Expires {yr}
                    </option>
                  ))}
                </select>
              )}

              <select
                aria-label="Sort squad players by metric"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as
                      | 'rating'
                      | 'stars'
                      | 'xGI'
                      | 'speed'
                      | 'wage'
                  )
                }
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="rating">Sort: Match Rating</option>
                <option value="stars">Sort: Star Rating</option>
                <option value="xGI">Sort: Total xG + xA</option>
                <option value="speed">Sort: Pace + Acc</option>
                <option value="wage">Sort: Weekly Wage</option>
              </select>
            </div>
          )}
        </div>

        {players.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Users className="w-8 h-8 text-emerald-500 mx-auto" />
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Awaiting .fm Save — 0 Players Loaded
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
              Zero pre-filled or fabricated players. Drop or select your{' '}
              <span className="font-mono text-emerald-400">.fm</span> save file
              in the <strong>Auto-Sync &amp; AI Analyst</strong> tab to decode your
              managed squad&apos;s star ratings, attributes, contracts,
              season stats, and Patch 27.1.0 physical metrics.
            </p>
          </div>
        ) : viewMode === 'analytics' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-5">
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
          <div className="mt-5 space-y-5">
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
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pr-3">Player, Role &amp; Live Note</th>
                  <th className="py-2.5 px-2">Pos</th>
                  <th className="py-2.5 px-2 text-right">Stars / Engine</th>
                  <th className="py-2.5 px-2 text-right">Apps (Mins)</th>
                  <th className="py-2.5 px-2 text-right">Rating</th>
                  <th className="py-2.5 px-2 text-right">Gls (xG)</th>
                  <th className="py-2.5 px-2 text-right">Ast (xA)</th>
                  <th className="py-2.5 px-2 text-right">PrP/90</th>
                  <th className="py-2.5 px-2 text-right">Hdr% / Tck%</th>
                  <th className="py-2.5 px-2 text-right">Pac/Acc/Sta/JR</th>
                  <th className="py-2.5 px-2 text-right">Speed / Jump</th>
                  <th className="py-2.5 pl-2 text-right">Wage (Exp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {filteredPlayers.map((p) => {
                  const engine = computeFm27EngineMetrics(p);
                  const activeBan =
                    Array.isArray(p.activeSuspensions) &&
                    p.activeSuspensions.length > 0
                      ? p.activeSuspensions[0]
                      : null;
                  const optYears = p.contractDetails?.optionalExtensionYears ?? 0;

                  return (
                    <tr
                      key={p.id}
                      onClick={() => onSelectPlayer?.(p)}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${
                        onSelectPlayer ? 'cursor-pointer' : ''
                      }`}
                    >
                      <td className="py-2.5 pr-3 max-w-[330px]">
                        <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                          <span>
                            {p.name}
                          </span>
                          {activeBan && (
                            <span
                              title={`${activeBan.competitionName}: ${activeBan.reason}`}
                              className="rounded bg-rose-500/20 border border-rose-500/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-300"
                            >
                              BANNED ({activeBan.matchesRemaining}m)
                            </span>
                          )}
                          {p.status === 'Injured' && (
                            <span className="rounded bg-amber-500/20 border border-amber-500/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                              INJURED
                            </span>
                          )}
                          {optYears > 0 && (
                            <span className="rounded bg-sky-500/15 border border-sky-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                              +{optYears}y Opt
                            </span>
                          )}
                          <span className="font-normal text-slate-500 dark:text-slate-400">
                            &middot; {p.ipRole} / {p.oopRole} ({p.status})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {p.notes}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {p.position}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-bold text-amber-500">
                          {(p.ability || 3.0).toFixed(1)}★ /{' '}
                          {(p.potential || 3.5).toFixed(1)}★
                        </div>
                        <div className="text-[10px] text-emerald-500">
                          Engine {engine.physicalEngineScore}/100
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {p.apps} ({p.minutes}m)
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {typeof p.rating === 'number' && p.rating > 0
                          ? p.rating.toFixed(2)
                          : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {p.goals ?? 0} ({(p.xG ?? 0).toFixed(2)})
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {p.assists ?? 0} ({(p.xA ?? 0).toFixed(2)})
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {(p.prPassesPer90 ?? 0).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {p.hdrPct ?? 0}% / {p.tckPct ?? 0}%
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {p.attributes?.pace ?? 10}/
                        {p.attributes?.acceleration ?? 10}/
                        {p.attributes?.stamina ?? 10}/
                        {p.attributes?.jumpingReach ?? 10}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {engine.topSpeedMps}m/s (+{engine.jumpHeightMeters}m)
                      </td>
                      <td className="py-2.5 pl-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        £{p.wagePw ?? 0}/wk (
                        {p.expires && p.expires !== 'N/A'
                          ? p.expires.slice(-4)
                          : 'N/A'}
                        )
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {viewMode === 'progression' && (
          <div className="p-4 sm:p-5 space-y-5">
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
        )}
      </div>
    </div>
  );
};

export default SquadAnalyticsTable;
