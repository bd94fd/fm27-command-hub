import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerRecord, MatchLogEntry } from '../types/fm27';
import { RecruitmentTarget } from '../types/fmSave';
import {
  buildClubGovernanceState,
  buildLastMatchTacticBlueprint,
} from './clubGovernanceAndTactics';
import {
  computePositionPercentilePizza,
  evaluateScoutTargetCard,
  evaluateSquadPlayerCard,
} from './cardIntelligenceEngine';
import {
  buildDeepJourneyReport,
  clearAllSaveCache,
  clearSaveHistoryPoints,
  createSaveHistoryPoint,
} from '../services/saveCache';
import { buildLiveTacticalAnalystContext } from './tacticalAnalystContext';
import { JOURNEY_REPORT_SCHEMA } from '../../server/schemas';
import { buildJourneyReportSystemPrompt } from '../../server/prompts';
import {
  describeFm27RoleBrief,
  filterMeaningfulInstructions,
  resolveSquadPlannerSlotMeta,
} from './squadPlannerHelper';
import {
  getFm27RoleTendencies,
  getValidFm27RolesForSlot,
  resolveSlotDualPhaseRoles,
} from './fm27TacticRoleInference';
import {
  classifyMatchCompetitionBucket,
  deriveFootballSeasonLabel,
  formatSignedCurrency,
  summarizeMatchesByScope,
} from './matchScopeHelpers';

function makePlayer(
  overrides: Partial<Omit<PlayerRecord, 'attributes'>> & {
    attributes?: Partial<PlayerRecord['attributes']>;
  } = {}
): PlayerRecord {
  return {
    id: overrides.id ?? 'p-1',
    uid: overrides.uid ?? 1001,
    number: overrides.number ?? 9,
    name: overrides.name ?? 'Mbey Epolo',
    position: overrides.position ?? 'ST (C)',
    apps: overrides.apps ?? '10',
    minutes: overrides.minutes ?? 850,
    rating: overrides.rating !== undefined ? overrides.rating : 7.25,
    goals: overrides.goals ?? 6,
    xG: overrides.xG ?? 4.8,
    xGPer90: overrides.xGPer90 ?? 0.51,
    assists: overrides.assists ?? 2,
    xA: overrides.xA ?? 1.4,
    xAPer90: overrides.xAPer90 ?? 0.15,
    drbPer90: 2.2,
    prPassesPer90: 1.8,
    hdrPct: 62,
    intPer90: 0.6,
    tckPct: 70,
    personality: 'Professional',
    age: overrides.age ?? 22,
    ability: overrides.ability ?? 4.0,
    potential: overrides.potential ?? 4.5,
    condition: overrides.condition ?? 92,
    sharpness: 98,
    preferredFoot: 'Right',
    expires: overrides.expires ?? '30/06/2029',
    nation: 'BEL',
    wagePw: overrides.wagePw ?? 420,
    status: overrides.status ?? 'Starter',
    attributes: {
      pace: 15,
      acceleration: 15,
      stamina: 14,
      jumpingReach: 13,
      determination: 15,
      passing: 12,
      finishing: 14,
      tackling: 8,
      firstTouch: 13,
      decisions: 13,
      workRate: 14,
      offTheBall: 15,
      heading: 12,
      corners: 8,
      crossing: 10,
      technique: 13,
      dribbling: 13,
      composure: 13,
      anticipation: 14,
      ...(overrides.attributes || {}),
    },
    ipRole: overrides.ipRole ?? 'Channel Forward',
    oopRole: overrides.oopRole ?? 'Outlet Centre Forward',
    notes: overrides.notes ?? '',
    contractDetails: overrides.contractDetails,
    teamSlot: overrides.teamSlot ?? 0,
  };
}

test('buildClubGovernanceState auto-extracts manager contract from staff, honestly reports missing board/supporter grades, and audits playing-time promises', () => {
  const starBench = makePlayer({
    id: 'p-star',
    uid: 2001,
    name: 'Frustrated Star',
    minutes: 90,
    contractDetails: {
      promisedPlayingTime: 'Star Player',
      optionalExtensionYears: 0,
      releaseClauses: [],
      bonuses: {},
      loanWageContributionPct: null,
    },
  });
  const regularStarter = makePlayer({
    id: 'p-reg',
    uid: 2002,
    name: 'Happy Starter',
    minutes: 810,
    contractDetails: {
      promisedPlayingTime: 'Regular Starter',
      optionalExtensionYears: 0,
      releaseClauses: [],
      bonuses: {},
      loanWageContributionPct: null,
    },
  });

  const gov = buildClubGovernanceState(
    {
      meta: {
        clubName: 'KVV Zelzate',
        managerName: 'Bobby Dean',
        gameDateDmy: '15/09/2027',
        gameDateIso: '2027-09-15',
      },
      staff: [
        {
          uid: 99,
          name: 'Bobby Dean',
          role: 'Manager',
          age: 35,
          nation: 'ENG',
          wagePw: 650,
          expires: '30/06/2029',
        },
      ],
      playedMatches: Array.from({ length: 10 }, (_, i) => ({
        dateIso: `2027-08-${String(i + 1).padStart(2, '0')}`,
        competition: '1e Nationale VV',
      })),
    } as never,
    [starBench, regularStarter]
  );

  assert.equal(gov.managerContract.available, true);
  assert.equal(gov.managerContract.wagePw, 650);
  assert.equal(gov.managerContract.expires, '30/06/2029');
  assert.equal(gov.boardConfidence.available, false);
  assert.equal(gov.supporterConfidence.available, false);

  const starAudit = gov.playerPromiseAudits.find((a) => a.playerName === 'Frustrated Star');
  assert.ok(starAudit, 'Expected playing-time audit for Frustrated Star');
  assert.ok(
    starAudit!.status === 'breached' || starAudit!.status === 'at_risk',
    `Expected breached/at_risk, got ${starAudit!.status}`
  );

  const regAudit = gov.playerPromiseAudits.find((a) => a.playerName === 'Happy Starter');
  assert.ok(regAudit);
  assert.equal(regAudit!.status, 'met');
});

