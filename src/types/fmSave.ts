export interface PlayerAttributes {
  // Technical (14)
  corners: number;
  crossing: number;
  dribbling: number;
  finishing: number;
  firstTouch: number;
  freeKicks: number;
  heading: number;
  longShots: number;
  longThrows: number;
  marking: number;
  passing: number;
  penalties: number;
  tackling: number;
  technique: number;
  // Mental (14)
  aggression: number;
  anticipation: number;
  bravery: number;
  composure: number;
  concentration: number;
  decisions: number;
  determination: number;
  flair: number;
  leadership: number;
  offTheBall: number;
  positioning: number;
  teamwork: number;
  vision: number;
  workRate: number;
  // Physical (8)
  acceleration: number;
  agility: number;
  balance: number;
  jumpingReach: number;
  naturalFitness: number;
  pace: number;
  stamina: number;
  strength: number;
  // Goalkeeping (11)
  aerialReach: number;
  commandOfArea: number;
  communication: number;
  eccentricity: number;
  handling: number;
  kicking: number;
  oneOnOnes: number;
  punching: number;
  reflexes: number;
  rushingOut: number;
  throwing: number;
  // Additional goalkeeper/outfield overlapping aliases (optional)
  firstTouchGk?: number;
  passingGk?: number;
  throwingDistance?: number;
  freeKickTaking?: number;
  penaltyTaking?: number;
}

export type ScoutBadge =
  | 'Consistent Performer'
  | 'Big-Game Player'
  | 'Injury-Prone'
  | 'Versatile';

export interface InternalReliabilityFlags {
  consistency: number;
  importantMatches: number;
  injuryProneness: number;
  versatility: number;
}

export interface ContractReleaseClause {
  type: string;
  amount: number;
}

export interface ContractBonuses {
  appearanceFee?: number | null;
  goalBonus?: number | null;
  cleanSheetBonus?: number | null;
  unusedSubFee?: number | null;
}

export interface ContractDetails {
  promisedPlayingTime: string;
  releaseClauses: ContractReleaseClause[];
  optionalExtensionYears: number;
  bonuses: ContractBonuses;
  loanWageContributionPct: number | null;
}

export interface ActiveSuspensionRecord {
  playerUid: number;
  playerName?: string | null;
  matchesRemaining: number;
  competitionName: string;
  scope: 'league' | 'cup' | 'continental' | 'all';
  reason: string;
}

export interface LeagueTableRow {
  position: number;
  clubUid: number | null;
  clubName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string[];
}

export interface DivisionPositionBenchmark {
  sampleSize: number;
  medianWeeklyWage: number;
  medianAttributes: Record<string, number>;
}

export interface DivisionBenchmarks {
  competitionName: string;
  scope: string;
  clubCount: number;
  byPositionGroup: Record<'GK' | 'DEF' | 'MID' | 'FWD', DivisionPositionBenchmark>;
}

export interface TacticSlotAssignment {
  slotIndex: number;
  position: string;
  outOfPossessionPosition?: string | null;
  outOfPossessionPositionIndex?: number | null;
  inPossessionRole?: string | null;
  outOfPossessionRole?: string | null;
  ipRole?: string | null;
  oopRole?: string | null;
  playerUid?: number | null;
  playerName?: string | null;
  settingCountIp?: number;
  settingCountOop?: number;
}

export interface SquadPlannerSlot {
  seasonOffset: number;
  slot: number;
  playerUids: number[];
  playerNames: string[];
}

export interface DeepTacticRecord {
  index: number;
  name: string;
  styleName: string;
  mentality: string;
  inPossessionFormation?: string | null;
  outOfPossessionFormation?: string | null;
  slots?: TacticSlotAssignment[];
}

export interface CompetitionRegistrationRules {
  competitionName?: string | null;
  maxSquadSize: number | null;
  minHomegrownClub: number | null;
  minHomegrownNation: number | null;
  maxForeignPlayers: number | null;
  u21Exempt: boolean | null;
  matchdaySubsLimit: number | null;
  fixturesPerClub?: number | null;
  promotionPlaces?: number | null;
  playoffPlaces?: number | null;
  relegationPlaces?: number | null;
}

export interface HydratedSquadPlayer {
  uid: number;
  name: string;
  age: number;
  nationality: string;
  primaryPosition: string;
  secondaryPositions: string[];
  attributes: PlayerAttributes;
  traits: string[];
  scoutBadges: ScoutBadge[];
  wageEur: number;
  contractExpiryMonths: number;
  abilityStars?: number;
  potentialStars?: number;
  contractDetails?: ContractDetails;
  activeSuspensions?: ActiveSuspensionRecord[];
}

export interface PlayerMatchRating {
  date: string;
  rating: number;
  goals: number;
  assists: number;
  opponent?: string;
  minutes?: number;
}

