import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAnalystPlayerUpdates,
  buildConversationTranscript,
  buildLiveTacticalAnalystContext,
} from './tacticalAnalystContext';
import { PlayerRecord, MatchLogEntry } from '../types/fm27';
import { analyzePlayerCard } from './playerCardAnalysis';
import { countSquadPool, MISSING_VALUE } from './squadViewHelpers';
import { PREFERRED_JOB_AFFINITY_CAPTION } from './staffRatings';

const samplePlayers: PlayerRecord[] = [
  {
    id: 'p-1',
    number: 1,
    name: 'Lukas Vandenberghe',
    position: 'GK',
    apps: '5',
    minutes: 450,
    rating: 7.12,
    goals: 0,
    xG: 0,
    xGPer90: 0,
    assists: 0,
    xA: 0,
    xAPer90: 0,
    drbPer90: 0,
    prPassesPer90: 2.1,
    hdrPct: 80,
    intPer90: 0.4,
    tckPct: 100,
    personality: 'Professional',
    age: 26,
    ability: 3.5,
    potential: 4.0,
    condition: 98,
    sharpness: 100,
    preferredFoot: 'Right',
    expires: '30/6/2028',
    nation: 'BEL',
    wagePw: 420,
    status: 'Starter',
    attributes: {
      pace: 11,
      acceleration: 11,
      stamina: 13,
      jumpingReach: 15,
      determination: 15,
      passing: 12,
      finishing: 4,
      tackling: 6,
      firstTouch: 11,
      decisions: 14,
      workRate: 12,
      offTheBall: 5,
      heading: 10,
      corners: 5,
      crossing: 5,
      technique: 11,
    },
    ipRole: 'No-Nonsense GK (NGK)',
    oopRole: 'Goalkeeper (GK)',
    notes: 'First-choice keeper',
  },
  {
    id: 'p-12',
    number: 12,
    name: 'Nathan Karinda',
    position: 'AM (R), ST (C)',
    apps: '5',
    minutes: 390,
    rating: 7.28,
    goals: 3,
    xG: 2.45,
    xGPer90: 0.56,
    assists: 2,
    xA: 1.62,
    xAPer90: 0.37,
    drbPer90: 3.4,
    prPassesPer90: 4.1,
    hdrPct: 45,
    intPer90: 1.1,
    tckPct: 74,
    personality: 'Determined',
    age: 23,
    ability: 4.0,
    potential: 4.5,
    condition: 91,
    sharpness: 97,
    preferredFoot: 'Right',
    expires: '30/6/2028',
    nation: 'BEL',
    wagePw: 510,
    status: 'Starter',
    attributes: {
      pace: 15,
      acceleration: 15,
      stamina: 11,
      jumpingReach: 9,
      determination: 16,
      passing: 12,
      finishing: 13,
      tackling: 10,
      firstTouch: 13,
      decisions: 12,
      workRate: 14,
      offTheBall: 14,
      heading: 9,
      corners: 13,
      crossing: 14,
      technique: 13,
    },
    ipRole: 'Winger (W)',
    oopRole: 'Tracking Winger (TW)',
    notes: 'Primary right-flank threat',
  },
];

const sampleMatches: MatchLogEntry[] = [
  {
    id: 'm-1',
    eventNumber: 1,
    date: '15/09/2027',
    competition: '1e Nationale VV',
    opponent: 'Royal Knokke FC',
    venue: 'A',
    result: 'W',
    score: '2 - 1',
    xGFor: 1.78,
    xGAgainst: 0.92,
    possession: 54,
    passCompletion: 86,
    shotsFor: '14 (7)',
    shotsAgainst: '8 (3)',
    cccFor: 3,
    cccAgainst: 1,
    goalTimeline: "34' Karinda, 71' Karinda",
    potm: 'Nathan Karinda (8.1)',
    defensiveWatchpoints: 'Locked flanks after switching to Tracking Winger OOP',
    tacticalAudit: 'Tracking Winger OOP neutralized Knokke full-back overlaps',
    source: 'FM_SAVE',
  },
];

test('buildLiveTacticalAnalystContext includes FM27 Patch 27.1.0 physics, Playbook v2.0 rules, and awaiting-save guidance when empty', () => {
  const ctx = buildLiveTacticalAnalystContext({
    clubName: '--',
    managerName: '--',
    saveDate: '--',
    nextFixture: '--',
    leagueStandingSub: 'Awaiting .fm save import',
    wageSpend: '--',
    balance: '--',
    players: [],
    matches: [],
    hydratedFmSave: null,
  });

  assert.ok(ctx.includes('PATCH 27.1.0'));
  assert.ok(ctx.includes('Tracking Winger (TW)'));
  assert.ok(ctx.includes('AWAITING .FM SAVE OR EXPORT IMPORT'));
});

test('buildLiveTacticalAnalystContext includes decoded job vacancies with real roles', () => {
  const ctx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2027',
    nextFixture: '--',
    leagueStandingSub: '--',
    wageSpend: '--',
    balance: '--',
    players: [],
    matches: [],
    hydratedFmSave: {
      decodedPayload: {
        jobVacancies: [
          {
            club_name: 'Leicester City',
            unknown: "{'role': 20, 'advertised_slot': 13}",
          },
        ],
      },
    } as never,
  });

  assert.ok(ctx.includes('JOB CENTRE VACANCIES (1)'));
  assert.ok(ctx.includes('Assistant Manager at Leicester City'));
  assert.ok(!ctx.includes('Staff at Unknown'));
});

test('buildLiveTacticalAnalystContext compiles full squad, War Room XI, set-piece rankings, and match log when populated', () => {
  const ctx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2027',
    nextFixture: '18/09/2027 vs Jong Cercle (Away)',
    leagueStandingSub: '#3 of 16 (6 Pts)',
    wageSpend: '£4,200 / £4,800 p/w',
    balance: '£210K',
    players: samplePlayers,
    matches: sampleMatches,
    hydratedFmSave: null,
  });

  assert.ok(ctx.includes('KVV Zelzate'));
  assert.ok(ctx.includes('Nathan Karinda'));
  assert.ok(ctx.includes('Royal Knokke FC'));
  assert.ok(ctx.includes('WAR ROOM COMPUTED DUAL-PHASE 4-3-3 STARTING XI'));
  assert.ok(ctx.includes('CORNERS & SET-PIECE SPECIALIST RANKINGS'));
});

test('buildConversationTranscript preserves multi-turn user and assistant tactical context', () => {
  const transcript = buildConversationTranscript([
    {
      id: 'u1',
      role: 'user',
      userText: 'Why did we concede down our right flank at Knokke?',
      imageNames: ['knokke_pass_map.png'],
    },
    {
      id: 'a1',
      role: 'assistant',
      screenDetected: 'Data Hub Pass Map',
      inGameDate: '15/09/2027',
      analysisMarkdown:
        'Because AMR Nathan Karinda was set to Wide Outlet Winger OOP instead of Tracking Winger OOP.',
      immediateClicks: [
        'Switch AMR Nathan Karinda OOP role to Tracking Winger (TW).',
      ],
      playerUpdatesApplied: ['Nathan Karinda'],
    },
  ]);

  assert.equal(transcript.length, 2);
  assert.ok(transcript[0].text.includes('knokke_pass_map.png'));
  assert.ok(transcript[1].text.includes('Tracking Winger (TW)'));
  assert.ok(transcript[1].text.includes('Squad DB Updated: Nathan Karinda'));
});

