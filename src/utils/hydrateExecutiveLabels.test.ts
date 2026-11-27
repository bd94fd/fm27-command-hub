import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExecutiveLabels } from './hydrateExecutiveLabels.ts';
import type { DecodedFmSavePayload } from './fmSaveHydrator';
import type { MatchLogEntry, PlayerRecord } from '../types/fm27';

const decodedWith = (extra: Record<string, unknown> = {}) =>
  ({
    meta: {},
    players: [],
    playedMatches: [],
    upcomingFixtures: [],
    leagueStanding: null,
    tactics: [],
    activeInjuries: [],
    mentoring: [],
    ...extra,
  }) as unknown as DecodedFmSavePayload;

const player = (over: Partial<PlayerRecord> & { name: string }): PlayerRecord =>
  ({
    id: `p-${over.name}`,
    number: 1,
    position: 'ST',
    apps: '0',
    minutes: 0,
    rating: null,
    goals: 0,
    xG: 0,
    xGPer90: 0,
    assists: 0,
    xA: 0,
    xAPer90: 0,
    drbPer90: 0,
    prPassesPer90: 0,
    hdrPct: 0,
    intPer90: 0,
    tckPct: 0,
    personality: 'Balanced',
    age: 24,
    ability: 3,
    potential: 4,
    expires: '30/06/2029',
    nation: 'England',
    wagePw: 10000,
    status: 'Starter',
    attributes: {
      pace: 12,
      acceleration: 12,
      stamina: 12,
      jumpingReach: 12,
      determination: 12,
      passing: 12,
      finishing: 12,
      tackling: 12,
      firstTouch: 12,
      decisions: 12,
      workRate: 12,
      offTheBall: 12,
    },
    ipRole: 'Advanced Forward',
    oopRole: 'Press Forward',
    notes: '',
    ...over,
  });

const table = (over: Record<string, unknown> = {}) => ({
  competitionName: 'Test League',
  position: 2,
  totalTeams: 18,
  played: 10,
  won: 7,
  drawn: 2,
  lost: 1,
  goalsFor: 20,
  goalsAgainst: 8,
  goalDiff: 12,
  points: 23,
  nextOpponentStanding: null,
  top5: [],
  ...over,
});

const leagueMatch = (over: Partial<MatchLogEntry> = {}): MatchLogEntry =>
  ({
    id: 'm1',
    eventNumber: 1,
    date: '02/10/2027',
    competition: 'League',
    opponent: 'Opponent',
    venue: 'H',
    result: 'W',
    score: '2 - 1',
    xGFor: 1.5,
    xGAgainst: 0.5,
    ...over,
  }) as MatchLogEntry;

const labels = (decoded: DecodedFmSavePayload, squad: PlayerRecord[] = [], matches: MatchLogEntry[] = []) =>
  buildExecutiveLabels({ decoded, finalSquad: squad, updatedMatches: matches });

test('the save date prefers the day-month-year label, then the ISO date, then a fallback', () => {
  assert.equal(labels(decodedWith({ meta: { gameDateDmy: '08/11/2027', gameDateIso: '2027-11-08' } })).saveDateLabel, '08/11/2027');
  assert.equal(labels(decodedWith({ meta: { gameDateDmy: null, gameDateIso: '2027-11-08' } })).saveDateLabel, '2027-11-08');
  assert.equal(labels(decodedWith({ meta: {} })).saveDateLabel, 'Live .fm Save');
});

test('the next fixture names the opponent, venue and known league position', () => {
  const withStanding = labels(
    decodedWith({
      upcomingFixtures: [
        { dateDmy: '15/11/2027', dateIso: '2027-11-15', opponent: 'Rival FC', venue: 'H' },
      ],
      leagueStanding: table({
        nextOpponentStanding: { clubName: 'Rival FC', position: 5, points: 30, played: 10, goalDiff: 4 },
      }),
    })
  );
  assert.equal(withStanding.nextFixtureLabel, '15/11/2027 vs Rival FC (Home — #5 (30 Pts))');

  const away = labels(
    decodedWith({
      upcomingFixtures: [
        { dateDmy: null, dateIso: '2027-11-20', opponent: 'Away FC', venue: 'A' },
      ],
    })
  );
  assert.equal(away.nextFixtureLabel, '2027-11-20 vs Away FC (Away)');

  assert.equal(labels(decodedWith()).nextFixtureLabel, null);
});

