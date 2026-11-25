import { StaffAttributes, StaffJobRatings, StaffRecord } from '../types/fm27';

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

export type StaffJobEligibility =
  | 'coaching'
  | 'recruitment'
  | 'medical'
  | 'board';

const MEDICAL_ROLE_RE = /physio|doctor|medic|sport\w*\s*scien|rehab/;
const RECRUITMENT_ROLE_RE =
  /scout|recruit|director of football|technical director|loan manager|analyst|data/;
const COACHING_ROLE_RE =
  /manager|assistant|coach|goalkeep|fitness|set.?piece|head of youth|hoyd|u21|u19|u18/;
const BOARD_ROLE_RE =
  /\b(chairperson|chairman|owner|president|managing director|board director|board member)\b/;

/** Board / Executive roles are club leadership, never a coaching, scouting, or medical post. */
export function isBoardExecutiveRole(role: string | null | undefined): boolean {
  return BOARD_ROLE_RE.test((role || '').toLowerCase());
}

/**
 * Real FM27 job eligibility, used to stop a Chief Scout leading Attacking training or a
 * Manager showing a Medical rating. Explicit role matches win; unrecognised roles fall back
 * to the attribute-driven department so custom roles still land somewhere sensible.
 */
export function resolveStaffJobEligibility(member: StaffRecord): StaffJobEligibility {
  const role = (member.role || '').toLowerCase();
  // Board first: a Managing Director is leadership, not a Manager or a Technical Director.
  if (isBoardExecutiveRole(role)) return 'board';
  if (MEDICAL_ROLE_RE.test(role)) return 'medical';
  if (RECRUITMENT_ROLE_RE.test(role)) return 'recruitment';
  if (COACHING_ROLE_RE.test(role)) return 'coaching';
  const best = calculateAllStaffRoleRatings(member.attributes)[0];
  if (best?.category === 'Medical') return 'medical';
  if (best?.category === 'Scouting & Analysis') return 'recruitment';
  return 'coaching';
}

const COACHING_RATING_KEYS = [
  'att_tech',
  'att_tac',
  'def_tech',
  'def_tac',
  'pos_tech',
  'pos_tac',
  'set_pieces',
  'fitness',
  'goalkeeping',
];
const RECRUITMENT_RATING_KEYS = ['scouting', 'analysis'];
const MEDICAL_RATING_KEYS = ['medical'];

const DEPARTMENT_RATING_KEYS: Record<StaffJobEligibility, string[]> = {
  coaching: COACHING_RATING_KEYS,
  recruitment: RECRUITMENT_RATING_KEYS,
  medical: MEDICAL_RATING_KEYS,
  // No board-specific rating exists in FM27; board cards keep their best available fit
  // but are labelled BOARD and are never eligible for a training or specialist unit.
  board: [],
};

/**
 * Ratings scoped to the member's actual job family, highest first. A Scout is scored on
 * Scouting/Analysis, a Physio on Medical, a Manager/Coach on their best coaching fit.
 */
export function getDepartmentStaffRoleRatings(staff: StaffRecord): StaffRoleRating[] {
  const all = calculateAllStaffRoleRatings(staff.attributes);
  const keys = DEPARTMENT_RATING_KEYS[resolveStaffJobEligibility(staff)];
  const scoped = all.filter((r) => keys.includes(r.key));
  return scoped.length > 0 ? scoped : all;
}

/** Headline star rating for a staff card, scored on the member's actual department first. */
export function getHeadlineStaffRoleRating(staff: StaffRecord): StaffRoleRating {
  return getDepartmentStaffRoleRatings(staff)[0];
}

export interface StaffHeadlineDisplay {
  label: string;
  /** Null for Board/Executive staff: FM27 has no board rating, so never imply a coaching score. */
  stars: number | null;
}

/** Display headline shared by the Staff card, detail modal, and Analyst prompt. */
export function getStaffHeadlineDisplay(staff: StaffRecord): StaffHeadlineDisplay {
  if (classifyStaffDepartment(staff) === 'board') {
    return {
      label: 'Board / Executive (no coaching rating)',
      stars: null,
    };
  }
  const headline = getHeadlineStaffRoleRating(staff);
  return { label: headline.label, stars: headline.stars };
}

