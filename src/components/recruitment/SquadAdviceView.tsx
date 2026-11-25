import React from 'react';
import { CheckCircle2, GitCompare, Search, Sparkles } from 'lucide-react';
import type { PlayerRecord } from '../../types/fm27';
import type { RecruitmentTarget } from '../../types/fmSave';
import type { ShortlistTargetAdvice } from '../../utils/shortlistAdviceEngine';
import type { TransferActionVerdict } from '../../utils/transferAudit';
import { formatWeeklyWage } from '../../utils/squadViewHelpers';
import {
  formatCompactCurrency,
  formatContractExpiry,
} from '../../utils/squadViewHelpers';
import { verdictBadgeClass } from './recruitmentBadges';
import type { PlayerAdviceItem } from './recruitmentTypes';

interface SquadAdviceViewProps {
  scopedPlayerAdvice: PlayerAdviceItem[];
  scopedCountsByVerdict: Record<TransferActionVerdict, number>;
  verdictFilter: 'ALL' | TransferActionVerdict;
  setVerdictFilter: (value: 'ALL' | TransferActionVerdict) => void;
  search: string;
  setSearch: (value: string) => void;
  filteredAdvice: PlayerAdviceItem[];
  shortlistBySquadPlayerId?: Record<string, ShortlistTargetAdvice[]>;
  onSelectPlayer: (player: PlayerRecord) => void;
  onOpenShortlistTarget?: (target: RecruitmentTarget) => void;
  onCompareShortlistTarget?: (target: RecruitmentTarget) => void;
}

