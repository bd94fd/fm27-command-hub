/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PlayerRecord } from '../types/fm27';
import { DivisionBenchmarks, PlayerAttributes } from '../types/fmSave';
import { getPositionGroup } from './recruitmentHelpers';

export type StrategicDnaArchetypeId =
  | 'HIGH_PRESS_WINGER'
  | 'AERIAL_ANCHOR'
  | 'HIGH_XG_FINISHER'
  | 'BALL_PLAYING_REST_CB'
  | 'RELENTLESS_TRANSITION_MID'
  | 'SWEEPER_KEEPER_WALL';

export interface ClubDnaPillarWeights {
  physicalIntensity: number;
  technicalSecurity: number;
  tacticalDiscipline: number;
  aerialDominance: number;
}

export const DEFAULT_CLUB_DNA_WEIGHTS: ClubDnaPillarWeights = {
  physicalIntensity: 35,
  technicalSecurity: 25,
  tacticalDiscipline: 25,
  aerialDominance: 15,
};

export interface StrategicDnaArchetypeDefinition {
  id: StrategicDnaArchetypeId;
  label: string;
  shortLabel: string;
  positionGroups: Array<'GK' | 'DEF' | 'MID' | 'FWD'>;
  badgeTone: 'rose' | 'sky' | 'emerald' | 'amber' | 'indigo' | 'purple';
  weights: Array<{
    attr: keyof PlayerRecord['attributes'] | keyof PlayerAttributes;
    label: string;
    weight: number;
  }>;
}

export const STRATEGIC_DNA_ARCHETYPES: StrategicDnaArchetypeDefinition[] = [
  {
    id: 'HIGH_PRESS_WINGER',
    label: 'Lower-League High-Press Winger',
    shortLabel: 'High-Press Winger',
    positionGroups: ['MID', 'FWD'],
    badgeTone: 'sky',
    weights: [
      { attr: 'pace', label: 'Pac', weight: 0.24 },
      { attr: 'acceleration', label: 'Acc', weight: 0.22 },
      { attr: 'stamina', label: 'Sta', weight: 0.18 },
      { attr: 'workRate', label: 'Wor', weight: 0.16 },
      { attr: 'dribbling', label: 'Drb', weight: 0.12 },
      { attr: 'offTheBall', label: 'OtB', weight: 0.08 },
    ],
  },
  {
    id: 'AERIAL_ANCHOR',
    label: 'Aerially Dominant Anchor',
    shortLabel: 'Aerial Anchor',
    positionGroups: ['DEF', 'MID'],
    badgeTone: 'indigo',
    weights: [
      { attr: 'jumpingReach', label: 'Jum', weight: 0.26 },
      { attr: 'strength', label: 'Str', weight: 0.2 },
      { attr: 'positioning', label: 'Pos', weight: 0.2 },
      { attr: 'tackling', label: 'Tck', weight: 0.16 },
      { attr: 'heading', label: 'Hea', weight: 0.1 },
      { attr: 'decisions', label: 'Dec', weight: 0.08 },
    ],
  },
  {
    id: 'HIGH_XG_FINISHER',
    label: 'High-xG Box Finisher',
    shortLabel: 'High-xG Finisher',
    positionGroups: ['FWD', 'MID'],
    badgeTone: 'rose',
    weights: [
      { attr: 'finishing', label: 'Fin', weight: 0.26 },
      { attr: 'offTheBall', label: 'OtB', weight: 0.22 },
      { attr: 'composure', label: 'Cmp', weight: 0.18 },
      { attr: 'acceleration', label: 'Acc', weight: 0.16 },
      { attr: 'anticipation', label: 'Ant', weight: 0.1 },
      { attr: 'firstTouch', label: 'Fir', weight: 0.08 },
    ],
  },
  {
    id: 'BALL_PLAYING_REST_CB',
    label: 'Ball-Playing Rest-Defense CB',
    shortLabel: 'Rest-Defense CB',
    positionGroups: ['DEF'],
    badgeTone: 'emerald',
    weights: [
      { attr: 'positioning', label: 'Pos', weight: 0.22 },
      { attr: 'tackling', label: 'Tck', weight: 0.2 },
      { attr: 'pace', label: 'Pac', weight: 0.18 },
      { attr: 'jumpingReach', label: 'Jum', weight: 0.16 },
      { attr: 'passing', label: 'Pas', weight: 0.14 },
      { attr: 'composure', label: 'Cmp', weight: 0.1 },
    ],
  },
  {
    id: 'RELENTLESS_TRANSITION_MID',
    label: 'Relentless Transition Engine',
    shortLabel: 'Transition Engine',
    positionGroups: ['MID', 'DEF'],
    badgeTone: 'amber',
    weights: [
      { attr: 'stamina', label: 'Sta', weight: 0.22 },
      { attr: 'workRate', label: 'Wor', weight: 0.22 },
      { attr: 'decisions', label: 'Dec', weight: 0.18 },
      { attr: 'passing', label: 'Pas', weight: 0.16 },
      { attr: 'tackling', label: 'Tck', weight: 0.12 },
      { attr: 'positioning', label: 'Pos', weight: 0.1 },
    ],
  },
  {
    id: 'SWEEPER_KEEPER_WALL',
    label: 'Sweeper Keeper Wall',
    shortLabel: 'Sweeper Keeper',
    positionGroups: ['GK'],
    badgeTone: 'purple',
    weights: [
      { attr: 'reflexes', label: 'Ref', weight: 0.26 },
      { attr: 'handling', label: 'Han', weight: 0.22 },
      { attr: 'commandOfArea', label: 'Cmd', weight: 0.18 },
      { attr: 'aerialReach', label: 'Aer', weight: 0.14 },
      { attr: 'oneOnOnes', label: '1v1', weight: 0.1 },
      { attr: 'agility', label: 'Agi', weight: 0.1 },
    ],
  },
];