test('buildLastMatchTacticBlueprint decodes IP/Transition/OOP team instructions, starter PIs, and flags FM27 Patch 27.1.0 risks', () => {
  const players = [
    makePlayer({ id: 'p-rb', uid: 10, name: 'Arthur Devos', position: 'D (R)' }),
    makePlayer({ id: 'p-rw', uid: 11, name: 'Nathan Kaninda', position: 'AM (R)' }),
  ];

  const bp = buildLastMatchTacticBlueprint(
    {
      meta: { clubName: 'KVV Zelzate', managerName: 'Bobby Dean' },
      playedMatches: [
        {
          dateDmy: '15/09/2027',
          opponent: 'Royal Knokke FC',
          score: '2 - 1',
          result: 'W',
          venue: 'H',
          competition: '1e Nationale VV',
        },
      ],
      tactics: [
        {
          name: '433 Counter Positive',
          mentality: 'Positive',
          tacticalStyle: 'Fluid Counter-Attack',
          inPossessionFormation: '4-3-3 DM Wide',
          outOfPossessionFormation: '4-1-4-1',
          teamInstructions: {
            inPossession: ['Tempo: Slightly Higher'],
            inTransition: ['Counter'],
            outOfPossession: ['Trigger Press: More Often'],
            mentality: 'Positive',
            styleName: 'Fluid Counter-Attack',
            rawSettings: [],
          },
          slots: [
            {
              position: 'DR',
              outOfPossessionPosition: 'DR',
              playerUid: 10,
              playerName: 'Arthur Devos',
              inPossessionRole: 'Holding Full-Back',
              outOfPossessionRole: 'Full-Back',
              inPossessionInstructions: ['Stay Wider'],
              outOfPossessionInstructions: ['Tackle Harder'],
            },
            {
              position: 'AMR',
              outOfPossessionPosition: 'MR',
              playerUid: 11,
              playerName: 'Nathan Kaninda',
              inPossessionRole: 'Inside Forward',
              outOfPossessionRole: 'Wide Outlet Winger',
              inPossessionInstructions: [],
              outOfPossessionInstructions: [],
            },
          ],
        },
      ],
    } as never,
    players,
    0
  );

  assert.ok(bp);
  assert.equal(bp!.tacticName, '433 Counter Positive');
  assert.equal(bp!.inPossessionFormation, '4-3-3 DM Wide');
  assert.equal(bp!.outOfPossessionFormation, '4-1-4-1');
  assert.equal(bp!.teamInstructions.inPossession.length, 1);
  assert.equal(bp!.teamInstructions.inTransition.length, 1);
  assert.equal(bp!.teamInstructions.outOfPossession.length, 1);
  assert.equal(bp!.starters[0].inPossessionInstructions?.length, 1);
  assert.ok(
    bp!.tacticalEffectivenessNotes.some((n) => /Wide Outlet Winger/i.test(n)),
    'Should warn about Wide Outlet Winger OOP flank overload risk'
  );
  assert.ok(
    bp!.tacticalEffectivenessNotes.some((n) => /Holding Full-Back/i.test(n)),
    'Should include Patch 27.1.0 Holding Full-Back pressing note'
  );
});

