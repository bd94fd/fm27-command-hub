import assert from 'node:assert/strict';
import test from 'node:test';
import { PlayerRecord } from '../types/fm27';
import {
  buildSquadTransferAudit,
  computeDynamicSquadTierBenchmarks,
  parseSignedMoneyString,
} from './transferAudit';
import { computeDynamicScatterScale } from '../components/FootballAnalyticsCharts';
import { DivisionBenchmarks } from '../types/fmSave';

function makePlayer(overrides: Partial<PlayerRecord>): PlayerRecord {
  return {
    id: 'p1',
    number: 10,
    name: 'Test Player',
    position: 'M (C)',
    apps: '4',
    minutes: 360,
    rating: 7.2,
    goals: 1,
    xG: 0.8,
    xGPer90: 0.2,
    assists: 1,
    xA: 0.7,
    xAPer90: 0.18,
    drbPer90: 1.0,
    prPassesPer90: 4.0,
    hdrPct: 50,
    intPer90: 1.5,
    tckPct: 75,
    personality: 'Professional',
    age: 24,
    ability: 3.5,
    potential: 4.0,
    expires: '30/06/2028',
    nation: 'BEL',
    wagePw: 250,
    status: 'Starter',
    attributes: {
      pace: 13,
      acceleration: 13,
      stamina: 13,
      jumpingReach: 12,
      determination: 14,
      passing: 13,
      finishing: 11,
      tackling: 12,
      firstTouch: 13,
      decisions: 13,
      workRate: 13,
      offTheBall: 12,
    },
    ipRole: 'Central Midfielder (CM)',
    oopRole: 'Central Midfielder (CM)',
    notes: '',
    ...overrides,
  };
}

test('parseSignedMoneyString accurately parses negative balances in both minus and parentheses formats', () => {
  assert.equal(parseSignedMoneyString('(£749K)'), -749_000);
  assert.equal(parseSignedMoneyString('-£749K'), -749_000);
  assert.equal(parseSignedMoneyString('£1.50M'), 1_500_000);
  assert.equal(parseSignedMoneyString('-£2.25M'), -2_250_000);
});

