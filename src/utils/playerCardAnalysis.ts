import { PlayerRecord } from '../types/fm27';
import { DivisionBenchmarks } from '../types/fmSave';
import {
  FM27_ROLES,
  FM27_ROLE_ATTR_MAP,
  Fm27RoleItem,
  getNaturalRolesForPlayer,
  resolveNaturalDefaultRoles,
  scorePlayerForFm27Role,
} from './fm27RoleMatcher';
import {
  classifyPositionSlot,
  getPositionGroup,
} from './recruitmentHelpers';
import { computeFm27EngineMetrics } from './fmSyncEngine';
import {
  ClubDnaEvaluationResult,
  DEFAULT_CLUB_DNA_WEIGHTS,
  evaluatePlayerClubDna,
  loadPersistedClubDnaWeights,
} from './clubDnaEngine';

export interface PlayerTraitInsight {
  attrKey: string;
  label: string;
  value: number;
  summary: string;
}

export interface RankedRoleFit {
  role: Fm27RoleItem;
  fitPct: number;
  tier: 'Natural Fit' | 'Solid' | 'Makeshift';
  topSupporting: Array<{ label: string; value: number }>;
  topLimiting: Array<{ label: string; value: number }>;
}

export interface DurabilityAssessment {
  stamina: number;
  naturalFitness: number | null;
  isInjuryProne: boolean;
  tier: 'Ironman' | 'Reliable' | 'Manage Load' | 'Fragile';
  headline: string;
  advice: string;
}

export interface PhysicalVerdictCard {
  score: number;
  tier: 'Elite' | 'Strong' | 'Average' | 'Below Par';
  explanation: string;
  topSpeedMps: number;
  topSpeedKmh: number;
  speedVerdict: string;
  jumpHeightMeters: number;
  aerialVerdict: string;
  durability: DurabilityAssessment;
}

export interface SquadDepthContext {
  positionLabel: string;
  rank: number;
  totalAtPosition: number;
  bestTeammate: PlayerRecord | null;
  summary: string;
}

export interface DevelopmentAdvice {
  stage: 'High-Upside Prospect' | 'Developing' | 'Peak Years' | 'Experienced';
  headline: string;
  trainingFocus: string[];
  note: string;
}

export interface SeasonProductionState {
  mode:
    | 'fast_sync_missing'
    | 'preseason_no_matches'
    | 'stats_unavailable'
    | 'no_appearances'
    | 'has_stats';
  hasPlayed: boolean;
  finishingNote: string | null;
  creationNote: string | null;
}

export interface SeasonStatsContextOptions {
  isFastSync?: boolean;
  playedMatchesCount?: number;
}

export interface ContractStandingInsight {
  annualWage: number;
  monthsRemaining: number | null;
  renewalRisk: 'Expiring Soon' | 'Monitor' | 'Secure';
  promisedPlayingTime: string | null;
  promiseMismatch: string | null;
}

export interface PlayerCardAnalysis {
  bestIpRole: RankedRoleFit | null;
  bestOopRole: RankedRoleFit | null;
  topIpRoles: RankedRoleFit[];
  topOopRoles: RankedRoleFit[];
  scoutingVerdict: string;
  strengths: PlayerTraitInsight[];
  watchpoints: PlayerTraitInsight[];
  physical: PhysicalVerdictCard;
  clubDna: ClubDnaEvaluationResult;
  squadDepth: SquadDepthContext | null;
  development: DevelopmentAdvice;
  seasonProduction: SeasonProductionState;
  contractStanding: ContractStandingInsight;
}

