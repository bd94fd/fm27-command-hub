import React from 'react';
import type { EnrichedSquadRow, SquadColumnId } from '../../utils/squadViewHelpers';
import { formatCompactCurrency, formatWeeklyWage } from '../../utils/squadViewHelpers';

export function durabilityBadgeClass(tier: EnrichedSquadRow['durability']['tier']): string {
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

export function renewalBadgeClass(risk: EnrichedSquadRow['contract']['renewalRisk']): string {
  switch (risk) {
    case 'Expiring Soon':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/35';
    case 'Monitor':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
    case 'Secure':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35';
  }
}

export function physicalTierClass(tier: EnrichedSquadRow['physical']['tier']): string {
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

export function renderColumnValue(row: EnrichedSquadRow, colId: SquadColumnId): React.ReactNode {
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
      if (p.marketValueCapped || p.marketValueState === 'capped') {
        return (
          <span
            className="font-mono text-[11px] text-amber-600 dark:text-amber-300 whitespace-nowrap"
            title="Stored at FM27's £300m ceiling (Not for sale / placeholder valuation)"
          >
            Not for sale
          </span>
        );
      }
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