test('buildSquadTransferAudit recommends Sell + Youth Successor, Let Expire, Renew, Protect Youth, and Replace Before Selling', () => {
  const squad: PlayerRecord[] = [
    // Core CM #1 (expiring -> Renew Now)
    makePlayer({
      id: 'cm-star',
      name: 'Core Midfielder',
      position: 'M (C)',
      age: 24,
      ability: 4.0,
      potential: 4.0,
      minutes: 450,
      expires: '30/06/2028',
      wagePw: 280,
    }),
    // Core CM #2 (under contract -> Hold)
    makePlayer({
      id: 'cm-starter2',
      name: 'Second Starter CM',
      position: 'M (C)',
      age: 23,
      ability: 3.5,
      potential: 4.0,
      minutes: 400,
      expires: '30/06/2029',
      wagePw: 240,
    }),
    // Expensive #3 CM with U21 successor ready -> Sell / Transfer List naming youth successor
    makePlayer({
      id: 'cm-expensive-backup',
      name: 'Pricey Backup CM',
      position: 'M (C)',
      age: 28,
      ability: 3.0,
      potential: 3.0,
      minutes: 250,
      expires: '30/06/2029',
      wagePw: 500,
    }),
    // U21 Youth Successor at CM (expiring -> Protect Youth Asset)
    makePlayer({
      id: 'cm-youth',
      name: 'Teen CM Prospect',
      position: 'M (C)',
      age: 19,
      ability: 2.5,
      potential: 4.5,
      minutes: 50,
      rating: null,
      expires: '30/06/2028',
      wagePw: 70,
      status: 'Youth',
    }),
    // Aging #5 CM expiring -> Let Expire (keep until out)
    makePlayer({
      id: 'cm-aging-expiring',
      name: 'Aging Fringe CM',
      position: 'M (C)',
      age: 31,
      ability: 2.5,
      potential: 2.5,
      minutes: 100,
      expires: '30/06/2028',
      wagePw: 260,
    }),
    // Thin GK backup earning high wage with no youth successor -> Replace Before Selling
    makePlayer({
      id: 'gk-starter',
      name: 'First GK',
      position: 'GK',
      age: 25,
      ability: 3.5,
      potential: 3.5,
      minutes: 450,
      expires: '30/06/2029',
      wagePw: 220,
    }),
    makePlayer({
      id: 'gk-pricey-backup',
      name: 'Pricey Backup GK',
      position: 'GK',
      age: 29,
      ability: 2.5,
      potential: 2.5,
      minutes: 0,
      rating: null,
      expires: '30/06/2029',
      wagePw: 480,
      status: 'Rotation',
    }),
  ];

  const audit = buildSquadTransferAudit(squad, '15/09/2027', {
    balanceLabel: '(£749K)',
    wagePayrollWeekly: 10257,
    wageBudgetWeekly: 10203,
  });

  assert.equal(audit.clubProfile.isInDebt, true);
  assert.equal(audit.clubProfile.balanceNum, -749_000);

  const byId = Object.fromEntries(audit.playerAdvice.map((a) => [a.player.id, a]));
  assert.equal(byId['cm-star'].verdict, 'Renew Now');
  assert.equal(byId['cm-youth'].verdict, 'Protect Youth Asset');
  assert.equal(byId['cm-expensive-backup'].verdict, 'Sell / Transfer List');
  assert.match(byId['cm-expensive-backup'].headline, /Teen CM Prospect/);
  assert.equal(byId['cm-aging-expiring'].verdict, 'Let Expire');
  assert.equal(byId['gk-pricey-backup'].verdict, 'Replace Before Selling');
});

test('Pass 1: computeDynamicSquadTierBenchmarks scales to lower-league £350/wk squads and detects division deficits', () => {
  const lowerLeagueSquad: PlayerRecord[] = [
    makePlayer({
      id: 'll-def',
      name: 'Slow CB',
      position: 'D (C)',
      wagePw: 320,
      ability: 3.0,
      attributes: {
        pace: 9,
        acceleration: 9,
        stamina: 11,
        jumpingReach: 13,
        determination: 12,
        passing: 9,
        finishing: 5,
        tackling: 10,
        firstTouch: 9,
        decisions: 10,
        workRate: 11,
        offTheBall: 7,
      },
      contractDetails: {
        promisedPlayingTime: 'Regular Starter',
        optionalExtensionYears: 1,
        releaseClauses: [{ type: 'Minimum Fee Release Clause', amount: 250000 }],
        bonuses: {},
        loanWageContributionPct: null,
      },
      activeSuspensions: [
        {
          playerUid: 101,
          playerName: 'Slow CB',
          matchesRemaining: 2,
          competitionName: '1e Nationale VV',
          reason: 'Red Card',
          scope: 'league',
        },
      ],
    }),
    makePlayer({
      id: 'll-mid',
      name: 'Workhorse CM',
      position: 'M (C)',
      wagePw: 380,
      ability: 3.5,
    }),
    makePlayer({
      id: 'll-fwd',
      name: 'Target ST',
      position: 'ST (C)',
      wagePw: 420,
      ability: 4.0,
    }),
  ];

  const divBenchmarks: DivisionBenchmarks = {
    competitionName: '1e Nationale VV',
    scope: 'club_and_division',
    clubCount: 16,
    byPositionGroup: {
      GK: { sampleSize: 32, medianWeeklyWage: 300, medianAttributes: { reflexes: 12 } },
      DEF: { sampleSize: 96, medianWeeklyWage: 340, medianAttributes: { pace: 12, tackling: 13, passing: 11 } },
      MID: { sampleSize: 96, medianWeeklyWage: 360, medianAttributes: { passing: 12 } },
      FWD: { sampleSize: 48, medianWeeklyWage: 400, medianAttributes: { finishing: 13 } },
    },
  };

  const bench = computeDynamicSquadTierBenchmarks(lowerLeagueSquad, divBenchmarks);
  assert.equal(bench.divisionCompared, true);
  assert.ok(bench.medianPaidWeeklyWage >= 320 && bench.medianPaidWeeklyWage <= 420);
  assert.ok(bench.divisionDeficits.some((d) => /DEF/i.test(d) && /pace|tackling/i.test(d)));

  const audit = buildSquadTransferAudit(
    lowerLeagueSquad,
    '12/10/2027',
    { balanceLabel: '-£400K', wagePayrollWeekly: 9200, wageBudgetWeekly: 10200 },
    divBenchmarks
  );
  const defAdvice = audit.playerAdvice.find((a) => a.player.id === 'll-def');
  assert.ok(defAdvice);
  assert.ok(defAdvice.tags.some((t) => /Club Option \+1y/i.test(t)));
  assert.ok(defAdvice.tags.some((t) => /Release Clause/i.test(t)));
  assert.ok(defAdvice.tags.some((t) => /BANNED \(2m\)/i.test(t)));
});

