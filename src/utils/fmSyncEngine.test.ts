import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDoubleGwLoad,
  computeCompetitiveSummary,
  buildDocAndSheetSyncPrompts,
  computeFm27EngineMetrics,
} from './fmSyncEngine';
import { MatchLogEntry, ChronicleEvent, PlayerRecord } from '../types/fm27';

test('evaluateDoubleGwLoad enforces 125m cap for standard outfielders and 150m for high-stamina striker', () => {
  const boudryCheck = evaluateDoubleGwLoad({
    player: 'Quinten Boudry (LW)',
    stamina: 6,
    sat11SepTienen: 62,
    wed15SepKnokke: 62,
    sat18SepJongCercle: 62,
    rolePlanKnokke: 'Start 62m',
    rolePlanJongCercle: 'Start 62m',
  });
  assert.equal(boudryCheck.combinedMinutes, 124);
  assert.equal(boudryCheck.capLimit, 125);
  assert.equal(boudryCheck.passed, true);
  assert.equal(boudryCheck.riskTier, 'Protected');

  const epoloCheck = evaluateDoubleGwLoad({
    player: 'Mbey Epolo (ST)',
    stamina: 13,
    sat11SepTienen: 90,
    wed15SepKnokke: 75,
    sat18SepJongCercle: 75,
    rolePlanKnokke: 'Start 75m',
    rolePlanJongCercle: 'Start 75m',
  });
  assert.equal(epoloCheck.combinedMinutes, 150);
  assert.equal(epoloCheck.capLimit, 150);
  assert.equal(epoloCheck.passed, true);

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

test('computeCompetitiveSummary calculates exact league points and xG differential across MD1-MD4', () => {
  const sampleMatches: MatchLogEntry[] = [
    {
      id: 'md1',
      eventNumber: 21,
      date: '28/08/2027',
      competition: '1st National - VV MD1',
      opponent: 'RC Harelbeke',
      venue: 'H',
      result: 'W',
      score: '2 - 0',
      xGFor: 1.8,
      xGAgainst: 1.06,
      possession: 36,
      shotsFor: '10 (3)',
      shotsAgainst: '16 (4)',
      cccFor: 2,
      cccAgainst: 0,
      passCompletion: 84,
      goalTimeline: '58m Epolo, 90+3m Epolo',
      potm: 'Nathan Karinda (8.90)',
      defensiveWatchpoints: 'Clean sheet',
      tacticalAudit: 'Counter win',
    },
    {
      id: 'md2',
      eventNumber: 30,
      date: '05/09/2027',
      competition: '1st National - VV MD2',
      opponent: 'KFC Merelbeke',
      venue: 'A',
      result: 'W',
      score: '1 - 0',
      xGFor: 1.37,
      xGAgainst: 0.76,
      possession: 38,
      shotsFor: '9 (3)',
      shotsAgainst: '7 (4)',
      cccFor: 3,
      cccAgainst: 1,
      passCompletion: 79,
      goalTimeline: '11m Epolo',
      potm: 'Brendan Schoonbaert (7.50)',
      defensiveWatchpoints: 'Clean sheet #2',
      tacticalAudit: 'Road win',
    },
    {
      id: 'md3',
      eventNumber: 31,
      date: '11/09/2027',
      competition: '1st National - VV MD3',
      opponent: 'KVK Tienen',
      venue: 'A',
      result: 'L',
      score: '1 - 2',
      xGFor: 0.63,
      xGAgainst: 1.37,
      possession: 38,
      shotsFor: '5 (3)',
      shotsAgainst: '14 (7)',
      cccFor: 1,
      cccAgainst: 1,
      passCompletion: 80,
      goalTimeline: '47m Epolo',
      potm: 'Arthur Devos (7.20)',
      defensiveWatchpoints: 'Balanced build-up fix at HT',
      tacticalAudit: 'Won 2nd half 1-0',
    },
    {
      id: 'md4',
      eventNumber: 33,
      date: '15/09/2027',
      competition: '1st National - VV MD4',
      opponent: 'Royal Knokke FC',
      venue: 'H',
      result: 'L',
      score: '1 - 2',
      xGFor: 0.47,
      xGAgainst: 0.82,
      possession: 31,
      shotsFor: '4 (2)',
      shotsAgainst: '12 (7)',
      cccFor: 0,
      cccAgainst: 0,
      passCompletion: 80,
      goalTimeline: '33m Coens',
      potm: 'Matteo Polizzi (7.30)',
      defensiveWatchpoints: 'Switch WOW to Tracking Winger',
      tacticalAudit: 'Tracking Winger OOP fix',
    },
  ];

  const summary = computeCompetitiveSummary(sampleMatches);
  assert.equal(summary.played, 4);
  assert.equal(summary.wins, 2);
  assert.equal(summary.losses, 2);
  assert.equal(summary.points, 6);
  assert.equal(summary.totalXgFor, 4.27);
  assert.equal(summary.totalXgAgainst, 4.01);
  assert.equal(summary.xgDiff, 0.26);
});

test('buildDocAndSheetSyncPrompts embeds non-destructive anchor tag and TSV fields', () => {
  const match: MatchLogEntry = {
    id: 'md4',
    eventNumber: 33,
    date: '15/09/2027',
    competition: '1st National - VV MD4',
    opponent: 'Royal Knokke FC',
    venue: 'H',
    result: 'L',
    score: '1 - 2',
    xGFor: 0.47,
    xGAgainst: 0.82,
    possession: 31,
    shotsFor: '4 (2)',
    shotsAgainst: '12 (7)',
    cccFor: 0,
    cccAgainst: 0,
    passCompletion: 80,
    goalTimeline: '33m Soren Coens (Ast: Matteo Polizzi)',
    potm: 'Matteo Polizzi (7.30)',
    defensiveWatchpoints: 'Switch AML/AMR OOP to Tracking Winger',
    tacticalAudit: 'Rotate fresh legs vs Jong Cercle',
  };

  const chronicle: ChronicleEvent = {
    eventNumber: 33,
    date: '15/09/2027',
    phase: '2027/28 Season (Sep)',
    category: 'Match Result & Data Hub',
    title: 'KVV Zelzate 1 - 2 Royal Knokke FC (MD4)',
    headlineMetric: 'L 1-2 (0.47 - 0.82 xG) | 6th Place (6 Pts)',
    notes: 'Matteo Polizzi 7.30 MOTM',
  };

  const output = buildDocAndSheetSyncPrompts(match, chronicle, 'Wed 15/9/2027');
  assert.ok(output.docPrompt.includes('[INSERT NEXT CHRONOLOGICAL EVENT HERE]'));
  assert.ok(output.docPrompt.includes('Event #33 (15/09/2027)'));
  assert.ok(output.sheetPrompt.includes('TABLE 1G (MATCH LOG)'));
  assert.ok(output.rawTsvRow1G.includes('\t'));
  assert.ok(output.rawTsvRow10.startsWith('Event #33\t15/09/2027'));
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
  assert.equal(metrics.topSpeedMps, 9.7); // 8.05 + 0.11 * 15
  assert.equal(metrics.jumpHeightMeters, 0.63); // (14 + 5) / 30 = 0.6333
  assert.equal(metrics.sprintDrainRate, 1.98); // 2.5 - 0.075 * 7 = 1.975
});
