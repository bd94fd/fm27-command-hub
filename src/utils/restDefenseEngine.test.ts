import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMATION_PRESETS, solveBestXi } from './bestXiSolver.ts';
import {
  analyzeRestDefenseMatrix,
  getRestDefenseRoleExplanation,
} from './restDefenseEngine.ts';
import { PlayerRecord } from '../types/fm27.ts';

function makeDummyPlayer(id: string, name: string, position: string): PlayerRecord {
  return {
    id,
    name,
    number: 1,
    position,
    apps: '10',
    minutes: 900,
    rating: 7.1,
    goals: 1,
    xG: 0.8,
    xGPer90: 0.08,
    assists: 1,
    xA: 0.7,
    xAPer90: 0.07,
    drbPer90: 1.0,
    prPassesPer90: 3.0,
    hdrPct: 60,
    intPer90: 1.5,
    tckPct: 75,
    personality: 'Resolute',
    age: 24,
    ability: 3.5,
    potential: 4.0,
    wagePw: 1200,
    expires: '2028',
    nation: 'BEL',
    status: 'Starter',
    condition: 95,
    morale: 'Good',
    ipRole: 'Full-Back',
    oopRole: 'Holding Full-Back',
    notes: '',
    attributes: {
      pace: 14,
      acceleration: 14,
      stamina: 14,
      jumpingReach: 13,
      strength: 13,
      passing: 13,
      finishing: 12,
      tackling: 13,
      decisions: 13,
      workRate: 14,
      offTheBall: 13,
      firstTouch: 13,
      determination: 14,
      positioning: 13,
    },
  };
}

const TEST_SQUAD: PlayerRecord[] = [
  makeDummyPlayer('1', 'Keeper One', 'GK'),
  makeDummyPlayer('2', 'Right Back', 'DR'),
  makeDummyPlayer('3', 'Right CB', 'DC'),
  makeDummyPlayer('4', 'Left CB', 'DC'),
  makeDummyPlayer('5', 'Left Back', 'DL'),
  makeDummyPlayer('6', 'Holding DM', 'DM'),
  makeDummyPlayer('7', 'Right CM', 'MC'),
  makeDummyPlayer('8', 'Left CM', 'MC'),
  makeDummyPlayer('9', 'Right Winger', 'AMR'),
  makeDummyPlayer('10', 'Left Winger', 'AML'),
  makeDummyPlayer('11', 'Centre Forward', 'STC'),
];

test('analyzeRestDefenseMatrix computes 2-3 Rest-Defense Base for default 4-3-3 DM Wide', () => {
  const solved = solveBestXi(TEST_SQUAD, { shape: '4-3-3 DM Wide' });
  const matrix = analyzeRestDefenseMatrix(solved.startingXI, '4-3-3 DM Wide');

  assert.equal(matrix.baseDefenderCount, 2);
  assert.equal(matrix.pivotScreenCount, 3);
  assert.ok(matrix.structureLabel.startsWith('2-3 Rest-Defense Base'));
  assert.equal(matrix.lanes.length, 5);
  assert.ok(matrix.stabilityScore >= 75);
});

test('analyzeRestDefenseMatrix flags exposed flanks when both full-backs push high with outlet wingers', () => {
  const tpl = FORMATION_PRESETS['4-3-3 DM Wide'];
  const customSlots = tpl.map((slot) => {
    if (slot.slotId === 'DL' || slot.slotId === 'DR') {
      return {
        slotId: slot.slotId,
        ipRole: 'Attacking Wing-Back',
        oopRole: 'Pressing Full-Back',
      };
    }
    if (slot.slotId === 'AML' || slot.slotId === 'AMR') {
      return {
        slotId: slot.slotId,
        ipRole: 'Inside Forward',
        oopRole: 'Wide Outlet Winger',
      };
    }
    return {
      slotId: slot.slotId,
      ipRole: slot.defaultIpRole,
      oopRole: slot.defaultOopRole,
    };
  });

  const solved = solveBestXi(TEST_SQUAD, {
    shape: '4-3-3 DM Wide',
    customSlots,
  });
  const matrix = analyzeRestDefenseMatrix(solved.startingXI, '4-3-3 DM Wide');

  const leftFlank = matrix.lanes.find((l) => l.lane === 'Left Flank');
  const rightFlank = matrix.lanes.find((l) => l.lane === 'Right Flank');
  assert.equal(leftFlank?.status, 'Exposed');
  assert.equal(rightFlank?.status, 'Exposed');
  assert.ok(matrix.alerts.length >= 2);
});

test('Rest Defence keeps LW and LCM separated on pitch and explains every role in plain English', () => {
  const solved = solveBestXi(TEST_SQUAD, { shape: '4-3-3 DM Wide' });
  const matrix = analyzeRestDefenseMatrix(solved.startingXI, '4-3-3 DM Wide');
  const lw = matrix.nodes.find((n) => n.slotId === 'AML');
  const lcm = matrix.nodes.find((n) => n.slotId === 'MCL');
  assert.ok(lw && lcm, 'Expected AML and MCL nodes');
  const dist = Math.hypot(lw.restX - lcm.restX, lw.restY - lcm.restY);
  assert.ok(
    dist >= 16,
    `Expected LW (${lw.restX},${lw.restY}) and LCM (${lcm.restX},${lcm.restY}) to stay separated, got dist=${dist.toFixed(1)}`
  );
  for (const node of matrix.nodes) {
    const explanation = getRestDefenseRoleExplanation(
      node.categoryLabel,
      node.category
    );
    assert.ok(
      explanation.length >= 25,
      `Expected plain-English explanation for ${node.categoryLabel}`
    );
  }
});
