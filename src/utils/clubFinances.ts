import { FinancialRunway, MonthlyFinance } from '../types/fmSave';

export type WageComplianceSeverity = 'under' | 'minor_over' | 'over' | 'unknown';

export interface CanonicalClubFinancesInput {
  financesBalance?: number | null;
  metaBalance?: number | null;
  monthlyFinances?: MonthlyFinance[] | null;
  balanceLabel?: string | null;
  wagePayrollWeekly?: number | null;
  wageBudgetWeekly?: number | null;
  wageSpendLabel?: string | null;
  transferBudgetRemaining?: number | null;
  financialRunway?: FinancialRunway | null;
  currencySymbol?: string;
}

export interface CanonicalClubFinances {
  currencySymbol: string;
  balanceNum: number | null;
  balanceLabel: string;
  isInDebt: boolean;
  wagePayrollWeekly: number | null;
  wageBudgetWeekly: number | null;
  wageHeadroomWeekly: number | null;
  wageVariancePct: number | null;
  wageComplianceSeverity: WageComplianceSeverity;
  isOverWageBudget: boolean;
  isMateriallyOverWageBudget: boolean;
  wageComplianceLabel: string;
  transferBudgetRemaining: number | null;
  monthlyBurnRate: number | null;
  monthlyBurnLabel: string;
  runwayMonths: number | null;
  runwayStatus: 'Critical' | 'Warning' | 'Healthy' | null;
}

/**
 * Parses signed money labels like "-£749K", "(£749K)", "£1.50M", "-€802K", "£12,400".
 */
export function parseSignedMoneyValue(label?: string | null): number | null {
  if (!label || label === '--') return null;
  const trimmed = label.trim();
  const isNeg = /^\(/.test(trimmed) || /^[-−]/.test(trimmed);
  const cleaned = trimmed.replace(/[£€$,\s()]/g, '').replace(/^[-−+]/, '');
  const m = cleaned.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return null;
  let val = Number(m[1]);
  if (!Number.isFinite(val)) return null;
  const unit = (m[2] || '').toUpperCase();
  if (unit === 'B') val *= 1_000_000_000;
  else if (unit === 'M') val *= 1_000_000;
  else if (unit === 'K') val *= 1_000;
  return isNeg ? -val : val;
}

/**
 * Parses weekly wage spend labels like "£10,257 / £10,203 p/w (-£54 p/w)".
 */
export function parseWageSpendTriple(label?: string | null): {
  payroll: number | null;
  budget: number | null;
} {
  if (!label) return { payroll: null, budget: null };
  const pairMatch = label.match(
    /[£€$]?\s*([\d,]+)\s*\/\s*[£€$]?\s*([\d,]+)/
  );
  if (pairMatch) {
    const payroll = Number(pairMatch[1].replace(/,/g, ''));
    const budget = Number(pairMatch[2].replace(/,/g, ''));
    return {
      payroll: Number.isFinite(payroll) ? payroll : null,
      budget: Number.isFinite(budget) ? budget : null,
    };
  }
  const singleMatch = label.match(/[£€$]\s*([\d,]+)/);
  if (singleMatch) {
    const payroll = Number(singleMatch[1].replace(/,/g, ''));
    return {
      payroll: Number.isFinite(payroll) ? payroll : null,
      budget: null,
    };
  }
  return { payroll: null, budget: null };
}

/**
 * Single consistent compact currency formatter used across every card, bullet,
 * KPI strip, and analyst summary.
 */
export function formatClubMoney(
  amount: number | null | undefined,
  currencySymbol = '£'
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '--';
  }
  const abs = Math.abs(amount);
  const formatted =
    abs >= 1_000_000
      ? `${currencySymbol}${(abs / 1_000_000).toFixed(2)}M`
      : abs >= 1_000
        ? `${currencySymbol}${Math.round(abs / 1_000).toLocaleString()}K`
        : `${currencySymbol}${Math.round(abs).toLocaleString()}`;
  return amount < 0 ? `-${formatted}` : formatted;
}

