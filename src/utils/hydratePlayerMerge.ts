import type { PlayerRecord } from '../types/fm27';
import {
  FormTrend,
  InternalReliabilityFlags,
  PlayerMatchRating,
  ScoutBadge,
  clampAttributeValue,
  clampConditionSharpness,
} from '../types/fmSave';
import type { DecodedFmSavePlayer, DecodedFmSavePayload } from './fmSaveHydrator';
import { normalizePlayerName } from './fmFileImporter';
import { inferFm27Roles } from './fm27RoleMatcher';
import { formatWeeklyWage, MISSING_VALUE } from './squadViewHelpers';
import type { AvailabilityIndex } from './hydrateAvailability';

export interface PlayerMergeInput {
  decoded: DecodedFmSavePayload;
  currentSquad: PlayerRecord[];
  availability: AvailabilityIndex;
}

export interface PlayerMergeResult {
  squad: PlayerRecord[];
  changedPlayers: Array<{ name: string; changes: string[] }>;
  removedPlayers: PlayerRecord[];
}

/**
 * Matches the squad the app already holds against the players in a new save.
 *
 * UID first, then normalised full name, then a unique last-name suffix, so a
 * renamed or re-UIDed player is still recognised. A squad player the save no
 * longer contains is treated as gone once the save looks like a full squad,
 * and every save player that matched nothing is added as a new signing.
 */