test('cardIntelligenceEngine computes 8-spoke Percentile Pizza and verdicts for both squad players and scout targets with zero raw CA/PA', () => {
  const squad = [
    makePlayer({ id: 'p-1', uid: 1, name: 'Mbey Epolo', position: 'ST (C)', wagePw: 420 }),
    makePlayer({ id: 'p-2', uid: 2, name: 'Backup Striker', position: 'ST (C)', ability: 3.0, wagePw: 250 }),
    makePlayer({ id: 'p-3', uid: 3, name: 'Mid Anchor', position: 'DM', wagePw: 350 }),
    makePlayer({ id: 'p-4', uid: 4, name: 'Top Keeper', position: 'GK', wagePw: 400 }),
  ];

  const pizza = computePositionPercentilePizza(squad[0], squad, null);
  assert.equal(pizza.length, 8);
  assert.ok(pizza.every((s) => s.percentile >= 1 && s.percentile <= 99));

  const squadEval = evaluateSquadPlayerCard(squad[0], squad, {
    divisionBenchmarks: null,
  });
  assert.ok(squadEval.verdictLabel.length > 0);
  assert.equal(squadEval.pizzaSlices.length, 8);
  assert.doesNotMatch(squadEval.inlineRationale, /\bCA\s*\d+|\bPA\s*\d+/i);

  const target: RecruitmentTarget = {
    uid: 9001,
    name: 'Jules Peeters',
    age: 21,
    nationality: 'Belgium',
    currentClub: 'Unattached',
    primaryPosition: 'ST (C)',
    isFreeAgent: true,
    contractExpiryMonths: 0,
    expires: 'Free',
    demandedWageEur: 0,
    scoutBadges: ['Consistent Performer', 'Big-Game Player'],
    attributes: {
      pace: 16,
      acceleration: 16,
      stamina: 14,
      jumpingReach: 12,
      determination: 15,
      passing: 11,
      finishing: 15,
      tackling: 6,
      firstTouch: 13,
      decisions: 13,
      workRate: 14,
      offTheBall: 15,
      heading: 11,
      corners: 6,
      crossing: 9,
      technique: 13,
      dribbling: 14,
      composure: 13,
      anticipation: 14,
    },
  };

  const scoutEval = evaluateScoutTargetCard(target, squad, {
    divisionBenchmarks: null,
  });
  assert.equal(scoutEval.pizzaSlices.length, 8);
  assert.ok(scoutEval.bestIpRole.length > 0);
  assert.ok(scoutEval.bestOopRole.length > 0);
  assert.equal(scoutEval.starterName, 'Mbey Epolo');
  assert.doesNotMatch(scoutEval.inlineRationale, /\bCA\s*\d+|\bPA\s*\d+/i);
});

test('buildDeepJourneyReport builds timeline, Improved/Worsened/Things to Note, stat deltas, and sanitized AI payload', () => {
  const p1Before = makePlayer({ uid: 101, name: 'Mbey Epolo', ability: 3.5, goals: 2, assists: 0, minutes: 360, rating: 6.85 });
  const p1After = makePlayer({ uid: 101, name: 'Mbey Epolo', ability: 4.0, goals: 8, assists: 3, minutes: 900, rating: 7.42 });

  const snap1 = createSaveHistoryPoint({
    saveName: 'zelzate_sep.fm',
    inGameDate: '15/09/2027',
    clubName: 'KVV Zelzate',
    players: [p1Before],
    balance: '-£800K',
    balanceNum: -800000,
    leaguePosition: 8,
  });
  const snap2 = createSaveHistoryPoint({
    saveName: 'zelzate_dec.fm',
    inGameDate: '15/12/2027',
    clubName: 'KVV Zelzate',
    players: [p1After],
    balance: '-£500K',
    balanceNum: -500000,
    leaguePosition: 3,
  });

  const report = buildDeepJourneyReport(snap1, snap2, [snap2, snap1]);
  assert.equal(report.timeline.length, 2);
  assert.ok(report.improved.length > 0, 'Should detect league & squad improvements');
  assert.equal(report.playerStatDeltas.length, 1);
  assert.equal(report.playerStatDeltas[0].goalsDelta, 6);
  assert.doesNotMatch(JSON.stringify(report.aiPayload), /\bCA\s*\d+|\bPA\s*\d+/i);
  assert.ok(JOURNEY_REPORT_SCHEMA.required?.includes('headline'));
  assert.ok(buildJourneyReportSystemPrompt('KVV Zelzate').includes('Patch 27.1.0'));
});