const ATTR_LABELS: Record<string, string> = {
  pace: 'Pace',
  acceleration: 'Acceleration',
  stamina: 'Stamina',
  jumpingReach: 'Jumping Reach',
  naturalFitness: 'Natural Fitness',
  strength: 'Strength',
  agility: 'Agility',
  balance: 'Balance',
  finishing: 'Finishing',
  firstTouch: 'First Touch',
  passing: 'Passing',
  dribbling: 'Dribbling',
  crossing: 'Crossing',
  technique: 'Technique',
  tackling: 'Tackling',
  marking: 'Marking',
  heading: 'Heading',
  longShots: 'Long Shots',
  decisions: 'Decisions',
  determination: 'Determination',
  workRate: 'Work Rate',
  offTheBall: 'Off The Ball',
  positioning: 'Positioning',
  anticipation: 'Anticipation',
  composure: 'Composure',
  concentration: 'Concentration',
  vision: 'Vision',
  teamwork: 'Teamwork',
  bravery: 'Bravery',
  aggression: 'Aggression',
  flair: 'Flair',
  leadership: 'Leadership',
  reflexes: 'Reflexes',
  handling: 'Handling',
  commandOfArea: 'Command of Area',
  aerialReach: 'Aerial Reach',
  oneOnOnes: 'One on Ones',
  kicking: 'Kicking',
  throwing: 'Throwing',
  communication: 'Communication',
  rushingOut: 'Rushing Out',
  punching: 'Punching',
  eccentricity: 'Eccentricity',
};

const STRENGTH_HINTS: Record<string, string> = {
  pace: 'Stretches high lines and recovers ground quickly',
  acceleration: 'Explosive first-step burst to beat markers',
  stamina: 'Sustains high-tempo pressing deep into matches',
  jumpingReach: 'Dominates aerial duels and set-piece battles',
  strength: 'Holds off challenges and wins physical duels',
  finishing: 'Reliable composure when chances fall in the box',
  firstTouch: 'Cushions passes cleanly under pressure',
  passing: 'Progresses play accurately through the lines',
  dribbling: 'Carries the ball past defenders in 1v1s',
  crossing: 'Delivers dangerous service from wide areas',
  tackling: 'Wins the ball cleanly in defensive duels',
  marking: 'Tracks runners tightly in the box',
  heading: 'Strong aerial direction on crosses and set pieces',
  decisions: 'Consistently picks the right pass or action',
  determination: 'Drives standards and responds well when behind',
  workRate: 'Relentless off-the-ball effort in both phases',
  offTheBall: 'Finds dangerous pockets and times runs well',
  positioning: 'Reads danger early and holds defensive shape',
  anticipation: 'Reacts first to loose balls and turnovers',
  composure: 'Stays calm under heavy pressure',
  vision: 'Spots defence-splitting passes early',
  reflexes: 'Quick shot-stopping reactions from close range',
  handling: 'Secures shots cleanly without giving up rebounds',
  commandOfArea: 'Claims crosses and organises the six-yard box',
  aerialReach: 'High reach to deal with lofted balls and corners',
};

const WEAKNESS_HINTS: Record<string, string> = {
  pace: 'Can be exposed for speed in transition — avoid huge space behind',
  acceleration: 'Slower off the mark over the first five yards',
  stamina: 'Tires early — plan a substitution around 60–65 minutes',
  jumpingReach: 'Vulnerable in aerial duels — avoid direct long-ball targets',
  strength: 'Can be outmuscled in physical shoulder-to-shoulder duels',
  finishing: 'Needs high-volume chances to convert consistently',
  firstTouch: 'Can lose control when pressed tightly on reception',
  passing: 'Keep distribution simple rather than forcing risky passes',
  dribbling: 'Better releasing the ball early than taking on 1v1s',
  tackling: 'Prone to mistimed challenges if isolated defensively',
  marking: 'Can lose runners at the back post',
  decisions: 'Occasional rushed choices under pressure',
  workRate: 'Limited pressing output — pair with high-energy teammates',
  offTheBall: 'Needs direct balls into space rather than complex movement',
  positioning: 'Can be caught out of shape when transitions break',
  composure: 'Rushes key actions when closed down quickly',
  concentration: 'Risk of late-game lapses if fatigued',
  reflexes: 'Can be beaten by sharp close-range efforts',
  handling: 'May parry shots into danger areas',
};

