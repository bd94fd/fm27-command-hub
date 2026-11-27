import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attrColorClass,
  durabilityBadgeClass,
  formatFootLabel,
  normalizeAttrKey,
  pitchBadgeClass,
  readOptionalAttr,
  tierBadgeClass,
} from './playerDetailFormat.ts';
import type { PlayerRecord } from '../types/fm27';

test('attribute colours step at 16, 13 and 10', () => {
  assert.equal(attrColorClass(null), 'text-slate-600');
  assert.match(attrColorClass(16), /emerald/);
  assert.match(attrColorClass(13), /lime/);
  assert.match(attrColorClass(10), /amber/);
  assert.match(attrColorClass(9), /slate-400/);
});

test('pitch familiarity badges step at 18, 15, 12 and 9', () => {
  assert.match(pitchBadgeClass(18), /emerald/);
  assert.match(pitchBadgeClass(15), /lime/);
  assert.match(pitchBadgeClass(12), /amber/);
  assert.match(pitchBadgeClass(9), /orange/);
  assert.match(pitchBadgeClass(8), /slate-700/);
});

test('role priority keys normalise to the player attribute spelling', () => {
  assert.equal(normalizeAttrKey('Off The Ball'), 'offtheball');
  assert.equal(normalizeAttrKey('off_the_ball'), 'offtheball');
  assert.equal(normalizeAttrKey('OffTheBall'), 'offtheball');
});

test('an attribute the save left out reads as no value, not as zero', () => {
  assert.equal(readOptionalAttr(undefined), null);
  assert.equal(readOptionalAttr(null), null);
  assert.equal(readOptionalAttr(0), null);
  assert.equal(readOptionalAttr(Number.NaN), null);
  assert.equal(readOptionalAttr(14), 14);
});

test('a two-footed player shows both foot strengths', () => {
  const player = { preferredFoot: 'Left', leftFoot: 20, rightFoot: 14 } as PlayerRecord;
  assert.equal(formatFootLabel(player), 'Left (L 20 / R 14)');
});

test('a one-footed player shows the preferred foot only', () => {
  assert.equal(formatFootLabel({ preferredFoot: 'Right' } as PlayerRecord), 'Right Foot');
  assert.equal(formatFootLabel({} as PlayerRecord), 'Right Foot');
});

test('role fit tiers get their own badge colours', () => {
  assert.match(tierBadgeClass('Natural Fit'), /emerald/);
  assert.match(tierBadgeClass('Solid'), /sky/);
  assert.match(tierBadgeClass('Makeshift'), /amber/);
});

test('durability tiers get their own badge colours', () => {
  assert.match(durabilityBadgeClass('Ironman'), /emerald/);
  assert.match(durabilityBadgeClass('Reliable'), /sky/);
  assert.match(durabilityBadgeClass('Manage Load'), /amber/);
  assert.match(durabilityBadgeClass('Fragile'), /rose/);
  assert.match(durabilityBadgeClass('something new'), /rose/);
});
