import { PlayerRecord } from '../types/fm27';
import { RecruitmentTarget } from '../types/fmSave';
import {
  IN_POSSESSION_ROLES,
  doesPlayerMatchRolePositionGroup,
  scorePlayerForFm27Role,
} from './fm27RoleMatcher';

export type ScoutPositionGroup = 'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD';
export type ScoutAgeBand = 'ALL' | 'U23' | '23-28' | '29+';
export type ScoutContractFilter = 'ALL' | 'FREE' | 'LOAN' | 'EXPIRING';

export interface TargetAttributeChip {
  label: string;
  value: number;
}

export interface TargetRoleFit {
  roleName: string;
  fitPct: number;
}

export type ExactPositionSlot =
  | 'GK'
  | 'DL'
  | 'DR'
  | 'DC'
  | 'DM'
  | 'MC'
  | 'AML'
  | 'AMR'
  | 'AMC'
  | 'STC';

export interface TargetDepthEvaluation {
  slot: ExactPositionSlot;
  count: number;
  isGenuineGap: boolean;
  label: string;
}

export type PlaybookArchetypeName =
  | 'Goal Threat'
  | 'Wide Runner'
  | 'Midfield Runner/Organiser'
  | 'Defensive Organiser'
  | 'Flexible Full-Back'
  | 'Goalkeeper Standard';

export interface PlaybookArchetypeMatch {
  name: PlaybookArchetypeName;
  score: number;
  keyAttrs: string[];
  badgeTone: 'rose' | 'sky' | 'emerald' | 'amber' | 'indigo' | 'purple';
}

export interface TargetContractDisplay {
  primaryLabel: string;
  wageLabel: string | null;
  trialBadge: string | null;
}

export type MoneyballValueTier = 'Bargain' | 'Strong Value' | 'Fair' | 'Overpriced';

export interface MoneyballValueRating {
  score: number; // 0-100 zero-CA/PA value score
  tier: MoneyballValueTier;
  threeYearCostEur: number;
  costLabel: string;
  summary: string;
}

export interface EnrichedRecruitmentTarget {
  target: RecruitmentTarget;
  posGroup: Exclude<ScoutPositionGroup, 'ALL'>;
  bestRole: TargetRoleFit;
  archetype: PlaybookArchetypeMatch;
  relevantAttributes: TargetAttributeChip[];
  depth: TargetDepthEvaluation;
  contractDisplay: TargetContractDisplay;
  moneyball: MoneyballValueRating;
}

type PositionSlot = 'GK' | 'DC' | 'FB' | 'DM_MC' | 'AM_W' | 'ST';

