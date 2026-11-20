import type { StaffAttributes, StaffRecord } from './types';

export interface StaffRoleDefinition {
  key: string;
  label: string;
  group: string;
  specialism: string;
  weights: Partial<Record<keyof StaffAttributes, number>>;
}

export interface StaffRoleAttributeBreakdown {
  key: keyof StaffAttributes;
  label: string;
  value: number | null;
  quality: string;
  weight: number;
}

export interface StaffRoleRating {
  key: string;
  label: string;
  group: string;
  specialism: string;
  score20: number;
  stars: number;
  quality: string;
  attributes: StaffRoleAttributeBreakdown[];
}

export const STAFF_ATTRIBUTE_LABELS: Record<keyof StaffAttributes, string> = {
  attacking: 'Attacking',
  defending: 'Defending',
  fitness: 'Fitness',
  goalkeeping: 'Goalkeeping',
  mental: 'Mental',
  possession: 'Possession',
  set_pieces: 'Set Pieces',
  tactical: 'Tactical',
  technical: 'Technical',
  working_with_youngsters: 'Working With Youngsters',
  adaptability: 'Adaptability',
  authority: 'Authority',
  determination: 'Determination',
  judging_player_ability: 'Judging Player Ability',
  judging_player_potential: 'Judging Player Potential',
  judging_staff_ability: 'Judging Staff Ability',
  man_management: 'Man Management',
  motivating: 'Motivating',
  negotiating: 'Negotiating',
  physiotherapy: 'Physiotherapy',
  sports_science: 'Sports Science',
  tactical_knowledge: 'Tactical Knowledge',
  analysing_data: 'Analysing Data',
};

const COMMON_WEIGHTS: Partial<Record<keyof StaffAttributes, number>> = {
  authority: 2,
  determination: 2,
  motivating: 2,
};

function defineRole(
  key: string,
  group: string,
  specialism: string,
  specialist: Partial<Record<keyof StaffAttributes, number>>,
): StaffRoleDefinition {
  return {
    key,
    label: group === specialism ? group : `${group} - ${specialism}`,
    group,
    specialism,
    weights: { ...specialist, ...COMMON_WEIGHTS },
  };
}

/** Exact port of FM27 9-role single-assignment coaching ratings */
export const STAFF_COACHING_ROLES: StaffRoleDefinition[] = [
  defineRole('goalkeeping', 'Goalkeeping', 'Goalkeeping', { goalkeeping: 9 }),
  defineRole('defending_tactical', 'Defending', 'Tactical', { defending: 6, tactical: 3 }),
  defineRole('defending_technical', 'Defending', 'Technical', { defending: 6, technical: 3 }),
  defineRole('attacking_tactical', 'Attacking', 'Tactical', { attacking: 6, tactical: 3 }),
  defineRole('attacking_technical', 'Attacking', 'Technical', { attacking: 6, technical: 3 }),
  defineRole('possession_tactical', 'Possession', 'Tactical', { possession: 6, tactical: 3 }),
  defineRole('possession_technical', 'Possession', 'Technical', { technical: 9 }),
  defineRole('fitness', 'Fitness', 'Fitness', { fitness: 9 }),
  defineRole('set_pieces', 'Set Pieces', 'Set Pieces', { set_pieces: 6, tactical_knowledge: 3 }),
];

export const STAFF_ROLE_BY_KEY: Record<string, StaffRoleDefinition> = Object.fromEntries(
  STAFF_COACHING_ROLES.map((role) => [role.key, role]),
);

export function normalizeRoleKey(roleKey: string): string {
  return roleKey.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function staffQualityLabel(score20: number | null): string {
  if (score20 === null) return 'Unknown';
  if (score20 >= 20) return 'Elite';
  if (score20 >= 18) return 'Outstanding';
  if (score20 >= 15) return 'Very Good';
  if (score20 >= 12) return 'Good';
  if (score20 >= 10) return 'Average';
  if (score20 >= 7) return 'Competent';
  if (score20 >= 4) return 'Reasonable';
  return 'Unsuited';
}

export function calculateStaffRoleRating(
  attributes: StaffAttributes,
  role: StaffRoleDefinition,
): StaffRoleRating {
  let weightedTotal = 0;
  const breakdown: StaffRoleAttributeBreakdown[] = [];

  for (const [rawKey, weight] of Object.entries(role.weights)) {
    const key = rawKey as keyof StaffAttributes;
    const rawVal = attributes[key];
    const value = rawVal ?? 1;
    const w = weight ?? 0;
    weightedTotal += value * w;
    breakdown.push({
      key,
      label: STAFF_ATTRIBUTE_LABELS[key],
      value: rawVal,
      quality: staffQualityLabel(rawVal),
      weight: w,
    });
  }

  const rawScore20 = weightedTotal / 15.0;
  const score20 = Math.round(rawScore20 * 10.0) / 10.0;
  const rawStars = weightedTotal / 60.0;
  const stars = Math.min(5.0, Math.max(0.5, Math.floor(rawStars * 2.0 + 1.0 + 1e-9) / 2.0));

  return {
    key: role.key,
    label: role.label,
    group: role.group,
    specialism: role.specialism,
    score20,
    stars,
    quality: staffQualityLabel(rawScore20),
    attributes: breakdown,
  };
}

export function calculateAllStaffRoleRatings(staff: StaffRecord): StaffRoleRating[] {
  return STAFF_COACHING_ROLES.map((role) => calculateStaffRoleRating(staff.attributes, role));
}

export function getBestStaffRoleRating(staff: StaffRecord): StaffRoleRating {
  const ratings = calculateAllStaffRoleRatings(staff);
  return ratings.reduce((best, current) => {
    if (current.score20 > best.score20) return current;
    if (current.score20 === best.score20 && current.key > best.key) return current;
    return best;
  }, ratings[0]);
}

export function formatStars(stars: number): string {
  return stars.toFixed(1);
}
