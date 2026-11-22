import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchLogEntry } from '../types/fm27';
import {
  buildMatchMomentumSummary,
  buildSeasonChronicle,
  estimateExpectedPoints,
} from './seasonInsights';

const sampleMatches = [
  {
    id: 'm1',
    date: '14/08/2026',
    competition: '1e Nationale',
    opponent: 'Royal Knokke',
    venue: 'H',
    score: '3 - 0',
    result: 'W',
    xGFor: 2.4,
    xGAgainst: 0.5,
  },
  {
    id: 'm2',
    date: '21/08/2026',
    competition: 'Croky Cup',
    opponent: 'RC Harelbeke',
    venue: 'A',
    score: '1 - 1',
    result: 'D',
    xGFor: 1.8,
    xGAgainst: 0.7,
  },
  {
    id: 'm3',
    date: '28/08/2026',
    competition: '1e Nationale',
    opponent: 'KVK Tienen',
    venue: 'H',
    score: '0 - 1',
    result: 'L',
    xGFor: 2.1,
    xGAgainst: 0.6,
  },
] as unknown as MatchLogEntry[];

test('estimateExpectedPoints rewards superior xG and stays within 0..3', () => {
  const strongWin = estimateExpectedPoints(2.5, 0.4);
  const evenMatch = estimateExpectedPoints(1.2, 1.2);
  const heavyLoss = estimateExpectedPoints(0.3, 2.6);
  assert.ok(strongWin > 2.3 && strongWin <= 3);
  assert.ok(evenMatch > 0.9 && evenMatch < 1.8);
  assert.ok(heavyLoss >= 0 && heavyLoss < 0.7);
});

test('buildMatchMomentumSummary detects unlucky finishing when xPts exceeds actual points', () => {
  const summary = buildMatchMomentumSummary(sampleMatches);
  assert.ok(summary);
  assert.equal(summary.actualPoints, 4);
  assert.ok(summary.expectedPoints > summary.actualPoints);
  assert.ok(summary.finishingDelta < -2);
  assert.match(summary.verdictTitle, /Unlucky Finishing/i);
});

test('buildSeasonChronicle aggregates W-D-L, clean sheets, unbeaten run, biggest win, and cup matches', () => {
  const chronicle = buildSeasonChronicle(sampleMatches);
  assert.equal(chronicle.length, 1);
  assert.equal(chronicle[0].seasonLabel, '2026/27');
  assert.equal(chronicle[0].wins, 1);
  assert.equal(chronicle[0].draws, 1);
  assert.equal(chronicle[0].losses, 1);
  assert.equal(chronicle[0].cleanSheets, 1);
  assert.equal(chronicle[0].longestUnbeatenRun, 2);
  assert.equal(chronicle[0].biggestWin, '3 - 0 vs Royal Knokke');
  assert.equal(chronicle[0].cupMatches, 1);
});
