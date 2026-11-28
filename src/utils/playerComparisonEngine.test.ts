import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMultiPlayerComparison,
  computeRelativePercentile,
  estimateDivisionPercentile,
  getPercentileBucket,
  normalizePlayerForComparison,
} from './playerComparisonEngine';
import { RecruitmentTarget } from '../types/fmSave';
import { PlayerRecord } from '../types/fm27';

const makeTarget = (uid: number, name: string, pos: string, pace: number, passing: number): RecruitmentTarget => ({
  uid,
  name,
  age: 22,
  nationality: 'BEL',
  primaryPosition: pos,
  isFreeAgent: true,
  contractExpiryMonths: 0,
  demandedWageEur: 450,
  attributes: {
    pace,
    acceleration: pace - 1,
    stamina: 14,
    passing,
    finishing: 12,
    tackling: 11,
    decisions: 13,
    workRate: 15,
    determination: 16,
    firstTouch: 13,
  },
});

test('normalizePlayerForComparison maps RecruitmentTarget key* fallbacks', () => {
  const target: RecruitmentTarget = {
    uid: 99,
    name: 'Fallback Scout',
    age: 21,
    nationality: 'NED',
    primaryPosition: 'MC',
    isFreeAgent: true,
    contractExpiryMonths: 0,
    demandedWageEur: 300,
    attributes: {
      keyPace: 16,
      keyVision: 14,
      keyDecision: 13,
      keyStamina: 15,
    },
  };
  const normalized = normalizePlayerForComparison(target);
  assert.equal(normalized.id, 'target-99');
  assert.equal(normalized.attributes.pace, 16);
  assert.equal(normalized.attributes.vision, 14);
  assert.equal(normalized.attributes.decisions, 13);
  assert.equal(normalized.attributes.stamina, 15);
});

test('buildMultiPlayerComparison caps at 3 players and identifies leaders', () => {
  const t1 = makeTarget(1, 'Alpha', 'ST', 17, 11);
  const t2 = makeTarget(2, 'Beta', 'ST', 13, 16);
  const t3 = makeTarget(3, 'Gamma', 'ST', 15, 14);
  const t4 = makeTarget(4, 'Delta', 'ST', 18, 18);

  const dataset = buildMultiPlayerComparison([t1, t2, t3, t4]);
  assert.equal(dataset.players.length, 3);
  assert.equal(dataset.colors.length, 3);
  assert.equal(dataset.isGk, false);
  assert.equal(dataset.radarAxes.length, 6);
  assert.equal(dataset.pizzaSlices.length, 8);
  assert.equal(dataset.barMetrics.length, 8);

  const paceAxis = dataset.radarAxes.find((a) => a.key === 'pace');
  assert.ok(paceAxis);
  assert.equal(paceAxis.leaderIndex, 0);

  const passingAxis = dataset.radarAxes.find((a) => a.key === 'passing');
  assert.ok(passingAxis);
  assert.equal(passingAxis.leaderIndex, 1);
});

test('getPercentileBucket classifies percentiles cleanly', () => {
  assert.equal(getPercentileBucket(90), 'Elite');
  assert.equal(getPercentileBucket(72), 'Strong');
  assert.equal(getPercentileBucket(50), 'Solid');
  assert.equal(getPercentileBucket(20), 'Developing');
});

function makeBaselinePlayer(id: string, attributes: Record<string, number>): PlayerRecord {
  return { id, name: id, attributes } as unknown as PlayerRecord;
}

function makeKeeper(id: string, overrides: Record<string, number> = {}): PlayerRecord {
  return {
    id,
    name: id,
    position: 'GK',
    age: 28,
    wagePw: 700,
    status: 'Starter',
    ipRole: 'Goalkeeper',
    attributes: {
      reflexes: 15,
      handling: 14,
      oneOnOnes: 13,
      aerialReach: 14,
      commandOfArea: 13,
      kicking: 12,
      agility: 15,
      positioning: 14,
      decisions: 14,
      ...overrides,
    },
  } as unknown as PlayerRecord;
}

