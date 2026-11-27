import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAvailabilityIndex } from './hydrateAvailability.ts';
import type { ActiveSuspensionRecord } from '../types/fmSave';

const ban = (overrides: Partial<ActiveSuspensionRecord> = {}): ActiveSuspensionRecord =>
  ({
    playerUid: 101,
    playerName: 'René Vanden Borre',
    competitionName: 'Jupiler Pro League',
    matchesRemaining: 2,
    scope: 'Domestic',
    reason: 'Red card',
    ...overrides,
  }) as ActiveSuspensionRecord;

test('a ban stored at the save root and on the player counts once', () => {
  const index = buildAvailabilityIndex({
    activeSuspensions: [ban()],
    activeInjuries: [],
    players: [{ activeSuspensions: [ban()] }],
  });
  assert.equal(index.suspensions.length, 1);
  assert.equal(index.bansByUid.get(101)?.length, 1);
});

test('the same player can carry two different bans', () => {
  const index = buildAvailabilityIndex({
    activeSuspensions: [ban(), ban({ competitionName: 'Belgian Cup', matchesRemaining: 1 })],
    activeInjuries: [],
    players: [],
  });
  assert.equal(index.suspensions.length, 2);
  assert.equal(index.bansByUid.get(101)?.length, 2);
});

test('bans that have run out are dropped, so a served ban never blocks a starter', () => {
  const index = buildAvailabilityIndex({
    activeSuspensions: [ban({ matchesRemaining: 0 }), ban({ matchesRemaining: -1 }), ban()],
    activeInjuries: [],
    players: [{ activeSuspensions: [ban({ matchesRemaining: 0 }) as ActiveSuspensionRecord] }],
  });
  assert.equal(index.suspensions.length, 1);
  assert.equal(index.suspensions[0].matchesRemaining, 2);
});

test('a missing or null ban entry does not throw', () => {
  const index = buildAvailabilityIndex({
    activeSuspensions: [null as unknown as ActiveSuspensionRecord],
    activeInjuries: [],
    players: [{ activeSuspensions: undefined }],
  });
  assert.deepEqual(index.suspensions, []);
});

test('an injury is found by uid, and by name when the uid is missing', () => {
  const index = buildAvailabilityIndex({
    activeSuspensions: [],
    activeInjuries: [
      { playerUid: 102, playerName: 'Tom Peeters' },
      { playerUid: null, playerName: 'René Vanden Borre' },
    ],
    players: [],
  });
  assert.equal(index.isInjured(102, undefined), true);
  assert.equal(index.isInjured(undefined, 'René Vanden Borre'), true);
  assert.equal(index.isInjured(undefined, '  rené   vanden borre '), true);
  assert.equal(index.isInjured(999, 'Someone Else'), false);
  assert.equal(index.isInjured(undefined, undefined), false);
});

test('a save with no injuries or bans returns an empty index', () => {
  const index = buildAvailabilityIndex({ activeSuspensions: [], activeInjuries: [], players: [] });
  assert.deepEqual(index.suspensions, []);
  assert.equal(index.bansByUid.size, 0);
  assert.equal(index.injuredCount, 0);
  assert.equal(index.isInjured(1, 'Anyone'), false);
});
