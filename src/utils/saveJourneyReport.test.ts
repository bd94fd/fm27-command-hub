import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildDeepJourneyReport, diffSaveHistoryPoints } from './saveJourneyReport.ts';
import {
  buildDeepJourneyReport as reexportedReport,
  diffSaveHistoryPoints as reexportedDiff,
} from '../services/saveCache.ts';
import type { SaveHistoryPoint } from '../services/saveCache';
import type { MatchLogEntry } from '../types/fm27';

const player = (over: Record<string, unknown> = {}) => ({
  uid: 1,
  name: 'Bram Verhaegen',
  position: 'MC',
  age: 24,
  ability: 3.5,
  potential: 4.0,
  marketValue: 250000,
  wagePw: 750,
  expires: '30/06/2028',
  squadStatus: 'Starter',
  rating: 7.1,
  goals: 3,
  assists: 2,
  minutes: 900,
  xG: 2.4,
  xA: 1.8,
  ...over,
});

const bucket = (over: Record<string, unknown> = {}) => ({
  played: 12,
  won: 7,
  drawn: 3,
  lost: 2,
  goalsFor: 22,
  goalsAgainst: 14,
  points: 24,
  xgMatchesCount: 12,
  xgFor: 21.4,
  xgAgainst: 16.2,
  xgDiff: 5.2,
  ...over,
});

const breakdown = (over: Record<string, unknown> = {}) => ({
  all: bucket(),
  league: bucket({ played: 10, won: 6, drawn: 3, lost: 1, goalsFor: 19, goalsAgainst: 11, points: 21, xgMatchesCount: 10, xgFor: 18.1, xgAgainst: 13.4, xgDiff: 4.7 }),
  cup: bucket({ played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1, points: 3, xgMatchesCount: 1, xgFor: 1.9, xgAgainst: 1.4, xgDiff: 0.5 }),
  friendly: bucket({ played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 1, goalsAgainst: 2, points: 0, xgMatchesCount: 1, xgFor: 1.4, xgAgainst: 1.4, xgDiff: 0 }),
  competitive: bucket({ played: 11, won: 7, drawn: 3, lost: 1, goalsFor: 21, goalsAgainst: 12, points: 24, xgMatchesCount: 11, xgFor: 20, xgAgainst: 14.8, xgDiff: 5.2 }),
  ...over,
});

const snap = (over: Record<string, unknown> = {}): SaveHistoryPoint =>
  ({
    cacheKey: 'zelzate.fm::2027-11-15',
    saveName: 'zelzate.fm',
    inGameDate: '15/11/2027',
    seasonLabel: '2027/28',
    clubName: 'KVV Zelzate',
    capturedAt: '2027-11-15T10:00:00.000Z',
    balance: '£1,240,000',
    balanceNum: 1240000,
    monthlyBurnRate: 42000,
    wagePayrollWeekly: 18500,
    wageBudgetWeekly: 21000,
    leaguePosition: 4,
    played: 10,
    won: 6,
    drawn: 3,
    lost: 1,
    points: 21,
    goalsFor: 19,
    goalsAgainst: 11,
    xgFor: 18.1,
    xgAgainst: 13.4,
    competitionBreakdown: breakdown(),
    tacticName: '4-3-3 Counter',
    tacticFormation: '4-3-3 DM Wide',
    tacticMentality: 'Positive',
    activeInjuriesCount: 2,
    activeSuspensionsCount: 0,
    promisesAtRiskCount: 1,
    managerExpires: '30/06/2029',
    boardGrade: 'B',
    supporterGrade: 'C+',
    players: [
      player(),
      player({ uid: 2, name: 'René Vanden Borre', position: 'GK', age: 23, ability: 4.0, potential: 4.5, wagePw: 0, goals: 0, assists: 0, minutes: 810, rating: 6.8 }),
    ],
    ...over,
  }) as SaveHistoryPoint;

const previousPoint = (over: Record<string, unknown> = {}) =>
  snap({
    cacheKey: 'a',
    inGameDate: '01/10/2027',
    capturedAt: '2027-10-01T10:00:00.000Z',
    balance: '£900,000',
    balanceNum: 900000,
    leaguePosition: 9,
    points: 12,
    played: 8,
    won: 3,
    drawn: 3,
    lost: 2,
    players: [
      player({ ability: 3.2, potential: 3.9, wagePw: 700, goals: 1, assists: 1, minutes: 500, rating: 6.6 }),
      player({ uid: 3, name: 'Sold Player', position: 'ST', age: 29, ability: 3.1, wagePw: 900, expires: '30/06/2027' }),
    ],
    ...over,
  });

