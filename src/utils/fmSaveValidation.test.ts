import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FmSaveValidationError,
  assertValidDecodedFmSavePayload,
  isValidDecodedFmSavePayload,
} from './fmSaveValidation.ts';

function validPayload() {
  return {
    meta: {
      game: 'FM27',
      build: '27.1.0',
      knownBuild: true,
      saveName: 'kvv',
      gameDateIso: '2026-11-01',
      gameDateDmy: '01/11/2026',
      clubUid: 1,
      clubName: 'KVV Zelzate',
      managerName: 'Manager',
      balance: 1000,
      fmsaveVersion: '1.0',
    },
    players: [
      {
        uid: 1,
        name: 'Player One',
        position: 'ST',
        attributes: { finishing: 12 },
      },
    ],
    playedMatches: [],
    upcomingFixtures: [],
    tactics: [],
    activeInjuries: [],
    mentoring: [],
  };
}

test('accepts a structurally valid decoded save', () => {
  const payload = validPayload();
  assert.equal(assertValidDecodedFmSavePayload(payload), payload);
  assert.equal(isValidDecodedFmSavePayload(payload), true);
});

test('rejects a non-object payload with a clear path', () => {
  assert.throws(
    () => assertValidDecodedFmSavePayload(null),
    (error: unknown) =>
      error instanceof FmSaveValidationError &&
      error.code === 'FM_SAVE_PAYLOAD_INVALID' &&
      error.issues[0].path === 'payload'
  );
});

test('rejects a missing meta block before it can reach the UI', () => {
  const payload = validPayload() as Record<string, unknown>;
  delete payload.meta;
  assert.throws(
    () => assertValidDecodedFmSavePayload(payload),
    (error: unknown) =>
      error instanceof FmSaveValidationError &&
      error.issues.some((issue) => issue.path === 'meta') &&
      /did not load it/.test(error.message) &&
      /Re-import the \.fm file/.test(error.message)
  );
});

test('rejects malformed players and names the first bad field', () => {
  const payload = validPayload();
  payload.players.push({
    uid: 2,
    name: '',
    position: 'CB',
    attributes: null,
  } as never);
  assert.throws(
    () => assertValidDecodedFmSavePayload(payload),
    (error: unknown) =>
      error instanceof FmSaveValidationError &&
      error.issues[0].path === 'players[1].name' &&
      error.message.includes('players[1].name') &&
      error.issues.some((issue) => issue.path === 'players[1].attributes')
  );
});

test('rejects wrong collection types', () => {
  const payload = validPayload() as Record<string, unknown>;
  payload.staff = {};
  payload.playedMatches = 'not an array';
  assert.throws(
    () => assertValidDecodedFmSavePayload(payload),
    (error: unknown) =>
      error instanceof FmSaveValidationError &&
      error.issues.some((issue) => issue.path === 'staff') &&
      error.issues.some((issue) => issue.path === 'playedMatches')
  );
});

test('accepts a checkpoint without meta but still requires players', () => {
  const checkpoint = {
    players: [{ uid: 1, name: 'Player One', position: 'ST', attributes: {} }],
  };
  assert.equal(
    assertValidDecodedFmSavePayload(checkpoint, { mode: 'checkpoint' }),
    checkpoint
  );
  assert.throws(
    () => assertValidDecodedFmSavePayload({ players: [] }, { mode: 'checkpoint' }),
    (error: unknown) =>
      error instanceof FmSaveValidationError &&
      error.issues[0].path === 'players'
  );
});

test('allows optional null blocks and omits optional arrays', () => {
  const payload = validPayload() as Record<string, unknown>;
  payload.finances = null;
  payload.leagueStanding = null;
  assert.equal(assertValidDecodedFmSavePayload(payload), payload);
});

test('the Hub validates both final and checkpoint payloads before hydration', () => {
  const src =
    readFileSync(
      new URL('../components/AutoSyncWorkspace.tsx', import.meta.url),
      'utf8'
    ) +
    readFileSync(
      new URL('../hooks/useFmFileIngest.ts', import.meta.url),
      'utf8'
    );
  assert.match(src, /assertValidDecodedFmSavePayload\(/);
  assert.match(src, /mode: 'checkpoint'/);
});
