import { PlayerRecord } from '../types/fm27';
import { DivisionBenchmarks } from '../types/fmSave';

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

export interface DynamicSquadTierBenchmarks {
  p75PaidWeeklyWage: number;
  medianPaidWeeklyWage: number;
  p75AbilityStars: number;
  divisionCompared: boolean;
  divisionDeficits: string[];
}

export interface SquadTransferAuditSummary {
  clubProfile: ClubFinancialProfile;
  totalWeeklyWage: number;
  potentialWeeklySavings: number;
  expiringWithin12mCount: number;
  countsByVerdict: Record<TransferActionVerdict, number>;
  playerAdvice: PlayerTransferAdvice[];
  positionalNeeds: PositionalSigningNeed[];
  tierBenchmarks: DynamicSquadTierBenchmarks;
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

function getBucketFamiliarity(p: PlayerRecord, code: string): number | null {
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
      return maxOf('mc', 'cm', 'amc');
    case 'W':
      return maxOf('amr', 'aml', 'mr', 'ml', 'rw', 'lw');
    case 'ST':
      return maxOf('st', 'stc');
    default:
      return 0;
  }
}

function matchesPositionBucket(p: PlayerRecord, code: string): boolean {
  const fam = getBucketFamiliarity(p, code);
  if (fam !== null) {
    return fam >= 15;
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

function playerStrengthScore(p: PlayerRecord): number {
  const ratingBonus = typeof p.rating === 'number' && p.rating > 0 ? p.rating * 5 : 33;
  // Long-term squad building score: ability + potential + form (never temporary match condition)
  return (p.ability || 2.5) * 32 + (p.potential || p.ability || 2.5) * 6 + ratingBonus;
}

function percentileValue(sortedAsc: number[], pct: number, fallback: number): number {
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

  const divisionDeficits: string[] = [];
  if (divisionBenchmarks?.byPositionGroup && players.length > 0) {
    const groups: Array<'GK' | 'DEF' | 'MID' | 'FWD'> = ['GK', 'DEF', 'MID', 'FWD'];
    for (const grp of groups) {
      const divGrp = divisionBenchmarks.byPositionGroup[grp];
      if (!divGrp || divGrp.sampleSize === 0) continue;
      const grpPlayers = players.filter((p) => positionGroupForTier(p.position) === grp);
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
          grpPlayers.reduce((sum, p) => sum + Number(p.attributes?.[checkKey] ?? 10), 0) /
          grpPlayers.length;
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
    divisionCompared: Boolean(divisionBenchmarks?.byPositionGroup),
    divisionDeficits,
  };
}

export function buildSquadTransferAudit(
  players: PlayerRecord[],
  saveDate: string,
  finances?: ClubFinancialInput,
  divisionBenchmarks?: DivisionBenchmarks | null
): SquadTransferAuditSummary {
  const refDate = parseContractDate(saveDate) || new Date(2027, 8, 15);
  const tierBenchmarks = computeDynamicSquadTierBenchmarks(players, divisionBenchmarks);
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
      `Bank balance is NEGATIVE (-£${Math.abs(Math.round(balanceNum / 1000)).toLocaleString()}K) — avoid cash fees; trim high-wage backups, promote U21 successors, and use free transfers/loans.`
    );
  }
  if (isOverWageBudget && wageHeadroomWeekly !== null) {
    strategyBullets.push(
      `Over weekly wage budget by £${Math.abs(wageHeadroomWeekly).toLocaleString()}/wk — offloading 1–2 backup earners or letting aging deals expire fixes compliance immediately.`
    );
  }
  strategyBullets.push(
    'Protect U21 high-potential prospects (3.5★+ ceiling) on long deals and let them replace pricier aging squad players.'
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

  // Compute 4-3-3 positional depth & rank players inside every position bucket
  const bucketDefs = [
    {
      code: 'GK',
      label: 'Goalkeepers',
      idealMin: 2,
      idealMax: 3,
      starterSlots: 1,
      scoutProfile: 'No-Nonsense GK IP / GK OOP — Decisions ≥ 11, Aerial/JR ≥ 12',
    },
    {
      code: 'RB',
      label: 'Right-Backs',
      idealMin: 2,
      idealMax: 3,
      starterSlots: 1,
      scoutProfile: 'Full-Back IP / FB OOP — Pace ≥ 12, Acc ≥ 12, Stamina ≥ 12, Tackling ≥ 11',
    },
    {
      code: 'CB',
      label: 'Centre-Backs',
      idealMin: 4,
      idealMax: 5,
      starterSlots: 2,
      scoutProfile: 'CB / Ball-Playing CB — Jumping Reach ≥ 13, Tackling ≥ 12, Pace ≥ 11',
    },
    {
      code: 'LB',
      label: 'Left-Backs',
      idealMin: 2,
      idealMax: 3,
      starterSlots: 1,
      scoutProfile: 'Full-Back IP / FB OOP — Left-footed, Pace ≥ 12, Stamina ≥ 12, Tackling ≥ 11',
    },
    {
      code: 'DM',
      label: 'Defensive Mids',
      idealMin: 2,
      idealMax: 3,
      starterSlots: 1,
      scoutProfile: 'DM IP / DM OOP — Tackling ≥ 12, Positioning ≥ 12, Stamina ≥ 12, Passing ≥ 11',
    },
    {
      code: 'CM',
      label: 'Central Mids',
      idealMin: 4,
      idealMax: 6,
      starterSlots: 2,
      scoutProfile: 'CM / AM IP + WCM OOP — Passing ≥ 12, First Touch ≥ 12, Work Rate ≥ 12, Stamina ≥ 12',
    },
    {
      code: 'W',
      label: 'Wingers / IFs',
      idealMin: 4,
      idealMax: 6,
      starterSlots: 2,
      scoutProfile: 'Winger / IF IP + Tracking Winger OOP — Pace ≥ 13, Acc ≥ 13, Stamina ≥ 11, Work Rate ≥ 11',
    },
    {
      code: 'ST',
      label: 'Strikers',
      idealMin: 2,
      idealMax: 4,
      starterSlots: 1,
      scoutProfile: 'Poacher / Channel Forward IP + Outlet CF OOP — Finishing ≥ 12, Off The Ball ≥ 12, Pace ≥ 13',
    },
  ];

  const positionalNeeds: PositionalSigningNeed[] = bucketDefs.map((d) => {
    const matched = players
      .filter((p) => matchesPositionBucket(p, d.code))
      .sort((a, b) => playerStrengthScore(b) - playerStrengthScore(a));
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

  // Compute paid-player median wage (ignoring £0 youth/amateur deals) so wage benchmarks are realistic!
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

  const getPlayerBestBucketInfo = (p: PlayerRecord) => {
    let bestBucket: PositionalSigningNeed | null = null;
    let bestRank = 99;
    let bestFam = -1;
    let starterSlots = 1;
    for (let i = 0; i < positionalNeeds.length; i++) {
      const b = positionalNeeds[i];
      const idx = b.players.findIndex((cand) => cand.id === p.id);
      if (idx === -1) continue;
      const fam = getBucketFamiliarity(p, b.code);
      if (fam !== null && fam < 15) continue;
      const effectiveFam = fam ?? 15;
      const rank = idx + 1;
      if (
        bestBucket === null ||
        effectiveFam > bestFam ||
        (effectiveFam === bestFam && rank < bestRank)
      ) {
        bestFam = effectiveFam;
        bestRank = rank;
        bestBucket = b;
        starterSlots = bucketDefs[i].starterSlots;
      }
    }
    return { bestBucket, bestRank, starterSlots };
  };

  const findInternalYouthSuccessor = (
    p: PlayerRecord,
    bucket: PositionalSigningNeed | null
  ): PlayerRecord | null => {
    if (!bucket) return null;
    const youthCands = bucket.players
      .filter(
        (cand) =>
          cand.id !== p.id &&
          cand.age <= 22 &&
          cand.potential >= 3.5 &&
          cand.ability >= (p.ability || 2.5) - 1.0 &&
          (cand.wagePw || 0) < (p.wagePw || 0)
      )
      .sort((a, b) => (b.ability || 0) - (a.ability || 0) || (b.potential || 0) - (a.potential || 0));
    return youthCands[0] || null;
  };

  const playerAdvice: PlayerTransferAdvice[] = players.map((p) => {
    const expDate = parseContractDate(p.expires);
    const monthsLeft = expDate ? monthsBetween(refDate, expDate) : null;
    const annualWage = (p.wagePw || 0) * 52;
    const positivePers = isPositivePersonality(p);
    const weakPers = isWeakPersonality(p);
    const isMentor = p.age >= 26 && positivePers;
    const isHighPotYouth =
      p.age <= 21 && (p.potential >= 3.5 || p.potential - p.ability >= 1.0);
    const isExpiringSoon = monthsLeft !== null && monthsLeft <= 11;

    const { bestBucket, bestRank, starterSlots } = getPlayerBestBucketInfo(p);
    const isTrueStarter = bestRank <= starterSlots;
    const isPrimaryBackup = bestRank <= starterSlots + 1;
    const isDeepSurplusRank =
      bestBucket !== null && bestRank > Math.max(starterSlots + 1, bestBucket.idealMin);
    const isThinPositionCover =
      bestBucket !== null && bestBucket.currentCount <= bestBucket.idealMin;
    const isOverstockedPos =
      bestBucket !== null && bestBucket.status === 'Overstocked';
    const youthSuccessor = findInternalYouthSuccessor(p, bestBucket);

    const isHighEarner = (p.wagePw || 0) >= highWageThreshold && (p.wagePw || 0) > 0;
    const isPaidSenior = p.age >= 22 && (p.wagePw || 0) >= Math.max(100, medianPaidWage * 0.7);
    const isAgingExpensiveBackup = p.age >= 27 && isHighEarner && !isTrueStarter;
    const isAgingDecliningStarter = p.age >= 32 && isHighEarner && youthSuccessor !== null;

    const tags: string[] = [];
    if (bestBucket) tags.push(`#${bestRank} ${bestBucket.code}`);
    if (isHighPotYouth) tags.push('Youth Asset');
    if (youthSuccessor && p.age >= 24 && !isTrueStarter) {
      tags.push(`Youth Ready: ${youthSuccessor.name}`);
    }
    if (isMentor) tags.push(`Mentor (Det ${p.attributes.determination})`);
    else if (positivePers) tags.push(`${p.personality} (Det ${p.attributes.determination})`);
    else if (weakPers) tags.push(`Low Det (${p.attributes.determination})`);
    if (isThinPositionCover) tags.push('Thin Depth');
    if (isOverstockedPos) tags.push('Overstocked Pos');
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
      const formattedClause =
        lowest >= 1_000_000
          ? `£${(lowest / 1_000_000).toFixed(1)}M`
          : lowest >= 1_000
            ? `£${Math.round(lowest / 1_000)}K`
            : `£${lowest}`;
      tags.push(`Release Clause ${formattedClause}`);
    }
    if (Array.isArray(p.activeSuspensions) && p.activeSuspensions.length > 0) {
      tags.push(`BANNED (${p.activeSuspensions[0].matchesRemaining}m)`);
    }

    let verdict: TransferActionVerdict = 'Hold';
    let priority: 'High' | 'Medium' | 'Low' = 'Low';
    let headline = '';
    let rationale = '';
    let recommendedMove = '';

    // 1. Protect Expiring High-Potential Youth FIRST
    if (isHighPotYouth && isExpiringSoon) {
      verdict = 'Protect Youth Asset';
      priority = 'High';
      const wageTarget =
        isInDebt || isOverWageBudget
          ? Math.max(p.wagePw || 80, 100)
          : Math.round(((p.wagePw || 100) * 1.1) / 10) * 10;
      headline = `Lock down U21 prospect before Bosman window (${monthsLeft}m left)`;
      rationale = `Age ${p.age}, ${p.ability.toFixed(1)}★ → ${p.potential.toFixed(1)}★ ceiling (${p.personality}, Det ${p.attributes.determination}). High resale & first-team value for a ${clubTierLabel.toLowerCase()}.`;
      recommendedMove = `Offer a 3-year deal (+ 1-yr optional club extension) around £${wageTarget}/wk and put in a 3-player mentoring group.`;
    }
    // 2. Fringe U21 Prospects -> Loan Out (Development)
    else if (
      isHighPotYouth &&
      !isTrueStarter &&
      (bestRank >= starterSlots + 2 || p.minutes < 180)
    ) {
      verdict = 'Loan Out';
      priority = 'Medium';
      headline = `Loan for starts (${p.potential.toFixed(1)}★ ceiling · #${bestRank} ${bestBucket?.code || p.position})`;
      rationale = `Age ${p.age} prospect needs regular senior matches to reach ${p.potential.toFixed(1)}★ potential rather than sitting behind senior starters.`;
      recommendedMove = `Add to Development List as Regular Starter (ask 50–100% wage cover to save up to £${p.wagePw}/wk while developing).`;
    }
    // 3. Expiring Contracts (<= 11m): Separate True Starters (Renew) from Backups/Aging (Let Expire / Keep Until Out)
    else if (isExpiringSoon) {
      const shouldRenew =
        (isTrueStarter && p.age <= 30 && p.ability >= 3.0) ||
        (isPrimaryBackup && p.age <= 25 && p.ability >= 3.5 && !isOverstockedPos);

      if (shouldRenew) {
        verdict = 'Renew Now';
        priority = monthsLeft !== null && monthsLeft <= 6 ? 'High' : 'Medium';
        const wageCap =
          isInDebt || isOverWageBudget
            ? p.wagePw || 150
            : Math.round(((p.wagePw || 150) * 1.1) / 10) * 10;
        headline = `Core #${bestRank} ${bestBucket?.code || p.position} expiring in ${monthsLeft}m — renew on disciplined terms`;
        rationale = `${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★ starter (${p.personality}, Det ${p.attributes.determination}). ${isInDebt ? 'Because the club is in debt, hold wages flat.' : 'Prevent a free Bosman exit.'}`;
        recommendedMove = `Offer a ${p.age >= 29 ? '1-year' : '2-year'} extension capped at ≤ £${wageCap}/wk (no automatic yearly wage-rise clause).`;
      } else {
        verdict = 'Let Expire';
        priority = isHighEarner || isInDebt || isOverWageBudget ? 'High' : 'Medium';
        headline = `Keep until contract ends in ${monthsLeft}m — free £${p.wagePw}/wk exit`;
        rationale = `#${bestRank} ${bestBucket?.code || p.position} (Age ${p.age}, ${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★, £${p.wagePw}/wk = £${annualWage.toLocaleString()}/yr). ${youthSuccessor ? `${youthSuccessor.name} (Age ${youthSuccessor.age}, ${youthSuccessor.ability.toFixed(1)}★/${youthSuccessor.potential.toFixed(1)}★, £${youthSuccessor.wagePw}/wk) is ready to step up.` : 'Not worth committing fresh wages while managing club finances.'}`;
        recommendedMove = youthSuccessor
          ? `Keep for squad depth until ${p.expires}, then let expire and promote ${youthSuccessor.name} (net saving £${Math.max(0, (p.wagePw || 0) - (youthSuccessor.wagePw || 0))}/wk).`
          : `Keep as cheap cover until ${p.expires}, then let contract expire (or accept any small Jan fee to clear £${p.wagePw}/wk early).`;
      }
    }
    // 4. Sell / Transfer List vs Replace Before Selling (ONLY Backups / Overstocked Depth, NEVER prime #1 starters!)
    else if (
      isPaidSenior &&
      ((!isTrueStarter &&
        (isDeepSurplusRank ||
          isAgingExpensiveBackup ||
          isOverstockedPos ||
          (isHighEarner && p.minutes < 180))) ||
        isAgingDecliningStarter)
    ) {
      const netSaveYouth = youthSuccessor
        ? Math.max(0, (p.wagePw || 0) - (youthSuccessor.wagePw || 0))
        : p.wagePw || 0;

      if (isThinPositionCover && !youthSuccessor) {
        verdict = 'Replace Before Selling';
        priority = 'High';
        headline = `Sell £${p.wagePw}/wk backup AFTER signing cheaper ${bestBucket?.code || p.position} cover`;
        rationale = `Earning £${p.wagePw}/wk (£${annualWage.toLocaleString()}/yr) as #${bestRank} ${bestBucket?.code || p.position} (Age ${p.age}, ${p.ability.toFixed(1)}★), which strains ${isInDebt ? 'your negative balance' : 'your wage budget'} — but depth is thin here with no U21 ready.`;
        recommendedMove = `Line up a cheaper free-agent or zero-fee loan replacement at ${bestBucket?.code || p.position} first, then sell via TransferRoom to clear £${p.wagePw}/wk.`;
      } else {
        verdict = 'Sell / Transfer List';
        priority = 'High';
        headline = youthSuccessor
          ? `Sell backup (£${p.wagePw}/wk) & promote youth ${youthSuccessor.name} (£${youthSuccessor.wagePw}/wk)`
          : `Transfer list surplus depth to cut £${p.wagePw}/wk (£${annualWage.toLocaleString()}/yr)`;
        rationale = `#${bestRank} ${bestBucket?.code || p.position} backup (Age ${p.age}, ${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★${weakPers ? `, Det ${p.attributes.determination}` : ''}). ${isOverstockedPos ? `${bestBucket?.label} is overstocked (${bestBucket?.currentCount} players). ` : ''}${isInDebt || isOverWageBudget ? 'Offloading backup wages directly reduces club debt & wage overspend without weakening your Starting XI.' : 'Frees wage budget for priority upgrades.'}`;
        recommendedMove = youthSuccessor
          ? `Transfer list & offer via TransferRoom; hand his backup minutes to ${youthSuccessor.name} (${youthSuccessor.ability.toFixed(1)}★/${youthSuccessor.potential.toFixed(1)}★) to save £${netSaveYouth}/wk (£${(netSaveYouth * 52).toLocaleString()}/yr).`
          : `Transfer list & offer via TransferRoom (even a nominal fee or 100%-wage loan saves £${p.wagePw}/wk immediately).`;
      }
    }
    // 5. Hold (Core starters, cheap mentors, or balanced squad depth)
    else {
      verdict = 'Hold';
      priority = 'Low';
      headline = isTrueStarter
        ? `Core #${bestRank} ${bestBucket?.code || p.position} Starter — Keep (${p.expires === 'N/A' ? 'Non-contract' : `exp ${p.expires}`})`
        : isMentor
          ? `Senior mentor (#${bestRank} ${bestBucket?.code || p.position} · ${p.personality})`
          : `Balanced squad depth (#${bestRank} ${bestBucket?.code || p.position} · exp ${p.expires})`;
      rationale = `${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★, Age ${p.age}, £${p.wagePw}/wk (${p.personality}, Det ${p.attributes.determination})${isTrueStarter ? ' — first-choice starter protected for squad stability.' : isMentor ? ' — strong mentoring anchor for U21 prospects.' : ' — fits squad & budget structure.'}`;
      recommendedMove = isMentor
        ? `Keep in squad and anchor a 3-player mentoring group with 2 U21 prospects.`
        : `Keep in ${p.ipRole} (IP) / ${p.oopRole} (OOP) rotation; reassess next window.`;
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
    tierBenchmarks,
  };
}
