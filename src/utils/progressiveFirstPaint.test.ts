import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertValidDecodedFmSavePayload,
  FmSaveValidationError,
} from './fmSaveValidation.ts';
import { hydrateAppFromDecodedFmSave } from './fmSaveHydrator.ts';
import type { DecodedFmSavePayload } from './fmSaveHydrator.ts';

// Shape of the stage_2_club_core checkpoint: squad, staff, finances and tactics
// are present, while fixtures, the league table and season stats are not yet.
function stageTwoCheckpoint(): DecodedFmSavePayload {
  return {
    meta: {
      game: 'FM27',
      build: '27.1.0',
      knownBuild: true,
      saveName: 'kvv',
      gameDateIso: '2027-03-14',
      gameDateDmy: '14/03/2027',
      clubUid: 1,
      clubName: 'KVV Zelzate',
      managerName: 'Manager',
      balance: 1250000,
      fmsaveVersion: '0.14.5',
      fileName: 'kvv.fm',
    },
    players: [
      {
        uid: 11,
        name: 'Player One',
        position: 'ST',
        age: 24,
        ca: 120,
        pa: 140,
        attributes: { finishing: 14, pace: 13 },
      },
      {
        uid: 12,
        name: 'Player Two',
        position: 'CB',
        age: 28,
        ca: 115,
        pa: 118,
        attributes: { tackling: 14, heading: 13 },
      },
    ],
    staff: [
      {
        uid: 21,
        name: 'Coach One',
        role: 'Coach',
        age: 41,
        wagePw: 900,
        coachingAttacking: 15,
        coachingDefending: 12,
        coachingTactical: 14,
      },
      {
        uid: 22,
        name: 'Coach Two',
        role: 'Physio',
        age: 36,
        wagePw: 700,
        coachingAttacking: 8,
        coachingDefending: 9,
        coachingTactical: 10,
      },
    ],
    playedMatches: [],
    upcomingFixtures: [],
    tactics: [],
    activeInjuries: [],
    mentoring: [],
    finances: {
      month: 'March',
      balance: 1250000,
      wagePayrollWeekly: 45000,
      wageBudgetWeekly: 60000,
      transferBudgetRemaining: 250000,
    },
    leagueStanding: null,
  } as unknown as DecodedFmSavePayload;
}

test('the stage 2 checkpoint passes checkpoint validation, so the early apply is not skipped', () => {
  const payload = stageTwoCheckpoint();
  assert.equal(
    assertValidDecodedFmSavePayload(payload, { mode: 'checkpoint' }),
    payload
  );
});

test('the stage 2 checkpoint paints squad, staff and finances with no matches yet', () => {
  const hydrated = hydrateAppFromDecodedFmSave(stageTwoCheckpoint(), [], []);

  assert.equal(hydrated.updatedSquad.length, 2, 'squad should be usable at stage 2');
  assert.equal(hydrated.updatedStaff.length, 2, 'staff should be usable at stage 2');
  assert.ok(
    hydrated.balanceLabel && hydrated.balanceLabel.trim().length > 0,
    'finances should be usable at stage 2'
  );
  assert.ok(hydrated.saveDateLabel && hydrated.saveDateLabel.trim().length > 0);

  assert.equal(
    hydrated.updatedMatches.length,
    0,
    'fixtures and results are still behind the loading state at stage 2'
  );
  assert.match(
    hydrated.leagueStandingLabel ?? '',
    /no league table/i,
    'the league table arrives in stage 4, so the early screen must say it is missing rather than invent a position'
  );
});

test('a checkpoint with no squad is rejected instead of painting an empty screen', () => {
  const payload = stageTwoCheckpoint() as unknown as Record<string, unknown>;
  payload.players = [];

  assert.throws(
    () => assertValidDecodedFmSavePayload(payload, { mode: 'checkpoint' }),
    (error: unknown) =>
      error instanceof FmSaveValidationError &&
      error.issues.some((issue) => issue.path.startsWith('players'))
  );
});