test('buildLiveTacticalAnalystContext integrates all 7 app domains (Governance, Last-Match Tactic, Squad Planner, Staff, Shortlist, xG Analytics, Journey)', () => {
  const p = makePlayer({ uid: 101, name: 'Mbey Epolo', position: 'ST (C)' });
  const m: MatchLogEntry = {
    id: 'm1',
    eventNumber: 1,
    date: '15/09/2027',
    competition: '1e Nationale VV',
    opponent: 'Royal Knokke FC',
    venue: 'H',
    result: 'W',
    score: '2 - 0',
    xGFor: 2.1,
    xGAgainst: 0.5,
    possession: 56,
    passCompletion: 84,
    shotsFor: '14 (6)',
    shotsAgainst: '5 (1)',
    cccFor: 3,
    cccAgainst: 0,
    goalTimeline: "12' Epolo, 64' Epolo",
    potm: 'Mbey Epolo (8.2)',
    defensiveWatchpoints: '',
    tacticalAudit: '',
    source: 'FM_SAVE',
  };

  const gov = buildClubGovernanceState(
    {
      meta: { clubName: 'KVV Zelzate', managerName: 'Bobby Dean', gameDateDmy: '15/09/2027' },
      staff: [{ uid: 1, name: 'Bobby Dean', role: 'Manager', wagePw: 650, expires: '30/06/2029' }],
      playedMatches: [{ dateIso: '2027-09-15' }],
    } as never,
    [p]
  );

  const lastTac = buildLastMatchTacticBlueprint(
    {
      meta: { clubName: 'KVV Zelzate', managerName: 'Bobby Dean' },
      playedMatches: [{ dateDmy: '15/09/2027', opponent: 'Royal Knokke FC', score: '2 - 0', result: 'W', venue: 'H' }],
      tactics: [
        {
          name: '433 Counter Positive',
          mentality: 'Positive',
          inPossessionFormation: '4-3-3 DM Wide',
          outOfPossessionFormation: '4-3-3 DM Wide',
          teamInstructions: {
            inPossession: ['Tempo: Higher'],
            inTransition: [],
            outOfPossession: [],
            mentality: 'Positive',
            styleName: null,
            rawSettings: [],
          },
          slots: [
            {
              position: 'STC',
              outOfPossessionPosition: 'STC',
              playerUid: 101,
              playerName: 'Mbey Epolo',
              inPossessionRole: 'Channel Forward',
              outOfPossessionRole: 'Outlet Centre Forward',
              inPossessionInstructions: [],
              outOfPossessionInstructions: [],
            },
          ],
        },
      ],
    } as never,
    [p],
    0
  );

  const snap1 = createSaveHistoryPoint({
    saveName: 'a.fm',
    inGameDate: '01/08/2027',
    clubName: 'KVV Zelzate',
    players: [makePlayer({ uid: 101, ability: 3.5 })],
    leaguePosition: 10,
  });
  const snap2 = createSaveHistoryPoint({
    saveName: 'b.fm',
    inGameDate: '15/09/2027',
    clubName: 'KVV Zelzate',
    players: [p],
    leaguePosition: 3,
  });
  const journey = buildDeepJourneyReport(snap1, snap2, [snap2, snap1]);

  const ctx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2027',
    nextFixture: '18/09/2027 vs Jong Cercle (A)',
    leagueStandingSub: '#3 of 16',
    wageSpend: '£4,200 / £5,000 p/w',
    balance: '£210K',
    players: [p],
    matches: [m],
    staff: [
      {
        id: 's1',
        name: 'Jan Peeters',
        role: 'Assistant Manager',
        age: 44,
        nation: 'BEL',
        club: 'KVV Zelzate',
        wagePw: 320,
        expires: '30/06/2028',
        attributes: {
          attacking: 12,
          defending: 12,
          fitness: 10,
          goalkeeping: 5,
          mental: 12,
          possession: 12,
          set_pieces: 10,
          tactical: 13,
          technical: 12,
          working_with_youngsters: 12,
          adaptability: 11,
          authority: 12,
          determination: 13,
          judging_player_ability: 13,
          judging_player_potential: 13,
          judging_staff_ability: 11,
          man_management: 13,
          motivating: 13,
          negotiating: 10,
          physiotherapy: 5,
          sports_science: 5,
          tactical_knowledge: 14,
          analysing_data: 12,
        },
      },
    ],
    latestJourneyReport: journey,
    hydratedFmSave: {
      decodedPayload: { meta: { clubName: 'KVV Zelzate', managerName: 'Bobby Dean' } },
      governance: gov,
      lastMatchTactic: lastTac,
      squadPlanner: [
        {
          seasonOffset: 0,
          slot: 1,
          positionCode: 'ST',
          playerUids: [101],
          playerNames: ['Mbey Epolo'],
        },
      ],
    } as never,
  });

  assert.ok(ctx.includes('CLUB GOVERNANCE, MANAGER CONTRACT, BOARD TARGETS & PROMISES'));
  assert.ok(ctx.includes('LAST GAME / ACTIVE SAVE TACTIC BLUEPRINT'));
  assert.ok(ctx.includes('FM27 SQUAD PLANNER DEPTH'));
  assert.ok(ctx.includes('BACKROOM STAFF'));
  assert.ok(ctx.includes('RECENT MATCHES & XG ANALYTICS'));
  assert.ok(ctx.includes('SAVE-TO-SAVE JOURNEY REPORT'));
});

test('clearSaveHistoryPoints and clearAllSaveCache degrade cleanly when IndexedDB is unavailable', async () => {
  const historyCleared = await clearSaveHistoryPoints();
  const allCleared = await clearAllSaveCache();
  assert.equal(typeof historyCleared, 'boolean');
  assert.equal(typeof allCleared, 'boolean');
});

test('squadPlannerHelper decodes raw FM27 27-slot indices, strips Setting 1..N placeholders, and explains FM27 IP/OOP roles', () => {
  assert.equal(resolveSquadPlannerSlotMeta({ slot: 1 }).code, 'GK');
  assert.equal(resolveSquadPlannerSlotMeta({ slot: 1 }).label, 'Goalkeeper');
  assert.equal(resolveSquadPlannerSlotMeta({ slot: 3 }).code, 'DR');
  assert.equal(resolveSquadPlannerSlotMeta({ slot: 4 }).code, 'DCR');
  assert.equal(resolveSquadPlannerSlotMeta({ slot: 7 }).code, 'DL');
  assert.equal(resolveSquadPlannerSlotMeta({ slot: 10 }).code, 'DM');
  assert.equal(resolveSquadPlannerSlotMeta({ slot: 12 }).code, 'WBL');
  assert.equal(resolveSquadPlannerSlotMeta({ slot: 24 }).code, 'STC');
  // Legacy "Slot 3" string should still decode to DR
  assert.equal(resolveSquadPlannerSlotMeta({ slot: 3, positionCode: 'Slot 3' }).code, 'DR');

  assert.deepEqual(
    filterMeaningfulInstructions([
      'Setting 1',
      'Setting 2',
      'Stay Wider',
      'Instruction #5',
      '12',
      'Tackle Harder',
      'Stay Wider',
    ]),
    ['Stay Wider', 'Tackle Harder']
  );

  const poacherDesc = describeFm27RoleBrief('Poacher');
  const outletDesc = describeFm27RoleBrief('Central Outlet Centre Forward');
  assert.ok(poacherDesc && poacherDesc.length > 15);
  assert.ok(outletDesc && outletDesc.length > 15);
});