const liveMatches: MatchLogEntry[] = [
  { id: 'm1', eventNumber: 1, date: '12/11/2027', competition: 'Challenger Pro League', opponent: 'RWDM', venue: 'H', result: 'W', score: '2-1', xGFor: 2.1, xGAgainst: 0.9, source: 'FM_SAVE' },
  { id: 'm2', eventNumber: 2, date: '05/11/2027', competition: 'Friendly', opponent: 'Test FC', venue: 'H', result: 'L', score: '0-2', source: 'FM_SAVE' },
] as MatchLogEntry[];

const legacyBreakdown = () =>
  breakdown({
    cup: bucket({ played: 5, won: 0, drawn: 0, lost: 5, goalsFor: 2, goalsAgainst: 9, points: 0, xgMatchesCount: 5, xgFor: 4.1, xgAgainst: 8.2, xgDiff: -4.1 }),
    friendly: bucket({ played: 2, won: 1, drawn: 0, lost: 1, goalsFor: 3, goalsAgainst: 3, points: 3, xgMatchesCount: 2, xgFor: 2.8, xgAgainst: 2.6, xgDiff: 0.2 }),
  });

const cases: Record<string, () => unknown> = {
  sameSeasonGrowth: () => buildDeepJourneyReport(previousPoint(), snap(), [previousPoint(), snap()], liveMatches),
  crossSeason: () =>
    buildDeepJourneyReport(
      snap({ cacheKey: 'a', inGameDate: '20/05/2027', seasonLabel: '2026/27', capturedAt: '2027-05-20T10:00:00.000Z', leaguePosition: 12, points: 40, played: 34, won: 10, drawn: 10, lost: 14 }),
      snap(),
      [
        snap({ cacheKey: 'a', inGameDate: '20/05/2027', seasonLabel: '2026/27', capturedAt: '2027-05-20T10:00:00.000Z', leaguePosition: 12, points: 40, played: 34, won: 10, drawn: 10, lost: 14 }),
        snap(),
      ]
    ),
  unknownSeason: () =>
    buildDeepJourneyReport(
      snap({ cacheKey: 'a', seasonLabel: 'Unknown Season', inGameDate: '2027-06-30', capturedAt: '2027-06-30T10:00:00.000Z' }),
      snap({ cacheKey: 'b', seasonLabel: 'Unknown Season' })
    ),
  legacyCupSanitised: () =>
    buildDeepJourneyReport(
      snap({ cacheKey: 'a', inGameDate: '01/10/2027', capturedAt: '2027-10-01T10:00:00.000Z', competitionBreakdown: legacyBreakdown() }),
      snap({ cacheKey: 'b', competitionBreakdown: legacyBreakdown() }),
      [
        snap({ cacheKey: 'a', inGameDate: '01/10/2027', capturedAt: '2027-10-01T10:00:00.000Z', competitionBreakdown: legacyBreakdown() }),
        snap({ cacheKey: 'b', competitionBreakdown: legacyBreakdown() }),
      ]
    ),
  sparseFields: () =>
    buildDeepJourneyReport(
      snap({ cacheKey: 'a', inGameDate: '01/10/2027', capturedAt: '2027-10-01T10:00:00.000Z', balance: undefined, balanceNum: undefined, leaguePosition: undefined, played: null, points: null, wagePayrollWeekly: null, competitionBreakdown: null, tacticName: null, boardGrade: null, supporterGrade: null, managerExpires: null, players: [] }),
      snap({ cacheKey: 'b', balance: undefined, balanceNum: undefined, leaguePosition: null, played: null, points: null, wagePayrollWeekly: null, competitionBreakdown: null, players: [player({ wagePw: 0, rating: null, goals: undefined, assists: undefined, minutes: undefined })] })
    ),
  unknownWages: () =>
    buildDeepJourneyReport(
      snap({ cacheKey: 'a', inGameDate: '01/10/2027', capturedAt: '2027-10-01T10:00:00.000Z', players: [player({ wagePw: 0 }), player({ uid: 4, name: 'No Wage', wagePw: 0, ability: 2.9 })] }),
      snap({ cacheKey: 'b', players: [player({ wagePw: 800 }), player({ uid: 4, name: 'No Wage', wagePw: 0, ability: 3.1 })] }),
      [
        snap({ cacheKey: 'a', inGameDate: '01/10/2027', capturedAt: '2027-10-01T10:00:00.000Z', players: [player({ wagePw: 0 }), player({ uid: 4, name: 'No Wage', wagePw: 0, ability: 2.9 })] }),
        snap({ cacheKey: 'b', players: [player({ wagePw: 800 }), player({ uid: 4, name: 'No Wage', wagePw: 0, ability: 3.1 })] }),
      ]
    ),
  otherClubSnapshots: () =>
    buildDeepJourneyReport(
      snap({ cacheKey: 'a', inGameDate: '01/10/2027', capturedAt: '2027-10-01T10:00:00.000Z' }),
      snap({ cacheKey: 'b' }),
      [
        snap({ cacheKey: 'c', clubName: 'Club Brugge', inGameDate: '10/10/2027', capturedAt: '2027-10-10T10:00:00.000Z' }),
        snap({ cacheKey: 'b' }),
        snap({ cacheKey: 'a', inGameDate: '01/10/2027', capturedAt: '2027-10-01T10:00:00.000Z' }),
      ]
    ),
  diffOnly: () =>
    diffSaveHistoryPoints(
      snap({
        cacheKey: 'a',
        inGameDate: '01/10/2027',
        capturedAt: '2027-10-01T10:00:00.000Z',
        players: [
          player({ ability: 3.2, wagePw: 700, expires: '30/06/2027' }),
          player({ uid: 9, name: 'Leaving', position: 'DL', age: 31, ability: 2.8, wagePw: 1100 }),
        ],
      }),
      snap()
    ),
};

