import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hydrateAppFromDecodedFmSave,
  DecodedFmSavePayload,
  WORKER_CACHE_BUSTER,
  deriveQualitativeScoutBadges,
  calculateLast5Form,
  calculateFinancialRunway,
  hydratePass0Payload,
  hydrateAndMatchSquad,
  shouldDefaultFastSync,
  formatStepTimingLabel,
} from './fmSaveHydrator';
import {
  FmImportScope,
  HydratedSquadPlayer,
  Pass0ExtractionPayload,
  PlayerAttributes,
  clampAttributeValue,
  clampConditionSharpness,
  parseFmStructuredTabExport,
} from '../types/fmSave';
import {
  buildTacticalAnalystContext,
  buildLiveTacticalAnalystContext,
} from './tacticalAnalystContext';
import fs from 'node:fs';
import path from 'node:path';
import {
  FmSaveWorkerClient,
  WORKER_INACTIVITY_TIMEOUT_MS,
  WORKER_HARD_CEILING_MS,
  formatWorkerTimeoutMessage,
  isValidSquadCheckpoint,
  buildCheckpointRecoveryWarning,
  applyCheckpointRecoveryWarning,
  type WorkerLike,
} from '../workers/fmSaveWorkerClient';
import { SQUAD_PLAYERS } from '../data/squadData';
import { COMPETITIVE_MATCH_LOGS } from '../data/matchAndTacticsData';
import {
  checkServerDecodeStatus,
  decodeFmSaveWithServerFirst,
  FmSaveProgressStage,
  SERVER_UPLOAD_CHUNK_BYTES,
  SERVER_MAX_SAVE_BYTES,
  SERVER_JOB_POLL_INTERVAL_MS,
} from '../services/fmSaveReader';

function makeFullAttributes(overrides: Partial<PlayerAttributes> = {}): PlayerAttributes {
  return {
    corners: 8,
    crossing: 10,
    dribbling: 12,
    finishing: 13,
    firstTouch: 13,
    freeKicks: 8,
    heading: 11,
    longShots: 10,
    longThrows: 6,
    marking: 6,
    passing: 11,
    penalties: 12,
    tackling: 6,
    technique: 12,
    aggression: 11,
    anticipation: 12,
    bravery: 11,
    composure: 12,
    concentration: 11,
    decisions: 11,
    determination: 15,
    flair: 11,
    leadership: 9,
    offTheBall: 13,
    positioning: 8,
    teamwork: 11,
    vision: 10,
    workRate: 12,
    acceleration: 13,
    agility: 12,
    balance: 11,
    jumpingReach: 12,
    naturalFitness: 13,
    pace: 13,
    stamina: 12,
    strength: 11,
    aerialReach: 2,
    commandOfArea: 2,
    communication: 2,
    eccentricity: 2,
    handling: 2,
    kicking: 2,
    oneOnOnes: 2,
    punching: 2,
    reflexes: 2,
    rushingOut: 2,
    throwing: 2,
    ...overrides,
  };
}

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

  // Squad stats & attributes updated, relative stars computed, and raw CA/PA NEVER exposed
  const epolo = hydrated.updatedSquad.find((p) => p.name === 'Mbey Epolo');
  assert.equal(epolo?.goals, 5);
  assert.equal(epolo?.attributes.finishing, 14);
  assert.ok((epolo?.ability ?? 0) >= 1 && (epolo?.ability ?? 0) <= 5);
  assert.doesNotMatch(epolo?.notes || '', /CA \d+|PA \d+/i);

  const polizzi = hydrated.updatedSquad.find((p) => p.name === 'Matteo Polizzi');
  assert.equal(polizzi?.attributes.determination, 7);

  // New match logged automatically
  assert.equal(hydrated.newMatchesCount, 1);
  assert.equal(hydrated.updatedMatches[0].opponent, 'Jong Cercle');
  assert.equal(hydrated.updatedMatches[0].score, '2 - 0');
  assert.equal(hydrated.updatedMatches[0].xGFor, 1.88);

  // Analyst prompt context carries exact date, upcoming fixture, diffs, and ZERO raw CA/PA numbers
  assert.match(hydrated.analystPromptContext, /EXACT CURRENT IN-GAME DATE: 19\/09\/2027/);
  assert.match(hydrated.analystPromptContext, /KFC Dessel Sport/);
  assert.match(hydrated.analystPromptContext, /Mbey Epolo/);
  assert.doesNotMatch(hydrated.analystPromptContext, /CA \d+\/PA \d+/i);
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

test('Worker cache-buster is bumped to ?v=22 and FmImportScope supports club_and_division with clamping', () => {
  assert.equal(WORKER_CACHE_BUSTER, '?v=22');

  const scope: FmImportScope = 'club_and_division';
  assert.equal(scope, 'club_and_division');

  assert.equal(clampAttributeValue(25), 20);
  assert.equal(clampAttributeValue(0), 1);
  assert.equal(clampAttributeValue(-4), 1);
  assert.equal(clampAttributeValue(14.6), 15);
  assert.equal(clampConditionSharpness(130), 100);
  assert.equal(clampConditionSharpness(-5), 0);

  const parsedRows = parseFmStructuredTabExport(
    '1001\tMbey Epolo\t26\t25\t-3\t110\t-10',
    'club_and_division'
  );
  assert.equal(parsedRows.length, 1);
  assert.equal(parsedRows[0].uid, 1001);
  assert.equal(parsedRows[0].pace, 20);
  assert.equal(parsedRows[0].stamina, 1);
  assert.equal(parsedRows[0].condition, 100);
  assert.equal(parsedRows[0].matchSharpness, 0);
});

test('Pass 0 Group 1: derives qualitative Scout Report Badges and strips raw CA/PA & hidden reliability flags', () => {
  const badges = deriveQualitativeScoutBadges({
    consistency: 15,
    importantMatches: 16,
    injuryProneness: 14,
    versatility: 11,
  });
  assert.deepEqual(badges, [
    'Consistent Performer',
    'Big-Game Player',
    'Injury-Prone',
  ]);

  const rawPayload = JSON.stringify({
    clubUid: 4165,
    squad: [
      {
        uid: 7001,
        name: 'Lars Verhaegen',
        age: 24,
        nationality: 'Belgium',
        primaryPosition: 'GK',
        secondaryPositions: [],
        wageEur: 520,
        contractExpiryMonths: 18,
        attributes: makeFullAttributes({
          aerialReach: 15,
          commandOfArea: 13,
          communication: 14,
          eccentricity: 6,
          handling: 14,
          kicking: 12,
          oneOnOnes: 13,
          punching: 9,
          reflexes: 25, // Out-of-range -> must clamp to 20
          rushingOut: 11,
          throwing: 12,
        }),
        traits: ['Uses Long Throw To Start Counter Attacks'],
        ca: 98,
        pa: 121,
        internalReliability: {
          consistency: 15,
          importantMatches: 14,
          injuryProneness: 5,
          versatility: 15,
        },
      },
    ],
    playerMatchStats: {},
    teamMatchStats: [],
    playerSeasonHistory: {},
    staff: [],
    monthlyFinances: [
      { month: '2027-07', balance: 450000, wageSpend: 42000, netCashflow: -60000 },
      { month: '2027-08', balance: 390000, wageSpend: 42000, netCashflow: -60000 },
      { month: '2027-09', balance: 330000, wageSpend: 42000, netCashflow: -60000 },
    ],
    recruitmentTargets: [],
  });

  const hydrated = hydratePass0Payload(rawPayload);
  const gk = hydrated.squad[0] as unknown as Record<string, unknown>;
  assert.equal(hydrated.squad[0].attributes.reflexes, 20);
  assert.equal(hydrated.squad[0].attributes.aerialReach, 15);
  assert.deepEqual(hydrated.squad[0].scoutBadges, [
    'Consistent Performer',
    'Big-Game Player',
    'Versatile',
  ]);
  assert.equal('internalReliability' in gk, false);
  assert.equal('ca' in gk, false);
  assert.equal('pa' in gk, false);
});

test('Pass 0 Group 2 & Group 3: calculates Last-5 Form trend and Financial Runway accurately', () => {
  const improving = calculateLast5Form([
    { date: '2027-08-10', opponent: 'A', rating: 6.4, minutes: 90, goals: 0, assists: 0 },
    { date: '2027-08-17', opponent: 'B', rating: 6.6, minutes: 90, goals: 0, assists: 0 },
    { date: '2027-08-24', opponent: 'C', rating: 7.2, minutes: 90, goals: 1, assists: 0 },
    { date: '2027-08-31', opponent: 'D', rating: 7.5, minutes: 90, goals: 1, assists: 1 },
    { date: '2027-09-07', opponent: 'E', rating: 7.8, minutes: 90, goals: 2, assists: 0 },
  ]);
  assert.equal(improving.trend, 'improving');
  assert.equal(improving.averageRating, 7.1);
  assert.equal(improving.recentRatings.length, 5);

  const declining = calculateLast5Form([
    { date: '2027-08-10', opponent: 'A', rating: 7.6, minutes: 90, goals: 1, assists: 0 },
    { date: '2027-08-17', opponent: 'B', rating: 7.4, minutes: 90, goals: 1, assists: 0 },
    { date: '2027-08-24', opponent: 'C', rating: 6.7, minutes: 90, goals: 0, assists: 0 },
    { date: '2027-08-31', opponent: 'D', rating: 6.5, minutes: 90, goals: 0, assists: 0 },
  ]);
  assert.equal(declining.trend, 'declining');

  const criticalRunway = calculateFinancialRunway([
    { month: '2027-08', balance: 200000, wageSpend: 42000, netCashflow: -100000 },
    { month: '2027-09', balance: 100000, wageSpend: 42000, netCashflow: -100000 },
  ]);
  assert.equal(criticalRunway.status, 'Critical');
  assert.equal(criticalRunway.runwayMonths, 1);
  assert.equal(criticalRunway.monthlyBurnRate, 100000);

  const warningRunway = calculateFinancialRunway([
    { month: '2027-08', balance: 500000, wageSpend: 42000, netCashflow: -100000 },
    { month: '2027-09', balance: 400000, wageSpend: 42000, netCashflow: -100000 },
  ]);
  assert.equal(warningRunway.status, 'Warning');
  assert.equal(warningRunway.runwayMonths, 4);

  const healthyRunway = calculateFinancialRunway([
    { month: '2027-08', balance: 1000000, wageSpend: 42000, netCashflow: 60000 },
  ]);
  assert.equal(healthyRunway.status, 'Healthy');
  assert.equal(healthyRunway.runwayMonths, 999);
});

test('Copilot Deep Audit: hydrateAndMatchSquad matches UID-first with normalized fallback and previews stale removals', () => {
  const baseAttrs = makeFullAttributes();

  const existing: HydratedSquadPlayer[] = [
    {
      uid: 501,
      name: 'José Martínez',
      age: 23,
      nationality: 'Spain',
      primaryPosition: 'ST',
      secondaryPositions: [],
      wageEur: 600,
      contractExpiryMonths: 14,
      attributes: baseAttrs,
      traits: [],
      scoutBadges: [],
    },
    {
      uid: 0,
      name: 'Matteo Polizzi',
      age: 22,
      nationality: 'Belgium',
      primaryPosition: 'AMR',
      secondaryPositions: [],
      wageEur: 500,
      contractExpiryMonths: 20,
      attributes: baseAttrs,
      traits: [],
      scoutBadges: [],
    },
    {
      uid: 999,
      name: 'Departed Veteran',
      age: 34,
      nationality: 'Belgium',
      primaryPosition: 'DC',
      secondaryPositions: [],
      wageEur: 700,
      contractExpiryMonths: 2,
      attributes: baseAttrs,
      traits: [],
      scoutBadges: [],
    },
  ];

  const incomingPayload: Pass0ExtractionPayload = {
    clubUid: 4165,
    squad: [
      {
        uid: 501, // UID-first match even though display name changed
        name: 'Jose Martinez (Renamed)',
        age: 24,
        nationality: 'Spain',
        primaryPosition: 'ST',
        secondaryPositions: [],
        wageEur: 650,
        contractExpiryMonths: 24,
        attributes: baseAttrs,
        traits: ['Places Shots'],
        scoutBadges: ['Consistent Performer'],
      },
      {
        uid: 502, // Matched by normalized name + primaryPosition fallback
        name: 'Matteo Polizzi',
        age: 22,
        nationality: 'Belgium',
        primaryPosition: 'AMR',
        secondaryPositions: [],
        wageEur: 520,
        contractExpiryMonths: 20,
        attributes: baseAttrs,
        traits: [],
        scoutBadges: [],
      },
      {
        uid: 503, // Brand new signing
        name: 'New Academy Graduate',
        age: 18,
        nationality: 'Belgium',
        primaryPosition: 'MC',
        secondaryPositions: [],
        wageEur: 250,
        contractExpiryMonths: 36,
        attributes: baseAttrs,
        traits: [],
        scoutBadges: ['Versatile'],
      },
    ],
    playerMatchStats: {},
    teamMatchStats: [],
    playerSeasonHistory: {},
    staff: [],
    monthlyFinances: [],
    facilities: {},
    sponsorships: [],
    transferWindows: { isOpen: false },
    competitionRules: {},
    selections: {},
    setPieces: {},
    training: {},
    jobVacancies: [],
    recruitmentTargets: [],
  };

  const diff = hydrateAndMatchSquad(existing, incomingPayload);
  assert.equal(diff.matchedCount, 2);
  assert.equal(diff.addedPlayers.length, 1);
  assert.equal(diff.addedPlayers[0].name, 'New Academy Graduate');
  assert.equal(diff.removedPlayers.length, 1);
  assert.equal(diff.removedPlayers[0].name, 'Departed Veteran');
  assert.equal(diff.hydratedSquad.length, 3);
});

