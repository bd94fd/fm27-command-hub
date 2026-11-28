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

function match(overrides: Partial<MatchLogEntry> & Record<string, unknown>): MatchLogEntry {
  return {
    id: 'm',
    date: '14/08/2026',
    competition: '1e Nationale',
    opponent: 'Rival',
    venue: 'H',
    score: '0 - 0',
    result: 'D',
    ...overrides,
  } as MatchLogEntry;
}

test('buildMatchMomentumSummary falls back to scoreline form when no match carries xG', () => {
  const summary = buildMatchMomentumSummary([
    match({ id: 'n1', score: '1 - 0', result: 'W' }),
    match({ id: 'n2', score: '0 - 0', result: 'D' }),
    match({ id: 'n3', score: '0 - 2', result: 'L' }),
  ]);

  assert.ok(summary);
  assert.equal(summary.matchesWithXg, 0);
  assert.equal(summary.actualPoints, 4);
  assert.equal(summary.expectedPoints, 4);
  assert.equal(summary.pointsDelta, 0);
  assert.equal(summary.finishingDelta, 0);
  assert.equal(summary.defensiveDelta, 0);
  assert.match(summary.verdictTitle, /No xG Data Yet/);
});

test('buildMatchMomentumSummary mixes xG-tracked and scoreline-only matches', () => {
  const summary = buildMatchMomentumSummary([
    match({ id: 'n1', score: '1 - 0', result: 'W', xGFor: 2.0, xGAgainst: 0.5 }),
    match({ id: 'n2', score: '1 - 1', result: 'D' }),
  ]);

  assert.ok(summary);
  assert.equal(summary.matchesWithXg, 1);
  const expected = Number((estimateExpectedPoints(2.0, 0.5) + 1).toFixed(1));
  assert.equal(summary.expectedPoints, expected);
  assert.equal(summary.xGFor, 2);
  assert.equal(summary.finishingDelta, Number((1 - 2).toFixed(2)));
});

test('buildMatchMomentumSummary calls out clinical overperformance when results beat xPts and xGA', () => {
  const summary = buildMatchMomentumSummary([
    match({ id: 'c1', score: '3 - 0', result: 'W', xGFor: 0.4, xGAgainst: 2.6 }),
  ]);

  assert.ok(summary);
  assert.ok(summary.pointsDelta >= 2.5);
  assert.ok(summary.defensiveDelta > 1.5);
  assert.match(summary.verdictTitle, /Clinical & Goalkeeper-Backed Overperformance/);
});

test('buildMatchMomentumSummary flags conceding more than expected without blaming finishing', () => {
  const summary = buildMatchMomentumSummary([
    match({ id: 'd1', score: '0 - 2', result: 'L', xGFor: 0.5, xGAgainst: 0 }),
  ]);

  assert.ok(summary);
  assert.ok(summary.pointsDelta > -2.5);
  assert.ok(summary.defensiveDelta <= -2);
  assert.match(summary.verdictTitle, /Conceding More Than Expected/);
  assert.match(summary.verdictDetail, /goalkeeper form and set-piece marking/);
});

test('buildMatchMomentumSummary reports a hot finishing streak when goals outrun xG', () => {
  const summary = buildMatchMomentumSummary([
    match({ id: 'h1', score: '3 - 1', result: 'W', xGFor: 0.8, xGAgainst: 1.2 }),
  ]);

  assert.ok(summary);
  assert.ok(summary.finishingDelta >= 2);
  assert.match(summary.verdictTitle, /Hot Finishing Streak/);
  assert.match(summary.verdictDetail, /1 xG-tracked matches/);
});

test('buildSeasonChronicle splits seasons on the July boundary and reads ISO dates', () => {
  const chronicle = buildSeasonChronicle([
    match({ id: 's1', date: '14/08/2025', score: '2 - 0', result: 'W' }),
    match({ id: 's2', date: '10/01/2026', score: '1 - 1', result: 'D' }),
    match({ id: 's3', date: '14/08/2026', score: '3 - 2', result: 'W', competition: 'Croky Cup' }),
    match({ id: 's4', date: '2026-09-01', score: '0 - 1', result: 'L' }),
    match({ id: 's5', date: '2027-02-01', score: '2 - 0', result: 'W' }),
    match({ id: 's6', date: 'not-a-date', score: '4 - 0', result: 'W' }),
  ]);

  const byLabel = Object.fromEntries(chronicle.map((entry) => [entry.seasonLabel, entry]));
  assert.deepEqual(Object.keys(byLabel).sort(), ['2025/26', '2026/27', 'Current Season']);
  assert.equal(byLabel['2025/26'].played, 2);
  assert.equal(byLabel['2025/26'].wins, 1);
  assert.equal(byLabel['2025/26'].draws, 1);
  assert.equal(byLabel['2026/27'].played, 3);
  assert.equal(byLabel['2026/27'].wins, 2);
  assert.equal(byLabel['2026/27'].losses, 1);
  assert.equal(byLabel['2026/27'].cupMatches, 1);
  assert.equal(byLabel['Current Season'].played, 1);

  const labels = chronicle.map((entry) => entry.seasonLabel);
  assert.ok(labels.indexOf('2026/27') < labels.indexOf('2025/26'));
});

test('buildSeasonChronicle treats unreadable scorelines as 0-0 and an empty log as no seasons', () => {
  const [entry] = buildSeasonChronicle([
    match({ id: 'b1', score: 'not a score', result: 'D' }),
  ]);
  assert.equal(entry.goalsFor, 0);
  assert.equal(entry.goalsAgainst, 0);
  assert.equal(entry.cleanSheets, 1);
  assert.equal(entry.biggestWin, null);
  assert.deepEqual(buildSeasonChronicle([]), []);
});