test('buildLastMatchTacticBlueprint strips opaque Setting 1..5 strings while preserving binary flag counts and cleaning Analyst prompt', () => {
  const striker = makePlayer({ id: 'p-st', uid: 77, name: 'Mbey Epolo', position: 'ST (C)' });
  const bp = buildLastMatchTacticBlueprint(
    {
      meta: { clubName: 'KVV Zelzate', managerName: 'Bobby Dean' },
      playedMatches: [
        { dateDmy: '15/09/2027', opponent: 'SK Roeselare', score: '2 - 0', result: 'W', venue: 'H' },
      ],
      tactics: [
        {
          name: '433 Counter Positive',
          mentality: 'Positive',
          inPossessionFormation: '4-3-3 DM Wide',
          outOfPossessionFormation: '4-3-3 DM Wide',
          teamInstructions: {
            inPossession: ['Setting 1', 'Tempo: Slightly Higher'],
            inTransition: ['Counter'],
            outOfPossession: ['Setting 2'],
            mentality: 'Positive',
            styleName: 'Fluid Counter-Attack',
            rawSettings: [],
          },
          slots: [
            {
              position: 'STC',
              outOfPossessionPosition: 'STC',
              playerUid: 77,
              playerName: 'Mbey Epolo',
              inPossessionRole: 'Poacher',
              outOfPossessionRole: 'Central Outlet Centre Forward',
              inPossessionInstructions: ['Setting 1', 'Setting 2', 'Setting 3', 'Setting 4', 'Setting 5'],
              outOfPossessionInstructions: ['Setting 1', 'Setting 2'],
              settingCountIp: 5,
              settingCountOop: 2,
            },
          ],
        },
      ],
    } as never,
    [striker],
    0
  );

  assert.ok(bp);
  assert.deepEqual(bp!.teamInstructions.inPossession, ['Tempo: Slightly Higher']);
  assert.deepEqual(bp!.teamInstructions.outOfPossession, []);
  assert.deepEqual(bp!.starters[0].inPossessionInstructions, []);
  assert.deepEqual(bp!.starters[0].outOfPossessionInstructions, []);
  assert.equal(bp!.starters[0].settingCountIp, 5);
  assert.equal(bp!.starters[0].settingCountOop, 2);

  const ctx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/09/2027',
    nextFixture: '18/09/2027 vs Jong Cercle (A)',
    leagueStandingSub: '#3 of 16',
    wageSpend: '£4,200 / £5,000 p/w',
    balance: '£210K',
    players: [striker],
    matches: [],
    hydratedFmSave: {
      decodedPayload: { meta: { clubName: 'KVV Zelzate', managerName: 'Bobby Dean' } },
      lastMatchTactic: bp,
      squadPlanner: [
        { seasonOffset: 0, slot: 1, playerUids: [1, 2], playerNames: ['René Vanden Borre', 'Jasper Baeyens'] },
        { seasonOffset: 0, slot: 24, playerUids: [77, 78], playerNames: ['Mbey Epolo', 'Backup ST'] },
        { seasonOffset: 1, slot: 24, playerUids: [77], playerNames: ['Mbey Epolo'] },
      ],
    } as never,
  });

  assert.ok(!ctx.includes('Setting 1'), 'Analyst prompt must never contain Setting 1 noise');
  assert.ok(!ctx.includes('Slot 1'), 'Analyst prompt must decode Slot 1 into GK');
  assert.ok(ctx.includes('GK:René Vanden Borre>Jasper Baeyens'));
  assert.ok(ctx.includes('Next Season Thin Spots (+1yr):'));
  assert.ok(ctx.includes('STC(1 left)'));
  assert.ok(ctx.includes('GK(0 left)'));
});

