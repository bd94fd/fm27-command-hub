import { PlayerRecord } from '../types/fm27';
import {
  CompetitionRegistrationRules,
  DivisionBenchmarks,
} from '../types/fmSave';
import {
  formatClubMoney,
  parseSignedMoneyValue,
  resolveCanonicalClubFinances,
  WageComplianceSeverity,
} from './clubFinances';

export type TransferActionVerdict =
  | 'Renew Now'
  | 'Protect Youth Asset'
  | 'Sell / Transfer List'
  | 'Replace Before Selling'
  | 'Loan Out'
  | 'Let Expire'
  | 'Hold';

export type SquadTier = 'senior' | 'youth_reserve' | 'on_loan';

export type PositionBucketCode =
  | 'GK'
  | 'RB'
  | 'CB'
  | 'LB'
  | 'DM'
  | 'CM'
  | 'AM'
  | 'W'
  | 'ST';

export interface ClubFinancialInput {
  balanceNum?: number | null;
  wagePayrollWeekly?: number | null;
  wageBudgetWeekly?: number | null;
  transferBudgetRemaining?: number | null;
  balanceLabel?: string;
  wageSpendLabel?: string;
  monthlyBurnRate?: number | null;
}

export interface ClubLeagueContextInput {
  competitionName?: string | null;
  leaguePosition?: number | null;
  totalClubs?: number | null;
  points?: number | null;
  played?: number | null;
  competitionRules?: CompetitionRegistrationRules | null;
  transferWindowOpen?: boolean | null;
  boardObjectiveSummary?: string | null;
}

export interface LeagueLevelCalibration {
  competitionName: string;
  clubTierLabel: string;
  standingContextLabel: string;
  starterAttrBaseline: number;
  standoutAttrBaseline: number;
  divisionMedianWeeklyWage: number | null;
  recruitmentApproachSummary: string;
}

export interface IncomingLoanPriorityItem {
  bucketCode: PositionBucketCode;
  bucketLabel: string;
  reason: 'Need Signing' | 'Replace High-Wage Backup' | 'Thin Senior Cover';
  targetRoles: string;
  maxWeeklyWageSharePw: number;
  recommendedWageSplitLabel: string;
  rationale: string;
}

export interface ClubLoanStrategySummary {
  headline: string;
  strategyNotes: string[];
  incomingLoanPriorities: IncomingLoanPriorityItem[];
  developmentLoansOut: PlayerTransferAdvice[];
  wageReliefLoanFallbacks: PlayerTransferAdvice[];
  activeLoansMonitor: PlayerTransferAdvice[];
  doNotLoanGuardrails: PlayerTransferAdvice[];
  leagueLoanRulesNote: string;
}

export interface ClubFinancialProfile {
  clubTierLabel: string;
  balanceNum: number | null;
  balanceLabel: string;
  isInDebt: boolean;
  wagePayrollWeekly: number;
  wageBudgetWeekly: number | null;
  wageHeadroomWeekly: number | null;
  wageVariancePct: number | null;
  wageComplianceSeverity: WageComplianceSeverity;
  wageComplianceLabel: string;
  isOverWageBudget: boolean;
  isMateriallyOverWageBudget: boolean;
  monthlyBurnRate: number | null;
  strategyHeadline: string;
  strategyBullets: string[];
}

export type AbilityReadinessTier =
  | 'squad_star'
  | 'starter_level'
  | 'rotation_ready'
  | 'developing_prospect'
  | 'academy_raw';

export interface PlayerTransferAdvice {
  player: PlayerRecord;
  squadTier: SquadTier;
  primaryBucketCode: PositionBucketCode;
  abilityReadinessTier: AbilityReadinessTier;
  abilityReadinessLabel: string;
  clubWidePositionRank: number;
  verdict: TransferActionVerdict;
  priority: 'High' | 'Medium' | 'Low';
  monthsLeft: number | null;
  annualWage: number;
  tags: string[];
  headline: string;
  rationale: string;
  recommendedMove: string;
}

export interface PositionalSigningNeed {
  code: PositionBucketCode;
  label: string;
  /** Senior first-team primary-position active headcount (no multi-position double-counting, excludes U21/youth/loan/surplus). */
  currentCount: number;
  /** Senior primary + First-Team Ready U21/Reserve active headcount (true internal first-team depth). */
  effectiveReadyCount: number;
  /** Senior primary + senior secondary versatility cover count. */
  totalWithCoverCount: number;
  idealMin: number;
  idealMax: number;
  status: 'Need Signing' | 'Promote Internal' | 'Overstocked' | 'Balanced';
  hasSuccessionGap: boolean;
  /** Senior first-team players whose primary position is this bucket. */
  seniorPrimaryPlayers: PlayerRecord[];
  /** Senior first-team players whose primary position is elsewhere, offering versatility cover here. */
  secondaryCoverPlayers: PlayerRecord[];
  /** U21 / Reserve players whose Current Ability already meets First-Team rotation/starter level relative to the squad. */
  firstTeamReadyYouthPlayers: PlayerRecord[];
  /** U21 / Academy prospects still developing below First-Team rotation ability (e.g. 1.0★-2.5★ teenagers). */
  academyProspectPlayers: PlayerRecord[];
  /** Combined U21 / Youth / Reserve players at this primary bucket (firstTeamReadyYouthPlayers + academyProspectPlayers). */
  youthReservePlayers: PlayerRecord[];
  /** Players currently out on loan whose primary position is this bucket. */
  onLoanPlayers: PlayerRecord[];
  /** Combined primary-bucket roster (sorted by squad-relative strength for club-wide awareness). */
  players: PlayerRecord[];
  scoutProfile: string;
}

export interface DynamicSquadTierBenchmarks {
  p75PaidWeeklyWage: number;
  medianPaidWeeklyWage: number;
  p75AbilityStars: number;
  /** Average Current Ability (★) of the club's top-11 players. */
  top11AvgAbility: number;
  /** Current Ability (★) floor for First-Team Starter level relative to this squad. */
  firstTeamStarterFloor: number;
  /** Current Ability (★) floor for First-Team Rotation Ready level relative to this squad. */
  firstTeamRotationFloor: number;
  /** Highest Current Ability (★) in the squad. */
  squadBestAbility: number;
  divisionCompared: boolean;
  divisionDeficits: string[];
}

export interface SquadTransferAuditSummary {
  clubProfile: ClubFinancialProfile;
  leagueLevelCalibration: LeagueLevelCalibration;
  loanAdvice: ClubLoanStrategySummary;
  totalWeeklyWage: number;
  /** Projected weekly wage savings if recommended sales/exits complete (NOT yet banked). */
  potentialWeeklySavings: number;
  projectedWeeklySavings: number;
  /** Actual banked weekly savings from completed exits (separate from projected savings). */
  actualBankedWeeklySavings: number;
  expiringWithin12mCount: number;
  actionableNeedsCount: number;
  squadTierCounts: {
    senior: number;
    youthReserve: number;
    onLoan: number;
  };
  countsByVerdict: Record<TransferActionVerdict, number>;
  playerAdvice: PlayerTransferAdvice[];
  positionalNeeds: PositionalSigningNeed[];
  successionGapCodes: string[];
  tierBenchmarks: DynamicSquadTierBenchmarks;
}

/**
 * Parses money strings including BOTH negative minus signs ("-£749K")
 * and accounting parentheses ("(£749K)") accurately as signed numbers.
 */
export function parseSignedMoneyString(raw?: string | null): number | null {
  return parseSignedMoneyValue(raw);
}

export function parseContractDate(raw: string): Date | null {
  const s = (raw || '').trim();
  if (!s || s === 'N/A' || s === '--') return null;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  const yearOnly = s.match(/\b(20\d{2})\b/);
  if (yearOnly) {
    return new Date(Number(yearOnly[1]), 5, 30);
  }
  return null;
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth())
  );
}

function isPositivePersonality(p: PlayerRecord): boolean {
  const pers = (p.personality || '').toLowerCase();
  return (
    pers.includes('model') ||
    pers.includes('professional') ||
    pers.includes('driven') ||
    pers.includes('resolute') ||
    pers.includes('spirited') ||
    pers.includes('determined') ||
    (p.attributes?.determination ?? 10) >= 15
  );
}

function isWeakPersonality(p: PlayerRecord): boolean {
  const pers = (p.personality || '').toLowerCase();
  return (
    pers.includes('unambitious') ||
    pers.includes('casual') ||
    pers.includes('slack') ||
    pers.includes('temperamental') ||
    (p.attributes?.determination ?? 10) <= 7
  );
}

/**
 * Splits club roster cleanly into Senior First-Team, U21/Youth/Reserve, and Out on Loan
 * so youth/reserve prospects and loaned-out players never distort senior positional headcount.
 */
export function classifySquadTier(p: PlayerRecord): SquadTier {
  if (p.onLoan === true) return 'on_loan';
  if (typeof p.teamSlot === 'number' && p.teamSlot > 0) return 'youth_reserve';
  if (p.status === 'Youth') return 'youth_reserve';
  if (
    /youth|u21|u19|u18|reserve/i.test(
      p.contractDetails?.promisedPlayingTime || ''
    ) &&
    p.age <= 21
  ) {
    return 'youth_reserve';
  }
  return 'senior';
}

const BUCKET_ORDER: PositionBucketCode[] = [
  'GK',
  'RB',
  'CB',
  'LB',
  'DM',
  'CM',
  'AM',
  'W',
  'ST',
];

function getBucketFamiliarity(
  p: PlayerRecord,
  code: PositionBucketCode
): number | null {
  const pr = p.positionRatings;
  if (!pr || !Object.values(pr).some((v) => typeof v === 'number' && v > 1)) {
    return null;
  }
  const lower: Record<string, number> = {};
  for (const [k, v] of Object.entries(pr)) {
    if (typeof v === 'number') lower[k.toLowerCase()] = v;
  }
  const maxOf = (...keys: string[]) =>
    Math.max(0, ...keys.map((k) => lower[k] || 0));
  switch (code) {
    case 'GK':
      return maxOf('gk');
    case 'CB':
      return maxOf('dc', 'cb');
    case 'RB':
      return maxOf('dr', 'rb', 'wbr');
    case 'LB':
      return maxOf('dl', 'lb', 'wbl');
    case 'DM':
      return maxOf('dm');
    case 'CM':
      return maxOf('mc', 'cm');
    case 'AM':
      return maxOf('amc', 'am');
    case 'W':
      return maxOf('amr', 'aml', 'mr', 'ml', 'rw', 'lw');
    case 'ST': {
      const hasStKey = 'st' in lower || 'stc' in lower || 'cf' in lower;
      return hasStKey ? maxOf('st', 'stc', 'cf') : null;
    }
  }
}