test('Pass 0 Full Integration: hydrateAppFromDecodedFmSave + buildTacticalAnalystContext wire Groups 1–4 with zero raw CA/PA', () => {
  const fullPass0Decoded: DecodedFmSavePayload = {
    meta: {
      game: 'FM27',
      build: '27.1.0',
      knownBuild: true,
      saveName: 'Zelzate_Pass0.fm',
      gameDateIso: '2027-10-05',
      gameDateDmy: '05/10/2027',
      clubUid: 4165,
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      balance: 240000,
      fmsaveVersion: '0.14.1',
      importScope: 'club_and_division',
    },
    players: [
      {
        uid: 2001,
        name: 'Mbey Epolo',
        position: 'ST (C)',
        secondaryPositions: ['AM (R)'],
        age: 26,
        abilityStars: 4.0,
        potentialStars: 4.5,
        condition: 96,
        sharpness: 98,
        wagePw: 650,
        expires: '30/06/2029',
        contractExpiryMonths: 21,
        onLoan: false,
        teamSlot: 0,
        apps: '6',
        minutes: 490,
        rating: 7.45,
        goals: 6,
        xG: 5.8,
        xGPer90: 1.07,
        assists: 1,
        xA: 0.4,
        xAPer90: 0.07,
        drbPer90: 0.5,
        prPassesPer90: 1.4,
        hdrPct: 50,
        intPer90: 0.3,
        tckPct: 0,
        distanceKm: 60.1,
        yellowCards: 1,
        redCards: 0,
        attributes: {
          pace: 13,
          acceleration: 12,
          stamina: 13,
          jumpingReach: 13,
          determination: 16,
          passing: 9,
          finishing: 14,
          tackling: 3,
          firstTouch: 14,
          decisions: 11,
          workRate: 10,
          offTheBall: 13,
          aerialReach: 2,
          reflexes: 1,
        },
        traits: ['Places Shots', 'Likes To Try To Beat Offside Trap'],
        scoutBadges: ['Consistent Performer', 'Big-Game Player'],
        last5Ratings: [
          { date: '2027-09-12', opponent: 'Knokke', rating: 6.9, minutes: 90, goals: 1, assists: 0 },
          { date: '2027-09-19', opponent: 'Cercle', rating: 7.5, minutes: 90, goals: 2, assists: 0 },
          { date: '2027-09-26', opponent: 'Dessel', rating: 7.9, minutes: 90, goals: 2, assists: 1 },
        ],
        seasonHistory: [
          { season: '2026/27', club: 'KVV Zelzate', apps: 28, goals: 19, assists: 4, avgRating: 7.21 },
        ],
        hiddenPersonality: null,
        suspensionsCount: 0,
      },
    ],
    staff: [
      {
        uid: 8001,
        name: 'Pieter De Vries',
        age: 41,
        role: 'Assistant Manager',
        nation: 'Belgium',
        wagePw: 420,
        expires: '30/06/2029',
        attributes: {
          attacking: 13,
          defending: 14,
          fitness: 11,
          goalkeeping: 4,
          mental: 13,
          possession: 12,
          set_pieces: 12,
          tactical: 15,
          technical: 13,
          working_with_youngsters: 12,
          adaptability: 11,
          authority: 14,
          determination: 15,
          judging_player_ability: 14,
          judging_player_potential: 13,
          judging_staff_ability: 11,
          man_management: 13,
          motivating: 14,
          negotiating: 10,
          physiotherapy: 3,
          sports_science: 4,
          tactical_knowledge: 15,
          analysing_data: 12,
        },
      },
    ],
    playedMatches: [
      {
        dateIso: '2027-09-26',
        dateDmy: '26/09/2027',
        competition: '1e Nationale VV',
        opponent: 'KFC Dessel Sport',
        venue: 'H',
        result: 'W',
        score: '3 - 1',
        xGFor: null,
        xGAgainst: null,
        possession: null,
        passCompletion: null,
        shotsFor: '-',
        shotsAgainst: '-',
        cccFor: 0,
        cccAgainst: 0,
        distanceKm: 0,
      },
    ],
    teamMatchStats: [
      {
        matchId: 'm-1',
        date: '2027-09-26',
        opponent: 'KFC Dessel Sport',
        isHome: true,
        goalsFor: 3,
        goalsAgainst: 1,
        xgFor: 2.34,
        xgAgainst: 0.72,
        shots: 16,
        shotsOnTarget: 8,
        possession: 54,
        passCompletion: 86,
      },
    ],
    upcomingFixtures: [],
    leagueStanding: null,
    finances: {
      month: '2027-10-01',
      balance: 240000,
      wagePayrollWeekly: 9200,
      wageBudgetWeekly: 10200,
      transferBudgetRemaining: 25000,
    },
    monthlyFinances: [
      { month: '2027-08', balance: 300000, wageSpend: 40000, netCashflow: -60000 },
      { month: '2027-09', balance: 240000, wageSpend: 40000, netCashflow: -60000 },
    ],
    facilities: {
      training: 10,
      youth: 9,
      youthRecruitment: 11,
      juniorCoaching: 10,
      stadiumCapacity: 3500,
    },
    transferWindows: {
      isOpen: false,
      startDate: '2028-01-01',
      endDate: '2028-01-31',
    },
    jobVacancies: [{ role: 'Head of Youth Development', club: 'KVV Zelzate' }],
    recruitmentTargets: [
      {
        uid: 9101,
        name: 'Bram Peeters',
        age: 23,
        nationality: 'Belgium',
        primaryPosition: 'DL',
        currentClub: 'Free Agent',
        isFreeAgent: true,
        contractExpiryMonths: 0,
        demandedWageEur: 450,
        scoutBadges: ['Consistent Performer'],
        attributes: { pace: 14, tackling: 13, crossing: 12 },
      },
    ],
    activeInjuries: [],
    tactics: [],
    mentoring: [],
  };

  const hydrated = hydrateAppFromDecodedFmSave(fullPass0Decoded, SQUAD_PLAYERS, []);
  assert.equal(hydrated.updatedSquad.length, 1);
  assert.deepEqual(hydrated.updatedSquad[0].scoutBadges, [
    'Consistent Performer',
    'Big-Game Player',
  ]);
  assert.deepEqual(hydrated.updatedSquad[0].traits, [
    'Places Shots',
    'Likes To Try To Beat Offside Trap',
  ]);
  assert.equal(hydrated.updatedSquad[0].last5Form?.trend, 'improving');
  assert.equal(hydrated.updatedSquad[0].seasonHistory?.length, 1);
  assert.equal(hydrated.updatedMatches[0].xGFor, 2.34);
  assert.equal(hydrated.updatedMatches[0].possession, 54);
  assert.equal(hydrated.financialRunway?.status, 'Warning');
  assert.equal(hydrated.financialRunway?.runwayMonths, 4);
  assert.equal(hydrated.recruitmentTargets.length, 1);
  assert.equal(hydrated.updatedStaff.length, 1);
  assert.match(hydrated.analystPromptContext, /Financial Runway: Warning/i);
  assert.match(hydrated.analystPromptContext, /Bram Peeters/);
  assert.match(hydrated.analystPromptContext, /Head of Youth Development/);
  assert.doesNotMatch(hydrated.analystPromptContext, /\bCA\s*\d+|\bPA\s*\d+/i);

  const pass0Context = buildTacticalAnalystContext({
    clubUid: 4165,
    squad: [
      {
        uid: 2001,
        name: 'Mbey Epolo',
        age: 26,
        nationality: 'Belgium',
        primaryPosition: 'ST',
        secondaryPositions: ['AMR'],
        wageEur: 650,
        contractExpiryMonths: 21,
        attributes: makeFullAttributes({ finishing: 14, pace: 13, determination: 16 }),
        traits: ['Places Shots'],
        scoutBadges: ['Consistent Performer', 'Big-Game Player'],
      },
    ],
    playerMatchStats: {
      2001: [
        { date: '2027-09-12', opponent: 'Knokke', rating: 6.9, minutes: 90, goals: 1, assists: 0 },
        { date: '2027-09-19', opponent: 'Cercle', rating: 7.5, minutes: 90, goals: 2, assists: 0 },
        { date: '2027-09-26', opponent: 'Dessel', rating: 7.9, minutes: 90, goals: 2, assists: 1 },
      ],
    },
    teamMatchStats: fullPass0Decoded.teamMatchStats || [],
    playerSeasonHistory: {},
    staff: [],
    monthlyFinances: fullPass0Decoded.monthlyFinances || [],
    facilities: fullPass0Decoded.facilities || {},
    sponsorships: [],
    transferWindows: fullPass0Decoded.transferWindows || { isOpen: false },
    competitionRules: {},
    selections: {},
    setPieces: {},
    training: {},
    jobVacancies: fullPass0Decoded.jobVacancies || [],
    recruitmentTargets: fullPass0Decoded.recruitmentTargets || [],
  });
  assert.match(pass0Context, /Financial Runway Status: Warning \(4 months remaining/);
  assert.match(pass0Context, /Consistent Performer, Big-Game Player/);
  assert.match(pass0Context, /Places Shots/);
  assert.doesNotMatch(pass0Context, /\bCA\s*\d+|\bPA\s*\d+/i);
});

test('Pass 1 Tier-1: hydrates contracts, structured suspensions, full league table, division benchmarks, and registration rules with zero CA/PA', () => {
  const pass1Decoded: DecodedFmSavePayload = {
    meta: {
      game: 'FM27',
      build: '27.1.0',
      knownBuild: true,
      saveName: 'Zelzate_Pass1.fm',
      gameDateIso: '2027-10-12',
      gameDateDmy: '12/10/2027',
      clubUid: 4165,
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      balance: -520000,
      fmsaveVersion: '0.14.1',
      importScope: 'club_and_division',
    },
    players: [
      {
        uid: 3001,
        name: 'Quinten Boudry',
        position: 'D (C)',
        age: 27,
        abilityStars: 4.0,
        potentialStars: 4.0,
        condition: 95,
        sharpness: 96,
        wagePw: 480,
        expires: '30/06/2028',
        contractExpiryMonths: 8,
        onLoan: false,
        teamSlot: 0,
        apps: '7',
        minutes: 630,
        rating: 7.31,
        goals: 1,
        xG: 0.7,
        xGPer90: 0.1,
        assists: 0,
        xA: 0.1,
        xAPer90: 0.01,
        drbPer90: 0.2,
        prPassesPer90: 3.8,
        hdrPct: 76,
        intPer90: 2.3,
        tckPct: 84,
        distanceKm: 70.5,
        yellowCards: 5,
        redCards: 1,
        attributes: {
          pace: 11,
          acceleration: 11,
          stamina: 13,
          jumpingReach: 15,
          determination: 16,
          passing: 11,
          finishing: 6,
          tackling: 14,
          firstTouch: 11,
          decisions: 13,
          workRate: 13,
          offTheBall: 8,
        },
        hiddenPersonality: null,
        suspensionsCount: 1,
        contractDetails: {
          promisedPlayingTime: 'Important Player',
          optionalExtensionYears: 1,
          releaseClauses: [
            { type: 'Minimum Fee Release Clause', amount: 250000 },
            { type: 'Relegation Release Clause', amount: 75000 },
          ],
          bonuses: {
            appearanceFee: 45,
            cleanSheetBonus: 60,
          },
          loanWageContributionPct: null,
        },
        activeSuspensions: [
          {
            playerUid: 3001,
            playerName: 'Quinten Boudry',
            matchesRemaining: 2,
            competitionName: '1e Nationale VV',
            reason: 'Straight Red Card',
            scope: 'league',
          },
        ],
      },
    ],
    activeSuspensions: [
      {
        playerUid: 3001,
        playerName: 'Quinten Boudry',
        matchesRemaining: 2,
        competitionName: '1e Nationale VV',
        reason: 'Straight Red Card',
        scope: 'league',
      },
    ],
    playedMatches: [],
    upcomingFixtures: [
      {
        dateIso: '2027-10-16',
        dateDmy: '16/10/2027',
        competition: '1e Nationale VV',
        opponent: 'Royal Knokke FC',
        venue: 'H',
      },
    ],
    leagueStanding: {
      competitionName: '1e Nationale VV',
      position: 4,
      totalTeams: 16,
      played: 7,
      won: 4,
      drawn: 1,
      lost: 2,
      goalsFor: 12,
      goalsAgainst: 7,
      goalDiff: 5,
      points: 13,
      nextOpponentStanding: null,
      top5: [
        { pos: 1, club: 'Royal Knokke FC', played: 7, pts: 18, gd: 10 },
        { pos: 4, club: 'KVV Zelzate', played: 7, pts: 13, gd: 5 },
      ],
      rows: [
        { position: 1, clubUid: 101, clubName: 'Royal Knokke FC', played: 7, won: 6, drawn: 0, lost: 1, goalsFor: 16, goalsAgainst: 6, goalDifference: 10, points: 18, form: ['W', 'W', 'W'] },
        { position: 2, clubUid: 102, clubName: 'KVK Tienen', played: 7, won: 5, drawn: 1, lost: 1, goalsFor: 14, goalsAgainst: 7, goalDifference: 7, points: 16, form: ['W', 'D', 'W'] },
        { position: 3, clubUid: 103, clubName: 'KFC Dessel Sport', played: 7, won: 4, drawn: 2, lost: 1, goalsFor: 11, goalsAgainst: 6, goalDifference: 5, points: 14, form: ['D', 'W', 'W'] },
        { position: 4, clubUid: 4165, clubName: 'KVV Zelzate', played: 7, won: 4, drawn: 1, lost: 2, goalsFor: 12, goalsAgainst: 7, goalDifference: 5, points: 13, form: ['W', 'L', 'W'] },
        { position: 16, clubUid: 116, clubName: 'KSC Lokeren B', played: 7, won: 1, drawn: 1, lost: 5, goalsFor: 4, goalsAgainst: 14, goalDifference: -10, points: 4, form: ['L', 'L', 'D'] },
      ],
    },
    divisionBenchmarks: {
      competitionName: '1e Nationale VV',
      scope: 'club_and_division',
      clubCount: 16,
      byPositionGroup: {
        GK: { sampleSize: 32, medianWeeklyWage: 320, medianAttributes: { reflexes: 12, handling: 11 } },
        DEF: { sampleSize: 110, medianWeeklyWage: 350, medianAttributes: { pace: 12, tackling: 13, passing: 10, jumpingReach: 13 } },
        MID: { sampleSize: 115, medianWeeklyWage: 370, medianAttributes: { passing: 12, stamina: 12, workRate: 12 } },
        FWD: { sampleSize: 55, medianWeeklyWage: 410, medianAttributes: { pace: 13, finishing: 13, offTheBall: 13 } },
      },
    },
    competitionRules: {
      competitionName: '1e Nationale VV',
      maxSquadSize: 25,
      minHomegrownClub: 4,
      minHomegrownNation: 8,
      maxForeignPlayers: 5,
      u21Exempt: true,
      matchdaySubsLimit: 5,
    },
    finances: {
      month: '2027-10-01',
      balance: -520000,
      wagePayrollWeekly: 9600,
      wageBudgetWeekly: 10200,
      transferBudgetRemaining: 0,
    },
    activeInjuries: [],
    tactics: [
      {
        index: 0,
        name: '4-3-3 Counter Positive',
        styleName: 'Fluid Counter-Attack',
        mentality: 'Positive',
        inPossessionFormation: '4-3-3 DM Wide',
        outOfPossessionFormation: '4-1-4-1',
        slots: [
          { slotIndex: 0, position: 'GK', ipRole: 'Ball-Playing Goalkeeper', oopRole: 'Sweeper Keeper' },
          { slotIndex: 1, position: 'D (C)', ipRole: 'Centre-Back', oopRole: 'Stopping Centre-Back' },
        ],
      },
    ],
    mentoring: [],
  };

  const hydrated = hydrateAppFromDecodedFmSave(pass1Decoded, SQUAD_PLAYERS, []);

  // Contract details & active suspensions hydrated onto PlayerRecord
  const boudry = hydrated.updatedSquad.find((p) => p.name === 'Quinten Boudry');
  assert.ok(boudry);
  assert.equal(boudry.contractDetails?.promisedPlayingTime, 'Important Player');
  assert.equal(boudry.contractDetails?.optionalExtensionYears, 1);
  assert.equal(boudry.contractDetails?.releaseClauses.length, 2);
  assert.equal(boudry.contractDetails?.releaseClauses[0].amount, 250000);
  assert.equal(boudry.activeSuspensions?.length, 1);
  assert.equal(boudry.activeSuspensions?.[0].matchesRemaining, 2);

  // HydratedSaveState exposes Tier-1 fields
  assert.equal(hydrated.activeSuspensions.length, 1);
  assert.equal(hydrated.decodedPayload.leagueStanding?.rows?.length, 5);
  assert.equal(hydrated.divisionBenchmarks?.clubCount, 16);
  assert.equal(hydrated.competitionRules?.maxSquadSize, 25);
  assert.equal(hydrated.competitionRules?.matchdaySubsLimit, 5);

  // Analyst prompt context includes Tier-1 warnings and zero raw CA/PA
  assert.match(hydrated.analystPromptContext, /BANNED|SUSPENDED/i);
  assert.match(hydrated.analystPromptContext, /Quinten Boudry/);
  assert.match(hydrated.analystPromptContext, /Important Player|Club Option|250/i);
  assert.match(hydrated.analystPromptContext, /Max Squad 25|Registration|Subs 5/i);
  assert.doesNotMatch(hydrated.analystPromptContext, /\bCA\s*\d+|\bPA\s*\d+/i);

  // Live tactical analyst context propagates suspensions, clauses, rules, full table, and division benchmarks
  const liveCtx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: hydrated.saveDateLabel,
    nextFixture: hydrated.nextFixtureLabel || 'TBD',
    leagueStandingSub: hydrated.leagueStandingLabel || '',
    wageSpend: hydrated.wageComplianceLabel || '',
    balance: hydrated.balanceLabel || '',
    players: hydrated.updatedSquad,
    matches: hydrated.updatedMatches,
    staff: hydrated.updatedStaff,
    hydratedFmSave: hydrated,
  });
  assert.match(liveCtx, /DO NOT SELECT AS STARTER/i);
  assert.match(liveCtx, /ACTIVE SUSPENSIONS/i);
  assert.match(liveCtx, /KSC Lokeren B/);
  assert.match(liveCtx, /Division Benchmarks/i);
  assert.match(liveCtx, /Competition Registration Rules/i);
  assert.doesNotMatch(liveCtx, /\bCA\s*\d+|\bPA\s*\d+/i);
});

