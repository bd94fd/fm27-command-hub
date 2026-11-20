import fm27RolesData from '../data/fm27Roles.json';
import type { PlayerAttributes, PositionCode } from './types';

export interface AttributeDef {
  key: keyof PlayerAttributes;
  label: string;
}

export interface AttributeCategory {
  name: string;
  order: number;
  attributes: AttributeDef[];
}

export interface Fm27RoleDefinition {
  positionGroup: string;
  name: string;
  phase: 'In Possession' | 'Out of Possession';
  priorities: Record<string, 'primary' | 'secondary'>;
}

export const FM27_ROLES: Fm27RoleDefinition[] = (
  fm27RolesData as unknown as Fm27RoleDefinition[]
).map((role) => {
  const normalizedPriorities: Record<string, 'primary' | 'secondary'> = {};
  for (const [k, v] of Object.entries(role.priorities)) {
    const key =
      k === 'team_work' ? 'teamwork' : k === 'jumping' ? 'jumping_reach' : k;
    normalizedPriorities[key] = v;
  }
  return { ...role, priorities: normalizedPriorities };
});

export const IN_POSSESSION_ROLES: Fm27RoleDefinition[] = FM27_ROLES.filter(
  (r) => r.phase === 'In Possession',
);

export const OUT_OF_POSSESSION_ROLES: Fm27RoleDefinition[] = FM27_ROLES.filter(
  (r) => r.phase === 'Out of Possession',
);

export const PLAYER_ATTRIBUTE_CATEGORIES: AttributeCategory[] = [
  {
    name: 'Technical',
    order: 10,
    attributes: [
      { key: 'crossing', label: 'Crossing' },
      { key: 'dribbling', label: 'Dribbling' },
      { key: 'finishing', label: 'Finishing' },
      { key: 'first_touch', label: 'First Touch' },
      { key: 'heading', label: 'Heading' },
      { key: 'long_shots', label: 'Long Shots' },
      { key: 'marking', label: 'Marking' },
      { key: 'passing', label: 'Passing' },
      { key: 'tackling', label: 'Tackling' },
      { key: 'technique', label: 'Technique' },
    ],
  },
  {
    name: 'Set Pieces',
    order: 20,
    attributes: [
      { key: 'corners', label: 'Corners' },
      { key: 'free_kicks', label: 'Free Kick Taking' },
      { key: 'long_throws', label: 'Long Throws' },
      { key: 'penalties', label: 'Penalty Taking' },
    ],
  },
  {
    name: 'Mental',
    order: 30,
    attributes: [
      { key: 'aggression', label: 'Aggression' },
      { key: 'anticipation', label: 'Anticipation' },
      { key: 'bravery', label: 'Bravery' },
      { key: 'composure', label: 'Composure' },
      { key: 'concentration', label: 'Concentration' },
      { key: 'decisions', label: 'Decisions' },
      { key: 'determination', label: 'Determination' },
      { key: 'flair', label: 'Flair' },
      { key: 'leadership', label: 'Leadership' },
      { key: 'off_the_ball', label: 'Off the Ball' },
      { key: 'positioning', label: 'Positioning' },
      { key: 'teamwork', label: 'Teamwork' },
      { key: 'vision', label: 'Vision' },
      { key: 'work_rate', label: 'Work Rate' },
    ],
  },
  {
    name: 'Physical',
    order: 40,
    attributes: [
      { key: 'acceleration', label: 'Acceleration' },
      { key: 'agility', label: 'Agility' },
      { key: 'balance', label: 'Balance' },
      { key: 'jumping_reach', label: 'Jumping Reach' },
      { key: 'natural_fitness', label: 'Natural Fitness' },
      { key: 'pace', label: 'Pace' },
      { key: 'stamina', label: 'Stamina' },
      { key: 'strength', label: 'Strength' },
    ],
  },
  {
    name: 'Goalkeeping',
    order: 50,
    attributes: [
      { key: 'aerial_ability', label: 'Aerial Reach' },
      { key: 'command_of_area', label: 'Command of Area' },
      { key: 'communication', label: 'Communication' },
      { key: 'eccentricity', label: 'Eccentricity' },
      { key: 'first_touch', label: 'First Touch' },
      { key: 'handling', label: 'Handling' },
      { key: 'kicking', label: 'Kicking' },
      { key: 'one_on_ones', label: 'One on Ones' },
      { key: 'passing', label: 'Passing' },
      { key: 'reflexes', label: 'Reflexes' },
      { key: 'rushing_out', label: 'Rushing Out' },
      { key: 'tendency_to_punch', label: 'Tendency to Punch' },
      { key: 'throwing', label: 'Throwing' },
    ],
  },
  {
    name: 'Hidden Attributes',
    order: 60,
    attributes: [
      { key: 'adaptability', label: 'Adaptability' },
      { key: 'ambition', label: 'Ambition' },
      { key: 'consistency', label: 'Consistency' },
      { key: 'controversy', label: 'Controversy' },
      { key: 'dirtiness', label: 'Dirtiness' },
      { key: 'important_matches', label: 'Important Matches' },
      { key: 'injury_proneness', label: 'Injury Proneness' },
      { key: 'loyalty', label: 'Loyalty' },
      { key: 'pressure', label: 'Pressure' },
      { key: 'professionalism', label: 'Professionalism' },
      { key: 'sportsmanship', label: 'Sportsmanship' },
      { key: 'temperament', label: 'Temperament' },
      { key: 'versatility', label: 'Versatility' },
    ],
  },
];

