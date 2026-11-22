import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAnalystPlayerUpdates,
  buildConversationTranscript,
  buildLiveTacticalAnalystContext,
} from './tacticalAnalystContext';
import { PlayerRecord, MatchLogEntry } from '../types/fm27';

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