test('Step 4/6 & Step 3/6 Watchdogs: 150s inactivity + 480s hard ceiling, detailed timeout message formatting & Fast Sync + extractionWarnings hydration', () => {
  // 1. Verify bigger-save dual watchdog limits: 150s inactivity + 480s hard ceiling
  assert.equal(WORKER_INACTIVITY_TIMEOUT_MS, 150_000);
  assert.equal(WORKER_HARD_CEILING_MS, 480_000);

  const inactivityMsg = formatWorkerTimeoutMessage(
    'inactivity',
    'Step 3/6: Competition rules (14.2s)...',
    104.4,
    90
  );
  assert.match(inactivityMsg, /90s/);
  assert.match(inactivityMsg, /Step 3\/6: Competition rules/);
  assert.match(inactivityMsg, /104s/);
  assert.match(inactivityMsg, /Fast Sync/);

  const ceilingMsg = formatWorkerTimeoutMessage(
    'ceiling',
    'Step 4/6 (3/4): Career history (299.8s)...',
    300.1,
    300
  );
  assert.match(ceilingMsg, /300s/);
  assert.match(ceilingMsg, /Step 4\/6 \(3\/4\): Career history/);
  assert.match(ceilingMsg, /Fast Sync/);

  // 2. Verify non-fatal extractionWarnings + fastSync hydration preserves full squad & bans
  const fastPayload: DecodedFmSavePayload = {
    meta: {
      game: 'FM27',
      build: '27.1.0',
      knownBuild: true,
      saveName: 'huge_save.fm',
      gameDateIso: '2027-11-18',
      gameDateDmy: '18/11/2027',
      clubUid: 4165,
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      balance: 215000,
      fmsaveVersion: '0.14.1',
      fastSync: true,
    },
    fastSync: true,
    extractionWarnings: [
      'Fast Sync: skipped player_match_stats (Last-5 match history)',
      'player_season_stats: 12s budget reached (35/47 players matched; squad & attributes intact)',
    ],
    warnings: [
      'Fast Sync: skipped player_match_stats (Last-5 match history)',
    ],
    players: [
      {
        uid: 8801,
        name: 'Quinten Boudry',
        position: 'MC, DM',
        age: 23,
        nation: 'Belgium',
        abilityStars: 4.0,
        potentialStars: 4.5,
        condition: 94,
        sharpness: 91,
        wagePw: 650,
        expires: '30/06/2029',
        onLoan: false,
        teamSlot: 0,
        apps: '11',
        minutes: 960,
        rating: 7.21,
        goals: 3,
        xG: 2.1,
        xGPer90: 0.2,
        assists: 4,
        xA: 2.8,
        xAPer90: 0.26,
        drbPer90: 1.4,
        prPassesPer90: 7.5,
        hdrPct: 62,
        intPer90: 2.3,
        tckPct: 81,
        distanceKm: 11.4,
        yellowCards: 2,
        redCards: 0,
        attributes: makeFullAttributes({ pace: 14, stamina: 16, passing: 15 }),
        scoutBadges: ['Consistent Performer'],
        activeSuspensions: [
          {
            playerUid: 8801,
            playerName: 'Quinten Boudry',
            matchesRemaining: 1,
            competitionName: 'Eerste Nationale VV',
            scope: 'league',
            reason: 'Yellow Card Accumulation',
          },
        ],
        suspensionsCount: 1,
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

  const hydrated = hydrateAppFromDecodedFmSave(fastPayload, [], []);
  assert.equal(hydrated.fastSync, true);
  assert.equal(hydrated.extractionWarnings.length, 2);
  assert.equal(hydrated.updatedSquad.length, 1);
  assert.equal(hydrated.activeSuspensions.length, 1);
  assert.match(hydrated.analystPromptContext, /FAST SYNC MODE/);
  assert.match(hydrated.analystPromptContext, /player_season_stats: 12s budget reached/);
  assert.doesNotMatch(hydrated.analystPromptContext, /\bCA\s*\d+|\bPA\s*\d+/i);
});

test('Single-Pass game_db 4-Stage Pipeline & ?v=22 Static Guardrails: all game_db reads finish before releasing game_db for Fixtures/League/SeasonStats/CareerHistory, and Checkpoints emitted', () => {
  const workerSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'public/fm-save-worker.js'),
    'utf8'
  );
  const mapperSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'public/fm-save-mapper.py'),
    'utf8'
  );
  const clientSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/workers/fmSaveWorkerClient.ts'),
    'utf8'
  );
  const readerSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/fmSaveReader.ts'),
    'utf8'
  );

  // Worker, mapper, and client cache-buster synced to ?v=22
  assert.equal(WORKER_CACHE_BUSTER, '?v=22');
  assert.match(workerSrc, /\/fm-save-mapper\.py\?v=22/);
  assert.match(mapperSrc, /MAPPER_CACHE_BUSTER\s*=\s*"\?v=22"/);
  assert.match(clientSrc, /WORKER_CACHE_BUSTER/);
  assert.match(clientSrc, /WORKER_INACTIVITY_TIMEOUT_MS\s*=\s*150_000/);
  assert.match(clientSrc, /WORKER_HARD_CEILING_MS\s*=\s*480_000/);
  assert.match(readerSrc, /type === 'checkpoint'/);

  // Progressive checkpoints emitted after every major phase
  assert.match(workerSrc, /type:\s*'checkpoint'/);
  assert.match(workerSrc, /emitCheckpoint\('stage_1_squad'\)/);
  assert.match(workerSrc, /emitCheckpoint\('stage_2_club_core'\)/);
  assert.match(workerSrc, /emitCheckpoint\('stage_3_club_ops'\)/);
  assert.match(workerSrc, /emitCheckpoint\('stage_4_fixtures_league'\)/);
  assert.match(workerSrc, /emitCheckpoint\('stage_4_player_stats'\)/);
  assert.match(mapperSrc, /def step_snapshot_payload/);
  assert.match(mapperSrc, /def step_league_table\(/);
  assert.match(mapperSrc, /def step_finalize\(/);

  // Verify exact single-pass game_db execution order in worker:
  // Stage 1 (Squad) -> Stage 2 (Finances/Staff/Tactics) -> Stage 3 (Full Sync game_db ops + Last-5 + Contracts + Market Scan & release game_db)
  // -> Stage 4 (Fixtures & League Table -> Team xG -> Season Stats -> checkpoint -> Career History LAST)
  const idxPlayers = workerSrc.indexOf('mapperModule.step_players()');
  const idxCp1 = workerSrc.indexOf("emitCheckpoint('stage_1_squad')");
  const idxFinances = workerSrc.indexOf('mapperModule.step_3_1_finances()');
  const idxStaff = workerSrc.indexOf('mapperModule.step_3_2_staff()');
  const idxTactics = workerSrc.indexOf('mapperModule.step_3_3_tactics_and_mentoring()');
  const idxCp2 = workerSrc.indexOf("emitCheckpoint('stage_2_club_core')");
  const idxFullSyncGuard = workerSrc.indexOf('if (!useFastSync)');
  const idxFacilities = workerSrc.indexOf('mapperModule.step_3_3_facilities(false)');
  const idxCompRules = workerSrc.indexOf('mapperModule.step_3_3_competition_rules(false)');
  const idxMatchStats = workerSrc.indexOf('mapperModule.step_4_2_player_match_stats(false)');
  const idxContracts = workerSrc.indexOf('mapperModule.step_4_4_contracts_and_suspensions(false)');
  const idxMarketScan = workerSrc.indexOf('mapperModule.step_3_4_market_scan_and_release_gamedb(false)');
  const idxCp3 = workerSrc.indexOf("emitCheckpoint('stage_3_club_ops')");
  const idxFixtures = workerSrc.indexOf('mapperModule.step_fixtures(true)');
  const idxLeagueTable = workerSrc.indexOf('mapperModule.step_league_table()');
  const idxCp4 = workerSrc.indexOf("emitCheckpoint('stage_4_fixtures_league')");
  const idxSeasonStats = workerSrc.indexOf('mapperModule.step_4_1_season_stats(false)');
  const idxCp5 = workerSrc.indexOf("emitCheckpoint('stage_4_player_stats')");
  const idxCareerHistory = workerSrc.indexOf('mapperModule.step_4_3_season_history(false)');
  const idxFinalize = workerSrc.indexOf('mapperModule.step_finalize()');

  const orderedIndices = [
    idxPlayers,
    idxCp1,
    idxFinances,
    idxStaff,
    idxTactics,
    idxCp2,
    idxFullSyncGuard,
    idxFacilities,
    idxCompRules,
    idxMatchStats,
    idxContracts,
    idxMarketScan,
    idxCp3,
    idxFixtures,
    idxLeagueTable,
    idxCp4,
    idxSeasonStats,
    idxCp5,
    idxCareerHistory,
    idxFinalize,
  ];
  for (let i = 0; i < orderedIndices.length; i++) {
    assert.ok(orderedIndices[i] > 0, `Expected stage marker #${i} to exist in fm-save-worker.js`);
    if (i > 0) {
      assert.ok(
        orderedIndices[i] > orderedIndices[i - 1],
        `Expected stage marker #${i} (${orderedIndices[i]}) after #${i - 1} (${orderedIndices[i - 1]})`
      );
    }
  }

  // Stage 4 yields separately between Fixtures & match results and Domestic league table
  assert.match(workerSrc, /Stage 4\/4: Fixtures & match results/);
  assert.match(workerSrc, /Stage 4\/4: Domestic league table/);
  assert.match(workerSrc, /await yieldTick\(\)/);

  // Fast Sync skips player_season_stats in mapper and mentions it in concise warning
  assert.match(mapperSrc, /def step_4_1_season_stats\(fast_sync:/);
  assert.match(mapperSrc, /Fast Sync:.*player_season_stats/);
  assert.match(mapperSrc, /import inspect/);
  assert.match(mapperSrc, /inspect\.signature/);
  assert.match(mapperSrc, /def step_3_3_tactics_and_mentoring/);
  assert.match(mapperSrc, /def step_3_3_injuries/);
  assert.match(mapperSrc, /def step_3_3_facilities/);
  assert.match(mapperSrc, /def step_3_3_competition_rules/);
  assert.match(mapperSrc, /def step_3_3_transfer_windows/);
  assert.match(mapperSrc, /def _record_fast_sync_skip_note/);
  assert.match(mapperSrc, /getattr\(p, "injuries", None\)/);
  assert.match(mapperSrc, /FINANCES_BUDGET_SEC\s*=/);
  assert.match(mapperSrc, /STAFF_BUDGET_SEC\s*=/);
  assert.match(mapperSrc, /CLUB_OPS_TABLE_BUDGET_SEC\s*=/);
  assert.match(mapperSrc, /SCOUT_BUDGET_SEC\s*=/);
  assert.match(mapperSrc, /SCOUT_MAX_CANDIDATES\s*=\s*500/);
  assert.match(mapperSrc, /SEASON_STATS_BUDGET_SEC\s*=/);
  assert.match(mapperSrc, /PLAYER_MATCH_STATS_BUDGET_SEC\s*=/);
  assert.match(mapperSrc, /SEASON_HISTORY_BUDGET_SEC\s*=/);
  assert.match(mapperSrc, /CONTRACTS_SUSPENSIONS_BUDGET_SEC\s*=/);
  assert.match(mapperSrc, /"extractionWarnings"/);
  assert.match(mapperSrc, /"stepTimingsMs"/);
  assert.match(mapperSrc, /to_display_scale/);
  assert.match(mapperSrc, /out_of_possession_position_index/);
  assert.match(mapperSrc, /"outOfPossessionPositionIndex"/);

  // Guard against global list(...) materialization on massive Step 3 & Step 4 tables
  assert.doesNotMatch(mapperSrc, /list\([^)]*save\.staff\(/);
  assert.doesNotMatch(mapperSrc, /list\([^)]*save_instance\.finances\(/);
  assert.doesNotMatch(mapperSrc, /list\([^)]*s_table/);
  assert.doesNotMatch(mapperSrc, /list\([^)]*inj_table/);
  assert.doesNotMatch(mapperSrc, /list\([^)]*fin_table/);
  assert.doesNotMatch(mapperSrc, /list\([^)]*player_match_stats/);
  assert.doesNotMatch(mapperSrc, /list\([^)]*player_season_history/);
  assert.doesNotMatch(mapperSrc, /list\([^)]*player_season_stats/);
  assert.doesNotMatch(mapperSrc, /list\([^)]*pms_table/);
  assert.doesNotMatch(mapperSrc, /list\([^)]*psh_table/);
  assert.doesNotMatch(mapperSrc, /list\([^)]*stats_table/);
  assert.doesNotMatch(mapperSrc, /list\([^)]*c_table/);
  assert.doesNotMatch(mapperSrc, /list\([^)]*susp_table/);
});

test('Progressive Checkpoint Recovery: resolves with latest valid squad checkpoint + warning on later-stage stall and hard-rejects pre-Stage-1 timeout', async () => {
  // Pure helper checks
  assert.equal(isValidSquadCheckpoint(null), false);
  assert.equal(isValidSquadCheckpoint({ players: [] }), false);
  assert.equal(isValidSquadCheckpoint({ players: [{ uid: 1, name: 'Mbey Epolo' }] }), true);

  const sampleWarning = buildCheckpointRecoveryWarning(
    'inactivity',
    'Stage 4/4: player_season_stats for 47 players (18.4s)...',
    108.4,
    'stage_3_fixtures_league',
    90
  );
  assert.match(sampleWarning, /Stage 4 \(Fixtures & Full Domestic League Table\)/);
  assert.match(sampleWarning, /player_season_stats/);
  assert.match(sampleWarning, /108\.4s/);

  const stage3CheckpointPayload: DecodedFmSavePayload = {
    meta: {
      game: 'FM27',
      build: '27.1.0',
      knownBuild: true,
      saveName: 'mobile_checkpoint.fm',
      gameDateIso: '2027-11-22',
      gameDateDmy: '22/11/2027',
      clubUid: 4165,
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      balance: 215000,
      fmsaveVersion: '0.14.1',
      fastSync: false,
    },
    players: [
      {
        uid: 8801,
        name: 'Quinten Boudry',
        position: 'D (C)',
        age: 27,
        abilityStars: 4.0,
        potentialStars: 4.0,
        condition: 95,
        sharpness: 96,
        wagePw: 480,
        expires: '30/06/2029',
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
        attributes: makeFullAttributes({ pace: 12, tackling: 14, jumpingReach: 15 }),
        scoutBadges: ['Consistent Performer'],
        suspensionsCount: 0,
      },
    ],
    playedMatches: [],
    upcomingFixtures: [],
    leagueStanding: {
      competitionName: '1e Nationale VV',
      position: 3,
      totalTeams: 16,
      played: 10,
      won: 6,
      drawn: 2,
      lost: 2,
      goalsFor: 18,
      goalsAgainst: 9,
      goalDiff: 9,
      points: 20,
      nextOpponentStanding: null,
      top5: [],
    },
    finances: {
      month: '2027-11-01',
      balance: 215000,
      wagePayrollWeekly: 9200,
      wageBudgetWeekly: 10200,
      transferBudgetRemaining: 0,
    },
    activeInjuries: [],
    tactics: [],
    mentoring: [],
    extractionWarnings: [],
    warnings: [],
    stepTimingsMs: { step_1_open: 200, step_2_players: 450, step_5_2_league_table: 120 },
  };

  const patched = applyCheckpointRecoveryWarning(stage3CheckpointPayload, sampleWarning, 108_400);
  assert.equal(patched.extractionWarnings?.length, 1);
  assert.equal(stage3CheckpointPayload.extractionWarnings?.length, 0); // original not mutated
  assert.equal(patched.stepTimingsMs?.totalDecodeMs, 108_400);

  // 1) Inactivity timeout AFTER Stage 3 checkpoint -> MUST RESOLVE with checkpoint + warning & terminate worker
  let terminatedAfterStage3 = false;
  let capturedWorkerUrl = '';
  const clientRecover = new FmSaveWorkerClient({
    inactivityTimeoutMs: 60,
    hardCeilingMs: 500,
    workerFactory: (url: string): WorkerLike => {
      capturedWorkerUrl = url;
      const fakeWorker: WorkerLike = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        terminate: () => {
          terminatedAfterStage3 = true;
        },
        postMessage: (msg: unknown) => {
          const { requestId } = msg as { requestId: number };
          queueMicrotask(() => {
            fakeWorker.onmessage?.({
              data: {
                type: 'stage',
                requestId,
                stage: 'parse',
                step: 'Stage 1/4',
                label: 'Stage 1/4: Extracting squad...',
              },
            } as MessageEvent);
            fakeWorker.onmessage?.({
              data: {
                type: 'checkpoint',
                requestId,
                stage: 'stage_3_fixtures_league',
                payload: stage3CheckpointPayload,
              },
            } as MessageEvent);
            fakeWorker.onmessage?.({
              data: {
                type: 'stage',
                requestId,
                stage: 'parse',
                step: 'Stage 4/4',
                label: 'Stage 4/4: player_season_stats for 47 players (8.2s)...',
              },
            } as MessageEvent);
            // Worker intentionally stalls here — inactivity watchdog fires at 60ms
          });
        },
      };
      return fakeWorker;
    },
  });

  const recovered = (await clientRecover.parseFmSaveFile(
    new ArrayBuffer(8)
  )) as DecodedFmSavePayload;

  assert.equal(capturedWorkerUrl, '/fm-save-worker.js?v=22');
  assert.equal(terminatedAfterStage3, true);
  assert.equal(recovered.players.length, 1);
  assert.equal(recovered.players[0].name, 'Quinten Boudry');
  assert.equal(recovered.leagueStanding?.position, 3);
  assert.ok((recovered.extractionWarnings?.length ?? 0) >= 1);
  assert.match(recovered.extractionWarnings![0], /Checkpoint recovery/);
  assert.match(recovered.extractionWarnings![0], /player_season_stats/);
  assert.match(recovered.extractionWarnings![0], /Stage 4 \(Fixtures & Full Domestic League Table\)/);
  assert.equal('ca' in (recovered.players[0] as unknown as Record<string, unknown>), false);
  assert.equal('pa' in (recovered.players[0] as unknown as Record<string, unknown>), false);

  // 2) Hard ceiling timeout AFTER Stage 1 checkpoint -> MUST RESOLVE with Stage 1 squad checkpoint
  let terminatedOnCeiling = false;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  const clientCeiling = new FmSaveWorkerClient({
    inactivityTimeoutMs: 200,
    hardCeilingMs: 90,
    workerFactory: (): WorkerLike => {
      const fakeWorker: WorkerLike = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        terminate: () => {
          terminatedOnCeiling = true;
          if (tickTimer) {
            clearInterval(tickTimer);
            tickTimer = null;
          }
        },
        postMessage: (msg: unknown) => {
          const { requestId } = msg as { requestId: number };
          queueMicrotask(() => {
            fakeWorker.onmessage?.({
              data: {
                type: 'checkpoint',
                requestId,
                stage: 'stage_1_squad',
                payload: stage3CheckpointPayload,
              },
            } as MessageEvent);
            fakeWorker.onmessage?.({
              data: {
                type: 'stage',
                requestId,
                stage: 'parse',
                step: 'Stage 4/4',
                label: 'Stage 4/4: player_match_stats (Last-5 form)...',
              },
            } as MessageEvent);
          });
        },
      };
      return fakeWorker;
    },
  });

  const ceilingRecovered = (await clientCeiling.parseFmSaveFile(
    new ArrayBuffer(8)
  )) as DecodedFmSavePayload;
  assert.equal(terminatedOnCeiling, true);
  assert.equal(ceilingRecovered.players.length, 1);
  assert.match(ceilingRecovered.extractionWarnings![0], /hard ceiling/);
  assert.match(ceilingRecovered.extractionWarnings![0], /player_match_stats/);

  // 3) Timeout BEFORE Stage 1 Squad checkpoint -> MUST HARD REJECT
  let terminatedPreStage1 = false;
  const clientPreStage1 = new FmSaveWorkerClient({
    inactivityTimeoutMs: 50,
    hardCeilingMs: 400,
    workerFactory: (): WorkerLike => {
      const fakeWorker: WorkerLike = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        terminate: () => {
          terminatedPreStage1 = true;
        },
        postMessage: (msg: unknown) => {
          const { requestId } = msg as { requestId: number };
          queueMicrotask(() => {
            fakeWorker.onmessage?.({
              data: {
                type: 'stage',
                requestId,
                stage: 'read',
                step: 'Stage 1/4',
                label: 'Stage 1/4: Opening save via zero-copy WORKERFS...',
              },
            } as MessageEvent);
            // Stalls before Stage 1 checkpoint is ever emitted
          });
        },
      };
      return fakeWorker;
    },
  });

  await assert.rejects(
    () => clientPreStage1.parseFmSaveFile(new ArrayBuffer(8)),
    /Stage 1\/4: Opening save via zero-copy WORKERFS/
  );
  assert.equal(terminatedPreStage1, true);
});

