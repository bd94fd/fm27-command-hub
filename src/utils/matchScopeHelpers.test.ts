import assert from 'node:assert/strict';
import test from 'node:test';
import type { MatchLogEntry } from '../types/fm27.ts';
import {
  classifyMatchCompetitionBucket,
  classifyMatchEntryBucket,
  deriveFootballSeasonLabel,
  extractMatchSeasons,
  formatBucketCompactSummary,
  formatCompetitionBucketTag,
  formatSignedCurrency,
  matchesEntryCompetitionFilter,
  parseScoreGoals,
  summarizeMatchesByScope,
} from './matchScopeHelpers.ts';

function makeMatch(overrides: Partial<MatchLogEntry>): MatchLogEntry {
  return {
    id: 'm1',
    eventNumber: 1,
    date: '15/09/2027',
    opponent: 'Club Brugge',
    venue: 'H',
    competition: 'Challenger Pro League',
    score: '2-1',
    result: 'W',
    xGFor: 1.85,
    xGAgainst: 0.9,
    possession: 52,
    shotsFor: '14 (6)',
    shotsAgainst: '8 (3)',
    cccFor: 2,
    cccAgainst: 1,
    passCompletion: 84,
    goalTimeline: '',
    potm: 'Test Player',
    defensiveWatchpoints: '',
    tacticalAudit: '',
    ...overrides,
  };
}

test('deriveFootballSeasonLabel handles European July 1 boundary for DMY and ISO dates', () => {
  assert.equal(deriveFootballSeasonLabel('11/08/2027'), '2027/28');
  assert.equal(deriveFootballSeasonLabel('30/06/2027'), '2026/27');
  assert.equal(deriveFootballSeasonLabel('2027-07-01'), '2027/28');
  assert.equal(deriveFootballSeasonLabel('2027-05-15'), '2026/27');
  assert.equal(deriveFootballSeasonLabel('invalid'), 'Unknown Season');
});

test('classifyMatchCompetitionBucket separates league, cup, and friendly/non-competitive matches strictly', () => {
  assert.equal(classifyMatchCompetitionBucket('Challenger Pro League'), 'league');
  assert.equal(classifyMatchCompetitionBucket('Croky Cup'), 'cup');
  assert.equal(classifyMatchCompetitionBucket('UEFA Champions League'), 'cup');
  assert.equal(classifyMatchCompetitionBucket('Club Friendly'), 'friendly');
  assert.equal(classifyMatchCompetitionBucket('Oefenwedstrijd'), 'friendly');
  assert.equal(classifyMatchCompetitionBucket('U21 Reserve League'), 'friendly');
  assert.equal(classifyMatchCompetitionBucket('League / Cup'), 'friendly');
  assert.equal(classifyMatchCompetitionBucket('Unclassified Match'), 'friendly');
  assert.equal(classifyMatchCompetitionBucket(''), 'friendly');
});

test('classifyMatchEntryBucket reclassifies impossible multi-loss single-elim domestic cups as friendlies while preserving group-stage cups', () => {
  const suspiciousCup = [
    makeMatch({ id: 'c1', date: '12/07/2027', competition: 'Domestic Cup', result: 'L' }),
    makeMatch({ id: 'c2', date: '19/07/2027', competition: 'Domestic Cup', result: 'L' }),
    makeMatch({ id: 'c3', date: '26/07/2027', competition: 'Domestic Cup', result: 'W' }),
  ];
  assert.equal(classifyMatchEntryBucket(suspiciousCup[0], suspiciousCup), 'friendly');
  assert.equal(
    matchesEntryCompetitionFilter(suspiciousCup[0], 'competitive', suspiciousCup),
    false
  );

  // Champions League league phase allows 2+ losses and must remain cup
  const ucl = [
    makeMatch({ id: 'u1', date: '17/09/2027', competition: 'Champions League', result: 'L' }),
    makeMatch({ id: 'u2', date: '01/10/2027', competition: 'Champions League', result: 'L' }),
  ];
  assert.equal(classifyMatchEntryBucket(ucl[0], ucl), 'cup');
});

test('summarizeMatchesByScope and extractMatchSeasons keep seasons and friendlies strictly isolated', () => {
  const matches: MatchLogEntry[] = [
    makeMatch({ id: '1', date: '10/07/2027', competition: 'Friendly', score: '5-0', result: 'W', xGFor: 3.5, xGAgainst: 0.2 }),
    makeMatch({ id: '2', date: '18/08/2027', competition: 'Challenger Pro League', score: '2-1', result: 'W', xGFor: 1.8, xGAgainst: 0.9 }),
    makeMatch({ id: '3', date: '04/09/2027', competition: 'Croky Cup', score: '1-1', result: 'D', xGFor: 1.1, xGAgainst: 1.0 }),
    makeMatch({ id: '4', date: '10/05/2027', competition: 'Challenger Pro League', score: '0-2', result: 'L', xGFor: 0.6, xGAgainst: 2.1 }),
  ];

  const { seasons, currentSeason } = extractMatchSeasons(matches, '15/09/2027');
  assert.deepEqual(seasons, ['2027/28', '2026/27']);
  assert.equal(currentSeason, '2027/28');

  const scope = summarizeMatchesByScope(matches, '2027/28');
  assert.equal(scope.league.played, 1);
  assert.equal(scope.cup.played, 1);
  assert.equal(scope.friendly.played, 1);
  assert.equal(scope.competitive.played, 2);
  assert.equal(scope.competitive.points, 4);
  assert.equal(scope.competitive.xgFor, 2.9);
  assert.equal(scope.competitive.xgAgainst, 1.9);
  assert.equal(scope.competitive.xgDiff, 1.0);

  assert.equal(formatCompetitionBucketTag('league'), 'LGE');
  assert.equal(formatCompetitionBucketTag('cup'), 'CUP');
  assert.equal(formatCompetitionBucketTag('friendly'), 'FRD');
  assert.deepEqual(parseScoreGoals('3-2'), [3, 2]);
  assert.equal(formatSignedCurrency(-103), '-£103');
  assert.equal(formatSignedCurrency(0), '£0');
  assert.match(formatBucketCompactSummary(scope.competitive), /2 GP \(1W-1D-0L, 3:2\)/);
});
