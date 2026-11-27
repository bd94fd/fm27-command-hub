import { MatchLogEntry, PlayerRecord, StaffJobRatings, StaffRecord } from '../types/fm27';
import { normalizeSponsorshipDeal } from './clubFinances';
import {
  ActiveSuspensionRecord,
  BinaryForensicsSnapshot,
  ClubFacilitiesSummary,
  ClubGovernanceState,
  CompetitionRegistrationRules,
  ContractDetails,
  DeepTacticRecord,
  DivisionBenchmarks,
  FinancialRunway,
  FmExtractionManifest,
  HydratedSquadPlayer,
  InternalReliabilityFlags,
  JobVacancyEntry,
  LastMatchTacticBlueprint,
  LeagueTableRow,
  MonthlyFinance,
  Pass0ExtractionPayload,
  PlayerAttributes,
  PlayerMatchRating,
  PatchCompatibilitySummary,
  RecruitmentTarget,
  ScoutBadge,
  SeasonHistoryEntry,
  SponsorshipDeal,
  SquadPlannerSlot,
  TeamMatchStat,
  TransferWindowInfo,
} from '../types/fmSave';
import { normalizePlayerName } from './fmFileImporter';
import {
  buildClubGovernanceState,
  buildLastMatchTacticBlueprint,
} from './clubGovernanceAndTactics';
import {
  classifyMatchCompetitionBucket,
  deriveFootballSeasonLabel,
} from './matchScopeHelpers';
import { normalizeJobVacancy } from './jobVacancies';
import { buildAvailabilityIndex } from './hydrateAvailability';
import {
  buildAnalystSaveContext,
  collectExtractionWarnings,
  resolveCompetitionRules,
} from './hydrateAnalystContext';
import {
  clampPlayerAttributesRecord,
  deriveQualitativeScoutBadges,
  mergeSquadWithSave,
} from './hydratePlayerMerge';
import { buildMatchLog } from './hydrateMatchLog';
import { buildFinanceSnapshot } from './hydrateFinances';
import { hydrateStaff } from './hydrateStaff';

export { calculateFinancialRunway } from './hydrateFinances';

export {
  aggregateRecentMatchProduction,
  calculateLast5Form,
  resolveSquadStatusFromPlayingTime,
  resolveSquadUnit,
} from './hydratePlayerMerge';
export { deriveQualitativeScoutBadges, clampPlayerAttributesRecord } from './hydratePlayerMerge';

export const WORKER_CACHE_BUSTER = '?v=25';

export {
  shouldDefaultFastSync,
  formatStepTimingLabel,
} from './fmSaveUiHelpers';

export { normalizePlayerName };

export interface HydrationDiffResult {
  hydratedSquad: HydratedSquadPlayer[];
  removedPlayers: HydratedSquadPlayer[];
  addedPlayers: HydratedSquadPlayer[];
  matchedCount: number;
}

