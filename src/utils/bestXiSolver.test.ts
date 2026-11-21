import test from 'node:test';
import assert from 'node:assert/strict';
import { solveBestXi, FORMATION_PRESETS } from './bestXiSolver.ts';
import { PlayerRecord } from '../types/fm27.ts';

function makePlayer(
  id: string,
  name: string,
  position: string,
  overrides: Partial<PlayerRecord> = {}
): PlayerRecord {
  return {
    id,
    uid: Number(id.replace(/\D/g, '')) || 1,
    number: 1,
    name,
    position,
    secondaryPositions: [],
    apps: '10',
    minutes: 900,
    rating: 7.1,
    goals: 0,
    xG: 0,
    xGPer90: 0,
    assists: 0,
    xA: 0,
    xAPer90: 0,
    drbPer90: 0,
    prPassesPer90: 0,
    hdrPct: 50,
    intPer90: 1,
    tckPct: 75,
    personality: 'Balanced',
    age: 24,
    ability: 3.5,
    potential: 4.0,
    condition: 95,
    sharpness: 95,
    expires: '2028-06-30',
    nation: 'Belgium',
    wagePw: 1000,
    status: 'Starter',
    attributes: {
      pace: 13,
      acceleration: 13,
      stamina: 13,
      jumpingReach: 12,
      determination: 13,
      passing: 13,
      finishing: 12,
      tackling: 12,
      firstTouch: 13,
      decisions: 13,
      workRate: 13,
      offTheBall: 13,
      handling: position.includes('GK') ? 14 : 2,
      reflexes: position.includes('GK') ? 15 : 2,
      aerialReach: position.includes('GK') ? 14 : 2,
      commandOfArea: position.includes('GK') ? 13 : 2,
      communication: position.includes('GK') ? 13 : 2,
      positioning: 13,
      concentration: 13,
      agility: 13,
    },
    ipRole: 'Central Midfielder',
    oopRole: 'Pressing Central Midfielder',
    notes: '',
    ...overrides,
  };
}

function buildFullSquad(): PlayerRecord[] {
  return [
    makePlayer('p1', 'GK One', 'GK', { ability: 4.0, positionRatings: { GK: 20 } }),
    makePlayer('p2', 'GK Two', 'GK', { ability: 3.0, positionRatings: { GK: 18 } }),
    makePlayer('p3', 'RB One', 'DR', { positionRatings: { DR: 20 } }),
    makePlayer('p4', 'CB One', 'DC', { positionRatings: { DC: 20 } }),
    makePlayer('p5', 'CB Two', 'DC', { positionRatings: { DC: 19 } }),
    makePlayer('p6', 'LB One', 'DL', { positionRatings: { DL: 20 } }),
    makePlayer('p7', 'DM One', 'DM', { positionRatings: { DM: 20 } }),
    makePlayer('p8', 'CM One', 'MC', { positionRatings: { MC: 20 } }),
    makePlayer('p9', 'CM Two', 'MC', { positionRatings: { MC: 19 } }),
    makePlayer('p10', 'RW One', 'AMR', { positionRatings: { AMR: 20 } }),
    makePlayer('p11', 'LW One', 'AML', { positionRatings: { AML: 20 } }),
    makePlayer('p12', 'ST One', 'ST', { positionRatings: { ST: 20 } }),
    // Bench / B-Team
    makePlayer('p13', 'RB Two', 'DR', { ability: 2.5, positionRatings: { DR: 17 } }),
    makePlayer('p14', 'CB Three', 'DC', { ability: 2.5, positionRatings: { DC: 17 } }),
    makePlayer('p15', 'CB Four', 'DC', { ability: 2.4, positionRatings: { DC: 16 } }),
    makePlayer('p16', 'LB Two', 'DL', { ability: 2.5, positionRatings: { DL: 17 } }),
    makePlayer('p17', 'DM Two', 'DM', { ability: 2.5, positionRatings: { DM: 17 } }),
    makePlayer('p18', 'CM Three', 'MC', { ability: 2.5, positionRatings: { MC: 17 } }),
    makePlayer('p19', 'CM Four', 'MC', { ability: 2.4, positionRatings: { MC: 16 } }),
    makePlayer('p20', 'RW Two', 'AMR', { ability: 2.5, positionRatings: { AMR: 17 } }),
    makePlayer('p21', 'LW Two', 'AML', { ability: 2.5, positionRatings: { AML: 17 } }),
    makePlayer('p22', 'ST Two', 'ST', { ability: 2.5, positionRatings: { ST: 17 } }),
  ];
}