test('Pass 1: computeDynamicScatterScale adapts dynamically to lower-league wages vs top-flight valuations with zero hardcoded €40M/€100M floors', () => {
  const lowerLeague = [
    makePlayer({ id: 'a', wagePw: 250, marketValue: 0 }),
    makePlayer({ id: 'b', wagePw: 420, marketValue: 0 }),
    makePlayer({ id: 'c', wagePw: 600, marketValue: 0 }),
  ];
  const llScale = computeDynamicScatterScale(lowerLeague);
  assert.equal(llScale.metric, 'wagePw');
  assert.ok(llScale.maxY >= 600 && llScale.maxY <= 1000, `Expected dynamic lower-league wage ceiling <= 1000, got ${llScale.maxY}`);
  assert.match(llScale.formatTick(llScale.maxY), /\/wk$/);

  const topFlight = [
    makePlayer({ id: 'x', wagePw: 85000, marketValue: 18_500_000 }),
    makePlayer({ id: 'y', wagePw: 120000, marketValue: 42_000_000 }),
  ];
  const tfScale = computeDynamicScatterScale(topFlight);
  assert.equal(tfScale.metric, 'marketValue');
  assert.ok(tfScale.maxY >= 42_000_000 && tfScale.maxY <= 60_000_000);
  assert.match(tfScale.formatTick(tfScale.maxY), /M$/);
});

test('Squad Advice positional ranking gates on >= 15/20 familiarity so an AML (unaccomplished WBL) is ranked at W, not #1 LB', () => {
  const amlPlayer = makePlayer({
    id: 'aml-winger',
    name: 'Natural AML',
    position: 'AM (L)',
    ability: 3.5,
    potential: 4.0,
    positionRatings: { AML: 20, WBL: 10, DL: 8 },
  });
  const audit = buildSquadTransferAudit([amlPlayer], '12/10/2027', {
    balanceLabel: '£100K',
    wagePayrollWeekly: 2000,
    wageBudgetWeekly: 5000,
  });
  const advice = audit.playerAdvice.find((a) => a.player.id === 'aml-winger');
  assert.ok(advice);
  assert.ok(
    advice.tags.includes('#1 W'),
    `Expected AML player to be ranked #1 W, got tags: ${advice.tags.join(', ')}`
  );
  assert.equal(
    advice.tags.some((t) => /LB$/i.test(t)),
    false,
    `AML with WBL 10/20 must never be ranked at LB, got tags: ${advice.tags.join(', ')}`
  );
});