function readRawAttr(
  player: PlayerRecord,
  key: keyof PlayerRecord['attributes']
): number | null {
  const val = player.attributes?.[key];
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
    return val;
  }
  return null;
}

export function getRealShirtNumber(player: PlayerRecord): number | null {
  if (
    typeof player.number === 'number' &&
    Number.isFinite(player.number) &&
    player.number >= 1 &&
    player.number <= 99
  ) {
    // Avoid misleading #1 on outfield players when a list index leaked as kit number
    const isGk = (player.position || '').toUpperCase().includes('GK');
    if (player.number === 1 && !isGk) return null;
    return player.number;
  }
  return null;
}

export function getPrimaryPositionCode(position: string): string {
  const clean = (position || '').trim();
  if (!clean) return 'PL';
  const first = clean.split(/[,/]/)[0].trim();
  return first.slice(0, 4).toUpperCase();
}

export function getPositionRelevantAttrKeys(
  position: string
): Array<keyof PlayerRecord['attributes']> {
  const slot = classifyPositionSlot(position);
  if (slot === 'GK') {
    return [
      'reflexes',
      'handling',
      'aerialReach',
      'commandOfArea',
      'oneOnOnes',
      'agility',
      'positioning',
      'decisions',
      'kicking',
      'concentration',
    ];
  }
  if (slot === 'DC') {
    return [
      'tackling',
      'marking',
      'positioning',
      'jumpingReach',
      'heading',
      'strength',
      'pace',
      'decisions',
      'concentration',
      'passing',
    ];
  }
  if (slot === 'FB') {
    return [
      'pace',
      'acceleration',
      'stamina',
      'tackling',
      'positioning',
      'crossing',
      'workRate',
      'passing',
      'decisions',
      'marking',
    ];
  }
  if (slot === 'DM_MC') {
    return [
      'passing',
      'decisions',
      'workRate',
      'stamina',
      'tackling',
      'positioning',
      'firstTouch',
      'vision',
      'composure',
      'anticipation',
    ];
  }
  if (slot === 'AM_W') {
    return [
      'pace',
      'acceleration',
      'dribbling',
      'firstTouch',
      'offTheBall',
      'passing',
      'crossing',
      'finishing',
      'stamina',
      'workRate',
      'decisions',
    ];
  }
  // ST / CF
  return [
    'finishing',
    'offTheBall',
    'pace',
    'acceleration',
    'composure',
    'firstTouch',
    'anticipation',
    'jumpingReach',
    'stamina',
    'decisions',
    'dribbling',
  ];
}

export function rankRolesForPlayer(
  player: PlayerRecord,
  phase: 'In Possession' | 'Out of Possession'
): RankedRoleFit[] {
  const naturalRoles = getNaturalRolesForPlayer(player, phase);
  const pool =
    naturalRoles.length > 0
      ? naturalRoles
      : FM27_ROLES.filter((r) => r.phase === phase);

  return pool
    .map((role) => {
      const fitPct = scorePlayerForFm27Role(player, role);
      const tier: RankedRoleFit['tier'] =
        fitPct >= 68 ? 'Natural Fit' : fitPct >= 54 ? 'Solid' : 'Makeshift';

      const priorityValues: Array<{ label: string; value: number; isPrimary: boolean }> = [];
      for (const [snakeKey, pTier] of Object.entries(role.priorities || {})) {
        const camelKey = FM27_ROLE_ATTR_MAP[snakeKey];
        if (!camelKey) continue;
        const val = readRawAttr(player, camelKey);
        if (val === null) continue;
        priorityValues.push({
          label: ATTR_LABELS[camelKey] || camelKey,
          value: val,
          isPrimary: pTier === 'primary',
        });
      }

      const sortedDesc = [...priorityValues].sort((a, b) => b.value - a.value);
      const sortedAsc = [...priorityValues].sort((a, b) => a.value - b.value);

      return {
        role,
        fitPct,
        tier,
        topSupporting: sortedDesc.slice(0, 3).map(({ label, value }) => ({ label, value })),
        topLimiting: sortedAsc
          .filter((x) => x.value <= 10)
          .slice(0, 2)
          .map(({ label, value }) => ({ label, value })),
      };
    })
    .sort((a, b) => b.fitPct - a.fitPct);
}

