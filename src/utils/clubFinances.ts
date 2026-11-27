import { FinancialRunway, MonthlyFinance, SponsorshipDeal } from '../types/fmSave';
import {
  computeWeeklyStaffPayroll,
  formatWeeklyStaffPayroll,
} from './staffRatings';

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

/**
 * Weekly wage formatting lives in `squadViewHelpers.formatWeeklyWage` (single source for UI and
 * Analyst). Do not add a second one here — that duplication is what audit §1 was about.
 */

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

export interface SquadWageSubtotal {
  count: number;
  knownWeekly: number;
  missingWageCount: number;
  /** Never presented as club payroll — it is the sum of individual player contracts. */
  label: string;
}

/**
 * Sum of individual player contracts, labelled as a squad subtotal only. FM27's finance
 * table Player Wage Bill is the canonical player wage figure; staff wages are separate.
 * This helper must never be rendered under a total-club-payroll label.
 */
export function computeSquadWageSubtotal(
  wages: ReadonlyArray<number | null | undefined> | null | undefined
): SquadWageSubtotal {
  const list = wages ?? [];
  let knownWeekly = 0;
  let missingWageCount = 0;
  for (const wage of list) {
    if (typeof wage === 'number' && Number.isFinite(wage) && wage > 0) {
      knownWeekly += wage;
    } else {
      missingWageCount += 1;
    }
  }
  const label =
    list.length === 0
      ? '--'
      : missingWageCount > 0
        ? `£${knownWeekly.toLocaleString()}/wk known (${missingWageCount} of ${list.length} with no weekly wage — youth/amateur/loan)`
        : `£${knownWeekly.toLocaleString()}/wk`;
  return { count: list.length, knownWeekly, missingWageCount, label };
}

export interface ClubFinancesPanelInput extends CanonicalClubFinancesInput {
  staff?: ReadonlyArray<{ wagePw?: number | null }> | null;
  playerWages?: ReadonlyArray<number | null | undefined> | null;
  sponsorships?: SponsorshipDeal[] | null;
}

export interface SponsorshipPanelRow {
  name: string;
  type: string;
  annualValueLabel: string;
  expires: string;
  datesReordered: boolean;
}

export interface ClubFinancesPanelData {
  currencySymbol: string;
  cash: {
    balanceLabel: string;
    /** Raw canonical balance, for calculators that need a number rather than a label. */
    balanceAmount: number | null;
    isInDebt: boolean;
    monthlyNetAmount: number | null;
    monthlyBurnRate: number | null;
    monthlyNetLabel: string;
    runwayStatus: 'Critical' | 'Warning' | 'Healthy' | null;
    runwayMonths: number | null;
    runwayLabel: string;
    runwayWarning: string | null;
  };
  payroll: {
    clubPayrollLabel: string;
    wagePayrollWeekly: number | null;
    wageBudgetLabel: string;
    wageBudgetWeekly: number | null;
    wageComplianceLabel: string;
    wageHeadroomLabel: string;
    wageHeadroomWeekly: number | null;
    wageSeverity: WageComplianceSeverity;
    staffPayrollLabel: string;
    staffMissingWageCount: number;
    squadWageSubtotalLabel: string;
    squadWageMissingCount: number;
  };
  sponsorships: SponsorshipPanelRow[];
}

function formatWeeklyMoney(amount: number | null, currencySymbol: string): string {
  if (amount === null || !Number.isFinite(amount)) return '--';
  return `${currencySymbol}${Math.round(amount).toLocaleString()}/wk`;
}

const SPONSOR_PLACEHOLDERS = new Set(['', '--', 'unknown', 'n/a', 'none']);

function isSponsorPlaceholder(value: unknown): boolean {
  return typeof value !== 'string' || SPONSOR_PLACEHOLDERS.has(value.trim().toLowerCase());
}

/**
 * fmsave emits sponsorship rows with snake_case dataclass fields (`annual_value`, `end`,
 * `dates_reordered`), while the app reads camelCase. Normalize once at this boundary so
 * the Hub panel and its usability filter see the same decoded deal.
 */
