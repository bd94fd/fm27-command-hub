export interface PlayerRecord {
  id: string;
  number: number;
  name: string;
  position: string;
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
  ability: number;
  potential: number;
  expires: string;
  nation: string;
  wagePw: number;
  status: 'Starter' | 'Rotation' | 'Injured' | 'Surplus' | 'Youth';
  attributes: {
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
  };
  ipRole: string;
  oopRole: string;
  notes: string;
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