export function evaluateDurability(player: PlayerRecord): DurabilityAssessment {
  const stamina = readRawAttr(player, 'stamina') ?? 10;
  const naturalFitness = readRawAttr(player, 'naturalFitness');
  const isInjuryProne = (player.scoutBadges || []).includes('Injury-Prone');
  const effectiveFit = naturalFitness ?? stamina;

  if (stamina >= 14 && effectiveFit >= 13 && !isInjuryProne) {
    return {
      stamina,
      naturalFitness,
      isInjuryProne,
      tier: 'Ironman',
      headline: 'Built for 90-minute double gameweeks',
      advice: `Stamina ${stamina}/20${naturalFitness ? ` and Natural Fitness ${naturalFitness}/20` : ''} let him press late and recover quickly between fixtures.`,
    };
  }
  if (stamina >= 11 && !isInjuryProne) {
    return {
      stamina,
      naturalFitness,
      isInjuryProne,
      tier: 'Reliable',
      headline: 'Comfortable 75–90 minute starter',
      advice: `Stamina ${stamina}/20${naturalFitness ? ` · Natural Fitness ${naturalFitness}/20` : ''}. Rotate during congested double-gameweek runs.`,
    };
  }
  if (stamina <= 7 || (isInjuryProne && stamina <= 10)) {
    return {
      stamina,
      naturalFitness,
      isInjuryProne,
      tier: 'Fragile',
      headline: 'Plan sub around 60–65\' or use as impact sub',
      advice: `Low Stamina (${stamina}/20)${isInjuryProne ? ' plus Injury-Prone flag' : ''} means he fades sharply after the hour mark.`,
    };
  }
  return {
    stamina,
    naturalFitness,
    isInjuryProne,
    tier: 'Manage Load',
    headline: 'Sub around 70\' in high-tempo games',
    advice: `Stamina ${stamina}/20${isInjuryProne ? ' (Injury-Prone)' : ''}. Manage minutes carefully when pressing high.`,
  };
}