export function normalizeSponsorshipDeal(
  deal: SponsorshipDeal,
  index = 0
): SponsorshipDeal {
  const raw = deal as Record<string, unknown>;
  const annualValue =
    typeof deal.annualValue === 'number'
      ? deal.annualValue
      : typeof raw.annual_value === 'number'
        ? raw.annual_value
        : null;
  const expires =
    !isSponsorPlaceholder(deal.expires)
      ? deal.expires
      : typeof raw.end === 'string' && raw.end.trim()
        ? raw.end
        : null;
  const start =
    typeof deal.start === 'string'
      ? deal.start
      : typeof raw.start === 'string'
        ? raw.start
        : null;
  const sponsor = typeof raw.sponsor === 'string' ? raw.sponsor.trim() : '';
  const kindLabel =
    raw.kind && typeof raw.kind === 'object'
      ? (raw.kind as { label?: unknown }).label
      : null;
  const type =
    deal.type ||
    (typeof kindLabel === 'string' && kindLabel.trim() ? kindLabel : 'Sponsorship');

  return {
    ...deal,
    name: deal.name || sponsor || `Sponsorship ${index + 1}`,
    type,
    annualValue,
    expires,
    start,
    dates_reordered:
      deal.dates_reordered === true || raw.dates_reordered === true,
  };
}

const UNREADABLE_SPONSOR_DATE = new Set(['', '--', 'unknown', 'n/a', 'none']);

/**
 * Keeps a sponsorship row only when it carries a real annual value or a real expiry.
 * Decoded saves often contain placeholder rows with neither, which used to render as
 * empty "Sponsorship 1 — exp --" cards.
 */
export function isUsableSponsorshipDeal(deal: SponsorshipDeal): boolean {
  const normalized = normalizeSponsorshipDeal(deal);
  const amount = normalized.annualValue;
  const hasAmount =
    typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
  const expires = (normalized.expires ?? '').trim().toLowerCase();
  return hasAmount || !UNREADABLE_SPONSOR_DATE.has(expires);
}

export function filterUsableSponsorshipDeals(
  deals: readonly SponsorshipDeal[] | null | undefined
): SponsorshipDeal[] | null {
  if (!deals) return null;
  return deals
    .map((deal, index) => normalizeSponsorshipDeal(deal, index))
    .filter(isUsableSponsorshipDeal);
}

/**
 * One row shape for the Hub Finances panel and the Analyst context, so a sponsorship
 * question gets the same names, amounts, expiry dates, and date-order warning.
 */
export function buildSponsorshipPanelRows(
  deals: readonly SponsorshipDeal[] | null | undefined,
  currencySymbol = '£'
): SponsorshipPanelRow[] {
  return (deals ?? []).map((deal, index) => {
    const normalized = normalizeSponsorshipDeal(deal, index);
    return {
      name: normalized.name || `Sponsorship ${index + 1}`,
      type: normalized.type || 'Sponsorship',
      annualValueLabel: formatClubMoney(normalized.annualValue ?? null, currencySymbol),
      expires: normalized.expires || '--',
      datesReordered: Boolean(normalized.dates_reordered),
    };
  });
}

/**
 * Sources a Finances panel can be built from, in the shape the app already holds after a
 * decode. Both the Hub panel and the share/export modal use this so a report can never
 * quote a different balance from the card on screen.
 */
export interface FinancesPanelSaveSources {
  hydratedSave?: {
    balanceLabel?: string | null;
    wageComplianceLabel?: string | null;
    financialRunway?: FinancialRunway | null;
    updatedStaff?: ReadonlyArray<{ wagePw?: number | null }> | null;
    decodedPayload?: {
      finances?: {
        balance?: number | null;
        wagePayrollWeekly?: number | null;
        wageBudgetWeekly?: number | null;
        transferBudgetRemaining?: number | null;
      } | null;
      meta?: { balance?: number | null } | null;
      monthlyFinances?: MonthlyFinance[] | null;
      sponsorships?: ReadonlyArray<SponsorshipDeal> | null;
    } | null;
  } | null;
  players: ReadonlyArray<{ wagePw?: number | null }>;
  staff?: ReadonlyArray<{ wagePw?: number | null }> | null;
  balanceLabel?: string | null;
  wageSpendLabel?: string | null;
}

