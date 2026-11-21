import { PlayerRecord } from '../types/fm27';
import { RecruitmentTarget } from '../types/fmSave';
import {
  IN_POSSESSION_ROLES,
  doesPlayerMatchRolePositionGroup,
  scorePlayerForFm27Role,
} from './fm27RoleMatcher';

export type ScoutPositionGroup = 'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD';
export type ScoutAgeBand = 'ALL' | 'U23' | '23-28' | '29+';
export type ScoutContractFilter = 'ALL' | 'FREE' | 'EXPIRING';

export interface TargetAttributeChip {
  label: string;
  value: number;
}

export interface TargetRoleFit {
  roleName: string;
  fitPct: number;
}

export interface TargetDepthEvaluation {
  count: number;
  isGenuineGap: boolean;
  label: string;
}

export interface TargetContractDisplay {
  primaryLabel: string;
  wageLabel: string | null;
}

export interface EnrichedRecruitmentTarget {
  target: RecruitmentTarget;
  posGroup: Exclude<ScoutPositionGroup, 'ALL'>;
  bestRole: TargetRoleFit;
  relevantAttributes: TargetAttributeChip[];
  depth: TargetDepthEvaluation;
  contractDisplay: TargetContractDisplay;
}

type PositionSlot = 'GK' | 'DC' | 'FB' | 'DM_MC' | 'AM_W' | 'ST';

export function classifyPositionSlot(position: string): PositionSlot {
  const p = (position || '').toUpperCase().trim();
  if (!p) return 'DM_MC';
  if (p.includes('GK')) return 'GK';
  if (/\bST\b|\bCF\b|ST\s*\(/i.test(p)) return 'ST';
  if (
    p.includes('AML') ||
    p.includes('AMR') ||
    p.includes('AMC') ||
    p.includes('AM (') ||
    p.includes('ML') ||
    p.includes('MR') ||
    p.includes('M (L') ||
    p.includes('M (R') ||
    p.includes('M/AM')
  ) {
    return 'AM_W';
  }
  if (
    p.includes('WB') ||
    p.includes('DL') ||
    p.includes('DR') ||
    p.includes('D (L') ||
    p.includes('D (R') ||
    p.includes('D/WB') ||
    p.includes('FB')
  ) {
    return 'FB';
  }
  if (p.includes('DC') || p.includes('CB') || p.includes('D (C')) {
    return 'DC';
  }
  if (p.includes('DM') || p.includes('MC') || p.includes('M (C')) {
    return 'DM_MC';
  }
  if (p.startsWith('D')) return 'DC';
  if (p.startsWith('M')) return 'DM_MC';
  if (p.startsWith('A') || p.startsWith('F')) return 'ST';
  return 'DM_MC';
}

export function getPositionGroup(position: string): Exclude<ScoutPositionGroup, 'ALL'> {
  const slot = classifyPositionSlot(position);
  if (slot === 'GK') return 'GK';
  if (slot === 'DC' || slot === 'FB') return 'DEF';
  if (slot === 'ST') return 'FWD';
  return 'MID';
}

function readTargetAttr(
  target: RecruitmentTarget,
  primaryKey: keyof RecruitmentTarget['attributes'],
  fallbackKeys: Array<keyof RecruitmentTarget['attributes']> = []
): number {
  const attrs = target.attributes || {};
  const direct = attrs[primaryKey];
  if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) {
    return Math.min(20, Math.max(1, Math.round(direct)));
  }
  for (const fk of fallbackKeys) {
    const val = attrs[fk];
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      return Math.min(20, Math.max(1, Math.round(val)));
    }
  }
  return 10;
}

/**
 * Returns 4 position-relevant visible attributes for a scouted target card.
 * - GK: Ref, Han, Aer, Pos
 * - DC: Tck, Mar, Pos, Jum
 * - FB/WB: Pac, Sta, Tck, Cro
 * - DM/MC: Pas, Dec, Wor, Sta
 * - AM/W: Pac, Drb, Off, Pas
 * - ST: Fin, Off, Pac, Com
 */