export function getPlayerAttributeCategories(showGoalkeeping: boolean): AttributeCategory[] {
  if (showGoalkeeping) {
    const gk = PLAYER_ATTRIBUTE_CATEGORIES.find((c) => c.name === 'Goalkeeping')!;
    const rest = PLAYER_ATTRIBUTE_CATEGORIES.filter(
      (c) => c.name !== 'Goalkeeping' && c.name !== 'Technical',
    );
    return [gk, ...rest];
  }
  return PLAYER_ATTRIBUTE_CATEGORIES.filter((c) => c.name !== 'Goalkeeping');
}

export function getRolePriorities(
  phase: 'In Possession' | 'Out of Possession',
  roleName: string,
): Record<string, 'primary' | 'secondary'> {
  if (!roleName) return {};
  const match = FM27_ROLES.find((r) => r.phase === phase && r.name === roleName);
  return match?.priorities ?? {};
}

/**
 * Computes weighted role fit score across available (non-null) attributes.
 * Returns null if the role is unknown or the player has no populated priority attributes.
 */
export function getRoleFitScore(
  attributes: PlayerAttributes,
  phase: 'In Possession' | 'Out of Possession',
  roleName: string,
): number | null {
  const priorities = getRolePriorities(phase, roleName);
  const entries = Object.entries(priorities);
  if (entries.length === 0) return null;

  let weighted = 0;
  let totalWeight = 0;
  for (const [key, priority] of entries) {
    const val = attributes[key as keyof PlayerAttributes];
    if (val === null || val === undefined) continue;
    const w = priority === 'primary' ? 2 : 1;
    weighted += val * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? Math.round((weighted / totalWeight) * 10) / 10 : null;
}

export function attributeScoreColorClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'text-[#6f6778]';
  if (value >= 16) return 'text-[#53e841]';
  if (value >= 11) return 'text-[#f0d637]';
  if (value >= 6) return 'text-[#d4ced8]';
  return 'text-[#ff758b]';
}

export function positionFamiliarityLabel(value: number): string {
  if (value >= 18) return 'Natural';
  if (value >= 15) return 'Accomplished';
  if (value >= 12) return 'Competent';
  if (value >= 9) return 'Unconvincing';
  if (value >= 5) return 'Awkward';
  return 'Ineffectual';
}

export const PITCH_POSITION_ROWS: { label: string; positions: (PositionCode | null)[] }[] = [
  { label: 'ST', positions: [null, 'ST', null] },
  { label: 'AM', positions: ['AML', 'AMC', 'AMR'] },
  { label: 'M', positions: ['ML', 'MC', 'MR'] },
  { label: 'DM / WB', positions: ['WBL', 'DM', 'WBR'] },
  { label: 'D', positions: ['DL', 'DC', 'DR'] },
  { label: 'GK', positions: [null, 'GK', null] },
];

export const ALL_POSITION_CODES: PositionCode[] = [
  'GK',
  'DL',
  'DC',
  'DR',
  'WBL',
  'DM',
  'WBR',
  'ML',
  'MC',
  'MR',
  'AML',
  'AMC',
  'AMR',
  'ST',
];