export function mergeSquadWithSave({
  decoded,
  currentSquad,
  availability,
}: PlayerMergeInput): PlayerMergeResult {
  const { bansByUid, isInjured: isPlayerActivelyInjured } = availability;

  const byUid = new Map<number, DecodedFmSavePlayer>();
  const byNorm = new Map<string, DecodedFmSavePlayer>();
  for (const p of decoded.players) {
    if (p.uid && p.uid > 0) {
      byUid.set(p.uid, p);
    }
    byNorm.set(normalizePlayerName(p.name), p);
  }

  const changedPlayers: Array<{ name: string; changes: string[] }> = [];
  const matchedSaveUids = new Set<number>();
  const removedPlayers: PlayerRecord[] = [];

  // Compute squad median ability internally solely for legacy payloads lacking abilityStars (never exposed raw)
  const validRatings = decoded.players
    .map((p) => Number(p.ca) || 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const squadMedian =
    validRatings.length > 0
      ? validRatings[Math.floor(validRatings.length / 2)]
      : 90;

  const getPlayerStars = (dp: DecodedFmSavePlayer) => {
    const abilityStars =
      typeof dp.abilityStars === 'number' && dp.abilityStars >= 1
        ? Math.min(5, Math.max(1, dp.abilityStars))
        : computeRelativeStarRating(Number(dp.ca) || 0, squadMedian);
    const potentialStars =
      typeof dp.potentialStars === 'number' && dp.potentialStars >= 1
        ? Math.max(abilityStars, Math.min(5, dp.potentialStars))
        : Math.max(
            abilityStars,
            computeRelativeStarRating(Number(dp.pa) || 0, squadMedian)
          );
    return { abilityStars, potentialStars };
  };

  // 1. UID-first player matching with normalized name fallback + stale removal detection
  const mergedSquad: PlayerRecord[] = [];

  const squadHasSeasonStats = decoded.players.some(
    (p) =>
      (Number(p.minutes) || 0) > 0 ||
      (Boolean(p.apps) && p.apps !== '0') ||
      (p.rating !== null && p.rating !== undefined && p.rating > 0)
  );
  // Allow recent-match fallback when season_stats was skipped (Fast Sync) OR empty
  // despite competitive matches already being played in the save.
  // On a true pre-season save (0 competitive matches played), players stay at 0 / null.
  const hasPlayedCompetitiveMatches =
    (decoded.playedMatches?.length ?? 0) > 0 ||
    (decoded.leagueStanding?.played ?? 0) > 0;
  const allowRecentFallback =
    !squadHasSeasonStats &&
    (Boolean(decoded.meta.fastSync) || hasPlayedCompetitiveMatches);

  for (const existing of currentSquad) {
    const existingUid = extractUidFromPlayerRecord(existing);
    let dp: DecodedFmSavePlayer | undefined;

    if (existingUid !== null) {
      dp = byUid.get(existingUid);
    }

    if (!dp) {
      const norm = normalizePlayerName(existing.name);
      dp = byNorm.get(norm);
      if (!dp) {
        const last = norm.split(' ').slice(-1)[0];
        if (last && last.length >= 5) {
          const candidates = decoded.players.filter(
            (cand) =>
              !matchedSaveUids.has(cand.uid) &&
              normalizePlayerName(cand.name).endsWith(` ${last}`)
          );
          if (candidates.length === 1) dp = candidates[0];
        }
      }
    }

    if (!dp) {
      if (decoded.players.length >= 10) {
        removedPlayers.push(existing);
      } else {
        mergedSquad.push(existing);
      }
      continue;
    }

    matchedSaveUids.add(dp.uid);

    const changes: string[] = [];
    const next: PlayerRecord = {
      ...existing,
      uid: dp.uid || existing.uid,
      attributes: { ...existing.attributes },
    };

    const hasPlayerSeasonStats =
      (Number(dp.minutes) || 0) > 0 ||
      (Boolean(dp.apps) && dp.apps !== '0') ||
      (dp.rating !== null && dp.rating !== undefined && dp.rating > 0);

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
    } else if (dp.rating === null && squadHasSeasonStats && existing.rating !== null) {
      next.rating = null;
    }
    if (dp.goals !== existing.goals) {
      changes.push(`Goals ${existing.goals}→${dp.goals}`);
      next.goals = dp.goals;
    }
    if (dp.assists !== existing.assists) {
      changes.push(`Assists ${existing.assists}→${dp.assists}`);
      next.assists = dp.assists;
    }
    if (dp.xG !== existing.xG || dp.xGPer90 !== existing.xGPer90 || dp.minutes !== existing.minutes) {
      next.xG = dp.xG;
      next.xGPer90 = dp.xGPer90;
    }
    if (dp.xA !== existing.xA || dp.xAPer90 !== existing.xAPer90 || dp.minutes !== existing.minutes) {
      next.xA = dp.xA;
      next.xAPer90 = dp.xAPer90;
    }
    if (typeof dp.drbPer90 === 'number' && (dp.drbPer90 > 0 || squadHasSeasonStats)) next.drbPer90 = dp.drbPer90;
    if (typeof dp.prPassesPer90 === 'number' && (dp.prPassesPer90 > 0 || squadHasSeasonStats)) next.prPassesPer90 = dp.prPassesPer90;
    if (typeof dp.hdrPct === 'number' && (dp.hdrPct > 0 || squadHasSeasonStats)) next.hdrPct = dp.hdrPct;
    if (typeof dp.intPer90 === 'number' && (dp.intPer90 > 0 || squadHasSeasonStats)) next.intPer90 = dp.intPer90;
    if (typeof dp.tckPct === 'number' && (dp.tckPct > 0 || squadHasSeasonStats)) next.tckPct = dp.tckPct;
    if (typeof dp.age === 'number' && Number.isFinite(dp.age) && dp.age > 0) {
      next.age = dp.age;
    }
    if (typeof dp.wagePw === 'number' && dp.wagePw > 0 && dp.wagePw !== existing.wagePw) {
      changes.push(`Wage ${formatWeeklyWage(existing.wagePw)} → ${formatWeeklyWage(dp.wagePw)}`);
      next.wagePw = dp.wagePw;
    }
    if (dp.marketValue !== undefined) {
      next.marketValue = dp.marketValue;
    }
    if (dp.marketValueState !== undefined) {
      next.marketValueState = dp.marketValueState;
    }
    if (typeof dp.marketValueCapped === 'boolean') {
      next.marketValueCapped = dp.marketValueCapped;
    }
    if (typeof dp.potentialUncertain === 'boolean') {
      next.potentialUncertain = dp.potentialUncertain;
    }
    if (dp.morale !== undefined) {
      next.morale = dp.morale;
    }
    if (typeof dp.expires === 'string' && dp.expires.trim() && dp.expires !== 'N/A') {
      next.expires = dp.expires;
    }
    if (typeof dp.contractExpiryMonths === 'number') {
      next.contractExpiryMonths = dp.contractExpiryMonths;
    }
    if (dp.contractDetails) {
      next.contractDetails = dp.contractDetails;
    }
    const pBans = bansByUid.get(dp.uid) || [];
    if (pBans.length > 0) {
      next.activeSuspensions = pBans;
    } else if (existing.activeSuspensions) {
      next.activeSuspensions = [];
    }
    if (typeof dp.teamSlot === 'number') {
      next.teamSlot = dp.teamSlot;
      next.squadUnit = resolveSquadUnit(dp.teamSlot);
    }
    if (typeof dp.onLoan === 'boolean') {
      next.onLoan = dp.onLoan;
    }
    if (Array.isArray(dp.secondaryPositions)) {
      next.secondaryPositions = dp.secondaryPositions;
    }

    if (dp.condition !== undefined && dp.condition !== null) {
      next.condition = clampConditionSharpness(dp.condition);
    }
    if (dp.sharpness !== undefined && dp.sharpness !== null) {
      next.sharpness = clampConditionSharpness(dp.sharpness);
    }
    if (dp.heightCm) next.heightCm = dp.heightCm;
    if (dp.leftFoot) next.leftFoot = dp.leftFoot;
    if (dp.rightFoot) next.rightFoot = dp.rightFoot;
    const prefFoot = inferPreferredFoot(dp.leftFoot, dp.rightFoot, dp.preferredFoot);
    if (prefFoot) next.preferredFoot = prefFoot;
    if (dp.positionRatings) next.positionRatings = dp.positionRatings;

    // Pass 0 Group 1: Traits & Qualitative Scout Badges
    if (Array.isArray(dp.traits)) {
      next.traits = dp.traits;
    }
    const badges = resolveScoutBadges(dp);
    if (badges.length > 0) {
      next.scoutBadges = badges;
    }

    // Pass 0 Group 2: Last-5 Form & Season History + Recent-Match Production Fallback
    const pRatings =
      dp.last5Ratings || lookupUidRecord(decoded.playerMatchStats, dp.uid);
    if (squadHasSeasonStats && !hasPlayerSeasonStats) {
      next.last5Ratings = undefined;
      next.last5Form = undefined;
      next.statsSource = undefined;
    } else if (pRatings && pRatings.length > 0) {
      next.last5Ratings = pRatings;
      next.last5Form = calculateLast5Form(pRatings);
      if (!hasPlayerSeasonStats && allowRecentFallback) {
        const agg = aggregateRecentMatchProduction(pRatings);
        next.apps = agg.apps;
        next.minutes = agg.minutes;
        next.rating = agg.rating;
        next.goals = agg.goals;
        next.assists = agg.assists;
        next.statsSource = 'From Recent Matches';
      } else if (hasPlayerSeasonStats) {
        next.statsSource = 'Season Stats';
      } else {
        next.statsSource = undefined;
      }
    } else if (hasPlayerSeasonStats) {
      next.statsSource = 'Season Stats';
    }
    if (dp.contractDetails?.promisedPlayingTime) {
      next.status = resolveSquadStatusFromPlayingTime(
        dp.contractDetails.promisedPlayingTime,
        next.status
      );
    }
    if (isPlayerActivelyInjured(dp.uid, dp.name || existing.name)) {
      next.status = 'Injured';
    }
    const pHistory =
      dp.seasonHistory || lookupUidRecord(decoded.playerSeasonHistory, dp.uid);
    if (pHistory && pHistory.length > 0) {
      next.seasonHistory = pHistory;
    }

    if (dp.attributes) {
      const keys = Object.keys(dp.attributes) as Array<
        keyof PlayerRecord['attributes']
      >;
      for (const k of keys) {
        const rawVal = dp.attributes[k];
        if (typeof rawVal === 'number' && rawVal > 0) {
          const clampedVal = clampAttributeValue(rawVal);
          if (clampedVal !== existing.attributes[k]) {
            changes.push(`${k} ${existing.attributes[k] ?? '--'}→${clampedVal}`);
            next.attributes[k] = clampedVal;
          }
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
    mergedSquad.push(next);
  }

  // Add any newly signed / promoted players from the .fm save not in baseline
  for (const dp of decoded.players) {
    if (matchedSaveUids.has(dp.uid)) continue;
    const clampedAttrs: PlayerRecord['attributes'] = dp.attributes
      ? clampPlayerAttributesRecord(dp.attributes)
      : {
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
        };
    const { ipRole, oopRole } = inferFm27Roles(
      dp.position || 'UTL',
      clampedAttrs,
      dp.positionRatings
    );
    const { abilityStars, potentialStars } = getPlayerStars(dp);
    const fallbackStatus: PlayerRecord['status'] =
      dp.minutes > 180 || abilityStars >= 3.5
        ? 'Starter'
        : dp.minutes > 0 || abilityStars >= 2.5
          ? 'Rotation'
          : dp.age && dp.age <= 21
            ? 'Youth'
            : 'Surplus';
    const baseAssignedStatus: PlayerRecord['status'] =
      resolveSquadStatusFromPlayingTime(
        dp.contractDetails?.promisedPlayingTime,
        fallbackStatus
      );
    const assignedStatus: PlayerRecord['status'] = isPlayerActivelyInjured(
      dp.uid,
      dp.name
    )
      ? 'Injured'
      : baseAssignedStatus;

    const pRatings =
      dp.last5Ratings || lookupUidRecord(decoded.playerMatchStats, dp.uid) || [];
    const pHistory =
      dp.seasonHistory || lookupUidRecord(decoded.playerSeasonHistory, dp.uid) || [];

    const hasSeasonStats =
      (Number(dp.minutes) || 0) > 0 ||
      (dp.apps && dp.apps !== '0') ||
      (dp.rating !== null && dp.rating !== undefined && dp.rating > 0);
    const recentAgg =
      !hasSeasonStats && allowRecentFallback && pRatings.length > 0
        ? aggregateRecentMatchProduction(pRatings)
        : null;

    const realShirtNum =
      typeof dp.shirtNumber === 'number' &&
      Number.isFinite(dp.shirtNumber) &&
      dp.shirtNumber >= 1 &&
      dp.shirtNumber <= 99
        ? Math.round(dp.shirtNumber)
        : 0;

    mergedSquad.push({
      id: `fm-uid-${dp.uid}`,
      uid: dp.uid,
      number: realShirtNum,
      name: dp.name?.trim() || MISSING_VALUE,
      position: dp.position || dp.primaryPosition || 'UTL',
      secondaryPositions: dp.secondaryPositions || [],
      apps: recentAgg ? recentAgg.apps : dp.apps || '0',
      minutes: recentAgg ? recentAgg.minutes : Number(dp.minutes) || 0,
      rating: recentAgg ? recentAgg.rating : (dp.rating ?? null),
      goals: recentAgg ? recentAgg.goals : Number(dp.goals) || 0,
      xG: Number(dp.xG) || 0,
      xGPer90: Number(dp.xGPer90) || 0,
      assists: recentAgg ? recentAgg.assists : Number(dp.assists) || 0,
      statsSource: recentAgg
        ? 'From Recent Matches'
        : hasSeasonStats
          ? 'Season Stats'
          : undefined,
      xA: Number(dp.xA) || 0,
      xAPer90: Number(dp.xAPer90) || 0,
      drbPer90: Number(dp.drbPer90) || 0,
      prPassesPer90: Number(dp.prPassesPer90) || 0,
      hdrPct: Number(dp.hdrPct) || 0,
      intPer90: Number(dp.intPer90) || 0,
      tckPct: Number(dp.tckPct) || 0,
      personality: inferPersonalityLabel(dp),
      age:
        dp.age !== null &&
        dp.age !== undefined &&
        Number.isFinite(Number(dp.age)) &&
        Number(dp.age) > 0
          ? Number(dp.age)
          : NaN,
      ability: abilityStars,
      potential: potentialStars,
      condition:
        dp.condition !== null && dp.condition !== undefined
          ? clampConditionSharpness(dp.condition)
          : null,
      sharpness:
        dp.sharpness !== null && dp.sharpness !== undefined
          ? clampConditionSharpness(dp.sharpness)
          : null,
      leftFoot: dp.leftFoot,
      rightFoot: dp.rightFoot,
      preferredFoot: inferPreferredFoot(dp.leftFoot, dp.rightFoot, dp.preferredFoot),
      heightCm: dp.heightCm,
      positionRatings: dp.positionRatings ?? null,
      expires:
        typeof dp.expires === 'string' && dp.expires.trim()
          ? dp.expires
          : MISSING_VALUE,
      contractExpiryMonths: dp.contractExpiryMonths,
      contractDetails: dp.contractDetails ?? undefined,
      activeSuspensions: bansByUid.get(dp.uid) || [],
      nation: dp.nation?.trim() || MISSING_VALUE,
      wagePw:
        typeof dp.wagePw === 'number' && Number.isFinite(dp.wagePw)
          ? dp.wagePw
          : NaN,
      marketValue: dp.marketValue ?? null,
      marketValueState: dp.marketValueState,
      marketValueCapped:
        typeof dp.marketValueCapped === 'boolean' ? dp.marketValueCapped : undefined,
      potentialUncertain:
        typeof dp.potentialUncertain === 'boolean' ? dp.potentialUncertain : undefined,
      morale: dp.morale ?? null,
      status: assignedStatus,
      teamSlot: typeof dp.teamSlot === 'number' ? dp.teamSlot : 0,
      squadUnit: resolveSquadUnit(dp.teamSlot),
      onLoan: Boolean(dp.onLoan),
      attributes: clampedAttrs,
      traits: dp.traits || [],
      scoutBadges: resolveScoutBadges(dp),
      last5Ratings:
        !(squadHasSeasonStats && !hasSeasonStats) && pRatings.length > 0
          ? pRatings
          : undefined,
      last5Form:
        !(squadHasSeasonStats && !hasSeasonStats) && pRatings.length > 0
          ? calculateLast5Form(pRatings)
          : undefined,
      seasonHistory: pHistory.length > 0 ? pHistory : undefined,
      ipRole,
      oopRole,
      notes: 'Synced directly from .fm save',
    });
    changedPlayers.push({
      name: dp.name,
      changes: [
        `Added from .fm save (${abilityStars.toFixed(1)}★ / ${potentialStars.toFixed(1)}★)`,
      ],
    });
  }

  return { squad: mergedSquad, changedPlayers, removedPlayers };
}

export function resolveSquadUnit(
  teamSlot?: number | null
): 'First Team' | 'Reserves' | 'U21' | 'U18' {
  const slot = typeof teamSlot === 'number' && Number.isFinite(teamSlot) ? teamSlot : 0;
  if (slot <= 0) return 'First Team';
  if (slot === 1) return 'Reserves';
  if (slot === 2) return 'U21';
  return 'U18';
}

export function deriveQualitativeScoutBadges(
  flags: InternalReliabilityFlags
): ScoutBadge[] {
  const badges: ScoutBadge[] = [];
  if (flags.consistency >= 14) badges.push('Consistent Performer');
  if (flags.importantMatches >= 14) badges.push('Big-Game Player');
  if (flags.injuryProneness >= 14) badges.push('Injury-Prone');
  if (flags.versatility >= 14) badges.push('Versatile');
  return badges;
}

export function calculateLast5Form(ratings: PlayerMatchRating[]): FormTrend {
  if (!ratings || ratings.length === 0) {
    return { recentRatings: [], averageRating: 0.0, trend: 'stable' };
  }
  const recent = ratings
    .slice(-5)
    .map((r) => Number(r.rating))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (recent.length === 0) {
    return { recentRatings: [], averageRating: 0.0, trend: 'stable' };
  }

  const sum = recent.reduce((acc, curr) => acc + curr, 0);
  const averageRating = Number((sum / recent.length).toFixed(2));

  if (recent.length < 2) {
    return { recentRatings: recent, averageRating, trend: 'stable' };
  }

  const splitIdx = Math.floor(recent.length / 2);
  const firstHalf = recent.slice(0, splitIdx);
  const secondHalf = recent.slice(splitIdx);

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  if (avgSecond - avgFirst >= 0.3) trend = 'improving';
  else if (avgFirst - avgSecond >= 0.3) trend = 'declining';

  return { recentRatings: recent, averageRating, trend };
}

export function clampPlayerAttributesRecord<T extends Record<string, number | undefined>>(
  attrs: T
): T {
  const out = { ...attrs };
  for (const key of Object.keys(out) as Array<keyof T>) {
    const v = out[key];
    if (typeof v === 'number') {
      out[key] = clampAttributeValue(v) as T[keyof T];
    }
  }
  return out;
}

function inferPersonalityLabel(dp: DecodedFmSavePlayer): string {
  if (dp.personalityLabel && dp.personalityLabel.trim()) {
    return dp.personalityLabel.trim();
  }
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

/**
 * Single source of truth for Squad Status derived from Promised Playing Time,
 * preventing Squad Status from contradicting Promised Playing Time.
 */
export function resolveSquadStatusFromPlayingTime(
  promisedPlayingTime: string | null | undefined,
  fallback: PlayerRecord['status'] = 'Rotation'
): PlayerRecord['status'] {
  if (!promisedPlayingTime || !promisedPlayingTime.trim()) return fallback;
  const norm = promisedPlayingTime.trim().toLowerCase();
  if (
    norm.includes('star') ||
    norm.includes('important') ||
    norm.includes('regular starter') ||
    norm.includes('first choice')
  ) {
    return 'Starter';
  }
  if (norm.includes('surplus') || norm.includes('not needed')) {
    return 'Surplus';
  }
  if (
    norm.includes('prospect') ||
    norm.includes('youngster') ||
    norm.includes('b team') ||
    norm.includes('youth')
  ) {
    return 'Youth';
  }
  if (
    norm.includes('squad') ||
    norm.includes('impact') ||
    norm.includes('fringe') ||
    norm.includes('backup') ||
    norm.includes('cup goalkeeper') ||
    norm.includes('rotation')
  ) {
    return 'Rotation';
  }
  return fallback;
}

/**
 * Aggregate Apps, Minutes, Avg Rating, Goals, and Assists from recorded recent
 * player_match_stats when player_season_stats is unavailable.
 */
export function aggregateRecentMatchProduction(ratings: PlayerMatchRating[]): {
  apps: string;
  minutes: number;
  rating: number | null;
  goals: number;
  assists: number;
  source: 'From Recent Matches';
} {
  const appsCount = ratings.length;
  let minutes = 0;
  let goals = 0;
  let assists = 0;
  const validRatings: number[] = [];
  for (const r of ratings) {
    minutes += Math.max(0, Number(r.minutes) || 0);
    goals += Math.max(0, Number(r.goals) || 0);
    assists += Math.max(0, Number(r.assists) || 0);
    if (typeof r.rating === 'number' && Number.isFinite(r.rating) && r.rating > 0) {
      validRatings.push(r.rating);
    }
  }
  const avgRating =
    validRatings.length > 0
      ? Number(
          (
            validRatings.reduce((acc, val) => acc + val, 0) / validRatings.length
          ).toFixed(2)
        )
      : null;
  return {
    apps: String(appsCount),
    minutes,
    rating: avgRating,
    goals,
    assists,
    source: 'From Recent Matches',
  };
}

function computeRelativeStarRating(value: number, squadMedian: number): number {
  if (!value || value <= 0) return 2.5;
  const baseline = squadMedian > 0 ? squadMedian : 90;
  const diff = value - baseline;
  const stars = 3.0 + diff / 18;
  const clamped = Math.min(5.0, Math.max(1.0, stars));
  return Math.round(clamped * 2) / 2;
}

function extractUidFromPlayerRecord(player: PlayerRecord): number | null {
  if (typeof player.uid === 'number' && player.uid > 0) {
    return player.uid;
  }
  const m = player.id.match(/^fm-uid-(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function resolveScoutBadges(dp: DecodedFmSavePlayer): ScoutBadge[] {
  if (Array.isArray(dp.scoutBadges) && dp.scoutBadges.length > 0) {
    return dp.scoutBadges;
  }
  if (dp.internalReliability) {
    return deriveQualitativeScoutBadges(dp.internalReliability);
  }
  return [];
}

function lookupUidRecord<T>(
  map: Record<string | number, T> | undefined,
  uid: number
): T | undefined {
  if (!map) return undefined;
  return map[uid] ?? map[String(uid)];
}