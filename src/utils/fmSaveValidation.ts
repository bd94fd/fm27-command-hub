import type { DecodedFmSavePayload } from './fmSaveHydrator';

export type FmSaveValidationMode = 'full' | 'checkpoint';

export interface FmSaveValidationIssue {
  path: string;
  message: string;
}

const MAX_REPORTED_ISSUES = 20;

export class FmSaveValidationError extends Error {
  readonly code = 'FM_SAVE_PAYLOAD_INVALID';
  readonly issues: FmSaveValidationIssue[];

  constructor(issues: FmSaveValidationIssue[]) {
    const first = issues[0];
    const extra =
      issues.length > 1
        ? ` ${issues.length - 1} more field${issues.length - 1 === 1 ? '' : 's'} also failed the check.`
        : '';
    super(
      `This save decoded, but the result is incomplete, so the Hub did not load it. ${first.path}: ${first.message}${extra} Re-import the .fm file. If it still fails, this save may use a newer FM27 build than this app supports.`
    );
    this.name = 'FmSaveValidationError';
    this.issues = issues;
  }
}

type ValidationContext = {
  issues: FmSaveValidationIssue[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function pushIssue(context: ValidationContext, path: string, message: string): void {
  if (context.issues.length < MAX_REPORTED_ISSUES) {
    context.issues.push({ path, message });
  }
}

function requireObject(
  context: ValidationContext,
  value: unknown,
  path: string
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    pushIssue(context, path, 'expected an object');
    return false;
  }
  return true;
}

function requireArray(
  context: ValidationContext,
  value: unknown,
  path: string
): value is unknown[] {
  if (!Array.isArray(value)) {
    pushIssue(context, path, 'expected an array');
    return false;
  }
  return true;
}

function optionalArray(
  context: ValidationContext,
  value: unknown,
  path: string
): void {
  if (value !== undefined && value !== null && !Array.isArray(value)) {
    pushIssue(context, path, 'expected an array when present');
  }
}

function optionalObject(
  context: ValidationContext,
  value: unknown,
  path: string
): void {
  if (value !== undefined && value !== null && !isRecord(value)) {
    pushIssue(context, path, 'expected an object when present');
  }
}

function requireString(
  context: ValidationContext,
  value: unknown,
  path: string,
  { allowEmpty = false }: { allowEmpty?: boolean } = {}
): void {
  if (allowEmpty) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      pushIssue(context, path, 'expected a string');
    }
    return;
  }
  if (!isNonEmptyString(value)) {
    pushIssue(context, path, 'expected a non-empty string');
  }
}

function validateMeta(context: ValidationContext, payload: Record<string, unknown>): void {
  if (!requireObject(context, payload.meta, 'meta')) return;
  const meta = payload.meta as Record<string, unknown>;
  requireString(context, meta.game, 'meta.game');
  requireString(context, meta.build, 'meta.build');
  requireString(context, meta.saveName, 'meta.saveName', { allowEmpty: true });
  requireString(context, meta.clubName, 'meta.clubName');
  requireString(context, meta.fmsaveVersion, 'meta.fmsaveVersion');
  if (typeof meta.knownBuild !== 'boolean') {
    pushIssue(context, 'meta.knownBuild', 'expected true or false');
  }
  if (meta.gameDateIso !== undefined && meta.gameDateIso !== null && typeof meta.gameDateIso !== 'string') {
    pushIssue(context, 'meta.gameDateIso', 'expected a string or null');
  }
  if (meta.gameDateDmy !== undefined && meta.gameDateDmy !== null && typeof meta.gameDateDmy !== 'string') {
    pushIssue(context, 'meta.gameDateDmy', 'expected a string or null');
  }
  if (!isNonEmptyString(meta.gameDateIso) && !isNonEmptyString(meta.gameDateDmy)) {
    pushIssue(context, 'meta.gameDateIso', 'expected at least one decoded game date');
  }
  if (meta.balance !== undefined && meta.balance !== null && typeof meta.balance !== 'number') {
    pushIssue(context, 'meta.balance', 'expected a number or null');
  }
}

function validatePlayer(
  context: ValidationContext,
  player: unknown,
  path: string
): void {
  if (!requireObject(context, player, path)) return;
  const uid = player.uid;
  if (typeof uid !== 'number' || !Number.isFinite(uid) || uid <= 0) {
    pushIssue(context, `${path}.uid`, 'expected a positive number');
  }
  requireString(context, player.name, `${path}.name`);
  requireString(context, player.position, `${path}.position`);
  if (!isRecord(player.attributes)) {
    pushIssue(context, `${path}.attributes`, 'expected an attribute object');
  }
  if (player.secondaryPositions !== undefined && player.secondaryPositions !== null && !Array.isArray(player.secondaryPositions)) {
    pushIssue(context, `${path}.secondaryPositions`, 'expected an array when present');
  }
  if (player.traits !== undefined && player.traits !== null && !Array.isArray(player.traits)) {
    pushIssue(context, `${path}.traits`, 'expected an array when present');
  }
}