export function evaluatePhysicalVerdict(
  player: PlayerRecord,
  squadPlayers: PlayerRecord[] = []
): PhysicalVerdictCard {
  const base = computeFm27EngineMetrics(player);
  const slot = classifyPositionSlot(player.position);
  const pace = readRawAttr(player, 'pace') ?? 10;
  const acc = readRawAttr(player, 'acceleration') ?? 10;
  const sta = readRawAttr(player, 'stamina') ?? 10;
  const jum = readRawAttr(player, 'jumpingReach') ?? 10;
  const hea = readRawAttr(player, 'heading') ?? 10;
  const agi = readRawAttr(player, 'agility') ?? 10;

  // Position-aware physical score (0-100) so agile/pacey attackers aren't unfairly crushed by Jumping Reach
  let weighted = 0;
  if (slot === 'DC') {
    weighted = jum * 1.6 + pace * 1.3 + acc * 1.1 + sta * 1.0;
  } else if (slot === 'GK') {
    weighted = agi * 1.8 + jum * 1.5 + acc * 0.9 + sta * 0.8;
  } else if (slot === 'AM_W' || slot === 'FB') {
    weighted = pace * 1.7 + acc * 1.7 + sta * 1.2 + agi * 0.4;
  } else if (slot === 'ST') {
    weighted = pace * 1.6 + acc * 1.6 + sta * 1.0 + jum * 0.8;
  } else {
    weighted = sta * 1.5 + pace * 1.3 + acc * 1.2 + jum * 1.0;
  }
  const score = Math.min(100, Math.max(10, Math.round(weighted)));
  const tier: PhysicalVerdictCard['tier'] =
    score >= 72 ? 'Elite' : score >= 58 ? 'Strong' : score >= 45 ? 'Average' : 'Below Par';

  const explanation =
    slot === 'DC'
      ? 'Weighted for centre-backs (Jumping Reach, Pace, Acceleration & Stamina).'
      : slot === 'GK'
        ? 'Weighted for goalkeepers (Agility, Jumping Reach & physical sharpness).'
        : slot === 'AM_W' || slot === 'FB'
          ? 'Weighted for wide runners (Pace, Acceleration & Stamina — not penalised for height).'
          : slot === 'ST'
            ? 'Weighted for forwards (Pace, Acceleration, Stamina & Aerial presence).'
            : 'Weighted for midfielders (Stamina, Pace, Acceleration & Duels).';

  const topSpeedKmh = Number((base.topSpeedMps * 3.6).toFixed(1));
  let speedVerdict =
    pace >= 15 || acc >= 15
      ? 'Explosive — stretches any defence'
      : pace >= 12
        ? 'Quick — handles transitions well'
        : pace >= 9
          ? 'Average pace — relies on positioning'
          : 'Slow — protect against balls in behind';

  if (squadPlayers.length >= 5) {
    const fasterCount = squadPlayers.filter(
      (p) => (p.attributes?.pace ?? 10) > pace
    ).length;
    const rankPct = Math.round(((squadPlayers.length - fasterCount) / squadPlayers.length) * 100);
    if (rankPct >= 85) {
      speedVerdict = `Top ${Math.max(5, 100 - rankPct)}% fastest in your squad`;
    } else if (rankPct <= 25) {
      speedVerdict = 'Bottom quarter for speed in your squad';
    }
  }

  const heightStr = player.heightCm ? `${player.heightCm} cm` : null;
  let aerialVerdict: string;
  if (jum >= 14) {
    aerialVerdict = `Dominant in the air${heightStr ? ` (${heightStr})` : ''} — primary set-piece target`;
  } else if (jum >= 10) {
    aerialVerdict = `Competitive aerially${heightStr ? ` (${heightStr})` : ''} (Heading ${hea}/20)`;
  } else {
    aerialVerdict = `Weak in the air${heightStr ? ` (${heightStr})` : ''} — keep passes to feet or into channels`;
  }

  return {
    score,
    tier,
    explanation,
    topSpeedMps: base.topSpeedMps,
    topSpeedKmh,
    speedVerdict,
    jumpHeightMeters: base.jumpHeightMeters,
    aerialVerdict,
    durability: evaluateDurability(player),
  };
}

export function evaluateSeasonProduction(
  player: PlayerRecord,
  squadPlayers: PlayerRecord[] = [],
  options?: SeasonStatsContextOptions
): SeasonProductionState {
  const hasPlayed =
    (player.minutes || 0) > 0 ||
    (Boolean(player.apps) && player.apps !== '0') ||
    (player.goals || 0) > 0 ||
    (player.assists || 0) > 0;

  if (!hasPlayed) {
    const squadHasAnyStats = squadPlayers.some(
      (p) =>
        (p.minutes || 0) > 0 ||
        (Boolean(p.apps) && p.apps !== '0') ||
        (p.goals || 0) > 0 ||
        (p.assists || 0) > 0
    );
    let mode: SeasonProductionState['mode'] = 'no_appearances';
    if (squadPlayers.length > 0 && !squadHasAnyStats) {
      if (options?.isFastSync === true) {
        mode = 'fast_sync_missing';
      } else if (options?.isFastSync === false) {
        mode =
          typeof options.playedMatchesCount === 'number' &&
          options.playedMatchesCount === 0
            ? 'preseason_no_matches'
            : 'stats_unavailable';
      } else {
        mode = 'fast_sync_missing';
      }
    }
    return {
      mode,
      hasPlayed: false,
      finishingNote: null,
      creationNote: null,
    };
  }

  let finishingNote: string | null = null;
  if (player.xG > 0.5) {
    const diff = player.goals - player.xG;
    if (diff >= 1.0) finishingNote = `Clinical — scoring +${diff.toFixed(1)} above xG`;
    else if (diff <= -1.0) finishingNote = `Cold finishing — ${diff.toFixed(1)} below xG`;
    else finishingNote = 'Finishing right in line with xG';
  }

  let creationNote: string | null = null;
  if (player.xA > 0.5) {
    const diff = player.assists - player.xA;
    if (diff >= 1.0) creationNote = 'Teammates converting his chances well';
    else if (diff <= -1.0) creationNote = 'Creating chances teammates are missing';
  }

  return {
    mode: 'has_stats',
    hasPlayed: true,
    finishingNote,
    creationNote,
  };
}

