import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDoubleGwLoad,
  computeCompetitiveSummary,
  buildDocAndSheetSyncPrompts,
  computeFm27EngineMetrics,
  buildDynamicTacticalPlan,
  buildDynamicSetPieceRoutines,
  buildDynamicTrainingSchedule,
} from './fmSyncEngine';
import { MatchLogEntry, ChronicleEvent, PlayerRecord } from '../types/fm27';

test('evaluateDoubleGwLoad enforces 125m cap for standard outfielders and 150m for high-stamina striker', () => {
  const wingerCheck = evaluateDoubleGwLoad({
    player: 'Winger A (LW)',
    stamina: 6,
    sat11SepTienen: 62,
    wed15SepKnokke: 62,
    sat18SepJongCercle: 62,
    rolePlanKnokke: 'Start 62m',
    rolePlanJongCercle: 'Start 62m',
  });
  assert.equal(wingerCheck.combinedMinutes, 124);
  assert.equal(wingerCheck.capLimit, 125);
  assert.equal(wingerCheck.passed, true);
  assert.equal(wingerCheck.riskTier, 'Protected');

  const strikerCheck = evaluateDoubleGwLoad({
    player: 'Striker B (ST)',
    stamina: 13,
    sat11SepTienen: 90,
    wed15SepKnokke: 75,
    sat18SepJongCercle: 75,
    rolePlanKnokke: 'Start 75m',
    rolePlanJongCercle: 'Start 75m',
  });
  assert.equal(strikerCheck.combinedMinutes, 150);
  assert.equal(strikerCheck.capLimit, 150);
  assert.equal(strikerCheck.passed, true);

  const overloadCheck = evaluateDoubleGwLoad({
    player: 'Overworked Midfielder',
    stamina: 8,
    sat11SepTienen: 90,
    wed15SepKnokke: 90,
    sat18SepJongCercle: 60,
    rolePlanKnokke: '90m',
    rolePlanJongCercle: '60m',
  });
  assert.equal(overloadCheck.combinedMinutes, 150);
  assert.equal(overloadCheck.passed, false);
  assert.equal(overloadCheck.riskTier, 'Overload Risk');
});

test('computeCompetitiveSummary calculates exact league points and xG differential', () => {
  const sampleMatches: MatchLogEntry[] = [
    {
      id: 'md1',
      eventNumber: 1,
      date: '28/08/2027',
      competition: 'League MD1',
      opponent: 'Club A',
      venue: 'H',
      result: 'W',
      score: '2 - 0',
      xGFor: 1.8,
      xGAgainst: 1.06,
      possession: 48,
      shotsFor: '10 (3)',
      shotsAgainst: '16 (4)',
      cccFor: 2,
      cccAgainst: 0,
      passCompletion: 84,
      goalTimeline: '58m, 90+3m',
      potm: 'Player A (8.90)',
      defensiveWatchpoints: 'Clean sheet',
      tacticalAudit: 'Counter win',
    },
    {
      id: 'md2',
      eventNumber: 2,
      date: '05/09/2027',
      competition: 'League MD2',
      opponent: 'Club B',
      venue: 'A',
      result: 'L',
      score: '1 - 2',
      xGFor: 0.63,
      xGAgainst: 1.37,
      possession: 42,
      shotsFor: '5 (3)',
      shotsAgainst: '14 (7)',
      cccFor: 1,
      cccAgainst: 1,
      passCompletion: 80,
      goalTimeline: '47m',
      potm: 'Player B (7.20)',
      defensiveWatchpoints: 'Balanced build-up fix at HT',
      tacticalAudit: 'Won 2nd half 1-0',
    },
  ];

  const summary = computeCompetitiveSummary(sampleMatches);
  assert.equal(summary.played, 2);
  assert.equal(summary.wins, 1);
  assert.equal(summary.losses, 1);
  assert.equal(summary.points, 3);
  assert.equal(summary.totalXgFor, 2.43);
  assert.equal(summary.totalXgAgainst, 2.43);
  assert.equal(summary.xgDiff, 0);
});

