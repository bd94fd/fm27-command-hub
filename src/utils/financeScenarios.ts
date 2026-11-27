import { formatClubMoney, formatWeeklyAmount } from './clubFinances';

/**
 * A week is 52/12 of a month. FM27 reports wages per week and cash flow per month, so
 * every projection in this file converts with this one constant instead of approximating
 * with four weeks, which would understate wage cost by 8%.
 */
export const WEEKS_PER_MONTH = 52 / 12;

export interface FinanceScenarioDeltas {
  /** Change in the weekly player wage bill. Positive for a signing, negative for a sale. */
  wageDeltaWeekly: number;
  /** Cash paid out now for a transfer fee. Magnitude; the sign is applied here. */
  transferFeeOut: number;
  /** Cash received now for a transfer fee. Magnitude. */
  transferFeeIn: number;
  /** Change in annual sponsorship income. Positive for a new deal, negative for a lost one. */
  sponsorshipDeltaAnnual: number;
}

export const EMPTY_FINANCE_SCENARIO: FinanceScenarioDeltas = {
  wageDeltaWeekly: 0,
  transferFeeOut: 0,
  transferFeeIn: 0,
  sponsorshipDeltaAnnual: 0,
};

export interface FinanceScenarioInput {
  /** Canonical balance from `resolveCanonicalClubFinances`. */
  balance: number | null;
  /** Latest month's net cash flow from the save. */
  monthlyNet: number | null;
  /** Average monthly burn from `calculateFinancialRunway`, used only when `monthlyNet` is missing. */
  monthlyBurnRate: number | null;
  /**
   * The runway the Finances card shows, from `calculateFinancialRunway`. It averages the
   * losing months, so it can differ from a projection run off the latest month. When it is
   * supplied it is what the "before" side reports, so the panel never contradicts the card
   * above it.
   */
  baselineRunwayMonths?: number | null;
  baselineRunwayLabel?: string | null;
  wagePayrollWeekly: number | null;
  wageBudgetWeekly: number | null;
  currencySymbol?: string;
  deltas: FinanceScenarioDeltas;
}

export type ScenarioRunwayStatus = 'Critical' | 'Warning' | 'Healthy';

