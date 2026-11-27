import React, { useMemo, useState } from 'react';
import { Calculator, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react';
import { formatClubMoney } from '../utils/clubFinances';
import {
  FinanceScenarioDeltas,
  FinanceScenarioProjection,
  projectFinanceScenario,
} from '../utils/financeScenarios';

interface FinanceScenarioPanelProps {
  balance: number | null;
  monthlyNet: number | null;
  monthlyBurnRate: number | null;
  wagePayrollWeekly: number | null;
  wageBudgetWeekly: number | null;
  currencySymbol: string;
  /** The runway the Finances card shows, so the "before" side matches it exactly. */
  baselineRunwayMonths: number | null;
  baselineRunwayLabel: string;
}

const parseAmount = (raw: string): number => {
  const cleaned = raw.replace(/[,\s]/g, '');
  if (cleaned === '' || cleaned === '-') return 0;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
};

const ScenarioStat: React.FC<{
  label: string;
  value: string;
  valueClassName?: string;
}> = ({ label, value, valueClassName }) => (
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
  </div>
);

const ScenarioField: React.FC<{
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  currencySymbol: string;
  formattedValue: string;
}> = ({ id, label, hint, value, onChange, currencySymbol, formattedValue }) => (
  <div className="min-w-0">
    <label
      htmlFor={id}
      className="block text-micro font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
    >
      {label}
    </label>
    <div className="mt-1 flex items-stretch">
      <span
        aria-hidden="true"
        className="flex items-center rounded-l-lg border border-r-0 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 px-2 font-mono text-sm text-slate-500 dark:text-slate-400"
      >
        {currencySymbol}
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-hint`}
        className="min-w-0 flex-1 rounded-r-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 min-h-11 font-mono text-base sm:text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      />
    </div>
    <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500 dark:text-slate-400">
      {hint}
      {formattedValue ? (
        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200"> — {formattedValue}</span>
      ) : null}
    </p>
  </div>
);

const runwayTone = (projection: FinanceScenarioProjection): string => {
  if (projection.statusAfter === 'Critical') return 'text-rose-600 dark:text-rose-300';
  if (projection.statusAfter === 'Warning') return 'text-amber-600 dark:text-amber-300';
  return 'text-emerald-600 dark:text-emerald-300';
};

/**
 * Turns the decoded finance figures into a decision: what one signing, sale, fee or
 * sponsorship change does to the balance, the monthly cash flow and the runway. Every
 * number comes from `projectFinanceScenario`, which reads the same canonical values the
 * Finances cards above show. It refuses to project when the save lacks the inputs.
 */
export const FinanceScenarioPanel: React.FC<FinanceScenarioPanelProps> = ({
  balance,
  monthlyNet,
  monthlyBurnRate,
  wagePayrollWeekly,
  wageBudgetWeekly,
  currencySymbol,
  baselineRunwayMonths,
  baselineRunwayLabel,
}) => {
  const [fields, setFields] = useState({
    wageDeltaWeekly: '',
    transferFeeOut: '',
    transferFeeIn: '',
    sponsorshipDeltaAnnual: '',
  });

  const deltas: FinanceScenarioDeltas = useMemo(
    () => ({
      wageDeltaWeekly: parseAmount(fields.wageDeltaWeekly),
      transferFeeOut: Math.abs(parseAmount(fields.transferFeeOut)),
      transferFeeIn: Math.abs(parseAmount(fields.transferFeeIn)),
      sponsorshipDeltaAnnual: parseAmount(fields.sponsorshipDeltaAnnual),
    }),
    [fields]
  );

  const projection = useMemo(
    () =>
      projectFinanceScenario({
        balance,
        monthlyNet,
        monthlyBurnRate,
        wagePayrollWeekly,
        wageBudgetWeekly,
        currencySymbol,
        baselineRunwayMonths,
        baselineRunwayLabel,
        deltas,
      }),
    [
      balance,
      monthlyNet,
      monthlyBurnRate,
      wagePayrollWeekly,
      wageBudgetWeekly,
      currencySymbol,
      baselineRunwayMonths,
      baselineRunwayLabel,
      deltas,
    ]
  );

  const hasInput = projection.changed;
  const reset = () =>
    setFields({
      wageDeltaWeekly: '',
      transferFeeOut: '',
      transferFeeIn: '',
      sponsorshipDeltaAnnual: '',
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-micro font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Calculator className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            What if…
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            One change at a time, on top of the decoded figures. Nothing else is assumed to
            move, and nothing is sent anywhere.
          </p>
        </div>
        {hasInput && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 min-h-11 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <ScenarioField
          id="scenario-wage"
          label="Weekly wage change"
          hint="Negative for a sale, positive for a signing."
          currencySymbol={currencySymbol}
          formattedValue={
            deltas.wageDeltaWeekly === 0
              ? ''
              : `${deltas.wageDeltaWeekly < 0 ? '-' : '+'}${formatClubMoney(Math.abs(deltas.wageDeltaWeekly), currencySymbol)}/wk`
          }
          value={fields.wageDeltaWeekly}
          onChange={(v) => setFields((f) => ({ ...f, wageDeltaWeekly: v }))}
        />
        <ScenarioField
          id="scenario-sponsorship"
          label="Sponsorship change a year"
          hint="A new deal, or a deal you would lose."
          currencySymbol={currencySymbol}
          formattedValue={
            deltas.sponsorshipDeltaAnnual === 0
              ? ''
              : `${deltas.sponsorshipDeltaAnnual < 0 ? '-' : '+'}${formatClubMoney(Math.abs(deltas.sponsorshipDeltaAnnual), currencySymbol)}/yr`
          }
          value={fields.sponsorshipDeltaAnnual}
          onChange={(v) => setFields((f) => ({ ...f, sponsorshipDeltaAnnual: v }))}
        />
        <ScenarioField
          id="scenario-fee-out"
          label="Transfer fee paid"
          hint="Cash leaving the bank now."
          currencySymbol={currencySymbol}
          formattedValue={deltas.transferFeeOut === 0 ? '' : formatClubMoney(deltas.transferFeeOut, currencySymbol)}
          value={fields.transferFeeOut}
          onChange={(v) => setFields((f) => ({ ...f, transferFeeOut: v }))}
        />
        <ScenarioField
          id="scenario-fee-in"
          label="Transfer fee received"
          hint="Cash arriving in the bank now."
          currencySymbol={currencySymbol}
          formattedValue={deltas.transferFeeIn === 0 ? '' : formatClubMoney(deltas.transferFeeIn, currencySymbol)}
          value={fields.transferFeeIn}
          onChange={(v) => setFields((f) => ({ ...f, transferFeeIn: v }))}
        />
      </div>

      {!projection.available ? (
        <p className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300">
          {projection.unavailableReason}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <ScenarioStat
              label="Balance after"
              value={projection.balanceAfterLabel}
              valueClassName={
                projection.balanceAfter !== null && projection.balanceAfter < 0
                  ? 'text-rose-600 dark:text-rose-300'
                  : 'text-emerald-600 dark:text-emerald-300'
              }
            />
            <ScenarioStat
              label="Monthly net after"
              value={projection.monthlyNetAfterLabel}
              valueClassName={
                projection.monthlyNetAfter !== null && projection.monthlyNetAfter < 0
                  ? 'text-rose-600 dark:text-rose-300'
                  : 'text-emerald-600 dark:text-emerald-300'
              }
            />
            <div className="col-span-2 sm:col-span-1">
            <ScenarioStat
              label="Runway after"
              value={
                hasInput
                  ? `${projection.runwayBeforeLabel} → ${projection.runwayAfterLabel}`
                  : projection.runwayAfterLabel
              }
              valueClassName={hasInput ? runwayTone(projection) : undefined}
            />
            </div>
          </div>

          {projection.basisNote && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{projection.basisNote}</p>
          )}

          <p
            role="status"
            aria-live="polite"
            className="flex items-start gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200"
          >
            {hasInput &&
              (projection.runwayMonthsAfter === null ||
              (projection.runwayMonthsBefore !== null &&
                projection.runwayMonthsAfter >= projection.runwayMonthsBefore) ? (
                <TrendingUp className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-500" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-500" aria-hidden="true" />
              ))}
            <span>{projection.verdict}</span>
          </p>
        </>
      )}
    </div>
  );
};

export default FinanceScenarioPanel;