export interface ClubDnaEvaluationResult {
  overallDnaScore: number; // 0-100 hybrid score
  vectorScore: number; // 0-100 raw role vector score
  divisionCalibrationBonus: number; // -8..+12 division benchmark adjustment
  bestArchetypeId: StrategicDnaArchetypeId;
  bestArchetypeLabel: string;
  bestArchetypeShortLabel: string;
  badgeTone: StrategicDnaArchetypeDefinition['badgeTone'];
  pillarScores: {
    physicalIntensity: number;
    technicalSecurity: number;
    tacticalDiscipline: number;
    aerialDominance: number;
  };
  keyAttrChips: string[];
}

const DNA_STORAGE_KEY = 'fm27_club_dna_weights_v3';

export function loadPersistedClubDnaWeights(): ClubDnaPillarWeights {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_CLUB_DNA_WEIGHTS };
  }
  try {
    const raw = window.localStorage.getItem(DNA_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CLUB_DNA_WEIGHTS };
    const parsed = JSON.parse(raw) as Partial<ClubDnaPillarWeights>;
    return {
      physicalIntensity:
        typeof parsed.physicalIntensity === 'number'
          ? Math.max(0, Math.min(100, parsed.physicalIntensity))
          : DEFAULT_CLUB_DNA_WEIGHTS.physicalIntensity,
      technicalSecurity:
        typeof parsed.technicalSecurity === 'number'
          ? Math.max(0, Math.min(100, parsed.technicalSecurity))
          : DEFAULT_CLUB_DNA_WEIGHTS.technicalSecurity,
      tacticalDiscipline:
        typeof parsed.tacticalDiscipline === 'number'
          ? Math.max(0, Math.min(100, parsed.tacticalDiscipline))
          : DEFAULT_CLUB_DNA_WEIGHTS.tacticalDiscipline,
      aerialDominance:
        typeof parsed.aerialDominance === 'number'
          ? Math.max(0, Math.min(100, parsed.aerialDominance))
          : DEFAULT_CLUB_DNA_WEIGHTS.aerialDominance,
    };
  } catch {
    return { ...DEFAULT_CLUB_DNA_WEIGHTS };
  }
}

export function savePersistedClubDnaWeights(weights: ClubDnaPillarWeights): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(DNA_STORAGE_KEY, JSON.stringify(weights));
  } catch {
    // Ignore storage errors
  }
}

function readAttr(
  attrs: Partial<PlayerRecord['attributes']> | Partial<PlayerAttributes> | undefined,
  key: string,
  fallback = 10
): number {
  if (!attrs) return fallback;
  const record = attrs as Record<string, number | undefined>;
  const direct = record[key];
  if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) {
    return Math.min(20, Math.max(1, direct));
  }
  // Fallbacks for scouted targets with keyPace / keyStamina / keyDecision / keyVision
  if (key === 'pace' && typeof record.keyPace === 'number') return record.keyPace;
  if (key === 'stamina' && typeof record.keyStamina === 'number') return record.keyStamina;
  if (key === 'decisions' && typeof record.keyDecision === 'number') return record.keyDecision;
  if (key === 'vision' && typeof record.keyVision === 'number') return record.keyVision;
  return fallback;
}

/**
 * Evaluates any squad player or scouted target against the 6 Strategic v3.0 Club DNA Archetypes
 * and the user's custom 4-pillar Club DNA weights + optional Division Benchmark calibration.
 * Zero raw CA/PA is ever accessed or exposed.
 */
