export type WorkspaceTabId =
  | 'overview'
  | 'players'
  | 'tactics'
  | 'matches'
  | 'staff'
  | 'clubs'
  | 'competitions'
  | 'fixtures'
  | 'recruitment'
  | 'playbook'
  | 'sync'
  | 'ai';

export type PositionCode =
  | 'GK'
  | 'DL'
  | 'DC'
  | 'DR'
  | 'WBL'
  | 'DM'
  | 'WBR'
  | 'ML'
  | 'MC'
  | 'MR'
  | 'AML'
  | 'AMC'
  | 'AMR'
  | 'ST';

export interface PlayerAttributes {
  // Technical (10)
  crossing: number | null;
  dribbling: number | null;
  finishing: number | null;
  first_touch: number | null;
  heading: number | null;
  long_shots: number | null;
  marking: number | null;
  passing: number | null;
  tackling: number | null;
  technique: number | null;
  // Set Pieces (4)
  corners: number | null;
  free_kicks: number | null;
  long_throws: number | null;
  penalties: number | null;
  // Mental (14)
  aggression: number | null;
  anticipation: number | null;
  bravery: number | null;
  composure: number | null;
  concentration: number | null;
  decisions: number | null;
  determination: number | null;
  flair: number | null;
  leadership: number | null;
  off_the_ball: number | null;
  positioning: number | null;
  teamwork: number | null;
  vision: number | null;
  work_rate: number | null;
  // Physical (8)
  acceleration: number | null;
  agility: number | null;
  balance: number | null;
  jumping_reach: number | null;
  natural_fitness: number | null;
  pace: number | null;
  stamina: number | null;
  strength: number | null;
  // Goalkeeping (11)
  aerial_ability: number | null;
  command_of_area: number | null;
  communication: number | null;
  eccentricity: number | null;
  handling: number | null;
  kicking: number | null;
  one_on_ones: number | null;
  reflexes: number | null;
  rushing_out: number | null;
  tendency_to_punch: number | null;
  throwing: number | null;
  // Hidden (12) -> total 59 attributes
  adaptability: number | null;
  ambition: number | null;
  consistency: number | null;
  controversy: number | null;
  dirtiness: number | null;
  important_matches: number | null;
  injury_proneness: number | null;
  loyalty: number | null;
  pressure: number | null;
  professionalism: number | null;
  sportsmanship: number | null;
  temperament: number | null;
  versatility: number | null;
}

export interface PlayerClause {
  kind: string;
  value: number | null;
}

export interface PlayerContract {
  club: string;
  type: 'Full-Time' | 'Loan' | 'Youth' | 'Future';
  weeklyWage: number | null;
  startDate: string | null;
  endDate: string | null;
  squadStatus: string | null;
  releaseClause?: number | null;
  appearanceFee?: number | null;
  goalBonus?: number | null;
}

export interface PlayerSeasonStats {
  apps: string | null;
  minutes: number | null;
  rating: number | null;
  goals: number | null;
  xG: number | null;
  xGPer90: number | null;
  assists: number | null;
  xA: number | null;
  xAPer90: number | null;
  drbPer90: number | null;
  prPassesPer90: number | null;
  hdrPct: number | null;
  intPer90: number | null;
  tckPct: number | null;
  distanceKm: number | null;
  yellowCards: number | null;
  redCards: number | null;
}

export interface PlayerRecord {
  id: number;
  uniqueId?: number;
  name: string;
  age: number | null;
  dateOfBirth: string | null;
  gender: 'Male' | 'Female';
  heightCm: number | null;
  weightKg: number | null;
  preferredFoot: 'Right Only' | 'Right' | 'Left Only' | 'Left' | 'Either' | null;
  nationality: string | null;
  playingNation: string | null;
  playingCompetition: string | null;
  club: string;
  playingClub: string;
  positionText: string;
  positions: Record<PositionCode, number>; // 1..20 familiarity
  ca: number | null;
  pa: number | null;
  condition: number | null;
  sharpness: number | null;
  wagePw: number | null;
  askingPrice: number | null;
  estimatedValue: number | null;
  expires: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  squadStatus: string | null;
  clauses: PlayerClause[];
  contracts: PlayerContract[];
  onLoan: boolean;
  teamSlot: number | null;
  transferListed: boolean;
  listedForLoan: boolean;
  transferAgreed: boolean;
  futureTransferClub: string | null;
  futureTransferDate: string | null;
  futureContractEndDate: string | null;
  injured: boolean;
  injury: string | null;
  injuryLightTrainingDays: number | null;
  injuryFullTrainingDays: number | null;
  injuryExpectedReturn: string | null;
  suspensionsCount: number;
  onDuty: boolean;
  dutyReason: string | null;
  currentReputation: number | null;
  homeReputation: number | null;
  worldReputation: number | null;
  personality: string | null;
  hiddenPersonality?: {
    professionalism: number | null;
    ambition: number | null;
    pressure: number | null;
    temperament: number | null;
    loyalty: number | null;
  } | null;
  notes?: string | null;
  attributes: PlayerAttributes;
  seasonStats?: PlayerSeasonStats;
}

