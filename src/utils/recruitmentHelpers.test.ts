import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerRecord } from '../types/fm27';
import { RecruitmentTarget } from '../types/fmSave';
import {
  buildTargetVsStarterComparison,
  classifyExactPositionSlot,
  evaluatePlaybookArchetype,
  evaluateTargetSquadDepth,
  findTopSeniorStarterForPosition,
  formatTargetContractSummary,
  getPlaybookContractNotes,
  getPositionRelevantAttributes,
  matchesAgeBand,
  partitionContractClausesAndBonuses,
} from './recruitmentHelpers';

function makePlayer(overrides: Partial<PlayerRecord>): PlayerRecord {
  return {
    id: overrides.id || 'p-1',
    number: 9,
    name: overrides.name || 'Test Player',
    position: overrides.position || 'MC',
    apps: '10',
    minutes: 900,
    rating: 7.0,
    goals: 2,
    xG: 1.5,
    xGPer90: 0.15,
    assists: 2,
    xA: 1.5,
    xAPer90: 0.15,
    drbPer90: 1.0,
    prPassesPer90: 3.0,
    hdrPct: 50,
    intPer90: 1.0,
    tckPct: 70,
    personality: 'Balanced',
    age: 24,
    ability: 3.5,
    potential: 4.0,
    expires: '2027-06-30',
    nation: 'Belgium',
    wagePw: 400,
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
    ipRole: 'Central Midfielder',
    oopRole: 'Pressing Central Midfielder',
    notes: '',
    ...overrides,
  };
}

test('STC and ST striker targets always show Fin, Off, Pac, Com stat pills', () => {
  const makeTarget = (pos: string): RecruitmentTarget => ({
    uid: 101,
    name: 'Clinical Striker',
    age: 23,
    nationality: 'Belgium',
    primaryPosition: pos,
    currentClub: 'Free Agent',
    isFreeAgent: true,
    contractExpiryMonths: 0,
    demandedWageEur: 350,
    attributes: {
      finishing: 15,
      offTheBall: 14,
      pace: 16,
      composure: 13,
      passing: 8,
      decisions: 9,
      workRate: 10,
      stamina: 11,
    },
  });

  for (const pos of ['STC', 'ST', 'ST (C)', 'CF']) {
    assert.equal(classifyExactPositionSlot(pos), 'STC');
    const chips = getPositionRelevantAttributes(makeTarget(pos));
    assert.deepEqual(
      chips.map((c) => c.label),
      ['Fin', 'Off', 'Pac', 'Com'],
      `Expected striker stat pills for ${pos}`
    );
    assert.deepEqual(
      chips.map((c) => c.value),
      [15, 14, 16, 13]
    );
  }
});

test('evaluateTargetSquadDepth counts ONLY senior players with >= 15 familiarity at the exact slot', () => {
  const squad: PlayerRecord[] = [
    // 1 senior natural STC
    makePlayer({
      id: 'st-1',
      position: 'STC',
      status: 'Starter',
      positionRatings: { STC: 20, AML: 12 },
    }),
    // 1 senior accomplished STC (15/20)
    makePlayer({
      id: 'st-2',
      position: 'AMR',
      status: 'Rotation',
      positionRatings: { AMR: 19, ST: 15 },
    }),
    // Youth STC (20/20) — MUST NOT count toward senior depth
    makePlayer({
      id: 'st-youth',
      position: 'STC',
      status: 'Youth',
      positionRatings: { STC: 20 },
    }),
    // Senior player with only 12/20 at STC — MUST NOT count (< 15)
    makePlayer({
      id: 'st-unnatural',
      position: 'AMC',
      status: 'Starter',
      positionRatings: { AMC: 20, STC: 12 },
    }),
    // 3 senior natural MCs — should NOT be flagged as Priority GAP for MC, and MUST NOT count for AMC
    makePlayer({ id: 'mc-1', position: 'MC', status: 'Starter', positionRatings: { MC: 20, AMC: 10 } }),
    makePlayer({ id: 'mc-2', position: 'MC', status: 'Rotation', positionRatings: { MC: 18, AMC: 8 } }),
    makePlayer({ id: 'mc-3', position: 'MC', status: 'Rotation', positionRatings: { MC: 16, AMC: 5 } }),
  ];

  const stDepth = evaluateTargetSquadDepth('STC', squad);
  assert.equal(stDepth.slot, 'STC');
  assert.equal(stDepth.count, 2);
  assert.equal(stDepth.isGenuineGap, true);
  assert.match(stDepth.label, /Priority GAP/);

  const mcDepth = evaluateTargetSquadDepth('MC', squad);
  assert.equal(mcDepth.slot, 'MC');
  assert.equal(mcDepth.count, 3);
  assert.equal(mcDepth.isGenuineGap, false);
  assert.match(mcDepth.label, /^Depth: 3/);

  const amcDepth = evaluateTargetSquadDepth('AMC', squad);
  assert.equal(amcDepth.slot, 'AMC');
  assert.equal(amcDepth.count, 1);
  assert.equal(amcDepth.isGenuineGap, true);
});

