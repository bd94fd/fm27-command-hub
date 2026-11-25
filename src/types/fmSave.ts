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

export interface TacticInstructionSetting {
  key: string;
  label: string;
  value: string;
  phase?: 'in_possession' | 'in_transition' | 'out_of_possession' | 'general';
}

export interface TacticTeamInstructions {
  inPossession: string[];
  inTransition: string[];
  outOfPossession: string[];
  mentality?: string | null;
  styleName?: string | null;
  passingDirectness?: string | null;
  tempo?: string | null;
  width?: string | null;
  defensiveLine?: string | null;
  lineOfEngagement?: string | null;
  pressingIntensity?: string | null;
  rawSettings?: TacticInstructionSetting[];
  rawTeamInstructionBytes?: number[];
  styleCode?: number | null;
}

export interface RawTacticSettingUnit {
  index: number;
  headHex: string;
  firstBits: number;
  secondLow: number;
  secondMid: number;
  secondHigh: number;
  signature: string;
}

export interface TacticSlotAssignment {
  slotIndex: number;
  position: string;
  outOfPossessionPosition?: string | null;
  outOfPossessionPositionIndex?: number | null;
  inPossessionRole?: string | null;
  outOfPossessionRole?: string | null;
  /** fmsave 0.14.4+'s own label for this slot, kept for visibility only. */
  upstreamInPossessionRole?: string | null;
  upstreamOutOfPossessionRole?: string | null;
  /** Which side produced inPossessionRole / outOfPossessionRole. */
  roleLabelSource?: 'native' | 'upstream' | 'none';
  ipRole?: string | null;
  oopRole?: string | null;
  ipRoleSource?:
    | 'dictionary_decoded'
    | 'save_decoded'
    | 'confirmed'
    | 'fingerprint_matched'
    | 'inferred';
  oopRoleSource?:
    | 'dictionary_decoded'
    | 'save_decoded'
    | 'confirmed'
    | 'fingerprint_matched'
    | 'inferred';
  ipRoleConfidence?: number;
  oopRoleConfidence?: number;
  ipRoleReasoning?: string | null;
  oopRoleReasoning?: string | null;
  ipRoleCandidates?: Array<{ name: string; score: number; fitPct: number }>;
  oopRoleCandidates?: Array<{ name: string; score: number; fitPct: number }>;
  ipRoleBits?: string | null;
  oopRoleBits?: string | null;
  ipTrailBits?: string | null;
  oopTrailBits?: string | null;
  ipRoleCoreSignature?: string | null;
  oopRoleCoreSignature?: string | null;
  ipBinaryFingerprint?: string | null;
  oopBinaryFingerprint?: string | null;
  ipSettingUnits?: RawTacticSettingUnit[];
  oopSettingUnits?: RawTacticSettingUnit[];
  playerUid?: number | null;
  playerName?: string | null;
  settingCountIp?: number;
  settingCountOop?: number;
  inPossessionInstructions?: string[];
  outOfPossessionInstructions?: string[];
  rawIpSettings?: TacticInstructionSetting[];
  rawOopSettings?: TacticInstructionSetting[];
  lastMatchRating?: number | null;
  lastMatchMinutes?: number | null;
  lastMatchGoals?: number;
  lastMatchAssists?: number;
}

export interface BinarySectionInventoryItem {
  name: string;
  schema: number | null;
  sizeBytes?: number | null;
}

export interface BinaryGovernanceProbeWindow {
  id: string;
  section: string;
  anchorLabel: string;
  anchorOffset: number;
  windowStart: number;
  bytesHex: string;
  u8Values: number[];
  u16Values?: number[];
  u32Values?: number[];
  candidateDates?: Array<{ relOffset: number; dmy: string }>;
  candidateUidHits?: Array<{ relOffset: number; uid: number; label: string }>;
}

export interface BinaryPromiseCandidate {
  id: string;
  section: string;
  anchorOffset: number;
  playerUid?: number | null;
  playerName?: string | null;
  dueDateDmy?: string | null;
  typeCode?: number | null;
  statusCode?: number | null;
  rawHex: string;
}

export interface BinaryManagerContractProbe {
  source: string;
  wagePw?: number | null;
  expiresDmy?: string | null;
  contractExpiryMonths?: number | null;
  staffUid?: number | null;
  confidence: 'high' | 'medium' | 'probe';
}

export type PatchCompatibilitySectionStatus =
  | 'clean'
  | 'patched'
  | 'fallback'
  | 'unavailable';

export interface PatchCompatibilitySection {
  id: string;
  label: string;
  status: PatchCompatibilitySectionStatus;
  fallbacks?: number;
  detail?: string | null;
}

export type PatchLayoutStatus = 'known' | 'dynamic' | 'unknown' | 'not-fm27';

export interface PatchCompatibilitySummary {
  detectedBuild: string;
  isFm27: boolean;
  layoutStatus: PatchLayoutStatus;
  layoutBase: string | null;
  isUntestedBuild: boolean;
  runtimePatchesApplied: boolean;
  dynamicBuildRegistered: boolean;
  sections: PatchCompatibilitySection[];
  summary: string;
  advisory?: string | null;
  generatedAtIso?: string | null;
}