test('the whole journey report output is unchanged by the move', () => {
  const text = Object.entries(cases)
    .map(([name, build]) => `${name}\n${JSON.stringify(build())}`)
    .join('\n');
  assert.equal(Buffer.byteLength(text, 'utf8'), 69_463);
  assert.equal(createHash('sha256').update(text).digest('hex'), 'f9cac7c8cdcb59fa8e4e3b519fcfc4b4a3dceab65298a9a89fbc85f9327a9662');
});

test('saveCache still serves the same functions', () => {
  assert.equal(reexportedReport, buildDeepJourneyReport);
  assert.equal(reexportedDiff, diffSaveHistoryPoints);
});

test('a same-season pair reports climb, PPG, xG, balance and player deltas', () => {
  const report = buildDeepJourneyReport(previousPoint(), snap(), [previousPoint(), snap()], liveMatches);
  assert.equal(report.sameSeason, true);
  assert.equal(report.fromSeason, '2027/28');
  assert.deepEqual(
    report.improved.slice(0, 2).map((item) => item.title),
    ['Climbed 5 league places (2027/28)', 'League PPG pace accelerated']
  );
  assert.ok(report.improved.some((item) => item.title === 'Club bank balance improved'));
  assert.ok(report.worsened.every((item) => item.title !== 'Cross-season comparison'));
  const stat = report.playerStatDeltas.find((row) => row.uid === 1);
  assert.deepEqual(stat && { goals: stat.goalsDelta, assists: stat.assistsDelta, minutes: stat.minutesDelta }, { goals: 2, assists: 1, minutes: 400 });
  assert.equal(report.playerStatDeltas.some((row) => row.uid === 3), false);
});

test('a cross-season pair notes the reset and drops player season totals', () => {
  const report = buildDeepJourneyReport(
    snap({ cacheKey: 'a', inGameDate: '20/05/2027', seasonLabel: '2026/27', capturedAt: '2027-05-20T10:00:00.000Z', leaguePosition: 12, points: 40, played: 34 }),
    snap(),
    [],
    []
  );
  assert.equal(report.sameSeason, false);
  assert.equal(report.playerStatDeltas.length, 0);
  const note = report.thingsToNote.find((item) => item.title.startsWith('Cross-season comparison'));
  assert.ok(note);
  assert.equal(note?.deltaLabel, '2026/27 → 2027/28');
});

test('an unknown season label is compared as the same season', () => {
  const report = buildDeepJourneyReport(
    snap({ cacheKey: 'a', seasonLabel: 'Unknown Season', inGameDate: '2027-06-30', capturedAt: '2027-06-30T10:00:00.000Z' }),
    snap({ cacheKey: 'b', seasonLabel: 'Unknown Season' }),
    [],
    []
  );
  assert.equal(report.sameSeason, true);
  assert.equal(report.thingsToNote.some((item) => item.title.startsWith('Cross-season comparison')), false);
});

test('a cached breakdown with impossible cup losses is moved into friendlies', () => {
  const report = buildDeepJourneyReport(
    snap({ cacheKey: 'a', inGameDate: '01/10/2027', capturedAt: '2027-10-01T10:00:00.000Z', competitionBreakdown: legacyBreakdown() }),
    snap({ cacheKey: 'b', competitionBreakdown: legacyBreakdown() }),
    [],
    []
  );
  assert.equal(report.competitionComparison.from?.cup.played, 0);
  assert.equal(report.competitionComparison.from?.friendly.played, 7);
  assert.equal(report.competitionComparison.from?.friendly.lost, 6);
  assert.equal(report.competitionComparison.from?.friendly.points, 3);
});