/** @deprecated Use `getHeadlineStaffRoleRating`; kept so existing call sites stay department-aware. */
export function getBestStaffRoleRating(staff: StaffRecord): StaffRoleRating {
  return getHeadlineStaffRoleRating(staff);
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
  eligibility: StaffJobEligibility;
}> = [
  {
    id: 'attacking',
    label: 'Attacking Coaching',
    ratingKeys: ['att_tech', 'att_tac'],
    eligibility: 'coaching',
  },
  {
    id: 'defending',
    label: 'Defending Coaching',
    ratingKeys: ['def_tech', 'def_tac'],
    eligibility: 'coaching',
  },
  {
    id: 'possession',
    label: 'Possession & Tactical',
    ratingKeys: ['pos_tech', 'pos_tac'],
    eligibility: 'coaching',
  },
  {
    id: 'fitness',
    label: 'Strength & Quickness',
    ratingKeys: ['fitness'],
    eligibility: 'coaching',
  },
  {
    id: 'goalkeeping',
    label: 'Goalkeeping Coaching',
    ratingKeys: ['goalkeeping'],
    eligibility: 'coaching',
  },
  {
    id: 'set_pieces',
    label: 'Set Pieces Coaching',
    ratingKeys: ['set_pieces'],
    eligibility: 'coaching',
  },
  {
    id: 'scouting',
    label: 'Scouting & Recruitment',
    ratingKeys: ['scouting', 'analysis'],
    eligibility: 'recruitment',
  },
  {
    id: 'medical',
    label: 'Medical & Sports Science',
    ratingKeys: ['medical'],
    eligibility: 'medical',
  },
];

/**
 * Evaluates all 8 backroom departments across the club's synced staff list (inspired by fm-scoring)
 * to highlight the top lead specialist per department and flag weak/understaffed areas.
 * Each department only considers staff whose real FM job makes them eligible: a Chief Scout
 * never leads Attacking coaching and a Manager never shows a Medical lead.
 */
