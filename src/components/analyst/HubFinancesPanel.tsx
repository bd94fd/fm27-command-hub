import React from 'react';
import { AlertTriangle, Wallet } from 'lucide-react';
import type { ClubFinancesPanelData } from '../../utils/clubFinances';
import type { PlayerRecord } from '../../types/fm27';
import { FinanceScenarioPanel } from '../FinanceScenarioPanel';
import { TransferPlanSandbox } from '../TransferPlanSandbox';

const FinancesStat: React.FC<{
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
}> = ({ label, value, hint, valueClassName }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-2.5 min-w-0">
    <div className="text-micro font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
      {label}
    </div>
    <div
      className={`mt-0.5 font-mono text-sm font-bold break-words tabular-nums ${
        valueClassName || 'text-slate-900 dark:text-white'
      }`}
    >
      {value}
    </div>
    {hint && (
      <div className="text-xs text-slate-500 dark:text-slate-400 break-words">
        {hint}
      </div>
    )}
  </div>
);

export interface HubFinancesPanelProps {
  data: ClubFinancesPanelData;
  players: PlayerRecord[];
}

/** Cash, payroll and sponsorship decoded from the save, with the what-if sandboxes. */
export const HubFinancesPanel: React.FC<HubFinancesPanelProps> = ({
  data: financesPanel,
  players,
}) => (
  <section
    aria-labelledby="hub-finances-heading"
    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 p-4 sm:p-5 space-y-4"
  >
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3
          id="hub-finances-heading"
          className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"
        >
          <Wallet className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />
          Club Finances
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Cash, payroll &amp; sponsorship decoded from the save — the same
          selectors the Analyst uses.
        </p>
      </div>
      <span
        className={`rounded-md border px-2 py-0.5 font-mono text-micro font-semibold tabular-nums ${
          financesPanel.payroll.wageSeverity === 'over'
            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40'
            : financesPanel.payroll.wageSeverity === 'minor_over'
              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40'
              : financesPanel.payroll.wageSeverity === 'under'
                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
        }`}
      >
        {financesPanel.payroll.wageComplianceLabel}
      </span>
    </div>

    <div className="space-y-2">
      <h4 className="text-micro font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Cash &amp; Runway
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <FinancesStat
          label="Bank Balance"
          value={financesPanel.cash.balanceLabel}
          valueClassName={
            financesPanel.cash.isInDebt
              ? 'text-rose-600 dark:text-rose-300'
              : 'text-emerald-600 dark:text-emerald-300'
          }
        />
        <FinancesStat
          label="Latest Monthly Net"
          value={financesPanel.cash.monthlyNetLabel}
          valueClassName={
            financesPanel.cash.monthlyNetAmount !== null &&
            financesPanel.cash.monthlyNetAmount < 0
              ? 'text-rose-600 dark:text-rose-300'
              : 'text-emerald-600 dark:text-emerald-300'
          }
        />
        <FinancesStat
          label="Financial Runway"
          value={financesPanel.cash.runwayLabel}
          valueClassName={
            financesPanel.cash.runwayStatus === 'Critical'
              ? 'text-rose-600 dark:text-rose-300'
              : financesPanel.cash.runwayStatus === 'Warning'
                ? 'text-amber-600 dark:text-amber-300'
                : 'text-emerald-600 dark:text-emerald-300'
          }
        />
      </div>
      {financesPanel.cash.runwayWarning && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1.5 text-micro text-amber-700 dark:text-amber-200"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{financesPanel.cash.runwayWarning}</span>
        </p>
      )}
    </div>

    <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
      <FinanceScenarioPanel
        balance={financesPanel.cash.balanceAmount}
        monthlyNet={financesPanel.cash.monthlyNetAmount}
        monthlyBurnRate={financesPanel.cash.monthlyBurnRate}
        wagePayrollWeekly={financesPanel.payroll.wagePayrollWeekly}
        wageBudgetWeekly={financesPanel.payroll.wageBudgetWeekly}
        currencySymbol={financesPanel.currencySymbol}
        baselineRunwayMonths={financesPanel.cash.runwayMonths}
        baselineRunwayLabel={financesPanel.cash.runwayLabel}
      />
      <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
        <TransferPlanSandbox
          squad={players}
          finance={{
            balance: financesPanel.cash.balanceAmount,
            monthlyNet: financesPanel.cash.monthlyNetAmount,
            monthlyBurnRate: financesPanel.cash.monthlyBurnRate,
            wagePayrollWeekly: financesPanel.payroll.wagePayrollWeekly,
            wageBudgetWeekly: financesPanel.payroll.wageBudgetWeekly,
            currencySymbol: financesPanel.currencySymbol,
            baselineRunwayMonths: financesPanel.cash.runwayMonths,
            baselineRunwayLabel: financesPanel.cash.runwayLabel,
          }}
        />
      </div>
    </div>

    <div className="space-y-2">
      <h4 className="text-micro font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Weekly Payroll Breakdown
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <FinancesStat
          label="Player Wage Bill (Canonical)"
          value={financesPanel.payroll.clubPayrollLabel}
          hint="FM27 finance table player wage spend — staff wages are separate and not included"
        />
        <FinancesStat
          label="Player Wage Budget"
          value={financesPanel.payroll.wageBudgetLabel}
          hint={financesPanel.payroll.wageHeadroomLabel}
        />
        <FinancesStat
          label="Weekly Staff Payroll"
          value={financesPanel.payroll.staffPayrollLabel}
          hint="Backroom staff contracts only — separate from the player wage bill; board/executives without contracts excluded"
        />
        <FinancesStat
          label="Squad Wage Subtotal"
          value={financesPanel.payroll.squadWageSubtotalLabel}
          hint="Sum of individual player contracts — a subset of the player wage bill, not a club total"
        />
      </div>
    </div>

    <div className="space-y-2">
      <h4 className="text-micro font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Sponsorship Deals
      </h4>
      {financesPanel.sponsorships.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No decoded sponsorship amounts in this save.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {financesPanel.sponsorships.map((deal, idx) => (
            <li
              key={`${deal.name}-${idx}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-1.5 text-xs"
            >
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 dark:text-white truncate">
                  {deal.name}
                </div>
                <div className="text-slate-500 dark:text-slate-400 truncate">
                  {deal.type}
                  {deal.expires && deal.expires !== '--'
                    ? ` · exp ${deal.expires}`
                    : ''}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {deal.datesReordered && (
                  <span
                    title="fmsave reversed the stored dates of this ended contract — start and end are swapped"
                    className="inline-flex items-center gap-0.5 rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-micro font-semibold text-amber-700 dark:text-amber-300"
                  >
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Dates reordered
                  </span>
                )}
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-300 tabular-nums">
                  {deal.annualValueLabel === '--'
                    ? '--'
                    : `${deal.annualValueLabel}/yr`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  </section>
);
