import { PlayerRecord } from '../types/fm27';
import { computeFm27EngineMetrics } from './fmSyncEngine';

export type TransferActionVerdict =
  | 'Renew Now'
  | 'Protect Youth Asset'
  | 'Sell / Transfer List'
  | 'Replace Before Selling'
  | 'Loan Out'
  | 'Let Expire'
  | 'Hold';

export interface ClubFinancialInput {
  balanceNum?: number | null;
  wagePayrollWeekly?: number | null;
  wageBudgetWeekly?: number | null;
  transferBudgetRemaining?: number | null;
  balanceLabel?: string;
  wageSpendLabel?: string;
}

export interface ClubFinancialProfile {
  clubTierLabel: string;
  balanceNum: number | null;
  isInDebt: boolean;
  wagePayrollWeekly: number;
  wageBudgetWeekly: number | null;
  wageHeadroomWeekly: number | null;
  isOverWageBudget: boolean;
  strategyHeadline: string;
  strategyBullets: string[];
}

export interface PlayerTransferAdvice {
  player: PlayerRecord;
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
  code: string;
  label: string;
  currentCount: number;
  idealMin: number;
  idealMax: number;
  status: 'Need Signing' | 'Overstocked' | 'Balanced';
  players: PlayerRecord[];
  scoutProfile: string;
}

export interface SquadTransferAuditSummary {
  clubProfile: ClubFinancialProfile;
  totalWeeklyWage: number;
  potentialWeeklySavings: number;
  expiringWithin12mCount: number;
  countsByVerdict: Record<TransferActionVerdict, number>;
  playerAdvice: PlayerTransferAdvice[];
  positionalNeeds: PositionalSigningNeed[];
}

/**
 * Parses money strings including BOTH negative minus signs ("-£749K")
 * and accounting parentheses ("(£749K)") accurately as signed numbers.
 */
export function parseSignedMoneyString(raw?: string | null): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || s === '--' || s === 'N/A') return null;
  const isNegative =
    s.startsWith('-') || (s.startsWith('(') && s.endsWith(')'));
  const m = s.match(/([0-9][0-9,]*(?:\.\d+)?)\s*([KMB])?/i);
  if (!m) return null;
  let num = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(num)) return null;
  const suffix = (m[2] || '').toUpperCase();
  if (suffix === 'K') num *= 1_000;
  else if (suffix === 'M') num *= 1_000_000;
  else if (suffix === 'B') num *= 1_000_000_000;
  return isNegative ? -num : num;
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

