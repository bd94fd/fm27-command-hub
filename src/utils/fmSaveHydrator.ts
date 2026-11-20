import { MatchLogEntry, PlayerRecord, StaffRecord } from '../types/fm27';
import { normalizePlayerName } from './fmFileImporter';
import { inferFm27Roles } from './fm27RoleMatcher';

export interface DecodedFmSavePlayer {
  uid: number;
  name: string;
  position: string;
  age: number;
  heightCm?: number;
  ca: number;
  pa: number;
  condition: number | null;
  sharpness: number | null;
  leftFoot?: number;
  rightFoot?: number;
  preferredFoot?: 'Left' | 'Right' | 'Either';
  wagePw: number;
  expires: string | null;
  onLoan: boolean;
  teamSlot: number;
  apps: string;
  minutes: number;
  rating: number | null;
  goals: number;
  xG: number;
  xGPer90: number;
  assists: number;
  xA: number;
  xAPer90: number;
  drbPer90: number;
  prPassesPer90: number;
  hdrPct: number;
  intPer90: number;
  tckPct: number;
  distanceKm: number;
  yellowCards: number;
  redCards: number;
  positionRatings?: Record<string, number> | null;
  attributes: PlayerRecord['attributes'] | null;
  hiddenPersonality: {
    professionalism: number | null;
    ambition: number | null;
    pressure: number | null;
    temperament: number | null;
    loyalty: number | null;
  } | null;
  suspensionsCount: number;
}

export interface DecodedFmSaveStaff {
  uid: number;
  name: string;
  role: string;
  age: number;
  nation: string;
  club: string;
  wagePw: number;
  expires: string | null;
  attributes: StaffRecord['attributes'] | null;
}

export interface DecodedFmSaveMatch {
  dateIso: string | null;
  dateDmy: string | null;
  competitionId?: number | null;
  competition: string;
  opponent: string;
  venue: 'H' | 'A';
  result: 'W' | 'D' | 'L';
  score: string;
  xGFor: number | null;
  xGAgainst: number | null;
  possession: number | null;
  passCompletion: number | null;
  shotsFor: string | null;
  shotsAgainst: string | null;
  cccFor: number | null;
  cccAgainst: number | null;
  distanceKm: number | null;
}

export interface DecodedFmSavePayload {
  meta: {
    game: string;
    build: string;
    knownBuild: boolean;
    saveName: string;
    gameDateIso: string | null;
    gameDateDmy: string | null;
    clubUid: number | null;
    clubName: string;
    managerName: string;
    balance: number | null;
    fmsaveVersion: string;
    fileName?: string;
    fileSizeMb?: number;
    decodedAtIso?: string;
    importScope?: string;
    mountMode?: string;
  };
  players: DecodedFmSavePlayer[];
  staff?: DecodedFmSaveStaff[];
  playedMatches: DecodedFmSaveMatch[];
  upcomingFixtures: Array<{
    dateIso: string | null;
    dateDmy: string | null;
    competitionId?: number | null;
    competition: string;
    opponent: string;
    venue: 'H' | 'A';
  }>;
  leagueStanding: {
    competitionId?: number | null;
    competitionName: string;
    position: number;
    totalTeams: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDiff: number;
    points: number;
    nextOpponentStanding: {
      clubName: string;
      position: number;
      points: number;
      played: number;
      goalDiff: number;
    } | null;
    top5: Array<{
      pos: number;
      club: string;
      played: number;
      pts: number;
      gd: number;
    }>;
  } | null;
  finances: {
    month: string | null;
    balance: number | null;
    wagePayrollWeekly: number | null;
    wageBudgetWeekly: number | null;
    transferBudgetRemaining: number | null;
  } | null;
  activeInjuries: Array<{
    playerUid: number | null;
    playerName: string | null;
    typeName: string;
    date: string | null;
    severity: string | null;
    cause: string | null;
    kind: string;
  }>;
  tactics: Array<{
    index: number;
    name: string;
    styleName: string;
    mentality: string;
  }>;
  mentoring: Array<{
    groupNumber: number;
    label: string;
    members: string[];
  }>;
  warnings?: string[];
}

