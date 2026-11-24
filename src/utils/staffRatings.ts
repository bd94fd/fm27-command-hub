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

/**
 * FM27 coaching star weighting (Determination + Level of Discipline + Motivating weighted 2x each).
 * - Dual-attribute coaching (Attacking/Defending/Possession/Set Pieces): 6x primary + 3x secondary + 2x DDM (÷ 15)
 * - Single-attribute coaching (Fitness/Goalkeeping): 9x primary + 2x DDM (÷ 15)
 */
function ddmWeighted2x(a: StaffAttributes): number {
  return (a.determination + a.authority + a.motivating) * 2;
}

function dualAttrCoachingScore(
  primary: number,
  secondary: number,
  attrs: StaffAttributes
): number {
  return (primary * 6 + secondary * 3 + ddmWeighted2x(attrs)) / 15;
}

function singleAttrCoachingScore(primary: number, attrs: StaffAttributes): number {
  return (primary * 9 + ddmWeighted2x(attrs)) / 15;
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
      value: dualAttrCoachingScore(attrs.attacking, attrs.technical, attrs),
    },
    {
      key: 'att_tac',
      label: 'Attacking — Tactical',
      category: 'Coaching',
      value: dualAttrCoachingScore(attrs.attacking, attrs.tactical, attrs),
    },
    {
      key: 'def_tech',
      label: 'Defending — Technical',
      category: 'Coaching',
      value: dualAttrCoachingScore(attrs.defending, attrs.technical, attrs),
    },
    {
      key: 'def_tac',
      label: 'Defending — Tactical',
      category: 'Coaching',
      value: dualAttrCoachingScore(attrs.defending, attrs.tactical, attrs),
    },
    {
      key: 'pos_tech',
      label: 'Possession — Technical',
      category: 'Coaching',
      value: dualAttrCoachingScore(attrs.possession, attrs.technical, attrs),
    },
    {
      key: 'pos_tac',
      label: 'Possession — Tactical',
      category: 'Coaching',
      value: dualAttrCoachingScore(attrs.possession, attrs.tactical, attrs),
    },
    {
      key: 'set_pieces',
      label: 'Set Pieces Coaching',
      category: 'Coaching',
      value: dualAttrCoachingScore(attrs.set_pieces, attrs.tactical, attrs),
    },
    {
      key: 'fitness',
      label: 'Fitness — Strength & Quickness',
      category: 'Fitness',
      value: singleAttrCoachingScore(attrs.fitness, attrs),
    },
    {
      key: 'goalkeeping',
      label: 'Goalkeeping Coaching',
      category: 'Goalkeeping',
      value: singleAttrCoachingScore(attrs.goalkeeping, attrs),
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

export interface BackroomDepartmentSummary {
  departmentId: string;
  label: string;
  leadStaffName: string;
  leadStaffRole: string;
  stars: number;
  efficiencyScore: number; // 0-100
  status: 'Elite' | 'Solid' | 'Weak / Upgrade Needed';
  recommendation: string;
}

const DEPARTMENT_SPECS: Array<{
  id: string;
  label: string;
  ratingKeys: string[];
}> = [
  { id: 'attacking', label: 'Attacking Coaching', ratingKeys: ['att_tech', 'att_tac'] },
  { id: 'defending', label: 'Defending Coaching', ratingKeys: ['def_tech', 'def_tac'] },
  { id: 'possession', label: 'Possession & Tactical', ratingKeys: ['pos_tech', 'pos_tac'] },
  { id: 'fitness', label: 'Strength & Quickness', ratingKeys: ['fitness'] },
  { id: 'goalkeeping', label: 'Goalkeeping Coaching', ratingKeys: ['goalkeeping'] },
  { id: 'set_pieces', label: 'Set Pieces Coaching', ratingKeys: ['set_pieces'] },
  { id: 'scouting', label: 'Scouting & Recruitment', ratingKeys: ['scouting', 'analysis'] },
  { id: 'medical', label: 'Medical & Sports Science', ratingKeys: ['medical'] },
];

/**
 * Evaluates all 8 backroom departments across the club's synced staff list (inspired by fm-scoring)
 * to highlight the top lead specialist per department and flag weak/understaffed areas.
 */
export function evaluateBackroomDepartmentEfficiency(
  staffList: StaffRecord[]
): BackroomDepartmentSummary[] {
  return DEPARTMENT_SPECS.map((dept) => {
    let bestLead: StaffRecord | null = null;
    let bestRating: StaffRoleRating | null = null;

    for (const member of staffList) {
      const ratings = calculateAllStaffRoleRatings(member.attributes);
      for (const r of ratings) {
        if (!dept.ratingKeys.includes(r.key)) continue;
        if (!bestRating || r.score > bestRating.score) {
          bestRating = r;
          bestLead = member;
        }
      }
    }

    const stars = bestRating ? bestRating.stars : 0.5;
    const efficiencyScore = bestRating ? bestRating.score : 15;
    const status: BackroomDepartmentSummary['status'] =
      stars >= 3.5 ? 'Elite' : stars >= 2.5 ? 'Solid' : 'Weak / Upgrade Needed';

    const recommendation =
      status === 'Weak / Upgrade Needed'
        ? `Priority hire needed for ${dept.label} (current lead ${stars.toFixed(1)}★ < 2.5★ threshold).`
        : status === 'Solid'
          ? `${dept.label} covered at ${stars.toFixed(1)}★ by ${bestLead?.name || 'Staff'}.`
          : `High-efficiency department led by ${bestLead?.name || 'Staff'} (${stars.toFixed(1)}★).`;

    return {
      departmentId: dept.id,
      label: dept.label,
      leadStaffName: bestLead ? bestLead.name : 'Unassigned',
      leadStaffRole: bestLead ? bestLead.role : '--',
      stars,
      efficiencyScore,
      status,
      recommendation,
    };
  });
}

export type StaffDepartmentGroup = 'coaching' | 'scouting' | 'medical';

export function classifyStaffDepartment(member: StaffRecord): StaffDepartmentGroup {
  const roleLower = (member.role || '').toLowerCase();
  if (
    /physio|doctor|medic|sport.?scien|rehab|head of sports science|head physio/.test(
      roleLower
    )
  ) {
    return 'medical';
  }
  if (
    /scout|recruit|director of football|technical director|analyst|data|loan manager|chief scout/.test(
      roleLower
    )
  ) {
    return 'scouting';
  }
  if (
    /coach|manager|assistant|goalkeep|fitness|set piece|head of youth|u21|u19|u18/.test(
      roleLower
    )
  ) {
    return 'coaching';
  }
  const best = getBestStaffRoleRating(member);
  if (best.category === 'Medical') return 'medical';
  if (best.category === 'Scouting & Analysis') return 'scouting';
  return 'coaching';
}

export interface CoachingCategoryMatrixRow {
  key: string;
  label: string;
  leadCoachName: string;
  leadCoachRole: string;
  stars: number;
  score: number;
  qualifiedCount: number;
  workload: 'Light' | 'Average' | 'Heavy / Overloaded';
}

const COACHING_MATRIX_KEYS: Array<{ key: string; label: string }> = [
  { key: 'att_tech', label: 'Attacking — Technical' },
  { key: 'att_tac', label: 'Attacking — Tactical' },
  { key: 'def_tech', label: 'Defending — Technical' },
  { key: 'def_tac', label: 'Defending — Tactical' },
  { key: 'pos_tech', label: 'Possession — Technical' },
  { key: 'pos_tac', label: 'Possession — Tactical' },
  { key: 'set_pieces', label: 'Set Pieces' },
  { key: 'fitness', label: 'Fitness (Strength / Quickness)' },
  { key: 'goalkeeping', label: 'Goalkeeping' },
];

/**
 * Deterministic 9-category FM27 Coaching Rating Matrix with workload/overload indicators.
 * Uses FM27 star weighting (specialist attributes + Determination, Authority, Motivating 2x).
 */
export function buildCoachingCategoryMatrix(
  staffList: StaffRecord[]
): CoachingCategoryMatrixRow[] {
  const coaches = staffList.filter((m) => classifyStaffDepartment(m) === 'coaching');
  const pool = coaches.length > 0 ? coaches : staffList;

  return COACHING_MATRIX_KEYS.map((cat) => {
    let bestMember: StaffRecord | null = null;
    let bestRating: StaffRoleRating | null = null;
    let qualifiedCount = 0;

    for (const member of pool) {
      const rating = calculateAllStaffRoleRatings(member.attributes).find(
        (r) => r.key === cat.key
      );
      if (!rating) continue;
      if (rating.stars >= 2.5) {
        qualifiedCount += 1;
      }
      if (!bestRating || rating.score > bestRating.score) {
        bestRating = rating;
        bestMember = member;
      }
    }

    const stars = bestRating ? bestRating.stars : 0.5;
    const score = bestRating ? bestRating.score : 15;
    const workload: CoachingCategoryMatrixRow['workload'] =
      pool.length <= 3 || qualifiedCount === 0
        ? 'Heavy / Overloaded'
        : qualifiedCount === 1
          ? 'Average'
          : 'Light';

    return {
      key: cat.key,
      label: cat.label,
      leadCoachName: bestMember ? bestMember.name : 'Unassigned',
      leadCoachRole: bestMember ? bestMember.role : '--',
      stars,
      score,
      qualifiedCount,
      workload,
    };
  });
}

function parseFmDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '--' || trimmed === 'Unknown') return null;

  // UK FM27 format: DD/MM/YYYY (or DD-MM-YYYY)
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](20\d{2})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }

  // ISO format: YYYY-MM-DD
  const iso = trimmed.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/**
 * Flags staff contracts expiring within ~6 months of the save date (or in the current save year).
 */
export function isStaffContractExpiringSoon(
  expires: string | undefined,
  saveDate?: string
): boolean {
  if (!expires || expires === '--' || expires === 'Unknown') return false;
  const expYearMatch = expires.match(/(20\d{2})/);
  if (!expYearMatch) return false;
  const expYear = Number(expYearMatch[1]);

  const refDate = parseFmDate(saveDate) ?? new Date();
  const refYear = refDate.getUTCFullYear();

  const parsedExp = parseFmDate(expires);
  if (parsedExp) {
    const diffDays =
      (parsedExp.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 190;
  }
  return expYear <= refYear;
}