export function getPositionRelevantAttributes(
  target: RecruitmentTarget
): TargetAttributeChip[] {
  const slot = classifyPositionSlot(target.primaryPosition);

  if (slot === 'GK') {
    return [
      { label: 'Ref', value: readTargetAttr(target, 'reflexes', ['agility']) },
      { label: 'Han', value: readTargetAttr(target, 'handling', ['firstTouch']) },
      { label: 'Aer', value: readTargetAttr(target, 'aerialReach', ['jumpingReach']) },
      { label: 'Pos', value: readTargetAttr(target, 'positioning', ['decisions', 'keyDecision']) },
    ];
  }

  if (slot === 'DC') {
    return [
      { label: 'Tck', value: readTargetAttr(target, 'tackling') },
      { label: 'Mar', value: readTargetAttr(target, 'marking', ['tackling']) },
      { label: 'Pos', value: readTargetAttr(target, 'positioning', ['decisions', 'keyDecision']) },
      { label: 'Jum', value: readTargetAttr(target, 'jumpingReach', ['strength']) },
    ];
  }

  if (slot === 'FB') {
    return [
      { label: 'Pac', value: readTargetAttr(target, 'pace', ['keyPace', 'acceleration']) },
      { label: 'Sta', value: readTargetAttr(target, 'stamina', ['keyStamina']) },
      { label: 'Tck', value: readTargetAttr(target, 'tackling') },
      { label: 'Cro', value: readTargetAttr(target, 'crossing', ['passing']) },
    ];
  }

  if (slot === 'DM_MC') {
    return [
      { label: 'Pas', value: readTargetAttr(target, 'passing', ['vision', 'keyVision']) },
      { label: 'Dec', value: readTargetAttr(target, 'decisions', ['keyDecision']) },
      { label: 'Wor', value: readTargetAttr(target, 'workRate', ['determination']) },
      { label: 'Sta', value: readTargetAttr(target, 'stamina', ['keyStamina']) },
    ];
  }

  if (slot === 'AM_W') {
    return [
      { label: 'Pac', value: readTargetAttr(target, 'pace', ['keyPace', 'acceleration']) },
      { label: 'Drb', value: readTargetAttr(target, 'dribbling', ['technique', 'firstTouch']) },
      { label: 'Off', value: readTargetAttr(target, 'offTheBall', ['vision', 'keyVision']) },
      { label: 'Pas', value: readTargetAttr(target, 'passing', ['crossing']) },
    ];
  }

  // ST / CF
  return [
    { label: 'Fin', value: readTargetAttr(target, 'finishing') },
    { label: 'Off', value: readTargetAttr(target, 'offTheBall', ['anticipation']) },
    { label: 'Pac', value: readTargetAttr(target, 'pace', ['keyPace', 'acceleration']) },
    { label: 'Com', value: readTargetAttr(target, 'composure', ['decisions', 'keyDecision']) },
  ];
}

function buildAdapterPlayerRecord(target: RecruitmentTarget): PlayerRecord {
  const a = target.attributes || {};
  const attr = (key: keyof RecruitmentTarget['attributes'], fallback = 10): number => {
    const val = a[key];
    return typeof val === 'number' && Number.isFinite(val) && val > 0 ? val : fallback;
  };

  return {
    id: `scout-${target.uid}`,
    uid: target.uid,
    number: 0,
    name: target.name,
    position: target.primaryPosition || 'MC',
    apps: '0',
    minutes: 0,
    rating: 0,
    goals: 0,
    xG: 0,
    xGPer90: 0,
    assists: 0,
    xA: 0,
    xAPer90: 0,
    drbPer90: 0,
    prPassesPer90: 0,
    hdrPct: 0,
    intPer90: 0,
    tckPct: 0,
    personality: 'Balanced',
    age: target.age,
    ability: 2.5,
    potential: 3.0,
    condition: 100,
    sharpness: 100,
    preferredFoot: 'Right',
    expires: target.expires || '',
    nation: target.nationality || 'Unknown',
    wagePw: target.demandedWageEur || 0,
    status: 'Rotation',
    attributes: {
      pace: attr('pace', attr('keyPace', 10)),
      acceleration: attr('acceleration', attr('pace', attr('keyPace', 10))),
      stamina: attr('stamina', attr('keyStamina', 10)),
      strength: attr('strength', 10),
      agility: attr('agility', 10),
      balance: attr('balance', 10),
      jumpingReach: attr('jumpingReach', 10),
      naturalFitness: attr('naturalFitness', 11),
      determination: attr('determination', 10),
      passing: attr('passing', 10),
      finishing: attr('finishing', 10),
      tackling: attr('tackling', 10),
      marking: attr('marking', attr('tackling', 10)),
      firstTouch: attr('firstTouch', 10),
      technique: attr('technique', 10),
      dribbling: attr('dribbling', 10),
      crossing: attr('crossing', 10),
      heading: attr('heading', 10),
      longShots: attr('longShots', 10),
      decisions: attr('decisions', attr('keyDecision', 10)),
      vision: attr('vision', attr('keyVision', 10)),
      workRate: attr('workRate', 10),
      offTheBall: attr('offTheBall', 10),
      positioning: attr('positioning', 10),
      anticipation: attr('anticipation', 10),
      composure: attr('composure', 10),
      concentration: attr('concentration', 10),
      teamwork: attr('teamwork', 10),
      flair: attr('flair', 10),
      bravery: attr('bravery', 10),
      aggression: attr('aggression', 10),
      leadership: attr('leadership', 10),
      reflexes: attr('reflexes', 10),
      handling: attr('handling', 10),
      aerialReach: attr('aerialReach', attr('jumpingReach', 10)),
      commandOfArea: attr('commandOfArea', 10),
      communication: attr('communication', 10),
      oneOnOnes: attr('oneOnOnes', 10),
      kicking: attr('kicking', 10),
      throwing: attr('throwing', 10),
      rushingOut: attr('rushingOut', 10),
      punching: attr('punching', 10),
      eccentricity: attr('eccentricity', 10),
      corners: attr('corners', 8),
      freeKicks: attr('freeKicks', 8),
      penalties: attr('penalties', 8),
      longThrows: attr('longThrows', 8),
    },
    ipRole: '',
    oopRole: '',
    notes: '',
  };
}

