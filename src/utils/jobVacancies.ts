import { JobVacancyEntry } from '../types/fmSave';

/** fmsave StaffJob codes; only codes confirmed by in-game staff screens are named. */
const JOB_ROLE_LABELS: Record<number, string> = {
  2: 'Coach',
  4: 'Chairperson',
  6: 'Director',
  8: 'Managing Director',
  10: 'Director of Football',
  12: 'Physio',
  14: 'Scout',
  16: 'Manager',
  20: 'Assistant Manager',
  22: 'Set-Piece Coach',
  26: 'Fitness Coach',
  34: 'Goalkeeping Coach',
  38: 'Chief Doctor',
  40: 'Head of Sports Science',
  44: 'Chief Scout',
  46: 'Doctor',
  48: 'Sports Scientist',
  50: 'Head Physio',
  58: 'Recruitment Analyst',
  60: 'Performance Analyst',
  62: 'Head Performance Analyst',
  64: 'Head of Youth Development',
  66: 'Owner',
  70: 'President',
  86: 'Loan Manager',
  88: 'Technical Director',
};

function readRoleCode(unknown: unknown): number | null {
  if (typeof unknown === 'number' && Number.isFinite(unknown)) return unknown;
  if (unknown && typeof unknown === 'object') {
    const role = (unknown as { role?: unknown }).role;
    return typeof role === 'number' && Number.isFinite(role) ? role : null;
  }
  if (typeof unknown !== 'string') return null;
  const match = unknown.match(/\brole\b['"]?\s*:\s*(-?\d+)/);
  if (!match) return null;
  const code = Number(match[1]);
  return Number.isFinite(code) ? code : null;
}

/**
 * fmsave job vacancies use `club_name`/`competition_name` and put the job code inside the
 * `unknown` map. Normalize that once so the Staff directory and Analyst can show a real
 * role instead of filtering every row as a generic "Staff · Club" placeholder.
 */
export function normalizeJobVacancy(
  vacancy: JobVacancyEntry,
  index = 0
): JobVacancyEntry {
  const raw = vacancy as Record<string, unknown>;
  const roleCode = readRoleCode(raw.unknown);
  const rawRole =
    typeof vacancy.role === 'string' && vacancy.role.trim()
      ? vacancy.role.trim()
      : typeof vacancy.role === 'number'
        ? JOB_ROLE_LABELS[vacancy.role] ?? null
        : null;
  const role =
    rawRole ?? (roleCode !== null ? JOB_ROLE_LABELS[roleCode] : undefined) ?? 'Staff';
  const club =
    (typeof vacancy.club === 'string' && vacancy.club.trim()) ||
    (typeof raw.club_name === 'string' && raw.club_name.trim()) ||
    'Unknown';
  const league =
    (typeof vacancy.league === 'string' && vacancy.league.trim()) ||
    (typeof raw.competition_name === 'string' && raw.competition_name.trim()) ||
    undefined;

  return {
    ...vacancy,
    role,
    club,
    league,
    advertisedDate:
      typeof raw.advertised_date === 'string' ? raw.advertised_date : null,
    leaguePosition:
      typeof raw.league_position === 'number' ? raw.league_position : null,
    teamSlot: typeof raw.team_slot === 'number' ? raw.team_slot : null,
    roleCode,
    vacancyIndex: index,
  };
}
