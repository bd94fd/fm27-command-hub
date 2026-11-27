import assert from 'node:assert/strict';
import test from 'node:test';
import { PITCH_ROWS, getPositionScore } from './pitchFamiliarity.ts';
import type { PlayerRecord } from '../types/fm27';

const rows = (p: Pick<PlayerRecord, 'position' | 'positionRatings'>) => ({
  position: p.position,
  positionRatings: p.positionRatings,
});

test('the pitch map covers every slot once, from striker to keeper', () => {
  const codes = PITCH_ROWS.flat().map((p) => p.code);
  assert.equal(codes.length, 14);
  assert.equal(new Set(codes).size, 14);
  assert.equal(PITCH_ROWS[0][0].code, 'ST');
  assert.equal(PITCH_ROWS[PITCH_ROWS.length - 1][0].code, 'GK');
});

test('an explicit position rating wins', () => {
  const player = rows({ position: 'D (C)', positionRatings: { DC: 17, MC: 4 } });
  assert.equal(getPositionScore(player, 'DC'), 17);
  assert.equal(getPositionScore(player, 'MC'), 4);
});

test('the save can spell striker ST or STC and either is understood', () => {
  assert.equal(getPositionScore(rows({ position: 'ST', positionRatings: { STC: 15 } }), 'ST'), 15);
  assert.equal(getPositionScore(rows({ position: 'ST', positionRatings: { ST: 16 } }), 'STC'), 16);
});

test('a lower-case rating key still matches', () => {
  assert.equal(getPositionScore(rows({ position: 'D (C)', positionRatings: { dc: 13 } }), 'DC'), 13);
});

test('without ratings the listed position decides, and unknown slots read as 1', () => {
  assert.equal(getPositionScore(rows({ position: 'D (C)' }), 'DC'), 19);
  assert.equal(getPositionScore(rows({ position: 'D (C)' }), 'DL'), 1);
  assert.equal(getPositionScore(rows({ position: 'D (R)' }), 'DR'), 18);
  assert.equal(getPositionScore(rows({ position: 'M (C)' }), 'MC'), 18);
  assert.equal(getPositionScore(rows({ position: 'AM (L)' }), 'AML'), 18);
  assert.equal(getPositionScore(rows({ position: 'GK' }), 'GK'), 19);
});

test('a rating of zero is kept, because zero is a real familiarity', () => {
  assert.equal(getPositionScore(rows({ position: 'GK', positionRatings: { ST: 0 } }), 'ST'), 0);
});