export interface FinanceScenarioProjection {
  available: boolean;
  /** Plain-English reason when `available` is false. Never a guessed number. */
  unavailableReason: string | null;
  currencySymbol: string;
  changed: boolean;
  balanceAfter: number | null;
  balanceAfterLabel: string;
  monthlyNetAfter: number | null;
  monthlyNetAfterLabel: string;
  runwayMonthsBefore: number | null;
  runwayMonthsAfter: number | null;
  runwayBeforeLabel: string;
  runwayAfterLabel: string;
  /** Set when the card's averaged runway and this projection's latest-month basis differ. */
  basisNote: string | null;
  statusAfter: ScenarioRunwayStatus | null;
  wageHeadroomAfterWeekly: number | null;
  wageHeadroomAfterLabel: string;
  verdict: string;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function runwayStatus(balance: number, runwayMonths: number | null): ScenarioRunwayStatus {
  if (balance <= 0) return 'Critical';
  if (runwayMonths === null) return 'Healthy';
  if (runwayMonths < 3) return 'Critical';
  if (runwayMonths < 6) return 'Warning';
  return 'Healthy';
}

function runwayMonthsFor(balance: number, monthlyNet: number): number | null {
  if (monthlyNet >= 0) return null;
  return Math.max(0, Number((balance / Math.abs(monthlyNet)).toFixed(1)));
}

function runwayLabel(balance: number, months: number | null): string {
  if (balance <= 0) return 'overdrawn';
  if (months === null) return 'not burning';
  return `${months} months`;
}

/** Weekly figures stay exact to the pound, the way the payroll cards show them. */


/**
 * Projects balance, monthly cash flow, runway and wage compliance under one user-defined
 * change. Pure and side-effect free so the UI and any test reason about the same numbers.
 *
 * It refuses to answer when the save has no decoded balance or no cash flow history,
 * rather than inventing a starting point. Every figure assumes nothing else changes.
 */
export function projectFinanceScenario(
  input: FinanceScenarioInput
): FinanceScenarioProjection {
  const currencySymbol = input.currencySymbol || '£';
  const deltas = input.deltas;
  // A wage rise costs cash, so it moves the monthly net down; only sponsorship income adds.
  const wageDeltaMonthly = deltas.wageDeltaWeekly * WEEKS_PER_MONTH;
  const sponsorshipDeltaMonthly = deltas.sponsorshipDeltaAnnual / 12;
  const oneOffCash = Math.abs(deltas.transferFeeIn) - Math.abs(deltas.transferFeeOut);
  const changed =
    deltas.wageDeltaWeekly !== 0 ||
    deltas.transferFeeOut !== 0 ||
    deltas.transferFeeIn !== 0 ||
    deltas.sponsorshipDeltaAnnual !== 0;

  const baselineMonthlyNet = isFiniteNumber(input.monthlyNet)
    ? input.monthlyNet
    : isFiniteNumber(input.monthlyBurnRate) && input.monthlyBurnRate > 0
      ? -input.monthlyBurnRate
      : null;

  const balanceNow = isFiniteNumber(input.balance) ? input.balance : null;
  const missing: string[] = [];
  if (balanceNow === null) missing.push('bank balance');
  if (baselineMonthlyNet === null) missing.push('monthly cash flow');

  if (balanceNow === null || baselineMonthlyNet === null) {
    return {
      available: false,
      unavailableReason: `This save has no decoded ${missing.join(' or ')}, so a projection would be a guess.`,
      currencySymbol,
      changed,
      balanceAfter: null,
      balanceAfterLabel: '--',
      monthlyNetAfter: null,
      monthlyNetAfterLabel: '--',
      runwayMonthsBefore: null,
      runwayMonthsAfter: null,
      runwayBeforeLabel: '--',
      runwayAfterLabel: '--',
      basisNote: null,
      statusAfter: null,
      wageHeadroomAfterWeekly: null,
      wageHeadroomAfterLabel: '--',
      verdict: 'Not enough finance data in this save to run a scenario.',
    };
  }

  const balance = balanceNow;
  const monthlyNetBefore = baselineMonthlyNet;
  const monthlyNetAfter = Math.round(monthlyNetBefore - wageDeltaMonthly + sponsorshipDeltaMonthly);
  const balanceAfter = Math.round(balance + oneOffCash);

  const latestMonthRunway = runwayMonthsFor(balance, monthlyNetBefore);
  const hasBaselineOverride =
    typeof input.baselineRunwayMonths === 'number' && Number.isFinite(input.baselineRunwayMonths);
  const runwayMonthsBefore = hasBaselineOverride ? input.baselineRunwayMonths! : latestMonthRunway;
  const runwayBeforeLabel =
    hasBaselineOverride && input.baselineRunwayLabel
      ? input.baselineRunwayLabel
      : runwayLabel(balance, latestMonthRunway);
  const runwayMonthsAfter = runwayMonthsFor(balanceAfter, monthlyNetAfter);
  const runwayAfterLabel = runwayLabel(balanceAfter, runwayMonthsAfter);
  const statusAfter = runwayStatus(balanceAfter, runwayMonthsAfter);
  const basisNote =
    hasBaselineOverride && latestMonthRunway !== null && runwayMonthsBefore !== null &&
    Math.abs(latestMonthRunway - runwayMonthsBefore) >= 0.5
      ? 'The runway card averages your losing months; this projection runs from the latest month.'
      : null;

  const wageHeadroomAfterWeekly =
    isFiniteNumber(input.wagePayrollWeekly) && isFiniteNumber(input.wageBudgetWeekly)
      ? Math.round(input.wageBudgetWeekly - (input.wagePayrollWeekly + deltas.wageDeltaWeekly))
      : null;
  const wageHeadroomAfterLabel =
    wageHeadroomAfterWeekly === null
      ? '--'
      : wageHeadroomAfterWeekly >= 0
        ? `${formatWeeklyAmount(Math.abs(wageHeadroomAfterWeekly), currencySymbol)} under cap`
        : `${formatWeeklyAmount(Math.abs(wageHeadroomAfterWeekly), currencySymbol)} over cap`;

  return {
    available: true,
    unavailableReason: null,
    currencySymbol,
    changed,
    balanceAfter,
    balanceAfterLabel: formatClubMoney(balanceAfter, currencySymbol),
    monthlyNetAfter,
    monthlyNetAfterLabel: `${monthlyNetAfter >= 0 ? '+' : ''}${formatClubMoney(monthlyNetAfter, currencySymbol)}/mo`,
    runwayMonthsBefore,
    runwayMonthsAfter,
    runwayBeforeLabel,
    runwayAfterLabel,
    basisNote,
    statusAfter,
    wageHeadroomAfterWeekly,
    wageHeadroomAfterLabel,
    verdict: buildVerdict({
      deltas,
      currencySymbol,
      balanceAfter,
      runwayBeforeLabel,
      runwayAfterLabel,
      runwayMonthsBefore,
      runwayMonthsAfter,
      wageHeadroomAfterWeekly,
    }),
  };
}

function describeWageChange(deltas: FinanceScenarioDeltas, currencySymbol: string): string | null {
  if (deltas.wageDeltaWeekly === 0) return null;
  const amount = formatWeeklyAmount(Math.abs(deltas.wageDeltaWeekly), currencySymbol).replace('/wk', '');
  return deltas.wageDeltaWeekly > 0
    ? `adding ${amount}/wk of wages`
    : `saving ${amount}/wk of wages`;
}

function describeTransferChange(deltas: FinanceScenarioDeltas, currencySymbol: string): string | null {
  const parts: string[] = [];
  if (deltas.transferFeeOut > 0) {
    parts.push(`spending ${formatClubMoney(Math.abs(deltas.transferFeeOut), currencySymbol)} on fees`);
  }
  if (deltas.transferFeeIn > 0) {
    parts.push(`banking ${formatClubMoney(Math.abs(deltas.transferFeeIn), currencySymbol)} in fees`);
  }
  return parts.length > 0 ? parts.join(' and ') : null;
}

function describeSponsorshipChange(
  deltas: FinanceScenarioDeltas,
  currencySymbol: string
): string | null {
  if (deltas.sponsorshipDeltaAnnual === 0) return null;
  const amount = formatClubMoney(Math.abs(deltas.sponsorshipDeltaAnnual), currencySymbol);
  return deltas.sponsorshipDeltaAnnual > 0
    ? `adding ${amount}/yr of sponsorship`
    : `losing ${amount}/yr of sponsorship`;
}

function buildVerdict(input: {
  deltas: FinanceScenarioDeltas;
  currencySymbol: string;
  balanceAfter: number;
  runwayBeforeLabel: string;
  runwayAfterLabel: string;
  runwayMonthsBefore: number | null;
  runwayMonthsAfter: number | null;
  wageHeadroomAfterWeekly: number | null;
}): string {
  const changes = [
    describeWageChange(input.deltas, input.currencySymbol),
    describeTransferChange(input.deltas, input.currencySymbol),
    describeSponsorshipChange(input.deltas, input.currencySymbol),
  ].filter((part): part is string => part !== null);

  if (changes.length === 0) {
    return 'Nothing changed yet. Set a wage, fee or sponsorship change to see the effect.';
  }

  const opening = `${changes[0].charAt(0).toUpperCase()}${changes[0].slice(1)}${
    changes.length > 1 ? `, ${changes.slice(1).join(', ')}` : ''
  }`;

  const runwaySentence =
    input.runwayMonthsBefore === null && input.runwayMonthsAfter === null
      ? 'You stay cash-positive, so there is no runway to run out of.'
      : input.runwayMonthsAfter === null
        ? 'You would stop burning cash, so the runway stops being the constraint.'
        : input.runwayMonthsBefore === null
          ? `You would start burning cash and have ${input.runwayAfterLabel} of runway.`
          : `Runway moves from ${input.runwayBeforeLabel} to ${input.runwayAfterLabel}.`;

  const wageSentence =
    input.wageHeadroomAfterWeekly === null
      ? ''
      : input.wageHeadroomAfterWeekly >= 0
        ? ` Wages stay ${formatWeeklyAmount(Math.abs(input.wageHeadroomAfterWeekly), input.currencySymbol)} under the cap.`
        : ` Wages would be ${formatWeeklyAmount(Math.abs(input.wageHeadroomAfterWeekly), input.currencySymbol)} over the cap.`;

  const balanceSentence =
    input.balanceAfter < 0
      ? ` The balance would end at ${formatClubMoney(input.balanceAfter, input.currencySymbol)}, in the red.`
      : '';

  return `${opening}: ${runwaySentence}${wageSentence}${balanceSentence}`;
}