test('applyAnalystPlayerUpdates updates player IP/OOP roles, status, stats, and notes from chat', () => {
  const { updatedPlayers, matchedNames } = applyAnalystPlayerUpdates(
    samplePlayers,
    [
      {
        name: 'Karinda',
        ipRole: 'Inside Forward (IF)',
        oopRole: 'Tracking Winger (TW)',
        status: 'Starter',
        goalsAdded: 1,
        rating: 7.45,
        notes: 'Switched to Inside Forward IP + Tracking Winger OOP via Analyst Chat',
      },
    ]
  );

  assert.deepEqual(matchedNames, ['Nathan Karinda']);
  const karinda = updatedPlayers.find((p) => p.name === 'Nathan Karinda')!;
  assert.equal(karinda.ipRole, 'Inside Forward (IF)');
  assert.equal(karinda.oopRole, 'Tracking Winger (TW)');
  assert.equal(karinda.goals, 4);
  assert.equal(karinda.rating, 7.45);
  assert.ok(karinda.notes.includes('Switched to Inside Forward IP'));
});

test('buildLiveTacticalAnalystContext aligns with War Room XI, 100%-Fit XI, Transfers Depth Chart, PosFam, and Cup-only bans', () => {
  const shala: PlayerRecord = {
    ...samplePlayers[1],
    id: 'p-shala',
    uid: 501,
    name: 'Visar Shala',
    position: 'AM (RC), ST (C)',
    ability: 3.5,
    potential: 4.5,
    positionRatings: { AMC: 20, AMR: 18, ST: 15, MC: 2 },
  };
  const coens: PlayerRecord = {
    ...samplePlayers[1],
    id: 'p-coens',
    uid: 502,
    name: 'Søren Coens',
    position: 'M (C)',
    ability: 3.5,
    potential: 4.0,
    positionRatings: { MC: 20, DM: 15 },
    activeSuspensions: [
      {
        playerUid: 502,
        playerName: 'Søren Coens',
        matchesRemaining: 1,
        competitionName: 'Croky Cup',
        scope: 'cup',
        reason: 'Red Card',
      },
    ],
  };

  const ctx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2027',
    nextFixture: '18/09/2027 vs KSV Cercle Brugge U23 (A)',
    leagueStandingSub: '#6 of 16',
    wageSpend: '£5,000 / £5,500 p/w',
    balance: '£200K',
    players: [...samplePlayers, shala, coens],
    matches: sampleMatches,
    hydratedFmSave: {
      decodedPayload: {
        meta: { clubName: 'KVV Zelzate', managerName: 'Bobby Dean' },
        upcomingFixtures: [
          {
            dateIso: '2027-09-18',
            dateDmy: '18/09/2027',
            competition: 'Eerste Nationale VV',
            opponent: 'KSV Cercle Brugge U23',
            venue: 'A',
          },
        ],
      },
      activeSuspensions: coens.activeSuspensions,
    } as never,
  });

  assert.ok(ctx.includes('100%-FIT FULL-STRENGTH BEST XI'));
  assert.ok(ctx.includes('TRANSFERS & SQUAD ADVICE POSITIONAL DEPTH CHART'));
  assert.ok(ctx.includes('PosFam[AMC:20,AMR:18,ST:15,MC:2]'));
  assert.ok(ctx.includes('OTHER-COMPETITION BANS ONLY'));
  assert.ok(ctx.includes('ELIGIBLE for Eerste Nationale VV'));
  assert.equal(ctx.includes('DO NOT SELECT AS STARTER'), false);
});