export function formatWeeklyWage(
  amount: number | null | undefined,
  currencySymbol = '£'
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '--';
  }
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${currencySymbol}${Math.abs(rounded).toLocaleString()}/wk`;
}

/**
 * Resolves ONE canonical numeric balance so KPI cards, financial runway,
 * strategy bullets, and AI analyst prompts NEVER display conflicting numbers
 * (e.g., -£802K from save meta vs -£749K from club finances).
 *
 * Priority:
 * 1. Authoritative club finances table balance (`finances.balance`) — matches wage cap/payroll record.
 * 2. Latest monthly finance ledger balance (`monthlyFinances[last].balance`).
 * 3. Save header `meta.balance`.
 * 4. Parsed fallback `balanceLabel`.
 */
export function resolveCanonicalBalanceNum(input: {
  financesBalance?: number | null;
  metaBalance?: number | null;
  monthlyFinances?: MonthlyFinance[] | null;
  balanceLabel?: string | null;
}): number | null {
  if (
    typeof input.financesBalance === 'number' &&
    Number.isFinite(input.financesBalance)
  ) {
    return input.financesBalance;
  }
  if (input.monthlyFinances && input.monthlyFinances.length > 0) {
    const lastBal = input.monthlyFinances[input.monthlyFinances.length - 1]?.balance;
    if (typeof lastBal === 'number' && Number.isFinite(lastBal)) {
      return lastBal;
    }
  }
  if (
    typeof input.metaBalance === 'number' &&
    Number.isFinite(input.metaBalance)
  ) {
    return input.metaBalance;
  }
  return parseSignedMoneyValue(input.balanceLabel);
}

/**
 * Determines whether a weekly wage overrun is a tiny rounding/variance (e.g., -£54/wk = 0.5% of £10,203)
 * vs a genuine material wage-budget breach requiring player sales.
 */
export function classifyWageCompliance(
  wagePayrollWeekly: number | null,
  wageBudgetWeekly: number | null
): {
  wageHeadroomWeekly: number | null;
  wageVariancePct: number | null;
  severity: WageComplianceSeverity;
  isOverWageBudget: boolean;
  isMateriallyOverWageBudget: boolean;
} {
  if (
    typeof wagePayrollWeekly !== 'number' ||
    !Number.isFinite(wagePayrollWeekly) ||
    typeof wageBudgetWeekly !== 'number' ||
    !Number.isFinite(wageBudgetWeekly)
  ) {
    return {
      wageHeadroomWeekly: null,
      wageVariancePct: null,
      severity: 'unknown',
      isOverWageBudget: false,
      isMateriallyOverWageBudget: false,
    };
  }

  const wageHeadroomWeekly = Math.round(wageBudgetWeekly - wagePayrollWeekly);
  const wageVariancePct =
    wageBudgetWeekly > 0
      ? Number(((Math.abs(wageHeadroomWeekly) / wageBudgetWeekly) * 100).toFixed(1))
      : null;

  if (wageHeadroomWeekly >= 0) {
    return {
      wageHeadroomWeekly,
      wageVariancePct,
      severity: 'under',
      isOverWageBudget: false,
      isMateriallyOverWageBudget: false,
    };
  }

  // Materiality threshold: <= max(£150/wk, 3% of cap) is a minor near-cap variance, not a fire-sale emergency
  const minorVarianceCeiling = Math.max(150, Math.round(wageBudgetWeekly * 0.03));
  const isMaterial = Math.abs(wageHeadroomWeekly) > minorVarianceCeiling;

  return {
    wageHeadroomWeekly,
    wageVariancePct,
    severity: isMaterial ? 'over' : 'minor_over',
    isOverWageBudget: true,
    isMateriallyOverWageBudget: isMaterial,
  };
}

export function formatWageComplianceSummary(
  wagePayrollWeekly: number | null,
  wageBudgetWeekly: number | null,
  currencySymbol = '£'
): string {
  if (
    typeof wagePayrollWeekly === 'number' &&
    Number.isFinite(wagePayrollWeekly) &&
    typeof wageBudgetWeekly === 'number' &&
    Number.isFinite(wageBudgetWeekly)
  ) {
    const diff = Math.round(wageBudgetWeekly - wagePayrollWeekly);
    const diffStr =
      diff >= 0
        ? `+${currencySymbol}${diff.toLocaleString()} p/w`
        : `-${currencySymbol}${Math.abs(diff).toLocaleString()} p/w`;
    return `${currencySymbol}${Math.round(wagePayrollWeekly).toLocaleString()} / ${currencySymbol}${Math.round(wageBudgetWeekly).toLocaleString()} p/w (${diffStr})`;
  }
  if (typeof wagePayrollWeekly === 'number' && Number.isFinite(wagePayrollWeekly)) {
    return `${currencySymbol}${Math.round(wagePayrollWeekly).toLocaleString()} p/w`;
  }
  return '--';
}

export function resolveCanonicalClubFinances(
  input: CanonicalClubFinancesInput
): CanonicalClubFinances {
  const currencySymbol = input.currencySymbol || '£';
  const balanceNum = resolveCanonicalBalanceNum({
    financesBalance: input.financesBalance,
    metaBalance: input.metaBalance,
    monthlyFinances: input.monthlyFinances,
    balanceLabel: input.balanceLabel,
  });

  const parsedWages = parseWageSpendTriple(input.wageSpendLabel);
  const wagePayrollWeekly =
    typeof input.wagePayrollWeekly === 'number' && Number.isFinite(input.wagePayrollWeekly)
      ? input.wagePayrollWeekly
      : parsedWages.payroll;
  const wageBudgetWeekly =
    typeof input.wageBudgetWeekly === 'number' && Number.isFinite(input.wageBudgetWeekly)
      ? input.wageBudgetWeekly
      : parsedWages.budget;

  const compliance = classifyWageCompliance(wagePayrollWeekly, wageBudgetWeekly);
  const wageComplianceLabel =
    wagePayrollWeekly !== null
      ? formatWageComplianceSummary(wagePayrollWeekly, wageBudgetWeekly, currencySymbol)
      : input.wageSpendLabel && input.wageSpendLabel !== '--'
        ? input.wageSpendLabel
        : '--';

  const balanceLabel =
    balanceNum !== null
      ? formatClubMoney(balanceNum, currencySymbol)
      : input.balanceLabel && input.balanceLabel !== '--'
        ? input.balanceLabel
        : '--';

  const monthlyBurnRate =
    input.financialRunway && Number.isFinite(input.financialRunway.monthlyBurnRate)
      ? Math.round(input.financialRunway.monthlyBurnRate)
      : null;

  return {
    currencySymbol,
    balanceNum,
    balanceLabel,
    isInDebt: balanceNum !== null && balanceNum < 0,
    wagePayrollWeekly,
    wageBudgetWeekly,
    wageHeadroomWeekly: compliance.wageHeadroomWeekly,
    wageVariancePct: compliance.wageVariancePct,
    wageComplianceSeverity: compliance.severity,
    isOverWageBudget: compliance.isOverWageBudget,
    isMateriallyOverWageBudget: compliance.isMateriallyOverWageBudget,
    wageComplianceLabel,
    transferBudgetRemaining:
      typeof input.transferBudgetRemaining === 'number' &&
      Number.isFinite(input.transferBudgetRemaining)
        ? input.transferBudgetRemaining
        : null,
    monthlyBurnRate,
    monthlyBurnLabel:
      monthlyBurnRate !== null
        ? `${currencySymbol}${monthlyBurnRate.toLocaleString()}/mo`
        : '--',
    runwayMonths: input.financialRunway?.runwayMonths ?? null,
    runwayStatus: input.financialRunway?.status ?? null,
  };
}