export interface BinaryForensicsSnapshot {
  fmBuild: string;
  fmsaveVersion?: string;
  sections: BinarySectionInventoryItem[];
  governanceProbes: BinaryGovernanceProbeWindow[];
  promiseCandidates: BinaryPromiseCandidate[];
  managerContractProbes: BinaryManagerContractProbe[];
  scanMs?: number;
}

export interface SquadPlannerSlot {
  seasonOffset: number;
  slot: number;
  positionCode?: string | null;
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
  isActive?: boolean;
  teamInstructions?: TacticTeamInstructions | null;
  slots?: TacticSlotAssignment[];
}

export interface LastMatchTacticSubstitute {
  slot: number;
  playerUid: number | null;
  playerName: string;
  position?: string;
  lastMatchRating?: number | null;
  lastMatchMinutes?: number | null;
}

export interface LastMatchTacticBlueprint {
  source: 'last_match_reconstructed' | 'active_save_tactic';
  matchDate?: string | null;
  opponent?: string | null;
  competition?: string | null;
  venue?: 'H' | 'A' | null;
  score?: string | null;
  result?: 'W' | 'D' | 'L' | null;
  xGFor?: number | null;
  xGAgainst?: number | null;
  possession?: number | null;
  tacticName: string;
  styleName: string;
  mentality: string;
  inPossessionFormation: string;
  outOfPossessionFormation: string;
  teamInstructions: TacticTeamInstructions;
  starters: TacticSlotAssignment[];
  substitutes: LastMatchTacticSubstitute[];
  hasDecodedInstructions: boolean;
  tacticalEffectivenessScore: number;
  tacticalEffectivenessNotes: string[];
}

export interface ManagerContractInfo {
  available: boolean;
  managerName: string;
  staffUid?: number | null;
  wagePw?: number | null;
  expires?: string | null;
  contractExpiryMonths?: number | null;
  age?: number | null;
  nation?: string | null;
  jobSecurity?: string | null;
}

export interface GovernanceConfidenceGrade {
  available: boolean;
  grade?: string | null;
  score?: number | null;
  summary?: string | null;
  sourceNote?: string | null;
}

export interface BoardObjectiveRecord {
  id: string;
  category: 'competition' | 'club_vision' | 'finance' | 'recruitment' | 'playing_style';
  title: string;
  target: string;
  importance?: string | null;
  status?: 'on_track' | 'at_risk' | 'behind' | 'achieved' | 'info';
  source: 'save_binary' | 'league_rule_context';
}

export interface ClubPromiseRecord {
  id: string;
  subject: string;
  targetName?: string | null;
  summary: string;
  dueDate?: string | null;
  status: 'met' | 'on_track' | 'at_risk' | 'breached' | 'active';
  source: 'save_binary' | 'contract_playing_time';
}

export interface PlayerPromiseAudit {
  playerUid?: number;
  playerId: string;
  playerName: string;
  position: string;
  promisedPlayingTime: string;
  expectedMinMinutesSharePct: number;
  actualMinutesSharePct: number;
  minutesPlayed: number;
  status: 'met' | 'on_track' | 'at_risk' | 'breached' | 'preseason';
  note: string;
}

export interface ClubGovernanceState {
  managerContract: ManagerContractInfo;
  boardConfidence: GovernanceConfidenceGrade;
  supporterConfidence: GovernanceConfidenceGrade;
  boardObjectives: BoardObjectiveRecord[];
  clubPromises: ClubPromiseRecord[];
  playerPromiseAudits: PlayerPromiseAudit[];
  promisesAtRiskCount: number;
  binaryProbedFields: string[];
  unavailableNotes: string[];
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
  prizeMoney?: number | null;
  rounds?: number | null;
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
  secondaryPositions?: string[];
  positionRatings?: Record<string, number> | null;
  currentClub?: string;
  shortlistOrigin?: 'in_game_shortlist' | 'manual_tracked';
  shortlistDate?: string | null;
  personality?: string | null;
  preferredFoot?: 'Left' | 'Right' | 'Either' | null;
  heightCm?: number | null;
  currentWagePw?: number | null;
  transferValue?: number | null;
  transferValueState?: 'ok' | 'capped' | 'unset' | 'zero';
  contractDetails?: ContractDetails | null;
  isFreeAgent: boolean;
  isLoanCandidate?: boolean;
  parentClubWagePw?: number | null;
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
  /** True when fmsave reversed the stored dates of an ended FM27 contract (start/end swapped). */
  dates_reordered?: boolean;
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
  tacticInstructionsCount?: number;
  squadPlannerSlots?: number;
  setPieceRoutines?: number;
  mentoringGroups?: number;
  sponsorships?: number;
  hasFinances: boolean;
  hasLeagueStanding: boolean;
  hasManagerContract?: boolean;
  hasBoardConfidence?: boolean;
  hasSupporterConfidence?: boolean;
  hasBoardObjectives?: boolean;
  promisesCount?: number;
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
  governance?: Partial<ClubGovernanceState> | null;
  binaryForensics?: BinaryForensicsSnapshot | null;
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
