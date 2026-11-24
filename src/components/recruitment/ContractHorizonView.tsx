import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { PlayerRecord } from '../../types/fm27';
import { verdictBadgeClass } from './recruitmentBadges';
import type { ContractHorizonSummary, ContractHorizonTier } from './recruitmentTypes';

interface ContractHorizonViewProps {
  contractHorizonSummary: ContractHorizonSummary;
  contractHorizonTier: ContractHorizonTier;
  setContractHorizonTier: Dispatch<SetStateAction<ContractHorizonTier>>;
  onSelectPlayer: (player: PlayerRecord) => void;
}

export const ContractHorizonView: React.FC<ContractHorizonViewProps> = ({
  contractHorizonSummary,
  contractHorizonTier,
  setContractHorizonTier,
  onSelectPlayer,
}) => {
  return (
    <div className="space-y-3">
      {/* 4-Tier Contract Horizon KPI Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {[
          {
            id: 'CRITICAL_6M' as const,
            title: 'Critical (≤ 6 Months)',
            count: contractHorizonSummary.critical6m.length,
            desc: 'Eligible for Bosman pre-contracts now',
            cls: 'border-rose-500/45 bg-rose-950/25 text-rose-300',
          },
          {
            id: 'WARNING_12M' as const,
            title: 'Warning (6–12 Months)',
            count: contractHorizonSummary.warning12m.length,
            desc: 'Final contract year — renew or cash in',
            cls: 'border-amber-500/40 bg-amber-950/20 text-amber-300',
          },
          {
            id: 'WATCH_18M' as const,
            title: 'Watch (12–18 Months)',
            count: contractHorizonSummary.watch18m.length,
            desc: 'Peak transfer-value decision window',
            cls: 'border-sky-500/35 bg-sky-950/20 text-sky-300',
          },
          {
            id: 'SECURE_18M_PLUS' as const,
            title: 'Secure (18+ Months)',
            count: contractHorizonSummary.secure18mPlus.length,
            desc: 'Long-term contract security locked',
            cls: 'border-emerald-500/35 bg-emerald-950/20 text-emerald-300',
          },
        ].map((tier) => (
          <button
            key={tier.id}
            type="button"
            onClick={() =>
              setContractHorizonTier((curr) =>
                curr === tier.id ? 'ALL' : tier.id
              )
            }
            className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${tier.cls} ${
              contractHorizonTier === tier.id
                ? 'ring-2 ring-white/70'
                : 'opacity-90 hover:opacity-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">{tier.title}</span>
              <span className="font-mono text-base font-extrabold">
                {tier.count}
              </span>
            </div>
            <div className="text-[11px] opacity-80 mt-1">
              {tier.desc}
            </div>
          </button>
        ))}
      </div>

      {/* Wage Budget Risk & Free-Transfer Loss Summary Strip */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/75 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-300">
            12m Wage at Risk:{' '}
            <strong className="font-mono text-amber-300">
              £{contractHorizonSummary.wageAtRisk12m.toLocaleString()}/wk
            </strong>
          </span>
          <span className="text-slate-300">
            Key Assets Expiring ≤12m:{' '}
            <strong className="font-mono text-rose-300">
              {contractHorizonSummary.keyAssetsAtRisk.length}
            </strong>
          </span>
          <span className="text-slate-300">
            Projected Wage Freed (Release/Sell):{' '}
            <strong className="font-mono text-emerald-300">
              £{contractHorizonSummary.projectedWageFreed.toLocaleString()}/wk
            </strong>
          </span>
        </div>
        {contractHorizonTier !== 'ALL' && (
          <button
            type="button"
            onClick={() => setContractHorizonTier('ALL')}
            className="rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-200 cursor-pointer"
          >
            Show All ≤18m ({contractHorizonSummary.critical6m.length + contractHorizonSummary.warning12m.length + contractHorizonSummary.watch18m.length})
          </button>
        )}
      </div>

      {contractHorizonSummary.activeList.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
          No players in the selected contract horizon tier.
        </div>
      ) : (
        contractHorizonSummary.activeList.map((item) => {
          const p = item.player;
          const horizonBadge =
            item.monthsLeft !== null && item.monthsLeft <= 6
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              : item.monthsLeft !== null && item.monthsLeft <= 12
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-sky-500/15 text-sky-300 border-sky-500/35';
          return (
            <div
              key={p.id}
              className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-2.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectPlayer(p)}
                  className="text-left min-h-[44px] flex-1 min-w-0 cursor-pointer"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-white hover:text-emerald-300">
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
                </button>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[10px] font-mono font-bold ${horizonBadge}`}
                  >
                    {item.monthsLeft !== null
                      ? `${item.monthsLeft}m Horizon`
                      : '18m+'}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${verdictBadgeClass(
                      item.verdict
                    )}`}
                  >
                    {item.verdict}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <div className="rounded-lg border border-slate-800 bg-slate-950/75 px-2.5 py-1.5 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Expires
                  </div>
                  <div className="mt-0.5 font-mono text-xs font-bold text-amber-300 tabular-nums truncate">
                    {p.expires} ({item.monthsLeft ?? '--'}m)
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/75 px-2.5 py-1.5 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Wage
                  </div>
                  <div className="mt-0.5 font-mono text-xs font-bold text-slate-100 tabular-nums truncate">
                    £{p.wagePw.toLocaleString()}/wk
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/75 px-2.5 py-1.5 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Season Mins
                  </div>
                  <div className="mt-0.5 font-mono text-xs font-bold text-slate-100 tabular-nums truncate">
                    {p.minutes}m ({p.apps || 0} apps)
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/75 px-2.5 py-1.5 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Personality
                  </div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-200 truncate">
                    {p.personality || '—'}
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed">
                {item.recommendedMove}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