/**
 * Computes the Best FM27 In-Possession Role and Fit % for a scouted target
 * using the canonical fm27RoleMatcher engine.
 */
export function computeTargetBestRoleFit(target: RecruitmentTarget): TargetRoleFit {
  const adapter = buildAdapterPlayerRecord(target);
  const matchingRoles = IN_POSSESSION_ROLES.filter((role) =>
    doesPlayerMatchRolePositionGroup(adapter.position, adapter.secondaryPositions, role.positionGroup)
  );
  const pool = matchingRoles.length > 0 ? matchingRoles : IN_POSSESSION_ROLES;

  let bestRole = pool[0]?.name || 'Central Midfielder';
  let bestScore = -1;

  for (const role of pool) {
    const score = scorePlayerForFm27Role(adapter, role);
    if (score > bestScore) {
      bestScore = score;
      bestRole = role.name;
    }
  }

  return {
    roleName: bestRole,
    fitPct: bestScore > 0 ? bestScore : 50,
  };
}

/**
 * Counts how many active club players can cover the target's position slot.
 * Only flags `isGenuineGap: true` when the club genuinely has <= 2 options.
 * When the club has 3+ options (e.g. 6), returns a neutral non-gap label.
 */
export function evaluateTargetSquadDepth(
  targetPosition: string,
  squadPlayers: PlayerRecord[]
): TargetDepthEvaluation {
  const targetSlot = classifyPositionSlot(targetPosition);
  const count = squadPlayers.filter((p) => {
    const allPos = [p.position, ...(p.secondaryPositions || [])]
      .filter(Boolean)
      .join(', ');
    if (classifyPositionSlot(p.position) === targetSlot) return true;
    // Also check secondary positions for exact slot coverage
    const tokens = allPos
      .split(/[,/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return tokens.some((tok) => classifyPositionSlot(tok) === targetSlot);
  }).length;

  const isGenuineGap = count <= 2;
  return {
    count,
    isGenuineGap,
    label: isGenuineGap
      ? `Priority GAP · ${count} at club`
      : `Depth: ${count} at club`,
  };
}

export function formatTargetContractSummary(
  target: RecruitmentTarget
): TargetContractDisplay {
  if (target.isFreeAgent) {
    return {
      primaryLabel: 'Unattached · Free Transfer',
      wageLabel: null,
    };
  }
  const months = target.contractExpiryMonths > 0 ? target.contractExpiryMonths : 6;
  const wageLabel =
    target.demandedWageEur > 0
      ? `£${target.demandedWageEur.toLocaleString()}/wk`
      : null;
  return {
    primaryLabel: `Expiring <= ${months}m`,
    wageLabel,
  };
}

export function matchesAgeBand(age: number, band: ScoutAgeBand): boolean {
  if (band === 'ALL') return true;
  if (band === 'U23') return age <= 22;
  if (band === '23-28') return age >= 23 && age <= 28;
  return age >= 29;
}

export function enrichAndFilterScoutedTargets(params: {
  targets: RecruitmentTarget[];
  squadPlayers: PlayerRecord[];
  posGroup: ScoutPositionGroup;
  ageBand: ScoutAgeBand;
  contractFilter: ScoutContractFilter;
  genuineGapsOnly: boolean;
  searchQuery: string;
}): EnrichedRecruitmentTarget[] {
  const {
    targets,
    squadPlayers,
    posGroup,
    ageBand,
    contractFilter,
    genuineGapsOnly,
    searchQuery,
  } = params;
  const q = searchQuery.trim().toLowerCase();

  const enriched: EnrichedRecruitmentTarget[] = targets.map((target) => ({
    target,
    posGroup: getPositionGroup(target.primaryPosition),
    bestRole: computeTargetBestRoleFit(target),
    relevantAttributes: getPositionRelevantAttributes(target),
    depth: evaluateTargetSquadDepth(target.primaryPosition, squadPlayers),
    contractDisplay: formatTargetContractSummary(target),
  }));

  const filtered = enriched.filter((item) => {
    if (posGroup !== 'ALL' && item.posGroup !== posGroup) return false;
    if (!matchesAgeBand(item.target.age, ageBand)) return false;
    if (contractFilter === 'FREE' && !item.target.isFreeAgent) return false;
    if (contractFilter === 'EXPIRING' && item.target.isFreeAgent) return false;
    if (genuineGapsOnly && !item.depth.isGenuineGap) return false;
    if (q) {
      const hay =
        `${item.target.name} ${item.target.primaryPosition} ${item.target.nationality} ${item.target.currentClub || ''} ${item.bestRole.roleName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Default sort: Fills Genuine Gap first, then Role Fit % desc, then younger age first
  filtered.sort((a, b) => {
    if (a.depth.isGenuineGap !== b.depth.isGenuineGap) {
      return a.depth.isGenuineGap ? -1 : 1;
    }
    if (b.bestRole.fitPct !== a.bestRole.fitPct) {
      return b.bestRole.fitPct - a.bestRole.fitPct;
    }
    return a.target.age - b.target.age;
  });

  return filtered;
}