export function evaluateSquadDepth(
  player: PlayerRecord,
  squadPlayers: PlayerRecord[]
): SquadDepthContext | null {
  if (!squadPlayers || squadPlayers.length === 0) return null;
  const targetSlot = classifyPositionSlot(player.position);
  const slotLabels: Record<ReturnType<typeof classifyPositionSlot>, string> = {
    GK: 'Goalkeepers',
    DC: 'Centre-Backs',
    FB: 'Full-Backs / Wing-Backs',
    DM_MC: 'Central Midfielders',
    AM_W: 'Wingers / Attacking Mids',
    ST: 'Strikers',
  };

  const peers = squadPlayers
    .filter((p) => classifyPositionSlot(p.position) === targetSlot)
    .sort((a, b) => b.ability - a.ability || b.potential - a.potential);

  if (peers.length === 0) return null;

  const idx = peers.findIndex((p) => p.id === player.id);
  const rank = idx >= 0 ? idx + 1 : peers.length + 1;
  const bestTeammate = peers.find((p) => p.id !== player.id) || null;
  const label = slotLabels[targetSlot];

  return {
    positionLabel: label,
    rank,
    totalAtPosition: idx >= 0 ? peers.length : peers.length + 1,
    bestTeammate,
    summary:
      idx >= 0
        ? `#${rank} of ${peers.length} ${label} in your squad (by current ability)`
        : `Would rank #${rank} among your ${peers.length} ${label}`,
  };
}

export function evaluateContractStanding(player: PlayerRecord): ContractStandingInsight {
  const annualWage = Math.round((player.wagePw || 0) * 52);
  const monthsRemaining =
    typeof player.contractExpiryMonths === 'number' && Number.isFinite(player.contractExpiryMonths)
      ? player.contractExpiryMonths
      : null;

  const renewalRisk: ContractStandingInsight['renewalRisk'] =
    monthsRemaining !== null && monthsRemaining <= 6
      ? 'Expiring Soon'
      : monthsRemaining !== null && monthsRemaining <= 12
        ? 'Monitor'
        : 'Secure';

  const promisedPlayingTime = player.contractDetails?.promisedPlayingTime || null;
  let promiseMismatch: string | null = null;
  if (promisedPlayingTime) {
    const pLower = promisedPlayingTime.toLowerCase();
    const isHighPromise =
      pLower.includes('star') || pLower.includes('important') || pLower.includes('regular');
    if (isHighPromise && (player.status === 'Rotation' || player.status === 'Surplus')) {
      promiseMismatch = `Promised "${promisedPlayingTime}" in his contract, but currently listed as ${player.status} — morale risk if he doesn't start.`;
    }
  }

  return {
    annualWage,
    monthsRemaining,
    renewalRisk,
    promisedPlayingTime,
    promiseMismatch,
  };
}

