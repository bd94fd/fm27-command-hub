import { PlayerRecord } from '../types/fm27';
import { computeFm27EngineMetrics } from './fmSyncEngine';

export type TransferActionVerdict =
  | 'Renew Now'
  | 'Sell / Transfer List'
  | 'Loan Out'
  | 'Let Expire'
  | 'Hold';

export interface PlayerTransferAdvice {
  player: PlayerRecord;
  verdict: TransferActionVerdict;
  priority: 'High' | 'Medium' | 'Low';
  monthsLeft: number | null;
  annualWage: number;
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
  totalWeeklyWage: number;
  potentialWeeklySavings: number;
  expiringWithin12mCount: number;
  countsByVerdict: Record<TransferActionVerdict, number>;
  playerAdvice: PlayerTransferAdvice[];
  positionalNeeds: PositionalSigningNeed[];
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
  saveDate: string
): SquadTransferAuditSummary {
  const refDate = parseContractDate(saveDate) || new Date(2027, 8, 15);
  const totalWeeklyWage = players.reduce((sum, p) => sum + (p.wagePw || 0), 0);
  const avgWage = players.length > 0 ? totalWeeklyWage / players.length : 200;

  const playerAdvice: PlayerTransferAdvice[] = players.map((p) => {
    const expDate = parseContractDate(p.expires);
    const monthsLeft = expDate ? monthsBetween(refDate, expDate) : null;
    const annualWage = (p.wagePw || 0) * 52;
    const eng = computeFm27EngineMetrics(p);
    const isExpiringSoon = monthsLeft !== null && monthsLeft <= 11;
    const isKeyContributor =
      p.minutes >= 180 ||
      p.ability >= 3.5 ||
      (typeof p.rating === 'number' && p.rating >= 7.0);
    const isHighPotYouth = p.age <= 21 && p.potential >= 3.5;
    const isUnusedHighEarner =
      (p.wagePw || 0) >= Math.max(180, avgWage * 0.9) &&
      p.minutes < 90 &&
      p.status !== 'Injured';

    let verdict: TransferActionVerdict = 'Hold';
    let priority: 'High' | 'Medium' | 'Low' = 'Low';
    let headline = 'Core Squad — Hold';
    let rationale = '';
    let recommendedMove = '';

    if (isExpiringSoon && (isKeyContributor || isHighPotYouth)) {
      verdict = 'Renew Now';
      priority = monthsLeft !== null && monthsLeft <= 6 ? 'High' : 'Medium';
      const suggestedCap = Math.round(((p.wagePw || 150) * 1.15) / 10) * 10;
      headline = `Lock down before Bosman window (${monthsLeft}m left)`;
      rationale = `${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★ ${p.position} (${p.minutes}m, Engine ${eng.physicalEngineScore}/100) expires ${p.expires}. Losing him for free would weaken your ${p.ipRole} / ${p.oopRole} depth.`;
      recommendedMove = `Offer a 2-year renewal now (target ≤ £${suggestedCap}/wk, avoid high unused-sub bonuses).`;
    } else if (
      p.age <= 21 &&
      p.minutes < 120 &&
      p.potential >= 3.0 &&
      p.status !== 'Starter'
    ) {
      verdict = 'Loan Out';
      priority = 'Medium';
      headline = `Develop via loan (${p.potential.toFixed(1)}★ ceiling, ${p.minutes}m played)`;
      rationale = `Age ${p.age} prospect needs regular match sharpness to grow toward ${p.potential.toFixed(1)}★ potential rather than sitting on the fringes.`;
      recommendedMove = `Add to Development List / offer on loan as Regular Starter (request 50–100% wage cover, saves up to £${p.wagePw}/wk).`;
    } else if (
      isExpiringSoon &&
      !isKeyContributor &&
      (p.age >= 23 || p.status === 'Surplus')
    ) {
      verdict = 'Let Expire';
      priority = (p.wagePw || 0) >= avgWage ? 'High' : 'Medium';
      headline = `Free wage exit in ${monthsLeft}m (saves £${p.wagePw}/wk)`;
      rationale = `Age ${p.age}, ${p.ability.toFixed(1)}★, only ${p.minutes}m played on £${p.wagePw}/wk (£${annualWage.toLocaleString()}/yr). Not worth a renewal.`;
      recommendedMove = `Do not renew — let contract expire on ${p.expires} (or accept any small fee in January to clear £${p.wagePw}/wk immediately).`;
    } else if (
      isUnusedHighEarner ||
      (p.status === 'Surplus' && (p.wagePw || 0) > 0)
    ) {
      verdict = 'Sell / Transfer List';
      priority = 'High';
      headline = `Offload to clear £${p.wagePw}/wk (£${annualWage.toLocaleString()}/yr)`;
      rationale = `Earning £${p.wagePw}/wk with only ${p.minutes}m played (Age ${p.age}, ${p.ability.toFixed(1)}★). High wage-to-minutes drag on your SCR budget.`;
      recommendedMove = `Transfer list & offer via TransferRoom (even a low fee or paid loan frees £${p.wagePw}/wk immediately).`;
    } else {
      verdict = 'Hold';
      priority = 'Low';
      headline = `Under control (${p.expires === 'N/A' ? 'Non-contract' : `exp ${p.expires}`})`;
      rationale = `${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★, ${p.minutes}m played, Engine ${eng.physicalEngineScore}/100 on £${p.wagePw}/wk — fits squad structure.`;
      recommendedMove = `Keep in squad rotation as ${p.ipRole} (IP) / ${p.oopRole} (OOP); review contract next window.`;
    }

    return {
      player: p,
      verdict,
      priority,
      monthsLeft,
      annualWage,
      headline,
      rationale,
      recommendedMove,
    };
  });

  const verdictOrder: Record<TransferActionVerdict, number> = {
    'Renew Now': 0,
    'Sell / Transfer List': 1,
    'Let Expire': 2,
    'Loan Out': 3,
    Hold: 4,
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
    'Sell / Transfer List': 0,
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
        a.verdict === 'Let Expire' ||
        a.verdict === 'Loan Out'
    )
    .reduce((sum, a) => sum + (a.player.wagePw || 0), 0);

  const expiringWithin12mCount = playerAdvice.filter(
    (a) => a.monthsLeft !== null && a.monthsLeft <= 12
  ).length;

  const bucketDefs: Array<{
    code: string;
    label: string;
    idealMin: number;
    idealMax: number;
    scoutProfile: string;
  }> = [
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

  return {
    totalWeeklyWage,
    potentialWeeklySavings,
    expiringWithin12mCount,
    countsByVerdict,
    playerAdvice,
    positionalNeeds,
  };
}