test('solveBestXi produces deterministic Starting XI and non-overlapping Rotated B-Team', () => {
  const squad = buildFullSquad();
  const res1 = solveBestXi(squad, { shape: '4-3-3 DM Wide' });
  const res2 = solveBestXi(squad, { shape: '4-3-3 DM Wide' });

  assert.equal(res1.startingXI.length, 11);
  assert.equal(res1.rotatedBTeam.length, 11);

  const xiIds = res1.startingXI.map((s) => s.player?.id);
  const bIds = res1.rotatedBTeam.map((s) => s.player?.id);
  assert.deepEqual(xiIds, res2.startingXI.map((s) => s.player?.id));

  // No overlap between Starting XI and B-Team
  for (const id of xiIds) {
    assert.ok(id);
    assert.equal(bIds.includes(id), false);
  }

  // GK slot gets GK One, B-Team GK slot gets GK Two
  const gkSlot = res1.startingXI.find((s) => s.slotId === 'GK');
  const bGkSlot = res1.rotatedBTeam.find((s) => s.slotId === 'GK');
  assert.equal(gkSlot?.player?.id, 'p1');
  assert.equal(bGkSlot?.player?.id, 'p2');
});

test('solveBestXi respects excludeInjured, excludeSuspended (via activeSuspensions), and minCondition', () => {
  const squad = buildFullSquad();
  squad[0].status = 'Injured'; // GK One injured
  squad[11].condition = 72; // ST One below 80% matchday floor

  const result = solveBestXi(squad, {
    shape: '4-3-3 DM Wide',
    excludeInjured: true,
    excludeSuspended: true,
    minCondition: 80,
    activeSuspensions: [
      {
        playerUid: 7,
        playerName: 'DM One',
        competitionName: 'League',
        matchesRemaining: 1,
        scope: 'league',
        reason: 'Yellow card accumulation',
      },
    ],
  });

  const xiIds = new Set(result.startingXI.map((s) => s.player?.id));
  assert.equal(xiIds.has('p1'), false, 'Injured GK One must be excluded');
  assert.equal(xiIds.has('p7'), false, 'Suspended DM One must be excluded');
  assert.equal(xiIds.has('p12'), false, 'Low-condition ST One must be excluded');
  assert.equal(
    result.startingXI.find((s) => s.slotId === 'GK')?.player?.id,
    'p2',
    'Healthy GK Two should take GK slot'
  );
  assert.equal(result.excludedPlayers.length, 3);
});

test('solveBestXi never places an outfielder in GK when a GK is available, and falls back only when zero GKs exist', () => {
  const onlyOutfield = buildFullSquad().filter((p) => !p.position.includes('GK'));
  const resNoGk = solveBestXi(onlyOutfield, { shape: '4-4-2' });
  const gkSlotNoGk = resNoGk.startingXI.find((s) => s.slotId === 'GK');
  assert.ok(gkSlotNoGk?.player, 'Fallback outfielder assigned only when zero GKs exist');

  // Even a low-rated GK must take GK ahead of a 5-star outfielder
  const weakGk = makePlayer('gk-weak', 'Youth GK', 'GK', {
    ability: 1.0,
    positionRatings: { GK: 15 },
    attributes: {
      pace: 5,
      acceleration: 5,
      stamina: 5,
      jumpingReach: 5,
      determination: 5,
      passing: 5,
      finishing: 1,
      tackling: 1,
      firstTouch: 5,
      decisions: 5,
      workRate: 5,
      offTheBall: 5,
      handling: 6,
      reflexes: 6,
    },
  });
  const resWithGk = solveBestXi([weakGk, ...onlyOutfield], { shape: '3-4-2-1' });
  assert.equal(
    resWithGk.startingXI.find((s) => s.slotId === 'GK')?.player?.id,
    'gk-weak'
  );
});