export function hydratePass0Payload(rawJson: string): Pass0ExtractionPayload {
  const parsed = JSON.parse(rawJson);
  const squad: HydratedSquadPlayer[] = (parsed.squad || []).map(
    (p: Record<string, unknown>) => {
      const existingBadges = Array.isArray(p.scoutBadges)
        ? (p.scoutBadges as ScoutBadge[])
        : null;
      const flags = (p.internalReliability as InternalReliabilityFlags | undefined) || {
        consistency: 10,
        importantMatches: 10,
        injuryProneness: 10,
        versatility: 10,
      };
      const scoutBadges =
        existingBadges && existingBadges.length > 0
          ? existingBadges
          : deriveQualitativeScoutBadges(flags);

      const {
        internalReliability: _dropRel,
        hiddenPersonality: _dropHidden,
        ca: _dropCa,
        pa: _dropPa,
        ...cleanPlayer
      } = p;

      const rawAttrs = (cleanPlayer.attributes || {}) as Partial<PlayerAttributes>;
      const clampedAttrs = clampPlayerAttributesRecord(
        rawAttrs as Record<string, number | undefined>
      ) as unknown as PlayerAttributes;

      return {
        ...(cleanPlayer as Omit<HydratedSquadPlayer, 'scoutBadges' | 'attributes'>),
        attributes: clampedAttrs,
        scoutBadges,
      };
    }
  );

  return {
    clubUid: Number(parsed.clubUid) || 0,
    squad,
    activeSuspensions: Array.isArray(parsed.activeSuspensions)
      ? (parsed.activeSuspensions as ActiveSuspensionRecord[])
      : [],
    divisionBenchmarks: parsed.divisionBenchmarks || null,
    playerMatchStats: parsed.playerMatchStats || {},
    teamMatchStats: Array.isArray(parsed.teamMatchStats) ? parsed.teamMatchStats : [],
    playerSeasonHistory: parsed.playerSeasonHistory || {},
    staff: Array.isArray(parsed.staff) ? parsed.staff : [],
    monthlyFinances: Array.isArray(parsed.monthlyFinances) ? parsed.monthlyFinances : [],
    facilities: parsed.facilities || {},
    sponsorships: Array.isArray(parsed.sponsorships)
      ? parsed.sponsorships.map((deal: SponsorshipDeal, index: number) =>
          normalizeSponsorshipDeal(deal, index)
        )
      : [],
    transferWindows: parsed.transferWindows || { isOpen: false },
    competitionRules: parsed.competitionRules || {},
    selections: parsed.selections || {},
    setPieces: parsed.setPieces || {},
    training: parsed.training || {},
    jobVacancies: Array.isArray(parsed.jobVacancies)
      ? parsed.jobVacancies.map((vacancy: JobVacancyEntry, index: number) =>
          normalizeJobVacancy(vacancy, index)
        )
      : [],
    recruitmentTargets: Array.isArray(parsed.recruitmentTargets)
      ? parsed.recruitmentTargets
      : [],
  };
}

/**
 * UID-first squad matching with normalized name+position fallback and stale removal preview.
 */
export function hydrateAndMatchSquad(
  existingBaseline: HydratedSquadPlayer[],
  incomingPayload: Pass0ExtractionPayload
): HydrationDiffResult {
  const incomingMapByUid = new Map<number, HydratedSquadPlayer>();
  const incomingMapByNamePos = new Map<string, HydratedSquadPlayer>();

  for (const player of incomingPayload.squad) {
    if (player.uid && player.uid > 0) {
      incomingMapByUid.set(player.uid, player);
    }
    const key = `${normalizePlayerName(player.name)}|${player.primaryPosition}`;
    if (!incomingMapByNamePos.has(key)) {
      incomingMapByNamePos.set(key, player);
    }
  }

  const matchedUids = new Set<number>();
  const matchedNames = new Set<string>();
  const hydratedSquad: HydratedSquadPlayer[] = [];
  const removedPlayers: HydratedSquadPlayer[] = [];
  const addedPlayers: HydratedSquadPlayer[] = [];

  for (const basePlayer of existingBaseline) {
    let matched: HydratedSquadPlayer | undefined;

    if (basePlayer.uid && basePlayer.uid > 0) {
      matched = incomingMapByUid.get(basePlayer.uid);
      if (matched) {
        matchedUids.add(matched.uid);
      }
    }

    if (!matched) {
      const key = `${normalizePlayerName(basePlayer.name)}|${basePlayer.primaryPosition}`;
      const candidate = incomingMapByNamePos.get(key);
      if (candidate && (!candidate.uid || !matchedUids.has(candidate.uid))) {
        matched = candidate;
        matchedNames.add(key);
        if (candidate.uid && candidate.uid > 0) {
          matchedUids.add(candidate.uid);
        }
      }
    }

    if (matched) {
      hydratedSquad.push({
        ...basePlayer,
        ...matched,
        attributes: clampPlayerAttributesRecord({
          ...basePlayer.attributes,
          ...matched.attributes,
        }),
        scoutBadges: matched.scoutBadges || basePlayer.scoutBadges,
      });
    } else {
      removedPlayers.push(basePlayer);
    }
  }

  for (const incomingPlayer of incomingPayload.squad) {
    const uidMatched = Boolean(
      incomingPlayer.uid && matchedUids.has(incomingPlayer.uid)
    );
    const key = `${normalizePlayerName(incomingPlayer.name)}|${incomingPlayer.primaryPosition}`;
    const nameMatched = matchedNames.has(key);

    if (!uidMatched && !nameMatched) {
      addedPlayers.push(incomingPlayer);
      hydratedSquad.push(incomingPlayer);
    }
  }

  return {
    hydratedSquad,
    removedPlayers,
    addedPlayers,
    matchedCount: hydratedSquad.length - addedPlayers.length,
  };
}

