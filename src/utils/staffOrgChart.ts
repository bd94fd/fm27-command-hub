import { StaffRecord } from '../types/fm27';
import {
  StaffDepartmentGroup,
  classifyStaffDepartment,
  getDepartmentStaffRoleRatings,
  getStaffHeadlineDisplay,
  staffContractDaysRemaining,
  STAFF_CONTRACT_EXPIRY_WINDOW_DAYS,
} from './staffRatings';

/**
 * FM27 saves carry a job title, not a reporting line. This chart therefore groups staff by
 * department and marks the most senior job title in each as the head. Anything else would be
 * an invented hierarchy, so the UI states the rule instead of implying the save knows it.
 */
export type StaffOrgLeadSource = 'title' | 'rating' | 'none';

export interface StaffOrgPerson {
  id: string;
  name: string;
  role: string;
  age: number;
  department: StaffDepartmentGroup;
  /** Null for Board/Executive staff, who have no coaching rating in FM27. */
  stars: number | null;
  ratingLabel: string;
  wagePw: number | null;
  expires: string;
  daysRemaining: number | null;
  secondaryJob: string | null;
  isLead: boolean;
  /** Name of the head this person reports to in the chart, or null for the head itself. */
  reportsTo: string | null;
}

export interface StaffOrgCoverageSlot {
  role: string;
  filledBy: string[];
}

export type StaffOrgRiskId =
  | 'no-head'
  | 'empty-department'
  | 'single-person'
  | 'head-expiring'
  | 'duplicate-head-title'
  | 'unpriced-wage';

export interface StaffOrgRisk {
  id: StaffOrgRiskId;
  severity: 'critical' | 'warning' | 'info';
  text: string;
}

export interface StaffOrgDepartment {
  id: StaffDepartmentGroup;
  label: string;
  lead: StaffOrgPerson | null;
  leadSource: StaffOrgLeadSource;
  members: StaffOrgPerson[];
  headcount: number;
  wageWeekly: number;
  unpricedCount: number;
  coverage: StaffOrgCoverageSlot[];
  missingRoles: string[];
  risks: StaffOrgRisk[];
}

export interface StaffOrgChart {
  departments: StaffOrgDepartment[];
  headcount: number;
  wageWeekly: number;
  unpricedCount: number;
  gapCount: number;
  /** Plain-English statement of how the heads were chosen. */
  rule: string;
}

const DEPARTMENT_ORDER: StaffDepartmentGroup[] = [
  'coaching',
  'scouting',
  'medical',
  'board',
];

const DEPARTMENT_LABELS: Record<StaffDepartmentGroup, string> = {
  coaching: 'Coaching',
  scouting: 'Recruitment',
  medical: 'Medical',
  board: 'Board',
};

/**
 * Job titles that head a department, most senior first. Matched case-insensitively against
 * the full role string, so "Assistant Manager" is not mistaken for "Manager".
 */
const LEAD_TITLES: Record<StaffDepartmentGroup, string[]> = {
  coaching: ['manager', 'assistant manager', 'head of youth development', 'coach'],
  scouting: [
    'director of football',
    'technical director',
    'chief scout',
    'head performance analyst',
    'loan manager',
  ],
  medical: ['head physio', 'chief doctor', 'head of sports science', 'doctor', 'physio'],
  board: ['chairperson', 'chairman', 'owner', 'president', 'managing director', 'director'],
};

/** Standard FM27 backroom jobs per department, used for the coverage checklist. */
const STANDARD_ROLES: Record<StaffDepartmentGroup, string[]> = {
  coaching: [
    'Manager',
    'Assistant Manager',
    'Coach',
    'Goalkeeping Coach',
    'Fitness Coach',
    'Set Piece Coach',
    'Head Of Youth Development',
  ],
  scouting: [
    'Director Of Football',
    'Technical Director',
    'Chief Scout',
    'Scout',
    'Recruitment Analyst',
    'Performance Analyst',
    'Loan Manager',
  ],
  medical: ['Head Physio', 'Physio', 'Doctor', 'Sports Scientist'],
  board: ['Chairperson', 'Managing Director', 'Director'],
};

const normalise = (value: string | null | undefined): string =>
  (value || '').trim().toLowerCase();

/** Exact job match for coverage, so "Coach" does not count as "Goalkeeping Coach". */
const matchesRole = (member: StaffRecord, role: string): boolean =>
  normalise(member.role) === normalise(role);

const matchesLeadTitle = (member: StaffRecord, title: string): boolean => {
  const role = normalise(member.role);
  if (title === 'manager') return role === 'manager';
  if (title === 'coach') return role === 'coach';
  if (title === 'physio') return role === 'physio';
  if (title === 'doctor') return role === 'doctor';
  return role.includes(title);
};

const toPerson = (member: StaffRecord, saveDate: string): StaffOrgPerson => {
  const headline = getStaffHeadlineDisplay(member);
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    age: member.age,
    department: classifyStaffDepartment(member),
    stars: headline.stars,
    ratingLabel: headline.label,
    wagePw: member.wagePw,
    expires: member.expires,
    daysRemaining: staffContractDaysRemaining(member.expires, saveDate),
    secondaryJob: member.secondaryJob ?? null,
    isLead: false,
    reportsTo: null,
  };
};

const ratingScore = (member: StaffRecord): number =>
  getDepartmentStaffRoleRatings(member)[0]?.score ?? 0;