export const SquadAdviceView: React.FC<SquadAdviceViewProps> = ({
  scopedPlayerAdvice,
  scopedCountsByVerdict,
  verdictFilter,
  setVerdictFilter,
  search,
  setSearch,
  filteredAdvice,
  shortlistBySquadPlayerId = {},
  onSelectPlayer,
  onOpenShortlistTarget,
  onCompareShortlistTarget,
}) => {
  return (
    <div className="space-y-3">
      {/* Filter Pills + Search */}
      <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'ALL', label: `All (${scopedPlayerAdvice.length})` },
              {
                id: 'Protect Youth Asset',
                label: `Youth (${scopedCountsByVerdict['Protect Youth Asset']})`,
              },
              {
                id: 'Renew Now',
                label: `Renew (${scopedCountsByVerdict['Renew Now']})`,
              },
              {
                id: 'Sell / Transfer List',
                label: `Sell (${scopedCountsByVerdict['Sell / Transfer List']})`,
              },
              {
                id: 'Replace Before Selling',
                label: `Replace 1st (${scopedCountsByVerdict['Replace Before Selling']})`,
              },
              {
                id: 'Let Expire',
                label: `Let Expire (${scopedCountsByVerdict['Let Expire']})`,
              },
              {
                id: 'Loan Out',
                label: `Loan (${scopedCountsByVerdict['Loan Out']})`,
              },
              {
                id: 'Hold',
                label: `Hold (${scopedCountsByVerdict['Hold']})`,
              },
            ] as const
          ).map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setVerdictFilter(pill.id)}
              className={`min-h-[36px] sm:min-h-[30px] rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition cursor-pointer ${
                verdictFilter === pill.id
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <div className="relative sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter player, pos, tag..."
            className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 sm:py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Player Advice Cards */}
      <div className="space-y-2.5">
        {filteredAdvice.map((item) => {
          const p = item.player;
          const marketValueText =
            p.marketValueCapped || p.marketValueState === 'capped'
              ? 'Not for sale'
              : formatCompactCurrency(p.marketValue);
          const contractUrgencyCls =
            item.monthsLeft !== null && item.monthsLeft <= 6
              ? 'text-rose-300'
              : item.monthsLeft !== null && item.monthsLeft <= 12
                ? 'text-amber-300'
                : 'text-slate-200';
          return (
            <div
              key={p.id}
              className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 sm:p-4 space-y-2.5 hover:border-slate-700 transition"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectPlayer(p)}
                  className="text-left group min-h-[44px] flex-1 min-w-0 cursor-pointer"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-white group-hover:text-emerald-300 transition">
                      {p.name}
                    </span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                      {p.position}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {p.age}y
                    </span>
                    <span className="text-[11px] font-mono font-bold text-amber-300 tabular-nums">
                      {p.ability.toFixed(1)}★/{p.potential.toFixed(1)}★
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-400/80 mt-0.5">
                    Tap for full Player Card →
                  </div>
                </button>

                <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                  {(p.status === 'Surplus' ||
                    /surplus/i.test(
                      p.contractDetails?.promisedPlayingTime || ''
                    )) && (
                    <span
                      title="Player is marked Surplus To Requirements in your FM27 save"
                      className="rounded-full border border-rose-500/60 bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-200"
                    >
                      In-Game: Surplus
                    </span>
                  )}
                  <span
                    title={
                      item.verdict === 'Sell / Transfer List'
                        ? 'App recommendation based on squad depth, wages, and age'
                        : undefined
                    }
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${verdictBadgeClass(
                      item.verdict
                    )}`}
                  >
                    {item.verdict === 'Sell / Transfer List'
                      ? 'App Advice: Sell'
                      : item.verdict}
                  </span>
                </div>
              </div>

              {/* Complete 4-KPI Block (2×2 on phones, 4-across on sm+) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <div className="rounded-lg border border-slate-800 bg-slate-950/75 px-2.5 py-1.5 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Wage
                  </div>
                  <div className="mt-0.5 font-mono text-xs font-bold text-slate-100 tabular-nums truncate">
                    {formatWeeklyWage(p.wagePw)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/75 px-2.5 py-1.5 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Contract
                  </div>
                  <div className={`mt-0.5 font-mono text-xs font-bold tabular-nums truncate ${contractUrgencyCls}`}>
                    {formatContractExpiry(p.expires)}
                    {item.monthsLeft !== null ? ` (${Math.max(0, item.monthsLeft)}m)` : ''}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/75 px-2.5 py-1.5 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Season Mins
                  </div>
                  <div className="mt-0.5 font-mono text-xs font-bold text-slate-100 tabular-nums truncate">
                    {p.apps || 0} apps · {p.minutes}m
                    {typeof p.rating === 'number' && p.rating > 0
                      ? ` · ${p.rating.toFixed(2)}`
                      : ''}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/75 px-2.5 py-1.5 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Market Value
                  </div>
                  <div className="mt-0.5 font-mono text-xs font-bold text-emerald-300 tabular-nums truncate">
                    {marketValueText}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <span
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                    item.abilityReadinessTier === 'squad_star'
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                      : item.abilityReadinessTier === 'starter_level'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : item.abilityReadinessTier === 'rotation_ready'
                          ? 'bg-teal-500/15 border-teal-500/40 text-teal-300'
                          : item.abilityReadinessTier === 'developing_prospect'
                            ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                            : 'bg-purple-500/15 border-purple-500/35 text-purple-300'
                  }`}
                >
                  {item.abilityReadinessLabel}
                </span>
                {item.tags.map((tag, idx) => {
                  const isBannedTag = tag.startsWith('BANNED');
                  const isOptionTag = tag.startsWith('Club Option');
                  const isClauseTag = tag.startsWith('Release Clause');
                  const isPromoteTag =
                    tag === 'Promote to First Team' ||
                    tag.startsWith('Promote to Backup') ||
                    tag === 'U21 · First-Team Ready';
                  return (
                    <span
                      key={idx}
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                        isBannedTag
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-bold'
                          : isPromoteTag
                            ? 'bg-teal-500/20 border-teal-500/50 text-teal-200 font-semibold'
                            : isOptionTag
                              ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                              : isClauseTag
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                : 'bg-slate-800/90 border-slate-700/80 text-slate-300'
                      }`}
                    >
                      {tag}
                    </span>
                  );
                })}
              </div>

              <div className="text-xs font-semibold text-slate-100">
                {item.headline}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                <strong className="text-slate-300">Why:</strong>{' '}
                {item.rationale}
              </p>
              <div className="rounded-lg border border-slate-800/90 bg-slate-950/70 px-3 py-2 text-xs text-emerald-300/95 flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-400" />
                <span>
                  <strong className="text-emerald-300">Action:</strong>{' '}
                  {item.recommendedMove}
                </span>
              </div>

              {/* Inline In-Game Shortlist Upgrade / Replacement Callout */}
              {(() => {
                const shortlistMatches = shortlistBySquadPlayerId[p.id] || [];
                if (shortlistMatches.length === 0) return null;
                const best = shortlistMatches[0];
                return (
                  <div className="rounded-lg border border-amber-500/35 bg-amber-950/20 px-3 py-2.5 text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-bold text-amber-200">
                        <Sparkles className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                        <span>
                          In-Game Shortlist {best.tier === 'direct_xi_upgrade' ? 'Direct Upgrade' : 'Replacement'}:{' '}
                          <span className="text-white">{best.target.name}</span>{' '}
                          <span className="font-mono text-[11px] text-emerald-300">
                            ({best.target.primaryPosition}, {best.target.age}y)
                          </span>
                        </span>
                      </div>
                      <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                        {best.budget.feeLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug">
                      {best.whyUpgradeOrHold}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {onOpenShortlistTarget && (
                        <button
                          type="button"
                          onClick={() => onOpenShortlistTarget(best.target)}
                          className="min-h-[32px] rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 transition cursor-pointer"
                        >
                          Open Shortlist Profile →
                        </button>
                      )}
                      {onCompareShortlistTarget && (
                        <button
                          type="button"
                          onClick={() => onCompareShortlistTarget(best.target)}
                          className="min-h-[32px] inline-flex items-center gap-1 rounded-lg border border-sky-500/35 bg-sky-500/15 hover:bg-sky-500/25 px-2.5 py-1 text-[11px] font-semibold text-sky-200 transition cursor-pointer"
                        >
                          <GitCompare className="h-3 w-3" />
                          Compare vs {p.name.split(' ').slice(-1)[0]}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
};
