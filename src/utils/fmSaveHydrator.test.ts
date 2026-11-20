import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hydrateAppFromDecodedFmSave,
  DecodedFmSavePayload,
} from './fmSaveHydrator';
import { SQUAD_PLAYERS } from '../data/squadData';
import { COMPETITIVE_MATCH_LOGS } from '../data/matchAndTacticsData';

test('hydrateAppFromDecodedFmSave updates squad stats/attributes, logs new matches, and builds forward plan context from exact in-game date', () => {
  const sampleDecoded: DecodedFmSavePayload = {
    meta: {
      game: 'FM27',
      build: '27.1.0',
      knownBuild: true,
      saveName: 'KVV_Zelzate_MD5.fm',
      gameDateIso: '2027-09-19',
      gameDateDmy: '19/09/2027',
      clubUid: 4165,
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      balance: -710000,
      fmsaveVersion: '0.14.1',
    },
    players: [
      {
        uid: 1001,
        name: 'Mbey Epolo',
        position: 'ST (C)',
        age: 26,
        ca: 92,
        pa: 104,
        condition: 94,
        sharpness: 98,
        wagePw: 650,
        expires: '30/06/2029',
        onLoan: false,
        teamSlot: 0,
        apps: '5',
        minutes: 401,
        rating: 7.42,
        goals: 5,
        xG: 5.15,
        xGPer90: 1.16,
        assists: 1,
        xA: 0.25,
        xAPer90: 0.06,
        drbPer90: 0.45,
        prPassesPer90: 1.3,
        hdrPct: 48,
        intPer90: 0.3,
        tckPct: 0,
        distanceKm: 52.4,
        yellowCards: 1,
        redCards: 0,
        attributes: {
          pace: 13,
          acceleration: 12,
          stamina: 13,
          jumpingReach: 13,
          determination: 16,
          passing: 8,
          finishing: 14,
          tackling: 1,
          firstTouch: 14,
          decisions: 10,
          workRate: 8,
          offTheBall: 8,
        },
        hiddenPersonality: {
          professionalism: 14,
          ambition: 13,
          pressure: 12,
          temperament: 13,
          loyalty: 11,
        },
        suspensionsCount: 0,
      },
      {
        uid: 1002,
        name: 'Matteo Polizzi',
        position: 'M/AM (RL)',
        age: 22,
        ca: 88,
        pa: 112,
        condition: 96,
        sharpness: 95,
        wagePw: 500,
        expires: '30/06/2030',
        onLoan: false,
        teamSlot: 0,
        apps: '2 (3)',
        minutes: 293,
        rating: 7.18,
        goals: 0,
        xG: 0.42,
        xGPer90: 0.13,
        assists: 2,
        xA: 0.54,
        xAPer90: 0.17,
        drbPer90: 1.1,
        prPassesPer90: 5.8,
        hdrPct: 45,
        intPer90: 1.5,
        tckPct: 78,
        distanceKm: 36.1,
        yellowCards: 0,
        redCards: 0,
        attributes: {
          pace: 11,
          acceleration: 11,
          stamina: 9,
          jumpingReach: 12,
          determination: 7,
          passing: 11,
          finishing: 10,
          tackling: 9,
          firstTouch: 11,
          decisions: 9,
          workRate: 9,
          offTheBall: 10,
        },
        hiddenPersonality: null,
        suspensionsCount: 0,
      },
    ],
    playedMatches: [
      {
        dateIso: '2027-09-18',
        dateDmy: '18/09/2027',
        competition: '1e Nationale VV',
        opponent: 'Jong Cercle',
        venue: 'A',
        result: 'W',
        score: '2 - 0',
        xGFor: 1.88,
        xGAgainst: 0.41,
        possession: 44,
        passCompletion: 85,
        shotsFor: '13 (6)',
        shotsAgainst: '6 (1)',
        cccFor: 3,
        cccAgainst: 0,
        distanceKm: 112.4,
      },
    ],
    upcomingFixtures: [
      {
        dateIso: '2027-10-02',
        dateDmy: '02/10/2027',
        competition: '1e Nationale VV',
        opponent: 'KFC Dessel Sport',
        venue: 'H',
      },
    ],
    leagueStanding: {
      competitionName: '1e Nationale VV',
      position: 3,
      totalTeams: 16,
      played: 5,
      won: 3,
      drawn: 0,
      lost: 2,
      goalsFor: 8,
      goalsAgainst: 5,
      goalDiff: 3,
      points: 9,
      nextOpponentStanding: {
        clubName: 'KFC Dessel Sport',
        position: 8,
        points: 7,
        played: 5,
        goalDiff: 0,
      },
      top5: [
        { pos: 1, club: 'Royal Knokke FC', played: 5, pts: 13, gd: 7 },
        { pos: 2, club: 'KVK Tienen', played: 5, pts: 10, gd: 4 },
        { pos: 3, club: 'KVV Zelzate', played: 5, pts: 9, gd: 3 },
      ],
    },
    finances: {
      month: '2027-09-01',
      balance: -710000,
      wagePayrollWeekly: 9707,
      wageBudgetWeekly: 10203,
      transferBudgetRemaining: 0,
    },
    activeInjuries: [],
    tactics: [
      {
        index: 0,
        name: '4-3-3 Counter Positive',
        styleName: 'Fluid Counter-Attack',
        mentality: 'Positive',
      },
    ],
    mentoring: [
      {
        groupNumber: 1,
        label: 'Group 1',
        members: ['Quinten Boudry', 'Matteo Polizzi', 'Tijs Temmerman'],
      },
    ],
  };

  const hydrated = hydrateAppFromDecodedFmSave(
    sampleDecoded,
    SQUAD_PLAYERS,
    COMPETITIVE_MATCH_LOGS
  );

  // Save date & live KPIs updated
  assert.equal(hydrated.saveDateLabel, '19/09/2027');
  assert.match(hydrated.nextFixtureLabel || '', /02\/10\/2027 vs KFC Dessel Sport/);
  assert.match(hydrated.leagueRecordLabel || '', /5 GP .* 9 Pts/);
  assert.match(hydrated.leagueStandingLabel || '', /#3 of 16 .* \+3 GD/);
  assert.match(hydrated.squadOutputLabel || '', /5 Gls \(5\.57 xG\)/);
  assert.match(hydrated.tacticHeadlineLabel || '', /4-3-3 Counter Positive/);
  assert.match(hydrated.wageComplianceLabel || '', /£9,707 \/ £10,203 p\/w/);

  // Squad stats & attributes updated
  const epolo = hydrated.updatedSquad.find((p) => p.name === 'Mbey Epolo');
  assert.equal(epolo?.goals, 5);
  assert.equal(epolo?.attributes.finishing, 14);
  assert.match(epolo?.notes || '', /FM Save CA 92\/PA 104/);

  const polizzi = hydrated.updatedSquad.find((p) => p.name === 'Matteo Polizzi');
  assert.equal(polizzi?.attributes.determination, 7);

  // New match logged automatically
  assert.equal(hydrated.newMatchesCount, 1);
  assert.equal(hydrated.updatedMatches[0].opponent, 'Jong Cercle');
  assert.equal(hydrated.updatedMatches[0].score, '2 - 0');
  assert.equal(hydrated.updatedMatches[0].xGFor, 1.88);

  // Analyst prompt context carries exact date, upcoming fixture, and diffs
  assert.match(hydrated.analystPromptContext, /EXACT CURRENT IN-GAME DATE: 19\/09\/2027/);
  assert.match(hydrated.analystPromptContext, /KFC Dessel Sport/);
  assert.match(hydrated.analystPromptContext, /Mbey Epolo/);
});

test('hydrateAppFromDecodedFmSave handles non-contract players with null expires without crashing table render', () => {
  const payloadWithNullExpiry: DecodedFmSavePayload = {
    meta: {
      game: 'FM27',
      build: '27.1.0',
      knownBuild: true,
      saveName: 'auto save.fm',
      gameDateIso: '2027-09-19',
      gameDateDmy: '19/09/2027',
      clubUid: 4165,
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      balance: -700000,
      fmsaveVersion: '0.14.1',
    },
    players: [
      {
        uid: 9999,
        name: 'Lucas Youth Trialist',
        position: 'AM (C)',
        age: 17,
        ca: 62,
        pa: 118,
        condition: 100,
        sharpness: 80,
        wagePw: 0,
        expires: null,
        onLoan: false,
        teamSlot: 0,
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
        distanceKm: 0,
        yellowCards: 0,
        redCards: 0,
        attributes: null,
        hiddenPersonality: null,
        suspensionsCount: 0,
      },
    ],
    playedMatches: [],
    upcomingFixtures: [],
    leagueStanding: null,
    finances: null,
    activeInjuries: [],
    tactics: [],
    mentoring: [],
  };

  const hydrated = hydrateAppFromDecodedFmSave(
    payloadWithNullExpiry,
    SQUAD_PLAYERS,
    COMPETITIVE_MATCH_LOGS
  );
  const trialist = hydrated.updatedSquad.find(
    (p) => p.name === 'Lucas Youth Trialist'
  );
  assert.ok(trialist);
  assert.equal(trialist.expires, 'N/A');
  assert.equal(trialist.expires.slice(-4), 'N/A');
});
