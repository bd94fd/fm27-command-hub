import assert from 'node:assert/strict';
import test from 'node:test';
import type { MatchLogEntry, PlayerRecord } from '../types/fm27.ts';
import {
  buildDeepJourneyReport,
  buildSaveCacheKey,
  createSaveHistoryPoint,
  diffSaveHistoryPoints,
  getSaveCacheStats,
  listSaveHistoryPoints,
} from './saveCache.ts';

function makePlayer(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id: 'p1',
    uid: 1001,
    number: 9,
    name: 'Sam Peeters',
    age: 21,
    position: 'STC',
    ability: 3.0,
    potential: 4.5,
    wagePw: 500,
    expires: '30/06/2028',
    marketValue: 200_000,
    nation: 'Belgium',
    personality: 'Balanced',
    status: 'Starter',
    ipRole: 'Channel Forward',
    oopRole: 'Pressing Centre Forward',
    condition: 95,
    morale: 'Good',
    apps: '10',
    minutes: 850,
    goals: 6,
    xG: 5.1,
    xGPer90: 0.54,
    assists: 2,
    xA: 1.8,
    xAPer90: 0.19,
    drbPer90: 1.9,
    prPassesPer90: 2.2,
    hdrPct: 45,
    intPer90: 0.4,
    tckPct: 50,
    rating: 7.2,
    notes: '',
    attributes: {
      pace: 15,
      acceleration: 15,
      stamina: 14,
      jumpingReach: 13,
      determination: 14,
      passing: 12,
      finishing: 14,
      tackling: 8,
      firstTouch: 13,
      decisions: 13,
      workRate: 14,
      offTheBall: 14,
    },
    ...overrides,
  };
}

function makeMatch(overrides: Partial<MatchLogEntry> = {}): MatchLogEntry {
  return {
    id: 'm1',
    eventNumber: 1,
    date: '20/08/2027',
    opponent: 'RWDM',
    venue: 'H',
    competition: 'Challenger Pro League',
    score: '2-1',
    result: 'W',
    xGFor: 1.9,
    xGAgainst: 0.8,
    possession: 54,
    shotsFor: '14 (6)',
    shotsAgainst: '7 (3)',
    cccFor: 2,
    cccAgainst: 1,
    passCompletion: 83,
    goalTimeline: '',
    potm: 'Sam Peeters',
    defensiveWatchpoints: '',
    tacticalAudit: '',
    ...overrides,
  };
}

test('buildSaveCacheKey produces deterministic lowercase cache keys', () => {
  assert.equal(buildSaveCacheKey('Zelzate S2.fm', '14/03/2027'), 'zelzate_s2.fm::14_03_2027');
  assert.equal(buildSaveCacheKey('   ', ''), 'save::unknown');
});