test('buildLiveTacticalAnalystContext exposes full season stats (G/xG/A/xA/mins), SURPLUS status, Transfers Action Plan, and deprioritizes Surplus players on B-Team', () => {
  const epolo: PlayerRecord = {
    ...samplePlayers[1],
    id: 'p-epolo',
    name: 'Mbey Epolo',
    position: 'ST (C)',
    apps: '6',
    minutes: 510,
    goals: 4,
    xG: 3.1,
    assists: 1,
    xA: 0.9,
    rating: 7.2,
    ability: 4.0,
    potential: 4.5,
    wagePw: 420,
    expires: '30/06/2029',
    status: 'Starter',
    positionRatings: { ST: 20 },
  };
  const wolf: PlayerRecord = {
    ...samplePlayers[1],
    id: 'p-wolf',
    name: 'Wolf Ackx',
    position: 'ST (C), AM (L)',
    apps: '8 (3)',
    minutes: 730,
    goals: 0,
    xG: 1.42,
    assists: 1,
    xA: 1.8,
    rating: 6.63,
    ability: 3.5,
    potential: 5.0,
    wagePw: 541,
    expires: '30/06/2029',
    status: 'Surplus',
    contractDetails: {
      promisedPlayingTime: 'Surplus To Requirements',
      optionalExtensionYears: 0,
      releaseClauses: [],
      bonuses: {},
      loanWageContributionPct: null,
    },
    positionRatings: { ST: 20, AML: 19 },
  };
  const ndefe: PlayerRecord = {
    ...samplePlayers[1],
    id: 'p-ndefe',
    name: 'Mauricio Jr Ndefe',
    position: 'ST (C), AM (L)',
    apps: '2',
    minutes: 90,
    goals: 1,
    xG: 0.65,
    assists: 0,
    xA: 0.2,
    rating: 6.9,
    age: 19,
    ability: 3.5,
    potential: 4.5,
    wagePw: 0,
    expires: '30/06/2029',
    status: 'Youth',
    positionRatings: { ST: 20, AML: 18 },
  };

  const fillerStarters: PlayerRecord[] = [
    { ...samplePlayers[0], id: 'f-gk2', name: 'Jasper Baeyens', position: 'GK', ability: 3.0, positionRatings: { GK: 20 } },
    { ...samplePlayers[1], id: 'f-rb', name: 'Arthur Devos', position: 'D (R)', positionRatings: { DR: 20 } },
    { ...samplePlayers[1], id: 'f-rb2', name: 'Backup RB', position: 'D (R)', ability: 3.0, positionRatings: { DR: 20 } },
    { ...samplePlayers[1], id: 'f-cb1', name: 'Brend Leeflang', position: 'D (C)', positionRatings: { DC: 20 } },
    { ...samplePlayers[1], id: 'f-cb2', name: 'Brendan Schoonbaert', position: 'D (C)', positionRatings: { DC: 20 } },
    { ...samplePlayers[1], id: 'f-cb3', name: 'Tijs Temmerman', position: 'D (C)', ability: 3.0, positionRatings: { DC: 20 } },
    { ...samplePlayers[1], id: 'f-cb4', name: 'Bjerre Verlinden', position: 'D (C)', ability: 3.0, positionRatings: { DC: 20 } },
    { ...samplePlayers[1], id: 'f-lb', name: 'Lazarus Nkemdirim', position: 'D (L)', positionRatings: { DL: 20 } },
    { ...samplePlayers[1], id: 'f-lb2', name: 'Backup LB', position: 'D (L)', ability: 3.0, positionRatings: { DL: 20 } },
    { ...samplePlayers[1], id: 'f-dm', name: 'Benjamin Melkebeke', position: 'DM', positionRatings: { DM: 20 } },
    { ...samplePlayers[1], id: 'f-dm2', name: 'Backup DM', position: 'DM', ability: 3.0, positionRatings: { DM: 20 } },
    { ...samplePlayers[1], id: 'f-cm1', name: 'Soren Coens', position: 'M (C)', positionRatings: { MC: 20 } },
    { ...samplePlayers[1], id: 'f-cm2', name: 'Sander Dieltjens', position: 'M (C)', positionRatings: { MC: 20 } },
    { ...samplePlayers[1], id: 'f-cm3', name: 'Backup CM1', position: 'M (C)', ability: 3.0, positionRatings: { MC: 20 } },
    { ...samplePlayers[1], id: 'f-cm4', name: 'Backup CM2', position: 'M (C)', ability: 3.0, positionRatings: { MC: 20 } },
    { ...samplePlayers[1], id: 'f-lw', name: 'Matteo Polizzi', position: 'AM (L)', positionRatings: { AML: 20 } },
    { ...samplePlayers[1], id: 'f-rw2', name: 'Jerayson Hoepel', position: 'AM (R)', ability: 3.5, positionRatings: { AMR: 20 } },
    { ...samplePlayers[1], id: 'f-lw2', name: 'Quinten Boudry', position: 'AM (L)', ability: 3.5, positionRatings: { AML: 20 } },
  ];

  const ctx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2027',
    nextFixture: '18/09/2027 vs KSV Cercle Brugge U23 (A)',
    leagueStandingSub: '#6 of 16',
    wageSpend: '£10,257 / £10,203 p/w',
    balance: '-£749K',
    players: [...samplePlayers, ...fillerStarters, epolo, wolf, ndefe],
    matches: sampleMatches,
    hydratedFmSave: null,
  });

  // Authoritative Transfers Action Plan block present
  assert.ok(ctx.includes('TRANSFERS & SQUAD ADVICE ACTION PLAN (MUST MATCH TRANSFERS TAB)'));
  assert.ok(ctx.includes('SURPLUS TO REQUIREMENTS (Active Sale Targets'));
  assert.ok(ctx.includes('Wolf Ackx(£541/wk,730m,0G/1.42xG,1A)'));
  assert.ok(ctx.includes('Promote to Backup (DO NOT LOAN OUT)'));
  assert.ok(ctx.includes('Mauricio Jr Ndefe'));

  // Full season stats & standing exposed on player profile lines
  assert.ok(ctx.includes('8 (3)/730m 0G(1.42xG) 1A(1.80xA) 6.63rt'));
  assert.ok(ctx.includes('|SURPLUS|£541/wk|'));

  // Non-surplus backup Ndefe beats Surplus Wolf Ackx for the B-Team ST slot
  const bTeamLine = ctx.split('\n').find((l) => l.startsWith('B-Team:')) || '';
  assert.ok(bTeamLine.includes('ST:Mauricio Jr Ndefe'), `Expected Ndefe as B-Team ST, got: ${bTeamLine}`);
});

test('accuracy audit: userQuery surfaces player #35, dynamic staff expiry works in 2030, negative journey deltas are signed, and server MAX_CONTEXT_CHARS never truncates liveAppContext', async () => {
  const { MAX_CONTEXT_CHARS } = await import('../../server/config.ts');
  const { MAX_LIVE_ANALYST_CONTEXT_CHARS } = await import('./tacticalAnalystContext.ts');
  assert.ok(
    MAX_CONTEXT_CHARS >= MAX_LIVE_ANALYST_CONTEXT_CHARS,
    `Server MAX_CONTEXT_CHARS (${MAX_CONTEXT_CHARS}) must be >= MAX_LIVE_ANALYST_CONTEXT_CHARS (${MAX_LIVE_ANALYST_CONTEXT_CHARS}) so SQUAD PROFILES and Journey Report are never clipped`
  );

  // Create 36 players so player #35 would normally be dropped by the top-26 cap
  const manyPlayers: PlayerRecord[] = Array.from({ length: 36 }, (_, idx) => ({
    ...samplePlayers[1],
    id: `p-${idx}`,
    name: idx === 34 ? 'Kobe Vermeulen' : `Squad Player ${idx + 1}`,
    position: 'M (C)',
    ability: idx === 34 ? 1.5 : 4.0 - idx * 0.05,
    potential: 3.5,
    minutes: idx === 34 ? 12 : 900 - idx * 10,
    teamSlot: idx === 34 ? 2 : 0,
    squadUnit: idx === 34 ? 'U21' : 'First Team',
  }));

  const ctx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2030',
    nextFixture: '18/09/2030 vs KVK Ninove (H)',
    leagueStandingSub: '#2 of 16',
    wageSpend: '£9,000 / £12,000 p/w',
    balance: '+£420K',
    players: manyPlayers,
    matches: sampleMatches,
    hydratedFmSave: null,
    staff: [
      {
        id: 'st-exp',
        name: 'Pieter Coach',
        role: 'Assistant Manager',
        age: 42,
        nation: 'BEL',
        club: 'KVV Zelzate',
        wagePw: 400,
        expires: '31/12/2030',
        secondaryJob: 'Set Piece Coach',
        attributes: {} as never,
      },
      {
        id: 'st-next-year',
        name: 'Wouter Analyst',
        role: 'Data Analyst',
        age: 34,
        nation: 'BEL',
        club: 'KVV Zelzate',
        wagePw: 250,
        expires: '30/06/2031',
        attributes: {} as never,
      },
      {
        id: 'st-far',
        name: 'Lukas Scout',
        role: 'Chief Scout',
        age: 39,
        nation: 'BEL',
        club: 'KVV Zelzate',
        wagePw: 300,
        expires: '30/06/2033',
        attributes: {} as never,
      },
    ],
    latestJourneyReport: {
      fromDate: '01/05/2030',
      toDate: '15/09/2030',
      fromSeason: '2029/30',
      toSeason: '2030/31',
      sameSeason: false,
      clubName: 'KVV Zelzate',
      baseDiff: {
        fromDate: '01/05/2030',
        toDate: '15/09/2030',
        totalTracked: 36,
        risers: [],
        fallers: [],
        newgens: [],
        departed: [],
        contractChanges: [],
        kpiDeltas: {
          fromSquadCount: 35,
          toSquadCount: 36,
          squadCountDelta: 1,
          fromAvgAbility: 3.1,
          toAvgAbility: 3.2,
          avgAbilityDelta: 0.1,
          fromTotalWagePw: 8800,
          toTotalWagePw: 9000,
          totalWageDeltaPw: 200,
          fromBalance: '+£300K',
          toBalance: '+£420K',
        },
      },
      improved: [],
      worsened: [],
      thingsToNote: [],
      playerStatDeltas: [
        {
          uid: 1001,
          name: 'Squad Player 1',
          position: 'M (C)',
          goalsDelta: -3,
          assistsDelta: -1,
          minutesDelta: -450,
          ratingFrom: 7.2,
          ratingTo: 6.95,
          ratingDelta: -0.25,
        },
      ],
      timeline: [],
    } as never,
    userQuery: 'Should we give Vermeulen cup minutes this week?',
  });

  // 1. Player #35 ("Kobe Vermeulen") surfaced into SQUAD PROFILES via userQuery
  assert.ok(ctx.includes('Kobe Vermeulen[U21]'), 'Expected queried U21 player #35 to be surfaced into SQUAD PROFILES');

  // 2. Staff expiry uses the shared 190-day window relative to the save date: 31/12/2030
  //    (107 days out) is flagged, 30/06/2031 (288 days) and 30/06/2033 are not.
  assert.ok(ctx.includes('Pieter Coach(Assistant Manager,exp 31/12/2030)'));
  assert.ok(!ctx.includes('Wouter Analyst(Data Analyst,exp 30/06/2031)'));
  assert.ok(!ctx.includes('Lukas Scout(Chief Scout,exp 30/06/2033)'));
  // ...and the Analyst quotes the same payroll total and secondary jobs as the Staff tab.
  assert.ok(ctx.includes('Weekly Staff Payroll: £950/wk'));
  assert.ok(ctx.includes('Secondary Jobs: Pieter Coach:Set Piece Coach'));

  // 3. Negative cross-season deltas are cleanly signed (-3G/-1A/-450m, never +-3G)
  assert.ok(ctx.includes('Squad Player 1 (-3G/-1A/-450m, 6.95rt)'));
  assert.ok(!ctx.includes('+-3G'));
});

