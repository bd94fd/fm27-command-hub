import type { FinancialRunway, MonthlyFinance } from '../types/fmSave';
import {
  formatClubMoney,
  formatWageComplianceSummary,
  resolveCanonicalBalanceNum,
} from './clubFinances';
import type { DecodedFmSavePayload } from './fmSaveHydrator';

export interface FinanceSnapshot {
  canonicalBalanceNum: number | null;
  balanceLabel: string | null;
  wageComplianceLabel: string | null;
  financialRunway: FinancialRunway | null;
}

export function calculateFinancialRunway(
  finances: MonthlyFinance[],
  canonicalBalanceOverride?: number | null
): FinancialRunway {
  if (!finances || finances.length === 0) {
    const fallbackBal =
      typeof canonicalBalanceOverride === 'number' &&
      Number.isFinite(canonicalBalanceOverride)
        ? canonicalBalanceOverride
        : 0;
    return {
      currentBalance: fallbackBal,
      monthlyBurnRate: 0,
      runwayMonths: 0,
      status: 'Critical',
    };
  }
  const currentBalance =
    typeof canonicalBalanceOverride === 'number' &&
    Number.isFinite(canonicalBalanceOverride)
      ? canonicalBalanceOverride
      : finances[finances.length - 1].balance;
  const negativeCashflows = finances
    .map((f) => f.netCashflow)
    .filter((cashflow) => cashflow < 0);

  let monthlyBurnRate = 0;
  if (negativeCashflows.length > 0) {
    const totalBurn = negativeCashflows.reduce(
      (acc, val) => acc + Math.abs(val),
      0
    );
    monthlyBurnRate = totalBurn / negativeCashflows.length;
  }

  let runwayMonths = 999;
  if (monthlyBurnRate > 0) {
    runwayMonths = Math.max(
      0,
      Number((currentBalance / monthlyBurnRate).toFixed(1))
    );
  }

  let status: 'Critical' | 'Warning' | 'Healthy' = 'Healthy';
  if (currentBalance <= 0 || runwayMonths < 3) {
    status = 'Critical';
  } else if (runwayMonths < 6) {
    status = 'Warning';
  }

  return { currentBalance, monthlyBurnRate, runwayMonths, status };
}

/**
 * The money figures the app shows: one canonical balance (save balance, then
 * meta balance, then the monthly ledger), the wage budget summary, and the
 * runway implied by the monthly ledger.
 */
export function buildFinanceSnapshot(decoded: DecodedFmSavePayload): FinanceSnapshot {
  const canonicalBalanceNum = resolveCanonicalBalanceNum({
    financesBalance: decoded.finances?.balance ?? null,
    metaBalance: decoded.meta.balance ?? null,
    monthlyFinances: decoded.monthlyFinances ?? null,
  });
  const balanceLabel =
    canonicalBalanceNum !== null ? formatClubMoney(canonicalBalanceNum, '£') : null;

  let wageComplianceLabel: string | null = null;
  if (
    decoded.finances &&
    decoded.finances.wagePayrollWeekly !== null &&
    decoded.finances.wageBudgetWeekly !== null
  ) {
    wageComplianceLabel = formatWageComplianceSummary(
      decoded.finances.wagePayrollWeekly,
      decoded.finances.wageBudgetWeekly,
      '£'
    );
  }

  const financialRunway =
    decoded.monthlyFinances && decoded.monthlyFinances.length > 0
      ? calculateFinancialRunway(decoded.monthlyFinances, canonicalBalanceNum)
      : null;

  return { canonicalBalanceNum, balanceLabel, wageComplianceLabel, financialRunway };
}