test('all 4 preset formations have 11 slots', () => {
  for (const key of Object.keys(FORMATION_PRESETS) as Array<keyof typeof FORMATION_PRESETS>) {
    assert.equal(FORMATION_PRESETS[key].length, 11, `${key} should have 11 slots`);
  }
});

test('solveBestXi enforces >= 15/20 positional familiarity gate for ST, RW/LW, and DM even when unnatural players have higher attributes', () => {
  const squad = buildFullSquad();
  // Add an elite CB (20/20 DC, 1/20 ST) with maxed attacking attributes — must NOT displace natural ST
  const eliteCb = makePlayer('cb-super', 'Super CB', 'DC', {
    ability: 5.0,
    positionRatings: { DC: 20, ST: 1, DM: 1, AMR: 1, AML: 1 },
    attributes: {
      pace: 20,
      acceleration: 20,
      stamina: 20,
      jumpingReach: 20,
      determination: 20,
      passing: 20,
      finishing: 20,
      tackling: 20,
      firstTouch: 20,
      decisions: 20,
      workRate: 20,
      offTheBall: 20,
    },
  });

  const res = solveBestXi([...squad, eliteCb], { shape: '4-3-3 DM Wide' });
  const stSlot = res.startingXI.find((s) => s.slotId === 'ST');
  const dmSlot = res.startingXI.find((s) => s.slotId === 'DM');
  const rwSlot = res.startingXI.find((s) => s.slotId === 'AMR');
  const lwSlot = res.startingXI.find((s) => s.slotId === 'AML');

  assert.equal(stSlot?.isNaturalPosition, true, 'ST must be a natural striker (>= 15/20)');
  assert.notEqual(stSlot?.player?.id, 'cb-super', 'Super CB must not be placed at ST');
  assert.equal(dmSlot?.isNaturalPosition, true, 'DM must be a natural DM (>= 15/20)');
  assert.equal(rwSlot?.isNaturalPosition, true, 'RW must be a natural winger (>= 15/20)');
  assert.equal(lwSlot?.isNaturalPosition, true, 'LW must be a natural winger (>= 15/20)');
});

test('solveBestXi respects left vs right flanks for full-backs and wingers', () => {
  const squad = buildFullSquad().filter(
    (p) => !['DR', 'DL', 'AMR', 'AML'].includes(p.position)
  );
  const pureRb = makePlayer('rb-only', 'Pure RB', 'DR', {
    ability: 4.5,
    positionRatings: { DR: 20, DL: 1 },
  });
  const pureLb = makePlayer('lb-only', 'Pure LB', 'DL', {
    ability: 3.5,
    positionRatings: { DL: 20, DR: 1 },
  });
  const pureRw = makePlayer('rw-only', 'Pure RW', 'AMR', {
    ability: 4.5,
    positionRatings: { AMR: 20, AML: 1 },
  });
  const pureLw = makePlayer('lw-only', 'Pure LW', 'AML', {
    ability: 3.5,
    positionRatings: { AML: 20, AMR: 1 },
  });

  const res = solveBestXi([...squad, pureRb, pureLb, pureRw, pureLw], {
    shape: '4-3-3 DM Wide',
  });
  assert.equal(res.startingXI.find((s) => s.slotId === 'DR')?.player?.id, 'rb-only');
  assert.equal(res.startingXI.find((s) => s.slotId === 'DL')?.player?.id, 'lb-only');
  assert.equal(res.startingXI.find((s) => s.slotId === 'AMR')?.player?.id, 'rw-only');
  assert.equal(res.startingXI.find((s) => s.slotId === 'AML')?.player?.id, 'lw-only');
});