test('createSaveHistoryPoint and diffSaveHistoryPoints detect risers, fallers, newgens, departures, and contract changes', () => {
  const prevPoint = createSaveHistoryPoint({
    saveName: 'zelzate.fm',
    inGameDate: '01/09/2027',
    clubName: 'KVV Zelzate',
    balance: '£250K',
    balanceNum: 250_000,
    leaguePosition: 6,
    played: 5,
    won: 2,
    drawn: 2,
    lost: 1,
    points: 8,
    players: [
      makePlayer({ uid: 1001, name: 'Riser Kid', ability: 2.5, wagePw: 400, expires: '30/06/2028' }),
      makePlayer({ uid: 1002, name: 'Veteran', age: 31, ability: 3.5, wagePw: 1000 }),
      makePlayer({ uid: 1003, name: 'Sold Striker', ability: 3.0, wagePw: 900 }),
    ],
  });

  const currPoint = createSaveHistoryPoint({
    saveName: 'zelzate.fm',
    inGameDate: '01/12/2027',
    clubName: 'KVV Zelzate',
    balance: '£400K',
    balanceNum: 400_000,
    leaguePosition: 2,
    played: 15,
    won: 10,
    drawn: 3,
    lost: 2,
    points: 33,
    players: [
      makePlayer({ uid: 1001, name: 'Riser Kid', ability: 3.25, wagePw: 700, expires: '30/06/2030', goals: 11 }),
      makePlayer({ uid: 1002, name: 'Veteran', age: 31, ability: 3.0, wagePw: 1000 }),
      makePlayer({ uid: 1004, name: 'Youth Intake Star', age: 16, ability: 2.0, potential: 5.0, wagePw: 100 }),
    ],
  });

  const diff = diffSaveHistoryPoints(prevPoint, currPoint);
  assert.equal(diff.risers.length, 1);
  assert.equal(diff.risers[0].name, 'Riser Kid');
  assert.equal(diff.risers[0].abilityDelta, 0.75);

  assert.equal(diff.fallers.length, 1);
  assert.equal(diff.fallers[0].name, 'Veteran');
  assert.equal(diff.fallers[0].abilityDelta, -0.5);

  assert.equal(diff.newgens.length, 1);
  assert.equal(diff.newgens[0].name, 'Youth Intake Star');

  assert.equal(diff.departed.length, 1);
  assert.equal(diff.departed[0].name, 'Sold Striker');

  assert.equal(diff.contractChanges.length, 1);
  assert.equal(diff.contractChanges[0].wageDeltaPw, 300);
  assert.equal(diff.kpiDeltas.fromLeaguePosition, 6);
  assert.equal(diff.kpiDeltas.toLeaguePosition, 2);
});

test('buildDeepJourneyReport isolates competitive matches from friendlies and contains zero raw CA/PA', () => {
  const prev = createSaveHistoryPoint({
    saveName: 'zelzate.fm',
    inGameDate: '01/09/2027',
    clubName: 'KVV Zelzate',
    balanceNum: 200_000,
    leaguePosition: 5,
    played: 4,
    points: 7,
    players: [makePlayer({ uid: 1001, goals: 2, minutes: 360, rating: 7.0 })],
    matches: [
      makeMatch({ id: 'f1', date: '15/07/2027', competition: 'Friendly', xGFor: 4.0, xGAgainst: 0.1 }),
      makeMatch({ id: 'l1', date: '20/08/2027', competition: 'Challenger Pro League', xGFor: 1.5, xGAgainst: 1.0 }),
    ],
  });

  const curr = createSaveHistoryPoint({
    saveName: 'zelzate.fm',
    inGameDate: '01/11/2027',
    clubName: 'KVV Zelzate',
    balanceNum: 350_000,
    leaguePosition: 2,
    played: 10,
    points: 22,
    players: [makePlayer({ uid: 1001, goals: 8, minutes: 900, rating: 7.5 })],
    matches: [
      makeMatch({ id: 'f1', date: '15/07/2027', competition: 'Friendly', xGFor: 4.0, xGAgainst: 0.1 }),
      makeMatch({ id: 'l1', date: '20/08/2027', competition: 'Challenger Pro League', xGFor: 1.5, xGAgainst: 1.0 }),
      makeMatch({ id: 'l2', date: '12/10/2027', competition: 'Challenger Pro League', xGFor: 2.2, xGAgainst: 0.7 }),
    ],
  });

  const report = buildDeepJourneyReport(prev, curr, [prev, curr]);
  assert.equal(report.sameSeason, true);
  assert.equal(report.fromSeason, '2027/28');
  assert.equal(report.competitionComparison.competitive.to?.played, 2);
  assert.equal(report.competitionComparison.friendly.to?.played, 1);
  assert.equal(report.competitionComparison.competitive.to?.xgFor, 3.7);
  assert.equal(report.playerStatDeltas[0].goalsDelta, 6);

  const serializedAi = JSON.stringify(report.aiPayload);
  assert.equal(/"currentAbility"|"potentialAbility"|"rawCa"|"rawPa"/i.test(serializedAi), false);
});

test('IndexedDB helpers degrade safely in Node/non-IDB environments', async () => {
  const list = await listSaveHistoryPoints();
  assert.deepEqual(list, []);
  const stats = await getSaveCacheStats();
  assert.equal(stats.indexedDbAvailable, false);
  assert.equal(stats.snapshotPointsCount, 0);
});