export interface FormTrend {
  recentRatings: number[];
  averageRating: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface TeamMatchStat {
  matchId: string;
  date?: string;
  opponent: string;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  xgFor: number | null;
  xgAgainst: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  possession: number | null;
  passCompletion?: number | null;
}

export interface SeasonHistoryEntry {
  season: string;
  club: string;
  apps: number;
  goals: number;
  assists: number;
  avgRating: number;
}

export interface StaffMember {
  uid: number;
  name: string;
  role: string;
  coachingDefending: number;
  coachingAttacking: number;
  coachingTactical: number;
  judgingAbility: number;
  judgingPotential: number;
}

export interface MonthlyFinance {
  month: string;
  balance: number;
  wageSpend: number;
  netCashflow: number;
}

export interface FinancialRunway {
  currentBalance: number;
  monthlyBurnRate: number;
  runwayMonths: number;
  status: 'Critical' | 'Warning' | 'Healthy';
}

export interface RecruitmentTarget {
  uid: number;
  name: string;
  age: number;
  nationality: string;
  primaryPosition: string;
  currentClub?: string;
  isFreeAgent: boolean;
  contractExpiryMonths: number;
  expires?: string;
  demandedWageEur: number;
  scoutBadges?: ScoutBadge[];
  traits?: string[];
  attributes: Partial<PlayerAttributes> & {
    keyPace?: number;
    keyVision?: number;
    keyDecision?: number;
    keyStamina?: number;
  };
}

export interface ClubFacilitiesSummary {
  training?: string | number | null;
  youth?: string | number | null;
  youthRecruitment?: string | number | null;
  juniorCoaching?: string | number | null;
  corporate?: string | number | null;
  stadiumCapacity?: number | null;
  [key: string]: unknown;
}

export interface SponsorshipDeal {
  name?: string;
  type?: string;
  annualValue?: number | null;
  expires?: string | null;
  [key: string]: unknown;
}

export interface TransferWindowInfo {
  isOpen?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  windows?: Array<{
    name?: string;
    startDate?: string | null;
    endDate?: string | null;
    isOpen?: boolean;
  }>;
  [key: string]: unknown;
}

export interface JobVacancyEntry {
  club?: string;
  role?: string;
  league?: string;
  reputation?: string | number | null;
  [key: string]: unknown;
}

export interface FmExtractionManifest {
  seniorSquad: number;
  youthReserves: number;
  totalPlayers: number;
  shortlistScouted: number;
  staff: number;
  playedMatches: number;
  upcomingFixtures: number;
  activeInjuries: number;
  activeSuspensions: number;
  playerMatchStats: number;
  playerSeasonHistory: number;
  teamMatchStats: number;
  tactics: number;
  hasFinances: boolean;
  hasLeagueStanding: boolean;
  warningsCount: number;
  fastSync: boolean;
}

export interface Pass0ExtractionPayload {
  clubUid: number;
  squad: HydratedSquadPlayer[];
  playerMatchStats: Record<number, PlayerMatchRating[]>;
  teamMatchStats: TeamMatchStat[];
  playerSeasonHistory: Record<number, SeasonHistoryEntry[]>;
  staff: StaffMember[];
  monthlyFinances: MonthlyFinance[];
  facilities: ClubFacilitiesSummary;
  sponsorships: SponsorshipDeal[];
  transferWindows: TransferWindowInfo;
  competitionRules: CompetitionRegistrationRules | Record<string, unknown>;
  activeSuspensions?: ActiveSuspensionRecord[];
  leagueTableRows?: LeagueTableRow[];
  divisionBenchmarks?: DivisionBenchmarks | null;
  tactics?: DeepTacticRecord[];
  selections: Record<string, unknown>;
  setPieces: Record<string, unknown>;
  training: Record<string, unknown>;
  squadPlanner?: SquadPlannerSlot[];
  jobVacancies: JobVacancyEntry[];
  recruitmentTargets: RecruitmentTarget[];
  extractionManifest?: FmExtractionManifest;
  extractionWarnings?: string[];
  fastSync?: boolean;
  stepTimingsMs?: Record<string, number>;
}

export type FmImportScope =
  | 'club_only'
  | 'managed_club_only'
  | 'club_and_division'
  | 'full_division'
  | 'full_database'
  | 'my_club'
  | 'full_league'
  | 'full_save';

export function clampAttributeValue(val: number): number {
  if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
    return 1;
  }
  return Math.max(1, Math.min(20, Math.round(val)));
}

export function clampConditionSharpness(val: number): number {
  if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(val)));
}

export interface StructuredTabExportRow {
  uid: number;
  name: string;
  age: number;
  pace: number;
  stamina: number;
  condition: number;
  matchSharpness: number;
}

export function parseFmStructuredTabExport(
  rawCsvText: string,
  scope: FmImportScope = 'club_only'
): StructuredTabExportRow[] {
  const lines = rawCsvText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const parsedRows = lines.map((line) => {
    const tokens = line.split('\t').map((t) => t.trim());
    return {
      uid: parseInt(tokens[0], 10) || 0,
      name: tokens[1] || 'Unknown Player',
      age: parseInt(tokens[2], 10) || 18,
      pace: clampAttributeValue(parseInt(tokens[3], 10)),
      stamina: clampAttributeValue(parseInt(tokens[4], 10)),
      condition: clampConditionSharpness(parseInt(tokens[5], 10)),
      matchSharpness: clampConditionSharpness(parseInt(tokens[6], 10)),
    };
  });

  if (scope === 'club_only' || scope === 'managed_club_only' || scope === 'my_club') {
    return parsedRows.slice(0, 30);
  }
  if (scope === 'club_and_division' || scope === 'full_division' || scope === 'full_league') {
    return parsedRows.slice(0, 300);
  }
  return parsedRows;
}