test('fm27TacticRoleInference works out slot-accurate IP/OOP roles from position, shift, style, binary flags & player fit, and auto-matches binary fingerprints across slots', () => {
  const striker = makePlayer({
    id: 'p-st',
    uid: 77,
    name: 'Mbey Epolo',
    position: 'ST (C)',
    attributes: { pace: 16, acceleration: 16, offTheBall: 15, finishing: 14, composure: 13 },
  });
  const winger = makePlayer({
    id: 'p-rw',
    uid: 88,
    name: 'Nathan Kaninda',
    position: 'AM (R)',
    attributes: { pace: 15, dribbling: 14, finishing: 13, workRate: 14, stamina: 14 },
  });

  // 1. Multi-signal inference when save omits text role names
  const stRes = resolveSlotDualPhaseRoles({
    slot: {
      slotIndex: 10,
      position: 'STC',
      outOfPossessionPosition: 'STC',
      settingCountIp: 5,
      settingCountOop: 2,
    },
    slotIndex: 10,
    player: striker,
    styleName: 'Fluid Counter-Attack',
    mentality: 'Positive',
    tacticKey: '433_counter#0',
  });
  assert.equal(stRes.ipSource, 'inferred');
  assert.equal(stRes.oopSource, 'inferred');
  assert.ok(getValidFm27RolesForSlot('STC', 'ip').some((r) => r.name === stRes.ipRole));
  assert.ok(getValidFm27RolesForSlot('STC', 'oop').some((r) => r.name === stRes.oopRole));
  assert.equal(stRes.ipCandidates.length, 3);
  assert.equal(stRes.oopCandidates.length, 3);
  assert.ok(getFm27RoleTendencies(stRes.ipRole).length === 3);
  assert.ok(getFm27RoleTendencies(stRes.oopRole).length === 3);

  // 2. AMR -> MR defensive shift should strongly infer Tracking Winger OOP
  const wRes = resolveSlotDualPhaseRoles({
    slot: {
      slotIndex: 8,
      position: 'AMR',
      outOfPossessionPosition: 'MR',
      settingCountIp: 5,
      settingCountOop: 2,
    },
    slotIndex: 8,
    player: winger,
    styleName: 'Fluid Counter-Attack',
    mentality: 'Positive',
    tacticKey: '433_counter#0',
  });
  assert.ok(
    /tracking/i.test(wRes.oopRole),
    `Expected AMR->MR shift to infer a Tracking role OOP, got ${wRes.oopRole}`
  );

  // 3. Calibrated binary fingerprint on DCR auto-matches DCL with identical binary fingerprint
  const dclRes = resolveSlotDualPhaseRoles({
    slot: {
      slotIndex: 3,
      position: 'DCL',
      outOfPossessionPosition: 'DCL',
      ipBinaryFingerprint: 'a1b2c3d4-4u',
      oopBinaryFingerprint: 'e5f60718-2u',
      settingCountIp: 4,
      settingCountOop: 2,
    },
    slotIndex: 3,
    player: null,
    styleName: 'Fluid Counter-Attack',
    mentality: 'Positive',
    tacticKey: '433_counter#0',
    overrides: {
      bySlot: {},
      byFingerprint: {
        'DC::ip::a1b2c3d4-4u': 'Ball-Playing Centre-Back',
        'DC::oop::e5f60718-2u': 'Covering Centre-Back',
      },
    },
  });
  assert.equal(dclRes.ipRole, 'Ball-Playing Centre-Back');
  assert.equal(dclRes.ipSource, 'fingerprint_matched');
  assert.equal(dclRes.oopRole, 'Covering Centre-Back');
  assert.equal(dclRes.oopSource, 'fingerprint_matched');
});

test('matchScopeHelpers cleanly differentiates football seasons, League vs Cup vs Friendlies, and signed currency', () => {
  assert.equal(deriveFootballSeasonLabel('11/08/2027'), '2027/28');
  assert.equal(deriveFootballSeasonLabel('15/05/2027'), '2026/27');
  assert.equal(deriveFootballSeasonLabel('2027-09-15'), '2027/28');

  assert.equal(classifyMatchCompetitionBucket('Eerste Nationale VV'), 'league');
  assert.equal(classifyMatchCompetitionBucket('Croky Cup'), 'cup');
  assert.equal(classifyMatchCompetitionBucket('Beker van België'), 'cup');
  assert.equal(classifyMatchCompetitionBucket('Friendly'), 'friendly');
  assert.equal(classifyMatchCompetitionBucket('Pre-Season Friendly'), 'friendly');

  assert.equal(formatSignedCurrency(-103), '-£103');
  assert.equal(formatSignedCurrency(2500), '+£2,500');
  assert.equal(formatSignedCurrency(0), '£0');

  const sampleMatches: MatchLogEntry[] = [
    {
      id: 'm1',
      eventNumber: 1,
      date: '14/09/2027',
      competition: 'Eerste Nationale VV',
      opponent: 'SK Roeselare',
      venue: 'H',
      result: 'W',
      score: '2 - 0',
      xGFor: 2.1,
      xGAgainst: 0.5,
      possession: 54,
      passCompletion: 82,
      shotsFor: '14 (6)',
      shotsAgainst: '6 (2)',
      cccFor: 2,
      cccAgainst: 0,
      goalTimeline: '',
      potm: '',
      defensiveWatchpoints: '',
      tacticalAudit: '',
      source: 'FM_SAVE',
    },
    {
      id: 'm2',
      eventNumber: 2,
      date: '07/09/2027',
      competition: 'Croky Cup',
      opponent: 'KSV Oudenaarde',
      venue: 'A',
      result: 'W',
      score: '3 - 1',
      xGFor: 1.9,
      xGAgainst: 0.9,
      possession: 51,
      passCompletion: 80,
      shotsFor: '12 (5)',
      shotsAgainst: '8 (3)',
      cccFor: 2,
      cccAgainst: 1,
      goalTimeline: '',
      potm: '',
      defensiveWatchpoints: '',
      tacticalAudit: '',
      source: 'FM_SAVE',
    },
    {
      id: 'm3',
      eventNumber: 3,
      date: '25/07/2027',
      competition: 'Friendly',
      opponent: 'RFC Wetteren',
      venue: 'H',
      result: 'L',
      score: '0 - 4',
      xGFor: 0.4,
      xGAgainst: 3.6,
      possession: 45,
      passCompletion: 74,
      shotsFor: '5 (1)',
      shotsAgainst: '18 (8)',
      cccFor: 0,
      cccAgainst: 4,
      goalTimeline: '',
      potm: '',
      defensiveWatchpoints: '',
      tacticalAudit: '',
      source: 'FM_SAVE',
    },
    {
      id: 'm4',
      eventNumber: 4,
      date: '10/05/2027',
      competition: 'Eerste Nationale VV',
      opponent: 'Knokke',
      venue: 'A',
      result: 'D',
      score: '1 - 1',
      xGFor: 1.0,
      xGAgainst: 1.0,
      possession: 50,
      passCompletion: 78,
      shotsFor: '9 (3)',
      shotsAgainst: '9 (3)',
      cccFor: 1,
      cccAgainst: 1,
      goalTimeline: '',
      potm: '',
      defensiveWatchpoints: '',
      tacticalAudit: '',
      source: 'FM_SAVE',
    },
  ];

  const breakdown = summarizeMatchesByScope(sampleMatches, '2027/28');
  assert.equal(breakdown.league.played, 1);
  assert.equal(breakdown.cup.played, 1);
  assert.equal(breakdown.friendly.played, 1);
  assert.equal(breakdown.competitive.played, 2);
  // Prior season (10/05/2027 -> 2026/27) must be excluded from 2027/28
  assert.equal(breakdown.all.played, 3);
  // Competitive xG must NOT include the 0.4 - 3.6 friendly loss
  assert.equal(breakdown.competitive.xgFor, 4.0);
  assert.equal(breakdown.competitive.xgAgainst, 1.4);
  assert.equal(breakdown.competitive.xgDiff, 2.6);
});

