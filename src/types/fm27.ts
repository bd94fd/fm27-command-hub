import {
  ActiveSuspensionRecord,
  ContractDetails,
  FormTrend,
  PlayerMatchRating,
  ScoutBadge,
  SeasonHistoryEntry,
} from './fmSave';

export interface PlayerRecord {
  id: string;
  uid?: number;
  number: number;
  name: string;
  position: string;
  secondaryPositions?: string[];
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
  personality: string;
  age: number;
  ability: number; // 1.0 - 5.0 stars relative to squad baseline (never raw CA)
  potential: number; // 1.0 - 5.0 stars relative to squad baseline (never raw PA)
  condition?: number | null;
  sharpness?: number | null;
  leftFoot?: number;
  rightFoot?: number;
  preferredFoot?: 'Left' | 'Right' | 'Either';
  heightCm?: number;
  expires: string;
  contractExpiryMonths?: number;
  contractDetails?: ContractDetails;
  activeSuspensions?: ActiveSuspensionRecord[];
  nation: string;
  wagePw: number;
  marketValue?: number | null;
  /** Provenance of `marketValue`: "capped" means the stored 300m ceiling, not a valuation. */
  marketValueState?: 'ok' | 'capped' | 'unset' | 'zero';
  marketValueCapped?: boolean;
  /** True when the save stores a potential range code instead of a fixed PA. */
  potentialUncertain?: boolean;
  morale?: string | null;
  status: 'Starter' | 'Rotation' | 'Injured' | 'Surplus' | 'Youth';
  teamSlot?: number;
  squadUnit?: 'First Team' | 'Reserves' | 'U21' | 'U18';
  onLoan?: boolean;
  positionRatings?: Record<string, number> | null;
  traits?: string[];
  scoutBadges?: ScoutBadge[];
  last5Form?: FormTrend;
  last5Ratings?: PlayerMatchRating[];
  statsSource?: 'Season Stats' | 'From Recent Matches';
  seasonHistory?: SeasonHistoryEntry[];
  attributes: {
    // Core required outfield attributes
    pace: number;
    acceleration: number;
    stamina: number;
    jumpingReach: number;
    determination: number;
    passing: number;
    finishing: number;
    tackling: number;
    firstTouch: number;
    decisions: number;
    workRate: number;
    offTheBall: number;
    // Technical (remaining of 14)
    heading?: number;
    corners?: number;
    crossing?: number;
    technique?: number;
    dribbling?: number;
    freeKicks?: number;
    longShots?: number;
    longThrows?: number;
    marking?: number;
    penalties?: number;
    // Mental (remaining of 14)
    aggression?: number;
    anticipation?: number;
    bravery?: number;
    composure?: number;
    concentration?: number;
    flair?: number;
    leadership?: number;
    positioning?: number;
    teamwork?: number;
    vision?: number;
    // Physical (remaining of 8)
    agility?: number;
    balance?: number;
    naturalFitness?: number;
    strength?: number;
    // Goalkeeping (11)
    aerialReach?: number;
    commandOfArea?: number;
    communication?: number;
    eccentricity?: number;
    handling?: number;
    kicking?: number;
    oneOnOnes?: number;
    punching?: number;
    reflexes?: number;
    rushingOut?: number;
    throwing?: number;
  };
  ipRole: string;
  oopRole: string;
  notes: string;
}

export interface StaffAttributes {
  attacking: number;
  defending: number;
  fitness: number;
  goalkeeping: number;
  mental: number;
  possession: number;
  set_pieces: number;
  tactical: number;
  technical: number;
  working_with_youngsters: number;
  adaptability: number;
  authority: number;
  determination: number;
  judging_player_ability: number;
  judging_player_potential: number;
  judging_staff_ability: number;
  man_management: number;
  motivating: number;
  negotiating: number;
  physiotherapy: number;
  sports_science: number;
  tactical_knowledge: number;
  analysing_data: number;
}

export interface StaffRecord {
  id: string;
  uid?: number;
  name: string;
  role: string;
  age: number;
  nation: string;
  club: string;
  wagePw: number;
  expires: string;
  attributes: StaffAttributes;
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
  playerId?: string;
  playerName: string;
  position: string;
  age: number | null;
  currentClub: string;
  targetIpRole: string;
  targetOopRole: string;
  interest: InterestStatus;
  stage: DealStage;
  estimatedFee: string;
  estimatedWagePw: number | null;
  expiresOn: string; // YYYY-MM-DD or DD/MM/YYYY
  notes: string;
  updatedAt: string;
}

export interface ShortlistRecord {
  id: string;
  name: string;
  description: string;
  playerIds: string[];
  createdAt: string;
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
  shotsFor: string;
  shotsAgainst: string;
  cccFor: number | null;
  cccAgainst: number | null;
  passCompletion: number | null;
  goalTimeline: string;
  potm: string;
  defensiveWatchpoints: string;
  tacticalAudit: string;
  source?: 'FM_SAVE' | 'BASELINE' | 'CHAT';
}

export interface DoubleGwTrackerRow {
  player: string;
  stamina: number;
  sat11SepTienen: number;
  wed15SepKnokke: number;
  sat18SepJongCercle: number;
  rolePlanKnokke: string;
  rolePlanJongCercle: string;
}

export interface TrainingSessionDay {
  week: string;
  date: string;
  fixtureContext: string;
  slot1: string;
  slot2: string;
  slot3: string;
  directive: string;
}

export interface SetPieceRoutine {
  id: string;
  name: string;
  delivery: string;
  leftTaker: string;
  rightTaker: string;
  assignments: {
    code: string;
    role: string;
    player: string;
    instruction: string;
  }[];
  auditNote: string;
}

export interface ChronicleEvent {
  eventNumber: number;
  date: string;
  phase: string;
  category: string;
  title: string;
  headlineMetric: string;
  notes: string;
}

export interface SyncBlockOutput {
  docPrompt: string;
  sheetPrompt: string;
  rawTsvRow1G: string;
  rawTsvRow10: string;
}