const pickLead = (
  department: StaffDepartmentGroup,
  pool: StaffRecord[]
): { lead: StaffRecord | null; source: StaffOrgLeadSource } => {
  if (pool.length === 0) return { lead: null, source: 'none' };
  for (const title of LEAD_TITLES[department]) {
    const candidates = pool.filter((member) => matchesLeadTitle(member, title));
    if (candidates.length > 0) {
      const lead = [...candidates].sort(
        (a, b) => ratingScore(b) - ratingScore(a) || a.name.localeCompare(b.name)
      )[0];
      return { lead, source: 'title' };
    }
  }
  const byRating = [...pool].sort(
    (a, b) => ratingScore(b) - ratingScore(a) || a.name.localeCompare(b.name)
  )[0];
  return { lead: byRating, source: 'rating' };
};

const buildDepartment = (
  department: StaffDepartmentGroup,
  staffList: StaffRecord[],
  saveDate: string
): StaffOrgDepartment => {
  const pool = staffList.filter((member) => classifyStaffDepartment(member) === department);
  const { lead: leadRecord, source } = pickLead(department, pool);

  const people = pool.map((member) => toPerson(member, saveDate));

  const lead = leadRecord
    ? { ...people.find((person) => person.id === leadRecord.id)!, isLead: true }
    : null;
  const members = people
    .filter((person) => person.id !== lead?.id)
    .map((person) => ({ ...person, reportsTo: lead ? lead.name : null }))
    .sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1) || a.name.localeCompare(b.name));

  const ordered = lead ? [lead, ...members] : members;

  const coverage: StaffOrgCoverageSlot[] = STANDARD_ROLES[department].map((role) => ({
    role,
    filledBy: pool.filter((member) => matchesRole(member, role)).map((member) => member.name),
  }));
  const missingRoles = coverage.filter((slot) => slot.filledBy.length === 0).map((slot) => slot.role);

  const unpriced = pool.filter((member) => member.wagePw === null);
  const wageWeekly = pool.reduce((sum, member) => sum + (member.wagePw ?? 0), 0);

  const risks: StaffOrgRisk[] = [];
  if (pool.length === 0) {
    risks.push({
      id: 'empty-department',
      severity: 'warning',
      text: `No ${DEPARTMENT_LABELS[department].toLowerCase()} staff in this save.`,
    });
  }
  // A one-person board is normal in FM27, so it is not a risk.
  if (pool.length === 1 && lead && department !== 'board') {
    risks.push({
      id: 'single-person',
      severity: 'warning',
      text: `${lead.name} is the only ${DEPARTMENT_LABELS[department].toLowerCase()} staff member.`,
    });
  }
  if (lead && source === 'rating') {
    risks.push({
      id: 'no-head',
      severity: 'warning',
      text: `No head-of-department job in this save; ${lead.name} is shown as acting head on rating.`,
    });
  }
  if (
    lead &&
    lead.daysRemaining !== null &&
    lead.daysRemaining >= 0 &&
    lead.daysRemaining <= STAFF_CONTRACT_EXPIRY_WINDOW_DAYS
  ) {
    risks.push({
      id: 'head-expiring',
      severity: 'critical',
      text: `${lead.name}'s contract runs out in ${lead.daysRemaining} days.`,
    });
  }
  if (lead && source === 'title') {
    const sameTitle = pool.filter((member) => normalise(member.role) === normalise(lead.role));
    if (sameTitle.length > 1) {
      risks.push({
        id: 'duplicate-head-title',
        severity: 'info',
        text: `${sameTitle.length} people hold the ${lead.role} job, so the save does not say which squad each covers.`,
      });
    }
  }
  if (unpriced.length > 0) {
    risks.push({
      id: 'unpriced-wage',
      severity: 'info',
      text: `${unpriced.length} of ${pool.length} ${unpriced.length === 1 ? 'wage did not decode and is' : 'wages did not decode and are'} left out of the department total.`,
    });
  }

  return {
    id: department,
    label: DEPARTMENT_LABELS[department],
    lead,
    leadSource: source,
    members,
    headcount: ordered.length,
    wageWeekly,
    unpricedCount: unpriced.length,
    coverage,
    missingRoles,
    risks,
  };
};

export const STAFF_ORG_CHART_RULE =
  'FM27 saves store a job title, not a reporting line. Each department here is headed by its most senior job title in the save (Manager, Chief Scout, Head Physio and so on); everyone else in that department is listed under that head.';

/** Groups club staff into departments with an inferred head, coverage gaps and risks. */
export function buildStaffOrgChart(
  staffList: StaffRecord[],
  saveDate: string
): StaffOrgChart {
  const departments = DEPARTMENT_ORDER.map((department) =>
    buildDepartment(department, staffList, saveDate)
  );

  return {
    departments,
    headcount: departments.reduce((sum, department) => sum + department.headcount, 0),
    wageWeekly: departments.reduce((sum, department) => sum + department.wageWeekly, 0),
    unpricedCount: departments.reduce((sum, department) => sum + department.unpricedCount, 0),
    gapCount: departments.reduce(
      (sum, department) =>
        sum +
        (department.id === 'board' ? 0 : department.missingRoles.length) +
        (department.headcount === 0 ? 1 : 0),
      0
    ),
    rule: STAFF_ORG_CHART_RULE,
  };
}