test('estimateDivisionPercentile clamps unknown or out-of-range attributes to 5..99', () => {
  assert.equal(estimateDivisionPercentile(10), 43);
  assert.equal(estimateDivisionPercentile(20), 99);
  assert.equal(estimateDivisionPercentile(0), 5);
  assert.equal(estimateDivisionPercentile(Number.NaN), 5);
});

test('computeRelativePercentile falls back to the division estimate without enough baseline data', () => {
  const fallback = estimateDivisionPercentile(14);
  assert.equal(computeRelativePercentile(14, 'passing'), fallback);
  assert.equal(
    computeRelativePercentile(14, 'passing', [
      makeBaselinePlayer('a', { passing: 12 }),
      makeBaselinePlayer('b', { passing: 13 }),
    ]),
    fallback
  );
  assert.equal(
    computeRelativePercentile(14, 'passing', [
      makeBaselinePlayer('a', { passing: 0 }),
      makeBaselinePlayer('b', { passing: 0 }),
      makeBaselinePlayer('c', { passing: 0 }),
    ]),
    fallback
  );
});

test('computeRelativePercentile ranks against the squad and keeps ties at half weight', () => {
  const baseline = [
    makeBaselinePlayer('a', { passing: 8 }),
    makeBaselinePlayer('b', { passing: 10 }),
    makeBaselinePlayer('c', { passing: 12 }),
  ];
  assert.equal(computeRelativePercentile(12, 'passing', baseline), 83);
  assert.equal(computeRelativePercentile(8, 'passing', baseline), 17);
  assert.equal(computeRelativePercentile(20, 'passing', baseline), 99);
  assert.equal(computeRelativePercentile(1, 'passing', baseline), 5);

  const tied = [
    makeBaselinePlayer('a', { passing: 10 }),
    makeBaselinePlayer('b', { passing: 10 }),
    makeBaselinePlayer('c', { passing: 14 }),
    makeBaselinePlayer('d', { passing: 14 }),
  ];
  assert.equal(computeRelativePercentile(14, 'passing', tied), 75);
});

test('buildMultiPlayerComparison switches to goalkeeper axes when every selection is a keeper', () => {
  const dataset = buildMultiPlayerComparison([
    makeKeeper('gk1'),
    makeKeeper('gk2', { reflexes: 13 }),
  ]);

  assert.equal(dataset.isGk, true);
  assert.equal(dataset.players.length, 2);
  assert.deepEqual(
    dataset.radarAxes.map((axis) => axis.key),
    ['reflexes', 'handling', 'aerialReach', 'commandOfArea', 'agility', 'positioning']
  );
  assert.ok(dataset.barMetrics.some((axis) => axis.key === 'kicking'));
  assert.ok(dataset.barMetrics.some((axis) => axis.key === 'oneOnOnes'));
});

test('buildMultiPlayerComparison leaves the leader unset when two players tie on an axis', () => {
  const dataset = buildMultiPlayerComparison([
    makeTarget(1, 'Twin A', 'ST', 15, 10),
    makeTarget(2, 'Twin B', 'ST', 15, 10),
  ]);

  assert.ok(dataset.radarAxes.every((axis) => axis.leaderIndex === null));
});

test('buildMultiPlayerComparison mixes squad players and targets without changing their source', () => {
  const dataset = buildMultiPlayerComparison([
    makeKeeper('squad-keeper'),
    makeTarget(7, 'Scouted Striker', 'ST', 12, 12),
  ]);

  assert.equal(dataset.isGk, false);
  assert.deepEqual(dataset.players.map((player) => player.source), ['squad', 'target']);
  assert.deepEqual(dataset.colors, ['#10b981', '#38bdf8']);
  assert.equal(dataset.players[0].subtitle, 'Starter · GK');
  assert.equal(dataset.players[1].id, 'target-7');
});