function validatePlayers(
  context: ValidationContext,
  payload: Record<string, unknown>
): void {
  if (!requireArray(context, payload.players, 'players')) return;
  if (payload.players.length === 0) {
    pushIssue(context, 'players', 'expected at least one player');
    return;
  }
  payload.players.forEach((player, index) => validatePlayer(context, player, `players[${index}]`));
}

function validateStaff(context: ValidationContext, payload: Record<string, unknown>): void {
  if (payload.staff === undefined || payload.staff === null) return;
  if (!requireArray(context, payload.staff, 'staff')) return;
  payload.staff.forEach((member, index) => {
    const path = `staff[${index}]`;
    if (!requireObject(context, member, path)) return;
    if (typeof member.uid !== 'number' || !Number.isFinite(member.uid) || member.uid <= 0) {
      pushIssue(context, `${path}.uid`, 'expected a positive number');
    }
    requireString(context, member.name, `${path}.name`);
  });
}

function validateMatches(context: ValidationContext, payload: Record<string, unknown>): void {
  if (payload.playedMatches === undefined || payload.playedMatches === null) return;
  if (!requireArray(context, payload.playedMatches, 'playedMatches')) return;
  payload.playedMatches.forEach((match, index) => {
    const path = `playedMatches[${index}]`;
    if (!requireObject(context, match, path)) return;
    if (!isNonEmptyString(match.dateIso) && !isNonEmptyString(match.dateDmy)) {
      pushIssue(context, `${path}.dateIso`, 'expected at least one decoded match date');
    }
    requireString(context, match.opponent, `${path}.opponent`);
  });
}

function validateFixtures(context: ValidationContext, payload: Record<string, unknown>): void {
  if (payload.upcomingFixtures === undefined || payload.upcomingFixtures === null) return;
  if (!requireArray(context, payload.upcomingFixtures, 'upcomingFixtures')) return;
  payload.upcomingFixtures.forEach((fixture, index) => {
    const path = `upcomingFixtures[${index}]`;
    if (!requireObject(context, fixture, path)) return;
    requireString(context, fixture.opponent, `${path}.opponent`);
  });
}

function validateTactics(context: ValidationContext, payload: Record<string, unknown>): void {
  if (payload.tactics === undefined || payload.tactics === null) return;
  if (!requireArray(context, payload.tactics, 'tactics')) return;
  payload.tactics.forEach((tactic, index) => {
    const path = `tactics[${index}]`;
    if (!requireObject(context, tactic, path)) return;
    requireString(context, tactic.name, `${path}.name`);
  });
}

function validateOptionalCollections(
  context: ValidationContext,
  payload: Record<string, unknown>
): void {
  for (const key of [
    'monthlyFinances',
    'activeInjuries',
    'activeSuspensions',
    'teamMatchStats',
    'sponsorships',
    'recruitmentTargets',
    'jobVacancies',
    'squadPlanner',
    'warnings',
    'extractionWarnings',
  ]) {
    optionalArray(context, payload[key], key);
  }

  for (const key of [
    'finances',
    'leagueStanding',
    'governance',
    'divisionBenchmarks',
    'facilities',
    'transferWindows',
    'competitionRules',
    'extractionManifest',
    'playerMatchStats',
    'playerSeasonHistory',
    'selections',
    'setPieces',
    'training',
    'stepTimingsMs',
    'binaryForensics',
  ]) {
    optionalObject(context, payload[key], key);
  }

  if (payload.fastSync !== undefined && typeof payload.fastSync !== 'boolean') {
    pushIssue(context, 'fastSync', 'expected true or false');
  }
}

/**
 * Rejects a decoded payload that cannot safely reach the Hub or the Analyst.
 * The error message names the first bad field path, never the field's value.
 */
export function assertValidDecodedFmSavePayload(
  payload: unknown,
  options: { mode?: FmSaveValidationMode } = {}
): DecodedFmSavePayload {
  const mode = options.mode ?? 'full';
  const context: ValidationContext = { issues: [] };

  if (!isRecord(payload)) {
    throw new FmSaveValidationError([
      { path: 'payload', message: 'expected a decoded save object' },
    ]);
  }

  if (mode === 'full') {
    validateMeta(context, payload);
    for (const key of ['playedMatches', 'upcomingFixtures', 'tactics', 'activeInjuries', 'mentoring']) {
      requireArray(context, payload[key], key);
    }
  }
  validatePlayers(context, payload);
  validateStaff(context, payload);
  validateMatches(context, payload);
  validateFixtures(context, payload);
  validateTactics(context, payload);
  validateOptionalCollections(context, payload);

  if (context.issues.length > 0) {
    throw new FmSaveValidationError(context.issues);
  }

  return payload as unknown as DecodedFmSavePayload;
}

export function isValidDecodedFmSavePayload(
  payload: unknown,
  options: { mode?: FmSaveValidationMode } = {}
): boolean {
  try {
    assertValidDecodedFmSavePayload(payload, options);
    return true;
  } catch {
    return false;
  }
}