test('accuracy audit: applyAnalystPlayerUpdates avoids shared-surname collisions', () => {
  const twins: PlayerRecord[] = [
    { ...samplePlayers[0], id: 'dv-1', name: 'Tom De Vries', status: 'Starter', ipRole: 'Channel Forward' },
    { ...samplePlayers[1], id: 'dv-2', name: 'Jan De Vries', status: 'Rotation', ipRole: 'Central Midfielder' },
    { ...samplePlayers[1], id: 'u-1', name: 'Bram Peeters', status: 'Rotation', ipRole: 'Central Midfielder' },
  ];

  // Exact name targets ONLY Tom De Vries
  const exactRes = applyAnalystPlayerUpdates(twins, [
    { name: 'Tom De Vries', status: 'Rotation', notes: 'Rested' },
  ]);
  assert.deepEqual(exactRes.matchedNames, ['Tom De Vries']);
  assert.equal(exactRes.updatedPlayers[0].status, 'Rotation');
  assert.equal(exactRes.updatedPlayers[1].status, 'Rotation');
  assert.equal(exactRes.updatedPlayers[1].notes, twins[1].notes);

  // Ambiguous shared surname matches NEITHER twin, while unique surname "Peeters" still matches Bram Peeters
  const ambigRes = applyAnalystPlayerUpdates(twins, [
    { name: 'De Vries', status: 'Injured', notes: 'Should not collide' },
    { name: 'Peeters', ipRole: 'Deep-Lying Playmaker', notes: 'Unique surname OK' },
  ]);
  assert.deepEqual(ambigRes.matchedNames, ['Bram Peeters']);
  assert.equal(ambigRes.updatedPlayers[0].status, 'Starter');
  assert.equal(ambigRes.updatedPlayers[1].status, 'Rotation');
  assert.equal(ambigRes.updatedPlayers[2].ipRole, 'Deep-Lying Playmaker');
});

test('accuracy audit: findLastMatchStat never fabricates stale ratings and computeCompetitiveSummary isolates seasons & European cups', async () => {
  const { buildLastMatchTacticBlueprint } = await import('./clubGovernanceAndTactics.ts');
  const { computeCompetitiveSummary } = await import('./fmSyncEngine.ts');

  const dcPlayer: PlayerRecord = {
    ...samplePlayers[1],
    id: 'dc-1',
    uid: 777,
    name: 'Brendan Schoonbaert',
    position: 'D (C)',
    positionRatings: { DC: 20 },
  };
  const absentPlayer: PlayerRecord = {
    ...samplePlayers[1],
    id: 'st-2',
    uid: 888,
    name: 'Absent Striker',
    position: 'ST (C)',
    positionRatings: { ST: 20 },
  };

  const bp = buildLastMatchTacticBlueprint(
    {
      meta: {
        clubName: 'KVV Zelzate',
        managerName: 'Bobby Dean',
        gameDateIso: '2027-09-15',
        gameDateDmy: '15/09/2027',
        saveName: 'test.fm',
      },
      players: [],
      staff: [],
      playedMatches: [
        {
          dateIso: '2027-09-12',
          dateDmy: '12/09/2027',
          competition: 'Eerste Nationale VV',
          opponent: 'KVK Ninove',
          venue: 'H',
          result: 'W',
          score: '2 - 0',
        },
      ],
      upcomingFixtures: [],
      playerMatchStats: {
        // Chronological: oldest first, newest last
        '777': [
          { date: '15/08/2027', opponent: 'Old FC', rating: 6.1, goals: 0, assists: 0 },
          { date: '12/09/2027', opponent: 'KVK Ninove', rating: 7.8, goals: 1, assists: 0 },
        ],
        // Absent player only played 4 weeks earlier — must NOT appear as last-match rating vs Ninove
        '888': [
          { date: '15/08/2027', opponent: 'Old FC', rating: 8.4, goals: 2, assists: 0 },
        ],
      },
      tactics: [
        {
          name: '4-3-3 Press',
          mentality: 'Positive',
          inPossessionFormation: '4-3-3 DM Wide',
          outOfPossessionFormation: '4-3-3 DM Wide',
          slots: [
            {
              slotIndex: 0,
              position: 'DCR',
              playerUid: 777,
              playerName: 'Brendan Schoonbaert',
              inPossessionRole: 'Ball-Playing Centre-Back',
              outOfPossessionRole: 'Stopping Centre-Back',
            },
            {
              slotIndex: 1,
              position: 'STCR',
              playerUid: 888,
              playerName: 'Absent Striker',
              inPossessionRole: 'Channel Forward',
              outOfPossessionRole: 'Centre Forward',
            },
          ],
        },
      ],
    } as never,
    [dcPlayer, absentPlayer]
  );

  assert.ok(bp);
  assert.equal(bp!.starters[0].lastMatchRating, 7.8, 'Should match DD/MM/YYYY against ISO dateIso and pick newest match');
  assert.equal(bp!.starters[1].lastMatchRating, null, 'Should return null rather than attributing a month-old rating when player missed last match');
  assert.ok(bp!.tacticalEffectivenessScore >= 75, `Expected natural DC:20 & ST:20 in DCR/STCR slots to score high, got ${bp!.tacticalEffectivenessScore}`);

  // Season isolation & Europa League exclusion from domestic league summary
  const mixedMatches: MatchLogEntry[] = [
    { ...sampleMatches[0], id: 'old-1', date: '10/04/2027', competition: 'Eerste Nationale VV', result: 'L' },
    { ...sampleMatches[0], id: 'cur-lge', date: '12/09/2027', competition: 'Eerste Nationale VV', result: 'W' },
    { ...sampleMatches[0], id: 'cur-uel', date: '16/09/2027', competition: 'UEFA Europa League', result: 'L' },
    { ...sampleMatches[0], id: 'cur-pre', date: '20/07/2027', competition: 'Pre-Season Friendly', result: 'W' },
  ];
  const curSummary = computeCompetitiveSummary(mixedMatches, '18/09/2027');
  assert.equal(curSummary.played, 1, 'Should only count 2027/28 domestic league match (excluding 2026/27, Europa League cup, and Pre-Season)');
  assert.equal(curSummary.wins, 1);
});

