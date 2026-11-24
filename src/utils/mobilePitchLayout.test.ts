import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PlayerRecord } from '../types/fm27';
import type { SolvedSlot } from './bestXiSolver';
import {
  buildBenchRailPlayers,
  formatMobileSurname,
  resolveCompleteCardColumns,
  resolveMobilePitchCoordinates,
} from './mobilePitchLayout';

function makePlayer(overrides: Partial<PlayerRecord> & { id: string; name: string }): PlayerRecord {
  return {
    position: 'MC',
    age: 23,
    ability: 3.5,
    potential: 4.0,
    status: 'First Team',
    wagePw: 1200,
    expires: '2028',
    personality: 'Professional',
    ipRole: 'Box-to-Box Midfielder',
    oopRole: 'Pressing Central Midfielder',
    apps: 12,
    minutes: 960,
    goals: 2,
    assists: 3,
    avgRating: 7.1,
    condition: 95,
    sharpness: 92,
    morale: 'Good',
    attributes: {
      pace: 13,
      acceleration: 13,
      stamina: 14,
      naturalFitness: 14,
      jumpingReach: 11,
      passing: 13,
      firstTouch: 13,
      finishing: 10,
      tackling: 12,
      decisions: 13,
      determination: 14,
      workRate: 14,
      offTheBall: 12,
    },
    ...overrides,
  } as PlayerRecord;
}

function makeSlot(slotId: string, player: PlayerRecord | null): SolvedSlot {
  return {
    slotId,
    label: slotId,
    positionGroup: 'Midfielder',
    flank: 'C',
    x: 50,
    y: 50,
    ipRole: 'Box-to-Box Midfielder',
    oopRole: 'Pressing Central Midfielder',
    player,
    ipFitPct: 80,
    oopFitPct: 78,
    combinedFitPct: 79,
    isNaturalPosition: true,
    warnings: [],
  };
}

describe('resolveMobilePitchCoordinates', () => {
  it('clamps extreme coordinates safely inside mobile pitch bounds', () => {
    const resolved = resolveMobilePitchCoordinates([
      { slotId: 'LW', x: 2, y: 3 },
      { slotId: 'RW', x: 98, y: 97 },
    ]);
    const lw = resolved.get('LW')!;
    const rw = resolved.get('RW')!;
    assert.ok(lw.x >= 12 && lw.y >= 9, `Expected LW clamped inside bounds, got ${JSON.stringify(lw)}`);
    assert.ok(rw.x <= 88 && rw.y <= 91, `Expected RW clamped inside bounds, got ${JSON.stringify(rw)}`);
  });

  it('separates overlapping nodes in cramped Rest Defence shapes so no two badges collide', () => {
    // 5 players clustered tightly around the midfield/backline in Rest Defence
    const cramped = [
      { slotId: 'LB', x: 28, y: 66 },
      { slotId: 'LCB', x: 35, y: 69 },
      { slotId: 'DM', x: 48, y: 66 },
      { slotId: 'RCB', x: 56, y: 69 },
      { slotId: 'RB', x: 64, y: 66 },
    ];
    const resolved = resolveMobilePitchCoordinates(cramped);
    const pts = cramped.map((c) => resolved.get(c.slotId)!);

    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        const dx = Math.abs(pts[i].x - pts[j].x);
        const dy = Math.abs(pts[i].y - pts[j].y);
        const overlapping = dx < 18 && dy < 12;
        assert.equal(
          overlapping,
          false,
          `Nodes ${cramped[i].slotId} and ${cramped[j].slotId} still overlap: dx=${dx}, dy=${dy}`
        );
      }
    }
  });
});

describe('formatMobileSurname', () => {
  it('preserves short Dutch/European particles and handles single names cleanly', () => {
    assert.equal(formatMobileSurname('Virgil van Dijk'), 'van Dijk');
    assert.equal(formatMobileSurname('Kevin De Bruyne'), 'De Bruyne');
    assert.equal(formatMobileSurname('Rodri'), 'Rodri');
    assert.equal(formatMobileSurname(''), 'Empty');
  });
});

describe('buildBenchRailPlayers', () => {
  it('excludes starters, injured, and league-banned players, keeps cup-ban-only eligible, puts GK first, and respects Surplus Law', () => {
    const starter = makePlayer({ id: 'p1', name: 'Starter Mid', position: 'MC', ability: 4.0 });
    const injured = makePlayer({ id: 'p2', name: 'Injured Striker', position: 'ST', status: 'Injured', ability: 4.5 });
    const leagueBanned = makePlayer({
      id: 'p3',
      name: 'League Banned',
      position: 'DC',
      ability: 4.2,
      activeSuspensions: [
        {
          playerUid: 3003,
          playerName: 'League Banned',
          matchesRemaining: 1,
          competitionName: 'Belgian National Division 1',
          scope: 'league',
          reason: 'Yellow cards',
        },
      ],
    });
    const cupBanned = makePlayer({
      id: 'p4',
      name: 'Cup Banned Wing',
      position: 'AMR',
      ability: 3.4,
      activeSuspensions: [
        {
          playerUid: 4004,
          playerName: 'Cup Banned Wing',
          matchesRemaining: 1,
          competitionName: 'Croky Cup',
          scope: 'cup',
          reason: 'Red card',
        },
      ],
    });
    const backupGk = makePlayer({ id: 'p5', name: 'Backup Keeper', position: 'GK', ability: 3.0 });
    const surplusStar = makePlayer({
      id: 'p6',
      name: 'Surplus Veteran',
      position: 'MC',
      status: 'Surplus',
      ability: 4.5,
    });
    const activeCover = makePlayer({
      id: 'p7',
      name: 'Active Mid',
      position: 'MC',
      status: 'Rotation',
      ability: 3.2,
    });

    const bench = buildBenchRailPlayers(
      [starter, injured, leagueBanned, cupBanned, backupGk, surplusStar, activeCover],
      [makeSlot('MC', starter)],
      [],
      'Belgian National Division 1',
      9
    );

    const ids = bench.map((b) => b.player.id);
    assert.ok(!ids.includes('p1'), 'Starter must not appear on bench');
    assert.ok(!ids.includes('p2'), 'Injured player must not appear on bench');
    assert.ok(!ids.includes('p3'), 'League-banned player must not appear on bench');
    assert.equal(bench[0].player.id, 'p5', 'Eligible backup GK must occupy first bench slot');

    const cupEntry = bench.find((b) => b.player.id === 'p4');
    assert.ok(cupEntry, 'Cup-ban-only player must remain eligible for league bench');
    assert.equal(cupEntry.cupBanOnly, true);

    const activeIdx = ids.indexOf('p7');
    const surplusIdx = ids.indexOf('p6');
    assert.ok(
      activeIdx < surplusIdx,
      'Active cover must rank ahead of Surplus player per Surplus Law'
    );
  });
});

describe('resolveCompleteCardColumns', () => {
  it('pads 3-metric presets to 4 unique KPIs while preserving preset order', () => {
    const overviewCols = resolveCompleteCardColumns(['durability', 'dna', 'wage'], 'overview');
    assert.equal(overviewCols.length, 4);
    assert.deepEqual(overviewCols.slice(0, 3), ['durability', 'dna', 'wage']);
    assert.equal(new Set(overviewCols).size, 4);

    const statsCols = resolveCompleteCardColumns(['apps', 'rating', 'goalsXg', 'assistsXa'], 'stats');
    assert.deepEqual(statsCols, ['apps', 'rating', 'goalsXg', 'assistsXa']);
  });
});
