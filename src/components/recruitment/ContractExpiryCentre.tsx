import React, { useState } from 'react';
import type {
  ContractCentreRow,
  ContractCentreSummary,
  ContractDecision,
} from '../../utils/contractExpiryCentre';
import { formatCompactCurrency, formatWeeklyWage } from '../../utils/squadViewHelpers';

interface ContractExpiryCentreProps {
  summary: ContractCentreSummary;
  onSetDecision: (rowKey: string, decision: ContractDecision | null) => void;
  onSelectPlayer?: (playerId: string) => void;
  onClearAll: () => void;
}

const DECISION_LABELS: Array<{ id: ContractDecision; label: string; active: string }> = [
  { id: 'renew', label: 'Renew', active: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/60' },
  { id: 'sell', label: 'Sell', active: 'bg-sky-500/25 text-sky-200 border-sky-400/60' },
  { id: 'release', label: 'Release', active: 'bg-rose-500/25 text-rose-200 border-rose-400/60' },
];

const money = (value: number): string => `${formatCompactCurrency(value)}/wk`;

/** A phone should not scroll past thirty rows to reach the rest of the Contracts view. */
const COLLAPSED_ROW_COUNT = 6;

const urgencyBadge = (row: ContractCentreRow): { text: string; cls: string } => {
  if (row.kind === 'staff' && row.daysLeft !== null && row.daysLeft <= 0) {
    return { text: 'Expired', cls: 'border-rose-500/45 bg-rose-500/15 text-rose-300' };
  }
  const months = row.monthsLeft;
  const text = months === null ? 'Unknown' : `${months} month${months === 1 ? '' : 's'}`;
  return row.urgency === 'critical'
    ? { text, cls: 'border-rose-500/45 bg-rose-500/15 text-rose-300' }
    : { text, cls: 'border-amber-500/45 bg-amber-500/15 text-amber-300' };
};

export const ContractExpiryCentre: React.FC<ContractExpiryCentreProps> = ({
  summary,
  onSetDecision,
  onSelectPlayer,
  onClearAll,
}) => {
  const plannedCount = summary.renewedCount + summary.soldCount + summary.releasedCount;
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? summary.rows : summary.rows.slice(0, COLLAPSED_ROW_COUNT);
  const hiddenCount = summary.rows.length - visibleRows.length;

  return (
    <section
      aria-labelledby="contract-centre-heading"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-3.5 space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id="contract-centre-heading"
            className="text-sm font-bold text-slate-900 dark:text-white"
          >
            Expiring soon — players and staff
          </h3>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {summary.rows.length === 0
              ? 'Nobody is inside the warning window in this save.'
              : `${summary.playerCount} player${summary.playerCount === 1 ? '' : 's'} and ${summary.staffCount} staff member${summary.staffCount === 1 ? '' : 's'} are inside 12 months. Pick Renew, Sell or Release and the money below updates.`}
          </p>
        </div>
        {plannedCount > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="min-h-11 shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Clear plan ({plannedCount})
          </button>
        )}
      </div>

      {summary.rows.length === 0 ? null : (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-1.5 min-w-0">
              <dt className="text-2xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Wage at risk
              </dt>
              <dd className="mt-0.5 font-mono text-xs font-bold text-amber-600 dark:text-amber-300 tabular-nums truncate">
                {money(summary.weeklyWageAtRisk)}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-1.5 min-w-0">
              <dt className="text-2xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Kept if renewed
              </dt>
              <dd className="mt-0.5 font-mono text-xs font-bold text-slate-800 dark:text-slate-100 tabular-nums truncate">
                {money(summary.renewedWeeklyWage)}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-1.5 min-w-0">
              <dt className="text-2xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Freed if sold or released
              </dt>
              <dd className="mt-0.5 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-300 tabular-nums truncate">
                {money(summary.soldWeeklyWage + summary.releasedWeeklyWage)}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-1.5 min-w-0">
              <dt className="text-2xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Fees to recover
              </dt>
              <dd className="mt-0.5 font-mono text-xs font-bold text-sky-600 dark:text-sky-300 tabular-nums truncate">
                {formatCompactCurrency(summary.soldValue)}
              </dd>
            </div>
          </dl>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            {summary.undecidedCount === 0
              ? 'Every expiring contract has a plan.'
              : `${summary.undecidedCount} still undecided, worth ${money(summary.undecidedWeeklyWage)}.`}
            {summary.wageUnknownCount > 0 &&
              ` ${summary.wageUnknownCount} contract${summary.wageUnknownCount === 1 ? ' has' : 's have'} no readable wage, so the totals leave ${summary.wageUnknownCount === 1 ? 'it' : 'them'} out.`}
            {summary.cappedValueCount > 0 &&
              ` ${summary.cappedValueCount} value${summary.cappedValueCount === 1 ? ' is' : 's are'} at the save's 300m ceiling, so the fee total is a minimum.`}
          </p>

          <ul className="space-y-2">
            {visibleRows.map((row) => {
              const badge = urgencyBadge(row);
              const activeDecision = row.decision;
              return (
                <li
                  key={row.key}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {row.kind === 'player' && onSelectPlayer ? (
                        <button
                          type="button"
                          onClick={() => onSelectPlayer(row.id)}
                          className="text-left min-h-11 cursor-pointer"
                        >
                          <span className="text-sm font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-300">
                            {row.name}
                          </span>
                        </button>
                      ) : (
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {row.name}
                        </span>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="rounded-md bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 text-2xs font-mono text-slate-700 dark:text-slate-300">
                          {row.roleLabel}
                        </span>
                        {row.age !== null && (
                          <span className="text-micro font-mono text-slate-500 dark:text-slate-400">
                            {row.age}y
                          </span>
                        )}
                        <span className="text-micro font-mono text-slate-500 dark:text-slate-400">
                          Exp {row.expiresLabel}
                        </span>
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-2xs font-mono font-bold ${badge.cls}`}
                        >
                          {badge.text}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                        {formatWeeklyWage(row.weeklyWage)}
                      </div>
                      {row.marketValue !== null && (
                        <div className="font-mono text-2xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {formatCompactCurrency(row.marketValue)}
                          {row.marketValueCapped ? '+' : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {row.recommendation}
                  </p>

                  <div
                    role="group"
                    aria-label={`Plan for ${row.name}`}
                    className="grid grid-cols-3 gap-1.5"
                  >
                    {DECISION_LABELS.map((option) => {
                      const isActive = activeDecision === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => onSetDecision(row.key, isActive ? null : option.id)}
                          className={`min-h-11 rounded-lg border px-2 text-xs font-semibold transition-colors cursor-pointer ${
                            isActive
                              ? option.active
                              : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {option.label}
                          {row.suggestedDecision === option.id && (
                            <span className="ml-1 text-2xs opacity-70" aria-hidden="true">
                              •
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>

          {(hiddenCount > 0 || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              className="min-h-11 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {expanded
                ? `Show fewer (${COLLAPSED_ROW_COUNT} of ${summary.rows.length})`
                : `Show all ${summary.rows.length} expiring contracts`}
            </button>
          )}
        </>
      )}
    </section>
  );
};