test('partitionContractClausesAndBonuses separates Match Bonuses from Release Clauses and flags Playbook v2.0 notes', () => {
  const player = makePlayer({
    wagePw: 400,
    marketValue: 500000,
    ability: 3.5,
    contractDetails: {
      promisedPlayingTime: 'Regular Starter',
      optionalExtensionYears: 1,
      releaseClauses: [
        { type: 'Minimum Fee Release', amount: 150000 },
        { type: 'Unused Sub Fee', amount: 90 },
      ],
      bonuses: {
        appearanceFee: 120,
        goalBonus: 80,
        cleanSheetBonus: null,
        unusedSubFee: null,
      },
      loanWageContributionPct: null,
    },
  });

  const partitioned = partitionContractClausesAndBonuses(player.contractDetails);
  assert.equal(partitioned.releaseClauses.length, 1);
  assert.equal(partitioned.releaseClauses[0].type, 'Minimum Fee Release');
  assert.equal(partitioned.bonuses.appearanceFee, 120);
  assert.equal(partitioned.bonuses.goalBonus, 80);
  assert.equal(partitioned.bonuses.unusedSubFee, 90);

  const notes = getPlaybookContractNotes(player);
  assert.equal(notes.length, 2);
  assert.ok(notes.some((n) => /Unused Sub Fee/i.test(n)));
  assert.ok(notes.some((n) => /Low Release Clause/i.test(n)));
});

test('Playbook v2.0 Section 7: evaluatePlaybookArchetype tags & scores all 6 archetypes and Free Trial badges', () => {
  const st = evaluatePlaybookArchetype('STC', {
    finishing: 16,
    composure: 14,
    offTheBall: 15,
    pace: 15,
    jumpingReach: 10,
  });
  assert.equal(st.name, 'Goal Threat');
  assert.equal(st.score, 75);

  const w = evaluatePlaybookArchetype('AMR', {
    pace: 16,
    acceleration: 16,
    offTheBall: 14,
    workRate: 14,
    stamina: 14,
    crossing: 12,
    dribbling: 12,
  });
  assert.equal(w.name, 'Wide Runner');
  assert.equal(w.score, 70);

  const mid = evaluatePlaybookArchetype('DM', {
    stamina: 16,
    workRate: 16,
    decisions: 14,
    positioning: 14,
    firstTouch: 14,
    passing: 16,
  });
  assert.equal(mid.name, 'Midfield Runner/Organiser');
  assert.equal(mid.score, 75);

  const dc = evaluatePlaybookArchetype('DC', {
    positioning: 15,
    anticipation: 15,
    concentration: 14,
    jumpingReach: 16,
    leadership: 15,
  });
  assert.equal(dc.name, 'Defensive Organiser');
  assert.equal(dc.score, 75);

  const fb = evaluatePlaybookArchetype('DL', {
    tackling: 14,
    positioning: 14,
    stamina: 16,
    pace: 16,
    acceleration: 14,
    passing: 12,
  });
  assert.equal(fb.name, 'Flexible Full-Back');
  assert.equal(fb.score, 72);

  const gk = evaluatePlaybookArchetype('GK', {
    agility: 16,
    reflexes: 18,
  });
  assert.equal(gk.name, 'Goalkeeper Standard');
  assert.equal(gk.score, 85);

  const freeAgentContract = formatTargetContractSummary({
    uid: 101,
    name: 'Free Trial ST',
    age: 22,
    nationality: 'Belgium',
    primaryPosition: 'STC',
    isFreeAgent: true,
    contractExpiryMonths: 0,
    demandedWageEur: 0,
    attributes: {},
  });
  assert.equal(freeAgentContract.trialBadge, '2-Week Free Trial');
  assert.equal(freeAgentContract.wageLabel, null);

  const expiringContract = formatTargetContractSummary({
    uid: 102,
    name: 'Expiring DC',
    age: 24,
    nationality: 'Belgium',
    primaryPosition: 'DC',
    isFreeAgent: false,
    contractExpiryMonths: 4,
    demandedWageEur: 550,
    attributes: {},
  });
  assert.equal(expiringContract.trialBadge, null);
  assert.equal(expiringContract.primaryLabel, 'Expiring <= 4m');
  assert.equal(expiringContract.wageLabel, '£550/wk');
});