export interface DecodedFmSavePlayer {
  uid: number;
  name: string;
  shirtNumber?: number | null;
  position: string;
  primaryPosition?: string;
  secondaryPositions?: string[];
  age: number | null;
  heightCm?: number;
  marketValue?: number | null;
  marketValueState?: 'ok' | 'capped' | 'unset' | 'zero';
  marketValueCapped?: boolean;
  potentialUncertain?: boolean;
  morale?: string | null;
  nation?: string | null;
  /** Optional internal-only fields from legacy payloads; never emitted by Pass 0 Python extractor or exposed to UI/AI */
  ca?: number;
  pa?: number;
  abilityStars?: number;
  potentialStars?: number;
  personalityLabel?: string;
  condition: number | null;
  sharpness: number | null;
  leftFoot?: number;
  rightFoot?: number;
  preferredFoot?: 'Left' | 'Right' | 'Either';
  wagePw: number | null;
  expires: string | null;
  contractExpiryMonths?: number;
  contractDetails?: ContractDetails | null;
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
  traits?: string[];
  scoutBadges?: ScoutBadge[];
  internalReliability?: InternalReliabilityFlags | null;
  last5Ratings?: PlayerMatchRating[];
  seasonHistory?: SeasonHistoryEntry[];
  hiddenPersonality?: {
    professionalism: number | null;
    ambition: number | null;
    pressure: number | null;
    temperament: number | null;
    loyalty: number | null;
  } | null;
  activeSuspensions?: ActiveSuspensionRecord[];
  suspensionsCount: number;
}

export interface DecodedFmSaveStaff {
  uid: number;
  name: string;
  role: string | null;
  age?: number | null;
  nation?: string | null;
  club?: string;
  wagePw?: number | null;
  expires?: string | null;
  secondaryJob?: string | null;
  jobRatings?: StaffJobRatings | null;
  coachingDefending?: number;
  coachingAttacking?: number;
  coachingTactical?: number;
  judgingAbility?: number;
  judgingPotential?: number;
  attributes?: StaffRecord['attributes'] | null;
}