function matchesPositionText(posUpper: string, code: PositionBucketCode): boolean {
  switch (code) {
    case 'GK':
      return posUpper.includes('GK');
    case 'CB':
      return /\bD\s*\([RLC]*C[RLC]*\)|\bDC\b|\bCB\b/.test(posUpper);
    case 'RB':
      return /\b(D|WB)\s*\([RLC]*R[RLC]*\)|\bDR\b|\bWBR\b|\bRB\b/.test(posUpper);
    case 'LB':
      return /\b(D|WB)\s*\([RLC]*L[RLC]*\)|\bDL\b|\bWBL\b|\bLB\b/.test(posUpper);
    case 'DM':
      return /\bDM\b/.test(posUpper);
    case 'CM':
      return /\bMC\b|\bCM\b|(?<!A)\bM\s*\([RLC]*C/.test(posUpper);
    case 'AM':
      return /\bAMC\b|\bAM\s*\([RLC]*C/.test(posUpper);
    case 'W':
      return /\b(M|AM)\s*\([RLC]*[RL][RLC]*\)|\bAMR\b|\bAML\b|\bMR\b|\bML\b|\bRW\b|\bLW\b/.test(
        posUpper
      );
    case 'ST':
      return /\bST\b|\bSTC\b|\bCF\b/.test(posUpper);
  }
}

function matchesPositionBucket(
  p: PlayerRecord,
  code: PositionBucketCode
): boolean {
  const fam = getBucketFamiliarity(p, code);
  if (fam !== null) {
    return fam >= 15;
  }
  return matchesPositionText((p.position || '').toUpperCase(), code);
}

/**
 * Assigns every player EXACTLY ONE primary position bucket so versatile multi-position
 * players are never double-counted as separate bodies across multiple positional lists.
 */
export function resolvePrimaryPositionBucket(
  p: PlayerRecord
): PositionBucketCode {
  const posUpper = (p.position || '').toUpperCase();
  const primaryToken = (posUpper.split(/[,/]/)[0] || posUpper).trim();

  // 1. Check natural/highest familiarity ratings when available
  let bestCode: PositionBucketCode | null = null;
  let bestScore = -1;

  for (const code of BUCKET_ORDER) {
    const fam = getBucketFamiliarity(p, code);
    if (fam === null || fam <= 0) continue;
    const matchesPrimaryToken = matchesPositionText(primaryToken, code) ? 1 : 0;
    // Small tie-break bonus (0.5) if this bucket is listed first in p.position
    const weighted = fam + matchesPrimaryToken * 0.5;
    if (weighted > bestScore) {
      bestScore = weighted;
      bestCode = code;
    }
  }

  if (bestCode !== null && bestScore >= 14) {
    return bestCode;
  }

  // 2. Fall back to the FIRST position token in p.position
  for (const code of BUCKET_ORDER) {
    if (matchesPositionText(primaryToken, code)) {
      return code;
    }
  }

  // 3. Fall back to full p.position string
  for (const code of BUCKET_ORDER) {
    if (matchesPositionText(posUpper, code)) {
      return code;
    }
  }

  return bestCode ?? 'CM';
}

function playerStrengthScore(p: PlayerRecord): number {
  const ratingBonus =
    typeof p.rating === 'number' && p.rating > 0 ? p.rating * 5 : 33;
  // Long-term squad building score: ability + potential + form (never temporary match condition)
  return (
    (p.ability || 2.5) * 32 +
    (p.potential || p.ability || 2.5) * 6 +
    ratingBonus
  );
}

function percentileValue(
  sortedAsc: number[],
  pct: number,
  fallback: number
): number {
  if (sortedAsc.length === 0) return fallback;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.floor(sortedAsc.length * pct))
  );
  return sortedAsc[idx];
}

