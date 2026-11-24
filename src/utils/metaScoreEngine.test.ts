import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlayerRecord } from '../types/fm27.ts';
import {
  computeClubBenchmark,
  computeStarterGain,
  evaluateClubReputationFit,
  evaluatePlayerMetaScore,
  isGoalkeeperPlayer,
} from './metaScoreEngine.ts';

function makeBaseAttrs(
  overrides: Partial<PlayerRecord['attributes']> = {}
): PlayerRecord['attributes'] {
  return {
    pace: 16,
    acceleration: 16,
    jumpingReach: 14,
    dribbling: 15,
    balance: 14,
    concentration: 13,
    anticipation: 14,
    determination: 15,
    agility: 15,
    stamina: 14,
    strength: 13,
    firstTouch: 14,
    composure: 14,
    workRate: 14,
    finishing: 15,
    passing: 13,
    tackling: 10,
    decisions: 14,
    flair: 13,
    longShots: 12,
    aggression: 12,
    heading: 13,
    offTheBall: 15,
    ...overrides,
  };
}

function makePlayer(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id: 'p1',
    uid: 101,
    number: 9,
    name: 'Test Outfield',
    age: 20,
    position: 'STC',
    ability: 3.0,
    potential: 4.5,
    wagePw: 800,
    expires: '30/06/2029',
    marketValue: 500_000,
    nation: 'Belgium',
    personality: 'Balanced',
    status: 'Starter',
    ipRole: 'Channel Forward',
    oopRole: 'Pressing Centre Forward',
    condition: 95,
    morale: 'Good',
    apps: '10',
    minutes: 850,
    goals: 5,
    xG: 4.2,
    xGPer90: 0.44,
    assists: 2,
    xA: 1.8,
    xAPer90: 0.19,
    drbPer90: 2.1,
    prPassesPer90: 3.0,
    hdrPct: 45,
    intPer90: 0.5,
    tckPct: 60,
    rating: 7.2,
    notes: '',
    attributes: makeBaseAttrs(),
    ...overrides,
  };
}

test('isGoalkeeperPlayer detects GK primary position and >=15 GK positionRatings', () => {
  assert.equal(isGoalkeeperPlayer(makePlayer({ position: 'GK' })), true);
  assert.equal(
    isGoalkeeperPlayer(makePlayer({ position: 'DC', positionRatings: { GK: 18 } })),
    true
  );
  assert.equal(isGoalkeeperPlayer(makePlayer({ position: 'STC' })), false);
});

test('evaluatePlayerMetaScore computes outfield and GK meta scores, PA age taper, and Unrated fallback', () => {
  const youngElite = evaluatePlayerMetaScore(makePlayer({ age: 20, ability: 3.0, potential: 4.5 }));
  assert.equal(youngElite.isGoalkeeper, false);
  assert.equal(youngElite.tier, 'Elite');
  assert.ok(youngElite.metaScore !== null && youngElite.metaScore >= 14.5);
  assert.ok(youngElite.paMetaScore !== null && youngElite.paMetaScore > youngElite.metaScore);

  const olderSame = evaluatePlayerMetaScore(makePlayer({ age: 27, ability: 3.0, potential: 4.5 }));
  assert.ok(
    olderSame.paMetaScore !== null &&
      youngElite.paMetaScore !== null &&
      olderSame.paMetaScore < youngElite.paMetaScore
  );

  const gk = evaluatePlayerMetaScore(
    makePlayer({
      position: 'GK',
      attributes: makeBaseAttrs({
        reflexes: 15,
        agility: 14,
        acceleration: 13,
        pace: 12,
        aerialReach: 15,
      }),
    })
  );
  assert.equal(gk.isGoalkeeper, true);
  assert.equal(gk.tier, 'Strong');

  const unrated = evaluatePlayerMetaScore(
    makePlayer({
      attributes: {} as unknown as PlayerRecord['attributes'],
    })
  );
  assert.equal(unrated.metaScore, null);
  assert.equal(unrated.tier, 'Unrated');
});

test('computeStarterGain and evaluateClubReputationFit evaluate recruitment upgrades accurately', () => {
  const starter = makePlayer({
    attributes: makeBaseAttrs({
      pace: 10,
      acceleration: 10,
      jumpingReach: 10,
      dribbling: 10,
      balance: 10,
      concentration: 10,
      anticipation: 10,
    }),
  });
  const target = makePlayer({
    attributes: makeBaseAttrs({
      pace: 16,
      acceleration: 16,
      jumpingReach: 14,
      dribbling: 15,
    }),
  });
  const gain = computeStarterGain(target, starter);
  assert.equal(gain.isUpgrade, true);
  assert.ok(gain.metaGain !== null && gain.metaGain > 3);

  assert.equal(evaluateClubReputationFit(3200, 3000).likelihood, 'Likely Interested');
  assert.equal(evaluateClubReputationFit(4200, 3000).likelihood, 'Realistic Stretch');
  assert.equal(evaluateClubReputationFit(5500, 3000).likelihood, 'Unlikely');
  assert.equal(evaluateClubReputationFit(7500, 3000).likelihood, 'Out of Reach');
});

test('computeClubBenchmark excludes loanees from median market value while computing Top-11 meta', () => {
  const ownedA = makePlayer({ id: 'a', marketValue: 100_000, onLoan: false });
  const ownedB = makePlayer({ id: 'b', marketValue: 300_000, onLoan: false });
  const ownedC = makePlayer({ id: 'c', marketValue: 500_000, onLoan: false });
  const loaneeOutlier = makePlayer({ id: 'd', marketValue: 25_000_000, onLoan: true });

  const bench = computeClubBenchmark('KVV Zelzate', [ownedA, ownedB, ownedC, loaneeOutlier]);
  assert.equal(bench.squadCount, 4);
  assert.equal(bench.medianValue, 300_000);
  assert.ok(bench.top11AverageMeta !== null && bench.top11AverageMeta >= 14);
});