export function evaluatePlayerClubDna(
  position: string,
  attrs: Partial<PlayerRecord['attributes']> | Partial<PlayerAttributes> | undefined,
  pillarWeights: ClubDnaPillarWeights = DEFAULT_CLUB_DNA_WEIGHTS,
  divisionBenchmarks?: DivisionBenchmarks | null
): ClubDnaEvaluationResult {
  const posGroup = getPositionGroup(position || 'MC');
  const posUpper = (position || '').toUpperCase();

  // 1. Compute 4 Pillar Scores (0-100)
  const pac = readAttr(attrs, 'pace');
  const acc = readAttr(attrs, 'acceleration', pac);
  const sta = readAttr(attrs, 'stamina');
  const wor = readAttr(attrs, 'workRate', sta);

  const pas = readAttr(attrs, 'passing');
  const fir = readAttr(attrs, 'firstTouch', pas);
  const tec = readAttr(attrs, 'technique', fir);
  const drb = readAttr(attrs, 'dribbling', tec);

  const dec = readAttr(attrs, 'decisions');
  const pos = readAttr(attrs, 'positioning', dec);
  const ant = readAttr(attrs, 'anticipation', dec);
  const cmp = readAttr(attrs, 'composure', dec);

  const jum = readAttr(attrs, 'jumpingReach');
  const str = readAttr(attrs, 'strength', jum);
  const hea = readAttr(attrs, 'heading', jum);

  const pillarScores = {
    physicalIntensity: Math.round(((pac * 0.3 + acc * 0.25 + sta * 0.25 + wor * 0.2) / 20) * 100),
    technicalSecurity: Math.round(((pas * 0.35 + fir * 0.3 + tec * 0.2 + drb * 0.15) / 20) * 100),
    tacticalDiscipline: Math.round(((dec * 0.3 + pos * 0.3 + ant * 0.2 + cmp * 0.2) / 20) * 100),
    aerialDominance: Math.round(((jum * 0.45 + str * 0.35 + hea * 0.2) / 20) * 100),
  };

  const totalPillarWeight =
    Math.max(
      1,
      pillarWeights.physicalIntensity +
        pillarWeights.technicalSecurity +
        pillarWeights.tacticalDiscipline +
        pillarWeights.aerialDominance
    );

  const customPillarComposite =
    (pillarScores.physicalIntensity * pillarWeights.physicalIntensity +
      pillarScores.technicalSecurity * pillarWeights.technicalSecurity +
      pillarScores.tacticalDiscipline * pillarWeights.tacticalDiscipline +
      pillarScores.aerialDominance * pillarWeights.aerialDominance) /
    totalPillarWeight;

  // 2. Score candidate archetypes matching player's position group
  const candidateArchetypes = STRATEGIC_DNA_ARCHETYPES.filter((a) => {
    if (posGroup === 'GK') return a.id === 'SWEEPER_KEEPER_WALL';
    if (a.id === 'SWEEPER_KEEPER_WALL') return false;
    if (posUpper.includes('AM') || posUpper.includes('ML') || posUpper.includes('MR')) {
      return a.id === 'HIGH_PRESS_WINGER' || a.id === 'HIGH_XG_FINISHER';
    }
    if (posUpper.includes('ST') || posUpper.includes('CF')) {
      return a.id === 'HIGH_XG_FINISHER' || a.id === 'HIGH_PRESS_WINGER';
    }
    if (posUpper.includes('DC') || posUpper.includes('CB')) {
      return a.id === 'BALL_PLAYING_REST_CB' || a.id === 'AERIAL_ANCHOR';
    }
    return a.positionGroups.includes(posGroup);
  });

  const pool =
    candidateArchetypes.length > 0 ? candidateArchetypes : STRATEGIC_DNA_ARCHETYPES;

  let bestDef = pool[0];
  let bestArchRaw = -1;
  let bestChips: string[] = [];

  for (const def of pool) {
    let weightedSum = 0;
    const chips: string[] = [];
    for (const w of def.weights) {
      const val = readAttr(attrs, String(w.attr));
      weightedSum += val * w.weight;
      if (chips.length < 3) {
        chips.push(`${w.label} ${Math.round(val)}`);
      }
    }
    const archPct = Math.round((weightedSum / 20) * 100);
    if (archPct > bestArchRaw) {
      bestArchRaw = archPct;
      bestDef = def;
      bestChips = chips;
    }
  }

  // Combine 65% best archetype vector + 35% custom Club DNA pillar slider composite
  const vectorScore = Math.round(bestArchRaw * 0.65 + customPillarComposite * 0.35);

  // 3. Division Benchmark Calibration (Hybrid 80% Vector / 20% Division Z-Delta)
  let divisionCalibrationBonus = 0;
  const divBench = divisionBenchmarks?.byPositionGroup?.[posGroup];
  if (divBench && divBench.medianAttributes) {
    const med = divBench.medianAttributes;
    const benchKeys = ['pace', 'stamina', 'passing', 'tackling', 'decisions'];
    let deltaSum = 0;
    let count = 0;
    for (const k of benchKeys) {
      const medVal = med[k];
      if (typeof medVal === 'number' && medVal > 0) {
        deltaSum += readAttr(attrs, k) - medVal;
        count += 1;
      }
    }
    if (count > 0) {
      const avgDelta = deltaSum / count;
      divisionCalibrationBonus = Math.max(
        -8,
        Math.min(12, Math.round(avgDelta * 2.2))
      );
    }
  }

  const overallDnaScore = Math.max(
    25,
    Math.min(99, Math.round(vectorScore + divisionCalibrationBonus))
  );

  return {
    overallDnaScore,
    vectorScore,
    divisionCalibrationBonus,
    bestArchetypeId: bestDef.id,
    bestArchetypeLabel: bestDef.label,
    bestArchetypeShortLabel: bestDef.shortLabel,
    badgeTone: bestDef.badgeTone,
    pillarScores,
    keyAttrChips: bestChips,
  };
}