export interface StaffAttributes {
  // Coaching
  attacking: number | null;
  defending: number | null;
  fitness: number | null;
  goalkeeping: number | null;
  mental: number | null;
  possession: number | null;
  set_pieces: number | null;
  tactical: number | null;
  technical: number | null;
  working_with_youngsters: number | null;
  // Mental / Scouting / Medical
  adaptability: number | null;
  authority: number | null;
  determination: number | null;
  judging_player_ability: number | null;
  judging_player_potential: number | null;
  judging_staff_ability: number | null;
  man_management: number | null;
  motivating: number | null;
  negotiating: number | null;
  physiotherapy: number | null;
  sports_science: number | null;
  tactical_knowledge: number | null;
  analysing_data: number | null;
}

export interface StaffRecord {
  id: number;
  name: string;
  job: string;
  club: string;
  division: string;
  nationality: string | null;
  age: number | null;
  ca: number | null;
  pa: number | null;
  salaryWeekly: number | null;
  contractEndDate: string | null;
  worldReputation: number | null;
  preferredFormation: string | null;
  tacticalStyle: string | null;
  attributes: StaffAttributes;
}

export interface ClubLoan {
  type: string;
  originalAmount: number;
  repaymentsStart: string;
  until: string;
  payablePerMonth: number;
  interestComponent: number;
  remainingPrincipal: number;
  remainingInterest: number;
}

export interface ClubLedgerLine {
  category: string;
  thisMonth: number | null;
  lastMonth: number | null;
  thisSeason: number | null;
  lastSeason: number | null;
}

export interface ClubUefaSeasonPoints {
  season: string;
  points: number;
}

export interface ClubCoefficients {
  fiveYearCoefficient: number | null;
  fiveYearRank: number | null;
  tenYearCoefficient: number | null;
  tenYearRank: number | null;
  currentSeasonPoints: number | null;
  seasonBreakdown: ClubUefaSeasonPoints[];
}

export interface ClubRecord {
  id: number;
  uniqueId: number;
  name: string;
  competition: string | null;
  nation: string | null;
  reputation: number | null;
  trainingFacilities: number | null;
  youthFacilities: number | null;
  youthCoaching: number | null;
  youthRecruitment: number | null;
  corporateFacilities: number | null;
  balance: number | null;
  transferBudget: number | null;
  payrollBudgetWeekly: number | null;
  currentWagesWeekly: number | null;
  financialDate: string | null;
  loans: ClubLoan[];
  income: ClubLedgerLine[];
  expenditure: ClubLedgerLine[];
  coefficients: ClubCoefficients | null;
}

export interface CompetitionRecord {
  id: number;
  name: string;
  nation: string | null;
  reputation: number | null;
  gender: 'Male' | 'Female';
  tier: number | null;
  teamsCount: number | null;
}

export interface FixtureRecord {
  id: number;
  kickoffDate: string;
  kickoffTime: string | null;
  opponent: string;
  home: boolean;
  competition: string;
  venue: string | null;
  homeClub: string;
  awayClub: string;
  status: 'Upcoming' | 'Played';
  score?: string;
}

export interface MatchLogEntry {
  id: string;
  eventNumber: number;
  date: string;
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
  distanceKm?: number | null;
  goalTimeline: string | null;
  potm: string | null;
  defensiveWatchpoints: string | null;
  tacticalAudit: string | null;
  source: 'FM_SAVE' | 'EXPORT' | 'AI_CHAT';
}

export interface DoubleGwTrackerRow {
  playerId: number | null;
  player: string;
  stamina: number | null;
  match1Label?: string;
  match1Minutes: number;
  match2Label?: string;
  match2Minutes: number;
  rolePlanMatch1?: string;
  rolePlanMatch2?: string;
}

export type InterestStatus =
  | 'Extremely Interested'
  | 'Very Interested'
  | 'Interested'
  | 'Unsure'
  | 'Dubious'
  | 'No Interest';

export type DealStage =
  | 'Scouted'
  | 'Shortlisted'
  | 'Agent Enquiry'
  | 'Bid Submitted'
  | 'Contract Talks'
  | 'Agreed'
  | 'Rejected';

export interface RecruitmentCase {
  id: string;
  playerId: number | null;
  playerName: string;
  club: string;
  interestStatus: InterestStatus;
  dealStage: DealStage;
  source: string;
  observedGameDate: string;
  validUntilGameDate: string;
  notes: string;
}

export interface TacticSlot {
  slotIndex: number;
  position: PositionCode;
  inPossessionRole: string;
  outOfPossessionRole: string;
}

export interface TacticDefinition {
  id: string;
  fileName: string;
  name: string;
  formation: string;
  mentality: string;
  tacticalStyle: string;
  inPossessionInstructions: string[];
  inTransitionInstructions: string[];
  outOfPossessionInstructions: string[];
  lastModified: string | null;
  slots: TacticSlot[];
}

export interface ShortlistRecord {
  id: string;
  name: string;
  createdBy: 'AI assistant' | 'Manager';
  createdAt: string | null;
  notes: string;
  playerIds: number[];
}