test('a league table gives the record and standing, with a signed goal difference', () => {
  const positive = labels(decodedWith({ leagueStanding: table() }));
  assert.equal(positive.leagueRecordLabel, '10 GP · 7W-2D-1L · 23 Pts');
  assert.equal(positive.leagueStandingLabel, '#2 of 18 (20 GF / 8 GA · +12 GD)');

  const negative = labels(decodedWith({ leagueStanding: table({ goalDiff: -4 }) }));
  assert.equal(negative.leagueStandingLabel, '#2 of 18 (20 GF / 8 GA · -4 GD)');
});

test('with no league table the labels say so instead of showing zeros as fact', () => {
  const result = labels(decodedWith());
  assert.equal(result.leagueRecordLabel, '0 GP · Pre-Season');
  assert.equal(result.leagueStandingLabel, 'No league table yet — 0 competitive matches played');
});

test('an empty squad leaves the squad output labels blank', () => {
  const result = labels(decodedWith());
  assert.equal(result.squadOutputLabel, null);
  assert.equal(result.squadOutputSubLabel, null);
});

test('per-player xG and xA are shown when the squad carries them', () => {
  const result = labels(decodedWith(), [
    player({ name: 'Adam Striker', goals: 12, xG: 10.4, assists: 3, xA: 2.1, minutes: 1600, rating: 7.4 }),
    player({ name: 'Ben Winger', goals: 5, xG: 4.2, assists: 9, xA: 7.8, minutes: 1500, rating: 7.12 }),
  ]);
  assert.equal(result.squadOutputLabel, '17 Gls (14.60 xG) · 12 Ast (9.90 xA)');
  assert.equal(result.squadOutputSubLabel, 'Top Scorer: Adam Striker (12G) · Best Rat: Adam Striker (7.40)');
});

test('goals and assists are shown without xG when the squad has none', () => {
  const result = labels(decodedWith(), [
    player({ name: 'Ivan Poacher', goals: 9, assists: 2, minutes: 1400, rating: 7.05 }),
  ]);
  assert.equal(result.squadOutputLabel, '9 Gls · 2 Ast');
});

test('a multi-season squad falls back to the league goals for and against', () => {
  const result = labels(
    decodedWith({ leagueStanding: table({ played: 8, goalsFor: 12, goalsAgainst: 6, goalDiff: 6 }) }),
    [player({ name: 'Hank Poacher', goals: 30, minutes: 1200, rating: 7.6 })]
  );
  assert.equal(result.squadOutputLabel, '12 GF / 6 GA (+6 GD)');
  assert.equal(result.squadOutputSubLabel, 'Current Season League (8 GP · 1.50 GF/g · 0.75 GA/g)');
});

test('without player production the league xG comes from this season league matches only', () => {
  const squad = [player({ name: 'Danny Defender' })];
  const matches = [
    leagueMatch({ id: 'a', xGFor: 1.8, xGAgainst: 0.9 }),
    leagueMatch({ id: 'b', date: '09/10/2027', xGFor: 1.2, xGAgainst: 1.5 }),
    leagueMatch({ id: 'c', competition: 'FA Cup', xGFor: 3.1, xGAgainst: 0.2 }),
    leagueMatch({ id: 'd', date: '16/10/2026', xGFor: 0.4, xGAgainst: 2.2 }),
    leagueMatch({ id: 'e', xGFor: null, xGAgainst: null }),
  ];
  const result = labels(
    decodedWith({
      meta: { gameDateDmy: '08/11/2027' },
      leagueStanding: table({ played: 12, goalsFor: 18, goalsAgainst: 9, goalDiff: 9 }),
    }),
    squad,
    matches
  );
  assert.equal(result.squadOutputLabel, '18 GF / 9 GA (+9 GD)');
  assert.equal(result.squadOutputSubLabel, 'League (12 GP) · xG 3.00 For vs 2.40 Against');

  const unknownSeason = labels(
    decodedWith({ leagueStanding: table({ played: 12, goalsFor: 18, goalsAgainst: 9, goalDiff: 9 }) }),
    squad,
    matches
  );
  assert.equal(unknownSeason.squadOutputSubLabel, 'League (12 GP) · xG 3.40 For vs 4.60 Against');
});

