import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlayerRecord } from '../types/fm27.ts';
import type { RecruitmentTarget } from '../types/fmSave.ts';
import {
  MAX_COMPARE_TRAY_SIZE,
  isTargetInCompareTray,
  toggleCompareTrayEntry,
} from './compareTray.ts';
import {
  buildCompareTargetFromSquadPlayer,
  resolveSquadPlayerUid,
} from './recruitmentHelpers.ts';

function makeTarget(uid: number, name = `Target ${uid}`): RecruitmentTarget {
  return {
    uid,
    name,
    age: 24,
    nationality: 'Belgian',
    primaryPosition: 'DM',
    isFreeAgent: false,
    contractExpiryMonths: 18,
    demandedWageEur: 12000,
    attributes: { pace: 13, acceleration: 12, passing: 16, tackling: 15 },
  };
}

function makeSquadPlayer(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id: 'squad-benjamin',
    uid: 900001,
    number: 6,
    name: 'Benjamin Melkebeke',
    position: 'DM',
    secondaryPositions: ['MC'],
    apps: '21',
    minutes: 1780,
    rating: 7.1,
    goals: 2,
    xG: 1.4,
    xGPer90: 0.07,
    assists: 5,
    xA: 3.8,
    xAPer90: 0.19,
    drbPer90: 1.1,
    prPassesPer90: 6.2,
    hdrPct: 58,
    intPer90: 2.4,
    tckPct: 71,
    personality: 'Professional',
    age: 27,
    ability: 3.5,
    potential: 4,
    preferredFoot: 'Right',
    heightCm: 182,
    expires: '30/06/2028',
    contractExpiryMonths: 20,
    nation: 'Belgium',
    wagePw: 14500,
    marketValue: 12500000,
    marketValueState: 'ok',
    status: 'Starter',
    positionRatings: { DM: 20, MC: 17 },
    traits: ['Marks Opponent Tightly'],
    attributes: {
      pace: 13,
      acceleration: 12,
      stamina: 16,
      jumpingReach: 14,
      passing: 17,
      firstTouch: 15,
      finishing: 8,
      tackling: 16,
      decisions: 15,
      determination: 17,
      workRate: 16,
      offTheBall: 12,
      dribbling: 13,
      balance: 14,
      concentration: 15,
      anticipation: 16,
      agility: 13,
      strength: 14,
      composure: 15,
      flair: 9,
      longShots: 11,
      aggression: 14,
      heading: 13,
    },
    ...overrides,
  } as PlayerRecord;
}

test('compare tray adds, removes and enforces its three slot limit', () => {
  const first = makeTarget(1);
  const second = makeTarget(2);
  const third = makeTarget(3);
  const fourth = makeTarget(4);

  const added = toggleCompareTrayEntry([], first);
  assert.equal(added.result, 'added');
  assert.deepEqual(added.targets.map((t) => t.uid), [1]);

  const filled = toggleCompareTrayEntry([first, second], third);
  assert.equal(filled.result, 'added');
  assert.equal(filled.targets.length, MAX_COMPARE_TRAY_SIZE);

  const overflow = toggleCompareTrayEntry(filled.targets, fourth);
  assert.equal(overflow.result, 'full');
  assert.equal(overflow.targets.length, MAX_COMPARE_TRAY_SIZE);
  assert.equal(isTargetInCompareTray(overflow.targets, 4), false);

  const removed = toggleCompareTrayEntry(filled.targets, second);
  assert.equal(removed.result, 'removed');
  assert.deepEqual(removed.targets.map((t) => t.uid), [1, 3]);
});

test('a squad member and a scouted target share the same tray slots', () => {
  const squadEntry = buildCompareTargetFromSquadPlayer(makeSquadPlayer());
  const scouted = makeTarget(4242, 'Scouted DM');

  const withSquad = toggleCompareTrayEntry([], squadEntry);
  assert.equal(withSquad.result, 'added');

  const mixed = toggleCompareTrayEntry(withSquad.targets, scouted);
  assert.equal(mixed.result, 'added');
  assert.deepEqual(mixed.targets.map((t) => t.name), [
    'Benjamin Melkebeke',
    'Scouted DM',
  ]);

  // Same player re-added is a removal, not a duplicate slot.
  const toggledOff = toggleCompareTrayEntry(mixed.targets, buildCompareTargetFromSquadPlayer(makeSquadPlayer()));
  assert.equal(toggledOff.result, 'removed');
  assert.deepEqual(toggledOff.targets.map((t) => t.uid), [4242]);
});

test('buildCompareTargetFromSquadPlayer keeps the attributes the comparison engine reads', () => {
  const player = makeSquadPlayer();
  const target = buildCompareTargetFromSquadPlayer(player, 'Anderlecht');

  assert.equal(target.uid, 900001);
  assert.equal(target.name, 'Benjamin Melkebeke');
  assert.equal(target.primaryPosition, 'DM');
  assert.equal(target.currentClub, 'Anderlecht');
  assert.equal(target.isFreeAgent, false);
  assert.equal(target.demandedWageEur, player.wagePw);

  const attrKeys = Object.keys(player.attributes) as Array<keyof PlayerRecord['attributes']>;
  for (const key of attrKeys) {
    assert.equal(target.attributes[key], player.attributes[key], `${key} should carry over`);
  }

  const fallbackClub = buildCompareTargetFromSquadPlayer(makeSquadPlayer(), '   ');
  assert.equal(fallbackClub.currentClub, 'Current squad');
});

test('resolveSquadPlayerUid falls back to a stable negative id without an FM uid', () => {
  const noUid = makeSquadPlayer({ uid: undefined });
  const first = resolveSquadPlayerUid(noUid);
  const second = resolveSquadPlayerUid(makeSquadPlayer({ uid: undefined }));

  assert.ok(first < 0, 'fallback ids stay clear of positive FM uids');
  assert.equal(first, second, 'the same player must keep the same tray id');

  const other = resolveSquadPlayerUid(makeSquadPlayer({ id: 'squad-other', uid: undefined }));
  assert.notEqual(other, first);
});
