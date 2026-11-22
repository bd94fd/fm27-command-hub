import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMultiPlayerComparison,
  getPercentileBucket,
  normalizePlayerForComparison,
} from './playerComparisonEngine';
import { RecruitmentTarget } from '../types/fmSave';

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
