import { MatchLogEntry, PlayerRecord, StaffJobRatings, StaffRecord } from '../types/fm27';
import {
  formatClubMoney,
  formatWageComplianceSummary,
  resolveCanonicalBalanceNum,
} from './clubFinances';
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
  FormTrend,
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
  clampAttributeValue,
  clampConditionSharpness,
} from '../types/fmSave';
import { normalizePlayerName } from './fmFileImporter';
import { inferFm27Roles } from './fm27RoleMatcher';
import { isSuspensionActiveForCompetition } from './bestXiSolver';
import {
  buildClubGovernanceState,
  buildLastMatchTacticBlueprint,
} from './clubGovernanceAndTactics';
import {
  classifyMatchCompetitionBucket,
  deriveFootballSeasonLabel,
} from './matchScopeHelpers';

export const WORKER_CACHE_BUSTER = '?v=24';

export function resolveSquadUnit(
  teamSlot?: number | null
): 'First Team' | 'Reserves' | 'U21' | 'U18' {
  const slot = typeof teamSlot === 'number' && Number.isFinite(teamSlot) ? teamSlot : 0;
  if (slot <= 0) return 'First Team';
  if (slot === 1) return 'Reserves';
  if (slot === 2) return 'U21';
  return 'U18';
}

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

export function calculateFinancialRunway(
  finances: MonthlyFinance[],
  canonicalBalanceOverride?: number | null
): FinancialRunway {
  if (!finances || finances.length === 0) {
    const fallbackBal =
      typeof canonicalBalanceOverride === 'number' &&
      Number.isFinite(canonicalBalanceOverride)
        ? canonicalBalanceOverride
        : 0;
    return {
      currentBalance: fallbackBal,
      monthlyBurnRate: 0,
      runwayMonths: 0,
      status: 'Critical',
    };
  }
  const currentBalance =
    typeof canonicalBalanceOverride === 'number' &&
    Number.isFinite(canonicalBalanceOverride)
      ? canonicalBalanceOverride
      : finances[finances.length - 1].balance;
  const negativeCashflows = finances
    .map((f) => f.netCashflow)
    .filter((cashflow) => cashflow < 0);

  let monthlyBurnRate = 0;
  if (negativeCashflows.length > 0) {
    const totalBurn = negativeCashflows.reduce(
      (acc, val) => acc + Math.abs(val),
      0
    );
    monthlyBurnRate = totalBurn / negativeCashflows.length;
  }

  let runwayMonths = 999;
  if (monthlyBurnRate > 0) {
    runwayMonths = Math.max(
      0,
      Number((currentBalance / monthlyBurnRate).toFixed(1))
    );
  }

  let status: 'Critical' | 'Warning' | 'Healthy' = 'Healthy';
  if (currentBalance <= 0 || runwayMonths < 3) {
    status = 'Critical';
  } else if (runwayMonths < 6) {
    status = 'Warning';
  }

  return { currentBalance, monthlyBurnRate, runwayMonths, status };
}