export interface HydratedSaveState {
  updatedSquad: PlayerRecord[];
  updatedStaff: StaffRecord[];
  updatedMatches: MatchLogEntry[];
  newMatchesCount: number;
  changedPlayers: Array<{ name: string; changes: string[] }>;
  saveDateLabel: string;
  nextFixtureLabel: string | null;
  leagueRecordLabel: string | null;
  leagueStandingLabel: string | null;
  squadOutputLabel: string | null;
  squadOutputSubLabel: string | null;
  tacticHeadlineLabel: string | null;
  tacticSubLabel: string | null;
  wageComplianceLabel: string | null;
  balanceLabel: string | null;
  analystPromptContext: string;
  decodedPayload: DecodedFmSavePayload;
}

function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '--';
  }
  const abs = Math.abs(amount);
  const formatted =
    abs >= 1_000_000
      ? `£${(abs / 1_000_000).toFixed(2)}M`
      : abs >= 1_000
        ? `£${Math.round(abs / 1_000)}K`
        : `£${Math.round(abs).toLocaleString()}`;
  return amount < 0 ? `-${formatted}` : formatted;
}

function inferPersonalityLabel(dp: DecodedFmSavePlayer): string {
  const det = dp.attributes?.determination ?? 10;
  const prof = dp.hiddenPersonality?.professionalism ?? 10;
  const amb = dp.hiddenPersonality?.ambition ?? 10;
  if (prof >= 15 && det >= 14) return 'Model Citizen / Professional';
  if (prof >= 15) return 'Professional';
  if (det >= 16) return 'Determined';
  if (det >= 14) return 'Fairly Determined';
  if (amb >= 15) return 'Ambitious';
  return 'Balanced';
}

function inferPreferredFoot(
  leftFoot?: number,
  rightFoot?: number,
  explicit?: 'Left' | 'Right' | 'Either'
): 'Left' | 'Right' | 'Either' | undefined {
  if (explicit) return explicit;
  if (typeof leftFoot !== 'number' && typeof rightFoot !== 'number') return undefined;
  const lf = leftFoot ?? 0;
  const rf = rightFoot ?? 0;
  if (lf >= 15 && rf >= 15) return 'Either';
  if (lf > rf) return 'Left';
  return 'Right';
}

function computeRelativeStarRating(value: number, squadMedian: number): number {
  if (!value || value <= 0) return 2.5;
  const baseline = squadMedian > 0 ? squadMedian : 90;
  const diff = value - baseline;
  const stars = 3.0 + diff / 18;
  const clamped = Math.min(5.0, Math.max(1.0, stars));
  return Math.round(clamped * 2) / 2;
}

/**
 * Hydrates the entire FM27 Command Hub (Squad Database, Staff Directory, Match Log,
 * Executive KPI strip, and AI Tactical Analyst context) directly from a decoded .fm save.
 * Never exposes raw CA/PA numbers in hydrated player notes, diffs, or AI prompts.
 */