test('diagnoseTacticalAnalystPayload & logTacticalAnalystPayloadDiagnostics verify char limits and decoded .fm save mappings', async () => {
  const { MAX_CONTEXT_CHARS } = await import('../../server/config.ts');
  const {
    SERVER_MAX_CONTEXT_CHARS,
    diagnoseTacticalAnalystPayload,
    logTacticalAnalystPayloadDiagnostics,
  } = await import('./tacticalAnalystContext.ts');

  assert.equal(
    SERVER_MAX_CONTEXT_CHARS,
    MAX_CONTEXT_CHARS,
    'Client diagnostic SERVER_MAX_CONTEXT_CHARS must stay synchronized with server/config.ts MAX_CONTEXT_CHARS'
  );

  const mkContract = (promisedPlayingTime: string) => ({
    promisedPlayingTime,
    releaseClauses: [],
    optionalExtensionYears: 0,
    bonuses: {} as never,
    loanWageContributionPct: null,
  });

  const squad11: PlayerRecord[] = [
    { ...samplePlayers[1], id: 'd-gk', uid: 1, name: 'Rene GK', position: 'GK', positionRatings: { GK: 20 }, contractDetails: mkContract('Star Player'), minutes: 180 },
    { ...samplePlayers[1], id: 'd-rb', uid: 2, name: 'Arthur RB', position: 'D (R)', positionRatings: { DR: 20 }, contractDetails: mkContract('Regular Starter'), minutes: 450 },
    { ...samplePlayers[1], id: 'd-cb1', uid: 3, name: 'Brendan CB1', position: 'D (C)', positionRatings: { DC: 20 }, contractDetails: mkContract('Important Player'), minutes: 450 },
    { ...samplePlayers[1], id: 'd-cb2', uid: 4, name: 'Brend CB2', position: 'D (C)', positionRatings: { DC: 20 }, contractDetails: mkContract('Regular Starter'), minutes: 450 },
    { ...samplePlayers[1], id: 'd-lb', uid: 5, name: 'Lazarus LB', position: 'D (L)', positionRatings: { DL: 20 }, contractDetails: mkContract('Regular Starter'), minutes: 450 },
    { ...samplePlayers[1], id: 'd-dm', uid: 6, name: 'Benjamin DM', position: 'DM', positionRatings: { DM: 20 }, contractDetails: mkContract('Important Player'), minutes: 450 },
    { ...samplePlayers[1], id: 'd-cm1', uid: 7, name: 'Soren CM1', position: 'M (C)', positionRatings: { MC: 20 }, contractDetails: mkContract('Regular Starter'), minutes: 450 },
    { ...samplePlayers[1], id: 'd-cm2', uid: 8, name: 'Sander CM2', position: 'M (C)', positionRatings: { MC: 20 }, contractDetails: mkContract('Regular Starter'), minutes: 450 },
    { ...samplePlayers[1], id: 'd-rw', uid: 9, name: 'Jerayson RW', position: 'AM (R)', positionRatings: { AMR: 20 }, contractDetails: mkContract('Regular Starter'), minutes: 450 },
    { ...samplePlayers[1], id: 'd-lw', uid: 10, name: 'Matteo LW', position: 'AM (L)', positionRatings: { AML: 20 }, contractDetails: mkContract('Regular Starter'), minutes: 450 },
    { ...samplePlayers[0], id: 'd-st', uid: 11, name: 'Lennert ST', position: 'ST (C)', positionRatings: { ST: 20 }, contractDetails: mkContract('Star Player'), minutes: 450 },
  ];

  const hydratedMock = {
    leagueRecordLabel: '#3 · 12 pts (5 GP)',
    decodedPayload: {
      meta: {
        clubName: 'KVV Zelzate',
        managerName: 'Bobby Dean',
        gameDateIso: '2027-09-15',
        gameDateDmy: '15/09/2027',
        saveName: 'zelzate.fm',
      },
      players: [],
      staff: [],
      playedMatches: [
        { dateIso: '2027-09-12', dateDmy: '12/09/2027', competition: 'Eerste Nationale VV', opponent: 'KVK Ninove', venue: 'H', result: 'W', score: '2 - 0' },
        { dateIso: '2027-09-05', dateDmy: '05/09/2027', competition: 'Eerste Nationale VV', opponent: 'RAEC Mons', venue: 'A', result: 'W', score: '1 - 0' },
        { dateIso: '2027-08-29', dateDmy: '29/08/2027', competition: 'Eerste Nationale VV', opponent: 'KSC Lokeren', venue: 'H', result: 'W', score: '2 - 1' },
        { dateIso: '2027-08-22', dateDmy: '22/08/2027', competition: 'Eerste Nationale VV', opponent: 'Knokke', venue: 'A', result: 'W', score: '3 - 1' },
        { dateIso: '2027-08-15', dateDmy: '15/08/2027', competition: 'Eerste Nationale VV', opponent: 'Tienen', venue: 'H', result: 'L', score: '0 - 1' },
      ],
      upcomingFixtures: [
        { dateDmy: '18/09/2027', competition: 'Eerste Nationale VV', opponent: 'Jong Cercle', venue: 'A' },
      ],
      leagueStanding: {
        position: 3,
        played: 5,
        won: 4,
        drawn: 0,
        lost: 1,
        goalsFor: 8,
        goalsAgainst: 3,
        goalDiff: 5,
        points: 12,
        teamCount: 16,
      },
      governance: {
        managerContract: {
          available: true,
          managerName: 'Bobby Dean',
          wagePw: 650,
          expires: '30/06/2029',
          contractExpiryMonths: 21,
        },
        boardObjectives: [
          { id: 'obj-1', title: 'Finish in Top Half', importance: 'Required', status: 'On Track' },
        ],
        clubPromises: [
          { id: 'prm-1', subject: 'Give Rene GK more starts', targetName: 'Rene GK', status: 'At Risk' },
        ],
      },
      tactics: [
        {
          name: '4-3-3 Counter Press',
          mentality: 'Positive',
          inPossessionFormation: '4-3-3 DM Wide',
          outOfPossessionFormation: '4-3-3 DM Wide',
          slots: [
            { slotIndex: 0, position: 'GK', playerUid: 1, playerName: 'Rene GK', inPossessionRole: 'No-Nonsense Goalkeeper', outOfPossessionRole: 'Line-Holding Keeper' },
            { slotIndex: 1, position: 'ST', playerUid: 11, playerName: 'Lennert ST', inPossessionRole: 'Channel Forward', outOfPossessionRole: 'Centre Forward' },
          ],
        },
      ],
    },
  } as never;

  const stateInput = {
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2027',
    nextFixture: '18/09/2027 vs Jong Cercle (A)',
    leagueStandingSub: '#3 of 16',
    wageSpend: '£8,200 / £10,000 p/w',
    balance: '-£420K',
    players: squad11,
    matches: sampleMatches,
    hydratedFmSave: hydratedMock,
    userQuery: 'Audit my lineup and promises for Jong Cercle',
  };

  const logCalls: string[] = [];
  const report = logTacticalAnalystPayloadDiagnostics(
    stateInput,
    {
      message: stateInput.userQuery,
      history: [{ role: 'user', text: 'Previous turn question' }],
      reasoningMode: 'deep_high',
      nextEventNumber: 12,
    },
    {
      groupCollapsed: (t) => logCalls.push(`GROUP:${String(t)}`),
      table: () => logCalls.push('TABLE'),
      log: () => logCalls.push('LOG'),
      warn: (w) => logCalls.push(`WARN:${String(w)}`),
      groupEnd: () => logCalls.push('END'),
    }
  );

  assert.equal(report.passed, true, `Expected clean diagnostics pass, got warnings: ${report.warnings.join('; ')}`);
  assert.equal(report.limits.withinLiveLimit, true);
  assert.equal(report.limits.withinServerLimit, true);
  assert.equal(report.limits.wasTrimmed, false);
  assert.equal(report.requiredData.clubStanding.ok, true);
  assert.equal(report.requiredData.clubStanding.source, 'decoded_fm_save');
  assert.equal(report.requiredData.nextOpponent.ok, true);
  assert.equal(report.requiredData.nextOpponent.decodedExpected, 'Jong Cercle');
  assert.equal(report.requiredData.squadRoleFits.ok, true);
  assert.equal(report.requiredData.squadRoleFits.warRoomFilledSlots, 11);
  assert.equal(report.requiredData.squadRoleFits.decodedIpRoles, 2);
  assert.equal(report.requiredData.squadRoleFits.decodedOopRoles, 2);
  assert.equal(report.requiredData.boardPromises.ok, true);
  assert.equal(report.requiredData.boardPromises.boardObjectivesCount, 1);
  assert.equal(report.requiredData.boardPromises.clubPromisesCount, 1);
  assert.ok(report.requiredData.boardPromises.playerPromiseAuditsCount >= 1);
  assert.equal(report.privacyAudit.zeroRawCaPa, true);
  assert.ok(report.sections.length >= 6);
  assert.ok(logCalls.some((c) => c.startsWith('GROUP:[FM27 Analyst Payload Diagnostics] PASS')));
  assert.equal(logCalls.filter((c) => c === 'TABLE').length, 3);
  assert.equal(logCalls[logCalls.length - 1], 'END');

  // Verify warnings fire when context exceeds limits, drops opponent, or leaks raw CA
  const badReport = diagnoseTacticalAnalystPayload(stateInput, {
    liveAppContextOverride: `${'X'.repeat(SERVER_MAX_CONTEXT_CHARS + 50)}\nCA: 135\n[Context trimmed]`,
    importedFileContext: 'Y'.repeat(SERVER_MAX_CONTEXT_CHARS + 10),
  });
  assert.equal(badReport.passed, false);
  assert.equal(badReport.limits.withinServerLimit, false);
  assert.equal(badReport.limits.importedWithinServerLimit, false);
  assert.equal(badReport.privacyAudit.zeroRawCaPa, false);
  assert.equal(badReport.requiredData.nextOpponent.ok, false);
  assert.ok(badReport.warnings.length >= 4);
});

