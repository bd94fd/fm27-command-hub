/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Plan 2: Dual-Phase (In-Possession / Out-of-Possession) Role Engine &
 * FM27 Tactical Effectiveness Training Planner.
 *
 * Role formula and Touchline catalog adapted from Malm4l/SaveRay (MIT License).
 * Tactical Effectiveness 4-area / 17-factor model inspired by SemHiel2003/fm27-trainer (MIT License).
 */

import rolesCatalogJson from '../data/fm27RolesTouchline.json';
import { PlayerRecord } from '../types/fm27';

export type PossessionPhase = 'in' | 'out';

export interface TouchlineRoleDefinition {
  name: string;
  phase: PossessionPhase;
  position_groups: string[];
  priority: string[];
  supporting: string[];
}

export interface DualPhaseRoleScore {
  name: string;
  phase: PossessionPhase;
  fit: number; // 0-100 attribute fit
  overall: number | null; // fit * (0.6 + 0.4 * posRating/20) when eligible
  position: string | null;
  positionRating: number | null;
  eligible: boolean;
}

export interface DualPhasePlayerProfile {
  bestInPossession: DualPhaseRoleScore | null;
  bestOutOfPossession: DualPhaseRoleScore | null;
  topInPossession: DualPhaseRoleScore[];
  topOutOfPossession: DualPhaseRoleScore[];
}

const GROUP_TO_POSITIONS: Record<string, string[]> = {
  Goalkeeper: ['GK'],
  'Centre-back': ['DC'],
  'Wide centre-back': ['DC'],
  'Full-back': ['DL', 'DR'],
  'Wing-back': ['WBL', 'WBR'],
  'Defensive midfield': ['DM'],
  'Central midfield': ['MC'],
  'Attacking midfield': ['AMC'],
  'Wide midfield': ['ML', 'MR'],
  'Wide attack': ['AML', 'AMR'],
  Striker: ['STC'],
};

const MIN_POSITION_RATING = 15;

/**
 * Maps Touchline display attribute names to PlayerRecord['attributes'] camelCase keys.
 */
const ATTR_DISPLAY_TO_KEY: Record<string, keyof PlayerRecord['attributes']> = {
  'Aerial Reach': 'aerialReach',
  'Command of Area': 'commandOfArea',
  Communication: 'communication',
  Eccentricity: 'eccentricity',
  Handling: 'handling',
  Kicking: 'kicking',
  'One on Ones': 'oneOnOnes',
  'Punching (Tendency)': 'punching',
  Punching: 'punching',
  Reflexes: 'reflexes',
  'Rushing Out (Tendency)': 'rushingOut',
  'Rushing Out': 'rushingOut',
  Throwing: 'throwing',
  Corners: 'corners',
  Crossing: 'crossing',
  Dribbling: 'dribbling',
  Finishing: 'finishing',
  'First Touch': 'firstTouch',
  'Free Kick Taking': 'freeKicks',
  Heading: 'heading',
  'Long Shots': 'longShots',
  'Long Throws': 'longThrows',
  Marking: 'marking',
  Passing: 'passing',
  'Penalty Taking': 'penalties',
  Tackling: 'tackling',
  Technique: 'technique',
  Aggression: 'aggression',
  Anticipation: 'anticipation',
  Bravery: 'bravery',
  Composure: 'composure',
  Concentration: 'concentration',
  Decisions: 'decisions',
  Determination: 'determination',
  Flair: 'flair',
  Leadership: 'leadership',
  'Off the Ball': 'offTheBall',
  Positioning: 'positioning',
  Teamwork: 'teamwork',
  Vision: 'vision',
  'Work Rate': 'workRate',
  Acceleration: 'acceleration',
  Agility: 'agility',
  Balance: 'balance',
  'Jumping Reach': 'jumpingReach',
  'Natural Fitness': 'naturalFitness',
  Pace: 'pace',
  Stamina: 'stamina',
  Strength: 'strength',
};

export const FM27_TOUCHLINE_ROLES: TouchlineRoleDefinition[] = (
  rolesCatalogJson as { roles: TouchlineRoleDefinition[] }
).roles;

/**
 * Computes 0-100 attribute fit for a Touchline role (priority weight 3, supporting weight 1).
 */
export function computeTouchlineAttributeFit(
  role: TouchlineRoleDefinition,
  attrs: PlayerRecord['attributes']
): number | null {
  let total = 0;
  let weight = 0;

  for (const name of role.priority) {
    const key = ATTR_DISPLAY_TO_KEY[name];
    const val = key ? attrs[key] : undefined;
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      total += 3 * val;
      weight += 3;
    }
  }
  for (const name of role.supporting) {
    const key = ATTR_DISPLAY_TO_KEY[name];
    const val = key ? attrs[key] : undefined;
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      total += 1 * val;
      weight += 1;
    }
  }

  if (weight === 0) return null;
  const avg = total / weight;
  return Number((((avg - 1) / 19) * 100).toFixed(1));
}