test('Full Sync Default on Mobile & Desktop + Timing Labels: shouldDefaultFastSync defaults OFF everywhere and hydrates granular stepTimingsMs + warnings safely', () => {
  // Always default to Full Sync (fastSync=false) on both mobile and desktop so 100% of data is captured
  assert.equal(shouldDefaultFastSync(320), false);
  assert.equal(shouldDefaultFastSync(390), false);
  assert.equal(shouldDefaultFastSync(767), false);
  assert.equal(shouldDefaultFastSync(768), false);
  assert.equal(shouldDefaultFastSync(1024), false);
  assert.equal(shouldDefaultFastSync(1440), false);
  assert.equal(shouldDefaultFastSync(0), false);

  // Timing label formatting for reordered Stage 1-4 keys
  assert.equal(formatStepTimingLabel('step_3_1_finances'), '2.1 Finances');
  assert.equal(formatStepTimingLabel('step_3_2_staff'), '2.2 Staff');
  assert.equal(formatStepTimingLabel('step_3_3_tactics_mentoring'), '2.3 Tactics/Mentoring');
  assert.equal(formatStepTimingLabel('step_5_fixtures'), '3.1 Fixtures');
  assert.equal(formatStepTimingLabel('step_5_2_league_table'), '3.2 League Table');
  assert.equal(formatStepTimingLabel('step_3_3_injuries'), '4.1 Global Injuries');
  assert.equal(formatStepTimingLabel('step_3_3_facilities'), '4.2 Facilities');
  assert.equal(formatStepTimingLabel('step_3_3_competition_rules'), '4.3 Comp Rules');
  assert.equal(formatStepTimingLabel('step_3_3_transfer_windows'), '4.4 Transfer Windows');
  assert.equal(formatStepTimingLabel('step_3_4_market_scan'), '4.6 Market Scan');
  assert.equal(formatStepTimingLabel('step_4_team_match_stats'), '4.7 Team Match Stats');
  assert.equal(formatStepTimingLabel('step_4_1_season_stats'), '4.8 Season Stats');
  assert.equal(formatStepTimingLabel('totalDecodeMs'), 'Total');

  // Hydration preserves stepTimingsMs and non-fatal warnings without exposing raw CA/PA
  const payloadWithTimings: DecodedFmSavePayload = {
    meta: {
      game: 'FM27',
      build: '27.1.0',
      knownBuild: true,
      saveName: 'mobile_fast_sync.fm',
      gameDateIso: '2027-11-22',
      gameDateDmy: '22/11/2027',
      clubUid: 4165,
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      balance: 185000,
      fmsaveVersion: '0.14.1',
      fastSync: true,
    },
    fastSync: true,
    extractionWarnings: [
      'Fast Sync: skipped global injuries, facilities, competition rules, transfer windows, optional club dumps, market scan, and player_season_stats / match / career history (core club data intact)',
    ],
    stepTimingsMs: {
      step_1_open: 410,
      step_2_players: 680,
      step_3_1_finances: 220,
      step_3_2_staff: 1350,
      step_3_3_tactics_mentoring: 180,
      step_5_fixtures: 310,
      step_5_2_league_table: 145,
      totalDecodeMs: 3295,
    },
    players: [],
    playedMatches: [],
    upcomingFixtures: [],
    leagueStanding: null,
    finances: null,
    activeInjuries: [],
    tactics: [],
    mentoring: [],
  };

  const hydrated = hydrateAppFromDecodedFmSave(payloadWithTimings, [], []);
  assert.equal(hydrated.fastSync, true);
  assert.equal(hydrated.stepTimingsMs.step_3_2_staff, 1350);
  assert.equal(hydrated.stepTimingsMs.totalDecodeMs, 3295);
  assert.equal(hydrated.extractionWarnings.length, 1);
  assert.match(hydrated.extractionWarnings[0], /player_season_stats/);
  assert.doesNotMatch(hydrated.analystPromptContext, /\bCA\s*\d+|\bPA\s*\d+/i);
});