export interface DecodedFmSaveMatch {
  matchId?: string;
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
    scoutingBudget?: number | null;
    scoutingBudgetRemaining?: number | null;
    fmsaveVersion: string;
    fileName?: string;
    fileSizeMb?: number;
    decodedAtIso?: string;
    importScope?: string;
    fastSync?: boolean;
    mountMode?: string;
    patchCompatibility?: PatchCompatibilitySummary | null;
  };
  clubUid?: number | null;
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
    rows?: LeagueTableRow[];
  } | null;
  finances: {
    month: string | null;
    balance: number | null;
    wagePayrollWeekly: number | null;
    wageBudgetWeekly: number | null;
    transferBudgetRemaining: number | null;
  } | null;
  monthlyFinances?: MonthlyFinance[];
  activeInjuries: Array<{
    playerUid: number | null;
    playerName: string | null;
    typeName: string;
    date: string | null;
    expectedReturn?: string | null;
    severity: string | null;
    cause: string | null;
    kind: string;
  }>;
  activeSuspensions?: ActiveSuspensionRecord[];
  divisionBenchmarks?: DivisionBenchmarks | null;
  tactics: Array<
    DeepTacticRecord & {
      index: number;
      name: string;
      styleName: string;
      mentality: string;
    }
  >;
  governance?: Partial<ClubGovernanceState> | null;
  binaryForensics?: BinaryForensicsSnapshot | null;
  mentoring: Array<{
    groupNumber: number;
    label: string;
    members: string[];
  }>;
  // Pass 0 Groups 2–4 optional sections
  playerMatchStats?: Record<string | number, PlayerMatchRating[]>;
  teamMatchStats?: TeamMatchStat[];
  playerSeasonHistory?: Record<string | number, SeasonHistoryEntry[]>;
  facilities?: ClubFacilitiesSummary;
  sponsorships?: SponsorshipDeal[];
  transferWindows?: TransferWindowInfo;
  competitionRules?: CompetitionRegistrationRules | Record<string, unknown>;
  selections?: Record<string, unknown>;
  setPieces?: Record<string, unknown>;
  training?: Record<string, unknown>;
  squadPlanner?: Array<{
    seasonOffset: number;
    slot: number;
    playerUids: number[];
    playerNames: string[];
  }>;
  jobVacancies?: JobVacancyEntry[];
  recruitmentTargets?: RecruitmentTarget[];
  extractionManifest?: FmExtractionManifest;
  fastSync?: boolean;
  warnings?: string[];
  extractionWarnings?: string[];
  stepTimingsMs?: Record<string, number>;
}

export interface HydratedSaveState {
  updatedSquad: PlayerRecord[];
  updatedStaff: StaffRecord[];
  updatedMatches: MatchLogEntry[];
  removedPlayers: PlayerRecord[];
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
  canonicalBalanceNum: number | null;
  financialRunway: FinancialRunway | null;
  recruitmentTargets: RecruitmentTarget[];
  activeSuspensions: ActiveSuspensionRecord[];
  competitionRules: CompetitionRegistrationRules | null;
  divisionBenchmarks: DivisionBenchmarks | null;
  governance?: ClubGovernanceState | null;
  lastMatchTactic?: LastMatchTacticBlueprint | null;
  squadPlanner?: SquadPlannerSlot[];
  extractionWarnings: string[];
  fastSync: boolean;
  stepTimingsMs: Record<string, number>;
  analystPromptContext: string;
  decodedPayload: DecodedFmSavePayload;
}

/**
 * Hydrates the entire FM27 Command Hub (Squad Database, Staff Directory, Match Log,
 * Recruitment Targets, Financial Runway, Executive KPI strip, and AI Tactical Analyst context)
 * directly from a decoded Pass 0 .fm save.
 * Uses UID-first matching with stale removal preview and NEVER exposes raw CA/PA or hidden numbers.
 */
