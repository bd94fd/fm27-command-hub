import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeFm27RoleBrief,
  filterMeaningfulInstructions,
  FM27_SQUAD_PLANNER_SLOT_MAP,
  formatSquadPlannerSeasonLabel,
  normalizeTacticPositionToPlannerCode,
  resolveSquadPlannerSlotMeta,
} from './squadPlannerHelper.ts';

test('resolveSquadPlannerSlotMeta resolves canonical 27-slot pitch indices and explicit overrides', () => {
  assert.equal(FM27_SQUAD_PLANNER_SLOT_MAP[1].code, 'GK');
  assert.equal(FM27_SQUAD_PLANNER_SLOT_MAP[24].code, 'STC');

  const bySlot = resolveSquadPlannerSlotMeta({ slot: 18, positionCode: 'Slot 18' });
  assert.equal(bySlot.code, 'AMR');
  assert.equal(bySlot.line, 'FWD');

  const explicit = resolveSquadPlannerSlotMeta({ slot: 99, positionCode: 'dml' });
  assert.equal(explicit.code, 'DML');
  assert.equal(explicit.line, 'MID');

  const unknown = resolveSquadPlannerSlotMeta({ slot: 99, positionCode: '' });
  assert.equal(unknown.code, 'Pos 99');
});

test('normalizeTacticPositionToPlannerCode normalizes common aliases including ST/CF -> STC', () => {
  assert.equal(normalizeTacticPositionToPlannerCode('ST'), 'STC');
  assert.equal(normalizeTacticPositionToPlannerCode('CF'), 'STC');
  assert.equal(normalizeTacticPositionToPlannerCode('RB'), 'DR');
  assert.equal(normalizeTacticPositionToPlannerCode('LB'), 'DL');
  assert.equal(normalizeTacticPositionToPlannerCode('RCB'), 'DCR');
  assert.equal(normalizeTacticPositionToPlannerCode('LCB'), 'DCL');
  assert.equal(normalizeTacticPositionToPlannerCode('RW'), 'AMR');
  assert.equal(normalizeTacticPositionToPlannerCode('LW'), 'AML');
  assert.equal(normalizeTacticPositionToPlannerCode('RWB'), 'WBR');
  assert.equal(normalizeTacticPositionToPlannerCode(null), '');
});

test('formatSquadPlannerSeasonLabel labels current and future season offsets clearly', () => {
  assert.equal(formatSquadPlannerSeasonLabel(0), 'Current Season');
  assert.equal(formatSquadPlannerSeasonLabel(1), 'Next Season (+1)');
  assert.equal(formatSquadPlannerSeasonLabel(3), 'In 3 Seasons (+3)');
});

test('filterMeaningfulInstructions strips opaque binary placeholders and deduplicates real instructions', () => {
  const filtered = filterMeaningfulInstructions([
    'Setting 1',
    'Instruction #4: 2',
    '42',
    'Counter-Press',
    'Play Out of Defence',
    'Counter-Press',
    '',
  ]);
  assert.deepEqual(filtered, ['Counter-Press', 'Play Out of Defence']);
  assert.deepEqual(filterMeaningfulInstructions(null), []);
});

test('describeFm27RoleBrief explains authentic FM27 IP and OOP roles in plain English', () => {
  assert.match(describeFm27RoleBrief('Tracking Winger') ?? '', /overlapping full-backs/i);
  assert.match(describeFm27RoleBrief('Holding Full-Back') ?? '', /Patch 27\.1\.0/i);
  assert.match(describeFm27RoleBrief('Channel Forward') ?? '', /channels/i);
  assert.equal(describeFm27RoleBrief(''), null);
});