export function classifyExactPositionSlot(position: string): ExactPositionSlot {
  const p = (position || '').toUpperCase().trim();
  if (!p) return 'MC';
  if (p.includes('GK')) return 'GK';
  if (/\bSTC\b|\bST\b|\bCF\b|ST\s*\(/i.test(p)) return 'STC';
  if (p.includes('AML') || p.includes('AM (L') || p.includes('ML') || p.includes('M (L')) {
    return 'AML';
  }
  if (p.includes('AMR') || p.includes('AM (R') || p.includes('MR') || p.includes('M (R')) {
    return 'AMR';
  }
  if (p.includes('AMC') || p.includes('AM (C')) {
    return 'AMC';
  }
  if (p.includes('DL') || p.includes('D (L') || p.includes('WBL') || p.includes('WB (L')) {
    return 'DL';
  }
  if (p.includes('DR') || p.includes('D (R') || p.includes('WBR') || p.includes('WB (R')) {
    return 'DR';
  }
  if (p.includes('DC') || p.includes('CB') || p.includes('D (C')) {
    return 'DC';
  }
  if (p.includes('DM')) {
    return 'DM';
  }
  if (p.includes('MC') || p.includes('M (C')) {
    return 'MC';
  }
  if (p.startsWith('D')) return 'DC';
  if (p.startsWith('A') || p.startsWith('F')) return 'STC';
  return 'MC';
}

export function classifyPositionSlot(position: string): PositionSlot {
  const p = (position || '').toUpperCase().trim();
  if (!p) return 'DM_MC';
  if (p.includes('GK')) return 'GK';
  if (/\bSTC\b|\bST\b|\bCF\b|ST\s*\(/i.test(p)) return 'ST';
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

export function buildScoutTargetPlayerRecord(target: RecruitmentTarget): PlayerRecord {
  const a = target.attributes || {};
  const attr = (key: keyof RecruitmentTarget['attributes'], fallback = 10): number => {
    const val = a[key];
    return typeof val === 'number' && Number.isFinite(val) && val > 0 ? val : fallback;
  };
  const exactSlot = classifyExactPositionSlot(target.primaryPosition);
  const slotKey = exactSlot === 'STC' ? 'ST' : exactSlot;
  const positionRatings: Record<string, number> = {
    ...(target.positionRatings || {}),
  };
  if (typeof positionRatings[slotKey] !== 'number') {
    positionRatings[slotKey] = 20;
  }
  if (exactSlot === 'STC' && typeof positionRatings.STC !== 'number') {
    positionRatings.STC = 20;
  }

  return {
    id: `scout-${target.uid}`,
    uid: target.uid,
    number: 0,
    name: target.name,
    position: target.primaryPosition || 'MC',
    secondaryPositions: Array.isArray(target.secondaryPositions)
      ? [...target.secondaryPositions]
      : undefined,
    apps: '0',
    minutes: 0,
    rating: null,
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
    personality: target.personality || 'Balanced',
    age: target.age,
    ability: 2.5,
    potential: 3.0,
    condition: 100,
    sharpness: 100,
    preferredFoot: target.preferredFoot || 'Right',
    heightCm: target.heightCm ?? undefined,
    expires:
      target.expires ||
      (target.isFreeAgent
        ? 'Unattached (Free Agent)'
        : `<= ${target.contractExpiryMonths || 6}m`),
    contractExpiryMonths: target.isFreeAgent ? 0 : target.contractExpiryMonths,
    contractDetails: target.contractDetails ?? undefined,
    nation: target.nationality || 'Unknown',
    wagePw: target.currentWagePw ?? target.demandedWageEur ?? 0,
    marketValue: target.transferValue ?? null,
    marketValueState: target.transferValueState,
    marketValueCapped: target.transferValueState === 'capped',
    status: 'Rotation',
    positionRatings,
    traits: Array.isArray(target.traits) ? [...target.traits] : [],
    scoutBadges: Array.isArray(target.scoutBadges) ? [...target.scoutBadges] : [],
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
  const adapter = buildScoutTargetPlayerRecord(target);
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

function getExactSlotFamiliarity(
  positionRatings: Record<string, number>,
  slot: ExactPositionSlot
): number {
  const upperMap = new Map<string, number>();
  for (const [k, v] of Object.entries(positionRatings)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      upperMap.set(k.toUpperCase(), v);
    }
  }
  if (slot === 'STC') {
    return Math.max(upperMap.get('STC') ?? 0, upperMap.get('ST') ?? 0, upperMap.get('CF') ?? 0);
  }
  if (slot === 'DC') {
    return Math.max(upperMap.get('DC') ?? 0, upperMap.get('CB') ?? 0);
  }
  return upperMap.get(slot) ?? 0;
}

/**
 * Counts how many senior/first-team club players have natural/accomplished familiarity (>= 15/20)
 * at the target's exact position slot (GK, DL, DR, DC, DM, MC, AML, AMR, AMC, STC).
 * Excludes Youth squad members so depth reflects genuine first-team cover.
 * Only flags `isGenuineGap: true` when exact-slot senior depth is <= 2.
 */
export function evaluateTargetSquadDepth(
  targetPosition: string,
  squadPlayers: PlayerRecord[]
): TargetDepthEvaluation {
  const exactSlot = classifyExactPositionSlot(targetPosition);
  const count = squadPlayers.filter((p) => {
    if (
      p.status === 'Youth' ||
      p.status === 'Surplus' ||
      /surplus/i.test(p.contractDetails?.promisedPlayingTime || '')
    ) {
      return false;
    }

    const hasRatings =
      p.positionRatings &&
      Object.values(p.positionRatings).some(
        (v) => typeof v === 'number' && Number.isFinite(v)
      );
    if (hasRatings && p.positionRatings) {
      return getExactSlotFamiliarity(p.positionRatings, exactSlot) >= 15;
    }

    if (classifyExactPositionSlot(p.position) === exactSlot) return true;
    const secondary = (p.secondaryPositions || [])
      .join(', ')
      .split(/[,/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return secondary.some((tok) => classifyExactPositionSlot(tok) === exactSlot);
  }).length;

  const isGenuineGap = count <= 2;
  return {
    slot: exactSlot,
    count,
    isGenuineGap,
    label: isGenuineGap
      ? `Priority GAP · ${count} at club`
      : `Depth: ${count} at club`,
  };
}

export interface PartitionedContractTerms {
  releaseClauses: Array<{ type: string; amount: number }>;
  bonuses: {
    appearanceFee: number | null;
    goalBonus: number | null;
    cleanSheetBonus: number | null;
    unusedSubFee: number | null;
  };
  loanWageContributionPct: number | null;
}

/**
 * Separates genuine Release Clauses from Match Bonuses (Appearance Fee, Goal Bonus,
 * Clean Sheet Bonus, Unused Sub Fee) so match bonuses never appear inside Release Clauses.
 */
export function partitionContractClausesAndBonuses(
  contractDetails?: PlayerRecord['contractDetails']
): PartitionedContractTerms {
  const bonuses = {
    appearanceFee: contractDetails?.bonuses?.appearanceFee ?? null,
    goalBonus: contractDetails?.bonuses?.goalBonus ?? null,
    cleanSheetBonus: contractDetails?.bonuses?.cleanSheetBonus ?? null,
    unusedSubFee: contractDetails?.bonuses?.unusedSubFee ?? null,
  };

  const releaseClauses: Array<{ type: string; amount: number }> = [];
  for (const rc of contractDetails?.releaseClauses || []) {
    const t = (rc.type || '').toLowerCase();
    if (/appearance/.test(t)) {
      if (!bonuses.appearanceFee && rc.amount > 0) bonuses.appearanceFee = rc.amount;
    } else if (/goal\s*bonus/.test(t)) {
      if (!bonuses.goalBonus && rc.amount > 0) bonuses.goalBonus = rc.amount;
    } else if (/clean\s*sheet/.test(t)) {
      if (!bonuses.cleanSheetBonus && rc.amount > 0) bonuses.cleanSheetBonus = rc.amount;
    } else if (/unused\s*sub/.test(t)) {
      if (!bonuses.unusedSubFee && rc.amount > 0) bonuses.unusedSubFee = rc.amount;
    } else {
      releaseClauses.push(rc);
    }
  }

  return {
    releaseClauses,
    bonuses,
    loanWageContributionPct:
      typeof contractDetails?.loanWageContributionPct === 'number'
        ? contractDetails.loanWageContributionPct
        : null,
  };
}

/**
 * Generates Playbook v2.0 contract notes flagging bloated Unused Sub fees
 * or low Release Clauses that require renegotiation.
 */
export function getPlaybookContractNotes(player: PlayerRecord): string[] {
  const notes: string[] = [];
  const { releaseClauses, bonuses } = partitionContractClausesAndBonuses(
    player.contractDetails
  );

  if (
    typeof bonuses.unusedSubFee === 'number' &&
    bonuses.unusedSubFee > 0 &&
    (bonuses.unusedSubFee >= 50 ||
      (player.wagePw > 0 && bonuses.unusedSubFee >= player.wagePw * 0.1))
  ) {
    notes.push(
      `Bloated Unused Sub Fee (£${bonuses.unusedSubFee.toLocaleString()}/match) — Playbook v2.0: strip or cap unused-sub bonuses in the next renewal to protect matchday cashflow.`
    );
  }

  for (const rc of releaseClauses) {
    if (rc.amount <= 0) continue;
    const belowMarket =
      typeof player.marketValue === 'number' &&
      player.marketValue > 0 &&
      rc.amount < player.marketValue * 0.85;
    const lowForKeyAsset =
      rc.amount <= 250000 && (player.ability >= 3.0 || player.potential >= 3.5);
    if (belowMarket || lowForKeyAsset) {
      notes.push(
        `Low Release Clause (${rc.type}: £${rc.amount.toLocaleString()}) — Playbook v2.0: renegotiate or remove before rival bids trigger it below true value.`
      );
    }
  }

  return notes;
}

/**
 * Scores a player or scouted target against Bobby Dean's Playbook v2.0 Section 7 Recruitment Archetypes:
 * - Goal Threat (ST: Fin/Com/Off/Pac or Jum)
 * - Wide Runner (AML/AMR: Pac/Acc/Off/Wor/Sta/Cro/Drb)
 * - Midfield Runner/Organiser (DM/MC: Sta/Wor/Dec/Pos/Fir/Pas)
 * - Defensive Organiser (DC: Pos/Ant/Con/Jum/Ldr)
 * - Flexible Full-Back (DL/DR: Tck/Pos/Sta/Pac/Acc/Pas)
 * - Goalkeeper Standard (GK: Natural GK + Agi/Ref)
 */
export function evaluatePlaybookArchetype(
  position: string,
  attributes: RecruitmentTarget['attributes'] | PlayerRecord['attributes']
): PlaybookArchetypeMatch {
  const raw = (attributes || {}) as Record<string, number | undefined>;
  const val = (key: string, ...fallbacks: string[]): number => {
    const direct = raw[key];
    if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) {
      return Math.min(20, Math.max(1, Math.round(direct)));
    }
    for (const fb of fallbacks) {
      const fv = raw[fb];
      if (typeof fv === 'number' && Number.isFinite(fv) && fv > 0) {
        return Math.min(20, Math.max(1, Math.round(fv)));
      }
    }
    return 10;
  };
  const pct = (nums: number[]): number =>
    Math.min(100, Math.max(0, Math.round((nums.reduce((s, n) => s + n, 0) / (nums.length * 20)) * 100)));

  const slot = classifyExactPositionSlot(position);

  if (slot === 'GK') {
    const agi = val('agility');
    const ref = val('reflexes', 'agility');
    return {
      name: 'Goalkeeper Standard',
      score: pct([agi, ref]),
      keyAttrs: ['Agi', 'Ref'],
      badgeTone: 'purple',
    };
  }

  if (slot === 'STC') {
    const fin = val('finishing');
    const com = val('composure', 'decisions', 'keyDecision');
    const off = val('offTheBall', 'anticipation');
    const pacOrJum = Math.max(val('pace', 'keyPace', 'acceleration'), val('jumpingReach'));
    return {
      name: 'Goal Threat',
      score: pct([fin, com, off, pacOrJum]),
      keyAttrs: ['Fin', 'Com', 'Off', 'Pac/Jum'],
      badgeTone: 'rose',
    };
  }

  if (slot === 'AML' || slot === 'AMR') {
    const pac = val('pace', 'keyPace', 'acceleration');
    const acc = val('acceleration', 'pace', 'keyPace');
    const off = val('offTheBall', 'vision', 'keyVision');
    const wor = val('workRate', 'determination');
    const sta = val('stamina', 'keyStamina');
    const cro = val('crossing', 'passing');
    const drb = val('dribbling', 'technique');
    return {
      name: 'Wide Runner',
      score: pct([pac, acc, off, wor, sta, cro, drb]),
      keyAttrs: ['Pac', 'Acc', 'Off', 'Wor', 'Sta', 'Cro', 'Drb'],
      badgeTone: 'sky',
    };
  }

  if (slot === 'DC') {
    const pos = val('positioning', 'decisions', 'keyDecision');
    const ant = val('anticipation', 'decisions', 'keyDecision');
    const con = val('concentration', 'determination');
    const jum = val('jumpingReach', 'strength');
    const ldr = val('leadership', 'teamwork');
    return {
      name: 'Defensive Organiser',
      score: pct([pos, ant, con, jum, ldr]),
      keyAttrs: ['Pos', 'Ant', 'Con', 'Jum', 'Ldr'],
      badgeTone: 'amber',
    };
  }

  if (slot === 'DL' || slot === 'DR') {
    const tck = val('tackling');
    const pos = val('positioning', 'decisions', 'keyDecision');
    const sta = val('stamina', 'keyStamina');
    const pac = val('pace', 'keyPace', 'acceleration');
    const acc = val('acceleration', 'pace', 'keyPace');
    const pas = val('passing', 'crossing');
    return {
      name: 'Flexible Full-Back',
      score: pct([tck, pos, sta, pac, acc, pas]),
      keyAttrs: ['Tck', 'Pos', 'Sta', 'Pac', 'Acc', 'Pas'],
      badgeTone: 'indigo',
    };
  }

  // DM, MC, AMC -> Midfield Runner/Organiser
  const sta = val('stamina', 'keyStamina');
  const wor = val('workRate', 'determination');
  const dec = val('decisions', 'keyDecision');
  const pos = val('positioning', 'decisions', 'keyDecision');
  const fir = val('firstTouch', 'technique');
  const pas = val('passing', 'vision', 'keyVision');
  return {
    name: 'Midfield Runner/Organiser',
    score: pct([sta, wor, dec, pos, fir, pas]),
    keyAttrs: ['Sta', 'Wor', 'Dec', 'Pos', 'Fir', 'Pas'],
    badgeTone: 'emerald',
  };
}

/**
 * Finds our current top-rated senior player at the exact position slot for 1-tap "Compare vs Starter".
 * Excludes Youth squad members. Prefers natural/accomplished familiarity at the exact slot,
 * falling back to the same position group only if no exact-slot senior exists.
 */
export function findTopSeniorStarterForPosition(
  targetPosition: string,
  squadPlayers: PlayerRecord[]
): PlayerRecord | null {
  const seniors = squadPlayers.filter(
    (p) =>
      p.status !== 'Youth' &&
      p.status !== 'Surplus' &&
      !/surplus/i.test(p.contractDetails?.promisedPlayingTime || '')
  );
  if (seniors.length === 0) return null;

  const exactSlot = classifyExactPositionSlot(targetPosition);

  const exactMatches = seniors.filter((p) => {
    const hasRatings =
      p.positionRatings &&
      Object.values(p.positionRatings).some(
        (v) => typeof v === 'number' && Number.isFinite(v)
      );
    if (hasRatings && p.positionRatings) {
      return getExactSlotFamiliarity(p.positionRatings, exactSlot) >= 15;
    }
    if (classifyExactPositionSlot(p.position) === exactSlot) return true;
    const secondary = (p.secondaryPositions || [])
      .join(', ')
      .split(/[,/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return secondary.some((tok) => classifyExactPositionSlot(tok) === exactSlot);
  });

  const targetGroup = getPositionGroup(targetPosition);
  const pool =
    exactMatches.length > 0
      ? exactMatches
      : seniors.filter((p) => getPositionGroup(p.position) === targetGroup);

  if (pool.length === 0) return null;

  return [...pool].sort((a, b) => {
    if (b.ability !== a.ability) return b.ability - a.ability;
    const rA = typeof a.rating === 'number' ? a.rating : 0;
    const rB = typeof b.rating === 'number' ? b.rating : 0;
    if (rB !== rA) return rB - rA;
    return (b.minutes || 0) - (a.minutes || 0);
  })[0];
}

export interface CompareAttributeDelta {
  label: string;
  key: string;
  targetVal: number;
  starterVal: number;
  delta: number;
}

export interface TargetVsStarterComparison {
  target: RecruitmentTarget;
  starter: PlayerRecord;
  archetype: PlaybookArchetypeMatch;
  starterArchetype: PlaybookArchetypeMatch;
  radarAxes: CompareAttributeDelta[];
  ageDelta: number; // target.age - starter.age (negative = younger)
  wageDelta: number; // target.demandedWageEur - starter.wagePw (negative = cheaper)
}

export function buildTargetVsStarterComparison(
  target: RecruitmentTarget,
  starter: PlayerRecord
): TargetVsStarterComparison {
  const slot = classifyExactPositionSlot(target.primaryPosition);
  const tAttrs = buildScoutTargetPlayerRecord(target).attributes as Record<string, number | undefined>;
  const sAttrs = starter.attributes as Record<string, number | undefined>;
  const getVal = (obj: Record<string, number | undefined>, key: string): number => {
    const v = obj[key];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 10;
  };

  let axisDefs: Array<{ label: string; key: string }>;
  if (slot === 'GK') {
    axisDefs = [
      { label: 'Ref', key: 'reflexes' },
      { label: 'Agi', key: 'agility' },
      { label: 'Han', key: 'handling' },
      { label: 'Aer', key: 'aerialReach' },
      { label: 'Pos', key: 'positioning' },
      { label: '1v1', key: 'oneOnOnes' },
    ];
  } else if (slot === 'DC') {
    axisDefs = [
      { label: 'Pos', key: 'positioning' },
      { label: 'Ant', key: 'anticipation' },
      { label: 'Con', key: 'concentration' },
      { label: 'Jum', key: 'jumpingReach' },
      { label: 'Tck', key: 'tackling' },
      { label: 'Ldr', key: 'leadership' },
    ];
  } else if (slot === 'DL' || slot === 'DR') {
    axisDefs = [
      { label: 'Tck', key: 'tackling' },
      { label: 'Pos', key: 'positioning' },
      { label: 'Sta', key: 'stamina' },
      { label: 'Pac', key: 'pace' },
      { label: 'Acc', key: 'acceleration' },
      { label: 'Pas', key: 'passing' },
    ];
  } else if (slot === 'AML' || slot === 'AMR') {
    axisDefs = [
      { label: 'Pac', key: 'pace' },
      { label: 'Acc', key: 'acceleration' },
      { label: 'Off', key: 'offTheBall' },
      { label: 'Sta', key: 'stamina' },
      { label: 'Cro', key: 'crossing' },
      { label: 'Drb', key: 'dribbling' },
    ];
  } else if (slot === 'STC') {
    axisDefs = [
      { label: 'Fin', key: 'finishing' },
      { label: 'Com', key: 'composure' },
      { label: 'Off', key: 'offTheBall' },
      { label: 'Pac', key: 'pace' },
      { label: 'Jum', key: 'jumpingReach' },
      { label: 'Fir', key: 'firstTouch' },
    ];
  } else {
    axisDefs = [
      { label: 'Sta', key: 'stamina' },
      { label: 'Wor', key: 'workRate' },
      { label: 'Dec', key: 'decisions' },
      { label: 'Pos', key: 'positioning' },
      { label: 'Fir', key: 'firstTouch' },
      { label: 'Pas', key: 'passing' },
    ];
  }

  const radarAxes: CompareAttributeDelta[] = axisDefs.map(({ label, key }) => {
    const targetVal = getVal(tAttrs, key);
    const starterVal = getVal(sAttrs, key);
    return {
      label,
      key,
      targetVal,
      starterVal,
      delta: targetVal - starterVal,
    };
  });

  return {
    target,
    starter,
    archetype: evaluatePlaybookArchetype(target.primaryPosition, target.attributes),
    starterArchetype: evaluatePlaybookArchetype(target.primaryPosition, starter.attributes),
    radarAxes,
    ageDelta: target.age - starter.age,
    wageDelta: (target.demandedWageEur || 0) - (starter.wagePw || 0),
  };
}

export function formatTargetContractSummary(
  target: RecruitmentTarget
): TargetContractDisplay {
  if (target.isFreeAgent) {
    return {
      primaryLabel: 'Unattached · Free Transfer',
      wageLabel: null,
      trialBadge: '2-Week Free Trial',
    };
  }
  if (target.isLoanCandidate) {
    const estShare = target.demandedWageEur || 0;
    const parentWage = target.parentClubWagePw || 0;
    const wageLabel =
      estShare > 0
        ? parentWage > estShare
          ? `~£${estShare.toLocaleString()}/wk share (of £${parentWage.toLocaleString()})`
          : `~£${estShare.toLocaleString()}/wk share`
        : '£0–30% Wage Share';
    return {
      primaryLabel: `Loan Candidate · ${target.currentClub || 'Parent Club'}`,
      wageLabel,
      trialBadge: '£0 Loan Fee Target',
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
    trialBadge: null,
  };
}

export function matchesAgeBand(age: number, band: ScoutAgeBand): boolean {
  if (band === 'ALL') return true;
  if (band === 'U23') return age <= 22;
  if (band === '23-28') return age >= 23 && age <= 28;
  return age >= 29;
}

/**
 * Computes a zero-CA/PA Moneyball Value Score (0-100) comparing FM27 role fit,
 * playbook archetype fit, and age curve against 3-year (or 1-season loan) wage commitment
 * calibrated to the current squad's median weekly wage.
 */
export function computeMoneyballValueScore(params: {
  target: RecruitmentTarget;
  bestRoleFitPct: number;
  archetypeScore: number;
  squadPlayers: PlayerRecord[];
}): MoneyballValueRating {
  const { target, bestRoleFitPct, archetypeScore, squadPlayers } = params;
  const weeklyWage = Math.max(0, target.demandedWageEur || 0);
  const weeksMultiplier = target.isLoanCandidate ? 44 : 156;
  const threeYearCostEur = Math.round(weeklyWage * weeksMultiplier);

  const squadWages = squadPlayers
    .map((p) => p.wagePw || 0)
    .filter((w) => w > 0)
    .sort((a, b) => a - b);
  const medianSquadWage =
    squadWages.length > 0
      ? squadWages[Math.floor(squadWages.length / 2)]
      : 1000;

  // Age curve: U23 carries resale/growth upside, 23-28 peak, 29+ depreciating
  const ageBonus =
    target.age <= 22 ? 92 : target.age <= 26 ? 82 : target.age <= 29 ? 68 : 48;

  const qualityScore =
    bestRoleFitPct * 0.55 + archetypeScore * 0.25 + ageBonus * 0.2;

  // Relative wage ratio vs squad median (free agents, loans, and Bosmans have £0 transfer fee)
  const wageRatio = weeklyWage > 0 ? weeklyWage / Math.max(180, medianSquadWage) : 0.35;
  const costPenalty = Math.max(0, (wageRatio - 1.0) * 22);
  const contractTypeBonus = target.isFreeAgent
    ? 6
    : target.isLoanCandidate
      ? 5
      : target.contractExpiryMonths <= 6
        ? 4
        : 0;

  const score = Math.max(
    0,
    Math.min(100, Math.round(qualityScore + contractTypeBonus - costPenalty))
  );

  const tier: MoneyballValueTier =
    score >= 78
      ? 'Bargain'
      : score >= 65
        ? 'Strong Value'
        : score >= 50
          ? 'Fair'
          : 'Overpriced';

  const periodSuffix = target.isLoanCandidate ? '/ 1y loan' : '/ 3y';
  const costLabel =
    threeYearCostEur >= 1_000_000
      ? `£${(threeYearCostEur / 1_000_000).toFixed(2)}M ${periodSuffix}`
      : threeYearCostEur > 0
        ? `£${Math.round(threeYearCostEur / 1000)}k ${periodSuffix}`
        : target.isLoanCandidate
          ? '0% Wage Loan'
          : 'Trial / Low Wage';

  const summary = `${tier} (${score}/100) · ${costLabel}`;
  return { score, tier, threeYearCostEur, costLabel, summary };
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

  const enriched: EnrichedRecruitmentTarget[] = targets.map((target) => {
    const bestRole = computeTargetBestRoleFit(target);
    const archetype = evaluatePlaybookArchetype(target.primaryPosition, target.attributes);
    return {
      target,
      posGroup: getPositionGroup(target.primaryPosition),
      bestRole,
      archetype,
      relevantAttributes: getPositionRelevantAttributes(target),
      depth: evaluateTargetSquadDepth(target.primaryPosition, squadPlayers),
      contractDisplay: formatTargetContractSummary(target),
      moneyball: computeMoneyballValueScore({
        target,
        bestRoleFitPct: bestRole.fitPct,
        archetypeScore: archetype.score,
        squadPlayers,
      }),
    };
  });

  const filtered = enriched.filter((item) => {
    if (posGroup !== 'ALL' && item.posGroup !== posGroup) return false;
    if (!matchesAgeBand(item.target.age, ageBand)) return false;
    if (contractFilter === 'FREE' && !item.target.isFreeAgent) return false;
    if (contractFilter === 'LOAN' && !item.target.isLoanCandidate) return false;
    if (
      contractFilter === 'EXPIRING' &&
      (item.target.isFreeAgent || item.target.isLoanCandidate)
    ) {
      return false;
    }
    if (genuineGapsOnly && !item.depth.isGenuineGap) return false;
    if (q) {
      const hay =
        `${item.target.name} ${item.target.primaryPosition} ${item.target.nationality} ${item.target.currentClub || ''} ${item.bestRole.roleName} ${item.archetype.name} ${item.target.isLoanCandidate ? 'loan' : ''}`.toLowerCase();
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