export function hydrateAppFromDecodedFmSave(
  decoded: DecodedFmSavePayload,
  currentSquad: PlayerRecord[],
  currentMatches: MatchLogEntry[]
): HydratedSaveState {
  const byUid = new Map<number, DecodedFmSavePlayer>();
  const byNorm = new Map<string, DecodedFmSavePlayer>();
  for (const p of decoded.players) {
    if (p.uid && p.uid > 0) {
      byUid.set(p.uid, p);
    }
    byNorm.set(normalizePlayerName(p.name), p);
  }

  const availability = buildAvailabilityIndex(decoded);
  const activeSuspensionsList = availability.suspensions;

  const { squad: finalSquad, changedPlayers, removedPlayers } = mergeSquadWithSave({
    decoded,
    currentSquad,
    availability,
  });

  // 2. Build honest Match Log from .fm save enriched with Group 2 teamMatchStats
  const { matches: updatedMatches, newlyAddedCount } = buildMatchLog({ decoded, currentMatches });

  // 3. Executive Strip Labels & Group 3 Financial Runway
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
  } else {
    leagueRecordLabel = '0 GP · Pre-Season';
    leagueStandingLabel = 'No league table yet — 0 competitive matches played';
  }

  let squadOutputLabel: string | null = null;
  let squadOutputSubLabel: string | null = null;
  if (finalSquad.length > 0) {
    const totalGoals = finalSquad.reduce((s, p) => s + (p.goals || 0), 0);
    const totalXg = finalSquad.reduce((s, p) => s + (p.xG || 0), 0);
    const totalAssists = finalSquad.reduce((s, p) => s + (p.assists || 0), 0);
    const totalXa = finalSquad.reduce((s, p) => s + (p.xA || 0), 0);
    const hasPlayerProduction =
      totalGoals > 0 ||
      totalAssists > 0 ||
      totalXg > 0 ||
      totalXa > 0 ||
      finalSquad.some((p) => (p.minutes || 0) > 0);
    const ls = decoded.leagueStanding;
    const looksMultiSeason =
      ls && ls.played > 0 && totalGoals > ls.goalsFor + 6;

    if ((looksMultiSeason || !hasPlayerProduction) && ls && ls.played > 0) {
      const gdStr = ls.goalDiff >= 0 ? `+${ls.goalDiff}` : `${ls.goalDiff}`;
      const gfPerGame = (ls.goalsFor / ls.played).toFixed(2);
      const gaPerGame = (ls.goalsAgainst / ls.played).toFixed(2);
      squadOutputLabel = `${ls.goalsFor} GF / ${ls.goalsAgainst} GA (${gdStr} GD)`;
      const currentSeasonLabel = deriveFootballSeasonLabel(saveDateLabel);
      const leagueXgMatches = updatedMatches.filter((m) => {
        if (typeof m.xGFor !== 'number' || typeof m.xGAgainst !== 'number') {
          return false;
        }
        if (classifyMatchCompetitionBucket(m.competition) !== 'league') {
          return false;
        }
        if (currentSeasonLabel !== 'Unknown Season') {
          const matchSeason = deriveFootballSeasonLabel(m.date);
          if (matchSeason !== 'Unknown Season' && matchSeason !== currentSeasonLabel) {
            return false;
          }
        }
        return true;
      });
      if (!hasPlayerProduction && leagueXgMatches.length > 0) {
        const sumXgFor = leagueXgMatches.reduce((s, m) => s + (m.xGFor ?? 0), 0);
        const sumXgAg = leagueXgMatches.reduce((s, m) => s + (m.xGAgainst ?? 0), 0);
        squadOutputSubLabel = `League (${ls.played} GP) · xG ${sumXgFor.toFixed(2)} For vs ${sumXgAg.toFixed(2)} Against`;
      } else {
        squadOutputSubLabel = `Current Season League (${ls.played} GP · ${gfPerGame} GF/g · ${gaPerGame} GA/g)`;
      }
    } else if (hasPlayerProduction) {
      const hasPerPlayerXg = totalXg > 0 || totalXa > 0;
      squadOutputLabel = hasPerPlayerXg
        ? `${totalGoals} Gls (${totalXg.toFixed(2)} xG) · ${totalAssists} Ast (${totalXa.toFixed(2)} xA)`
        : `${totalGoals} Gls · ${totalAssists} Ast`;
      const topScorer = [...finalSquad].sort((a, b) => (b.goals || 0) - (a.goals || 0))[0];
      const topRated = [...finalSquad]
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
          : `Current season across ${finalSquad.length} squad players`;
    } else {
      squadOutputLabel = '0 GP · Season Not Started';
      squadOutputSubLabel = decoded.meta.fastSync
        ? `Re-sync with Full Sync if matches have been played (${finalSquad.length} players)`
        : `0 competitive matches played yet (${finalSquad.length} players)`;
    }
  }

  let tacticHeadlineLabel: string | null = null;
  let tacticSubLabel: string | null = null;
  if (decoded.tactics.length > 0) {
    const primary = decoded.tactics[0];
    tacticHeadlineLabel = `${primary.name} (${primary.mentality})`;
    tacticSubLabel = `${decoded.activeInjuries.length} Active Injur${decoded.activeInjuries.length === 1 ? 'y' : 'ies'} · ${decoded.mentoring.length} Mentoring Groups`;
  } else {
    tacticHeadlineLabel = 'Dual-Phase 4-3-3 (War Room)';
    tacticSubLabel = `${decoded.activeInjuries.length} Active Injur${decoded.activeInjuries.length === 1 ? 'y' : 'ies'} · ${decoded.mentoring.length} Mentoring Groups`;
  }

  const { canonicalBalanceNum, balanceLabel, wageComplianceLabel, financialRunway } =
    buildFinanceSnapshot(decoded);

  // Group 4: Sanitized recruitment targets (zero raw CA/PA)
  const recruitmentTargets: RecruitmentTarget[] = (
    decoded.recruitmentTargets || []
  )
    .slice(0, 500)
    .map((t) => {
      const cleanRecord = { ...(t as unknown as Record<string, unknown>) };
      delete cleanRecord.ca;
      delete cleanRecord.pa;
      delete cleanRecord.internalReliability;
      return cleanRecord as unknown as RecruitmentTarget;
    });

  const updatedStaff: StaffRecord[] = hydrateStaff(decoded);

  // 4. Build Rich Ground-Truth Context for Tactical Analyst (ZERO raw CA/PA or raw hidden numbers!)
  const typedRules = resolveCompetitionRules(decoded);
  const mergedWarnings = collectExtractionWarnings(decoded);
  const usedFastSync = Boolean(decoded.fastSync ?? decoded.meta?.fastSync ?? false);
  const divisionBenchmarks = decoded.divisionBenchmarks || null;

  const analystPromptContext = buildAnalystSaveContext({
    decoded,
    saveDateLabel,
    nextFixtureLabel,
    leagueStandingLabel,
    wageComplianceLabel,
    balanceLabel,
    financialRunway,
    changedPlayers,
    removedPlayers,
    newlyAddedCount,
    recruitmentTargets,
    suspensions: activeSuspensionsList,
  });

  const governance = buildClubGovernanceState(decoded, finalSquad);
  const lastMatchTactic = buildLastMatchTacticBlueprint(decoded, finalSquad, 0);
  const squadPlanner: SquadPlannerSlot[] = Array.isArray(decoded.squadPlanner)
    ? decoded.squadPlanner
    : [];

  return {
    updatedSquad: finalSquad,
    updatedStaff,
    updatedMatches,
    removedPlayers,
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
    canonicalBalanceNum,
    financialRunway,
    recruitmentTargets,
    activeSuspensions: activeSuspensionsList,
    competitionRules: typedRules,
    divisionBenchmarks,
    governance,
    lastMatchTactic,
    squadPlanner,
    extractionWarnings: mergedWarnings,
    fastSync: usedFastSync,
    stepTimingsMs:
      decoded.stepTimingsMs && typeof decoded.stepTimingsMs === 'object'
        ? { ...decoded.stepTimingsMs }
        : {},
    analystPromptContext,
    decodedPayload: {
      ...decoded,
      sponsorships: (decoded.sponsorships ?? []).map((deal, index) =>
        normalizeSponsorshipDeal(deal, index)
      ),
      jobVacancies: (decoded.jobVacancies ?? []).map((vacancy, index) =>
        normalizeJobVacancy(vacancy, index)
      ),
    },
  };
}
