import assert from 'node:assert/strict';
import test from 'node:test';
import { buildScoutTargetFromPlayer } from './scoutTargetFromPlayer';
import type { PlayerRecord } from '../types/fm27';
import type { RecruitmentTarget } from '../types/fmSave';

const player = (overrides: Partial<PlayerRecord> = {}): PlayerRecord =>
  ({
    id: 'p1',
    uid: 42,
    name: 'René Vanden Borre',
    age: 23,
    nation: 'Belgium',
    position: 'GK',
    wagePw: 1250,
    expires: '30/06/2028',
    contractExpiryMonths: 20,
    ...overrides,
  }) as PlayerRecord;

const target = (overrides: Partial<RecruitmentTarget> = {}): RecruitmentTarget =>
  ({
    uid: 42,
    name: 'René Vanden Borre',
    age: 23,
    nationality: 'Belgium',
    primaryPosition: 'GK',
    isFreeAgent: false,
    contractExpiryMonths: 20,
    expires: '30/06/2028',
    demandedWageEur: 1250,
    ...overrides,
  }) as RecruitmentTarget;

test('a player already in the scout pool keeps that pool entry', () => {
  const pooled = target({ name: 'René Vanden Borre', scoutBadges: [] });
  const result = buildScoutTargetFromPlayer(player(), [pooled]);
  assert.equal(result, pooled, 'the pool row is reused, not rebuilt');
});

test('the pool is matched by uid even when the name differs', () => {
  const pooled = target({ uid: 42, name: 'R. Vanden Borre' });
  assert.equal(buildScoutTargetFromPlayer(player(), [pooled]), pooled);
});

test('the pool is matched by name when the player has no uid', () => {
  const pooled = target({ uid: 999, name: '  rené vanden borre  ' });
  const result = buildScoutTargetFromPlayer(player({ uid: undefined }), [pooled]);
  assert.equal(result, pooled);
});

test('an unmatched player becomes a scout target built from the squad row', () => {
  const result = buildScoutTargetFromPlayer(player(), []);
  assert.equal(result.uid, 42);
  assert.equal(result.name, 'René Vanden Borre');
  assert.equal(result.age, 23);
  assert.equal(result.nationality, 'Belgium');
  assert.equal(result.primaryPosition, 'GK');
  assert.equal(result.contractExpiryMonths, 20);
  assert.equal(result.expires, '30/06/2028');
  assert.equal(result.demandedWageEur, 1250);
  assert.equal(result.isFreeAgent, false);
});

test('a player on no wage counts as a free agent', () => {
  assert.equal(buildScoutTargetFromPlayer(player({ wagePw: 0 }), []).isFreeAgent, true);
});

test('a player with a free-transfer expiry counts as a free agent', () => {
  const result = buildScoutTargetFromPlayer(player({ expires: 'Free transfer' }), []);
  assert.equal(result.isFreeAgent, true);
});

test('a missing expiry defaults the contract length to six months', () => {
  const result = buildScoutTargetFromPlayer(
    player({ contractExpiryMonths: undefined }),
    []
  );
  assert.equal(result.contractExpiryMonths, 6);
});

test('a player with no uid falls back to zero so the row still renders', () => {
  const result = buildScoutTargetFromPlayer(player({ uid: undefined }), []);
  assert.equal(result.uid, 0);
});