test('buildDynamicTacticalPlan and buildDynamicSetPieceRoutines build Dual-Phase 4-3-3 XI, 62m/75m subs, and Aerial/Corner rankings strictly from imported squad', () => {
  const makePlayer = (
    id: string,
    num: number,
    name: string,
    position: string,
    overrides: Partial<PlayerRecord['attributes']> = {},
    extra: Partial<PlayerRecord> = {}
  ): PlayerRecord => ({
    id,
    number: num,
    name,
    age: 24,
    position,
    ipRole: 'CM',
    oopRole: 'CM',
    ability: 3.5,
    potential: 4.0,
    wagePw: 1200,
    expires: '30/06/2029',
    status: 'Starter',
    apps: '5',
    minutes: 450,
    rating: 7.1,
    goals: 1,
    xG: 0.8,
    xGPer90: 0.16,
    assists: 1,
    xA: 0.6,
    xAPer90: 0.12,
    drbPer90: 1.0,
    prPassesPer90: 4.5,
    hdrPct: 65,
    intPer90: 1.8,
    tckPct: 80,
    personality: 'Balanced',
    nation: 'BEL',
    attributes: {
      pace: 13,
      acceleration: 13,
      stamina: 12,
      jumpingReach: 12,
      determination: 14,
      passing: 13,
      finishing: 11,
      tackling: 12,
      firstTouch: 13,
      decisions: 13,
      workRate: 13,
      offTheBall: 12,
      heading: 12,
      corners: 10,
      crossing: 11,
      technique: 12,
      ...overrides,
    },
    notes: 'Live save player',
    ...extra,
  });

  const squad: PlayerRecord[] = [
    makePlayer('gk1', 1, 'Keeper One', 'GK', { jumpingReach: 14 }),
    makePlayer('rb1', 2, 'Right Back', 'D (R)', {
      pace: 15,
      acceleration: 15,
      stamina: 9,
      tackling: 14,
    }),
    makePlayer('cb1', 4, 'Tower CB', 'D (C)', {
      jumpingReach: 17,
      heading: 16,
      tackling: 15,
      stamina: 14,
    }),
    makePlayer('cb2', 5, 'Partner CB', 'D (C)', {
      jumpingReach: 15,
      heading: 15,
      tackling: 14,
      stamina: 13,
    }),
    makePlayer('lb1', 3, 'Speed LB', 'D (L)', {
      pace: 16,
      acceleration: 16,
      stamina: 14,
      tackling: 13,
    }),
    makePlayer('dm1', 6, 'Anchor DM', 'DM', {
      stamina: 10,
      tackling: 15,
      decisions: 14,
    }),
    makePlayer(
      'cm1',
      8,
      'Left Foot Playmaker',
      'M (C)',
      {
        passing: 16,
        corners: 16,
        crossing: 15,
        technique: 16,
        stamina: 11,
      },
      { leftFoot: 20, rightFoot: 10, preferredFoot: 'Left' }
    ),
    makePlayer(
      'cm2',
      10,
      'Right Foot Creator',
      'AM (C)',
      {
        passing: 15,
        corners: 15,
        crossing: 15,
        technique: 15,
        stamina: 8,
      },
      { leftFoot: 10, rightFoot: 20, preferredFoot: 'Right' }
    ),
    makePlayer('rw1', 7, 'Fast RW', 'AM (R)', {
      pace: 16,
      acceleration: 15,
      stamina: 8,
    }),
    makePlayer('lw1', 11, 'Low Stamina LW', 'AM (L)', {
      pace: 15,
      acceleration: 15,
      stamina: 6,
    }),
    makePlayer('st1', 9, 'Target Striker', 'ST (C)', {
      jumpingReach: 15,
      heading: 14,
      finishing: 16,
      stamina: 13,
    }),
    makePlayer('sub1', 14, 'Bench Winger', 'AM (RL)', { stamina: 14 }),
    makePlayer('sub2', 15, 'Bench Mid', 'DM, M (C)', { stamina: 15 }),
    makePlayer('sub3', 16, 'Bench FB', 'D (RL)', { stamina: 14 }),
    makePlayer('sub4', 19, 'Bench Striker', 'ST (C)', {
      pace: 16,
      finishing: 14,
    }),
  ];

  const tacticalPlan = buildDynamicTacticalPlan(squad);
  assert.equal(tacticalPlan.startingXI.length, 11);
  // Both CBs locked for 90m
  assert.match(tacticalPlan.cbPairNames, /Tower CB/);
  assert.match(tacticalPlan.cbPairNames, /Partner CB/);
  // Wide forwards set to Tracking Winger OOP
  const rwSlot = tacticalPlan.startingXI.find((s) => s.slotCode === 'RW');
  const lwSlot = tacticalPlan.startingXI.find((s) => s.slotCode === 'LW');
  assert.equal(rwSlot?.oopRole, 'Tracking Winger (TW)');
  assert.equal(lwSlot?.oopRole, 'Tracking Winger (TW)');
  // Lowest-stamina non-CB starters targeted at 62m
  assert.ok(
    tacticalPlan.subPlan.some(
      (sub) => sub.minute === 62 && sub.playerOff === 'Low Stamina LW'
    )
  );

  const setPieces = buildDynamicSetPieceRoutines(squad);
  assert.equal(setPieces.aerialThreats[0].name, 'Tower CB');
  assert.equal(setPieces.leftFootTakers[0].name, 'Left Foot Playmaker');
  assert.equal(setPieces.rightFootTakers[0].name, 'Right Foot Creator');
  assert.equal(setPieces.recoveryDefenders[0].name, 'Speed LB');
  assert.equal(setPieces.routines.length, 3);

  const schedule = buildDynamicTrainingSchedule('24/10/2027', [
    {
      dateIso: '2027-10-30',
      dateDmy: '30/10/2027',
      competition: 'Premier League',
      opponent: 'Newcastle United',
      venue: 'A',
    },
    {
      dateIso: '2027-11-02',
      dateDmy: '02/11/2027',
      competition: 'Carabao Cup',
      opponent: 'Chelsea',
      venue: 'H',
    },
  ]);
  assert.equal(schedule.length, 2);
  assert.match(schedule[0].fixtureContext, /Newcastle United/);
  assert.match(schedule[1].fixtureContext, /CONGESTED GW — vs Chelsea/);
});