export function buildFinancesPanelFromSave(
  sources: FinancesPanelSaveSources
): ClubFinancesPanelData {
  const decoded = sources.hydratedSave?.decodedPayload ?? null;
  return buildClubFinancesPanel({
    financesBalance: decoded?.finances?.balance ?? null,
    metaBalance: decoded?.meta?.balance ?? null,
    monthlyFinances: decoded?.monthlyFinances ?? null,
    balanceLabel: sources.hydratedSave?.balanceLabel ?? sources.balanceLabel ?? null,
    wagePayrollWeekly: decoded?.finances?.wagePayrollWeekly ?? null,
    wageBudgetWeekly: decoded?.finances?.wageBudgetWeekly ?? null,
    wageSpendLabel: sources.hydratedSave?.wageComplianceLabel ?? sources.wageSpendLabel ?? null,
    transferBudgetRemaining: decoded?.finances?.transferBudgetRemaining ?? null,
    financialRunway: sources.hydratedSave?.financialRunway ?? null,
    staff:
      (sources.staff && sources.staff.length > 0
        ? sources.staff
        : sources.hydratedSave?.updatedStaff) ?? [],
    playerWages: sources.players.map((player) => player.wagePw),
    sponsorships: filterUsableSponsorshipDeals(decoded?.sponsorships),
  });
}

/**
 * Builds every number the Hub Finances panel shows. Both the UI and the Analyst read the
 * same `resolveCanonicalClubFinances` and `staffRatings` payroll selectors, so a wage or
 * balance question cannot get two answers.
 */
export function buildClubFinancesPanel(
  input: ClubFinancesPanelInput
): ClubFinancesPanelData {
  const canonical = resolveCanonicalClubFinances(input);
  const currencySymbol = canonical.currencySymbol;
  const latestMonth = input.monthlyFinances?.[input.monthlyFinances.length - 1] ?? null;
  const monthlyNetAmount =
    latestMonth && Number.isFinite(latestMonth.netCashflow)
      ? Math.round(latestMonth.netCashflow)
      : null;
  const monthlyNetLabel =
    monthlyNetAmount === null
      ? '--'
      : `${monthlyNetAmount >= 0 ? '+' : ''}${formatClubMoney(
          monthlyNetAmount,
          currencySymbol
        )}/mo`;

  const runwayStatus = canonical.runwayStatus;
  const runwayMonths = canonical.runwayMonths;
  const runwayLabel =
    runwayStatus === null
      ? '--'
      : `${runwayStatus}${
          runwayMonths !== null && runwayMonths < 999 ? ` · ${runwayMonths} months` : ''
        }`;
  const runwayWarning =
    runwayStatus === 'Critical'
      ? `Critical runway${runwayMonths !== null ? ` — ${runwayMonths} months left` : ''}. Cut wages or sell players now.`
      : runwayStatus === 'Warning'
        ? `Runway warning${runwayMonths !== null ? ` — ${runwayMonths} months remaining` : ''}. Plan sales or wage relief.`
        : null;

  const staffPayroll = computeWeeklyStaffPayroll(input.staff ?? []);
  const squadWages = computeSquadWageSubtotal(input.playerWages ?? []);

  const wageHeadroomLabel =
    canonical.wageHeadroomWeekly === null
      ? '--'
      : canonical.wageHeadroomWeekly >= 0
        ? `${currencySymbol}${canonical.wageHeadroomWeekly.toLocaleString()}/wk under cap`
        : `${currencySymbol}${Math.abs(canonical.wageHeadroomWeekly).toLocaleString()}/wk over cap`;

  const sponsorships = buildSponsorshipPanelRows(input.sponsorships, currencySymbol);

  return {
    currencySymbol,
    cash: {
      balanceLabel: canonical.balanceLabel,
      balanceAmount: canonical.balanceNum,
      isInDebt: canonical.isInDebt,
      monthlyNetAmount,
      monthlyBurnRate: canonical.monthlyBurnRate,
      monthlyNetLabel,
      runwayStatus,
      runwayMonths,
      runwayLabel,
      runwayWarning,
    },
    payroll: {
      clubPayrollLabel: formatWeeklyMoney(canonical.wagePayrollWeekly, currencySymbol),
      wagePayrollWeekly: canonical.wagePayrollWeekly,
      wageBudgetLabel: formatWeeklyMoney(canonical.wageBudgetWeekly, currencySymbol),
      wageBudgetWeekly: canonical.wageBudgetWeekly,
      wageComplianceLabel: canonical.wageComplianceLabel,
      wageHeadroomLabel,
      wageHeadroomWeekly: canonical.wageHeadroomWeekly,
      wageSeverity: canonical.wageComplianceSeverity,
      staffPayrollLabel: formatWeeklyStaffPayroll(staffPayroll),
      staffMissingWageCount: staffPayroll.missingWageCount,
      squadWageSubtotalLabel: squadWages.label,
      squadWageMissingCount: squadWages.missingWageCount,
    },
    sponsorships,
  };
}