test('validatePreFlightAnalystPayload flags missing or null required fields and advises re-import', async () => {
  const {
    validatePreFlightAnalystPayload,
    runPreFlightAnalystValidation,
  } = await import('./tacticalAnalystContext.ts');

  // 1. Direct payload with all 4 required fields present passes cleanly
  const okResult = validatePreFlightAnalystPayload({
    clubStanding: '#3 · 12 pts (5 GP)',
    nextOpponent: { opponent: 'Jong Cercle', competition: 'Eerste Nationale VV' },
    squadRoleFits: { warRoomFilledSlots: 11, warRoomAvgFitPct: 91 },
    boardPromises: { boardObjectivesCount: 2, clubPromisesCount: 1, playerPromiseAuditsCount: 11 },
  });
  assert.equal(okResult.valid, true);
  assert.equal(okResult.needsReimport, false);
  assert.deepEqual(okResult.missingFields, []);
  assert.equal(okResult.warningMessage, null);

  // 2. Direct payload with null / undefined / placeholder fields fails with exact missingFields & re-import warning
  const partialResult = validatePreFlightAnalystPayload({
    clubStanding: null,
    nextOpponent: 'Awaiting .fm save import',
    squadRoleFits: { warRoomFilledSlots: 11, warRoomAvgFitPct: 88 },
    boardPromises: undefined,
  });
  assert.equal(partialResult.valid, false);
  assert.equal(partialResult.needsReimport, true);
  assert.deepEqual(partialResult.missingFields, [
    'clubStanding',
    'nextOpponent',
  ]);
  assert.equal(partialResult.fields.squadRoleFits.present, true);
  assert.equal(partialResult.fields.clubStanding.present, false);
  assert.equal(partialResult.fields.nextOpponent.present, false);
  assert.equal(partialResult.fields.boardPromises.present, false);
  assert.equal(partialResult.fields.boardPromises.informational, true);
  assert.match(partialResult.fields.boardPromises.detail, /None active|not exposed/i);
  assert.ok(partialResult.warningMessage?.includes('Club Standing'));
  assert.ok(partialResult.warningMessage?.includes('Next Opponent'));
  assert.ok(!partialResult.warningMessage?.includes('Board Promises'));
  assert.ok(partialResult.warningMessage?.toLowerCase().includes('re-import'));

  // 2b. Missing/empty boardPromises alone must NEVER trigger the amber re-import banner
  const boardOnlyResult = validatePreFlightAnalystPayload({
    clubStanding: '#3 · 12 pts (5 GP)',
    nextOpponent: { opponent: 'Jong Cercle', competition: 'Eerste Nationale VV' },
    squadRoleFits: { warRoomFilledSlots: 11, warRoomAvgFitPct: 91 },
    boardPromises: null,
  });
  assert.equal(boardOnlyResult.valid, true);
  assert.equal(boardOnlyResult.needsReimport, false);
  assert.deepEqual(boardOnlyResult.missingFields, []);
  assert.equal(boardOnlyResult.warningTitle, null);
  assert.equal(boardOnlyResult.warningMessage, null);
  assert.equal(boardOnlyResult.fields.boardPromises.present, false);
  assert.equal(boardOnlyResult.fields.boardPromises.informational, true);
  assert.match(boardOnlyResult.fields.boardPromises.detail, /None active|not exposed/i);

  // 3. End-to-end runPreFlightAnalystValidation catches missing nextOpponent & boardPromises from partially extracted .fm save
  const partialState = {
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2027',
    nextFixture: '--',
    leagueStandingSub: '#6 of 16 (9 Pts)',
    wageSpend: '£8,200 / £10,000 p/w',
    balance: '-£420K',
    players: samplePlayers,
    matches: sampleMatches,
    hydratedFmSave: {
      leagueRecordLabel: '#6 · 9 pts (5 GP)',
      decodedPayload: {
        meta: {
          clubName: 'KVV Zelzate',
          managerName: 'Bobby Dean',
          gameDateIso: '2027-09-15',
          gameDateDmy: '15/09/2027',
          saveName: 'partial.fm',
        },
        players: [],
        staff: [],
        playedMatches: [],
        upcomingFixtures: [],
        leagueStanding: {
          position: 6,
          played: 5,
          won: 3,
          drawn: 0,
          lost: 2,
          goalsFor: 7,
          goalsAgainst: 5,
          goalDiff: 2,
          points: 9,
          teamCount: 16,
        },
      },
    } as never,
  };

  const { payload, validation } = runPreFlightAnalystValidation(partialState);
  assert.ok(payload.clubStanding !== null, 'clubStanding should be extracted');
  assert.ok(payload.squadRoleFits !== null, 'squadRoleFits should be extracted');
  assert.equal(payload.nextOpponent, null, 'nextOpponent should be null when upcomingFixtures is empty');
  assert.equal(payload.boardPromises, null, 'boardPromises should be null when governance/promises are not exposed');
  assert.equal(validation.valid, false);
  assert.equal(validation.needsReimport, true);
  assert.deepEqual(validation.missingFields, ['nextOpponent']);
  assert.equal(validation.fields.boardPromises.present, false);
  assert.equal(validation.fields.boardPromises.informational, true);
  assert.match(validation.fields.boardPromises.detail, /None active|not exposed/i);
  assert.ok(!validation.warningMessage?.includes('Board Promises'));
});