test('buildDeepJourneyReport separates League/Cup/Friendlies and guards cross-season stat resets', () => {
  const mkMatch = (id: string, date: string, competition: string, result: 'W' | 'D' | 'L', score: string, xGFor: number, xGAgainst: number): MatchLogEntry => ({
    id,
    eventNumber: 1,
    date,
    competition,
    opponent: 'Test FC',
    venue: 'H',
    result,
    score,
    xGFor,
    xGAgainst,
    possession: 52,
    passCompletion: 80,
    shotsFor: '10 (4)',
    shotsAgainst: '6 (2)',
    cccFor: 1,
    cccAgainst: 0,
    goalTimeline: '',
    potm: '',
    defensiveWatchpoints: '',
    tacticalAudit: '',
    source: 'FM_SAVE',
  });

  const sPrevSeason = createSaveHistoryPoint({
    saveName: 'end2627.fm',
    inGameDate: '20/05/2027',
    clubName: 'KVV Zelzate',
    players: [makePlayer({ uid: 101, goals: 18, minutes: 2400, ability: 3.5 })],
    leaguePosition: 4,
    played: 30,
    points: 54,
  });
  const sNewSeason = createSaveHistoryPoint({
    saveName: 'sep2728.fm',
    inGameDate: '15/09/2027',
    clubName: 'KVV Zelzate',
    players: [makePlayer({ uid: 101, goals: 2, minutes: 360, ability: 3.6 })],
    matches: [
      mkMatch('l1', '14/09/2027', 'Eerste Nationale VV', 'W', '2 - 0', 1.8, 0.4),
      mkMatch('c1', '07/09/2027', 'Croky Cup', 'W', '1 - 0', 1.2, 0.5),
      mkMatch('f1', '20/07/2027', 'Friendly', 'L', '0 - 5', 0.2, 4.0),
    ],
    leaguePosition: 6,
    played: 4,
    points: 7,
  });

  // Snapshot competitive xG must exclude the Friendly 0.2 - 4.0!
  assert.equal(sNewSeason.seasonLabel, '2027/28');
  assert.equal(sNewSeason.xgFor, 3.0);
  assert.equal(sNewSeason.xgAgainst, 0.9);
  assert.equal(sNewSeason.competitionBreakdown?.league.played, 1);
  assert.equal(sNewSeason.competitionBreakdown?.cup.played, 1);
  assert.equal(sNewSeason.competitionBreakdown?.friendly.played, 1);

  const crossReport = buildDeepJourneyReport(sPrevSeason, sNewSeason, [sPrevSeason, sNewSeason]);
  assert.equal(crossReport.fromSeason, '2026/27');
  assert.equal(crossReport.toSeason, '2027/28');
  assert.equal(crossReport.sameSeason, false);
  // Cross-season guard prevents bogus -16 goals / -2040 mins playerStatDeltas
  assert.equal(crossReport.playerStatDeltas.length, 0);
  assert.ok(crossReport.thingsToNote.some((n) => /Cross-season comparison/i.test(n.title)));
});

