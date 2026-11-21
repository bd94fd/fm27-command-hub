import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerRecord } from '../types/fm27';
import { RecruitmentTarget } from '../types/fmSave';
import {
  classifyExactPositionSlot,
  evaluateTargetSquadDepth,
  getPlaybookContractNotes,
  getPositionRelevantAttributes,
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
