import type { PlayerRecord } from '../types/fm27';

export const ANALYST_SQUAD_STATUSES = [
  'Starter',
  'Rotation',
  'Injured',
  'Surplus',
  'Youth',
] as const satisfies readonly PlayerRecord['status'][];

export interface AnalystPlayerUpdate {
  name: string;
  notes: string;
  ipRole?: string;
  oopRole?: string;
  status?: PlayerRecord['status'];
  condition?: number;
  rating?: number;
  goalsAdded?: number;
  assistsAdded?: number;
  minutesAdded?: number;
}

export interface AnalystMatchFields {
  opponent: string;
  score: string;
  competition: string | null;
  venue: 'H' | 'A';
  result: 'W' | 'D' | 'L';
  xGFor: number | null;
  xGAgainst: number | null;
  possession: number | null;
  passCompletion: number | null;
  shotsFor: string | null;
  shotsAgainst: string | null;
  cccFor: number | null;
  cccAgainst: number | null;
  goalTimeline: string | null;
  potm: string | null;
  defensiveWatchpoints: string | null;
  tacticalAudit: string | null;
}

export interface AnalystChatResponse {
  screenDetected: string;
  inGameDate: string;
  analysisMarkdown: string;
  immediateClicks: string[];
  followUpQuestions: string[];
  isMatchResult: boolean;
  chronicleTitle: string;
  chronicleOutcomeMetric: string;
  playerUpdates: AnalystPlayerUpdate[];
  matchFields: AnalystMatchFields | null;
  sourceCitations: string[];
  /** Repairs the parser had to make. Empty means the model answered in the documented shape. */
  issues: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

function parseStatus(value: unknown): PlayerRecord['status'] | undefined {
  const raw = text(value);
  return ANALYST_SQUAD_STATUSES.find((status) => status.toLowerCase() === raw.toLowerCase());
}

function parsePlayerUpdate(value: unknown): AnalystPlayerUpdate | null {
  if (!isRecord(value)) return null;
  const name = text(value.name);
  if (!name) return null;
  if (typeof value.notes !== 'string') return null;

  const update: AnalystPlayerUpdate = { name, notes: value.notes };
  const ipRole = text(value.ipRole);
  const oopRole = text(value.oopRole);
  const status = parseStatus(value.status);
  if (ipRole) update.ipRole = ipRole;
  if (oopRole) update.oopRole = oopRole;
  if (status) update.status = status;

  const condition = finite(value.condition);
  if (condition !== null) update.condition = Math.max(1, Math.min(100, Math.round(condition)));
  const rating = finite(value.rating);
  if (rating !== null) update.rating = rating;
  const goalsAdded = finite(value.goalsAdded);
  if (goalsAdded !== null) update.goalsAdded = Math.max(0, Math.round(goalsAdded));
  const assistsAdded = finite(value.assistsAdded);
  if (assistsAdded !== null) update.assistsAdded = Math.max(0, Math.round(assistsAdded));
  const minutesAdded = finite(value.minutesAdded);
  if (minutesAdded !== null) update.minutesAdded = Math.max(0, Math.round(minutesAdded));
  return update;
}

function parseMatchFields(value: unknown): AnalystMatchFields | null {
  if (!isRecord(value)) return null;
  const opponent = text(value.opponent);
  const score = text(value.score);
  if (!opponent || !score) return null;

  const venue = text(value.venue).toUpperCase();
  const result = text(value.result).toUpperCase();
  const optionalText = (input: unknown): string | null => text(input) || null;
  return {
    opponent,
    score,
    competition: optionalText(value.competition),
    venue: venue === 'H' ? 'H' : 'A',
    result: result === 'W' || result === 'L' ? result : 'D',
    xGFor: finite(value.xGFor),
    xGAgainst: finite(value.xGAgainst),
    possession: finite(value.possession),
    passCompletion: finite(value.passCompletion),
    shotsFor: optionalText(value.shotsFor),
    shotsAgainst: optionalText(value.shotsAgainst),
    cccFor: finite(value.cccFor),
    cccAgainst: finite(value.cccAgainst),
    goalTimeline: optionalText(value.goalTimeline),
    potm: optionalText(value.potm),
    defensiveWatchpoints: optionalText(value.defensiveWatchpoints),
    tacticalAudit: optionalText(value.tacticalAudit),
  };
}

/**
 * The Analyst answer is model output over the network, so nothing in it is trusted.
 * Every field is narrowed here and anything that does not match the documented
 * schema is dropped, with the repair noted in `issues`, so a drifting model can
 * never write a malformed player, match or note into the app.
 */
export function parseAnalystChatResponse(raw: unknown): AnalystChatResponse {
  const issues: string[] = [];
  if (!isRecord(raw)) {
    return {
      screenDetected: '',
      inGameDate: '',
      analysisMarkdown: '',
      immediateClicks: [],
      followUpQuestions: [],
      isMatchResult: false,
      chronicleTitle: '',
      chronicleOutcomeMetric: '',
      playerUpdates: [],
      matchFields: null,
      sourceCitations: [],
      issues: [raw === null ? 'response was null' : 'response was not an object'],
    };
  }

  const analysisMarkdown = typeof raw.analysisMarkdown === 'string' ? raw.analysisMarkdown : '';
  if (typeof raw.analysisMarkdown !== 'string') issues.push('analysisMarkdown was not a string');

  const rawUpdates = Array.isArray(raw.playerUpdates) ? raw.playerUpdates : [];
  if (raw.playerUpdates !== undefined && !Array.isArray(raw.playerUpdates)) {
    issues.push('playerUpdates was not an array');
  }
  const playerUpdates = rawUpdates
    .map(parsePlayerUpdate)
    .filter((update): update is AnalystPlayerUpdate => update !== null);
  const droppedUpdates = rawUpdates.length - playerUpdates.length;
  if (droppedUpdates > 0) {
    issues.push(`dropped ${droppedUpdates} player update${droppedUpdates === 1 ? '' : 's'}`);
  }

  const matchFields = parseMatchFields(raw.matchFields);
  if (raw.matchFields !== undefined && raw.matchFields !== null && !matchFields) {
    issues.push('matchFields lacked an opponent or a score');
  }
  const isMatchResult = raw.isMatchResult === true && matchFields !== null;
  if (raw.isMatchResult === true && !matchFields) {
    issues.push('isMatchResult was true but no usable matchFields arrived');
  }

  return {
    screenDetected: text(raw.screenDetected),
    inGameDate: text(raw.inGameDate),
    analysisMarkdown,
    immediateClicks: stringList(raw.immediateClicks),
    followUpQuestions: stringList(raw.followUpQuestions),
    isMatchResult,
    chronicleTitle: text(raw.chronicleTitle),
    chronicleOutcomeMetric: text(raw.chronicleOutcomeMetric),
    playerUpdates,
    matchFields,
    sourceCitations: stringList(raw.sourceCitations),
    issues,
  };
}
