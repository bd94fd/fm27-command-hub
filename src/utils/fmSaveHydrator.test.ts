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
import { buildTacticalAnalystContext } from './tacticalAnalystContext';
import { SQUAD_PLAYERS } from '../data/squadData';
import { COMPETITIVE_MATCH_LOGS } from '../data/matchAndTacticsData';

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

test('Pass 0 worker cache-buster is bumped to ?v=9 and FmImportScope supports club_and_division with clamping', () => {
  assert.equal(WORKER_CACHE_BUSTER, '?v=9');

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

