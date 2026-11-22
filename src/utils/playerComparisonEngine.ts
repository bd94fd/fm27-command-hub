/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PlayerRecord } from '../types/fm27';
import { RecruitmentTarget } from '../types/fmSave';

export type ComparisonChartMode = 'radar' | 'pizza' | 'bars';

export type PercentileBucket = 'Elite' | 'Strong' | 'Solid' | 'Developing';

export interface ComparablePlayer {
  id: string;
  name: string;
  position: string;
  age: number;
  wagePw: number;
  subtitle: string;
  source: 'squad' | 'target';
  attributes: Record<string, number>;
}

export interface ComparisonAxisPoint {
  key: string;
  label: string;
  category: 'Physical' | 'Technical' | 'Mental' | 'Defending' | 'Attacking' | 'Goalkeeping';
  values: number[];
  percentiles: number[];
  buckets: PercentileBucket[];
  leaderIndex: number | null;
}

export interface MultiPlayerComparisonDataset {
  players: ComparablePlayer[];
  colors: string[];
  isGk: boolean;
  radarAxes: ComparisonAxisPoint[];
  pizzaSlices: ComparisonAxisPoint[];
  barMetrics: ComparisonAxisPoint[];
}

export const COMPARISON_PALETTE = [
  '#10b981', // emerald-500
  '#38bdf8', // sky-400
  '#f59e0b', // amber-500
] as const;

export function getPercentileBucket(percentile: number): PercentileBucket {
  if (percentile >= 85) return 'Elite';
  if (percentile >= 65) return 'Strong';
  if (percentile >= 40) return 'Solid';
  return 'Developing';
}

export function estimateDivisionPercentile(attrValue: number): number {
  const clamped = Math.min(20, Math.max(1, Number(attrValue) || 1));
  return Math.min(99, Math.max(5, Math.round(((clamped - 4) / 14) * 100)));
}

export function computeRelativePercentile(
  rawValue: number,
  attrKey: string,
  squadBaseline?: PlayerRecord[]
): number {
  if (!squadBaseline || squadBaseline.length < 3) {
    return estimateDivisionPercentile(rawValue);
  }
  const vals = squadBaseline
    .map((p) => Number((p.attributes as Record<string, number | undefined>)?.[attrKey] ?? 0))
    .filter((v) => v > 0);
  if (vals.length < 3) {
    return estimateDivisionPercentile(rawValue);
  }
  const below = vals.filter((v) => v < rawValue).length;
  const equal = vals.filter((v) => v === rawValue).length;
  return Math.min(99, Math.max(5, Math.round(((below + equal * 0.5) / vals.length) * 100)));
}

function isPlayerRecord(input: PlayerRecord | RecruitmentTarget): input is PlayerRecord {
  return 'ipRole' in input || 'status' in input;
}

export function normalizePlayerForComparison(
  input: PlayerRecord | RecruitmentTarget
): ComparablePlayer {
  if (isPlayerRecord(input)) {
    const attrs: Record<string, number> = {};
    for (const [k, v] of Object.entries(input.attributes || {})) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        attrs[k] = v;
      }
    }
    return {
      id: input.id,
      name: input.name,
      position: input.position || '—',
      age: Number(input.age) || 0,
      wagePw: Number(input.wagePw) || 0,
      subtitle: `${input.status} · ${input.position}`,
      source: 'squad',
      attributes: attrs,
    };
  }

  const raw = input.attributes || {};
  const attrs: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      attrs[k] = v;
    }
  }
  if (attrs.pace == null && typeof raw.keyPace === 'number') attrs.pace = raw.keyPace;
  if (attrs.vision == null && typeof raw.keyVision === 'number') attrs.vision = raw.keyVision;
  if (attrs.decisions == null && typeof raw.keyDecision === 'number') attrs.decisions = raw.keyDecision;
  if (attrs.stamina == null && typeof raw.keyStamina === 'number') attrs.stamina = raw.keyStamina;

  return {
    id: `target-${input.uid}`,
    name: input.name,
    position: input.primaryPosition || '—',
    age: Number(input.age) || 0,
    wagePw: Number(input.demandedWageEur) || 0,
    subtitle: input.isFreeAgent
      ? `Free Agent · ${input.primaryPosition}`
      : `${input.currentClub || 'Scouted'} · ${input.primaryPosition}`,
    source: 'target',
    attributes: attrs,
  };
}

interface AxisSpec {
  key: string;
  label: string;
  category: ComparisonAxisPoint['category'];
}

const OUTFIELD_RADAR_SPECS: AxisSpec[] = [
  { key: 'pace', label: 'Pace', category: 'Physical' },
  { key: 'stamina', label: 'Stamina', category: 'Physical' },
  { key: 'passing', label: 'Passing', category: 'Technical' },
  { key: 'finishing', label: 'Finishing', category: 'Attacking' },
  { key: 'tackling', label: 'Tackling', category: 'Defending' },
  { key: 'decisions', label: 'Decisions', category: 'Mental' },
];

const GK_RADAR_SPECS: AxisSpec[] = [
  { key: 'reflexes', label: 'Reflexes', category: 'Goalkeeping' },
  { key: 'handling', label: 'Handling', category: 'Goalkeeping' },
  { key: 'aerialReach', label: 'Aerial', category: 'Goalkeeping' },
  { key: 'commandOfArea', label: 'Command', category: 'Goalkeeping' },
  { key: 'agility', label: 'Agility', category: 'Physical' },
  { key: 'positioning', label: 'Positioning', category: 'Mental' },
];