test('squad profile block is the single squad source: Best Fit % and pool counts match the UI', () => {
  const ctx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2027',
    nextFixture: '18/09/2027 vs Jong Cercle (Away)',
    leagueStandingSub: '#3 of 16 (6 Pts)',
    wageSpend: '£4,200 / £4,800 p/w',
    balance: '£210K',
    players: samplePlayers,
    matches: sampleMatches,
    hydratedFmSave: null,
  });

  const counts = countSquadPool(samplePlayers);
  assert.ok(
    ctx.includes(`OF ${counts.fullPool} FULL POOL`),
    'squad header must carry the Full Pool count the Squad tab shows'
  );
  assert.ok(
    ctx.includes(`${counts.firstTeam} FIRST TEAM`),
    'squad header must carry the First Team count the Squad tab shows'
  );

  // Every profiled player's BF% must equal the exact number PlayerDetailModal renders.
  for (const player of samplePlayers) {
    const best = analyzePlayerCard(player, samplePlayers).bestIpRole;
    const expected = best ? `|BF${best.fitPct}%|` : `|BF${MISSING_VALUE}|`;
    const line = ctx.split('\n').find((l) => l.startsWith(`${player.name}`));
    assert.ok(line, `squad line missing for ${player.name}`);
    assert.ok(
      line.includes(expected),
      `${player.name} BF mismatch: expected ${expected} in ${line}`
    );
  }
});

test('a player with no recorded minutes gets the shared placeholder, never a fake zero stat line', () => {
  const unplayed: PlayerRecord = {
    ...samplePlayers[0],
    id: 'p-unplayed',
    name: 'Unplayed Youth',
    apps: '0',
    minutes: 0,
    rating: null,
    goals: 0,
    assists: 0,
  };
  const ctx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2027',
    nextFixture: '18/09/2027 vs Jong Cercle (Away)',
    leagueStandingSub: '#3 of 16 (6 Pts)',
    wageSpend: '£4,200 / £4,800 p/w',
    balance: '£210K',
    players: [unplayed],
    matches: [],
    hydratedFmSave: null,
  });

  const line = ctx.split('\n').find((l) => l.startsWith('Unplayed Youth'));
  assert.ok(line, 'unplayed player must still be profiled');
  assert.ok(line.includes(`STATS ${MISSING_VALUE}`), `expected shared placeholder, got ${line}`);
  assert.ok(!/\b0m\b/.test(line), 'must not print a zeroed stat line for an unplayed player');
});

test('staff Preferred Jobs carry the specialist-only guardrail so a 1/20 scout is not read as a bad coach', () => {
  const ctx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2027',
    nextFixture: '18/09/2027 vs Jong Cercle (Away)',
    leagueStandingSub: '#3 of 16 (6 Pts)',
    wageSpend: '£4,200 / £4,800 p/w',
    balance: '£210K',
    players: samplePlayers,
    matches: [],
    hydratedFmSave: null,
    staff: [
      {
        id: 'st-scout',
        name: 'Bram Scout',
        role: 'Scout',
        age: 45,
        nation: 'BEL',
        club: 'KVV Zelzate',
        wagePw: 300,
        expires: '30/06/2028',
        attributes: {} as never,
        jobRatings: {
          fitness_coach: 1,
          goalkeeping_coach: 2,
          set_piece_coach: 1,
          loan_manager: 3,
          physio: 1,
          sports_scientist: 2,
        },
      },
    ],
  });

  assert.ok(
    ctx.includes(PREFERRED_JOB_AFFINITY_CAPTION),
    'staff block must use the shared Preferred Job Affinity caption'
  );
  assert.ok(ctx.includes('Bram Scout(Fit 1/GK 2/Set 1/Loan 3/Phy 1/Sci 2)'), 'job ratings missing');
});