export interface PlayerFilterCriteria {
  nameContains: string;
  gender: 'Any' | 'Male' | 'Female';
  playingNation: string;
  playingCompetition: string;
  ageMin: number | null;
  ageMax: number | null;
  heightMin: number | null;
  heightMax: number | null;
  club: string;
  weeklySalaryMax: number | null;
  askingPriceMin: number | null;
  askingPriceMax: number | null;
  contractEndFrom: string;
  contractEndTo: string;
  caMin: number | null;
  paMin: number | null;
  transferListedOnly: boolean;
  loanListedOnly: boolean;
  positions: Partial<Record<PositionCode, number>>;
  attributes: Partial<Record<keyof PlayerAttributes, number>>;
}

export interface StaffFilterCriteria {
  nameContains: string;
  job: string;
  club: string;
  nationality: string;
  bestRole: string;
  minStars: number | null;
  caMin: number | null;
}

export interface ClubFilterCriteria {
  nameContains: string;
  nation: string;
  competition: string;
  reputationMin: number | null;
  balanceMin: number | null;
}

export interface CompetitionFilterCriteria {
  nameContains: string;
  nation: string;
  gender: 'Any' | 'Male' | 'Female';
  reputationMin: number | null;
}

export type FilterCriteria =
  | PlayerFilterCriteria
  | StaffFilterCriteria
  | ClubFilterCriteria
  | CompetitionFilterCriteria;

export interface SavedFilterSet {
  id: string;
  name: string;
  criteria: PlayerFilterCriteria;
}

export interface AppSettings {
  currency: 'GBP' | 'EUR' | 'USD';
  wagePeriod: 'weekly' | 'monthly' | 'annual';
}

export interface AiContextState {
  managedClubName: string | null;
  includeManagedClub: boolean;
  activeTacticId: string | null;
  includeTactic: boolean;
  tactics: TacticDefinition[];
}

export interface ActiveInjuryRecord {
  playerUid: number | null;
  playerName: string | null;
  typeName: string;
  date: string | null;
  severity: string | null;
  cause: string | null;
  kind: string;
}

export interface MentoringGroupRecord {
  groupNumber: number;
  label: string;
  members: string[];
}

export interface ClubFinancesSummary {
  month: string | null;
  balance: number | null;
  wagePayrollWeekly: number | null;
  wageBudgetWeekly: number | null;
  transferBudgetRemaining: number | null;
}

export interface LeagueStandingSummary {
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
}

export interface SnapshotMetadata {
  status: 'awaiting_save' | 'loaded';
  game: string | null;
  build: string | null;
  knownBuild: boolean | null;
  saveName: string | null;
  gameDate: string | null;
  gameDateDmy: string | null;
  loadedAt: string | null;
  sourceLabel: string;
  freshness: 'awaiting' | 'current' | 'stale' | 'refreshing';
  managedClubName: string | null;
  managedClubUid: number | null;
  managerName: string | null;
  fmsaveVersion: string | null;
  totalPlayersInWorld: number;
  totalStaffInWorld: number;
  totalClubsInWorld: number;
  totalCompetitionsInWorld: number;
  warnings: string[];
}

export interface WorkspaceSnapshot {
  metadata: SnapshotMetadata;
  players: PlayerRecord[];
  staff: StaffRecord[];
  clubs: ClubRecord[];
  competitions: CompetitionRecord[];
  fixtures: FixtureRecord[];
  matchLogs: MatchLogEntry[];
  tactics: TacticDefinition[];
  activeInjuries: ActiveInjuryRecord[];
  mentoring: MentoringGroupRecord[];
  finances: ClubFinancesSummary | null;
  leagueStanding: LeagueStandingSummary | null;
}

export interface SyncTurnOutput {
  screenDetected: string;
  inGameDate: string;
  analysisMarkdown: string;
  immediateClicks: string[];
  targetSheetTable:
    | 'TABLE_1G_MATCH_LOG'
    | 'TABLE_1H_SCOUTING'
    | 'TABLE_1I_TACTICAL_AUDIT'
    | 'GENERAL_CHRONICLE';
  chronicleTitle: string;
  chronicleOutcomeMetric: string;
  docEventBulletBlock: string;
  sheetRowValues: string[];
  isMatchResult: boolean;
  matchFields?: {
    competition?: string;
    opponent?: string;
    venue?: string;
    result?: string;
    score?: string;
    xGFor?: number | null;
    xGAgainst?: number | null;
    possession?: number | null;
    passCompletion?: number | null;
    shotsFor?: string | null;
    shotsAgainst?: string | null;
    cccFor?: number | null;
    cccAgainst?: number | null;
    goalTimeline?: string | null;
    potm?: string | null;
    defensiveWatchpoints?: string | null;
    tacticalAudit?: string | null;
  };
  playerUpdates?: Array<{
    name: string;
    rating?: number | null;
    goalsAdded?: number;
    assistsAdded?: number;
    minutesAdded?: number;
    notes: string;
  }>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  commandUsed?: string;
  toolsUsed?: string[];
  createdShortlistId?: string;
  syncOutput?: SyncTurnOutput | null;
}

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
}
