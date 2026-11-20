import { StaffAttributes, StaffRecord } from '../types/fm27';

export interface StaffRoleRating {
  key: string;
  label: string;
  category: 'Coaching' | 'Goalkeeping' | 'Fitness' | 'Scouting & Analysis' | 'Medical';
  stars: number; // 0.5 - 5.0 in 0.5 increments
  score: number; // 0 - 100 normalized rating
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
  working_with_youngsters: 'Working w/ Youngsters',
  adaptability: 'Adaptability',
  authority: 'Level of Discipline',
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

function ddm(a: StaffAttributes): number {
  return (a.determination + a.authority + a.motivating) / 3;
}

function toStars(rawOutOf20: number): { stars: number; score: number } {
  const clamped = Math.max(1, Math.min(20, rawOutOf20));
  const stars = Math.round(((clamped / 20) * 5) * 2) / 2;
  return {
    stars: Math.max(0.5, Math.min(5.0, stars)),
    score: Math.round((clamped / 20) * 100),
  };
}

export function calculateAllStaffRoleRatings(
  attrs: StaffAttributes
): StaffRoleRating[] {
  const core = ddm(attrs);
  const defs: Array<{
    key: string;
    label: string;
    category: StaffRoleRating['category'];
    value: number;
  }> = [
    {
      key: 'att_tech',
      label: 'Attacking — Technical',
      category: 'Coaching',
      value: attrs.attacking * 0.45 + attrs.technical * 0.35 + core * 0.2,
    },
    {
      key: 'att_tac',
      label: 'Attacking — Tactical',
      category: 'Coaching',
      value: attrs.attacking * 0.45 + attrs.tactical * 0.35 + core * 0.2,
    },
    {
      key: 'def_tech',
      label: 'Defending — Technical',
      category: 'Coaching',
      value: attrs.defending * 0.45 + attrs.technical * 0.35 + core * 0.2,
    },
    {
      key: 'def_tac',
      label: 'Defending — Tactical',
      category: 'Coaching',
      value: attrs.defending * 0.45 + attrs.tactical * 0.35 + core * 0.2,
    },
    {
      key: 'pos_tech',
      label: 'Possession — Technical',
      category: 'Coaching',
      value: attrs.possession * 0.45 + attrs.technical * 0.35 + core * 0.2,
    },
    {
      key: 'pos_tac',
      label: 'Possession — Tactical',
      category: 'Coaching',
      value: attrs.possession * 0.45 + attrs.tactical * 0.35 + core * 0.2,
    },
    {
      key: 'set_pieces',
      label: 'Set Pieces Coaching',
      category: 'Coaching',
      value: attrs.set_pieces * 0.55 + attrs.tactical * 0.25 + core * 0.2,
    },
    {
      key: 'fitness',
      label: 'Fitness — Strength & Quickness',
      category: 'Fitness',
      value: attrs.fitness * 0.65 + core * 0.35,
    },
    {
      key: 'goalkeeping',
      label: 'Goalkeeping Coaching',
      category: 'Goalkeeping',
      value: attrs.goalkeeping * 0.65 + core * 0.35,
    },
    {
      key: 'scouting',
      label: 'Player Scouting & Recruitment',
      category: 'Scouting & Analysis',
      value:
        attrs.judging_player_ability * 0.4 +
        attrs.judging_player_potential * 0.4 +
        attrs.adaptability * 0.2,
    },
    {
      key: 'analysis',
      label: 'Performance & Data Analysis',
      category: 'Scouting & Analysis',
      value:
        attrs.analysing_data * 0.55 +
        attrs.tactical_knowledge * 0.3 +
        attrs.determination * 0.15,
    },
    {
      key: 'medical',
      label: 'Medical & Sports Science',
      category: 'Medical',
      value:
        Math.max(attrs.physiotherapy, attrs.sports_science) * 0.65 +
        attrs.determination * 0.2 +
        attrs.man_management * 0.15,
    },
  ];

  return defs
    .map((d) => {
      const { stars, score } = toStars(d.value);
      return {
        key: d.key,
        label: d.label,
        category: d.category,
        stars,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function getBestStaffRoleRating(staff: StaffRecord): StaffRoleRating {
  const all = calculateAllStaffRoleRatings(staff.attributes);
  return all[0];
}

export function formatStars(stars: number): string {
  return `${stars.toFixed(1)}★`;
}