test('live matches replace a stale cached breakdown for the current point', () => {
  const report = buildDeepJourneyReport(
    snap({ cacheKey: 'a', inGameDate: '01/10/2027', capturedAt: '2027-10-01T10:00:00.000Z' }),
    snap({ cacheKey: 'b' }),
    [],
    liveMatches
  );
  assert.equal(report.competitionComparison.to?.league.played, 1);
  assert.equal(report.competitionComparison.to?.friendly.played, 1);
  assert.equal(report.competitionComparison.to?.cup.played, 0);
});

test('a live save with no matches played keeps the cached breakdown', () => {
  const report = buildDeepJourneyReport(snap({ cacheKey: 'a' }), snap({ cacheKey: 'b' }), [], []);
  assert.equal(report.competitionComparison.to?.league.played, 10);
});

test('the timeline keeps only this club and sorts by date', () => {
  const report = buildDeepJourneyReport(previousPoint(), snap({ cacheKey: 'b' }), [
    snap({ cacheKey: 'c', clubName: 'Club Brugge', inGameDate: '10/10/2027', capturedAt: '2027-10-10T10:00:00.000Z' }),
    snap({ cacheKey: 'b' }),
    previousPoint(),
  ]);
  assert.deepEqual(
    report.timeline.map((point) => point.inGameDate),
    ['01/10/2027', '15/11/2027']
  );
  assert.deepEqual(
    report.timeline.map((point) => point.ppg),
    [1.5, 2.1]
  );
});

test('a save with no league table or finances reports gaps, not zeros', () => {
  const report = buildDeepJourneyReport(
    snap({ cacheKey: 'a', inGameDate: '01/10/2027', capturedAt: '2027-10-01T10:00:00.000Z', balance: undefined, balanceNum: undefined, leaguePosition: undefined, played: null, points: null, wagePayrollWeekly: null, competitionBreakdown: null, players: [] }),
    snap({ cacheKey: 'b', balance: undefined, balanceNum: undefined, leaguePosition: null, played: null, points: null, wagePayrollWeekly: null, competitionBreakdown: null, players: [] })
  );
  assert.equal(report.improved.length, 0);
  assert.equal(report.worsened.length, 0);
  assert.equal(report.timeline[1].ppg, null);
  assert.equal(report.timeline[1].balanceNum, null);
  assert.equal(report.timeline[1].leaguePosition, null);
  assert.equal(report.competitionComparison.to, null);
  assert.equal(report.aiPayload.leagueTableSnapshot instanceof Object, true);
});

test('players whose wage did not decode are counted, not zeroed', () => {
  const report = buildDeepJourneyReport(
    snap({ cacheKey: 'a', inGameDate: '01/10/2027', capturedAt: '2027-10-01T10:00:00.000Z', players: [player({ wagePw: 0 }), player({ uid: 4, name: 'No Wage', wagePw: 0, ability: 2.9 })] }),
    snap({ cacheKey: 'b', players: [player({ wagePw: 800 }), player({ uid: 4, name: 'No Wage', wagePw: 0, ability: 3.1 })] }),
    [],
    []
  );
  assert.equal(report.baseDiff.kpiDeltas.fromWageMissingCount, 2);
  assert.equal(report.baseDiff.kpiDeltas.toWageMissingCount, 1);
  assert.equal(report.baseDiff.kpiDeltas.fromTotalWagePw, 0);
  assert.equal(report.baseDiff.kpiDeltas.toTotalWagePw, 800);
});

test('the report never carries raw CA or PA numbers', () => {
  const text = JSON.stringify(buildDeepJourneyReport(previousPoint(), snap(), [previousPoint(), snap()], liveMatches));
  assert.equal(/"c\s*a"\s*:/.test(text), false);
  assert.equal(/"p\s*a"\s*:/i.test(text), false);
  assert.equal(/currentAbility|potentialAbility/.test(text), false);
});

test('the diff lists departures, newgens and contract changes', () => {
  const diff = diffSaveHistoryPoints(previousPoint(), snap());
  assert.deepEqual(diff.departed.map((row) => row.name), ['Sold Player']);
  assert.deepEqual(diff.newgens.map((row) => row.name), ['René Vanden Borre']);
  assert.deepEqual(
    diff.contractChanges.map((row) => [row.name, row.previousExpires, row.currentExpires, row.wageDeltaPw]),
    [['Bram Verhaegen', '30/06/2028', '30/06/2028', 50]]
  );
});