function matchesPositionBucket(p: PlayerRecord, code: string): boolean {
  const pr = p.positionRatings;
  if (pr && Object.values(pr).some((v) => typeof v === 'number' && v > 1)) {
    const lower: Record<string, number> = {};
    for (const [k, v] of Object.entries(pr)) {
      if (typeof v === 'number') lower[k.toLowerCase()] = v;
    }
    const maxOf = (...keys: string[]) =>
      Math.max(0, ...keys.map((k) => lower[k] || 0));
    switch (code) {
      case 'GK':
        return maxOf('gk') >= 15;
      case 'CB':
        return maxOf('dc', 'cb') >= 15;
      case 'RB':
        return maxOf('dr', 'rb', 'wbr') >= 15;
      case 'LB':
        return maxOf('dl', 'lb', 'wbl') >= 15;
      case 'DM':
        return maxOf('dm') >= 15;
      case 'CM':
        return maxOf('mc', 'cm', 'amc') >= 15;
      case 'W':
        return maxOf('amr', 'aml', 'mr', 'ml', 'rw', 'lw') >= 15;
      case 'ST':
        return maxOf('st', 'stc') >= 15;
    }
  }
  const pos = (p.position || '').toUpperCase();
  switch (code) {
    case 'GK':
      return pos.includes('GK');
    case 'CB':
      return /\bD\s*\([RLC]*C[RLC]*\)|DC|CB/.test(pos);
    case 'RB':
      return /\b(D|WB)\s*\([RLC]*R[RLC]*\)|DR|WBR/.test(pos);
    case 'LB':
      return /\b(D|WB)\s*\([RLC]*L[RLC]*\)|DL|WBL/.test(pos);
    case 'DM':
      return pos.includes('DM');
    case 'CM':
      return /\b(M|AM)\s*\([RLC]*C|MC|AMC/.test(pos);
    case 'W':
      return /\b(M|AM)\s*\([RLC]*[RL][RLC]*\)|AMR|AML|MR|ML|RW|LW/.test(pos);
    case 'ST':
      return pos.includes('ST');
    default:
      return false;
  }
}

export function buildSquadTransferAudit(
  players: PlayerRecord[],
  saveDate: string,
  finances?: ClubFinancialInput
): SquadTransferAuditSummary {
  const refDate = parseContractDate(saveDate) || new Date(2027, 8, 15);
  const squadWeeklyWageSum = players.reduce((sum, p) => sum + (p.wagePw || 0), 0);

  const balanceNum =
    typeof finances?.balanceNum === 'number'
      ? finances.balanceNum
      : parseSignedMoneyString(finances?.balanceLabel);

  const wagePayrollWeekly =
    typeof finances?.wagePayrollWeekly === 'number' &&
    finances.wagePayrollWeekly > 0
      ? finances.wagePayrollWeekly
      : squadWeeklyWageSum;

  const wageBudgetWeekly =
    typeof finances?.wageBudgetWeekly === 'number' &&
    finances.wageBudgetWeekly > 0
      ? finances.wageBudgetWeekly
      : null;

  const wageHeadroomWeekly =
    wageBudgetWeekly !== null ? wageBudgetWeekly - wagePayrollWeekly : null;

  const isInDebt = balanceNum !== null && balanceNum < 0;
  const isOverWageBudget =
    wageHeadroomWeekly !== null && wageHeadroomWeekly < 0;

  // Infer club size tier from weekly wage budget / payroll
  const scaleRef = wageBudgetWeekly || wagePayrollWeekly;
  const clubTierLabel =
    scaleRef >= 150_000
      ? 'Top-Flight Club'
      : scaleRef >= 30_000
        ? 'Mid-Tier Professional Club'
        : scaleRef >= 6_000
          ? 'Lower-League / Semi-Pro Club'
          : 'Grassroots / Non-League Club';

  const strategyBullets: string[] = [];
  if (isInDebt && balanceNum !== null) {
    strategyBullets.push(
      `Bank balance is NEGATIVE (${balanceNum < 0 ? '-' : ''}£${Math.abs(Math.round(balanceNum / 1000)).toLocaleString()}K) — avoid cash transfer fees; rely on free agents, zero-fee loans, and selling non-essential earners.`
    );
  }
  if (isOverWageBudget && wageHeadroomWeekly !== null) {
    strategyBullets.push(
      `Over weekly wage budget by £${Math.abs(wageHeadroomWeekly).toLocaleString()}/wk — offload at least 1 unused/surplus earner or renegotiate expiring deals flat/lower.`
    );
  }
  strategyBullets.push(
    'Protect U21 high-potential prospects (3.5★+ ceiling) on long deals—they are your primary resale & first-team growth assets.'
  );

  const clubProfile: ClubFinancialProfile = {
    clubTierLabel,
    balanceNum,
    isInDebt,
    wagePayrollWeekly,
    wageBudgetWeekly,
    wageHeadroomWeekly,
    isOverWageBudget,
    strategyHeadline: isInDebt
      ? `${clubTierLabel} · Debt Recovery Mode (Negative Balance)`
      : isOverWageBudget
        ? `${clubTierLabel} · Wage Budget Trim Required`
        : `${clubTierLabel} · Financially Stable`,
    strategyBullets,
  };

  // Compute 4-3-3 positional depth FIRST so individual player advice respects squad depth!
  const bucketDefs = [
    {
      code: 'GK',
      label: 'Goalkeepers',
      idealMin: 2,
      idealMax: 3,
      scoutProfile: 'No-Nonsense GK IP / GK OOP — Decisions ≥ 11, Aerial/JR ≥ 12',
    },
    {
      code: 'RB',
      label: 'Right-Backs',
      idealMin: 2,
      idealMax: 3,
      scoutProfile: 'Full-Back IP / FB OOP — Pace ≥ 12, Acc ≥ 12, Stamina ≥ 12, Tackling ≥ 11',
    },
    {
      code: 'CB',
      label: 'Centre-Backs',
      idealMin: 4,
      idealMax: 5,
      scoutProfile: 'CB / Ball-Playing CB — Jumping Reach ≥ 13, Tackling ≥ 12, Pace ≥ 11',
    },
    {
      code: 'LB',
      label: 'Left-Backs',
      idealMin: 2,
      idealMax: 3,
      scoutProfile: 'Full-Back IP / FB OOP — Left-footed, Pace ≥ 12, Stamina ≥ 12, Tackling ≥ 11',
    },
    {
      code: 'DM',
      label: 'Defensive Mids',
      idealMin: 2,
      idealMax: 3,
      scoutProfile: 'DM IP / DM OOP — Tackling ≥ 12, Positioning ≥ 12, Stamina ≥ 12, Passing ≥ 11',
    },
    {
      code: 'CM',
      label: 'Central Mids',
      idealMin: 4,
      idealMax: 6,
      scoutProfile: 'CM / AM IP + WCM OOP — Passing ≥ 12, First Touch ≥ 12, Work Rate ≥ 12, Stamina ≥ 12',
    },
    {
      code: 'W',
      label: 'Wingers / IFs',
      idealMin: 4,
      idealMax: 6,
      scoutProfile: 'Winger / IF IP + Tracking Winger OOP — Pace ≥ 13, Acc ≥ 13, Stamina ≥ 11, Work Rate ≥ 11',
    },
    {
      code: 'ST',
      label: 'Strikers',
      idealMin: 2,
      idealMax: 4,
      scoutProfile: 'Poacher / Channel Forward IP + Outlet CF OOP — Finishing ≥ 12, Off The Ball ≥ 12, Pace ≥ 13',
    },
  ];

  const positionalNeeds: PositionalSigningNeed[] = bucketDefs.map((d) => {
    const matched = players
      .filter((p) => matchesPositionBucket(p, d.code))
      .sort((a, b) => (b.ability || 0) - (a.ability || 0));
    const status: PositionalSigningNeed['status'] =
      players.length === 0
        ? 'Balanced'
        : matched.length < d.idealMin
          ? 'Need Signing'
          : matched.length > d.idealMax
            ? 'Overstocked'
            : 'Balanced';
    return {
      code: d.code,
      label: d.label,
      currentCount: matched.length,
      idealMin: d.idealMin,
      idealMax: d.idealMax,
      status,
      players: matched,
      scoutProfile: d.scoutProfile,
    };
  });

  const thinBucketCodes = new Set(
    positionalNeeds
      .filter((b) => b.currentCount <= b.idealMin)
      .map((b) => b.code)
  );

  const avgWage = players.length > 0 ? squadWeeklyWageSum / players.length : 200;

  const playerAdvice: PlayerTransferAdvice[] = players.map((p) => {
    const expDate = parseContractDate(p.expires);
    const monthsLeft = expDate ? monthsBetween(refDate, expDate) : null;
    const annualWage = (p.wagePw || 0) * 52;
    const eng = computeFm27EngineMetrics(p);
    const positivePers = isPositivePersonality(p);
    const weakPers = isWeakPersonality(p);
    const isMentor = p.age >= 26 && positivePers;
    const isHighPotYouth =
      p.age <= 21 && (p.potential >= 3.5 || p.potential - p.ability >= 1.0);
    const isExpiringSoon = monthsLeft !== null && monthsLeft <= 11;
    const isKeyContributor =
      p.minutes >= 180 ||
      p.ability >= 3.5 ||
      (typeof p.rating === 'number' && p.rating >= 7.0);
    const isThinPositionCover = bucketDefs.some(
      (b) => thinBucketCodes.has(b.code) && matchesPositionBucket(p, b.code)
    );
    const isUnusedHighEarner =
      (p.wagePw || 0) >= Math.max(180, avgWage * 0.95) &&
      p.minutes < 90 &&
      p.status !== 'Injured';

    const tags: string[] = [];
    if (isHighPotYouth) tags.push('Youth Asset');
    if (isMentor) tags.push(`Mentor (${p.personality}, Det ${p.attributes.determination})`);
    else if (positivePers) tags.push(`${p.personality} (Det ${p.attributes.determination})`);
    else if (weakPers) tags.push(`Low Det (${p.attributes.determination})`);
    if (isThinPositionCover) tags.push('Thin Depth Cover');

    let verdict: TransferActionVerdict = 'Hold';
    let priority: 'High' | 'Medium' | 'Low' = 'Low';
    let headline = '';
    let rationale = '';
    let recommendedMove = '';

    // 1. Protect High-Potential Youth FIRST (never dump high-ceiling U21s!)
    if (isHighPotYouth && isExpiringSoon) {
      verdict = 'Protect Youth Asset';
      priority = 'High';
      const wageTarget = isInDebt || isOverWageBudget
        ? Math.max(p.wagePw || 80, 100)
        : Math.round(((p.wagePw || 100) * 1.1) / 10) * 10;
      headline = `Tie down U21 prospect before Bosman window (${monthsLeft}m left)`;
      rationale = `Age ${p.age} with ${p.ability.toFixed(1)}★ → ${p.potential.toFixed(1)}★ potential (${p.personality}, Det ${p.attributes.determination}). High resale & first-team upside for a ${clubTierLabel.toLowerCase()}.`;
      recommendedMove = `Offer a 3-year deal (+ optional 1-yr club extension) around £${wageTarget}/wk; pair in a 3-player mentoring group.`;
    } else if (isHighPotYouth && p.minutes < 120 && p.status !== 'Starter') {
      verdict = 'Loan Out';
      priority = 'Medium';
      headline = `Loan for match sharpness (${p.potential.toFixed(1)}★ ceiling, ${p.minutes}m played)`;
      rationale = `Age ${p.age} prospect (${p.personality}, Det ${p.attributes.determination}) needs regular starts to reach ${p.potential.toFixed(1)}★ potential rather than stalling on the bench.`;
      recommendedMove = `Place on Development List as Regular Starter (ask 50–100% wage cover to save up to £${p.wagePw}/wk while he develops).`;
    } else if (isExpiringSoon && isKeyContributor) {
      verdict = 'Renew Now';
      priority = monthsLeft !== null && monthsLeft <= 6 ? 'High' : 'Medium';
      const wageCap =
        isInDebt || isOverWageBudget
          ? p.wagePw || 150
          : Math.round(((p.wagePw || 150) * 1.1) / 10) * 10;
      headline = `Key starter expiring in ${monthsLeft}m — renew on disciplined terms`;
      rationale = `${p.ability.toFixed(1)}★ ${p.position} (${p.minutes}m, Engine ${eng.physicalEngineScore}/100, ${p.personality}) is a core contributor. ${isInDebt ? 'Because club balance is negative, hold firm on wages.' : 'Locking him in prevents a free exit.'}`;
      recommendedMove = `Offer a ${p.age >= 30 ? '1-year' : '2-year'} extension capped at ≤ £${wageCap}/wk (no automatic yearly wage-rise clause).`;
    } else if (isExpiringSoon && !isKeyContributor && !isHighPotYouth) {
      if (isThinPositionCover && (p.wagePw || 0) <= avgWage) {
        verdict = 'Hold';
        priority = 'Medium';
        headline = `Cheap depth at thin position — keep until replacement arrives`;
        rationale = `Expires in ${monthsLeft}m on affordable £${p.wagePw}/wk, and you are thin at ${p.position}. ${isMentor ? 'Also provides positive mentoring influence.' : ''}`;
        recommendedMove = `Wait until spring; only renew on a flat 1-year squad-player deal if you cannot sign a stronger free agent.`;
      } else {
        verdict = 'Let Expire';
        priority = isInDebt || isOverWageBudget || weakPers ? 'High' : 'Medium';
        headline = `Free wage exit in ${monthsLeft}m (clears £${p.wagePw}/wk)`;
        rationale = `Age ${p.age}, ${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★, only ${p.minutes}m played on £${p.wagePw}/wk (£${annualWage.toLocaleString()}/yr)${weakPers ? ` with weak Determination (${p.attributes.determination})` : ''}.`;
        recommendedMove = `Do not renew — let contract expire on ${p.expires}${isOverWageBudget ? ' (or offer free/low fee in January to fix your wage deficit immediately)' : ''}.`;
      }
    } else if (isUnusedHighEarner || (p.status === 'Surplus' && (p.wagePw || 0) > 0)) {
      if (isThinPositionCover) {
        verdict = 'Replace Before Selling';
        priority = 'High';
        headline = `High wage (£${p.wagePw}/wk) but thin depth at ${p.position}`;
        rationale = `Earning £${p.wagePw}/wk with ${p.minutes}m played, which hurts ${isInDebt ? 'your negative balance' : 'wage efficiency'}, BUT selling him before signing cover leaves ${p.position} exposed.`;
        recommendedMove = `Scout a cheaper free/loan replacement at ${p.position} first, then transfer-list to save £${p.wagePw}/wk (£${annualWage.toLocaleString()}/yr).`;
      } else {
        verdict = 'Sell / Transfer List';
        priority = 'High';
        headline = `Offload to cut £${p.wagePw}/wk (£${annualWage.toLocaleString()}/yr)`;
        rationale = `High earner with ${p.minutes}m played (Age ${p.age}, ${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★${weakPers ? `, Det ${p.attributes.determination}` : ''}). ${isInDebt || isOverWageBudget ? 'Directly helps clear your club debt & wage budget deficit.' : 'Frees budget for priority positions.'}`;
        recommendedMove = `Transfer list & offer via TransferRoom (even a nominal fee or 100%-wage loan saves £${p.wagePw}/wk immediately).`;
      }
    } else {
      verdict = 'Hold';
      priority = 'Low';
      headline = isMentor
        ? `Valuable senior mentor (${p.personality}, Det ${p.attributes.determination})`
        : `Balanced squad contributor (${p.expires === 'N/A' ? 'Non-contract' : `exp ${p.expires}`})`;
      rationale = `${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★, ${p.minutes}m, Engine ${eng.physicalEngineScore}/100 on £${p.wagePw}/wk${isMentor ? ' — strong mentoring anchor for U21 prospects.' : '.'}`;
      recommendedMove = isMentor
        ? `Keep in squad and anchor a 3-player mentoring group with 2 U21 prospects.`
        : `Keep in ${p.ipRole} (IP) / ${p.oopRole} (OOP) rotation; review next window.`;
    }

    return {
      player: p,
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

  const verdictOrder: Record<TransferActionVerdict, number> = {
    'Protect Youth Asset': 0,
    'Renew Now': 1,
    'Sell / Transfer List': 2,
    'Replace Before Selling': 3,
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

  const potentialWeeklySavings = playerAdvice
    .filter(
      (a) =>
        a.verdict === 'Sell / Transfer List' ||
        a.verdict === 'Replace Before Selling' ||
        a.verdict === 'Let Expire' ||
        a.verdict === 'Loan Out'
    )
    .reduce((sum, a) => sum + (a.player.wagePw || 0), 0);

  const expiringWithin12mCount = playerAdvice.filter(
    (a) => a.monthsLeft !== null && a.monthsLeft <= 12
  ).length;

  return {
    clubProfile,
    totalWeeklyWage: squadWeeklyWageSum,
    potentialWeeklySavings,
    expiringWithin12mCount,
    countsByVerdict,
    playerAdvice,
    positionalNeeds,
  };
}