test('Server-First 2 MB Chunked Upload + 1 GB Cap + Async Job Polling: slices 9.5 MB file into chunks, runs /init -> /chunk -> /finish -> /job polling with Full Sync on mobile, and enforces 1 GB limit with actual MB message', async () => {
  assert.equal(SERVER_UPLOAD_CHUNK_BYTES, 2 * 1024 * 1024);
  assert.equal(SERVER_MAX_SAVE_BYTES, 1024 * 1024 * 1024);
  assert.equal(SERVER_JOB_POLL_INTERVAL_MS, 1_200);

  const sampleServerPayload: DecodedFmSavePayload = {
    meta: {
      game: 'FM27',
      build: '27.1.0',
      knownBuild: true,
      saveName: 'KVV_Zelzate_FullSync.fm',
      gameDateIso: '2027-11-28',
      gameDateDmy: '28/11/2027',
      clubUid: 4165,
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      balance: 310000,
      fmsaveVersion: '0.14.2',
      importScope: 'managed_club_only',
      fastSync: false,
      mountMode: 'NATIVE_SERVER',
    },
    fastSync: false,
    extractionWarnings: [],
    players: [
      {
        uid: 4101,
        name: 'Mbey Epolo',
        position: 'ST (C)',
        age: 26,
        abilityStars: 4.0,
        potentialStars: 4.5,
        condition: 95,
        sharpness: 97,
        wagePw: 650,
        expires: '30/06/2029',
        onLoan: false,
        teamSlot: 0,
        apps: '12',
        minutes: 1020,
        rating: 7.48,
        goals: 11,
        xG: 9.8,
        xGPer90: 0.86,
        assists: 2,
        xA: 1.4,
        xAPer90: 0.12,
        drbPer90: 0.6,
        prPassesPer90: 1.5,
        hdrPct: 52,
        intPer90: 0.3,
        tckPct: 0,
        distanceKm: 112.0,
        yellowCards: 1,
        redCards: 0,
        attributes: makeFullAttributes({ finishing: 14, pace: 13 }),
        scoutBadges: ['Consistent Performer', 'Big-Game Player'],
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

  const mockUploadId = '11111111-2222-4333-8444-555555555555';
  const mockJobId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const chunkSizesReceived: number[] = [];
  let bytesAccumulated = 0;
  let finishPayloadReceived: Record<string, unknown> | null = null;
  let pollCount = 0;
  let browserFallbackCalled = false;
  const stages: FmSaveProgressStage[] = [];

  const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || 'GET').toUpperCase();
    const headers = (init?.headers || {}) as Record<string, string>;

    if (url === '/api/fm27/decode-status') {
      return new Response(
        JSON.stringify({
          serverDecodeAvailable: true,
          pythonVersion: '3.14.10',
          fmsaveVersion: '0.14.2',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url === '/api/fm27/decode-save/init' && method === 'POST') {
      return new Response(JSON.stringify({ uploadId: mockUploadId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === '/api/fm27/decode-save/chunk' && method === 'POST') {
      assert.equal(headers['Content-Type'], 'application/octet-stream');
      assert.equal(headers['x-fm-upload-id'], mockUploadId);
      const chunkBlob = init?.body as Blob;
      chunkSizesReceived.push(chunkBlob.size);
      bytesAccumulated += chunkBlob.size;
      return new Response(
        JSON.stringify({ ok: true, bytesReceived: bytesAccumulated }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url === '/api/fm27/decode-save/finish' && method === 'POST') {
      finishPayloadReceived = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ jobId: mockJobId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === `/api/fm27/decode-save/job/${mockJobId}` && method === 'GET') {
      pollCount += 1;
      if (pollCount === 1) {
        return new Response(
          JSON.stringify({ status: 'running', progress: 'Extracting squad & 52 attributes...' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (pollCount === 2) {
        return new Response(
          JSON.stringify({ status: 'running', progress: 'Reading fixtures, league table & match stats...' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          status: 'done',
          progress: 'Server Full Sync complete',
          payload: sampleServerPayload,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  const status = await checkServerDecodeStatus(mockFetch);
  assert.equal(status.serverDecodeAvailable, true);
  assert.equal(status.fmsaveVersion, '0.14.2');

  // 9.5 MB binary -> MUST slice into exactly 3 chunks: 4 MB, 4 MB, 1.5 MB
  const totalBytes = Math.round(9.5 * 1024 * 1024);
  const blob = new Blob([new Uint8Array(totalBytes)], {
    type: 'application/octet-stream',
  });

  const result = await decodeFmSaveWithServerFirst(
    blob,
    (stage) => stages.push(stage),
    {
      fileName: 'KVV_Zelzate_FullSync.fm',
      clubHint: 'KVV Zelzate',
      scope: 'managed_club_only',
      viewportWidth: 390, // Mobile viewport — MUST STILL use Full Sync (fastSync=false) on server!
      pollIntervalMs: 10,
    },
    {
      fetchImpl: mockFetch,
      browserFallback: async () => {
        browserFallbackCalled = true;
        throw new Error('Should not invoke browser fallback when server succeeds');
      },
    }
  );

  assert.equal(browserFallbackCalled, false);
  assert.deepEqual(chunkSizesReceived, [
    2 * 1024 * 1024,
    2 * 1024 * 1024,
    2 * 1024 * 1024,
    2 * 1024 * 1024,
    totalBytes - 8 * 1024 * 1024,
  ]);
  assert.equal(bytesAccumulated, totalBytes);
  assert.ok(finishPayloadReceived, 'Expected POST /api/fm27/decode-save/finish');
  assert.equal((finishPayloadReceived as Record<string, unknown>).uploadId, mockUploadId);
  assert.equal((finishPayloadReceived as Record<string, unknown>).filename, 'KVV_Zelzate_FullSync.fm');
  assert.equal((finishPayloadReceived as Record<string, unknown>).scope, 'club_only');
  assert.equal((finishPayloadReceived as Record<string, unknown>).fastSync, false);
  assert.equal(pollCount, 3);
  assert.ok(
    stages.some((s) => /Uploading save to server \(4\.0 \/ 9\.5 MB — 42%\)/i.test(s.label)),
    'Expected MB/% 4 MB chunk upload progress update'
  );
  assert.ok(
    stages.some((s) => /Extracting squad & 52 attributes/i.test(s.label)),
    'Expected live server job progress update during polling'
  );
  assert.equal(result.players.length, 1);
  assert.equal(result.fastSync, false);
  assert.equal('ca' in (result.players[0] as unknown as Record<string, unknown>), false);
  assert.equal('pa' in (result.players[0] as unknown as Record<string, unknown>), false);

  // Oversized save (> 1 GB / 1024 MB) rejects cleanly with actual MB in message without invoking browser fallback
  let fallbackOnOversize = false;
  const fakeOversizeBlob = {
    size: 1050 * 1024 * 1024,
    slice: () => new Blob([]),
  } as unknown as Blob;
  await assert.rejects(
    () =>
      decodeFmSaveWithServerFirst(
        fakeOversizeBlob,
        undefined,
        { fileName: 'giant_save.fm' },
        {
          fetchImpl: mockFetch,
          browserFallback: async () => {
            fallbackOnOversize = true;
            return sampleServerPayload;
          },
        }
      ),
    /1050\.0 MB.*1024 MB \(1 GB\)/
  );
  assert.equal(fallbackOnOversize, false);
});

test('Server-First Automatic Fallback: falls back seamlessly to browser Pyodide on HTTP 503 or unreachable server, while propagating invalid-file job errors', async () => {
  const fallbackPayload: DecodedFmSavePayload = {
    meta: {
      game: 'FM27',
      build: '27.1.0',
      knownBuild: true,
      saveName: 'fallback_save.fm',
      gameDateIso: '2027-11-28',
      gameDateDmy: '28/11/2027',
      clubUid: 4165,
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      balance: 200000,
      fmsaveVersion: '0.14.1',
      fastSync: true,
    },
    fastSync: true,
    players: [],
    playedMatches: [],
    upcomingFixtures: [],
    leagueStanding: null,
    finances: null,
    activeInjuries: [],
    tactics: [],
    mentoring: [],
  };

  // Case 1: Status says available, but /init returns 503 -> MUST invoke browser fallback (with mobile Fast Sync auto-enabled)
  const fallbackReceivedOptsList: Array<{ clubHint?: string; scope?: FmImportScope; fastSync?: boolean }> = [];
  const stages503: FmSaveProgressStage[] = [];
  const fetch503 = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/fm27/decode-status') {
      return new Response(JSON.stringify({ serverDecodeAvailable: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({ error: 'Native Python fmsave is not available on this server.', serverDecodeAvailable: false }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const res503 = await decodeFmSaveWithServerFirst(
    new Blob([new Uint8Array([1, 2, 3])]),
    (s) => stages503.push(s),
    {
      fileName: 'fallback_save.fm',
      scope: 'club_and_division',
      viewportWidth: 390,
      pollIntervalMs: 10,
    },
    {
      fetchImpl: fetch503,
      browserFallback: async (_file, _cb, opts) => {
        fallbackReceivedOptsList.push(opts);
        return fallbackPayload;
      },
    }
  );

  assert.equal(res503.meta.saveName, 'fallback_save.fm');
  assert.equal(fallbackReceivedOptsList.length, 1, 'Expected browser fallback to run after 503');
  assert.equal(fallbackReceivedOptsList[0].scope, 'club_and_division');
  assert.equal(fallbackReceivedOptsList[0].fastSync, false, 'Mobile browser fallback should keep Full Sync by default so all data is captured');
  assert.ok(
    stages503.some((s) => /unavailable.*switching automatically to local browser decoder/i.test(s.label)),
    'Expected browser fallback progress update'
  );

  // Case 2: Status reports serverDecodeAvailable: false -> skips /init and falls back directly
  let initAttempted = false;
  let fallbackInvoked = false;
  const fetchDisabled = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/decode-save/init')) initAttempted = true;
    return new Response(JSON.stringify({ serverDecodeAvailable: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  await decodeFmSaveWithServerFirst(
    new Blob([new Uint8Array([1, 2, 3])]),
    undefined,
    { fileName: 'disabled.fm', viewportWidth: 1440 },
    {
      fetchImpl: fetchDisabled,
      browserFallback: async (_file, _cb, opts) => {
        fallbackInvoked = true;
        assert.equal(opts.fastSync, false, 'Desktop browser fallback defaults to Full Sync');
        return fallbackPayload;
      },
    }
  );
  assert.equal(initAttempted, false);
  assert.equal(fallbackInvoked, true);

  // Case 3: Job returns { status: 'error', error: 'not a valid Football Manager (.fm) save file' } -> rejects cleanly WITHOUT triggering browser fallback
  let fallbackOnJobError = false;
  const mockUploadId = '22222222-3333-4444-8555-666666666666';
  const mockJobId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
  const fetchJobError = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/fm27/decode-status') {
      return new Response(JSON.stringify({ serverDecodeAvailable: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/fm27/decode-save/init') {
      return new Response(JSON.stringify({ uploadId: mockUploadId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/fm27/decode-save/chunk') {
      return new Response(JSON.stringify({ ok: true, bytesReceived: 3 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/fm27/decode-save/finish') {
      return new Response(JSON.stringify({ jobId: mockJobId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === `/api/fm27/decode-save/job/${mockJobId}`) {
      return new Response(
        JSON.stringify({
          status: 'error',
          error: 'This file is not a valid Football Manager (.fm) save file.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  await assert.rejects(
    () =>
      decodeFmSaveWithServerFirst(
        new Blob([new Uint8Array([0, 1, 2])]),
        undefined,
        { fileName: 'not-a-save.txt', pollIntervalMs: 10 },
        {
          fetchImpl: fetchJobError,
          browserFallback: async () => {
            fallbackOnJobError = true;
            return fallbackPayload;
          },
        }
      ),
    /not a valid Football Manager/i
  );
  assert.equal(fallbackOnJobError, false);
});

test('Server Chunked Decode Guardrails: Express server/routes/fmDecodeRoutes.ts (/init, /chunk, /finish, /job), public/fm-save-mapper.py CLI stderr progress, and zero new npm packages', () => {
  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  const decodeRouterSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'server/routes/fmDecodeRoutes.ts'),
    'utf8'
  );
  const mapperSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'public/fm-save-mapper.py'),
    'utf8'
  );
  const pkgSrc = fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8');

  // Chunked upload routes mounted under /api (1 GB total cap, 8 MB raw chunk limit, lastActivityAt pruning, 300s decode timeout, stream stdout) — zero multer added
  assert.match(serverSrc, /app\.use\(['"]\/api['"],\s*createFmDecodeRouter\(\)\)/);
  assert.match(decodeRouterSrc, /\/fm27\/decode-status/);
  assert.match(decodeRouterSrc, /\/fm27\/decode-save\/init/);
  assert.match(decodeRouterSrc, /\/fm27\/decode-save\/chunk/);
  assert.match(decodeRouterSrc, /\/fm27\/decode-save\/finish/);
  assert.match(decodeRouterSrc, /\/fm27\/decode-save\/job\/:jobId/);
  assert.match(decodeRouterSrc, /MAX_TOTAL_UPLOAD_BYTES\s*=\s*1024\s*\*\s*1024\s*\*\s*1024/);
  assert.match(decodeRouterSrc, /SERVER_DECODE_TIMEOUT_MS\s*=\s*480_000/);
  assert.match(decodeRouterSrc, /lastActivityAt/);
  assert.match(decodeRouterSrc, /stdoutChunks\.push/);
  assert.match(decodeRouterSrc, /express\.raw\(\{\s*type:\s*['"]application\/octet-stream['"]\s*,\s*limit:\s*['"]8mb['"]/);
  assert.match(decodeRouterSrc, /fs\.promises\.open/);
  assert.match(decodeRouterSrc, /x-fm-chunk-offset/);
  assert.match(decodeRouterSrc, /os\.tmpdir\(\)/);
  assert.match(decodeRouterSrc, /shell:\s*false/);
  assert.match(decodeRouterSrc, /fs\.promises\.unlink/);
  assert.match(decodeRouterSrc, /status\(503\)/);
  assert.doesNotMatch(pkgSrc, /"multer"/);

  // Native Python CLI entry point emits flushed stderr progress and preserves Pyodide step_* functions
  assert.match(mapperSrc, /if __name__ == "__main__":/);
  assert.match(mapperSrc, /--file/);
  assert.match(mapperSrc, /--scope/);
  assert.match(mapperSrc, /--fast-sync/);
  assert.match(mapperSrc, /sys\.stderr\.write\(/);
  assert.match(mapperSrc, /sys\.stderr\.flush\(\)/);
  assert.match(mapperSrc, /def step_open\(/);
  assert.match(mapperSrc, /def step_players\(/);
  assert.match(mapperSrc, /def step_finalize\(/);
});

test('Server Chunk Upload Resilience: retries transient HTTP 520 with idempotent x-fm-chunk-offset and completes cleanly', async () => {
  const mockUploadId = '11111111-1111-4111-8111-111111111111';
  const mockJobId = '22222222-2222-4222-8222-222222222222';
  const chunkOffsets: string[] = [];
  let chunkAttempts = 0;

  const mockFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/fm27/decode-status') {
      return new Response(JSON.stringify({ serverDecodeAvailable: true }), { status: 200 });
    }
    if (url === '/api/fm27/decode-save/init') {
      return new Response(JSON.stringify({ uploadId: mockUploadId }), { status: 200 });
    }
    if (url === '/api/fm27/decode-save/chunk') {
      chunkAttempts += 1;
      const headers = new Headers(init?.headers);
      chunkOffsets.push(headers.get('x-fm-chunk-offset') || '');
      if (chunkAttempts === 1) {
        return new Response('Cloudflare 520', { status: 520 });
      }
      return new Response(JSON.stringify({ ok: true, bytesReceived: 6 }), { status: 200 });
    }
    if (url === '/api/fm27/decode-save/finish') {
      return new Response(JSON.stringify({ jobId: mockJobId }), { status: 200 });
    }
    if (url === `/api/fm27/decode-save/job/${mockJobId}`) {
      return new Response(
        JSON.stringify({
          status: 'done',
          progress: 'Complete',
          payload: {
            meta: { clubName: 'KVV Zelzate', fileName: 'retry-520.fm' },
            players: [],
          },
        }),
        { status: 200 }
      );
    }
    return new Response('Not found', { status: 404 });
  }) as typeof fetch;

  const blob = new Blob(['abcdef']);
  const result = await decodeFmSaveWithServerFirst(
    blob,
    undefined,
    { fileName: 'retry-520.fm', chunkSizeBytes: 1024, pollIntervalMs: 10, retryBaseDelayMs: 10 },
    { fetchImpl: mockFetch }
  );

  assert.equal(chunkAttempts, 2, 'Expected 1 retry after HTTP 520');
  assert.deepEqual(chunkOffsets, ['0', '0'], 'Expected identical idempotent offset on retry');
  assert.equal(result.meta.clubName, 'KVV Zelzate');
});

test('Server Decode Polling Resilience: retries transient HTTP 502 blips and completes when server recovers', async () => {
  const mockUploadId = '33333333-3333-4333-8333-333333333333';
  const mockJobId = '44444444-4444-4444-8444-444444444444';
  let pollAttempts = 0;

  const mockFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/fm27/decode-status') {
      return new Response(JSON.stringify({ serverDecodeAvailable: true }), { status: 200 });
    }
    if (url === '/api/fm27/decode-save/init') {
      return new Response(JSON.stringify({ uploadId: mockUploadId }), { status: 200 });
    }
    if (url === '/api/fm27/decode-save/chunk') {
      return new Response(JSON.stringify({ ok: true, bytesReceived: 6 }), { status: 200 });
    }
    if (url === '/api/fm27/decode-save/finish') {
      return new Response(JSON.stringify({ jobId: mockJobId }), { status: 200 });
    }
    if (url === `/api/fm27/decode-save/job/${mockJobId}`) {
      pollAttempts += 1;
      if (pollAttempts <= 2) {
        return new Response('Bad Gateway', { status: 502 });
      }
      return new Response(
        JSON.stringify({
          status: 'done',
          progress: 'Complete',
          payload: {
            meta: { clubName: 'KVV Zelzate', fileName: 'retry-502.fm' },
            players: [],
          },
        }),
        { status: 200 }
      );
    }
    return new Response('Not found', { status: 404 });
  }) as typeof fetch;

  const blob = new Blob(['abcdef']);
  const result = await decodeFmSaveWithServerFirst(
    blob,
    undefined,
    { fileName: 'retry-502.fm', chunkSizeBytes: 1024, pollIntervalMs: 10, retryBaseDelayMs: 10 },
    { fetchImpl: mockFetch }
  );

  assert.equal(pollAttempts, 3, 'Expected polling to survive 2 transient HTTP 502 responses');
  assert.equal(result.meta.clubName, 'KVV Zelzate');
});

test('Server Decode Restart Fallback: persistent HTTP 502 / 404 during polling automatically falls back to browser Pyodide worker', async () => {
  const mockUploadId = '55555555-5555-4555-8555-555555555555';
  const mockJobId = '66666666-6666-4666-8666-666666666666';
  let pollAttempts = 0;
  let fallbackCalled = false;

  const mockFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/fm27/decode-status') {
      return new Response(JSON.stringify({ serverDecodeAvailable: true }), { status: 200 });
    }
    if (url === '/api/fm27/decode-save/init') {
      return new Response(JSON.stringify({ uploadId: mockUploadId }), { status: 200 });
    }
    if (url === '/api/fm27/decode-save/chunk') {
      return new Response(JSON.stringify({ ok: true, bytesReceived: 6 }), { status: 200 });
    }
    if (url === '/api/fm27/decode-save/finish') {
      return new Response(JSON.stringify({ jobId: mockJobId }), { status: 200 });
    }
    if (url === `/api/fm27/decode-save/job/${mockJobId}`) {
      pollAttempts += 1;
      if (pollAttempts === 1) {
        return new Response('Bad Gateway', { status: 502 });
      }
      // Simulates Render container finishing restart with wiped in-memory job map
      return new Response(JSON.stringify({ status: 'error', error: 'Decode job not found or expired.' }), {
        status: 404,
      });
    }
    return new Response('Not found', { status: 404 });
  }) as typeof fetch;

  const blob = new Blob(['abcdef']);
  const result = await decodeFmSaveWithServerFirst(
    blob,
    undefined,
    { fileName: 'fallback-502.fm', chunkSizeBytes: 1024, pollIntervalMs: 10, retryBaseDelayMs: 10 },
    {
      fetchImpl: mockFetch,
      browserFallback: async () => {
        fallbackCalled = true;
        return {
          meta: { clubName: 'KVV Zelzate', fileName: 'fallback-502.fm' },
          players: [],
        } as unknown as DecodedFmSavePayload;
      },
    }
  );

  assert.equal(fallbackCalled, true, 'Expected automatic fallback to local browser worker after server restart');
  assert.equal(result.meta.clubName, 'KVV Zelzate');
});

test('hydrateAppFromDecodedFmSave hydrates marketValue on re-sync and keeps 0-app players factual when squad has season stats', () => {
  const fullAttrs = {
    pace: 15,
    acceleration: 16,
    stamina: 6,
    jumpingReach: 6,
    determination: 10,
    passing: 8,
    finishing: 9,
    tackling: 4,
    firstTouch: 10,
    decisions: 8,
    workRate: 10,
    offTheBall: 4,
  };

  const existingSquad = [
    {
      id: 'fm-uid-18115961',
      uid: 18115961,
      number: 9,
      name: 'Wolf Ackx',
      position: 'STC, AML',
      apps: '8 (3)',
      minutes: 730,
      rating: 6.63,
      goals: 0,
      xG: 1.42,
      xGPer90: 0.18,
      assists: 1,
      xA: 1.8,
      xAPer90: 0.22,
      drbPer90: 1.85,
      prPassesPer90: 1.73,
      hdrPct: 33,
      intPer90: 1.85,
      tckPct: 71,
      personality: 'Balanced',
      age: 25,
      ability: 3.5,
      potential: 5.0,
      expires: '30/06/2029',
      nation: 'Belgium',
      wagePw: 541,
      marketValue: null,
      status: 'Surplus' as const,
      attributes: fullAttrs,
      ipRole: 'Centre Forward',
      oopRole: 'Centre Forward',
      notes: '',
    },
  ];

  const decoded: DecodedFmSavePayload = {
    meta: {
      game: 'FM27',
      build: '27.1.0+2505117',
      knownBuild: true,
      fmsaveVersion: '0.14.3',
      saveName: 'auto save',
      gameDateIso: '2027-09-15',
      gameDateDmy: '15/09/2027',
      clubUid: 18104898,
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      balance: -802198,
      scoutingBudget: 3900,
    },
    players: [
      {
        uid: 18115961,
        name: 'Wolf Ackx',
        position: 'STC, AML',
        age: 25,
        nation: 'Belgium',
        abilityStars: 3.5,
        potentialStars: 5.0,
        condition: 79,
        sharpness: 70,
        onLoan: false,
        teamSlot: 0,
        wagePw: 541,
        marketValue: 0,
        expires: '30/06/2029',
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
        suspensionsCount: 0,
        attributes: fullAttrs,
      },
      {
        uid: 18106029,
        name: 'Quinten Boudry',
        position: 'AML, WBL',
        age: 27,
        nation: 'Belgium',
        abilityStars: 4.0,
        potentialStars: 4.5,
        condition: 78,
        sharpness: 100,
        onLoan: false,
        teamSlot: 0,
        wagePw: 410,
        marketValue: 17356,
        expires: '30/06/2029',
        apps: '6',
        minutes: 532,
        rating: 7.1,
        goals: 1,
        xG: 0.93,
        xGPer90: 0.16,
        assists: 0,
        xA: 2.98,
        xAPer90: 0.5,
        drbPer90: 2.1,
        prPassesPer90: 3.4,
        hdrPct: 40,
        intPer90: 1.2,
        tckPct: 75,
        distanceKm: 58.2,
        yellowCards: 1,
        redCards: 0,
        suspensionsCount: 0,
        attributes: fullAttrs,
      },
    ],
    playedMatches: [],
    upcomingFixtures: [],
    leagueStanding: null,
    finances: null,
    staff: [],
    activeInjuries: [],
    activeSuspensions: [],
    tactics: [],
    mentoring: [],
  };

  const hydrated = hydrateAppFromDecodedFmSave(decoded, existingSquad, []);
  const ackx = hydrated.updatedSquad.find((p) => p.name === 'Wolf Ackx');
  const boudry = hydrated.updatedSquad.find((p) => p.name === 'Quinten Boudry');

  assert.ok(ackx);
  assert.equal(ackx.marketValue, 0);
  assert.equal(ackx.apps, '0');
  assert.equal(ackx.minutes, 0);
  assert.equal(ackx.rating, null);
  assert.equal(ackx.drbPer90, 0);
  assert.equal(ackx.statsSource, undefined);

  assert.ok(boudry);
  assert.equal(boudry.marketValue, 17356);
  assert.equal(boudry.apps, '6');
  assert.equal(boudry.minutes, 532);
  assert.equal(boudry.goals, 1);
  assert.equal(boudry.rating, 7.1);
});

test('Phase 1: strips leaked Last-5 form for 0-minute players, updates per-90 on minutes change, starts at Event #1, preserves competitionRules, and excludes friendlies in summary', async () => {
  const { computeCompetitiveSummary } = await import('./fmSyncEngine');
  const fullAttrs = {
    corners: 10, crossing: 10, dribbling: 10, finishing: 10, firstTouch: 10,
    freeKicks: 10, heading: 10, longShots: 10, longThrows: 10, marking: 10,
    passing: 10, penalties: 10, tackling: 10, technique: 10, aggression: 10,
    anticipation: 10, bravery: 10, composure: 10, concentration: 10, decisions: 10,
    determination: 10, flair: 10, leadership: 10, offTheBall: 10, positioning: 10,
    teamwork: 10, vision: 10, workRate: 10, acceleration: 10, agility: 10,
    balance: 10, jumpingReach: 10, naturalFitness: 10, pace: 10, stamina: 10,
    strength: 10, aerialReach: 10, commandOfArea: 10, communication: 10,
    eccentricity: 10, handling: 10, kicking: 10, oneOnOnes: 10, punching: 10,
    reflexes: 10, rushingOut: 10, throwing: 10,
  };

  const existingSquad = [
    {
      id: 'fm-uid-101',
      uid: 101,
      number: 10,
      name: 'Existing Starter',
      position: 'MC',
      apps: '2',
      minutes: 180,
      rating: 7.2,
      goals: 1,
      xG: 1.0,
      xGPer90: 0.5,
      assists: 0,
      xA: 0.5,
      xAPer90: 0.25,
      drbPer90: 1.0,
      prPassesPer90: 2.0,
      hdrPct: 50,
      intPer90: 1.0,
      tckPct: 70,
      personality: 'Balanced',
      age: 23,
      ability: 3.5,
      potential: 4.0,
      expires: '30/06/2028',
      nation: 'ENG',
      wagePw: 500,
      status: 'Starter' as const,
      attributes: fullAttrs,
      ipRole: 'Central Midfielder',
      oopRole: 'Central Midfielder',
      notes: '',
    },
  ];

  const decoded: DecodedFmSavePayload = {
    meta: {
      game: 'FM27',
      build: '27.1.0+2505117',
      knownBuild: true,
      fmsaveVersion: '0.14.3',
      saveName: 'phase1.fm',
      clubUid: 999,
      clubName: 'Test FC',
      managerName: 'Bobby Dean',
      gameDateIso: '2026-09-20',
      gameDateDmy: '20/09/2026',
      balance: 250000,
      scoutingBudget: 5000,
    },
    clubUid: 999,
    players: [
      {
        uid: 101,
        name: 'Existing Starter',
        position: 'MC',
        age: 23,
        nation: 'ENG',
        abilityStars: 3.5,
        potentialStars: 4.0,
        condition: 90,
        sharpness: 95,
        wagePw: 500,
        expires: '30/06/2028',
        onLoan: false,
        teamSlot: 0,
        apps: '4',
        minutes: 360,
        rating: null,
        goals: 1,
        xG: 1.0,
        xGPer90: 0.25,
        assists: 0,
        xA: 0.5,
        xAPer90: 0.13,
        drbPer90: 1.0,
        prPassesPer90: 2.0,
        hdrPct: 50,
        intPer90: 1.0,
        tckPct: 70,
        distanceKm: 40,
        yellowCards: 1,
        redCards: 0,
        suspensionsCount: 0,
        attributes: fullAttrs,
      },
      {
        uid: 202,
        name: 'Zero Minute Backup',
        position: 'ST',
        age: 19,
        nation: 'ENG',
        abilityStars: 2.5,
        potentialStars: 4.0,
        condition: 92,
        sharpness: 65,
        wagePw: 200,
        expires: '30/06/2028',
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
        suspensionsCount: 0,
        attributes: fullAttrs,
        last5Ratings: [{ date: '2026-07-10', rating: 7.4, goals: 1, assists: 0 }],
      },
    ],
    playedMatches: [
      {
        dateIso: '2026-09-12',
        dateDmy: '12/09/2026',
        competition: 'League One',
        opponent: 'Rival FC',
        venue: 'H',
        score: '2 - 1',
        result: 'W',
        xGFor: 1.8,
        xGAgainst: 0.9,
        possession: 54,
        passCompletion: 84,
        shotsFor: '14 (6)',
        shotsAgainst: '7 (3)',
        cccFor: 2,
        cccAgainst: 1,
        distanceKm: 112.4,
      },
    ],
    upcomingFixtures: [],
    leagueStanding: null,
    finances: null,
    staff: [],
    activeInjuries: [],
    activeSuspensions: [],
    tactics: [],
    mentoring: [],
    competitionRules: {
      competitionName: 'League One',
      maxSquadSize: 25,
      minHomegrownClub: 4,
      minHomegrownNation: 8,
      maxForeignPlayers: 5,
      u21Exempt: true,
      matchdaySubsLimit: 5,
      fixturesPerClub: 38,
      promotionPlaces: 2,
      playoffPlaces: 4,
      relegationPlaces: 3,
    },
  };

  const hydrated = hydrateAppFromDecodedFmSave(decoded, existingSquad, []);
  const starter = hydrated.updatedSquad.find((p) => p.uid === 101);
  const backup = hydrated.updatedSquad.find((p) => p.uid === 202);

  assert.ok(starter);
  assert.equal(starter.xGPer90, 0.25);
  assert.equal(starter.xAPer90, 0.13);
  assert.equal(starter.rating, null);

  assert.ok(backup);
  assert.equal(backup.last5Ratings, undefined);
  assert.equal(backup.last5Form, undefined);

  assert.equal(hydrated.updatedMatches[0].eventNumber, 1);
  assert.equal(hydrated.competitionRules?.fixturesPerClub, 38);
  assert.equal(hydrated.competitionRules?.promotionPlaces, 2);
  assert.equal(hydrated.competitionRules?.playoffPlaces, 4);
  assert.equal(hydrated.competitionRules?.relegationPlaces, 3);

  const friendlyOnlySummary = computeCompetitiveSummary([
    {
      id: 'f1',
      eventNumber: 1,
      date: '10/07/2026',
      competition: 'Pre-Season Friendly',
      opponent: 'Local XI',
      venue: 'H',
      result: 'W',
      score: '5 - 0',
      xGFor: 3.1,
      xGAgainst: 0.2,
      possession: 60,
      shotsFor: '20 (10)',
      shotsAgainst: '2 (0)',
      cccFor: 4,
      cccAgainst: 0,
      passCompletion: 88,
      goalTimeline: '',
      potm: '',
      defensiveWatchpoints: '',
      tacticalAudit: '',
    },
  ]);
  assert.equal(friendlyOnlySummary.played, 0);
  assert.equal(friendlyOnlySummary.wins, 0);
});

test('Server Decode Parallel Upload & Progressive Checkpoint: uploads chunks concurrently and delivers Stage 2 checkpoint before final payload', async () => {
  const mockUploadId = '77777777-7777-4777-8777-777777777777';
  const mockJobId = '88888888-8888-4888-8888-888888888888';
  const totalBytes = 60;
  const sourceBytes = new Uint8Array(totalBytes);
  for (let i = 0; i < totalBytes; i++) sourceBytes[i] = (i * 7) & 0xff;
  const assembled = new Uint8Array(totalBytes);

  let inFlightChunks = 0;
  let maxConcurrentChunks = 0;
  let initReceivedTotalBytes: number | null = null;
  let pollCount = 0;

  const checkpointPayload: DecodedFmSavePayload = {
    meta: {
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      gameDateDmy: '15/11/2026',
      game: 'FM27',
      build: '27.1.0',
      fmsaveVersion: '0.14.3',
    },
    players: [
      {
        uid: 1001,
        name: 'Joran Triest',
        age: 28,
        position: 'ST',
        wagePw: 550,
        expires: '2028',
        conditionPct: 95,
        sharpnessPct: 92,
      },
    ],
    staff: [],
    playedMatches: [],
    upcomingFixtures: [],
  } as unknown as DecodedFmSavePayload;

  const finalPayload: DecodedFmSavePayload = {
    ...checkpointPayload,
    playedMatches: [
      {
        dateDmy: '10/11/2026',
        competition: 'Eerste Nationale VV',
        homeTeam: 'KVV Zelzate',
        awayTeam: 'KVK Ninove',
        homeGoals: 2,
        awayGoals: 0,
        isHome: true,
        opponent: 'KVK Ninove',
        result: 'W',
        score: '2 - 0',
      },
    ],
  } as unknown as DecodedFmSavePayload;

  const mockFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/fm27/decode-status') {
      return new Response(JSON.stringify({ serverDecodeAvailable: true }), { status: 200 });
    }
    if (url === '/api/fm27/decode-save/init') {
      const parsed = JSON.parse(String(init?.body || '{}')) as { totalBytes?: number };
      initReceivedTotalBytes = parsed.totalBytes ?? null;
      return new Response(
        JSON.stringify({ uploadId: mockUploadId, supportsParallelChunks: true }),
        { status: 200 }
      );
    }
    if (url === '/api/fm27/decode-save/chunk') {
      inFlightChunks += 1;
      maxConcurrentChunks = Math.max(maxConcurrentChunks, inFlightChunks);
      const headers = new Headers(init?.headers);
      const offset = Number(headers.get('x-fm-chunk-offset') || '0');
      const buf = new Uint8Array(await (init?.body as Blob).arrayBuffer());
      await new Promise((r) => setTimeout(r, 15));
      assembled.set(buf, offset);
      inFlightChunks -= 1;
      return new Response(JSON.stringify({ ok: true, bytesReceived: totalBytes }), {
        status: 200,
      });
    }
    if (url === '/api/fm27/decode-save/finish') {
      return new Response(JSON.stringify({ jobId: mockJobId }), { status: 200 });
    }
    if (url === `/api/fm27/decode-save/job/${mockJobId}`) {
      pollCount += 1;
      if (pollCount === 1) {
        return new Response(
          JSON.stringify({
            status: 'running',
            progress: 'Reading fixtures & match results...',
            checkpointStage: 'stage_2_club_core',
            checkpointPayload,
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          status: 'done',
          progress: 'Complete',
          payload: finalPayload,
        }),
        { status: 200 }
      );
    }
    return new Response('Not found', { status: 404 });
  }) as typeof fetch;

  const checkpointsReceived: Array<{ stage: string; playerCount: number }> = [];
  const result = await decodeFmSaveWithServerFirst(
    new Blob([sourceBytes]),
    undefined,
    {
      fileName: 'auto save.fm',
      chunkSizeBytes: 10,
      uploadConcurrency: 4,
      pollIntervalMs: 10,
      onCheckpoint: (cp) => {
        checkpointsReceived.push({
          stage: cp.stage,
          playerCount: cp.payload.players.length,
        });
      },
    },
    { fetchImpl: mockFetch }
  );

  assert.equal(initReceivedTotalBytes, totalBytes);
  assert.ok(
    maxConcurrentChunks >= 2,
    `Expected parallel chunk uploads (observed max concurrency: ${maxConcurrentChunks})`
  );
  assert.deepEqual(Array.from(assembled), Array.from(sourceBytes));
  assert.deepEqual(checkpointsReceived, [
    { stage: 'stage_2_club_core', playerCount: 1 },
  ]);
  assert.equal(result.playedMatches?.length, 1);
});










test('Large .fm hardening: Render OOM 507 fallback, orphan sweep, hidden-tab watchdog, MEMFS guard, filter row reset, and runtime asset caching', async () => {
  const decodeRouterSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'server/routes/fmDecodeRoutes.ts'),
    'utf8'
  );
  const saveReaderSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/fmSaveReader.ts'),
    'utf8'
  );
  const clientSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/workers/fmSaveWorkerClient.ts'),
    'utf8'
  );
  const workerSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'public/fm-save-worker.js'),
    'utf8'
  );
  const mapperSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'public/fm-save-mapper.py'),
    'utf8'
  );
  const squadTableSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/SquadAnalyticsTable.tsx'),
    'utf8'
  );
  const viteSrc = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');

  // 1. Server: SIGKILL/137 -> 507 + immediate temp cleanup + startup orphan sweep
  assert.match(decodeRouterSrc, /code === 137 \|\| signal === 'SIGKILL'/);
  assert.match(decodeRouterSrc, /job\.httpStatus = 507/);
  assert.match(decodeRouterSrc, /SERVER_OOM/);
  assert.match(decodeRouterSrc, /export async function sweepOrphanedTempUploads/);
  assert.match(decodeRouterSrc, /void sweepOrphanedTempUploads\(\)/);
  assert.match(saveReaderSrc, /jobRes\.status === 507/);

  // 2. Hidden tabs pause and extend both watchdogs; listeners detach on every path
  for (const src of [clientSrc, saveReaderSrc]) {
    assert.match(src, /visibilitychange/);
    assert.match(src, /ceilingDeadlineMs \+= hiddenMs/);
    assert.match(src, /document\.removeEventListener\('visibilitychange'/);
  }
  assert.match(clientSrc, /this\.visibilityCleanup\?\.\(\)/);
  assert.match(clientSrc, /this\.visibilityCleanup = null/);

  // 3. Zero-copy WORKERFS stays primary; large MEMFS buffer copies are refused
  assert.match(workerSrc, /MAX_MEMFS_BUFFER_BYTES = 64 \* 1024 \* 1024/);
  assert.match(workerSrc, /bufferBytes > MAX_MEMFS_BUFFER_BYTES/);

  // 4. Mapper: a 0-minute row can never overwrite active season stats
  assert.match(mapperSrc, /if new_mins < 1 and old_mins >= 1:/);
  assert.match(mapperSrc, /return deep_scrub_ca_pa\(raw_payload\)/);

  // 5. Squad table resets the mobile DOM cap whenever search/filters change
  assert.match(squadTableSrc, /setVisibleRowLimit\(35\)/);

  // 6. Workbox: worker/mapper/patcher are not precached and use NetworkFirst
  assert.match(viteSrc, /globIgnores/);
  assert.ok(viteSrc.includes('fm-save-worker\\.js'));
  assert.ok(viteSrc.includes('fm-save-mapper\\.py'));
  assert.ok(viteSrc.includes('fm_layout_patcher\\.py'));
  assert.match(viteSrc, /handler: 'NetworkFirst'/);

  // 7. HTTP 507 from the job poll triggers an immediate browser fallback
  const mockUploadId = '33333333-4444-4555-8666-777777777777';
  const mockJobId = 'cccccccc-dddd-4eee-8fff-000000000000';
  let fallbackInvoked = false;
  const fetchOom = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown, status: number) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    if (url === '/api/fm27/decode-status') {
      return json({ serverDecodeAvailable: true }, 200);
    }
    if (url === '/api/fm27/decode-save/init') {
      return json({ uploadId: mockUploadId }, 200);
    }
    if (url === '/api/fm27/decode-save/chunk') {
      return json({ ok: true, bytesReceived: 3 }, 200);
    }
    if (url === '/api/fm27/decode-save/finish') {
      return json({ jobId: mockJobId }, 200);
    }
    if (url === `/api/fm27/decode-save/job/${mockJobId}`) {
      return json(
        {
          status: 'error',
          error: 'Server ran out of memory while decoding this .fm save.',
          errorCode: 'SERVER_OOM',
          serverDecodeAvailable: false,
        },
        507
      );
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  const oomResult = await decodeFmSaveWithServerFirst(
    new Blob([new Uint8Array([1, 2, 3])]),
    undefined,
    { fileName: 'huge.fm', pollIntervalMs: 10 },
    {
      fetchImpl: fetchOom,
      browserFallback: async () => {
        fallbackInvoked = true;
        return {
          meta: { saveName: 'fallback.fm' },
        } as unknown as DecodedFmSavePayload;
      },
    }
  );

  assert.equal(fallbackInvoked, true, 'Expected immediate browser fallback on HTTP 507');
  assert.equal(oomResult.meta.saveName, 'fallback.fm');
});

test('activeInjuries hydrates status=Injured (excluded by solveBestXi) and ST positionRatings qualify strikers in dualPhaseRoleEngine', async () => {
  const { solveBestXi } = await import('./bestXiSolver');
  const { evaluateDualPhaseRoles } = await import('./dualPhaseRoleEngine');

  const baseAttrs = {
    corners: 8, crossing: 10, dribbling: 14, finishing: 16, first_touch: 14,
    free_kick_taking: 8, heading: 13, long_shots: 12, long_throws: 6,
    marking: 6, passing: 12, penalty_taking: 13, tackling: 7, technique: 14,
    aggression: 12, anticipation: 15, bravery: 13, composure: 15, concentration: 13,
    decisions: 14, determination: 16, flair: 13, leadership: 11, off_the_ball: 16,
    positioning: 8, teamwork: 13, vision: 12, work_rate: 15,
    acceleration: 15, agility: 14, balance: 13, jumping_reach: 13,
    natural_fitness: 14, pace: 15, stamina: 14, strength: 13,
  };

  const payload: DecodedFmSavePayload = {
    meta: {
      saveName: 'injury-striker.fm',
      clubName: 'KVV Zelzate',
      gameDate: '2027-02-15',
      build: '27.1.0',
    },
    players: [
      {
        uid: 1001,
        name: 'Injured Star ST',
        position: 'ST',
        age: 24,
        nationality: 'BEL',
        ability: 4.5,
        potential: 4.5,
        condition: 98,
        matchSharpness: 95,
        wagePw: 1200,
        expires: '30/06/2028',
        positionRatings: { ST: 20 },
        attributes: baseAttrs,
      },
      {
        uid: 1002,
        name: 'Fit Backup ST',
        position: 'ST',
        age: 22,
        nationality: 'BEL',
        ability: 3.5,
        potential: 4.0,
        condition: 95,
        matchSharpness: 92,
        wagePw: 800,
        expires: '30/06/2028',
        positionRatings: { ST: 20 },
        attributes: { ...baseAttrs, finishing: 14, pace: 14 },
      },
    ],
    playedMatches: [],
    upcomingFixtures: [],
    staff: [],
    tactics: [],
    mentoring: [],
    extractionWarnings: [],
    activeInjuries: [
      {
        playerUid: 1001,
        playerName: 'Injured Star ST',
        typeName: 'Hamstring Strain',
        date: '15/03/2027',
      },
    ],
  } as unknown as DecodedFmSavePayload;

  const hydrated = hydrateAppFromDecodedFmSave(payload, [], []);
  const injuredPlayer = hydrated.updatedSquad.find((p) => p.uid === 1001);
  const fitPlayer = hydrated.updatedSquad.find((p) => p.uid === 1002);
  assert.ok(injuredPlayer);
  assert.ok(fitPlayer);
  assert.equal(injuredPlayer.status, 'Injured');
  assert.notEqual(fitPlayer.status, 'Injured');

  const dualPhase = evaluateDualPhaseRoles(fitPlayer);
  assert.ok(
    dualPhase.topInPossession.some((r) => r.position === 'ST' || r.position === 'STC'),
    'Expected striker with positionRatings { ST: 20 } to score for Striker IP roles'
  );
  assert.ok(
    dualPhase.topOutOfPossession.some((r) => r.position === 'ST' || r.position === 'STC'),
    'Expected striker with positionRatings { ST: 20 } to score for Striker OOP roles'
  );

  const solved = solveBestXi(hydrated.updatedSquad, {
    shape: '4-3-3 DM Wide',
    excludeInjured: true,
  });
  const xiUids = solved.startingXI.map((s) => s.player?.uid).filter(Boolean);
  assert.ok(!xiUids.includes(1001), 'Injured striker must be excluded when excludeInjured=true');
  assert.ok(xiUids.includes(1002), 'Fit backup striker must start ahead of injured player');
});

test('hydrateAppFromDecodedFmSave preserves marketValueState, marketValueCapped, potentialUncertain, expectedReturn, and competition prizeMoney/rounds', () => {
  const payload = {
    meta: {
      gameDate: '01/03/2031',
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
    },
    players: [
      {
        uid: 5001,
        name: 'Wonderkid Prospect',
        position: 'MC',
        age: 17,
        abilityStars: 2.5,
        potentialStars: 2.5,
        potentialUncertain: true,
        marketValue: 300000000,
        marketValueState: 'capped',
        marketValueCapped: true,
        condition: 90,
        sharpness: 70,
        wagePw: 500,
        expires: '30/06/2034',
        onLoan: false,
        teamSlot: 0,
        apps: '10',
        minutes: 720,
        rating: 7.1,
        goals: 2,
        xG: 1.5,
        xGPer90: 0.19,
        assists: 3,
        xA: 2.1,
        xAPer90: 0.26,
        drbPer90: 1.2,
        prPassesPer90: 4.5,
        hdrPct: 50,
        intPer90: 1.8,
        tckPct: 75,
        distanceKm: 11.2,
        yellowCards: 1,
        redCards: 0,
        attributes: null,
      },
    ],
    activeInjuries: [
      {
        playerUid: 5001,
        playerName: 'Wonderkid Prospect',
        typeName: 'Ankle Sprain',
        date: '20/03/2031',
        expectedReturn: '20/03/2031',
        severity: 'Moderate',
        cause: 'Match',
        kind: 'typed',
      },
    ],
    competitionRules: {
      competitionName: 'Belgian First Division B',
      maxSquadSize: 25,
      minHomegrownClub: 2,
      minHomegrownNation: 6,
      maxForeignPlayers: null,
      u21Exempt: true,
      matchdaySubsLimit: 5,
      prizeMoney: 1250000,
      rounds: 30,
    },
    staff: [],
    fixtures: [],
    playedMatches: [],
    upcomingFixtures: [],
    leagueStanding: null,
    finances: null,
    tactics: [],
    mentoring: [],
  } as unknown as DecodedFmSavePayload;

  const fresh = hydrateAppFromDecodedFmSave(payload, [], []);
  const player = fresh.updatedSquad.find((p) => p.uid === 5001);
  assert.ok(player);
  assert.equal(player.marketValueState, 'capped');
  assert.equal(player.marketValueCapped, true);
  assert.equal(player.potentialUncertain, true);
  assert.equal(fresh.competitionRules?.prizeMoney, 1250000);
  assert.equal(fresh.competitionRules?.rounds, 30);
  assert.match(fresh.analystPromptContext, /expected return 20\/03\/2031/);

  // Re-syncing against an existing player should also update the new fields
  const resyncPayload = {
    ...payload,
    players: [
      {
        ...payload.players[0],
        marketValue: 450000,
        marketValueState: 'ok',
        marketValueCapped: false,
        potentialUncertain: false,
      },
    ],
  } as unknown as DecodedFmSavePayload;

  const resynced = hydrateAppFromDecodedFmSave(resyncPayload, fresh.updatedSquad, []);
  const updated = resynced.updatedSquad.find((p) => p.uid === 5001);
  assert.ok(updated);
  assert.equal(updated.marketValue, 450000);
  assert.equal(updated.marketValueState, 'ok');
  assert.equal(updated.marketValueCapped, false);
  assert.equal(updated.potentialUncertain, false);
});


