import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMATION_PRESETS, solveBestXi, type SolvedSlot } from './bestXiSolver.ts';
import {
  analyzeRestDefenseMatrix,
  classifySlotRestDefenseCategory,
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

test('Phase 2: Inside Forward moves forward, Advanced Wing-Back & Inside Full-Back classify accurately, and 3-4-2-1 uses canonical FM27 roles', () => {
  const solved = solveBestXi(TEST_SQUAD, {
    shape: '4-3-3 DM Wide',
    customSlots: [
      { slotId: 'AML', ipRole: 'Inside Forward', oopRole: 'Tracking Winger' },
      { slotId: 'DR', ipRole: 'Advanced Wing-Back', oopRole: 'Pressing Wing-Back' },
      { slotId: 'DL', ipRole: 'Inside Full-Back', oopRole: 'Holding Full-Back' },
    ],
  });
  const matrix = analyzeRestDefenseMatrix(solved.startingXI, '4-3-3 DM Wide');

  const lwSlot = solved.startingXI.find((s) => s.slotId === 'AML');
  const lw = matrix.nodes.find((n) => n.slotId === 'AML');
  const rb = matrix.nodes.find((n) => n.slotId === 'DR');
  const lb = matrix.nodes.find((n) => n.slotId === 'DL');

  assert.ok(lwSlot && lw && rb && lb);
  assert.ok(
    lw.ipY < lwSlot.y,
    `Expected Inside Forward to move forward (ipY ${lw.ipY} < slot.y ${lwSlot.y})`
  );
  assert.equal(rb.categoryLabel, 'High Flank Overlapper');
  assert.equal(rb.category, 'ATTACKING_OUTLET');
  assert.equal(lb.categoryLabel, 'Auxiliary 3rd CB');
  assert.equal(lb.category, 'BASE_ANCHOR');

  const solved3421 = solveBestXi(TEST_SQUAD, { shape: '3-4-2-1' });
  const rcb = solved3421.startingXI.find((s) => s.slotId === 'DCR');
  const ram = solved3421.startingXI.find((s) => s.slotId === 'AMCR');
  assert.equal(rcb?.oopRole, 'Covering Wide Centre-Back');
  assert.equal(ram?.ipRole, 'Second Striker');
});


test('classifySlotRestDefenseCategory covers every outfield role family', () => {
  const cases: Array<[string, string, string, string, string]> = [
    ['Goalkeeper', 'Goalkeeper', 'Goalkeeper', 'GOALKEEPER', 'Sweeper / Line Keeper'],
    ['Centre-Back', 'Ball-Playing Centre-Back', 'Stopper', 'BASE_ANCHOR', 'Rest-Defense CB'],
    ['Full-Back', 'Inverted Full-Back', 'Holding Full-Back', 'BASE_ANCHOR', 'Auxiliary 3rd CB'],
    ['Wing-Back', 'Inside Full-Back', 'Pressing Wing-Back', 'BASE_ANCHOR', 'Auxiliary 3rd CB'],
    ['Full-Back', 'Full-Back', 'Holding Full-Back', 'BASE_ANCHOR', 'Tucked Rest-Defense FB'],
    ['Wing-Back', 'Attacking Wing-Back', 'Pressing Wing-Back', 'ATTACKING_OUTLET', 'High Flank Overlapper'],
    ['Full-Back', 'Full-Back', 'Pressing Full-Back', 'TRANSITION_SHUTTLE', 'Recovery Full-Back'],
    ['Defensive Midfielder', 'Half-Back', 'Screening Defensive Midfielder', 'BASE_ANCHOR', 'Dropping Half-Back Base'],
    ['Central Midfielder', 'Central Midfielder', 'Dropping Defensive Midfielder', 'BASE_ANCHOR', 'Dropping Half-Back Base'],
    ['Defensive Midfielder', 'Defensive Midfielder', 'Screening Defensive Midfielder', 'BASE_ANCHOR', 'Zone 5 Pivot Screen'],
    ['Central Midfielder', 'Central Midfielder', 'Screening Central Midfielder', 'BASE_ANCHOR', 'Zone 5 Pivot Screen'],
    ['Central Midfielder', 'Box-to-Box Midfielder', 'Screening Central Midfielder', 'TRANSITION_SHUTTLE', 'Box-to-Box Counter-Presser'],
    ['Winger', 'Winger', 'Tracking Winger', 'TRANSITION_SHUTTLE', 'Tracking Wide Shuttle'],
    ['Wide Midfielder', 'Wide Midfielder', 'Wide Outlet Winger', 'ATTACKING_OUTLET', 'Wide Counter Outlet'],
    ['Attacking Midfielder', 'Attacking Midfielder', 'Tracking Attacking Midfielder', 'TRANSITION_SHUTTLE', 'Half-Space Recovery AM'],
    ['Attacking Midfielder', 'Attacking Midfielder', 'Pressing Attacking Midfielder', 'ATTACKING_OUTLET', 'High Line Breaker'],
    ['Striker', 'Deep-Lying Forward', 'Pressing Forward', 'TRANSITION_SHUTTLE', 'Pressing Link Forward'],
    ['Striker', 'Advanced Forward', 'Tracking Forward', 'TRANSITION_SHUTTLE', 'Pressing Link Forward'],
    ['Striker', 'Advanced Forward', 'Pressing Forward', 'ATTACKING_OUTLET', 'Vertical Pin / Outlet'],
  ];

  for (const [positionGroup, ipRole, oopRole, category, label] of cases) {
    const info = classifySlotRestDefenseCategory({
      positionGroup,
      ipRole,
      oopRole,
    } as unknown as SolvedSlot);
    assert.equal(info.category, category, `${positionGroup} / ${ipRole} / ${oopRole}`);
    assert.equal(info.categoryLabel, label, `${positionGroup} / ${ipRole} / ${oopRole}`);
  }
});

test('classifySlotRestDefenseCategory marks which roles form the rear and screen lines', () => {
  const cb = classifySlotRestDefenseCategory({
    positionGroup: 'Centre-Back',
    ipRole: 'Ball-Playing Centre-Back',
    oopRole: 'Stopper',
  } as unknown as SolvedSlot);
  assert.equal(cb.isRearLineBase, true);
  assert.equal(cb.isMidfieldScreenBase, false);

  const tucked = classifySlotRestDefenseCategory({
    positionGroup: 'Full-Back',
    ipRole: 'Full-Back',
    oopRole: 'Holding Full-Back',
  } as unknown as SolvedSlot);
  assert.equal(tucked.isRearLineBase, false);
  assert.equal(tucked.isMidfieldScreenBase, true);

  const pivot = classifySlotRestDefenseCategory({
    positionGroup: 'Defensive Midfielder',
    ipRole: 'Defensive Midfielder',
    oopRole: 'Screening Defensive Midfielder',
  } as unknown as SolvedSlot);
  assert.equal(pivot.isRearLineBase, false);
  assert.equal(pivot.isMidfieldScreenBase, true);
});

test('getRestDefenseRoleExplanation falls back to the category when the label is unknown', () => {
  assert.match(getRestDefenseRoleExplanation('Unlisted', 'BASE_ANCHOR'), /Stays behind the ball/);
  assert.match(getRestDefenseRoleExplanation('Unlisted', 'TRANSITION_SHUTTLE'), /Shuttles between attack and defence/);
  assert.match(getRestDefenseRoleExplanation('Unlisted', 'ATTACKING_OUTLET'), /Stays high up the pitch/);
  assert.match(getRestDefenseRoleExplanation('Unlisted', 'GOALKEEPER'), /Protects the space behind/);
});