test('buildDocAndSheetSyncPrompts embeds non-destructive anchor tag and TSV fields', () => {
  const match: MatchLogEntry = {
    id: 'md1',
    eventNumber: 1,
    date: '15/09/2027',
    competition: 'League MD1',
    opponent: 'Opponent FC',
    venue: 'H',
    result: 'W',
    score: '2 - 1',
    xGFor: 1.47,
    xGAgainst: 0.82,
    possession: 51,
    shotsFor: '12 (5)',
    shotsAgainst: '8 (3)',
    cccFor: 2,
    cccAgainst: 0,
    passCompletion: 84,
    goalTimeline: '33m Goal, 71m Goal',
    potm: 'Star Player (7.80)',
    defensiveWatchpoints: 'Switch AML/AMR OOP to Tracking Winger',
    tacticalAudit: 'Controlled midfield Zone 5',
  };

  const chronicle: ChronicleEvent = {
    eventNumber: 1,
    date: '15/09/2027',
    phase: '2027/28 Season',
    category: 'Match Result & Data Hub',
    title: 'Managed Club 2 - 1 Opponent FC',
    headlineMetric: 'W 2-1 (1.47 - 0.82 xG)',
    notes: 'Star Player 7.80 MOTM',
  };

  const output = buildDocAndSheetSyncPrompts(match, chronicle, '15/09/2027');
  assert.ok(
    output.docPrompt.includes('[INSERT NEXT CHRONOLOGICAL EVENT HERE]')
  );
  assert.ok(output.docPrompt.includes('Event #1 (15/09/2027)'));
  assert.ok(output.sheetPrompt.includes('TABLE 1G (MATCH LOG)'));
  assert.ok(output.rawTsvRow1G.includes('\t'));
});