export function evaluateBackroomDepartmentEfficiency(
  staffList: StaffRecord[]
): BackroomDepartmentSummary[] {
  return DEPARTMENT_SPECS.map((dept) => {
    const eligible = staffList.filter(
      (member) => resolveStaffJobEligibility(member) === dept.eligibility
    );
    let bestLead: StaffRecord | null = null;
    let bestRating: StaffRoleRating | null = null;

    for (const member of eligible) {
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

export type StaffDepartmentGroup =
  | 'coaching'
  | 'scouting'
  | 'medical'
  | 'board';

export function classifyStaffDepartment(member: StaffRecord): StaffDepartmentGroup {
  const eligibility = resolveStaffJobEligibility(member);
  return eligibility === 'recruitment' ? 'scouting' : eligibility;
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
  /** How many of the 9 pitch-training units this row's lead coach is carrying. */
  leadUnitCount: number;
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

interface CoachingMatrixDraft
  extends Omit<CoachingCategoryMatrixRow, 'workload' | 'leadUnitCount'> {
  leadStaffId: string | null;
}

/**
 * Deterministic 9-category FM27 Coaching Rating Matrix with workload/overload indicators.
 * Only coaching-eligible staff (Manager, Assistant, Coaches, GK/Fitness/Set Piece Coaches,
 * HoYD) are considered, so a Chief Scout or Physio can never lead a training unit.
 */
export function buildCoachingCategoryMatrix(
  staffList: StaffRecord[]
): CoachingCategoryMatrixRow[] {
  const pool = staffList.filter(
    (m) => resolveStaffJobEligibility(m) === 'coaching'
  );

  const drafts = COACHING_MATRIX_KEYS.map((cat): CoachingMatrixDraft => {
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
      // Best attributes win: never force the GK Coach ahead of a Manager who scores higher.
      if (!bestRating || rating.score > bestRating.score) {
        bestRating = rating;
        bestMember = member;
      }
    }

    const stars = bestRating ? bestRating.stars : 0.5;
    const score = bestRating ? bestRating.score : 15;

    return {
      key: cat.key,
      label: cat.label,
      leadCoachName: bestMember ? bestMember.name : 'Unassigned',
      leadCoachRole: bestMember ? bestMember.role : '--',
      stars,
      score,
      qualifiedCount,
      leadStaffId: bestMember ? bestMember.id : null,
    };
  });

  // A strong Manager often wins every unit, so the old per-unit qualified count called
  // that "Light". FM27 training is hurt when one person carries 3+ categories.
  const leadCounts = new Map<string, number>();
  for (const row of drafts) {
    if (!row.leadStaffId) continue;
    leadCounts.set(
      row.leadStaffId,
      (leadCounts.get(row.leadStaffId) ?? 0) + 1
    );
  }

  return drafts.map(({ leadStaffId, ...row }) => {
    const leadUnitCount = leadStaffId
      ? (leadCounts.get(leadStaffId) ?? 0)
      : 0;
    const workload: CoachingCategoryMatrixRow['workload'] =
      leadUnitCount >= 3 || pool.length <= 3 || row.qualifiedCount === 0
        ? 'Heavy / Overloaded'
        : leadUnitCount === 2 || row.qualifiedCount === 1
          ? 'Average'
          : 'Light';
    return { ...row, workload, leadUnitCount };
  });
}

export interface UnifiedStaffMatrixRow {
  key: string;
  label: string;
  group: 'Pitch Training' | 'Scouting & Recruitment' | 'Medical & Sports Science';
  leadStaffName: string;
  leadStaffRole: string;
  stars: number;
  score: number;
  qualifiedCount: number;
  workload: CoachingCategoryMatrixRow['workload'] | 'n/a';
  leadUnitCount: number;
}

const NON_COACHING_MATRIX_SPECS: Array<{
  key: string;
  label: string;
  group: UnifiedStaffMatrixRow['group'];
  eligibility: StaffJobEligibility;
  ratingKeys: string[];
}> = [
  {
    key: 'scouting',
    label: 'Scouting & Recruitment',
    group: 'Scouting & Recruitment',
    eligibility: 'recruitment',
    ratingKeys: RECRUITMENT_RATING_KEYS,
  },
  {
    key: 'medical',
    label: 'Medical & Sports Science',
    group: 'Medical & Sports Science',
    eligibility: 'medical',
    ratingKeys: MEDICAL_RATING_KEYS,
  },
];

/**
 * One merged, single-scale staff matrix: the 9 pitch-training units plus Scouting and
 * Medical, each with the best eligible lead on the same star scale. Replaces the two
 * near-identical 8-card walls that used to stack above the staff list.
 */
export function buildUnifiedStaffMatrix(
  staffList: StaffRecord[]
): UnifiedStaffMatrixRow[] {
  const coachingRows: UnifiedStaffMatrixRow[] = buildCoachingCategoryMatrix(
    staffList
  ).map((row) => ({
    key: row.key,
    label: row.label,
    group: 'Pitch Training',
    leadStaffName: row.leadCoachName,
    leadStaffRole: row.leadCoachRole,
    stars: row.stars,
    score: row.score,
    qualifiedCount: row.qualifiedCount,
    workload: row.workload,
    leadUnitCount: row.leadUnitCount,
  }));

  const specialistRows = NON_COACHING_MATRIX_SPECS.map((spec) => {
    const eligible = staffList.filter(
      (member) => resolveStaffJobEligibility(member) === spec.eligibility
    );
    let bestMember: StaffRecord | null = null;
    let bestRating: StaffRoleRating | null = null;
    let qualifiedCount = 0;

    for (const member of eligible) {
      const ratings = calculateAllStaffRoleRatings(member.attributes);
      const scoped = ratings.filter((r) => spec.ratingKeys.includes(r.key));
      const bestForMember = scoped[0];
      if (!bestForMember) continue;
      if (bestForMember.stars >= 2.5) qualifiedCount += 1;
      if (!bestRating || bestForMember.score > bestRating.score) {
        bestRating = bestForMember;
        bestMember = member;
      }
    }

    return {
      key: spec.key,
      label: spec.label,
      group: spec.group,
      leadStaffName: bestMember ? bestMember.name : 'Unassigned',
      leadStaffRole: bestMember ? bestMember.role : '--',
      stars: bestRating ? bestRating.stars : 0.5,
      score: bestRating ? bestRating.score : 15,
      qualifiedCount,
      workload: 'n/a' as const,
      leadUnitCount: 0,
    };
  });

  return [...coachingRows, ...specialistRows];
}

export interface StaffKpiSummary {
  totalStaff: number;
  weeklyPayrollLabel: string;
  expiringSoonCount: number;
  averageHeadlineStars: number | null;
  averageHeadlineLabel: string;
  weakDepartmentCount: number;
}

/** Shared KPI strip numbers for the Staff tab; payroll and expiry reuse the Analyst selectors. */
export function computeStaffKpiSummary(
  staffList: StaffRecord[],
  saveDate?: string
): StaffKpiSummary {
  const list = staffList ?? [];
  const expiringSoonCount = list.filter((s) =>
    isStaffContractExpiringSoon(s.expires, saveDate)
  ).length;
  // Board/Executive members have no coaching rating, so they never drag the staff average.
  const ratedStaff = list.filter(
    (s) => classifyStaffDepartment(s) !== 'board'
  );
  const averageHeadlineStars =
    ratedStaff.length > 0
      ? Math.round(
          (ratedStaff.reduce(
            (sum, s) => sum + getHeadlineStaffRoleRating(s).stars,
            0
          ) /
            ratedStaff.length) *
            10
        ) / 10
      : null;
  const weakDepartmentCount = evaluateBackroomDepartmentEfficiency(list).filter(
    (d) => d.status === 'Weak / Upgrade Needed'
  ).length;

  return {
    totalStaff: list.length,
    weeklyPayrollLabel: formatWeeklyStaffPayroll(computeWeeklyStaffPayroll(list)),
    expiringSoonCount,
    averageHeadlineStars,
    averageHeadlineLabel:
      averageHeadlineStars === null ? '--' : `${averageHeadlineStars.toFixed(1)}★`,
    weakDepartmentCount,
  };
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
 * Single "expiring soon" window for staff contracts, in days. The Staff tab and the Analyst
 * context both call `isStaffContractExpiringSoon`, so neither can drift from the other.
 */
export const STAFF_CONTRACT_EXPIRY_WINDOW_DAYS = 190;

/**
 * Flags staff contracts expiring within STAFF_CONTRACT_EXPIRY_WINDOW_DAYS of the save date
 * (or in the current save year when only a year can be parsed).
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
    return diffDays <= STAFF_CONTRACT_EXPIRY_WINDOW_DAYS;
  }
  return expYear <= refYear;
}

export interface WeeklyStaffPayroll {
  /** Total weekly staff wage; null when any counted wage is unreadable (never a silent 0). */
  totalWeekly: number | null;
  /** Sum of the wages that did decode, so a partial total can still be shown honestly. */
  knownWeekly: number;
  /** Salaried staff considered: excludes board/executive members with no contract at all. */
  staffCount: number;
  missingWageCount: number;
  /** Board/Executive members with no decoded wage; not salaried staff, so not counted as missing. */
  excludedWithoutContractCount: number;
}

/**
 * Canonical weekly staff payroll. Consumed by the Staff tab header and the Analyst context so
 * both quote the same number. A missing or non-positive wage makes the total null instead of
 * folding an unreadable contract into the sum as £0.
 */
export function computeWeeklyStaffPayroll(
  staff: ReadonlyArray<{ wagePw?: number | null; role?: string | null }> | null | undefined
): WeeklyStaffPayroll {
  const list = staff ?? [];
  let knownWeekly = 0;
  let missingWageCount = 0;
  let excludedWithoutContractCount = 0;
  for (const member of list) {
    const wage = member?.wagePw;
    const hasWage =
      typeof wage === 'number' && Number.isFinite(wage) && wage > 0;
    if (!hasWage && isBoardExecutiveRole(member?.role)) {
      excludedWithoutContractCount += 1;
      continue;
    }
    if (hasWage) {
      knownWeekly += wage;
    } else {
      missingWageCount += 1;
    }
  }
  return {
    totalWeekly: missingWageCount === 0 ? knownWeekly : null,
    knownWeekly,
    staffCount: list.length - excludedWithoutContractCount,
    missingWageCount,
    excludedWithoutContractCount,
  };
}

/**
 * Shared payroll label so the Staff tab and the Analyst print it identically. A partial
 * decode still shows the known sum, matching the squad wage subtotal's honest wording;
 * `--` is reserved for a save with zero decoded staff wages.
 */
export function formatWeeklyStaffPayroll(payroll: WeeklyStaffPayroll): string {
  if (payroll.staffCount === 0 || payroll.knownWeekly <= 0) return '--';
  if (payroll.missingWageCount === 0) {
    return `£${payroll.knownWeekly.toLocaleString()}/wk`;
  }
  return `£${payroll.knownWeekly.toLocaleString()}/wk known (${payroll.missingWageCount} of ${payroll.staffCount} without wage)`;
}

/**
 * One caption for the six FM27 job_ratings, shared verbatim by StaffDetailModal and the
 * Analyst prompt so neither surface can imply these numbers measure skill.
 */
export const PREFERRED_JOB_AFFINITY_CAPTION =
  'Preferred Job Affinity (0–20, NOT coaching/scouting ability — only indicates job preference across Fit/GK/Set/Loan/Phy/Sci; do NOT treat 20/20 as elite skill or 1/20 on a Scout/Manager as poor performance)';

const PREFERRED_JOB_ABBREVIATIONS: Array<[keyof StaffJobRatings, string]> = [
  ['fitness_coach', 'Fit'],
  ['goalkeeping_coach', 'GK'],
  ['set_piece_coach', 'Set'],
  ['loan_manager', 'Loan'],
  ['physio', 'Phy'],
  ['sports_scientist', 'Sci'],
];

/** One-line Preferred Jobs summary; unreadable ratings print `--` instead of a fake 0. */
export function formatStaffJobRatings(
  jobRatings: StaffJobRatings | null | undefined
): string {
  if (!jobRatings) return '--';
  return PREFERRED_JOB_ABBREVIATIONS.map(([key, label]) => {
    const value = jobRatings[key];
    return `${label} ${typeof value === 'number' ? value : '--'}`;
  }).join('/');
}