function inferPositionRatings(player: PlayerRecord): Record<string, number> {
  if (player.positionRatings && Object.keys(player.positionRatings).length > 0) {
    return player.positionRatings;
  }
  const map: Record<string, number> = {};
  const primary = player.position.toUpperCase().replace(/[^A-Z,/\s]/g, '');
  const tokens = primary.split(/[\s,/]+/).filter(Boolean);
  for (const tok of tokens) {
    if (tok === 'ST') map['STC'] = 20;
    else map[tok] = 20;
  }
  for (const sec of player.secondaryPositions ?? []) {
    const code = sec.toUpperCase() === 'ST' ? 'STC' : sec.toUpperCase();
    if (!(code in map)) map[code] = 15;
  }
  return map;
}

/**
 * Scores a single player against a single FM27 Touchline role.
 */
export function scoreTouchlineRole(
  role: TouchlineRoleDefinition,
  player: PlayerRecord
): DualPhaseRoleScore | null {
  const fit = computeTouchlineAttributeFit(role, player.attributes);
  if (fit == null) return null;

  const posRatings = inferPositionRatings(player);
  const codes = new Set<string>();
  for (const group of role.position_groups) {
    for (const code of GROUP_TO_POSITIONS[group] ?? []) {
      codes.add(code);
    }
  }

  let bestOverall: number | null = null;
  let bestPos: string | null = null;
  let bestPosRating: number | null = null;

  for (const code of codes) {
    const rating = posRatings[code] ?? 1;
    if (rating >= MIN_POSITION_RATING) {
      const overall = fit * (0.6 + (0.4 * rating) / 20);
      if (bestOverall === null || overall > bestOverall) {
        bestOverall = overall;
        bestPos = code;
        bestPosRating = rating;
      }
    }
  }

  return {
    name: role.name,
    phase: role.phase,
    fit,
    overall: bestOverall != null ? Number(bestOverall.toFixed(1)) : null,
    position: bestPos,
    positionRating: bestPosRating,
    eligible: bestOverall != null,
  };
}

/**
 * Ranks a player's best In-Possession and Out-of-Possession roles independently
 * so neither phase crowds out the other.
 */
export function evaluateDualPhaseRoles(
  player: PlayerRecord,
  topN = 3
): DualPhasePlayerProfile {
  const inRoles: DualPhaseRoleScore[] = [];
  const outRoles: DualPhaseRoleScore[] = [];

  for (const role of FM27_TOUCHLINE_ROLES) {
    const scored = scoreTouchlineRole(role, player);
    if (!scored || !scored.eligible) continue;
    if (role.phase === 'in') inRoles.push(scored);
    else outRoles.push(scored);
  }

  const sortByOverall = (a: DualPhaseRoleScore, b: DualPhaseRoleScore) =>
    (b.overall ?? 0) - (a.overall ?? 0) || b.fit - a.fit;

  inRoles.sort(sortByOverall);
  outRoles.sort(sortByOverall);

  return {
    bestInPossession: inRoles[0] ?? null,
    bestOutOfPossession: outRoles[0] ?? null,
    topInPossession: inRoles.slice(0, topN),
    topOutOfPossession: outRoles.slice(0, topN),
  };
}

// --- FM27 Tactical Effectiveness (4 Areas, 17 Factors) ---

export type TacticalEffectivenessArea =
  | 'Tactical Understanding'
  | 'Player Ability'
  | 'Player Buy-In'
  | 'Next Match Info';

export interface TacticalEffectivenessFactor {
  id: string;
  area: TacticalEffectivenessArea;
  label: string;
  score: number | null; // 0-100, null when not yet measured
  recommendedSession: string;
}

export interface TrainingFocusRecommendation {
  area: TacticalEffectivenessArea;
  factorLabel: string;
  score: number;
  recommendedSession: string;
  priority: 'High' | 'Medium' | 'Low';
}

/**
 * Given measured FM27 Tactical Effectiveness factors, recommends the highest-impact
 * weekly training sessions targeting the weakest areas.
 */
export function recommendTrainingFromEffectiveness(
  factors: TacticalEffectivenessFactor[],
  maxSessions = 3
): TrainingFocusRecommendation[] {
  const measured = factors.filter(
    (f): f is TacticalEffectivenessFactor & { score: number } =>
      typeof f.score === 'number' && Number.isFinite(f.score)
  );

  return measured
    .sort((a, b) => a.score - b.score)
    .slice(0, maxSessions)
    .map((f) => ({
      area: f.area,
      factorLabel: f.label,
      score: f.score,
      recommendedSession: f.recommendedSession,
      priority: f.score < 50 ? 'High' : f.score < 75 ? 'Medium' : 'Low',
    }));
}