test('Compare vs Starter: findTopSeniorStarterForPosition pairs target with top-rated senior player at exact position and computes deltas', () => {
  const squad: PlayerRecord[] = [
    makePlayer({
      id: 'youth-st',
      name: 'Youth Wonderkid',
      position: 'STC',
      status: 'Youth',
      ability: 4.5,
      age: 17,
      wagePw: 120,
      positionRatings: { ST: 20 },
    }),
    makePlayer({
      id: 'backup-st',
      name: 'Backup Striker',
      position: 'STC',
      status: 'Rotation',
      ability: 2.5,
      age: 25,
      wagePw: 400,
      positionRatings: { ST: 20 },
    }),
    makePlayer({
      id: 'starter-st',
      name: 'Mbey Epolo',
      position: 'STC',
      status: 'Starter',
      ability: 3.5,
      age: 26,
      wagePw: 650,
      positionRatings: { ST: 20 },
      attributes: {
        pace: 13,
        acceleration: 12,
        stamina: 13,
        jumpingReach: 13,
        determination: 16,
        passing: 8,
        finishing: 14,
        tackling: 1,
        firstTouch: 12,
        decisions: 10,
        workRate: 8,
        offTheBall: 11,
        composure: 12,
      },
    }),
  ];

  const starter = findTopSeniorStarterForPosition('STC', squad);
  assert.ok(starter);
  assert.equal(starter.name, 'Mbey Epolo');

  const target: RecruitmentTarget = {
    uid: 777,
    name: 'Clinical Target',
    age: 22,
    nationality: 'Belgium',
    primaryPosition: 'STC',
    isFreeAgent: true,
    contractExpiryMonths: 0,
    demandedWageEur: 450,
    attributes: {
      finishing: 16,
      composure: 15,
      offTheBall: 14,
      pace: 15,
      jumpingReach: 11,
      firstTouch: 13,
    },
  };

  const cmp = buildTargetVsStarterComparison(target, starter);
  assert.equal(cmp.ageDelta, -4);
  assert.equal(cmp.wageDelta, -200);
  assert.equal(cmp.radarAxes.length, 6);
  const finAxis = cmp.radarAxes.find((a) => a.label === 'Fin');
  assert.ok(finAxis);
  assert.equal(finAxis.delta, 2);
});


test('Unknown target age stays an explicit gap instead of becoming a fake age', () => {
  const starter = makePlayer({ age: 24 });
  const target: RecruitmentTarget = {
    uid: 778,
    name: 'Unknown Age Target',
    age: null,
    nationality: '',
    primaryPosition: 'MC',
    isFreeAgent: true,
    contractExpiryMonths: 0,
    demandedWageEur: 0,
    attributes: { passing: 13, tackling: 12 },
  };

  const cmp = buildTargetVsStarterComparison(target, starter);
  assert.equal(cmp.ageDelta, null);
  assert.equal(matchesAgeBand(null, 'ALL'), true);
  assert.equal(matchesAgeBand(null, 'U23'), false);
  assert.equal(matchesAgeBand(null, '23-28'), false);
  assert.equal(matchesAgeBand(null, '29+'), false);
});