test('without league xG the sub-label falls back to goals per game', () => {
  const result = labels(
    decodedWith({ leagueStanding: table({ played: 6, goalsFor: 5, goalsAgainst: 9, goalDiff: -4 }) }),
    [player({ name: 'Danny Defender' })],
    [leagueMatch({ xGFor: null, xGAgainst: null })]
  );
  assert.equal(result.squadOutputSubLabel, 'Current Season League (6 GP · 0.83 GF/g · 1.50 GA/g)');
});

test('a minutes-only squad still names its best rated player', () => {
  const result = labels(decodedWith(), [
    player({ name: 'Gary Centreback', minutes: 450, rating: 6.5 }),
    player({ name: 'Fred Fullback', minutes: 900, rating: null }),
  ]);
  assert.equal(result.squadOutputLabel, '0 Gls · 0 Ast');
  assert.equal(result.squadOutputSubLabel, 'Best Rat: Gary Centreback (6.50)');
});

test('a squad with no goals and no rated player says how many players it covers', () => {
  const result = labels(decodedWith(), [player({ name: 'Karl Squadfill', minutes: 700, rating: null })]);
  assert.equal(result.squadOutputSubLabel, 'Current season across 1 squad players');
});

test('a player under 90 minutes does not qualify as best rated', () => {
  const result = labels(decodedWith(), [
    player({ name: 'Late Sub', minutes: 89, rating: 9.9 }),
  ]);
  assert.equal(result.squadOutputSubLabel, 'Current season across 1 squad players');
});

test('no production and no league table reads as season not started', () => {
  const result = labels(decodedWith(), [player({ name: 'Danny Defender' }), player({ name: 'Evan Midfielder' })]);
  assert.equal(result.squadOutputLabel, '0 GP · Season Not Started');
  assert.equal(result.squadOutputSubLabel, '0 competitive matches played yet (2 players)');
});

test('a fast-sync save asks for a full sync instead of claiming nothing was played', () => {
  const result = labels(decodedWith({ meta: { fastSync: true } }), [player({ name: 'Danny Defender' })]);
  assert.equal(result.squadOutputSubLabel, 'Re-sync with Full Sync if matches have been played (1 players)');
});

test('the tactic headline uses the primary tactic, or the war room fallback', () => {
  const withTactic = labels(
    decodedWith({ tactics: [{ name: 'High Press 4-2-3-1', mentality: 'Positive' }] })
  );
  assert.equal(withTactic.tacticHeadlineLabel, 'High Press 4-2-3-1 (Positive)');

  const without = labels(decodedWith());
  assert.equal(without.tacticHeadlineLabel, 'Dual-Phase 4-3-3 (War Room)');
});

test('the injury label switches between singular and plural and counts mentoring groups', () => {
  const one = labels(
    decodedWith({
      activeInjuries: [{ playerUid: 1 }],
      mentoring: [{ groupNumber: 1 }, { groupNumber: 2 }, { groupNumber: 3 }],
    })
  );
  assert.equal(one.tacticSubLabel, '1 Active Injury · 3 Mentoring Groups');

  const none = labels(decodedWith());
  assert.equal(none.tacticSubLabel, '0 Active Injuries · 0 Mentoring Groups');

  const two = labels(decodedWith({ activeInjuries: [{ playerUid: 1 }, { playerUid: 2 }] }));
  assert.equal(two.tacticSubLabel, '2 Active Injuries · 0 Mentoring Groups');
});