test('Pack 5 Succession Gap Flag: flags position groups where every first-team option is 28+ with no U23 cover', () => {
  const squad: PlayerRecord[] = [
    // RB group: two veterans (29 and 31) with zero U23 cover -> Succession Gap
    makePlayer({
      id: 'rb-vet-1',
      name: 'Veteran RB Starter',
      position: 'D (R)',
      age: 29,
      teamSlot: 0,
      positionRatings: { DR: 20 },
    }),
    makePlayer({
      id: 'rb-vet-2',
      name: 'Veteran RB Backup',
      position: 'D (R)',
      age: 31,
      teamSlot: 0,
      positionRatings: { DR: 19 },
    }),
    // LB group: one 30yo starter + one 21yo U23 backup -> NO Succession Gap
    makePlayer({
      id: 'lb-vet',
      name: 'Veteran LB Starter',
      position: 'D (L)',
      age: 30,
      teamSlot: 0,
      positionRatings: { DL: 20 },
    }),
    makePlayer({
      id: 'lb-u23',
      name: 'Young LB Cover',
      position: 'D (L)',
      age: 21,
      teamSlot: 0,
      positionRatings: { DL: 18 },
    }),
  ];

  const audit = buildSquadTransferAudit(squad, '12/10/2027', {
    balanceLabel: '£100K',
    wagePayrollWeekly: 2000,
    wageBudgetWeekly: 5000,
  });

  assert.deepEqual(audit.successionGapCodes, ['RB']);
  const rbNeed = audit.positionalNeeds.find((b) => b.code === 'RB');
  const lbNeed = audit.positionalNeeds.find((b) => b.code === 'LB');
  assert.equal(rbNeed?.hasSuccessionGap, true);
  assert.equal(lbNeed?.hasSuccessionGap, false);

  const rbAdvice = audit.playerAdvice.find((a) => a.player.id === 'rb-vet-1');
  const lbAdvice = audit.playerAdvice.find((a) => a.player.id === 'lb-vet');
  assert.ok(rbAdvice?.tags.includes('Succession Gap'));
  assert.equal(lbAdvice?.tags.includes('Succession Gap'), false);
});

test('Squad Advice separates AM (AMC) from CM (MC) so an AMC:20 / MC:2 player is never ranked ahead of natural MC:20 central midfielders', () => {
  const squad: PlayerRecord[] = [
    makePlayer({
      id: 'amc-1',
      name: 'Visar Shala',
      position: 'AM (RC), ST (C)',
      ability: 3.5,
      positionRatings: { AMC: 20, AMR: 18, ST: 15, MC: 2 },
    }),
    makePlayer({
      id: 'cm-1',
      name: 'Sander Dieltjens',
      position: 'M (C)',
      ability: 3.0,
      positionRatings: { MC: 20, DM: 15 },
    }),
  ];

  const audit = buildSquadTransferAudit(squad, '15/09/2027', {
    balanceLabel: '£100K',
    wagePayrollWeekly: 2000,
    wageBudgetWeekly: 5000,
  });

  const cmBucket = audit.positionalNeeds.find((b) => b.code === 'CM');
  const amBucket = audit.positionalNeeds.find((b) => b.code === 'AM');
  assert.ok(cmBucket, 'CM bucket should exist');
  assert.ok(amBucket, 'AM bucket should exist');
  assert.equal(
    cmBucket.players.some((p) => p.id === 'amc-1'),
    false,
    'AMC:20/MC:2 player must NOT appear in CM depth chart'
  );
  assert.equal(cmBucket.players[0]?.id, 'cm-1');
  assert.equal(amBucket.players[0]?.id, 'amc-1');
});