test('buildClubGovernanceState excludes pre-season Friendlies from playing-time promise denominators', () => {
  const friendlies = Array.from({ length: 8 }, (_, idx) => ({
    dateDmy: `1${idx}/07/2027`,
    competition: 'Friendly',
    opponent: `Friendly ${idx}`,
    venue: 'H' as const,
    result: 'W' as const,
    score: '2 - 0',
  }));
  const leagueMatches = Array.from({ length: 4 }, (_, idx) => ({
    dateDmy: `0${idx + 1}/09/2027`,
    competition: 'Eerste Nationale VV',
    opponent: `League ${idx}`,
    venue: 'H' as const,
    result: 'W' as const,
    score: '2 - 1',
  }));

  const squadPlayer = makePlayer({
    id: 'p-sp',
    uid: 501,
    name: 'Visar Shala',
    minutes: 90,
    contractDetails: {
      promisedPlayingTime: 'Squad Player',
      releaseClauses: [],
      optionalExtensionYears: 0,
      bonuses: {},
      loanWageContributionPct: null,
    },
  });
  const youthProspect = makePlayer({
    id: 'p-bp',
    uid: 502,
    name: 'Mario Gega',
    minutes: 0,
    teamSlot: 1,
    contractDetails: {
      promisedPlayingTime: 'Breakthrough Prospect',
      releaseClauses: [],
      optionalExtensionYears: 0,
      bonuses: {},
      loanWageContributionPct: null,
    },
  });

  const gov = buildClubGovernanceState(
    {
      meta: { clubName: 'KVV Zelzate', managerName: 'Bobby Dean', gameDateDmy: '15/09/2027' },
      playedMatches: [...friendlies, ...leagueMatches],
      leagueStanding: { played: 4, position: 6, totalTeams: 16, points: 7, competitionName: 'Eerste Nationale VV' },
    } as never,
    [squadPlayer, youthProspect]
  );

  // Youth/U21 player with Breakthrough Prospect should NOT be audited as senior At Risk
  assert.equal(gov.playerPromiseAudits.find((a) => a.playerName === 'Mario Gega'), undefined);
  // Squad Player with 90m out of 4 competitive GP (360m = 25% share) is On Track, NOT At Risk/Breached!
  const visar = gov.playerPromiseAudits.find((a) => a.playerName === 'Visar Shala');
  assert.ok(visar);
  assert.equal(visar!.status, 'on_track');
  assert.equal(visar!.actualMinutesSharePct, 25);
});

test('Regression: League / Cup placeholders and 8-match multi-loss pre-season friendly batches never inflate Cup or Competitive xG', () => {
  assert.equal(classifyMatchCompetitionBucket('League / Cup'), 'friendly');
  assert.equal(classifyMatchCompetitionBucket('Cup / Friendly'), 'friendly');
  assert.equal(classifyMatchCompetitionBucket('Unclassified Match'), 'friendly');
  assert.equal(classifyMatchCompetitionBucket('Vriendschappelijk'), 'friendly');
  assert.equal(classifyMatchCompetitionBucket('Friendly Cup'), 'friendly');
  assert.equal(classifyMatchCompetitionBucket('Croky Cup'), 'cup');

  const mk = (
    id: string,
    date: string,
    competition: string,
    result: 'W' | 'D' | 'L',
    score: string,
    xGFor: number,
    xGAgainst: number
  ): MatchLogEntry => ({
    id,
    eventNumber: 1,
    date,
    competition,
    opponent: `Opp ${id}`,
    venue: 'H',
    result,
    score,
    xGFor,
    xGAgainst,
    possession: 50,
    passCompletion: 78,
    shotsFor: '10 (4)',
    shotsAgainst: '8 (3)',
    cccFor: 1,
    cccAgainst: 1,
    goalTimeline: '',
    potm: '',
    defensiveWatchpoints: '',
    tacticalAudit: '',
    source: 'FM_SAVE',
  });

  const mixedMatches: MatchLogEntry[] = [
    mk('l1', '24/08/2027', '1e Nationale VV', 'W', '2 - 0', 1.5, 0.5),
    mk('l2', '31/08/2027', '1e Nationale VV', 'D', '1 - 1', 1.0, 0.8),
    mk('l3', '07/09/2027', '1e Nationale VV', 'W', '2 - 1', 1.2, 0.7),
    mk('l4', '14/09/2027', '1e Nationale VV', 'L', '0 - 1', 0.58, 1.1),
    mk('c1', '17/08/2027', 'Croky Cup', 'W', '3 - 0', 2.1, 0.3),
    mk('f1', '05/07/2027', 'Domestic Cup', 'L', '0 - 3', 1.0, 2.5),
    mk('f2', '10/07/2027', 'Domestic Cup', 'L', '1 - 2', 1.8, 2.1),
    mk('f3', '15/07/2027', 'Domestic Cup', 'L', '0 - 2', 1.5, 2.0),
    mk('f4', '20/07/2027', 'Domestic Cup', 'D', '1 - 1', 2.2, 1.4),
    mk('f5', '25/07/2027', 'Domestic Cup', 'W', '2 - 0', 2.9, 0.7),
    mk('f6', '30/07/2027', 'Domestic Cup', 'D', '2 - 2', 2.5, 1.9),
    mk('f7', '04/08/2027', 'Domestic Cup', 'L', '1 - 3', 2.4, 2.8),
    mk('f8', '08/08/2027', 'Domestic Cup', 'L', '0 - 1', 2.41, 1.8),
  ];

  const bd = summarizeMatchesByScope(mixedMatches, '2027/28');
  assert.equal(bd.league.played, 4);
  assert.equal(bd.cup.played, 1);
  assert.equal(bd.friendly.played, 8);
  assert.equal(bd.competitive.played, 5);
  assert.equal(bd.competitive.xgFor, 6.38);
});