export function evaluateDevelopmentAdvice(
  player: PlayerRecord,
  bestIpRole: RankedRoleFit | null
): DevelopmentAdvice {
  const headroom = Math.max(0, Number((player.potential - player.ability).toFixed(1)));
  const weakRoleAttrs = bestIpRole?.topLimiting.map((x) => x.label) || [];
  const stamina = readRawAttr(player, 'stamina') ?? 10;

  const trainingFocus: string[] = [...weakRoleAttrs];
  if (stamina <= 9 && !trainingFocus.includes('Stamina')) {
    trainingFocus.push('Stamina');
  }
  if (trainingFocus.length === 0) {
    trainingFocus.push('Role-specific tactical sharpness');
  }

  if (player.age <= 21 && headroom >= 1.0) {
    return {
      stage: 'High-Upside Prospect',
      headline: `Big growth window (+${headroom.toFixed(1)}★ upside)`,
      trainingFocus: trainingFocus.slice(0, 3),
      note: 'Prioritise regular competitive minutes (or a loan where he starts every week) to unlock his potential.',
    };
  }
  if (player.age <= 24 && headroom >= 0.5) {
    return {
      stage: 'Developing',
      headline: `Room to grow (+${headroom.toFixed(1)}★ upside)`,
      trainingFocus: trainingFocus.slice(0, 3),
      note: 'Still improving — focus individual training on his weakest key role attributes.',
    };
  }
  if (player.age >= 29) {
    return {
      stage: 'Experienced',
      headline: 'Experienced — focus on maintenance & mentoring',
      trainingFocus: ['Physical maintenance', 'Mentoring younger teammates'],
      note: 'Attributes are largely set; manage training intensity to protect pace and stamina.',
    };
  }
  return {
    stage: 'Peak Years',
    headline: 'In his prime — maximise matchday output',
    trainingFocus: trainingFocus.slice(0, 2),
    note: 'At or near peak ability; tailor tactical role to highlight his strongest traits.',
  };
}

