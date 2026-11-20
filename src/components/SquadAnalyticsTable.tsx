import React, { useState, useMemo } from 'react';
import { Search, Users } from 'lucide-react';
import { PlayerRecord } from '../types/fm27';
import { computeFm27EngineMetrics } from '../utils/fmSyncEngine';

interface SquadAnalyticsTableProps {
  players: PlayerRecord[];
  clubName?: string;
  onSelectPlayer?: (player: PlayerRecord) => void;
}

export const SquadAnalyticsTable: React.FC<SquadAnalyticsTableProps> = ({
  players,
  clubName,
  onSelectPlayer,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<
    'rating' | 'stars' | 'xGI' | 'speed' | 'wage'
  >('rating');

  const filteredPlayers = useMemo(() => {
    const query = search.toLowerCase();
    return players
      .filter((p) => {
        const matchesSearch =
          (p.name || '').toLowerCase().includes(query) ||
          (p.position || '').toLowerCase().includes(query) ||
          (p.ipRole || '').toLowerCase().includes(query);
        const matchesStatus =
          statusFilter === 'ALL' || p.status === statusFilter;
        return matchesSearch && matchesStatus;
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
  }, [players, search, statusFilter, sortBy]);

  return (
    <div className="space-y-6">
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {clubName && clubName !== '--'
                ? `${clubName} · ${players.length}-Man Squad Database & FM27 Physical Engine Decoder`
                : `Squad Database (${players.length} Players) & FM27 Physical Engine Decoder`}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Relative star ratings, custom FM27 Engine scores, complete technical &amp; physical
              attributes, season analytics (Gls, xG, Ast, xA, PrP/90), wages, and contract expiries.
              Click any player row to inspect full IP/OOP role fit &amp; pitch familiarity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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
                  return (
                    <tr
                      key={p.id}
                      onClick={() => onSelectPlayer?.(p)}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${
                        onSelectPlayer ? 'cursor-pointer' : ''
                      }`}
                    >
                      <td className="py-2.5 pr-3 max-w-[310px]">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          #{p.number} {p.name}{' '}
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
      </div>
    </div>
  );
};