const OUTFIELD_BAR_SPECS: AxisSpec[] = [
  { key: 'pace', label: 'Pace', category: 'Physical' },
  { key: 'acceleration', label: 'Accel.', category: 'Physical' },
  { key: 'stamina', label: 'Stamina', category: 'Physical' },
  { key: 'workRate', label: 'Work Rate', category: 'Mental' },
  { key: 'decisions', label: 'Decisions', category: 'Mental' },
  { key: 'passing', label: 'Passing', category: 'Technical' },
  { key: 'firstTouch', label: '1st Touch', category: 'Technical' },
  { key: 'determination', label: 'Determ.', category: 'Mental' },
];

const GK_BAR_SPECS: AxisSpec[] = [
  { key: 'reflexes', label: 'Reflexes', category: 'Goalkeeping' },
  { key: 'handling', label: 'Handling', category: 'Goalkeeping' },
  { key: 'oneOnOnes', label: '1v1s', category: 'Goalkeeping' },
  { key: 'aerialReach', label: 'Aerial', category: 'Goalkeeping' },
  { key: 'commandOfArea', label: 'Command', category: 'Goalkeeping' },
  { key: 'kicking', label: 'Kicking', category: 'Goalkeeping' },
  { key: 'positioning', label: 'Positioning', category: 'Mental' },
  { key: 'decisions', label: 'Decisions', category: 'Mental' },
];

function getPizzaSpecsForPosition(position: string): AxisSpec[] {
  const pos = (position || '').toUpperCase();
  if (pos.includes('GK')) {
    return GK_BAR_SPECS;
  }
  if (pos.includes('ST') || pos.includes('CF') || pos.includes('AM') || pos.includes('LW') || pos.includes('RW')) {
    return [
      { key: 'finishing', label: 'Finishing', category: 'Attacking' },
      { key: 'offTheBall', label: 'Off Ball', category: 'Attacking' },
      { key: 'firstTouch', label: '1st Touch', category: 'Technical' },
      { key: 'passing', label: 'Passing', category: 'Technical' },
      { key: 'pace', label: 'Pace', category: 'Physical' },
      { key: 'acceleration', label: 'Accel.', category: 'Physical' },
      { key: 'decisions', label: 'Decisions', category: 'Mental' },
      { key: 'workRate', label: 'Work Rate', category: 'Mental' },
    ];
  }
  if (pos.includes('DC') || pos.includes('CB') || pos.includes('DL') || pos.includes('DR') || pos.includes('WB') || pos.includes('DM')) {
    return [
      { key: 'tackling', label: 'Tackling', category: 'Defending' },
      { key: 'marking', label: 'Marking', category: 'Defending' },
      { key: 'positioning', label: 'Positioning', category: 'Defending' },
      { key: 'jumpingReach', label: 'Jumping', category: 'Physical' },
      { key: 'pace', label: 'Pace', category: 'Physical' },
      { key: 'stamina', label: 'Stamina', category: 'Physical' },
      { key: 'passing', label: 'Passing', category: 'Technical' },
      { key: 'decisions', label: 'Decisions', category: 'Mental' },
    ];
  }
  return [
    { key: 'passing', label: 'Passing', category: 'Technical' },
    { key: 'firstTouch', label: '1st Touch', category: 'Technical' },
    { key: 'vision', label: 'Vision', category: 'Mental' },
    { key: 'decisions', label: 'Decisions', category: 'Mental' },
    { key: 'workRate', label: 'Work Rate', category: 'Mental' },
    { key: 'stamina', label: 'Stamina', category: 'Physical' },
    { key: 'pace', label: 'Pace', category: 'Physical' },
    { key: 'tackling', label: 'Tackling', category: 'Defending' },
  ];
}

function buildPoints(
  specs: AxisSpec[],
  players: ComparablePlayer[],
  squadBaseline?: PlayerRecord[]
): ComparisonAxisPoint[] {
  return specs.map((spec) => {
    const values = players.map((p) => {
      const val = p.attributes[spec.key];
      return typeof val === 'number' && Number.isFinite(val) ? Math.min(20, Math.max(1, val)) : 10;
    });
    const percentiles = values.map((v) =>
      computeRelativePercentile(v, spec.key, squadBaseline)
    );
    const buckets = percentiles.map(getPercentileBucket);

    let leaderIndex: number | null = null;
    if (values.length > 1) {
      const maxVal = Math.max(...values);
      const leaders = values
        .map((v, i) => (v === maxVal ? i : -1))
        .filter((i) => i >= 0);
      leaderIndex = leaders.length === 1 ? leaders[0] : null;
    }

    return {
      key: spec.key,
      label: spec.label,
      category: spec.category,
      values,
      percentiles,
      buckets,
      leaderIndex,
    };
  });
}

export function buildMultiPlayerComparison(
  inputs: Array<PlayerRecord | RecruitmentTarget | ComparablePlayer>,
  squadBaseline?: PlayerRecord[]
): MultiPlayerComparisonDataset {
  const players = inputs.slice(0, 3).map((item) =>
    'source' in item ? item : normalizePlayerForComparison(item)
  );
  const isGk =
    players.length > 0 &&
    players.every((p) => (p.position || '').toUpperCase().includes('GK'));

  const primaryPos = players[0]?.position || 'MC';
  const radarSpecs = isGk ? GK_RADAR_SPECS : OUTFIELD_RADAR_SPECS;
  const pizzaSpecs = getPizzaSpecsForPosition(primaryPos);
  const barSpecs = isGk ? GK_BAR_SPECS : OUTFIELD_BAR_SPECS;

  return {
    players,
    colors: players.map((_, i) => COMPARISON_PALETTE[i % COMPARISON_PALETTE.length]),
    isGk,
    radarAxes: buildPoints(radarSpecs, players, squadBaseline),
    pizzaSlices: buildPoints(pizzaSpecs, players, squadBaseline),
    barMetrics: buildPoints(barSpecs, players, squadBaseline),
  };
}