export function analyzePlayerCard(
  player: PlayerRecord,
  squadPlayers: PlayerRecord[] = [],
  divisionBenchmarks?: DivisionBenchmarks | null,
  seasonStatsContext?: SeasonStatsContextOptions
): PlayerCardAnalysis {
  const topIpRoles = rankRolesForPlayer(player, 'In Possession');
  const topOopRoles = rankRolesForPlayer(player, 'Out of Possession');
  const defaults = resolveNaturalDefaultRoles(player);

  const bestIpRole =
    topIpRoles.find((r) => r.role.name === defaults.ipRole) || topIpRoles[0] || null;
  const bestOopRole =
    topOopRoles.find((r) => r.role.name === defaults.oopRole) || topOopRoles[0] || null;

  const relevantKeys = getPositionRelevantAttrKeys(player.position);
  const scoredAttrs = relevantKeys
    .map((key) => {
      const val = readRawAttr(player, key);
      if (val === null) return null;
      return {
        attrKey: String(key),
        label: ATTR_LABELS[String(key)] || String(key),
        value: val,
      };
    })
    .filter((x): x is { attrKey: string; label: string; value: number } => x !== null);

  // Calibrate strength & watchpoint floors to this club & division level (never hardcoded Premier League numbers)
  const posGrp =
    player.position.toUpperCase().includes('GK')
      ? 'GK'
      : /\b(ST|CF)\b/i.test(player.position)
        ? 'FWD'
        : /\b(DC|DL|DR|CB|WB)\b|D\s*\(/i.test(player.position)
          ? 'DEF'
          : 'MID';
  const divMedMap = divisionBenchmarks?.byPositionGroup?.[posGrp]?.medianAttributes;
  const benchmarkValues: number[] = [];
  if (divMedMap) {
    for (const key of relevantKeys) {
      const v = divMedMap[key];
      if (typeof v === 'number' && v > 0) benchmarkValues.push(v);
    }
  }
  if (benchmarkValues.length === 0 && squadPlayers.length >= 4) {
    const peerPool = squadPlayers.filter(
      (sp) => sp.teamSlot === undefined || sp.teamSlot === 0
    );
    const activePool = peerPool.length >= 4 ? peerPool : squadPlayers;
    for (const sp of activePool) {
      for (const key of relevantKeys) {
        const v = readRawAttr(sp, key);
        if (v !== null) benchmarkValues.push(v);
      }
    }
  }
  benchmarkValues.sort((a, b) => a - b);
  const baselineAttr =
    benchmarkValues.length > 0
      ? benchmarkValues[Math.floor(benchmarkValues.length / 2)]
      : 11;
  const strengthFloor = Math.max(10, Math.min(15, Math.round(baselineAttr + 1)));
  const watchpointCeiling = Math.max(7, Math.min(12, Math.round(baselineAttr - 2)));
  const levelLabel = divisionBenchmarks?.competitionName || 'squad level';

  const strengths: PlayerTraitInsight[] = [...scoredAttrs]
    .sort((a, b) => b.value - a.value)
    .filter((a) => a.value >= strengthFloor)
    .slice(0, 4)
    .map((item) => ({
      ...item,
      summary:
        STRENGTH_HINTS[item.attrKey] ||
        `Standout ${item.label.toLowerCase()} for ${levelLabel}`,
    }));

  const watchpoints: PlayerTraitInsight[] = [...scoredAttrs]
    .sort((a, b) => a.value - b.value)
    .filter((a) => a.value <= watchpointCeiling)
    .slice(0, 3)
    .map((item) => ({
      ...item,
      summary:
        WEAKNESS_HINTS[item.attrKey] ||
        `Below ${levelLabel} standard (${baselineAttr.toFixed(0)}/20) — cover tactically`,
    }));

  const physical = evaluatePhysicalVerdict(player, squadPlayers);
  const dnaWeights = loadPersistedClubDnaWeights() || DEFAULT_CLUB_DNA_WEIGHTS;
  const clubDna = evaluatePlayerClubDna(
    player.position,
    player.attributes,
    dnaWeights,
    divisionBenchmarks
  );
  const squadDepth = evaluateSquadDepth(player, squadPlayers);
  const development = evaluateDevelopmentAdvice(player, bestIpRole);
  const seasonProduction = evaluateSeasonProduction(
    player,
    squadPlayers,
    seasonStatsContext
  );
  const contractStanding = evaluateContractStanding(player);

  // Build concise, plain-English scouting verdict anchored to team & league level
  const topStrengthText =
    strengths.length >= 2
      ? `${strengths[0].label} (${strengths[0].value}) and ${strengths[1].label} (${strengths[1].value})`
      : strengths.length === 1
        ? `${strengths[0].label} (${strengths[0].value})`
        : `balanced attributes around your ${levelLabel} baseline (${Math.round(baselineAttr)}/20)`;

  const bestRoleText = bestIpRole
    ? `${bestIpRole.role.name} (${bestIpRole.fitPct}% fit)`
    : player.ipRole || player.position;

  const watchpointText =
    watchpoints.length > 0
      ? `Main watchpoint is ${watchpoints[0].label} (${watchpoints[0].value})${
          physical.durability.tier === 'Fragile'
            ? ', and low stamina means planning a sub around 60 minutes.'
            : '.'
        }`
      : physical.durability.tier === 'Fragile'
        ? 'Low stamina means he is best planned as a 60-minute starter or impact sub.'
        : 'No major attribute liabilities for his role.';

  const posGroup = getPositionGroup(player.position);
  const posWord =
    posGroup === 'GK'
      ? 'goalkeeper'
      : posGroup === 'DEF'
        ? 'defender'
        : posGroup === 'FWD'
          ? 'forward'
          : 'midfielder';

  const scoutingVerdict = `${player.ability.toFixed(1)}★ ${posWord} whose standout traits are ${topStrengthText}. Best deployed as a ${bestRoleText}. ${watchpointText}`;

  return {
    bestIpRole,
    bestOopRole,
    topIpRoles: topIpRoles.slice(0, 4),
    topOopRoles: topOopRoles.slice(0, 4),
    scoutingVerdict,
    strengths,
    watchpoints,
    physical,
    clubDna,
    squadDepth,
    development,
    seasonProduction,
    contractStanding,
  };
}