test('Squad Advice enforces Surplus To Requirements -> Sell and reconciles promoted youth successors so they are never also marked Loan Out', () => {
  const squad: PlayerRecord[] = [
    makePlayer({
      id: 'w-starter-1',
      name: 'Nathan Kaninda',
      position: 'AM (R)',
      age: 23,
      ability: 4.5,
      potential: 4.5,
      minutes: 600,
      expires: '30/06/2029',
      wagePw: 400,
      status: 'Starter',
      positionRatings: { AMR: 20 },
    }),
    makePlayer({
      id: 'w-starter-2',
      name: 'Matteo Polizzi',
      position: 'AM (L)',
      age: 24,
      ability: 4.0,
      potential: 4.5,
      minutes: 550,
      expires: '30/06/2029',
      wagePw: 360,
      status: 'Starter',
      positionRatings: { AML: 20 },
    }),
    makePlayer({
      id: 'w-boudry',
      name: 'Quinten Boudry',
      position: 'AM (L), WB (L)',
      age: 27,
      ability: 4.0,
      potential: 4.5,
      minutes: 292,
      expires: '30/06/2029',
      wagePw: 410,
      status: 'Rotation',
      positionRatings: { AML: 20, WBL: 16 },
    }),
    makePlayer({
      id: 'w-hoepel',
      name: 'Jerayson Hoepel',
      position: 'AM (R)',
      age: 19,
      ability: 3.5,
      potential: 5.0,
      minutes: 45,
      expires: '30/06/2029',
      wagePw: 176,
      status: 'Youth',
      positionRatings: { AMR: 20 },
    }),
    makePlayer({
      id: 'st-epolo',
      name: 'Mbey Epolo',
      position: 'ST (C)',
      age: 24,
      ability: 4.0,
      potential: 4.5,
      minutes: 650,
      expires: '30/06/2029',
      wagePw: 420,
      status: 'Starter',
      positionRatings: { ST: 20 },
    }),
    makePlayer({
      id: 'st-ackx',
      name: 'Wolf Ackx',
      position: 'ST (C), AM (L)',
      age: 25,
      ability: 3.5,
      potential: 5.0,
      minutes: 730,
      goals: 0,
      xG: 1.42,
      assists: 1,
      xA: 1.8,
      rating: 6.63,
      expires: '30/06/2029',
      wagePw: 541,
      status: 'Surplus',
      contractDetails: {
        promisedPlayingTime: 'Surplus To Requirements',
        optionalExtensionYears: 0,
        releaseClauses: [],
        bonuses: {},
        loanWageContributionPct: null,
      },
      positionRatings: { ST: 20, AML: 19 },
    }),
    makePlayer({
      id: 'st-ndefe',
      name: 'Mauricio Jr Ndefe',
      position: 'ST (C), AM (L)',
      age: 19,
      ability: 3.5,
      potential: 4.5,
      minutes: 90,
      expires: '30/06/2029',
      wagePw: 0,
      status: 'Youth',
      positionRatings: { ST: 20, AML: 18 },
    }),
  ];

  const audit = buildSquadTransferAudit(squad, '15/09/2027', {
    balanceLabel: '-£749K',
    wagePayrollWeekly: 10257,
    wageBudgetWeekly: 10203,
  });

  const byId = Object.fromEntries(audit.playerAdvice.map((a) => [a.player.id, a]));
  assert.equal(byId['st-ackx'].verdict, 'Sell / Transfer List');
  assert.ok(byId['st-ackx'].tags.includes('Surplus To Requirements'));

  assert.equal(byId['w-boudry'].verdict, 'Sell / Transfer List');
  assert.match(byId['w-boudry'].headline, /Jerayson Hoepel/);
  // Hoepel must NOT simultaneously be marked Loan Out when promoted for Boudry
  assert.notEqual(byId['w-hoepel'].verdict, 'Loan Out');
  assert.ok(byId['w-hoepel'].tags.some((t) => t.startsWith('Promote to Backup')));
  assert.match(byId['w-hoepel'].headline, /do NOT loan out/i);

  // Ndefe must NOT simultaneously be marked Loan Out when promoted for Ackx
  assert.notEqual(byId['st-ndefe'].verdict, 'Loan Out');
  assert.ok(byId['st-ndefe'].tags.some((t) => t.startsWith('Promote to Backup')));
});