function positionGroupForTier(pos: string): 'GK' | 'DEF' | 'MID' | 'FWD' {
  const p = (pos || '').toUpperCase();
  if (p.includes('GK')) return 'GK';
  if (p.includes('ST') || p.includes('CF')) return 'FWD';
  if (/\b(DC|DL|DR|CB|WB)\b|D\s*\(/.test(p)) return 'DEF';
  return 'MID';
}

/**
 * Pure tier-agnostic squad benchmark helper (scales smoothly from £350/wk non-league
 * squads up to Premier League payrolls without any hardcoded €40M / €100M floors).
 */
export function computeDynamicSquadTierBenchmarks(
  players: PlayerRecord[],
  divisionBenchmarks?: DivisionBenchmarks | null
): DynamicSquadTierBenchmarks {
  const paidWages = players
    .map((p) => p.wagePw || 0)
    .filter((w) => w > 0)
    .sort((a, b) => a - b);
  const abilities = players
    .map((p) => p.ability || 2.5)
    .sort((a, b) => a - b);

  const medianPaidWeeklyWage = percentileValue(paidWages, 0.5, 200);
  const p75PaidWeeklyWage = percentileValue(paidWages, 0.75, 350);
  const p75AbilityStars = percentileValue(abilities, 0.75, 3.5);

  // Squad-relative First-Team ability benchmarks from active (non-loan) players
  const activeAbilitiesDesc = players
    .filter((p) => classifySquadTier(p) !== 'on_loan')
    .map((p) => p.ability || 2.5)
    .sort((a, b) => b - a);
  const top11 = activeAbilitiesDesc.slice(0, Math.min(11, activeAbilitiesDesc.length));
  const squadBestAbility = top11[0] ?? 4.0;
  const top11AvgAbility =
    top11.length > 0
      ? Number((top11.reduce((s, v) => s + v, 0) / top11.length).toFixed(2))
      : 3.5;
  const top11Asc = [...top11].sort((a, b) => a - b);
  // 25th percentile of the top-11 (approx 8th-9th best player in squad) sets First-Team Starter floor
  const rawStarterFloor = percentileValue(top11Asc, 0.25, 3.5);
  const firstTeamStarterFloor = Number(
    Math.min(4.5, Math.max(2.5, Math.round(rawStarterFloor * 2) / 2)).toFixed(1)
  );
  const firstTeamRotationFloor = Number(
    Math.max(2.5, firstTeamStarterFloor - 0.5).toFixed(1)
  );

  const divisionDeficits: string[] = [];
  if (divisionBenchmarks?.byPositionGroup && players.length > 0) {
    const groups: Array<'GK' | 'DEF' | 'MID' | 'FWD'> = [
      'GK',
      'DEF',
      'MID',
      'FWD',
    ];
    for (const grp of groups) {
      const divGrp = divisionBenchmarks.byPositionGroup[grp];
      if (!divGrp || divGrp.sampleSize === 0) continue;
      const grpPlayers = players.filter(
        (p) => positionGroupForTier(p.position) === grp
      );
      if (grpPlayers.length === 0) continue;

      const checkKey: keyof PlayerRecord['attributes'] =
        grp === 'GK'
          ? 'reflexes'
          : grp === 'DEF'
            ? 'tackling'
            : grp === 'FWD'
              ? 'finishing'
              : 'passing';
      const divMedian = divGrp.medianAttributes[checkKey];
      if (typeof divMedian === 'number' && divMedian > 0) {
        const clubAvg =
          grpPlayers.reduce(
            (sum, p) => sum + Number(p.attributes?.[checkKey] ?? 10),
            0
          ) / grpPlayers.length;
        if (clubAvg < divMedian - 1.2) {
          divisionDeficits.push(
            `${grp} ${checkKey} avg ${clubAvg.toFixed(1)} trails ${divisionBenchmarks.competitionName} median (${divMedian.toFixed(1)})`
          );
        }
      }
    }
  }

  return {
    p75PaidWeeklyWage,
    medianPaidWeeklyWage,
    p75AbilityStars,
    top11AvgAbility,
    firstTeamStarterFloor,
    firstTeamRotationFloor,
    squadBestAbility,
    divisionCompared: Boolean(divisionBenchmarks?.byPositionGroup),
    divisionDeficits,
  };
}

export function classifyPlayerAbilityReadiness(
  player: Pick<PlayerRecord, 'ability' | 'potential' | 'age'>,
  benchmarks: Pick<
    DynamicSquadTierBenchmarks,
    'firstTeamStarterFloor' | 'firstTeamRotationFloor' | 'squadBestAbility'
  >,
  clubWidePositionRank = 99,
  starterSlots = 1
): { tier: AbilityReadinessTier; label: string } {
  const ab = player.ability || 0;
  const starThreshold = Math.min(
    5.0,
    Math.max(benchmarks.firstTeamStarterFloor + 0.5, benchmarks.squadBestAbility - 0.5)
  );
  if (
    ab >= starThreshold &&
    ab >= 3.5 &&
    (clubWidePositionRank <= starterSlots || ab >= benchmarks.squadBestAbility)
  ) {
    return { tier: 'squad_star', label: 'Squad Star' };
  }
  if (
    ab >= benchmarks.firstTeamStarterFloor ||
    (clubWidePositionRank <= starterSlots && ab >= benchmarks.firstTeamRotationFloor)
  ) {
    return { tier: 'starter_level', label: 'Starter Level' };
  }
  if (ab >= benchmarks.firstTeamRotationFloor) {
    return { tier: 'rotation_ready', label: 'First-Team Ready' };
  }
  const developingFloor = Math.max(2.0, benchmarks.firstTeamRotationFloor - 1.0);
  if (ab >= developingFloor) {
    return { tier: 'developing_prospect', label: 'Developing' };
  }
  return { tier: 'academy_raw', label: 'Academy / Raw' };
}

export function buildSquadTransferAudit(
  players: PlayerRecord[],
  saveDate: string,
  finances?: ClubFinancialInput,
  divisionBenchmarks?: DivisionBenchmarks | null,
  leagueContext?: ClubLeagueContextInput | null
): SquadTransferAuditSummary {
  const refDate = parseContractDate(saveDate) || new Date(2027, 8, 15);
  const tierBenchmarks = computeDynamicSquadTierBenchmarks(
    players,
    divisionBenchmarks
  );
  const squadWeeklyWageSum = players.reduce(
    (sum, p) => sum + (p.wagePw || 0),
    0
  );

  // Single canonical financial source of truth
  const canonicalFinances = resolveCanonicalClubFinances({
    financesBalance: finances?.balanceNum ?? null,
    balanceLabel: finances?.balanceLabel ?? null,
    wagePayrollWeekly:
      typeof finances?.wagePayrollWeekly === 'number' &&
      finances.wagePayrollWeekly > 0
        ? finances.wagePayrollWeekly
        : squadWeeklyWageSum > 0
          ? squadWeeklyWageSum
          : null,
    wageBudgetWeekly:
      typeof finances?.wageBudgetWeekly === 'number' &&
      finances.wageBudgetWeekly > 0
        ? finances.wageBudgetWeekly
        : null,
    wageSpendLabel: finances?.wageSpendLabel ?? null,
    transferBudgetRemaining: finances?.transferBudgetRemaining ?? null,
  });

  const balanceNum = canonicalFinances.balanceNum;
  const balanceLabel = canonicalFinances.balanceLabel;
  const wagePayrollWeekly =
    canonicalFinances.wagePayrollWeekly ?? squadWeeklyWageSum;
  const wageBudgetWeekly = canonicalFinances.wageBudgetWeekly;
  const wageHeadroomWeekly = canonicalFinances.wageHeadroomWeekly;
  const wageVariancePct = canonicalFinances.wageVariancePct;
  const wageComplianceSeverity = canonicalFinances.wageComplianceSeverity;
  const isInDebt = canonicalFinances.isInDebt;
  const isOverWageBudget = canonicalFinances.isOverWageBudget;
  const isMateriallyOverWageBudget =
    canonicalFinances.isMateriallyOverWageBudget;
  const monthlyBurnRate =
    typeof finances?.monthlyBurnRate === 'number' &&
    Number.isFinite(finances.monthlyBurnRate)
      ? Math.round(finances.monthlyBurnRate)
      : null;

  const scaleRef = wageBudgetWeekly || wagePayrollWeekly;
  const clubTierLabel =
    scaleRef >= 150_000
      ? 'Top-Flight Club'
      : scaleRef >= 30_000
        ? 'Mid-Tier Professional Club'
        : scaleRef >= 6_000
          ? 'Lower-League / Semi-Pro Club'
          : 'Grassroots / Non-League Club';

  const resolvedLeagueName =
    (leagueContext?.competitionName && leagueContext.competitionName !== '--'
      ? leagueContext.competitionName
      : null) ||
    divisionBenchmarks?.competitionName ||
    leagueContext?.competitionRules?.competitionName ||
    'Domestic Division';

  // Compute dynamic attribute baseline (1–20) from Division Benchmarks & Top-11 squad starters
  // so scouting targets, role floors, and tactical/loan advice ALWAYS match this club & league level!
  const divAttrSamples: number[] = [];
  const divWageSamples: number[] = [];
  if (divisionBenchmarks?.byPositionGroup) {
    for (const grp of ['GK', 'DEF', 'MID', 'FWD'] as const) {
      const b = divisionBenchmarks.byPositionGroup[grp];
      if (!b || b.sampleSize === 0) continue;
      if (typeof b.medianWeeklyWage === 'number' && b.medianWeeklyWage > 0) {
        divWageSamples.push(b.medianWeeklyWage);
      }
      for (const v of Object.values(b.medianAttributes || {})) {
        if (typeof v === 'number' && v > 0) divAttrSamples.push(v);
      }
    }
  }
  const top11Players = [...players]
    .filter((p) => !p.onLoan)
    .sort((a, b) => (b.ability || 0) - (a.ability || 0))
    .slice(0, Math.min(11, players.length));
  const squadCoreAttrSamples: number[] = [];
  for (const sp of top11Players) {
    const a = sp.attributes;
    if (!a) continue;
    for (const k of ['pace', 'stamina', 'passing', 'tackling', 'decisions', 'finishing'] as const) {
      const val = a[k];
      if (typeof val === 'number' && val > 0) squadCoreAttrSamples.push(val);
    }
  }
  divAttrSamples.sort((a, b) => a - b);
  squadCoreAttrSamples.sort((a, b) => a - b);
  divWageSamples.sort((a, b) => a - b);

  const fallbackTierAttr =
    scaleRef >= 150_000 ? 15 : scaleRef >= 30_000 ? 13 : scaleRef >= 6_000 ? 11 : 10;
  const rawBaselineAttr =
    divAttrSamples.length > 0
      ? divAttrSamples[Math.floor(divAttrSamples.length / 2)]
      : squadCoreAttrSamples.length > 0
        ? squadCoreAttrSamples[Math.floor(squadCoreAttrSamples.length / 2)]
        : fallbackTierAttr;
  const starterAttrBaseline = Math.max(9, Math.min(16, Math.round(rawBaselineAttr)));
  const standoutAttrBaseline = Math.min(18, starterAttrBaseline + 2);
  const divisionMedianWeeklyWage =
    divWageSamples.length > 0
      ? Math.round(divWageSamples[Math.floor(divWageSamples.length / 2)])
      : null;

  const posNum = leagueContext?.leaguePosition ?? null;
  const totalClubs = leagueContext?.totalClubs ?? divisionBenchmarks?.clubCount ?? 16;
  const standingContextLabel =
    posNum !== null && posNum > 0
      ? posNum <= 2
        ? `#${posNum} of ${totalClubs} in ${resolvedLeagueName} (Title / Automatic Promotion Push)`
        : posNum <= Math.max(5, Math.ceil(totalClubs * 0.35))
          ? `#${posNum} of ${totalClubs} in ${resolvedLeagueName} (Play-Off / Upper-Table Contender)`
          : posNum >= Math.max(totalClubs - 3, Math.floor(totalClubs * 0.8))
            ? `#${posNum} of ${totalClubs} in ${resolvedLeagueName} (Survival / Relegation Margin)`
            : `#${posNum} of ${totalClubs} in ${resolvedLeagueName} (Mid-Table Consolidation)`
      : leagueContext?.boardObjectiveSummary || `${resolvedLeagueName} (${clubTierLabel})`;

  const attrTarget = (offset = 0) => Math.max(8, Math.min(17, starterAttrBaseline + offset));

  // Classify every player into Senior First-Team vs U21/Youth/Reserve vs Out on Loan,
  // and assign EXACTLY ONE primary position bucket per player.
  const tierById = new Map<string, SquadTier>();
  const primaryBucketById = new Map<string, PositionBucketCode>();
  let seniorCount = 0;
  let youthReserveCount = 0;
  let onLoanCount = 0;

  for (const p of players) {
    const tier = classifySquadTier(p);
    tierById.set(p.id, tier);
    primaryBucketById.set(p.id, resolvePrimaryPositionBucket(p));
    if (tier === 'senior') seniorCount += 1;
    else if (tier === 'youth_reserve') youthReserveCount += 1;
    else onLoanCount += 1;
  }

  // Compute 4-3-3 positional depth cleanly split by Senior Primary, Secondary Cover, U21/Youth, and On Loan
  // with scout attribute floors dynamically calibrated to THIS team & league level!
  const bucketDefs: Array<{
    code: PositionBucketCode;
    label: string;
    idealMin: number;
    idealMax: number;
    starterSlots: number;
    scoutProfile: string;
  }> = [
    {
      code: 'GK',
      label: 'Goalkeepers',
      idealMin: 2,
      idealMax: 3,
      starterSlots: 1,
      scoutProfile: `No-Nonsense / Line-Holding GK IP + GK OOP — Reflexes ≥ ${attrTarget(0)}, Decisions ≥ ${attrTarget(-1)}, Aerial/JR ≥ ${attrTarget(0)} (${resolvedLeagueName} standard)`,
    },
    {
      code: 'RB',
      label: 'Right-Backs',
      idealMin: 2,
      idealMax: 3,
      starterSlots: 1,
      scoutProfile: `Full-Back IP / Pressing or Holding FB OOP — Pace ≥ ${attrTarget(1)}, Acc ≥ ${attrTarget(1)}, Stamina ≥ ${attrTarget(0)}, Tackling ≥ ${attrTarget(0)}`,
    },
    {
      code: 'CB',
      label: 'Centre-Backs',
      idealMin: 4,
      idealMax: 5,
      starterSlots: 2,
      scoutProfile: `CB / Ball-Playing CB IP + Stopping/Covering CB OOP — Jumping Reach ≥ ${attrTarget(1)}, Tackling ≥ ${attrTarget(0)}, Pace ≥ ${attrTarget(0)}`,
    },
    {
      code: 'LB',
      label: 'Left-Backs',
      idealMin: 2,
      idealMax: 3,
      starterSlots: 1,
      scoutProfile: `Full-Back IP / Pressing or Holding FB OOP — Left-footed, Pace ≥ ${attrTarget(1)}, Stamina ≥ ${attrTarget(0)}, Tackling ≥ ${attrTarget(0)}`,
    },
    {
      code: 'DM',
      label: 'Defensive Mids',
      idealMin: 2,
      idealMax: 3,
      starterSlots: 1,
      scoutProfile: `DM / Half-Back IP + Screening DM OOP — Tackling ≥ ${attrTarget(0)}, Positioning ≥ ${attrTarget(0)}, Stamina ≥ ${attrTarget(0)}, Passing ≥ ${attrTarget(0)}`,
    },
    {
      code: 'CM',
      label: 'Central Mids',
      idealMin: 4,
      idealMax: 6,
      starterSlots: 2,
      scoutProfile: `Channel / Box-to-Box CM IP + Pressing / Wide CM OOP — Passing ≥ ${attrTarget(0)}, First Touch ≥ ${attrTarget(0)}, Work Rate ≥ ${attrTarget(1)}, Stamina ≥ ${attrTarget(0)}`,
    },
    {
      code: 'AM',
      label: 'Attacking Mids (AMC)',
      idealMin: 0,
      idealMax: 3,
      starterSlots: 1,
      scoutProfile: `Attacking Midfielder / Advanced Playmaker IP + Tracking AM OOP — Vision ≥ ${attrTarget(0)}, Off The Ball ≥ ${attrTarget(0)}, First Touch ≥ ${attrTarget(0)}`,
    },
    {
      code: 'W',
      label: 'Wingers / IFs',
      idealMin: 4,
      idealMax: 6,
      starterSlots: 2,
      scoutProfile: `Winger / Inside Forward IP + Tracking Winger OOP — Pace ≥ ${attrTarget(1)}, Acc ≥ ${attrTarget(1)}, Stamina ≥ ${attrTarget(0)}, Work Rate ≥ ${attrTarget(0)}`,
    },
    {
      code: 'ST',
      label: 'Strikers',
      idealMin: 2,
      idealMax: 4,
      starterSlots: 1,
      scoutProfile: `Poacher / Channel Forward IP + Outlet CF OOP — Finishing ≥ ${attrTarget(0)}, Off The Ball ≥ ${attrTarget(1)}, Pace ≥ ${attrTarget(1)}`,
    },
  ];

  const isSurplusToRequirements = (p: PlayerRecord): boolean =>
    p.status === 'Surplus' ||
    /surplus/i.test(p.contractDetails?.promisedPlayingTime || '');

  const sortBucketPlayers = (list: PlayerRecord[]) =>
    [...list].sort((a, b) => {
      const aSurplus = isSurplusToRequirements(a);
      const bSurplus = isSurplusToRequirements(b);
      if (aSurplus !== bSurplus) return aSurplus ? 1 : -1;
      return playerStrengthScore(b) - playerStrengthScore(a);
    });

  const positionalNeeds: PositionalSigningNeed[] = bucketDefs.map((d) => {
    const seniorPrimaryPlayers = sortBucketPlayers(
      players.filter(
        (p) =>
          tierById.get(p.id) === 'senior' &&
          primaryBucketById.get(p.id) === d.code
      )
    );
    const secondaryCoverPlayers = sortBucketPlayers(
      players.filter(
        (p) =>
          tierById.get(p.id) === 'senior' &&
          primaryBucketById.get(p.id) !== d.code &&
          matchesPositionBucket(p, d.code)
      )
    );
    const youthReservePlayers = sortBucketPlayers(
      players.filter(
        (p) =>
          tierById.get(p.id) === 'youth_reserve' &&
          primaryBucketById.get(p.id) === d.code
      )
    );
    const onLoanPlayers = sortBucketPlayers(
      players.filter(
        (p) =>
          tierById.get(p.id) === 'on_loan' &&
          primaryBucketById.get(p.id) === d.code
      )
    );

    const activeSeniorPrimary = seniorPrimaryPlayers.filter(
      (p) => !isSurplusToRequirements(p)
    );
    const activeSecondaryCover = secondaryCoverPlayers.filter(
      (p) => !isSurplusToRequirements(p)
    );
    const activeYouthReserve = youthReservePlayers.filter(
      (p) => !isSurplusToRequirements(p)
    );

    // Split U21 / Youth / Reserve players by squad-relative Current Ability:
    // First-Team Ready (3.0★+ / meets rotation floor — e.g. 22yo 3.5★) vs Academy/Developing (e.g. 16yo 1.0★/5.0★)
    const firstTeamReadyYouthPlayers: PlayerRecord[] = [];
    const academyProspectPlayers: PlayerRecord[] = [];
    for (const yp of youthReservePlayers) {
      const readiness = classifyPlayerAbilityReadiness(yp, tierBenchmarks);
      if (
        readiness.tier === 'squad_star' ||
        readiness.tier === 'starter_level' ||
        readiness.tier === 'rotation_ready'
      ) {
        firstTeamReadyYouthPlayers.push(yp);
      } else {
        academyProspectPlayers.push(yp);
      }
    }
    const activeFirstTeamReadyYouth = firstTeamReadyYouthPlayers.filter(
      (p) => !isSurplusToRequirements(p)
    );

    // Primary-bucket roster: senior primary first, then ready U21, then academy, then loaned
    const combinedPrimaryRoster = [
      ...seniorPrimaryPlayers,
      ...firstTeamReadyYouthPlayers,
      ...academyProspectPlayers,
      ...onLoanPlayers,
    ];

    const hasU23Cover =
      activeSeniorPrimary.some((p) => p.age <= 23) ||
      activeYouthReserve.some((p) => p.age <= 23) ||
      activeSecondaryCover.some((p) => p.age <= 23);

    const hasSuccessionGap =
      activeSeniorPrimary.length > 0 &&
      activeSeniorPrimary.every((p) => p.age >= 28) &&
      !hasU23Cover;

    const currentCount = activeSeniorPrimary.length;
    const effectiveReadyCount =
      activeSeniorPrimary.length + activeFirstTeamReadyYouth.length;
    const totalWithCoverCount =
      activeSeniorPrimary.length + activeSecondaryCover.length;

    const status: PositionalSigningNeed['status'] =
      players.length === 0
        ? 'Balanced'
        : currentCount < d.idealMin
          ? effectiveReadyCount >= d.idealMin
            ? 'Promote Internal'
            : 'Need Signing'
          : currentCount > d.idealMax
            ? 'Overstocked'
            : 'Balanced';

    return {
      code: d.code,
      label: d.label,
      currentCount,
      effectiveReadyCount,
      totalWithCoverCount,
      idealMin: d.idealMin,
      idealMax: d.idealMax,
      status,
      hasSuccessionGap,
      seniorPrimaryPlayers,
      secondaryCoverPlayers,
      firstTeamReadyYouthPlayers,
      academyProspectPlayers,
      youthReservePlayers: [...firstTeamReadyYouthPlayers, ...academyProspectPlayers],
      onLoanPlayers,
      players: combinedPrimaryRoster,
      scoutProfile: d.scoutProfile,
    };
  });

  const successionGapCodes = positionalNeeds
    .filter((b) => b.hasSuccessionGap)
    .map((b) => b.code);
  const thinBucketCodes = positionalNeeds
    .filter((b) => b.status === 'Need Signing')
    .map((b) => b.code);
  const promoteInternalBucketCodes = positionalNeeds
    .filter((b) => b.status === 'Promote Internal')
    .map((b) => b.code);
  const overstockedBucketCodes = positionalNeeds
    .filter((b) => b.status === 'Overstocked')
    .map((b) => b.code);
  const actionableNeedsCount = positionalNeeds.filter(
    (b) => b.status === 'Need Signing' || b.hasSuccessionGap
  ).length;

  // Compute paid-player median wage (ignoring £0 youth/amateur deals)
  const paidWages = players
    .map((p) => p.wagePw || 0)
    .filter((w) => w > 0)
    .sort((a, b) => a - b);
  const medianPaidWage =
    paidWages.length > 0
      ? paidWages[Math.floor(paidWages.length / 2)]
      : 200;
  const highWageThreshold =
    paidWages.length > 0
      ? paidWages[Math.floor(paidWages.length * 0.65)]
      : 300;

  const bucketByCode = new Map<PositionBucketCode, PositionalSigningNeed>(
    positionalNeeds.map((b) => [b.code, b])
  );
  const starterSlotsByCode = new Map<PositionBucketCode, number>(
    bucketDefs.map((d) => [d.code, d.starterSlots])
  );

  // Pure ability-first club-wide rank per bucket (across Senior + U21/Reserve active players)
  // so an 18-year-old 4.5★ phenom is immediately recognized as #1 at his position regardless of squad slot!
  const clubWideRankByPlayerId = new Map<string, number>();
  for (const bucket of positionalNeeds) {
    const activeClubAtBucket = [
      ...bucket.seniorPrimaryPlayers,
      ...bucket.youthReservePlayers,
    ]
      .filter((pl) => !isSurplusToRequirements(pl))
      .sort((a, b) => {
        if ((b.ability || 0) !== (a.ability || 0)) {
          return (b.ability || 0) - (a.ability || 0);
        }
        return playerStrengthScore(b) - playerStrengthScore(a);
      });
    activeClubAtBucket.forEach((pl, idx) => {
      clubWideRankByPlayerId.set(pl.id, idx + 1);
    });
  }

  const getPlayerPrimaryBucketInfo = (p: PlayerRecord) => {
    const primaryCode = primaryBucketById.get(p.id) || 'CM';
    const bestBucket = bucketByCode.get(primaryCode) || null;
    const starterSlots = starterSlotsByCode.get(primaryCode) ?? 1;
    let bestRank = 1;
    if (bestBucket) {
      const idx = bestBucket.players.findIndex((cand) => cand.id === p.id);
      bestRank = idx >= 0 ? idx + 1 : bestBucket.players.length + 1;
    }
    const clubWidePositionRank = clubWideRankByPlayerId.get(p.id) ?? bestRank;
    return { bestBucket, bestRank, clubWidePositionRank, starterSlots, primaryCode };
  };

  const maxSquadMinutes = players.reduce(
    (max, pl) => Math.max(max, pl.minutes || 0),
    0
  );

  const findInternalYouthSuccessor = (
    p: PlayerRecord,
    bucket: PositionalSigningNeed | null
  ): PlayerRecord | null => {
    if (!bucket) return null;
    // Search primary-bucket youth/reserves AND young first-team options (never players out on loan)
    const pool = [
      ...bucket.youthReservePlayers,
      ...bucket.seniorPrimaryPlayers,
    ];
    const youthCands = pool
      .filter(
        (cand) =>
          cand.id !== p.id &&
          tierById.get(cand.id) !== 'on_loan' &&
          !isSurplusToRequirements(cand) &&
          cand.age <= 22 &&
          cand.potential >= 3.5 &&
          cand.ability >= (p.ability || 2.5) - 1.0 &&
          (cand.wagePw || 0) < (p.wagePw || 0)
      )
      .sort((a, b) => {
        // Prefer true U21 / youth-reserve prospects on lower wages ahead of already-senior 22yo backups
        const aIsTrueYouth =
          tierById.get(a.id) === 'youth_reserve' || a.age <= 21 ? 1 : 0;
        const bIsTrueYouth =
          tierById.get(b.id) === 'youth_reserve' || b.age <= 21 ? 1 : 0;
        if (bIsTrueYouth !== aIsTrueYouth) return bIsTrueYouth - aIsTrueYouth;
        return (
          (b.ability || 0) - (a.ability || 0) ||
          (b.potential || 0) - (a.potential || 0) ||
          (a.wagePw || 0) - (b.wagePw || 0)
        );
      });
    return youthCands[0] || null;
  };

  const youthSuccessorByPlayerId = new Map<string, PlayerRecord>();

  const playerAdvice: PlayerTransferAdvice[] = players.map((p) => {
    const squadTier = tierById.get(p.id) || 'senior';
    const expDate = parseContractDate(p.expires);
    const monthsLeft = expDate ? monthsBetween(refDate, expDate) : null;
    const annualWage = (p.wagePw || 0) * 52;
    const isSurplus = isSurplusToRequirements(p);
    const positivePers = isPositivePersonality(p);
    const weakPers = isWeakPersonality(p);
    const isMentor = p.age >= 26 && positivePers && squadTier === 'senior';
    const isHighPotYouth =
      p.age <= 21 && (p.potential >= 3.5 || p.potential - p.ability >= 1.0);
    const isExpiringSoon = monthsLeft !== null && monthsLeft <= 11;

    const { bestBucket, bestRank, clubWidePositionRank, starterSlots, primaryCode } =
      getPlayerPrimaryBucketInfo(p);

    // Evaluate Current Ability strictly relative to THIS squad's First-Team level
    const readiness = classifyPlayerAbilityReadiness(
      p,
      tierBenchmarks,
      clubWidePositionRank,
      starterSlots
    );
    const abilityReadinessTier = readiness.tier;
    const abilityReadinessLabel = readiness.label;

    // An 18-year-old who is #1 at his position or Squad Star / Starter-Level MUST be treated
    // as a First-Team Starter regardless of age or whether he is currently sitting in the U21 slot!
    const isEliteYoungStarter =
      !isSurplus &&
      squadTier !== 'on_loan' &&
      p.age <= 21 &&
      (abilityReadinessTier === 'squad_star' ||
        (abilityReadinessTier === 'starter_level' && clubWidePositionRank <= starterSlots));

    const isFirstTeamReadyU21 =
      !isSurplus &&
      squadTier === 'youth_reserve' &&
      (abilityReadinessTier === 'squad_star' ||
        abilityReadinessTier === 'starter_level' ||
        abilityReadinessTier === 'rotation_ready');

    const isTrueStarter =
      !isSurplus &&
      squadTier !== 'on_loan' &&
      ((squadTier === 'senior' && bestRank <= starterSlots) ||
        isEliteYoungStarter);

    const isPrimaryBackup =
      !isSurplus &&
      ((squadTier === 'senior' && bestRank <= starterSlots + 1) ||
        (squadTier === 'youth_reserve' &&
          isFirstTeamReadyU21 &&
          clubWidePositionRank <= starterSlots + 1));

    const isDeepSurplusRank =
      squadTier === 'senior' &&
      bestBucket !== null &&
      bestRank > Math.max(starterSlots + 1, bestBucket.idealMin);
    const isThinPositionCover =
      bestBucket !== null && bestBucket.effectiveReadyCount <= bestBucket.idealMin;
    const isOverstockedPos =
      bestBucket !== null && bestBucket.status === 'Overstocked';
    const youthSuccessor =
      squadTier === 'senior' ? findInternalYouthSuccessor(p, bestBucket) : null;
    if (youthSuccessor) {
      youthSuccessorByPlayerId.set(p.id, youthSuccessor);
    }

    const isHighEarner =
      (p.wagePw || 0) >= highWageThreshold && (p.wagePw || 0) > 0;
    const isPaidSenior =
      squadTier === 'senior' &&
      p.age >= 22 &&
      (p.wagePw || 0) >= Math.max(100, medianPaidWage * 0.7);
    const isAgingExpensiveBackup =
      squadTier === 'senior' && p.age >= 27 && isHighEarner && !isTrueStarter;
    const isAgingDecliningStarter =
      squadTier === 'senior' &&
      p.age >= 32 &&
      isHighEarner &&
      youthSuccessor !== null;
    // Only treat a high-earning backup as genuinely unused once the season has enough games played
    // (never flag a 22-year-old #2 backup as surplus because of early-September rotation minutes)
    const isUnusedHighEarnerBackup =
      isHighEarner &&
      p.age >= 24 &&
      maxSquadMinutes >= 540 &&
      (p.minutes || 0) < Math.min(180, maxSquadMinutes * 0.15);

    const tags: string[] = [];
    if (squadTier === 'on_loan') tags.push('Out on Loan');
    else if (squadTier === 'youth_reserve') {
      tags.push(isFirstTeamReadyU21 ? 'U21 · First-Team Ready' : 'U21 / Academy');
    }
    if (abilityReadinessTier === 'squad_star') tags.push('Squad Star');
    else if (abilityReadinessTier === 'starter_level' && squadTier === 'youth_reserve') {
      tags.push('Starter Level');
    } else if (abilityReadinessTier === 'academy_raw') {
      tags.push('Academy Raw');
    }
    if (isSurplus) tags.push('Surplus To Requirements');
    if (bestBucket) {
      const displayRank =
        squadTier === 'youth_reserve' && clubWidePositionRank <= starterSlots + 1
          ? clubWidePositionRank
          : bestRank;
      tags.push(`#${displayRank} ${bestBucket.code}`);
    }
    if (bestBucket?.hasSuccessionGap) tags.push('Succession Gap');
    if (isHighPotYouth) tags.push('Youth Asset');
    if (
      isFirstTeamReadyU21 &&
      (bestBucket?.status === 'Promote Internal' ||
        (bestBucket !== null && bestBucket.currentCount < bestBucket.idealMin) ||
        isEliteYoungStarter)
    ) {
      tags.push('Promote to First Team');
    }
    if (
      youthSuccessor &&
      (p.age >= 24 || isSurplus) &&
      (!isTrueStarter || isSurplus)
    ) {
      tags.push(`Youth Ready: ${youthSuccessor.name}`);
    }
    if (isMentor) tags.push(`Mentor (Det ${p.attributes.determination})`);
    else if (positivePers)
      tags.push(`${p.personality} (Det ${p.attributes.determination})`);
    else if (weakPers) tags.push(`Low Det (${p.attributes.determination})`);
    if (isThinPositionCover && squadTier === 'senior') tags.push('Thin Depth');
    if (isOverstockedPos && squadTier === 'senior') tags.push('Overstocked Pos');
    if (p.morale) tags.push(`Morale: ${p.morale}`);
    if (
      p.contractDetails?.optionalExtensionYears &&
      p.contractDetails.optionalExtensionYears > 0
    ) {
      tags.push(`Club Option +${p.contractDetails.optionalExtensionYears}y`);
    }
    if (
      p.contractDetails?.releaseClauses &&
      p.contractDetails.releaseClauses.length > 0
    ) {
      const lowest = Math.min(
        ...p.contractDetails.releaseClauses.map((rc) => rc.amount)
      );
      tags.push(`Release Clause ${formatClubMoney(lowest)}`);
    }
    if (Array.isArray(p.activeSuspensions) && p.activeSuspensions.length > 0) {
      tags.push(`BANNED (${p.activeSuspensions[0].matchesRemaining}m)`);
    }

    let verdict: TransferActionVerdict = 'Hold';
    let priority: 'High' | 'Medium' | 'Low' = 'Low';
    let headline = '';
    let rationale = '';
    let recommendedMove = '';

    // 0. Players currently Out on Loan -> Monitor / Protect (never recommend selling/loaning again as surplus depth)
    if (squadTier === 'on_loan') {
      if (isHighPotYouth && isExpiringSoon) {
        verdict = 'Protect Youth Asset';
        priority = 'High';
        headline = `Loaned U21 prospect expiring in ${monthsLeft}m — extend before return`;
        rationale = `Currently out on loan (Age ${p.age}, ${p.ability.toFixed(1)}★ → ${p.potential.toFixed(1)}★ ceiling). Protect club value before Bosman window opens.`;
        recommendedMove = `Offer an extension now while out on loan, then evaluate for first-team backup upon return.`;
      } else {
        verdict = 'Hold';
        priority = 'Low';
        headline = `Currently Out on Loan — monitor match minutes & development`;
        rationale = `Age ${p.age} (${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★, exp ${p.expires}) is already gaining minutes away from the senior matchday squad.`;
        recommendedMove = `Track loan form and rating; reassess squad role when loan ends.`;
      }
    }
    // 0b. Elite Young First-Team Starter (e.g. an 18-year-old who is ALREADY our #1 / best player at his position!)
    else if (isEliteYoungStarter) {
      if (isExpiringSoon) {
        verdict = 'Renew Now';
        priority = 'High';
        const wageTarget =
          isInDebt || isMateriallyOverWageBudget
            ? Math.max(p.wagePw || 100, 120)
            : Math.round(((p.wagePw || 120) * 1.15) / 10) * 10;
        headline = `Key First-Team Starter (Age ${p.age}, ${p.ability.toFixed(1)}★) expiring in ${monthsLeft}m — lock down immediately`;
        rationale = `Already #${clubWidePositionRank} ${bestBucket?.code || p.position} in the entire club (${p.ability.toFixed(1)}★ current vs ${tierBenchmarks.firstTeamStarterFloor.toFixed(1)}★ starter floor, ${p.potential.toFixed(1)}★ ceiling). Treat as a core First-Team Starter, not raw youth.`;
        recommendedMove = `Offer a long-term deal (+ optional club extension) around £${wageTarget}/wk immediately and start him in your First XI.`;
      } else {
        verdict = 'Hold';
        priority = squadTier === 'youth_reserve' ? 'High' : 'Low';
        headline =
          squadTier === 'youth_reserve'
            ? `Promote to Starting XI immediately — #${clubWidePositionRank} ${bestBucket?.code || p.position} in club (Age ${p.age}, ${p.ability.toFixed(1)}★)`
            : `Core First-Team Starter (Age ${p.age}, ${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★) — Build Around Him`;
        rationale = `Current Ability (${p.ability.toFixed(1)}★) already meets/exceeds your First-Team starter standard (${tierBenchmarks.firstTeamStarterFloor.toFixed(1)}★ floor, squad top-11 avg ${tierBenchmarks.top11AvgAbility.toFixed(2)}★). Despite being Age ${p.age}, he belongs in the Starting XI — do NOT bury in U21s or loan out.`;
        recommendedMove =
          squadTier === 'youth_reserve'
            ? `Move into the Senior First Team squad immediately and start at ${p.ipRole} (IP) / ${p.oopRole} (OOP).`
            : `Start weekly in ${p.ipRole} (IP) / ${p.oopRole} (OOP); build your positional succession around him.`;
      }
    }
    // 1. Protect High-Potential U21 Assets (below Starter-Level CA) expiring soon
    else if (isHighPotYouth && isExpiringSoon && !isSurplus) {
      verdict = 'Protect Youth Asset';
      priority = 'High';
      const wageTarget =
        isInDebt || isMateriallyOverWageBudget
          ? Math.max(p.wagePw || 80, 100)
          : Math.round(((p.wagePw || 100) * 1.1) / 10) * 10;
      headline = `Lock down ${abilityReadinessTier === 'rotation_ready' ? 'First-Team Ready U21' : 'U21 prospect'} before Bosman window (${monthsLeft}m left)`;
      rationale = `Age ${p.age}, ${p.ability.toFixed(1)}★ → ${p.potential.toFixed(1)}★ (${abilityReadinessLabel} vs ${tierBenchmarks.firstTeamRotationFloor.toFixed(1)}★ first-team floor; ${p.personality}, Det ${p.attributes.determination}). High resale & first-team value for a ${clubTierLabel.toLowerCase()}.`;
      recommendedMove = `Offer a 3-year deal (+ 1-yr optional club extension) around £${wageTarget}/wk and ${abilityReadinessTier === 'rotation_ready' ? 'integrate into senior rotation' : 'put in a 3-player mentoring group'}.`;
    }
    // 2. First-Team Ready U21 / Reserve Players (e.g. 22yo 3.5★ or 19yo 3.0★) covering a senior gap -> Promote Now!
    else if (
      isFirstTeamReadyU21 &&
      !isExpiringSoon &&
      (bestBucket?.status === 'Promote Internal' ||
        (bestBucket !== null && bestBucket.currentCount < bestBucket.idealMin))
    ) {
      verdict = 'Hold';
      priority = 'High';
      headline = `First-Team Ready (${p.ability.toFixed(1)}★, Age ${p.age}) — Promote into Senior ${bestBucket?.code || p.position} Rotation`;
      rationale = `Current Ability (${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★) already meets your First-Team rotation floor (${tierBenchmarks.firstTeamRotationFloor.toFixed(1)}★). Unlike raw academy teens, he is ready to fill your senior ${bestBucket?.label || p.position} gap at £${p.wagePw}/wk with zero transfer fee.`;
      recommendedMove = `Promote from U21/Reserves to Senior First Team immediately (${p.ipRole} IP / ${p.oopRole} OOP) — removes need for an external signing.`;
    }
    // 3. Non-Expiring High-Potential Developing/Academy U21/U23 Prospects -> Loan Out (when blocked) vs Protect & Develop
    else if (
      (isHighPotYouth ||
        (squadTier === 'youth_reserve' &&
          p.age >= 18 &&
          p.age <= 23 &&
          p.potential >= 3.5 &&
          !isExpiringSoon)) &&
      !isSurplus &&
      !isTrueStarter
    ) {
      const seniorDepthMet =
        bestBucket !== null &&
        bestBucket.idealMin > 0 &&
        bestBucket.currentCount >= bestBucket.idealMin;
      if (abilityReadinessTier === 'academy_raw') {
        verdict = 'Protect Youth Asset';
        priority = 'Low';
        headline = `Academy prospect (${p.ability.toFixed(1)}★ now → ${p.potential.toFixed(1)}★ ceiling) — long-term U18/U21 development`;
        rationale = `Age ${p.age} academy player (${p.ability.toFixed(1)}★ current vs ${tierBenchmarks.firstTeamRotationFloor.toFixed(1)}★ ${resolvedLeagueName} first-team floor). Too raw for men's loan football yet — develop patiently in U18/U21 with mentoring.`;
        recommendedMove = `Keep in U18/U21 training & matches with a high-Determination mentor; consider a development loan once he reaches ${Math.max(2.0, tierBenchmarks.firstTeamRotationFloor - 1.0).toFixed(1)}★+.`;
      } else if (
        seniorDepthMet &&
        p.age >= 18 &&
        abilityReadinessTier === 'developing_prospect' &&
        (p.minutes || 0) < 180
      ) {
        verdict = 'Loan Out';
        priority = 'Medium';
        tags.push('Dev Loan Candidate');
        headline = `Development Loan (${p.ability.toFixed(1)}★ → ${p.potential.toFixed(1)}★) — senior ${bestBucket?.code || p.position} pathway full`;
        rationale = `Age ${p.age} developing prospect (${p.ability.toFixed(1)}★ current vs ${tierBenchmarks.firstTeamRotationFloor.toFixed(1)}★ ${resolvedLeagueName} rotation floor; ${p.potential.toFixed(1)}★ ceiling). Senior ${bestBucket?.label || p.position} depth is already met (${bestBucket?.currentCount}/${bestBucket?.idealMin}), so 25+ senior starts on loan will accelerate his growth far faster than reserve cameos.`;
        recommendedMove = `Offer out for loan to a club one tier below ${resolvedLeagueName}: lock 'Regular Starter' playing time in ${p.ipRole} (IP), include a Recall Clause, and accept 0%–50% wage share (never sell).`;
      } else {
        verdict = 'Protect Youth Asset';
        priority = 'Medium';
        headline =
          abilityReadinessTier === 'rotation_ready'
            ? `First-Team Ready U21 (${p.ability.toFixed(1)}★ → ${p.potential.toFixed(1)}★) — bridge into senior minutes`
            : `Protect & develop U21 asset (${p.ability.toFixed(1)}★ → ${p.potential.toFixed(1)}★ ceiling)`;
        rationale = `Age ${p.age} (${abilityReadinessLabel} vs ${tierBenchmarks.firstTeamRotationFloor.toFixed(1)}★ ${resolvedLeagueName} first-team floor; ${p.personality}, Det ${p.attributes.determination}, £${p.wagePw}/wk). Aligns with ${clubTierLabel.toLowerCase()} strategy to develop youth into first-team starters.`;
        recommendedMove =
          abilityReadinessTier === 'rotation_ready'
            ? `Give cup starts & senior bench minutes now (${p.ipRole} IP / ${p.oopRole} OOP) — ready to step in when senior cover exits.`
            : `Keep in club development pathway (U21 matches + cup rotation + senior mentoring group) — do NOT list as surplus.`;
      }
    }
    // 4. Expiring Contracts (<= 11m): Separate True Starters (Renew) from Backups/Aging (Let Expire)
    else if (
      isExpiringSoon &&
      !(
        isSurplus &&
        (p.wagePw || 0) > 0 &&
        (monthsLeft === null || monthsLeft > 6)
      )
    ) {
      const shouldRenew =
        !isSurplus &&
        ((isTrueStarter && p.age <= 30 && p.ability >= tierBenchmarks.firstTeamRotationFloor) ||
          (isPrimaryBackup &&
            p.age <= 25 &&
            p.ability >= tierBenchmarks.firstTeamStarterFloor &&
            !isOverstockedPos));

      if (shouldRenew) {
        verdict = 'Renew Now';
        priority = monthsLeft !== null && monthsLeft <= 6 ? 'High' : 'Medium';
        const wageCap =
          isInDebt || isMateriallyOverWageBudget
            ? p.wagePw || 150
            : Math.round(((p.wagePw || 150) * 1.1) / 10) * 10;
        headline = `Core #${clubWidePositionRank} ${bestBucket?.code || p.position} expiring in ${monthsLeft}m — renew on disciplined terms`;
        rationale = `${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★ (${abilityReadinessLabel} for ${resolvedLeagueName}, ${p.personality}, Det ${p.attributes.determination}). ${isInDebt ? 'Because the club is in debt, hold wages flat.' : 'Prevent a free Bosman exit.'}`;
        recommendedMove = `Offer a ${p.age >= 29 ? '1-year' : '2-year'} extension capped at ≤ £${wageCap}/wk (no automatic yearly wage-rise clause).`;
      } else {
        verdict = 'Let Expire';
        priority =
          isSurplus || isHighEarner || isInDebt || isMateriallyOverWageBudget
            ? 'High'
            : 'Medium';
        headline = `Keep until contract ends in ${monthsLeft}m — free £${p.wagePw}/wk exit`;
        rationale = `#${bestRank} ${bestBucket?.code || p.position} (Age ${p.age}, ${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★, £${p.wagePw}/wk = £${annualWage.toLocaleString()}/yr${isSurplus ? ', marked Surplus To Requirements' : ''}). ${youthSuccessor ? `${youthSuccessor.name} (Age ${youthSuccessor.age}, ${youthSuccessor.ability.toFixed(1)}★/${youthSuccessor.potential.toFixed(1)}★, £${youthSuccessor.wagePw}/wk) is ready to step up.` : 'Not worth committing fresh wages while managing club finances.'}`;
        const succIsTrueYouth =
          youthSuccessor !== null &&
          (tierById.get(youthSuccessor.id) === 'youth_reserve' ||
            youthSuccessor.age <= 21);
        recommendedMove = youthSuccessor
          ? `Keep for squad depth until ${p.expires}, then let expire and ${succIsTrueYouth ? 'promote' : 'hand minutes to'} ${youthSuccessor.name} (already on payroll at £${youthSuccessor.wagePw}/wk — clears £${p.wagePw}/wk when ${p.name} departs).`
          : `Keep as cheap cover until ${p.expires}, then let contract expire (or accept any small Jan fee to clear £${p.wagePw}/wk early).`;
      }
    }
    // 5. Sell / Transfer List vs Replace Before Selling (Surplus To Requirements OR Paid Senior Backups / Overstocked Senior Depth)
    else if (
      isSurplus ||
      (isPaidSenior &&
        ((!isTrueStarter &&
          (isDeepSurplusRank ||
            isAgingExpensiveBackup ||
            isOverstockedPos ||
            isUnusedHighEarnerBackup)) ||
          isAgingDecliningStarter))
    ) {
      const succIsTrueYouth =
        youthSuccessor !== null &&
        (tierById.get(youthSuccessor.id) === 'youth_reserve' ||
          youthSuccessor.age <= 21);

      if (isThinPositionCover && !youthSuccessor && !isSurplus) {
        verdict = 'Replace Before Selling';
        priority = 'High';
        headline = `Sell £${p.wagePw}/wk backup AFTER signing cheaper ${bestBucket?.code || p.position} cover`;
        rationale = `Earning £${p.wagePw}/wk (£${annualWage.toLocaleString()}/yr) as #${bestRank} ${bestBucket?.code || p.position} (Age ${p.age}, ${p.ability.toFixed(1)}★), which strains ${isInDebt ? 'your negative balance' : 'your wage budget'} — but ready depth is thin here (${bestBucket?.effectiveReadyCount}/${bestBucket?.idealMin}) with no U21 ready.`;
        recommendedMove = `Line up a cheaper free-agent or zero-fee parent-club loan replacement at ${bestBucket?.code || p.position} first, then sell via TransferRoom to clear £${p.wagePw}/wk.`;
      } else {
        verdict = 'Sell / Transfer List';
        priority = 'High';
        if ((p.wagePw || 0) >= Math.max(120, medianPaidWage * 0.7)) {
          tags.push('Loan Wage-Relief Option');
        }
        headline = youthSuccessor
          ? succIsTrueYouth
            ? `Sell ${isSurplus ? 'surplus' : 'backup'} (£${p.wagePw}/wk) & promote youth ${youthSuccessor.name} (£${youthSuccessor.wagePw}/wk)`
            : `Sell ${isSurplus ? 'surplus' : 'backup'} (£${p.wagePw}/wk) & back ${youthSuccessor.name} (£${youthSuccessor.wagePw}/wk)`
          : `Transfer list ${isSurplus ? 'Surplus To Requirements player' : 'surplus senior depth'} to cut £${p.wagePw}/wk (£${annualWage.toLocaleString()}/yr)`;
        rationale = `${isSurplus ? 'Marked Surplus To Requirements in squad standing. ' : ''}#${bestRank} ${bestBucket?.code || p.position} ${isTrueStarter ? 'option' : 'backup'} (Age ${p.age}, ${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★${weakPers ? `, Det ${p.attributes.determination}` : ''}). ${isOverstockedPos ? `${bestBucket?.label} senior primary depth is overstocked (${bestBucket?.currentCount} vs ideal ${bestBucket?.idealMin}–${bestBucket?.idealMax}). ` : ''}${isInDebt || isMateriallyOverWageBudget ? 'Offloading these wages directly reduces club debt & monthly burn without weakening your Starting XI.' : 'Frees wage budget for priority upgrades.'}`;
        recommendedMove = youthSuccessor
          ? `Transfer list & offer via TransferRoom (or loan out at 50%–100% wage share if cash bids stall at ${resolvedLeagueName} level); hand his backup minutes to ${youthSuccessor.name} (${youthSuccessor.ability.toFixed(1)}★/${youthSuccessor.potential.toFixed(1)}★, already on payroll at £${youthSuccessor.wagePw}/wk) to clear £${p.wagePw}/wk (£${annualWage.toLocaleString()}/yr) with no replacement fee.`
          : `Transfer list & offer via TransferRoom (if permanent buyers stall, accept a 50%–100% wage-contribution loan to clear £${p.wagePw}/wk once completed).`;
      }
    }
    // 6. Hold (Core starters, cheap mentors, First-Team Ready U21 depth, Academy depth, or balanced senior depth)
    else {
      verdict = 'Hold';
      priority = 'Low';
      headline = isTrueStarter
        ? `Core #${clubWidePositionRank} ${bestBucket?.code || p.position} Starter — Keep (${p.expires === 'N/A' ? 'Non-contract' : `exp ${p.expires}`})`
        : isMentor
          ? `Senior mentor (#${bestRank} ${bestBucket?.code || p.position} · ${p.personality})`
          : isFirstTeamReadyU21
            ? `First-Team Ready U21/Reserve (${p.ability.toFixed(1)}★, Age ${p.age}) — ready for senior bench/rotation`
            : squadTier === 'youth_reserve'
              ? `${abilityReadinessLabel} U21/Academy (${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★, Age ${p.age})`
              : `Balanced senior depth (#${bestRank} ${bestBucket?.code || p.position} · exp ${p.expires})`;
      rationale = `${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★ (${abilityReadinessLabel} vs ${tierBenchmarks.firstTeamRotationFloor.toFixed(1)}★ ${resolvedLeagueName} floor), Age ${p.age}, £${p.wagePw}/wk (${p.personality}, Det ${p.attributes.determination})${isTrueStarter ? ' — first-choice starter protected for squad stability.' : isMentor ? ' — strong mentoring anchor for U21 prospects.' : isFirstTeamReadyU21 ? ' — already at First-Team rotation quality in U21/Reserves.' : ' — fits squad & budget structure.'}`;
      recommendedMove = isMentor
        ? `Keep in squad and anchor a 3-player mentoring group with 2 U21 prospects.`
        : isFirstTeamReadyU21
          ? `Keep ready for senior matchday call-ups or promote if a senior ${bestBucket?.code || p.position} departs.`
          : abilityReadinessTier === 'academy_raw'
            ? `Keep developing in U18/U21 training — not ready for senior selection yet.`
            : `Keep in ${p.ipRole} (IP) / ${p.oopRole} (OOP) rotation; reassess next window.`;
    }

    return {
      player: p,
      squadTier,
      primaryBucketCode: primaryCode,
      abilityReadinessTier,
      abilityReadinessLabel,
      clubWidePositionRank,
      verdict,
      priority,
      monthsLeft,
      annualWage,
      tags,
      headline,
      rationale,
      recommendedMove,
    };
  });

  // Pass 2: Reconcile promoted internal successors so Transfers NEVER contradicts itself
  // (e.g. telling the manager to "promote X for departing Y" while ALSO telling them to
  // Sell, Loan Out, Replace, or Let Expire X!).
  const promotedYouthForSale = new Map<string, string[]>();
  for (const item of playerAdvice) {
    if (
      item.verdict !== 'Sell / Transfer List' &&
      item.verdict !== 'Let Expire'
    ) {
      continue;
    }
    const succ = youthSuccessorByPlayerId.get(item.player.id);
    if (!succ) continue;
    const list = promotedYouthForSale.get(succ.id) || [];
    if (!list.includes(item.player.name)) {
      list.push(item.player.name);
    }
    promotedYouthForSale.set(succ.id, list);
  }

  for (const item of playerAdvice) {
    const departingNames = promotedYouthForSale.get(item.player.id);
    if (!departingNames || departingNames.length === 0) continue;
    item.tags = item.tags.filter((t) => t !== 'Dev Loan Candidate');
    const promoteTag = `Promote to Backup (${departingNames.join(', ')})`;
    if (!item.tags.includes(promoteTag)) {
      item.tags.unshift(promoteTag);
    }
    const isContradictoryExit =
      item.verdict === 'Sell / Transfer List' ||
      item.verdict === 'Replace Before Selling' ||
      item.verdict === 'Let Expire' ||
      item.verdict === 'Loan Out' ||
      (item.verdict === 'Protect Youth Asset' &&
        (item.monthsLeft === null || item.monthsLeft > 11));
    if (isContradictoryExit) {
      const expiringSoon = item.monthsLeft !== null && item.monthsLeft <= 11;
      const isU21 = item.player.age <= 21;
      item.verdict = expiringSoon
        ? isU21
          ? 'Protect Youth Asset'
          : 'Renew Now'
        : 'Hold';
      item.priority = expiringSoon ? 'High' : 'Medium';
      item.headline = expiringSoon
        ? `Keep & extend backup (replacing ${departingNames.join(', ')}) — do NOT sell or loan out`
        : `Promote to first-team backup (replacing ${departingNames.join(', ')}) — do NOT loan out`;
      item.rationale = `Age ${item.player.age} (${item.player.ability.toFixed(1)}★/${item.player.potential.toFixed(1)}★, £${item.player.wagePw}/wk). Designated to step up into the backup minutes freed by moving on from ${departingNames.join(', ')}, keeping positional depth intact while clearing their wages.`;
      item.recommendedMove = expiringSoon
        ? `Keep in the first-team squad (do NOT sell or loan out), offer a disciplined renewal, and hand them the rotation minutes vacated by ${departingNames.join(', ')}.`
        : `Keep in the first-team squad as backup (do NOT sell or loan out) and give them the rotation/sub minutes vacated by ${departingNames.join(', ')}.`;
    } else if (
      item.verdict === 'Hold' &&
      !/^Core #/i.test(item.headline) &&
      !/do NOT loan out/i.test(item.headline)
    ) {
      item.priority = item.priority === 'Low' ? 'Medium' : item.priority;
      item.headline = `Promote to first-team rotation (replacing ${departingNames.join(', ')}) — do NOT loan out`;
      item.recommendedMove = `Promote into the first-team squad (do NOT loan out) and hand them the rotation/sub minutes vacated by ${departingNames.join(', ')}.`;
    }
  }

  const verdictOrder: Record<TransferActionVerdict, number> = {
    'Sell / Transfer List': 0,
    'Replace Before Selling': 1,
    'Protect Youth Asset': 2,
    'Renew Now': 3,
    'Let Expire': 4,
    'Loan Out': 5,
    Hold: 6,
  };
  const priorityOrder = { High: 0, Medium: 1, Low: 2 };

  playerAdvice.sort(
    (a, b) =>
      verdictOrder[a.verdict] - verdictOrder[b.verdict] ||
      priorityOrder[a.priority] - priorityOrder[b.priority] ||
      (b.player.wagePw || 0) - (a.player.wagePw || 0)
  );

  const countsByVerdict: Record<TransferActionVerdict, number> = {
    'Renew Now': 0,
    'Protect Youth Asset': 0,
    'Sell / Transfer List': 0,
    'Replace Before Selling': 0,
    'Loan Out': 0,
    'Let Expire': 0,
    Hold: 0,
  };
  for (const item of playerAdvice) {
    countsByVerdict[item.verdict] += 1;
  }

  const projectedWeeklySavings = playerAdvice
    .filter(
      (a) =>
        a.verdict === 'Sell / Transfer List' ||
        a.verdict === 'Replace Before Selling' ||
        a.verdict === 'Let Expire'
    )
    .reduce((sum, a) => sum + (a.player.wagePw || 0), 0);

  const expiringWithin12mCount = playerAdvice.filter(
    (a) => a.monthsLeft !== null && a.monthsLeft <= 12
  ).length;

  // Build Club & League Level Calibration + Complete Loan Strategy (Incoming + Outgoing)
  const isLowerOrSemiPro = scaleRef < 30_000;
  const maxLoanWageSharePw =
    isInDebt || isOverWageBudget
      ? Math.max(0, Math.min(200, Math.round(medianPaidWage * 0.5)))
      : wageHeadroomWeekly !== null && wageHeadroomWeekly > 0
        ? Math.min(Math.round(wageHeadroomWeekly * 0.6), Math.round(medianPaidWage * 1.15))
        : Math.round(medianPaidWage * 0.85);
  const recommendedWageSplitLabel =
    isInDebt || isOverWageBudget
      ? maxLoanWageSharePw > 0
        ? `£0 loan fee · 0%–30% wage share (≤ £${maxLoanWageSharePw.toLocaleString()}/wk)`
        : '£0 loan fee · 0% wage share (parent club pays 100%)'
      : `£0 loan fee · ≤ 50% wage share (≤ £${Math.max(100, maxLoanWageSharePw).toLocaleString()}/wk)`;

  const recruitmentApproachSummary = isInDebt
    ? `At ${clubTierLabel} level in ${resolvedLeagueName} with ${balanceLabel} debt, avoid cash transfer fees completely — use 2-week Free Agent trials, ${recommendedWageSplitLabel} U23 loans from higher-tier clubs, and internal U21 promotions (target starter attributes ≥ ${starterAttrBaseline}/20).`
    : isLowerOrSemiPro
      ? `At ${clubTierLabel} level in ${resolvedLeagueName}, clubs rarely recoup cash fees — build around Free Agents, higher-division U23 loans (${recommendedWageSplitLabel}), and promoting high-potential U21s (starter baseline ≥ ${starterAttrBaseline}/20).`
      : `At ${clubTierLabel} level in ${resolvedLeagueName}, target starter attributes ≥ ${starterAttrBaseline}/20 (standout ≥ ${standoutAttrBaseline}/20), blend U23 resale signings with selective loan cover (${recommendedWageSplitLabel}), and loan out blocked 18–22yo prospects.`;

  const leagueLevelCalibration: LeagueLevelCalibration = {
    competitionName: resolvedLeagueName,
    clubTierLabel,
    standingContextLabel,
    starterAttrBaseline,
    standoutAttrBaseline,
    divisionMedianWeeklyWage,
    recruitmentApproachSummary,
  };

  const incomingLoanPriorities: IncomingLoanPriorityItem[] = [];
  for (const need of positionalNeeds) {
    if (need.code === 'AM' && need.idealMin === 0) continue;
    const replaceItem = playerAdvice.find(
      (a) =>
        a.verdict === 'Replace Before Selling' &&
        a.primaryBucketCode === need.code
    );
    if (need.status === 'Need Signing') {
      incomingLoanPriorities.push({
        bucketCode: need.code,
        bucketLabel: need.label,
        reason: 'Need Signing',
        targetRoles: need.scoutProfile,
        maxWeeklyWageSharePw: maxLoanWageSharePw,
        recommendedWageSplitLabel,
        rationale: `Only ${need.effectiveReadyCount}/${need.idealMin} ready options at ${need.code} for ${resolvedLeagueName}. A 1-season U23 parent-club loan (${recommendedWageSplitLabel}) plugs the gap immediately with £0 transfer fee and zero long-term wage bloat.`,
      });
    } else if (replaceItem) {
      incomingLoanPriorities.push({
        bucketCode: need.code,
        bucketLabel: need.label,
        reason: 'Replace High-Wage Backup',
        targetRoles: need.scoutProfile,
        maxWeeklyWageSharePw: Math.min(
          maxLoanWageSharePw,
          Math.max(0, Math.round((replaceItem.player.wagePw || 0) * 0.45))
        ),
        recommendedWageSplitLabel,
        rationale: `Securing a low-cost loan at ${need.code} unlocks selling ${replaceItem.player.name} (£${replaceItem.player.wagePw.toLocaleString()}/wk) without leaving your ${resolvedLeagueName} matchday squad short.`,
      });
    } else if (
      need.effectiveReadyCount === need.idealMin &&
      need.hasSuccessionGap &&
      incomingLoanPriorities.length < 3
    ) {
      incomingLoanPriorities.push({
        bucketCode: need.code,
        bucketLabel: need.label,
        reason: 'Thin Senior Cover',
        targetRoles: need.scoutProfile,
        maxWeeklyWageSharePw: maxLoanWageSharePw,
        recommendedWageSplitLabel,
        rationale: `All ${need.code} starters are 28+ with zero U23 cover. A pacey higher-tier U23 loanee adds transition speed for ${resolvedLeagueName} while you scout a permanent successor.`,
      });
    }
  }

  const developmentLoansOut = playerAdvice.filter((a) => a.verdict === 'Loan Out');
  const wageReliefLoanFallbacks = playerAdvice.filter(
    (a) =>
      a.verdict === 'Sell / Transfer List' &&
      (a.player.wagePw || 0) >= Math.max(100, medianPaidWage * 0.6)
  );
  const activeLoansMonitor = playerAdvice.filter((a) => a.squadTier === 'on_loan');
  const doNotLoanGuardrails = playerAdvice.filter(
    (a) =>
      a.tags.some((t) => t.startsWith('Promote to Backup') || t === 'Promote to First Team') ||
      (a.player.age <= 21 &&
        a.squadTier !== 'on_loan' &&
        (a.abilityReadinessTier === 'squad_star' ||
          (a.abilityReadinessTier === 'starter_level' && a.clubWidePositionRank <= 2)))
  );

  const cr = leagueContext?.competitionRules ?? null;
  const ruleNotes: string[] = [];
  if (cr?.u21Exempt) {
    ruleNotes.push('U21 players are exempt from senior squad registration caps — incoming U21 loanees do not consume a senior slot');
  }
  if (cr?.maxSquadSize) {
    ruleNotes.push(`Max registered squad size: ${cr.maxSquadSize}`);
  }
  if (cr?.minHomegrownNation || cr?.minHomegrownClub) {
    ruleNotes.push(
      `Prioritise domestic loanees to protect Homegrown quotas (${[
        cr.minHomegrownNation ? `HGN ≥ ${cr.minHomegrownNation}` : null,
        cr.minHomegrownClub ? `HGC ≥ ${cr.minHomegrownClub}` : null,
      ]
        .filter(Boolean)
        .join(', ')})`
    );
  }
  if (typeof leagueContext?.transferWindowOpen === 'boolean') {
    ruleNotes.push(
      leagueContext.transferWindowOpen
        ? 'Transfer/loan window is OPEN — execute loan bids and TransferRoom loan offers now'
        : 'Window is currently CLOSED — shortlist parent-club loan targets and line up outgoing development loans for the next window'
    );
  }
  const leagueLoanRulesNote =
    ruleNotes.length > 0
      ? ruleNotes.join(' · ') + '.'
      : `Target parent clubs 1–2 divisions above ${resolvedLeagueName} for incoming loans (${recommendedWageSplitLabel}), and send outgoing development loans 1 tier below ${resolvedLeagueName} with locked Regular Starter playing time + a Recall Clause.`;

  const loanStrategyNotes: string[] = [
    incomingLoanPriorities.length > 0
      ? `Incoming Loan Targets (${resolvedLeagueName}): Prioritise ${incomingLoanPriorities.map((i) => i.bucketCode).join(', ')} from higher-division U21/B-teams on ${recommendedWageSplitLabel} (zero Unused-Sub fees).`
      : `Incoming Loans (${resolvedLeagueName}): Core 4-3-3 depth is covered internally — only add an opportunistic 0%-wage higher-tier loanee if they beat your ${tierBenchmarks.firstTeamStarterFloor.toFixed(1)}★ starter floor (attrs ≥ ${standoutAttrBaseline}/20).`,
    developmentLoansOut.length > 0
      ? `Outgoing Development Loans (${developmentLoansOut.length}): Send ${developmentLoansOut.slice(0, 4).map((d) => `${d.player.name} (${d.primaryBucketCode})`).join(', ')} to a club 1 tier below ${resolvedLeagueName} with locked 'Regular Starter' status + Recall Clause.`
      : `Outgoing Development Loans: No unblocked 18–22yo prospects require a loan right now — keep 15–17yo raw academy teens in U18/U21 mentoring and keep First-Team Ready U21s in senior rotation.`,
  ];
  if (wageReliefLoanFallbacks.length > 0) {
    const fallbackSum = wageReliefLoanFallbacks.reduce(
      (s, a) => s + (a.player.wagePw || 0),
      0
    );
    loanStrategyNotes.push(
      `Wage-Relief Loan Fallback: If permanent buyers don't pay fees at ${resolvedLeagueName} level, offer ${wageReliefLoanFallbacks.slice(0, 3).map((w) => w.player.name).join(', ')} via TransferRoom on 50%–100% wage-share loans (up to £${fallbackSum.toLocaleString()}/wk payroll relief).`
    );
  }
  if (doNotLoanGuardrails.length > 0) {
    loanStrategyNotes.push(
      `Do NOT Loan Out Guardrail: Keep ${doNotLoanGuardrails.slice(0, 4).map((g) => g.player.name).join(', ')} in your senior squad — they are already First-Team starters or designated U21 backup successors.`
    );
  }

  const loanAdvice: ClubLoanStrategySummary = {
    headline: `${resolvedLeagueName} Loan Playbook · ${clubTierLabel}`,
    strategyNotes: loanStrategyNotes,
    incomingLoanPriorities,
    developmentLoansOut,
    wageReliefLoanFallbacks,
    activeLoansMonitor,
    doNotLoanGuardrails,
    leagueLoanRulesNote,
  };

  // Build aligned, data-driven strategy bullets using the EXACT SAME canonical numbers
  const strategyBullets: string[] = [];
  if (isInDebt && balanceNum !== null) {
    const burnNote =
      monthlyBurnRate !== null && monthlyBurnRate > 0
        ? ` (est. burn £${monthlyBurnRate.toLocaleString()}/mo)`
        : '';
    strategyBullets.push(
      `Bank balance is ${balanceLabel}${burnNote} — avoid cash fees in ${resolvedLeagueName}; trim high-wage senior backups, promote U21 successors, and use free transfers or ${recommendedWageSplitLabel} loans.`
    );
  } else if (balanceNum !== null) {
    strategyBullets.push(
      `Bank balance is ${balanceLabel} (${resolvedLeagueName}, starter attr baseline ≥ ${starterAttrBaseline}/20) — maintain disciplined wage structure and prioritize value signings & targeted loans.`
    );
  }

  if (wageComplianceSeverity === 'over' && wageHeadroomWeekly !== null) {
    strategyBullets.push(
      `Materially over weekly wage cap by £${Math.abs(wageHeadroomWeekly).toLocaleString()}/wk (${wageVariancePct ?? 0}% over ${canonicalFinances.wageComplianceLabel}) — moving 1–2 surplus earners (sale or 100%-wage loan) fixes compliance.`
    );
  } else if (
    wageComplianceSeverity === 'minor_over' &&
    wageHeadroomWeekly !== null
  ) {
    strategyBullets.push(
      `Weekly wages are virtually at cap (${canonicalFinances.wageComplianceLabel} — minor ${wageVariancePct ?? 0}% variance); no panic sales needed, just hold net wages flat until a planned exit.`
    );
  } else if (
    wageComplianceSeverity === 'under' &&
    wageHeadroomWeekly !== null
  ) {
    strategyBullets.push(
      `Weekly wages have £${wageHeadroomWeekly.toLocaleString()}/wk headroom (${canonicalFinances.wageComplianceLabel}).`
    );
  }

  // Real squad depth, loan & youth alignment summary bullet
  const depthParts: string[] = [];
  if (thinBucketCodes.length > 0) {
    depthParts.push(`External signing/loan gaps: ${thinBucketCodes.join(', ')}`);
  }
  if (promoteInternalBucketCodes.length > 0) {
    depthParts.push(`Promote from U21/Reserves (ready now): ${promoteInternalBucketCodes.join(', ')}`);
  }
  if (countsByVerdict['Loan Out'] > 0) {
    depthParts.push(`Development loans out: ${countsByVerdict['Loan Out']}`);
  }
  if (successionGapCodes.length > 0) {
    depthParts.push(`Aging succession gaps (28+, no U23): ${successionGapCodes.join(', ')}`);
  }
  if (overstockedBucketCodes.length > 0) {
    depthParts.push(`Overstocked senior roles: ${overstockedBucketCodes.join(', ')}`);
  }
  if (depthParts.length === 0 && players.length > 0) {
    depthParts.push('First-team primary depth is balanced across 4-3-3 roles');
  }
  if (countsByVerdict['Protect Youth Asset'] > 0 || youthReserveCount > 0) {
    depthParts.push(
      `${countsByVerdict['Protect Youth Asset']} U21 assets protected (${youthReserveCount} U21/Reserve${onLoanCount > 0 ? `, ${onLoanCount} on loan` : ''})`
    );
  }
  if (depthParts.length > 0) {
    strategyBullets.push(depthParts.join(' · ') + '.');
  }

  const clubProfile: ClubFinancialProfile = {
    clubTierLabel,
    balanceNum,
    balanceLabel,
    isInDebt,
    wagePayrollWeekly,
    wageBudgetWeekly,
    wageHeadroomWeekly,
    wageVariancePct,
    wageComplianceSeverity,
    wageComplianceLabel: canonicalFinances.wageComplianceLabel,
    isOverWageBudget,
    isMateriallyOverWageBudget,
    monthlyBurnRate,
    strategyHeadline: isInDebt
      ? `${clubTierLabel} · ${resolvedLeagueName} · Debt Recovery Mode (${balanceLabel})`
      : isMateriallyOverWageBudget
        ? `${clubTierLabel} · ${resolvedLeagueName} · Wage Budget Trim Required`
        : wageComplianceSeverity === 'minor_over'
          ? `${clubTierLabel} · ${resolvedLeagueName} · Near Wage Cap (Minor Variance)`
          : `${clubTierLabel} · ${resolvedLeagueName} · Financially Stable`,
    strategyBullets,
  };

  return {
    clubProfile,
    leagueLevelCalibration,
    loanAdvice,
    totalWeeklyWage: squadWeeklyWageSum,
    potentialWeeklySavings: projectedWeeklySavings,
    projectedWeeklySavings,
    actualBankedWeeklySavings: 0,
    expiringWithin12mCount,
    actionableNeedsCount,
    squadTierCounts: {
      senior: seniorCount,
      youthReserve: youthReserveCount,
      onLoan: onLoanCount,
    },
    countsByVerdict,
    playerAdvice,
    positionalNeeds,
    successionGapCodes,
    tierBenchmarks,
  };
}