export function hydrateAppFromDecodedFmSave(
  decoded: DecodedFmSavePayload,
  currentSquad: PlayerRecord[],
  currentMatches: MatchLogEntry[]
): HydratedSaveState {
  const byNorm = new Map<string, DecodedFmSavePlayer>();
  for (const p of decoded.players) {
    byNorm.set(normalizePlayerName(p.name), p);
  }

  const changedPlayers: Array<{ name: string; changes: string[] }> = [];
  const matchedSaveUids = new Set<number>();

  // 1. Update existing squad players with fresh .fm stats, attributes, wages, & condition
  const mergedSquad: PlayerRecord[] = currentSquad.map((existing) => {
    const norm = normalizePlayerName(existing.name);
    let dp = byNorm.get(norm);
    if (!dp) {
      const last = norm.split(' ').slice(-1)[0];
      if (last && last.length >= 5) {
        const candidates = decoded.players.filter((cand) =>
          normalizePlayerName(cand.name).endsWith(` ${last}`)
        );
        if (candidates.length === 1) dp = candidates[0];
      }
    }
    if (!dp) return existing;
    matchedSaveUids.add(dp.uid);

    const changes: string[] = [];
    const next: PlayerRecord = {
      ...existing,
      attributes: { ...existing.attributes },
    };

    if (dp.minutes !== existing.minutes) {
      changes.push(`Mins ${existing.minutes}→${dp.minutes}`);
      next.minutes = dp.minutes;
    }
    if (dp.apps && dp.apps !== existing.apps) {
      next.apps = dp.apps;
    }
    if (dp.rating !== null && dp.rating !== existing.rating) {
      changes.push(`Rating ${existing.rating ?? '-'}→${dp.rating}`);
      next.rating = dp.rating;
    }
    if (dp.goals !== existing.goals) {
      changes.push(`Goals ${existing.goals}→${dp.goals}`);
      next.goals = dp.goals;
    }
    if (dp.assists !== existing.assists) {
      changes.push(`Assists ${existing.assists}→${dp.assists}`);
      next.assists = dp.assists;
    }
    if (dp.xG !== existing.xG) {
      next.xG = dp.xG;
      next.xGPer90 = dp.xGPer90;
    }
    if (dp.xA !== existing.xA) {
      next.xA = dp.xA;
      next.xAPer90 = dp.xAPer90;
    }
    if (dp.drbPer90) next.drbPer90 = dp.drbPer90;
    if (dp.prPassesPer90) next.prPassesPer90 = dp.prPassesPer90;
    if (dp.hdrPct) next.hdrPct = dp.hdrPct;
    if (dp.intPer90) next.intPer90 = dp.intPer90;
    if (dp.tckPct) next.tckPct = dp.tckPct;
    if (dp.age) next.age = dp.age;
    if (dp.wagePw > 0 && dp.wagePw !== existing.wagePw) {
      changes.push(`Wage £${existing.wagePw}→£${dp.wagePw}/wk`);
      next.wagePw = dp.wagePw;
    }
    if (typeof dp.expires === 'string' && dp.expires.trim() && dp.expires !== 'N/A') {
      next.expires = dp.expires;
    }

    if (dp.condition !== undefined) next.condition = dp.condition;
    if (dp.sharpness !== undefined) next.sharpness = dp.sharpness;
    if (dp.heightCm) next.heightCm = dp.heightCm;
    if (dp.leftFoot) next.leftFoot = dp.leftFoot;
    if (dp.rightFoot) next.rightFoot = dp.rightFoot;
    const prefFoot = inferPreferredFoot(dp.leftFoot, dp.rightFoot, dp.preferredFoot);
    if (prefFoot) next.preferredFoot = prefFoot;
    if (dp.positionRatings) next.positionRatings = dp.positionRatings;

    if (dp.attributes) {
      const keys = Object.keys(dp.attributes) as Array<
        keyof PlayerRecord['attributes']
      >;
      for (const k of keys) {
        const val = dp.attributes[k];
        if (typeof val === 'number' && val > 0 && val !== existing.attributes[k]) {
          changes.push(`${k} ${existing.attributes[k] ?? '--'}→${val}`);
          next.attributes[k] = val;
        }
      }
    }

    // Strip any legacy raw CA/PA note tags if present from older backups
    next.notes = existing.notes
      .replace(/\s*\[FM Save CA \d+\/PA \d+[^\]]*\]/gi, '')
      .trim();

    if (changes.length > 0) {
      changedPlayers.push({ name: existing.name, changes });
    }
    return next;
  });

  // Compute squad median ability internally solely for relative 1.0★-5.0★ star scaling (never exposed raw)
  const validRatings = decoded.players
    .map((p) => Number(p.ca) || 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const squadMedian =
    validRatings.length > 0
      ? validRatings[Math.floor(validRatings.length / 2)]
      : 90;

  // Add any newly signed / promoted first-team players from the .fm save not in baseline
  let nextNum = currentSquad.length === 0 ? 1 : 40;
  for (const dp of decoded.players) {
    if (matchedSaveUids.has(dp.uid)) continue;
    if (currentSquad.length > 0 && dp.teamSlot !== 0 && dp.minutes === 0) continue; // skip unplayed reserves/U18s when baseline exists
    const { ipRole, oopRole } = inferFm27Roles(dp.position || 'UTL', dp.attributes);
    const abilityStars = computeRelativeStarRating(Number(dp.ca) || 0, squadMedian);
    const potentialStars = Math.max(
      abilityStars,
      computeRelativeStarRating(Number(dp.pa) || 0, squadMedian)
    );
    const assignedStatus: PlayerRecord['status'] =
      (dp.minutes > 180 || abilityStars >= 3.5)
        ? 'Starter'
        : (dp.minutes > 0 || abilityStars >= 2.5)
          ? 'Rotation'
          : (dp.age && dp.age <= 21)
            ? 'Youth'
            : 'Surplus';
    mergedSquad.push({
      id: `fm-uid-${dp.uid}`,
      number: nextNum++,
      name: dp.name || 'Unknown Player',
      position: dp.position || 'UTL',
      apps: dp.apps || '0',
      minutes: Number(dp.minutes) || 0,
      rating: dp.rating ?? null,
      goals: Number(dp.goals) || 0,
      xG: Number(dp.xG) || 0,
      xGPer90: Number(dp.xGPer90) || 0,
      assists: Number(dp.assists) || 0,
      xA: Number(dp.xA) || 0,
      xAPer90: Number(dp.xAPer90) || 0,
      drbPer90: Number(dp.drbPer90) || 0,
      prPassesPer90: Number(dp.prPassesPer90) || 0,
      hdrPct: Number(dp.hdrPct) || 0,
      intPer90: Number(dp.intPer90) || 0,
      tckPct: Number(dp.tckPct) || 0,
      personality: inferPersonalityLabel(dp),
      age: Number(dp.age) || 20,
      ability: abilityStars,
      potential: potentialStars,
      condition: dp.condition ?? null,
      sharpness: dp.sharpness ?? null,
      leftFoot: dp.leftFoot,
      rightFoot: dp.rightFoot,
      preferredFoot: inferPreferredFoot(dp.leftFoot, dp.rightFoot, dp.preferredFoot),
      heightCm: dp.heightCm,
      positionRatings: dp.positionRatings ?? null,
      expires: typeof dp.expires === 'string' && dp.expires.trim() ? dp.expires : 'N/A',
      nation: 'FM',
      wagePw: Number(dp.wagePw) || 0,
      status: assignedStatus,
      attributes: dp.attributes || {
        pace: 10,
        acceleration: 10,
        stamina: 10,
        jumpingReach: 10,
        determination: 10,
        passing: 10,
        finishing: 10,
        tackling: 10,
        firstTouch: 10,
        decisions: 10,
        workRate: 10,
        offTheBall: 10,
      },
      ipRole,
      oopRole,
      notes: 'Synced directly from .fm save',
    });
    changedPlayers.push({
      name: dp.name,
      changes: [`Added from .fm save (${abilityStars.toFixed(1)}★ / ${potentialStars.toFixed(1)}★)`],
    });
  }

  // When a full real .fm squad (>=10 players) was decoded, drop stale baseline players who are no longer at the club
  const finalSquad: PlayerRecord[] =
    decoded.players.length >= 10
      ? mergedSquad.filter((p) => {
          const norm = normalizePlayerName(p.name);
          if (byNorm.has(norm)) return true;
          const last = norm.split(' ').slice(-1)[0];
          if (
            last &&
            last.length >= 5 &&
            decoded.players.some((cand) =>
              normalizePlayerName(cand.name).endsWith(` ${last}`)
            )
          ) {
            return true;
          }
          return p.id.startsWith('fm-uid-');
        })
      : mergedSquad;

  // 2. Build honest Match Log from .fm save (ZERO fabricated 0.00 xG or 40% possession!)
  const findExistingMatchDetails = (pm: DecodedFmSaveMatch): MatchLogEntry | undefined => {
    const dateKey = (pm.dateDmy || pm.dateIso || '').trim();
    const safeOpp = (pm.opponent || '').toLowerCase();
    const safeScore = (pm.score || '').replace(/\s+/g, '');
    return currentMatches.find((m) => {
      const mOpp = (m.opponent || '').toLowerCase();
      const oppMatch =
        mOpp === safeOpp ||
        (safeOpp.length >= 5 && mOpp.includes(safeOpp.slice(0, 6))) ||
        (mOpp.length >= 5 && safeOpp.includes(mOpp.slice(0, 6)));
      if (!oppMatch) return false;
      if (dateKey && m.date.trim() === dateKey) return true;
      return (m.score || '').replace(/\s+/g, '') === safeScore && m.venue === pm.venue;
    });
  };

  let maxEventNum = currentMatches.reduce(
    (max, m) => Math.max(max, m.eventNumber || 0),
    33
  );

  // Process oldest-to-newest so event numbers ascend chronologically
  const chronologicalPlayed = [...decoded.playedMatches].reverse();
  let newlyAddedCount = 0;
  const fmHydratedMatches: MatchLogEntry[] = [];

  for (const pm of chronologicalPlayed) {
    const dateKey = (pm.dateDmy || pm.dateIso || '').trim();
    const safeOpp = pm.opponent || 'Opponent';
    const safeScore = pm.score || '0 - 0';
    const oppKey = safeOpp.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!dateKey) continue;

    const existing = findExistingMatchDetails(pm);
    if (existing) {
      // Preserve rich Data Hub screenshot audit if we already analyzed this exact fixture, while marking live .fm verified
      fmHydratedMatches.push({
        ...existing,
        date: dateKey,
        score: safeScore,
        result: pm.result,
        source: 'FM_SAVE',
      });
      continue;
    }

    newlyAddedCount++;
    maxEventNum++;
    fmHydratedMatches.push({
      id: `fm-match-${dateKey}-${oppKey}`,
      eventNumber: maxEventNum,
      date: dateKey,
      competition: pm.competition || 'Domestic League',
      opponent: safeOpp,
      venue: pm.venue,
      result: pm.result,
      score: safeScore,
      xGFor: pm.xGFor ?? null,
      xGAgainst: pm.xGAgainst ?? null,
      possession: pm.possession ?? null,
      passCompletion: pm.passCompletion ?? null,
      shotsFor: pm.shotsFor || '—',
      shotsAgainst: pm.shotsAgainst || '—',
      cccFor: pm.cccFor ?? null,
      cccAgainst: pm.cccAgainst ?? null,
      goalTimeline: 'Result & scoreline decoded directly from .fm save',
      potm: 'Attach Data Hub screenshot for match report',
      defensiveWatchpoints: pm.distanceKm
        ? `Team distance: ${pm.distanceKm} km`
        : '—',
      tacticalAudit: `Verified directly from ${decoded.meta.fileName || decoded.meta.saveName || '.fm save'} (${pm.result} ${safeScore}${pm.xGFor !== null ? `, xG ${pm.xGFor.toFixed(2)}-${(pm.xGAgainst ?? 0).toFixed(2)}` : ''}).`,
      source: 'FM_SAVE',
    });
  }

  // When a full real save (>= 4 matches) was decoded, show the authoritative .fm match chronology (newest first)
  // rather than mixing stale unverified baseline rows; for small 1-match fixtures, prepend new matches cleanly.
  const fmNewestFirst = [...fmHydratedMatches].reverse();
  const updatedMatches =
    decoded.playedMatches.length >= 4
      ? fmNewestFirst
      : [
          ...fmNewestFirst.filter(
            (fm) => !currentMatches.some((cm) => cm.id === fm.id)
          ),
          ...currentMatches,
        ];

  // 3. Executive Strip Labels from Live .fm Save (100% Real Save Values!)
  const saveDateLabel =
    decoded.meta.gameDateDmy ||
    decoded.meta.gameDateIso ||
    'Live .fm Save';

  let nextFixtureLabel: string | null = null;
  if (decoded.upcomingFixtures.length > 0) {
    const nf = decoded.upcomingFixtures[0];
    const oppStanding = decoded.leagueStanding?.nextOpponentStanding;
    const standingSuffix = oppStanding
      ? ` — #${oppStanding.position} (${oppStanding.points} Pts)`
      : '';
    nextFixtureLabel = `${nf.dateDmy || nf.dateIso} vs ${nf.opponent} (${nf.venue === 'H' ? 'Home' : 'Away'}${standingSuffix})`;
  }

  let leagueRecordLabel: string | null = null;
  let leagueStandingLabel: string | null = null;
  if (decoded.leagueStanding) {
    const ls = decoded.leagueStanding;
    const gdStr = ls.goalDiff >= 0 ? `+${ls.goalDiff}` : `${ls.goalDiff}`;
    leagueRecordLabel = `${ls.played} GP · ${ls.won}W-${ls.drawn}D-${ls.lost}L · ${ls.points} Pts`;
    leagueStandingLabel = `#${ls.position} of ${ls.totalTeams} (${ls.goalsFor} GF / ${ls.goalsAgainst} GA · ${gdStr} GD)`;
  }

  // Real summed squad season output straight from save.player_season_stats()
  let squadOutputLabel: string | null = null;
  let squadOutputSubLabel: string | null = null;
  if (decoded.players.length > 0) {
    const totalGoals = decoded.players.reduce((s, p) => s + (p.goals || 0), 0);
    const totalXg = decoded.players.reduce((s, p) => s + (p.xG || 0), 0);
    const totalAssists = decoded.players.reduce((s, p) => s + (p.assists || 0), 0);
    const totalXa = decoded.players.reduce((s, p) => s + (p.xA || 0), 0);
    squadOutputLabel = `${totalGoals} Gls (${totalXg.toFixed(2)} xG) · ${totalAssists} Ast (${totalXa.toFixed(2)} xA)`;
    const topScorer = [...decoded.players].sort((a, b) => (b.goals || 0) - (a.goals || 0))[0];
    const topRated = [...decoded.players]
      .filter((p) => typeof p.rating === 'number' && (p.minutes || 0) >= 90)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
    const subParts: string[] = [];
    if (topScorer && topScorer.goals > 0) {
      subParts.push(`Top Scorer: ${topScorer.name} (${topScorer.goals}G)`);
    }
    if (topRated && topRated.rating) {
      subParts.push(`Best Rat: ${topRated.name} (${topRated.rating.toFixed(2)})`);
    }
    squadOutputSubLabel =
      subParts.length > 0
        ? subParts.join(' · ')
        : `Summed across ${decoded.players.length} squad players in .fm save`;
  }

  let tacticHeadlineLabel: string | null = null;
  let tacticSubLabel: string | null = null;
  if (decoded.tactics.length > 0) {
    const primary = decoded.tactics[0];
    tacticHeadlineLabel = `${primary.name} (${primary.mentality})`;
    tacticSubLabel = `${decoded.activeInjuries.length} Active Injur${decoded.activeInjuries.length === 1 ? 'y' : 'ies'} · ${decoded.mentoring.length} Mentoring Groups`;
  } else {
    tacticSubLabel = `${decoded.activeInjuries.length} Active Injur${decoded.activeInjuries.length === 1 ? 'y' : 'ies'} · ${decoded.mentoring.length} Mentoring Groups`;
  }

  let wageComplianceLabel: string | null = null;
  let balanceLabel: string | null = null;
  if (decoded.finances) {
    if (
      decoded.finances.wagePayrollWeekly !== null &&
      decoded.finances.wageBudgetWeekly !== null
    ) {
      const diff =
        decoded.finances.wageBudgetWeekly - decoded.finances.wagePayrollWeekly;
      const diffStr =
        diff >= 0
          ? `+£${diff.toLocaleString()} p/w`
          : `-£${Math.abs(diff).toLocaleString()} p/w`;
      wageComplianceLabel = `£${decoded.finances.wagePayrollWeekly.toLocaleString()} / £${decoded.finances.wageBudgetWeekly.toLocaleString()} p/w (${diffStr})`;
    }
    if (decoded.finances.balance !== null) {
      balanceLabel = formatMoney(decoded.finances.balance);
    }
  } else if (decoded.meta.balance !== null) {
    balanceLabel = formatMoney(decoded.meta.balance);
  }

  // 4. Build Rich Ground-Truth Context for Gemini Tactical Analyst
  const topPlayersSummary = decoded.players
    .slice(0, 28)
    .map((p) => {
      const a = p.attributes;
      const attrStr = a
        ? `Pac ${a.pace}/Acc ${a.acceleration}/Sta ${a.stamina}/JR ${a.jumpingReach}/Det ${a.determination}/Pas ${a.passing}/Fin ${a.finishing}/Tck ${a.tackling}`
        : '';
      const abilStar = computeRelativeStarRating(Number(p.ca) || 0, squadMedian);
      const potStar = Math.max(
        abilStar,
        computeRelativeStarRating(Number(p.pa) || 0, squadMedian)
      );
      return `- ${p.name} (${p.position}, Age ${p.age}, ${abilStar.toFixed(1)}★/${potStar.toFixed(1)}★, £${p.wagePw}/wk exp ${p.expires}): Apps ${p.apps}, ${p.minutes}m, Rat ${p.rating ?? '-'}, ${p.goals}G (${p.xG} xG), ${p.assists}A (${p.xA} xA), Tck ${p.tckPct}%, Hdr ${p.hdrPct}% | ${attrStr}`;
    })
    .join('\n');

  const updatedStaff: StaffRecord[] = (decoded.staff || []).map((s, idx) => ({
    id: `fm-staff-${s.uid || idx}`,
    uid: s.uid,
    name: s.name || 'Club Staff',
    role: s.role || 'Coach',
    age: Number(s.age) || 35,
    nation: s.nation || 'FM',
    club: s.club || decoded.meta.clubName || '',
    wagePw: Number(s.wagePw) || 0,
    expires: s.expires || 'N/A',
    attributes: s.attributes || {
      attacking: 10,
      defending: 10,
      fitness: 10,
      goalkeeping: 10,
      mental: 10,
      possession: 10,
      set_pieces: 10,
      tactical: 10,
      technical: 10,
      working_with_youngsters: 10,
      adaptability: 10,
      authority: 10,
      determination: 10,
      judging_player_ability: 10,
      judging_player_potential: 10,
      judging_staff_ability: 10,
      man_management: 10,
      motivating: 10,
      negotiating: 10,
      physiotherapy: 10,
      sports_science: 10,
      tactical_knowledge: 10,
      analysing_data: 10,
    },
  }));

  const playedLines = decoded.playedMatches
    .map(
      (m) =>
        `- ${m.dateDmy || m.dateIso} [${m.competition}] vs ${m.opponent} (${m.venue}): ${m.result} ${m.score}` +
        (m.xGFor !== null
          ? ` | xG ${m.xGFor.toFixed(2)} - ${(m.xGAgainst ?? 0).toFixed(2)} | Poss ${m.possession ?? '?'}% | Shots ${m.shotsFor ?? '?'} vs ${m.shotsAgainst ?? '?'} | CCC ${m.cccFor ?? '?'}-${m.cccAgainst ?? '?'}`
          : '')
    )
    .join('\n');

  const upcomingLines = decoded.upcomingFixtures
    .map(
      (f) =>
        `- ${f.dateDmy || f.dateIso}: [${f.competition}] vs ${f.opponent} (${f.venue === 'H' ? 'Home' : 'Away'})`
    )
    .join('\n');

  const injuryLines =
    decoded.activeInjuries.length > 0
      ? decoded.activeInjuries
          .map(
            (i) =>
              `- ${i.playerName || 'Player'}: ${i.typeName} (${i.severity || i.kind}, ${i.date || 'active'})`
          )
          .join('\n')
      : '- No active injuries reported in save.';

  const mentoringLines =
    decoded.mentoring.length > 0
      ? decoded.mentoring
          .map((m) => `- ${m.label}: ${m.members.join(', ')}`)
          .join('\n')
      : '- No mentoring groups returned by reader.';

  const diffLines =
    changedPlayers.length > 0
      ? changedPlayers
          .slice(0, 20)
          .map((c) => `- ${c.name}: ${c.changes.join(', ')}`)
          .join('\n')
      : '- Baseline synced directly from .fm save.';

  const analystPromptContext = `[LIVE FULL .FM SAVE DECODED VIA FMSAVE ${decoded.meta.fmsaveVersion} — 100% REAL IN-GAME DATA]
Game: ${decoded.meta.game} (Build ${decoded.meta.build}) | Save: ${decoded.meta.saveName}
EXACT CURRENT IN-GAME DATE: ${saveDateLabel}
Managed Club: ${decoded.meta.clubName} (Manager: ${decoded.meta.managerName})
${leagueStandingLabel ? `Live League Standing (${decoded.leagueStanding?.competitionName}): ${leagueStandingLabel}` : ''}
${decoded.leagueStanding?.nextOpponentStanding ? `Next Opponent Table Standing: ${decoded.leagueStanding.nextOpponentStanding.clubName} (#${decoded.leagueStanding.nextOpponentStanding.position}, ${decoded.leagueStanding.nextOpponentStanding.points} Pts, ${decoded.leagueStanding.nextOpponentStanding.goalDiff >= 0 ? '+' : ''}${decoded.leagueStanding.nextOpponentStanding.goalDiff} GD)` : ''}
${wageComplianceLabel ? `Live Finances: Balance ${balanceLabel} | Wages ${wageComplianceLabel}` : balanceLabel ? `Live Balance: ${balanceLabel}` : ''}

=== DIFFS AUTO-APPLIED TO SQUAD DATABASE (${changedPlayers.length} PLAYERS UPDATED, ${newlyAddedCount} NEW MATCHES LOGGED) ===
${diffLines}

=== RECENT PLAYED MATCHES (NEWEST FIRST) ===
${playedLines || 'None found'}

=== UPCOMING SCHEDULE FROM CURRENT IN-GAME DATE (${saveDateLabel}) ===
${upcomingLines || 'None found'}

=== ACTIVE INJURIES ===
${injuryLines}

=== LIVE MENTORING GROUPS IN SAVE ===
${mentoringLines}

=== FULL MANAGED SQUAD (${decoded.players.length} PLAYERS WITH STAR RATINGS, STATS & ATTRIBUTES) ===
${topPlayersSummary}
${decoded.warnings && decoded.warnings.length > 0 ? `\n=== READER NOTES (NON-FATAL) ===\n${decoded.warnings.map((w) => `- ${w}`).join('\n')}\n` : ''}
ANALYST MISSION FOR THIS .FM SAVE DROP:
1. Acknowledge the exact in-game date (${saveDateLabel}), league position, recent results (never fabricate match-level xG or possession if not present in the save — cite the exact player season xG/xA and fixture scorelines), and finances directly from the .fm file.
2. Audit player performance, attribute changes (highlighting any mentoring Determination/attribute gains, star-rating progression, FM27 engine metrics, fatigue/minutes load, and injuries). NEVER cite raw hidden CA/PA numbers.
3. Produce a **COMPLETE ACTION PLAN FROM ${saveDateLabel} FORWARD**:
   - Exact Starting XI + Bench + 62m/75m substitution plan for the very next fixture (${nextFixtureLabel || 'next scheduled match'}), obeying Playbook v2.0 & Club Rules #1–#6 (Tracking Wingers OOP, 3-man midfield late, never pull both CBs, <=125m Double-GW cap).
   - Multi-match rotation & training schedule plan across the upcoming fixtures listed above.
   - Wage/contract/mentoring actions to click before hitting Continue.
4. Populate the structured JSON fields (docEventBulletBlock, sheetRowValues, inGameDate="${saveDateLabel}") so Bobby can push this full save checkpoint straight to his Google Sheet & Google Doc in one click.`;

  return {
    updatedSquad: finalSquad,
    updatedStaff,
    updatedMatches,
    newMatchesCount: newlyAddedCount,
    changedPlayers,
    saveDateLabel,
    nextFixtureLabel,
    leagueRecordLabel,
    leagueStandingLabel,
    squadOutputLabel,
    squadOutputSubLabel,
    tacticHeadlineLabel,
    tacticSubLabel,
    wageComplianceLabel,
    balanceLabel,
    analystPromptContext,
    decodedPayload: decoded,
  };
}
