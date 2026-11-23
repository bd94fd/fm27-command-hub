import type { MatchLogEntry } from '../types/fm27';

export type MatchCompetitionBucket = 'league' | 'cup' | 'friendly';
export type MatchCompetitionFilter =
  | 'competitive'
  | 'league'
  | 'cup'
  | 'friendly'
  | 'all';

export interface CompetitionBucketRecord {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  xgMatchesCount: number;
  xgFor: number | null;
  xgAgainst: number | null;
  xgDiff: number | null;
}

export interface CompetitionScopeBreakdown {
  seasonLabel: string;
  competitive: CompetitionBucketRecord;
  league: CompetitionBucketRecord;
  cup: CompetitionBucketRecord;
  friendly: CompetitionBucketRecord;
  all: CompetitionBucketRecord;
}

/**
 * Derives a European football season label (Jul 1 -> Jun 30) from DD/MM/YYYY or YYYY-MM-DD.
 * Example: '11/08/2027' -> '2027/28', '15/05/2027' -> '2026/27'.
 */
export function deriveFootballSeasonLabel(dateStr?: string | null): string {
  const s = (dateStr || '').trim();
  let year: number | null = null;
  let month: number | null = null;

  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else {
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
    }
  }

  if (!year || !month || month < 1 || month > 12) return 'Unknown Season';
  const startYear = month >= 7 ? year : year - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}/${endShort}`;
}

const AMBIGUOUS_FALLBACK_COMP_RE =
  /^(league\s*\/\s*cup|cup\s*\/\s*friendly|unclassified(?:\s+match)?|unknown|other|match|—|-)$/i;

const GROUP_STAGE_OR_LEAGUE_CUP_RE =
  /\b(champions\s+league|europa\s+league|conference\s+league|nations\s+league|world\s+cup|euro\s*20\d\d|copa\s+am[eé]rica|afcon|asian\s+cup|club\s+world\s+cup|checkatrade|efl\s+trophy|vertu\s+trophy|group\s+stage|league\s+phase)\b/i;

function isPreSeasonCalendarWindow(dateStr?: string | null): boolean {
  const s = (dateStr || '').trim();
  let month: number | null = null;
  let day: number | null = null;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
  } else {
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      month = Number(iso[2]);
      day = Number(iso[3]);
    }
  }
  if (!month || !day) return false;
  if (month === 6 && day >= 15) return true;
  if (month === 7) return true;
  if (month === 8 && day <= 18) return true;
  return false;
}

/**
 * Single source of truth for classifying any FM27 match competition string into
 * 'league', 'cup', or 'friendly'. Never lumps friendlies or ambiguous placeholders into cup.
 */
export function classifyMatchCompetitionBucket(
  competition?: string | null
): MatchCompetitionBucket {
  const c = (competition || '').trim().toLowerCase();
  if (!c) return 'friendly';

  if (
    /\bfriendly\b|\bfriendlies\b|friendly\s+cup|pre[- ]?season|testimonial|exhibition|non[-_ ]?comp|\breserve\b|\bu21\b|\bu19\b|\bu18\b|\byouth\b|\binternational\b|club friendly|match practice|vriendschappelijk|oefenwedstrijd|oefenduel|amical|amicaux|freundschaft|testspiel|amistoso|amichevole|inter-?squad|intra-?squad|training\s+match|summer\s+tour|trial(?:ist)?/i.test(
      c
    )
  ) {
    return 'friendly';
  }

  // Legacy ambiguous placeholders ("League / Cup", "Cup / Friendly", "Unclassified Match")
  // must NEVER inflate Cup counts.
  if (AMBIGUOUS_FALLBACK_COMP_RE.test(c)) {
    return 'friendly';
  }

  if (
    /\bcup\b|\bbeker\b|\bcoupe\b|\bpokal\b|\bcopa\b|\bcoppa\b|\btaca\b|\btaça\b|\btrophy\b|\bshield\b|super ?cup|knockout|champions league|europa league|conference league|croky|fa cup|efl cup|carabao|play-?off/i.test(
      c
    )
  ) {
    return 'cup';
  }

  return 'league';
}

/**
 * Context-aware match bucket classifier.
 * Detects legacy/cached FM saves where pre-season friendlies were dumped into a generic
 * single-elimination Cup bucket (impossible to suffer 2+ losses in one season in a knockout cup!).
 */
export function classifyMatchEntryBucket(
  match: Pick<MatchLogEntry, 'competition' | 'date' | 'result'>,
  contextMatches?: ReadonlyArray<Pick<MatchLogEntry, 'competition' | 'date' | 'result'>>
): MatchCompetitionBucket {
  const base = classifyMatchCompetitionBucket(match.competition);
  if (base !== 'cup') return base;

  const compRaw = (match.competition || '').trim();
  if (GROUP_STAGE_OR_LEAGUE_CUP_RE.test(compRaw)) return 'cup';
  if (!contextMatches || contextMatches.length < 2) return base;

  const matchSeason = deriveFootballSeasonLabel(match.date);
  const compKey = compRaw.toLowerCase();
  const sameSeasonSameComp = contextMatches.filter(
    (m) =>
      (m.competition || '').trim().toLowerCase() === compKey &&
      deriveFootballSeasonLabel(m.date) === matchSeason
  );

  // Impossible in a single-elimination domestic cup to lose 2+ matches in the same season.
  const lossesInSameComp = sameSeasonSameComp.filter((m) => m.result === 'L').length;
  if (lossesInSameComp >= 2) {
    return 'friendly';
  }

  // Generic "Domestic Cup" / "Cup" played exclusively inside the pre-season window (3+ matches)
  const isGenericCup = /^(domestic\s+cup|cup)$/i.test(compRaw);
  if (
    isGenericCup &&
    sameSeasonSameComp.length >= 3 &&
    sameSeasonSameComp.every((m) => isPreSeasonCalendarWindow(m.date))
  ) {
    return 'friendly';
  }

  return base;
}

export function matchesCompetitionFilter(
  competition: string | null | undefined,
  filter: MatchCompetitionFilter
): boolean {
  if (filter === 'all') return true;
  const bucket = classifyMatchCompetitionBucket(competition);
  if (filter === 'competitive') return bucket === 'league' || bucket === 'cup';
  return bucket === filter;
}

export function matchesEntryCompetitionFilter(
  match: Pick<MatchLogEntry, 'competition' | 'date' | 'result'>,
  filter: MatchCompetitionFilter,
  contextMatches?: ReadonlyArray<Pick<MatchLogEntry, 'competition' | 'date' | 'result'>>
): boolean {
  if (filter === 'all') return true;
  const bucket = classifyMatchEntryBucket(match, contextMatches);
  if (filter === 'competitive') return bucket === 'league' || bucket === 'cup';
  return bucket === filter;
}

export function formatCompetitionBucketTag(
  bucket: MatchCompetitionBucket
): string {
  if (bucket === 'league') return 'LGE';
  if (bucket === 'cup') return 'CUP';
  return 'FRD';
}

export function formatCompetitionFilterLabel(
  filter: MatchCompetitionFilter
): string {
  switch (filter) {
    case 'competitive':
      return 'Competitive (League + Cup)';
    case 'league':
      return 'League Only';
    case 'cup':
      return 'Cup Only';
    case 'friendly':
      return 'Friendlies Only';
    case 'all':
      return 'All Matches';
  }
}

export function parseScoreGoals(score?: string | null): [number, number] {
  const m = (score || '').match(/(\d+)\s*[-–:]\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

export function buildBucketRecord(
  matches: MatchLogEntry[]
): CompetitionBucketRecord {
  let won = 0;
  let drawn = 0;
  let lost = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let xgMatchesCount = 0;
  let xgForSum = 0;
  let xgAgainstSum = 0;

  for (const m of matches) {
    if (m.result === 'W') won += 1;
    else if (m.result === 'D') drawn += 1;
    else if (m.result === 'L') lost += 1;

    const [gf, ga] = parseScoreGoals(m.score);
    goalsFor += gf;
    goalsAgainst += ga;

    if (typeof m.xGFor === 'number' && typeof m.xGAgainst === 'number') {
      xgMatchesCount += 1;
      xgForSum += m.xGFor;
      xgAgainstSum += m.xGAgainst;
    }
  }

  const xgFor = xgMatchesCount > 0 ? Number(xgForSum.toFixed(2)) : null;
  const xgAgainst = xgMatchesCount > 0 ? Number(xgAgainstSum.toFixed(2)) : null;
  const xgDiff =
    xgFor !== null && xgAgainst !== null
      ? Number((xgFor - xgAgainst).toFixed(2))
      : null;

  return {
    played: matches.length,
    won,
    drawn,
    lost,
    goalsFor,
    goalsAgainst,
    points: won * 3 + drawn,
    xgMatchesCount,
    xgFor,
    xgAgainst,
    xgDiff,
  };
}

export function extractMatchSeasons(
  matches: MatchLogEntry[],
  currentSaveDate?: string | null
): { seasons: string[]; currentSeason: string } {
  const set = new Set<string>();
  for (const m of matches) {
    const label = deriveFootballSeasonLabel(m.date);
    if (label !== 'Unknown Season') set.add(label);
  }
  const seasons = Array.from(set).sort((a, b) => b.localeCompare(a));
  const fromSave = deriveFootballSeasonLabel(currentSaveDate);
  if (fromSave !== 'Unknown Season' && seasons.includes(fromSave)) {
    return { seasons, currentSeason: fromSave };
  }
  if (seasons.length > 0) {
    return { seasons, currentSeason: seasons[0] };
  }
  return {
    seasons: fromSave !== 'Unknown Season' ? [fromSave] : [],
    currentSeason: fromSave !== 'Unknown Season' ? fromSave : 'ALL',
  };
}

export function summarizeMatchesByScope(
  matches: MatchLogEntry[],
  seasonFilter?: string | null
): CompetitionScopeBreakdown {
  const effectiveSeason =
    seasonFilter && seasonFilter !== 'ALL' && seasonFilter !== 'Unknown Season'
      ? seasonFilter
      : 'All Seasons';

  const scoped =
    effectiveSeason === 'All Seasons'
      ? matches
      : matches.filter((m) => deriveFootballSeasonLabel(m.date) === effectiveSeason);

  const leagueMatches: MatchLogEntry[] = [];
  const cupMatches: MatchLogEntry[] = [];
  const friendlyMatches: MatchLogEntry[] = [];

  for (const m of scoped) {
    const b = classifyMatchEntryBucket(m, scoped);
    if (b === 'league') leagueMatches.push(m);
    else if (b === 'cup') cupMatches.push(m);
    else friendlyMatches.push(m);
  }

  return {
    seasonLabel: effectiveSeason,
    competitive: buildBucketRecord([...leagueMatches, ...cupMatches]),
    league: buildBucketRecord(leagueMatches),
    cup: buildBucketRecord(cupMatches),
    friendly: buildBucketRecord(friendlyMatches),
    all: buildBucketRecord(scoped),
  };
}

/**
 * Formats signed currency deltas cleanly: -103 -> '-£103', 103 -> '+£103', 0 -> '£0'.
 */
export function formatSignedCurrency(amount: number, symbol = '£'): string {
  const rounded = Math.round(amount);
  if (rounded === 0) return `${symbol}0`;
  const sign = rounded > 0 ? '+' : '-';
  return `${sign}${symbol}${Math.abs(rounded).toLocaleString()}`;
}

export function formatBucketCompactSummary(
  rec: CompetitionBucketRecord
): string {
  if (rec.played === 0) return '0 GP';
  const base = `${rec.played} GP (${rec.won}W-${rec.drawn}D-${rec.lost}L, ${rec.goalsFor}:${rec.goalsAgainst})`;
  if (rec.xgFor !== null && rec.xgAgainst !== null && rec.xgDiff !== null) {
    return `${base} · xG ${rec.xgFor.toFixed(2)}-${rec.xgAgainst.toFixed(2)} (${rec.xgDiff >= 0 ? '+' : ''}${rec.xgDiff.toFixed(2)})`;
  }
  return base;
}