test('computeFm27EngineMetrics computes accurate Patch 27.1.0 physics metrics', () => {
  const mockPlayer = {
    attributes: {
      pace: 15,
      acceleration: 15,
      jumpingReach: 14,
      stamina: 7,
      determination: 12,
      passing: 9,
      finishing: 7,
      tackling: 9,
      firstTouch: 10,
      decisions: 10,
      workRate: 13,
      offTheBall: 7,
    },
  } as PlayerRecord;

  const metrics = computeFm27EngineMetrics(mockPlayer);
  assert.equal(metrics.topSpeedMps, 9.7);
  assert.equal(metrics.jumpHeightMeters, 0.63);
  assert.equal(metrics.sprintDrainRate, 1.98);
});

test('buildDynamicTacticalPlan respects uppercase positionRatings and never puts an LB at CB over natural CBs', () => {
  const makePlayer = (
    id: string,
    name: string,
    position: string,
    ability: number,
    positionRatings: Record<string, number>
  ): PlayerRecord => ({
    id,
    number: 1,
    name,
    position,
    apps: '5',
    minutes: 450,
    rating: 7.1,
    goals: 0,
    xG: 0,
    xGPer90: 0,
    assists: 0,
    xA: 0,
    xAPer90: 0,
    drbPer90: 0,
    prPassesPer90: 0,
    hdrPct: 60,
    intPer90: 1.5,
    tckPct: 75,
    personality: 'Balanced',
    age: 24,
    ability,
    potential: ability,
    condition: 95,
    sharpness: 95,
    expires: '30/06/2028',
    nation: 'BEL',
    wagePw: 300,
    status: 'Starter',
    positionRatings,
    attributes: {
      pace: 13,
      acceleration: 13,
      stamina: 13,
      jumpingReach: 13,
      determination: 13,
      passing: 12,
      finishing: 10,
      tackling: 13,
      firstTouch: 12,
      decisions: 12,
      workRate: 13,
      offTheBall: 11,
    },
    ipRole: 'Centre-Back (CB)',
    oopRole: 'Centre-Back (CB)',
    notes: '',
  });

  const squad: PlayerRecord[] = [
    makePlayer('gk1', 'Keeper One', 'GK', 3.5, { GK: 20 }),
    makePlayer('lb1', 'Star LeftBack', 'D (L)', 5.0, { DL: 20, WBL: 18, DC: 6 }),
    makePlayer('cb1', 'Natural CB One', 'D (C)', 3.0, { DC: 20, DL: 4 }),
    makePlayer('cb2', 'Natural CB Two', 'D (C)', 3.0, { DC: 19, DR: 5 }),
    makePlayer('rb1', 'Natural RB', 'D (R)', 3.5, { DR: 20, DC: 7 }),
  ];

  const plan = buildDynamicTacticalPlan(squad);
  const rcb = plan.startingXI.find((s) => s.slotCode === 'RCB');
  const lcb = plan.startingXI.find((s) => s.slotCode === 'LCB');
  const lb = plan.startingXI.find((s) => s.slotCode === 'LB');

  assert.equal(lb?.player.name, 'Star LeftBack');
  assert.ok(
    [rcb?.player.name, lcb?.player.name].includes('Natural CB One'),
    'Natural CB One must be selected at CB'
  );
  assert.ok(
    [rcb?.player.name, lcb?.player.name].includes('Natural CB Two'),
    'Natural CB Two must be selected at CB'
  );
});