function clampPlayerAttributesRecord<T extends Record<string, number | undefined>>(
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
    sponsorships: Array.isArray(parsed.sponsorships) ? parsed.sponsorships : [],
    transferWindows: parsed.transferWindows || { isOpen: false },
    competitionRules: parsed.competitionRules || {},
    selections: parsed.selections || {},
    setPieces: parsed.setPieces || {},
    training: parsed.training || {},
    jobVacancies: Array.isArray(parsed.jobVacancies) ? parsed.jobVacancies : [],
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
  age: number;
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
  wagePw: number;
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
  role: string;
  age?: number;
  nation?: string;
  club?: string;
  wagePw?: number;
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

function formatMoney(amount: number | null | undefined): string {
  return formatClubMoney(amount, '£');
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

  // Pass 1 Tier-1: Collect structured suspensions by playerUid
  const activeSuspensionsList: ActiveSuspensionRecord[] = [];
  const seenBanKey = new Set<string>();
  const pushBan = (ban: ActiveSuspensionRecord) => {
    if (!ban || typeof ban.matchesRemaining !== 'number' || ban.matchesRemaining <= 0) return;
    const key = `${ban.playerUid}|${ban.competitionName}|${ban.matchesRemaining}`;
    if (seenBanKey.has(key)) return;
    seenBanKey.add(key);
    activeSuspensionsList.push(ban);
  };
  for (const b of decoded.activeSuspensions || []) {
    pushBan(b);
  }
  for (const dp of decoded.players) {
    for (const b of dp.activeSuspensions || []) {
      pushBan(b);
    }
  }
  const bansByUid = new Map<number, ActiveSuspensionRecord[]>();
  for (const ban of activeSuspensionsList) {
    const arr = bansByUid.get(ban.playerUid) || [];
    arr.push(ban);
    bansByUid.set(ban.playerUid, arr);
  }

  // Hydrate active injuries from decoded.activeInjuries so Best XI / Match Prep / AI Analyst respect injured status
  const injuredUids = new Set<number>();
  const injuredNames = new Set<string>();
  for (const inj of decoded.activeInjuries || []) {
    if (!inj) continue;
    if (typeof inj.playerUid === 'number' && inj.playerUid > 0) {
      injuredUids.add(inj.playerUid);
    }
    if (typeof inj.playerName === 'string' && inj.playerName.trim()) {
      injuredNames.add(normalizePlayerName(inj.playerName));
    }
  }
  const isPlayerActivelyInjured = (uid: number | undefined, name: string | undefined): boolean => {
    if (typeof uid === 'number' && uid > 0 && injuredUids.has(uid)) return true;
    if (name && injuredNames.has(normalizePlayerName(name))) return true;
    return false;
  };

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
    if (dp.age) next.age = dp.age;
    if (dp.wagePw > 0 && dp.wagePw !== existing.wagePw) {
      changes.push(`Wage £${existing.wagePw}→£${dp.wagePw}/wk`);
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
      name: dp.name || 'Unknown Player',
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
      age: Number(dp.age) || 20,
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
      expires: typeof dp.expires === 'string' && dp.expires.trim() ? dp.expires : 'N/A',
      contractExpiryMonths: dp.contractExpiryMonths,
      contractDetails: dp.contractDetails ?? undefined,
      activeSuspensions: bansByUid.get(dp.uid) || [],
      nation: (dp.nation && dp.nation.trim()) || 'FM',
      wagePw: Number(dp.wagePw) || 0,
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

  const finalSquad = mergedSquad;

  // 2. Build honest Match Log from .fm save enriched with Group 2 teamMatchStats
  const teamStatsList = decoded.teamMatchStats || [];
  const findTeamMatchStat = (pm: DecodedFmSaveMatch): TeamMatchStat | undefined => {
    const oppLower = (pm.opponent || '').toLowerCase();
    return teamStatsList.find((ts) => {
      if (pm.matchId && ts.matchId && ts.matchId === pm.matchId) return true;
      if (pm.dateIso && ts.date && ts.date === pm.dateIso) return true;
      return (
        ts.opponent.toLowerCase() === oppLower &&
        ts.isHome === (pm.venue === 'H')
      );
    });
  };

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
    0
  );

  const chronologicalPlayed = [...decoded.playedMatches].reverse();
  let newlyAddedCount = 0;
  const fmHydratedMatches: MatchLogEntry[] = [];

  for (const pm of chronologicalPlayed) {
    const dateKey = (pm.dateDmy || pm.dateIso || '').trim();
    const safeOpp = pm.opponent || 'Opponent';
    const safeScore = pm.score || '0 - 0';
    const oppKey = safeOpp.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!dateKey) continue;

    const tms = findTeamMatchStat(pm);
    const enrichedXgFor = pm.xGFor ?? tms?.xgFor ?? null;
    const enrichedXgAgainst = pm.xGAgainst ?? tms?.xgAgainst ?? null;
    const enrichedPoss = pm.possession ?? tms?.possession ?? null;
    const enrichedPass = pm.passCompletion ?? tms?.passCompletion ?? null;
    const enrichedShots =
      pm.shotsFor ||
      (tms && tms.shots !== null
        ? tms.shotsOnTarget !== null
          ? `${tms.shots} (${tms.shotsOnTarget})`
          : String(tms.shots)
        : '—');

    const isGenericCompetitionLabel = (label?: string | null): boolean =>
      !label ||
      /^(league\s*\/\s*cup|cup\s*\/\s*friendly|unclassified(?:\s+match)?|domestic\s+league|unknown)$/i.test(
        label.trim()
      );
    const decodedComp = (pm.competition || '').trim();
    const resolvedCompetition =
      decodedComp && !isGenericCompetitionLabel(decodedComp)
        ? decodedComp
        : decodedComp || 'Friendly';

    const existing = findExistingMatchDetails(pm);
    if (existing) {
      const nextComp =
        !isGenericCompetitionLabel(decodedComp)
          ? decodedComp
          : isGenericCompetitionLabel(existing.competition)
            ? resolvedCompetition
            : existing.competition;
      fmHydratedMatches.push({
        ...existing,
        date: dateKey,
        competition: nextComp,
        score: safeScore,
        result: pm.result,
        xGFor: existing.xGFor ?? enrichedXgFor,
        xGAgainst: existing.xGAgainst ?? enrichedXgAgainst,
        possession: existing.possession ?? enrichedPoss,
        passCompletion: existing.passCompletion ?? enrichedPass,
        shotsFor: existing.shotsFor !== '—' ? existing.shotsFor : enrichedShots,
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
      competition: resolvedCompetition,
      opponent: safeOpp,
      venue: pm.venue,
      result: pm.result,
      score: safeScore,
      xGFor: enrichedXgFor,
      xGAgainst: enrichedXgAgainst,
      possession: enrichedPoss,
      passCompletion: enrichedPass,
      shotsFor: enrichedShots,
      shotsAgainst: pm.shotsAgainst || '—',
      cccFor: pm.cccFor ?? null,
      cccAgainst: pm.cccAgainst ?? null,
      goalTimeline: 'Result & scoreline decoded directly from .fm save',
      potm: 'Attach Data Hub screenshot for match report',
      defensiveWatchpoints: pm.distanceKm
        ? `Team distance: ${pm.distanceKm} km`
        : '—',
      tacticalAudit: `Verified directly from ${decoded.meta.fileName || decoded.meta.saveName || '.fm save'} (${pm.result} ${safeScore}${enrichedXgFor !== null ? `, xG ${enrichedXgFor.toFixed(2)}-${(enrichedXgAgainst ?? 0).toFixed(2)}` : ''}).`,
      source: 'FM_SAVE',
    });
  }

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

  let wageComplianceLabel: string | null = null;
  const canonicalBalanceNum = resolveCanonicalBalanceNum({
    financesBalance: decoded.finances?.balance ?? null,
    metaBalance: decoded.meta.balance ?? null,
    monthlyFinances: decoded.monthlyFinances ?? null,
  });
  const balanceLabel: string | null =
    canonicalBalanceNum !== null ? formatMoney(canonicalBalanceNum) : null;

  if (decoded.finances) {
    if (
      decoded.finances.wagePayrollWeekly !== null &&
      decoded.finances.wageBudgetWeekly !== null
    ) {
      wageComplianceLabel = formatWageComplianceSummary(
        decoded.finances.wagePayrollWeekly,
        decoded.finances.wageBudgetWeekly,
        '£'
      );
    }
  }

  const financialRunway =
    decoded.monthlyFinances && decoded.monthlyFinances.length > 0
      ? calculateFinancialRunway(decoded.monthlyFinances, canonicalBalanceNum)
      : null;

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

  // Group 3: Staff Hydration
  const updatedStaff: StaffRecord[] = (decoded.staff || []).map((s, idx) => ({
    id: `fm-staff-${s.uid || idx}`,
    uid: s.uid,
    name: s.name || 'Club Staff',
    role: s.role || 'Coach',
    age: Number(s.age) || 35,
    nation: s.nation || 'FM',
    club: s.club || decoded.meta.clubName || '',
    wagePw:
      typeof s.wagePw === 'number' && Number.isFinite(s.wagePw) ? s.wagePw : null,
    expires: s.expires || 'N/A',
    secondaryJob: s.secondaryJob ?? null,
    jobRatings: s.jobRatings ?? null,
    attributes: s.attributes || {
      attacking: clampAttributeValue(s.coachingAttacking ?? 10),
      defending: clampAttributeValue(s.coachingDefending ?? 10),
      fitness: 10,
      goalkeeping: 10,
      mental: 10,
      possession: 10,
      set_pieces: 10,
      tactical: clampAttributeValue(s.coachingTactical ?? 10),
      technical: 10,
      working_with_youngsters: 10,
      adaptability: 10,
      authority: 10,
      determination: 10,
      judging_player_ability: clampAttributeValue(s.judgingAbility ?? 10),
      judging_player_potential: clampAttributeValue(s.judgingPotential ?? 10),
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

  // 4. Build Rich Ground-Truth Context for Tactical Analyst (ZERO raw CA/PA or raw hidden numbers!)
  const nextFixtureCompetition = decoded.upcomingFixtures[0]?.competition || null;

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
              `- ${i.playerName || 'Player'}: ${i.typeName} (${i.severity || i.kind}, ${
                i.expectedReturn ? `expected return ${i.expectedReturn}` : i.date || 'active'
              })`
          )
          .join('\n')
      : '- No active injuries reported in save.';

  const suspensionLines =
    activeSuspensionsList.length > 0
      ? activeSuspensionsList
          .map((b) => {
            const blocksNext = isSuspensionActiveForCompetition(
              b,
              nextFixtureCompetition
            );
            return blocksNext
              ? `- ${b.playerName}: BANNED FOR NEXT MATCH (${b.matchesRemaining}m remaining · ${b.competitionName} [${b.scope}] · ${b.reason}) — DO NOT SELECT AS STARTER`
              : `- ${b.playerName}: OTHER-COMPETITION BAN ONLY (${b.matchesRemaining}m in ${b.competitionName} [${b.scope}] · ${b.reason}) — AVAILABLE FOR NEXT MATCH (${nextFixtureCompetition})`;
          })
          .join('\n')
      : '- No active disciplinary suspensions.';

  const rawRules = decoded.competitionRules as Partial<CompetitionRegistrationRules> | undefined;
  const typedRules: CompetitionRegistrationRules | null =
    rawRules &&
    (rawRules.competitionName ||
      rawRules.maxSquadSize !== undefined ||
      rawRules.matchdaySubsLimit !== undefined)
      ? {
          competitionName:
            typeof rawRules.competitionName === 'string'
              ? rawRules.competitionName
              : decoded.leagueStanding?.competitionName || null,
          maxSquadSize:
            typeof rawRules.maxSquadSize === 'number' ? rawRules.maxSquadSize : null,
          minHomegrownClub:
            typeof rawRules.minHomegrownClub === 'number'
              ? rawRules.minHomegrownClub
              : null,
          minHomegrownNation:
            typeof rawRules.minHomegrownNation === 'number'
              ? rawRules.minHomegrownNation
              : null,
          maxForeignPlayers:
            typeof rawRules.maxForeignPlayers === 'number'
              ? rawRules.maxForeignPlayers
              : null,
          u21Exempt:
            typeof rawRules.u21Exempt === 'boolean' ? rawRules.u21Exempt : null,
          matchdaySubsLimit:
            typeof rawRules.matchdaySubsLimit === 'number'
              ? rawRules.matchdaySubsLimit
              : null,
          fixturesPerClub:
            typeof rawRules.fixturesPerClub === 'number'
              ? rawRules.fixturesPerClub
              : null,
          promotionPlaces:
            typeof rawRules.promotionPlaces === 'number'
              ? rawRules.promotionPlaces
              : null,
          playoffPlaces:
            typeof rawRules.playoffPlaces === 'number'
              ? rawRules.playoffPlaces
              : null,
          relegationPlaces:
            typeof rawRules.relegationPlaces === 'number'
              ? rawRules.relegationPlaces
              : null,
          prizeMoney:
            typeof rawRules.prizeMoney === 'number' ? rawRules.prizeMoney : null,
          rounds:
            typeof rawRules.rounds === 'number' ? rawRules.rounds : null,
        }
      : null;

  const divisionBenchmarks = decoded.divisionBenchmarks || null;

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

  const runwayLine = financialRunway
    ? `Financial Runway: ${financialRunway.status} (${financialRunway.runwayMonths} months remaining · Monthly Burn: £${Math.round(financialRunway.monthlyBurnRate).toLocaleString()}/mo)`
    : '';

  const facilitiesLine = decoded.facilities
    ? `Club Facilities: Training=${String(decoded.facilities.training ?? 'Unknown')}, Youth=${String(decoded.facilities.youth ?? 'Unknown')}`
    : '';

  const vacanciesLine =
    decoded.jobVacancies && decoded.jobVacancies.length > 0
      ? `Active Job Vacancies (${decoded.jobVacancies.length}): ${decoded.jobVacancies
          .slice(0, 8)
          .map((v) => `${v.role || 'Staff'} at ${v.club || 'Club'}`)
          .join(', ')}`
      : '';

  const rulesSummaryParts: string[] = [];
  if (typedRules?.maxSquadSize) rulesSummaryParts.push(`Max Squad ${typedRules.maxSquadSize}`);
  if (typedRules?.minHomegrownClub) rulesSummaryParts.push(`Min HGC ${typedRules.minHomegrownClub}`);
  if (typedRules?.minHomegrownNation) rulesSummaryParts.push(`Min HGN ${typedRules.minHomegrownNation}`);
  if (typedRules?.maxForeignPlayers) rulesSummaryParts.push(`Max Foreign ${typedRules.maxForeignPlayers}`);
  if (typedRules?.u21Exempt !== null && typedRules?.u21Exempt !== undefined) {
    rulesSummaryParts.push(`U21 Exempt: ${typedRules.u21Exempt ? 'Yes' : 'No'}`);
  }
  if (typedRules?.matchdaySubsLimit) rulesSummaryParts.push(`Subs Limit ${typedRules.matchdaySubsLimit}`);
  const rulesLine =
    rulesSummaryParts.length > 0
      ? `Registration & Competition Rules (${typedRules?.competitionName || 'League'}): ${rulesSummaryParts.join(' · ')}`
      : '';

  const fullTableLines =
    decoded.leagueStanding?.rows && decoded.leagueStanding.rows.length > 0
      ? `\n=== FULL DOMESTIC LEAGUE TABLE (${decoded.leagueStanding.competitionName}) ===\n${decoded.leagueStanding.rows
          .map(
            (r) =>
              `#${r.position} ${r.clubName} (${r.played}P ${r.won}W-${r.drawn}D-${r.lost}L, ${r.goalDifference >= 0 ? '+' : ''}${r.goalDifference}GD, ${r.points}Pts${r.form && r.form.length > 0 ? `, Form ${r.form.join('')}` : ''})`
          )
          .join('\n')}\n`
      : '';

  const targetsSummary =
    recruitmentTargets.length > 0
      ? `\n=== MANAGER'S IN-GAME FM27 SHORTLIST (${recruitmentTargets.length} PLAYERS) ===\n${recruitmentTargets
          .slice(0, 12)
          .map((t) => {
            const clubStr = t.isFreeAgent
              ? 'Free Agent'
              : `${t.currentClub || 'Club'} (Exp ${t.expires || `<=${t.contractExpiryMonths}m`})`;
            const valStr =
              typeof t.transferValue === 'number' &&
              t.transferValue > 0 &&
              t.transferValueState !== 'capped'
                ? ` · Val £${t.transferValue.toLocaleString()}`
                : '';
            const persStr = t.personality ? ` · ${t.personality}` : '';
            return `- ${t.name} (${t.primaryPosition}, Age ${t.age}, ${t.nationality || 'Unknown'}): ${clubStr}${valStr} · Wage ~£${(t.currentWagePw ?? t.demandedWageEur ?? 0).toLocaleString()}/wk${persStr}`;
          })
          .join('\n')}\n`
      : '';

  const reorderedSponsorships = (Array.isArray(decoded.sponsorships)
    ? decoded.sponsorships
    : []
  ).filter((deal) => deal?.dates_reordered === true);
  const sponsorshipWarnings =
    reorderedSponsorships.length > 0
      ? [
          `sponsorships: fmsave reversed the stored dates of ${reorderedSponsorships.length} ended FM27 contract(s) using the financial term — start and end are swapped for those rows, so read the dates with that in mind`,
        ]
      : [];

  const mergedWarnings = Array.from(
    new Set([
      ...(Array.isArray(decoded.extractionWarnings) ? decoded.extractionWarnings : []),
      ...(Array.isArray(decoded.warnings) ? decoded.warnings : []),
      ...sponsorshipWarnings,
    ])
  );

  // Contract clauses are not part of the canonical squad profile line, so they travel here — only
  // for players that actually carry one, which keeps this a clause appendix rather than a second
  // squad table.
  const contractClauseLines = decoded.players
    .map((p) => {
      const cd = p.contractDetails;
      if (!cd) return null;
      const parts: string[] = [];
      if (cd.promisedPlayingTime) parts.push(`PT: ${cd.promisedPlayingTime}`);
      if (cd.optionalExtensionYears && cd.optionalExtensionYears > 0) {
        parts.push(`Club Opt +${cd.optionalExtensionYears}y`);
      }
      for (const rc of cd.releaseClauses || []) {
        parts.push(`${rc.type} ${formatMoney(rc.amount)}`);
      }
      return parts.length > 0 ? `- ${p.name}: ${parts.join(' · ')}` : null;
    })
    .filter((line): line is string => Boolean(line));

  const contractClauseBlock =
    contractClauseLines.length > 0
      ? `=== CONTRACT CLAUSES IN SAVE (${contractClauseLines.length} PLAYERS) ===\n${contractClauseLines.join('\n')}\n\n`
      : '';

  const usedFastSync = Boolean(decoded.fastSync ?? decoded.meta?.fastSync ?? false);

  const analystPromptContext = `[LIVE FULL .FM SAVE DECODED VIA FMSAVE ${decoded.meta.fmsaveVersion} — PASS 0 & PASS 1 TIER-1 REAL IN-GAME DATA${usedFastSync ? ' · FAST SYNC MODE' : ''}]
Game: ${decoded.meta.game} (Build ${decoded.meta.build}) | Save: ${decoded.meta.saveName}
EXACT CURRENT IN-GAME DATE: ${saveDateLabel}
Managed Club: ${decoded.meta.clubName} (Manager: ${decoded.meta.managerName})
${leagueStandingLabel ? `Live League Standing (${decoded.leagueStanding?.competitionName}): ${leagueStandingLabel}` : ''}
${decoded.leagueStanding?.nextOpponentStanding ? `Next Opponent Table Standing: ${decoded.leagueStanding.nextOpponentStanding.clubName} (#${decoded.leagueStanding.nextOpponentStanding.position}, ${decoded.leagueStanding.nextOpponentStanding.points} Pts, ${decoded.leagueStanding.nextOpponentStanding.goalDiff >= 0 ? '+' : ''}${decoded.leagueStanding.nextOpponentStanding.goalDiff} GD)` : ''}
${wageComplianceLabel ? `Live Finances: Balance ${balanceLabel} | Wages ${wageComplianceLabel}` : balanceLabel ? `Live Balance: ${balanceLabel}` : ''}
${runwayLine}
${facilitiesLine}
${rulesLine}
${vacanciesLine}

=== DIFFS AUTO-APPLIED TO SQUAD DATABASE (${changedPlayers.length} PLAYERS UPDATED, ${removedPlayers.length} REMOVED, ${newlyAddedCount} NEW MATCHES LOGGED) ===
${diffLines}

=== RECENT PLAYED MATCHES (NEWEST FIRST) ===
${playedLines || 'None found'}

=== UPCOMING SCHEDULE FROM CURRENT IN-GAME DATE (${saveDateLabel}) ===
${upcomingLines || 'None found'}

=== ACTIVE INJURIES ===
${injuryLines}

=== ACTIVE SUSPENSIONS (DO NOT SELECT BANNED STARTERS) ===
${suspensionLines}

=== LIVE MENTORING GROUPS IN SAVE ===
${mentoringLines}
${fullTableLines}
=== SQUAD DATA — SEE THE CANONICAL SQUAD PROFILES BLOCK ===
Per-player squad detail is NOT repeated here. It is carried once, by the live app context block
"SQUAD PROFILES & SEASON STATS (X OF N FULL POOL)" — the same pool the Squad tab renders, with star
ratings, contract/wage, Best Fit %, season stats, attributes, badges, traits, Last-5 form, suspensions
and injuries. Always quote squad counts from that block (Full Pool + First Team), never from an
earlier import summary.

${contractClauseBlock}${targetsSummary}${mergedWarnings.length > 0 ? `\n=== READER NOTES (NON-FATAL) ===\n${mergedWarnings.map((w) => `- ${w}`).join('\n')}\n` : ''}
ANALYST MISSION FOR THIS .FM SAVE DROP:
1. Acknowledge the exact in-game date (${saveDateLabel}), league position, recent results (never fabricate match-level xG or possession if not present in the save — cite the exact player season xG/xA and fixture scorelines), financial runway, and finances directly from the .fm file.
2. Audit player performance, attribute changes, Last-5 form trends, Scout Report Badges, traits, fatigue/minutes load, contract clauses/extensions, injuries, and active suspensions. NEVER select a BANNED player as a starter, and NEVER cite raw hidden CA/PA or raw hidden attribute numbers.
3. Produce a **COMPLETE ACTION PLAN FROM ${saveDateLabel} FORWARD**:
   - Exact Starting XI + Bench + 62m/75m substitution plan for the very next fixture (${nextFixtureLabel || 'next scheduled match'}), obeying Playbook v2.0 & Club Rules #1–#6 (Tracking Wingers OOP, 3-man midfield late, never pull both CBs, <=125m Double-GW cap).
   - Multi-match rotation & training schedule plan across the upcoming fixtures listed above.
   - Wage/contract/recruitment/mentoring actions to click before hitting Continue.
4. Populate the structured JSON fields (docEventBulletBlock, sheetRowValues, inGameDate="${saveDateLabel}") so ${decoded.meta.managerName || 'the manager'} can push this full save checkpoint straight to their Google Sheet & Google Doc in one click.`;

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
    decodedPayload: decoded,
  };
}