test('dense live contexts keep the staff payroll, department leads, and Preferred Job guardrail', () => {
  const manyPlayers: PlayerRecord[] = Array.from({ length: 32 }, (_, index) => ({
    ...samplePlayers[0],
    id: `dense-${index}`,
    number: index + 1,
    name: `Dense Player ${index}`,
  }));

  const ctx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2027',
    nextFixture: '18/09/2027 vs Jong Cercle (Away)',
    leagueStandingSub: '#3 of 16 (6 Pts)',
    wageSpend: '£10,257 / £10,203 p/w',
    balance: '-£749K',
    players: manyPlayers,
    matches: sampleMatches,
    hydratedFmSave: null,
    staff: [
      {
        id: 'st-manager',
        name: 'Bobby Dean',
        role: 'Manager',
        age: 45,
        nation: 'BEL',
        club: 'KVV Zelzate',
        wagePw: 313,
        expires: '30/06/2028',
        attributes: {
          attacking: 17,
          defending: 11,
          fitness: 9,
          goalkeeping: 4,
          mental: 14,
          possession: 15,
          set_pieces: 12,
          tactical: 16,
          technical: 16,
          working_with_youngsters: 15,
          adaptability: 12,
          authority: 15,
          determination: 16,
          judging_player_ability: 14,
          judging_player_potential: 14,
          judging_staff_ability: 12,
          man_management: 15,
          motivating: 16,
          negotiating: 10,
          physiotherapy: 3,
          sports_science: 5,
          tactical_knowledge: 16,
          analysing_data: 14,
        },
        jobRatings: {
          fitness_coach: 1,
          goalkeeping_coach: 2,
          set_piece_coach: 1,
          loan_manager: 3,
          physio: 1,
          sports_scientist: 2,
        },
      },
    ],
  });

  assert.ok(ctx.includes('BACKROOM STAFF'), 'staff block was dropped under budget');
  assert.ok(ctx.includes('Weekly Staff Payroll: £313/wk'), 'staff payroll missing');
  assert.ok(ctx.includes('Department Leads:'), 'department leads missing');
  assert.ok(
    ctx.includes(PREFERRED_JOB_AFFINITY_CAPTION),
    'Preferred Job Affinity guardrail missing'
  );
});

test('Analyst staff ratings match the Staff tab department-first headline', () => {
  const attributes = {
    attacking: 17,
    defending: 11,
    fitness: 9,
    goalkeeping: 4,
    mental: 14,
    possession: 15,
    set_pieces: 12,
    tactical: 16,
    technical: 16,
    working_with_youngsters: 15,
    adaptability: 18,
    authority: 15,
    determination: 16,
    judging_player_ability: 19,
    judging_player_potential: 19,
    judging_staff_ability: 12,
    man_management: 15,
    motivating: 16,
    negotiating: 10,
    physiotherapy: 3,
    sports_science: 5,
    tactical_knowledge: 16,
    analysing_data: 14,
  };

  const ctx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2027',
    nextFixture: '18/09/2027 vs Jong Cercle (Away)',
    leagueStandingSub: '#3 of 16 (6 Pts)',
    wageSpend: '£4,200 / £4,800 p/w',
    balance: '£210K',
    players: samplePlayers,
    matches: [],
    hydratedFmSave: null,
    staff: [
      {
        id: 'st-scout-rated',
        name: 'Sam Scout',
        role: 'Chief Scout',
        age: 45,
        nation: 'BEL',
        club: 'KVV Zelzate',
        wagePw: 300,
        expires: '30/06/2031',
        attributes,
        jobRatings: null,
      },
    ],
  });

  assert.ok(
    ctx.includes(
      'Department Ratings (shared with Staff tab): Sam Scout(scouting — Player Scouting & Recruitment 4.5★)'
    ),
    'Analyst must quote the same department-first headline as the Staff card'
  );
  assert.ok(ctx.includes('Department Leads:'), 'Analyst must see the unified matrix leads');
  assert.ok(
    ctx.includes('Scouting & Recruitment: Sam Scout (4.5★)'),
    'Chief Scout must lead the scouting unit'
  );
  assert.ok(
    !ctx.includes('Attacking Coaching: Sam Scout'),
    'a Chief Scout must never lead Attacking training'
  );
});

test('board/executive staff never lead training and partial staff payroll is labelled', () => {
  const attributes = {
    attacking: 17,
    defending: 11,
    fitness: 9,
    goalkeeping: 4,
    mental: 14,
    possession: 15,
    set_pieces: 12,
    tactical: 16,
    technical: 16,
    working_with_youngsters: 15,
    adaptability: 12,
    authority: 15,
    determination: 16,
    judging_player_ability: 14,
    judging_player_potential: 14,
    judging_staff_ability: 12,
    man_management: 15,
    motivating: 16,
    negotiating: 10,
    physiotherapy: 3,
    sports_science: 5,
    tactical_knowledge: 16,
    analysing_data: 14,
  };

  const ctx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2027',
    nextFixture: '18/09/2027 vs Jong Cercle (Away)',
    leagueStandingSub: '#3 of 16 (6 Pts)',
    wageSpend: '£4,200 / £4,800 p/w',
    balance: '£210K',
    players: samplePlayers,
    matches: [],
    hydratedFmSave: null,
    staff: [
      {
        id: 'st-manager',
        name: 'Real Manager',
        role: 'Manager',
        age: 42,
        nation: 'BEL',
        club: 'KVV Zelzate',
        wagePw: 450,
        expires: '30/06/2029',
        attributes: {
          ...attributes,
          attacking: 18,
          technical: 18,
          tactical: 18,
          determination: 18,
          authority: 18,
          motivating: 18,
        },
      },
      {
        id: 'st-chair',
        name: 'Elite Chair',
        role: 'Chairperson',
        age: 60,
        nation: 'BEL',
        club: 'KVV Zelzate',
        wagePw: null,
        expires: '30/06/2032',
        attributes: {
          ...attributes,
          attacking: 20,
          technical: 20,
          tactical: 20,
          possession: 20,
          defending: 20,
          set_pieces: 20,
          fitness: 20,
          goalkeeping: 20,
        },
      },
      {
        id: 'st-physio',
        name: 'Pat Physio',
        role: 'Head Physio',
        age: 38,
        nation: 'BEL',
        club: 'KVV Zelzate',
        wagePw: null,
        expires: '30/06/2030',
        attributes: {
          ...attributes,
          physiotherapy: 19,
          sports_science: 18,
        },
      },
    ],
  });

  // Chairperson is unpaid/non-contract, so the denominator is the 2 salaried staff.
  assert.ok(
    ctx.includes('Weekly Staff Payroll: £450/wk known (1 of 2 without wage)'),
    'partial payroll must show the known sum instead of hiding it behind --'
  );
  assert.ok(
    ctx.includes('Elite Chair(board — Board / Executive (no coaching rating))'),
    'a Chairperson must be labelled board, never shown a coaching rating'
  );
  const leads = ctx.split('\n').find((line) => line.startsWith('Department Leads:'));
  assert.ok(leads?.includes('Attacking — Technical: Real Manager'));
  assert.match(
    leads ?? '',
    /Real Manager \([^)]*units overloaded\)/,
    'the Analyst must see the same single-lead overload as the Staff matrix'
  );
  assert.ok(!leads?.includes('Elite Chair'), 'board staff must never lead a training unit');
});
