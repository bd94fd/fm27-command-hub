import assert from 'node:assert/strict';
import test from 'node:test';
import { hydrateStaff } from './hydrateStaff.ts';
import type { DecodedFmSavePayload } from './fmSaveHydrator';

const decodedWith = (staff: unknown[], clubName = 'KVV Zelzate') =>
  ({ meta: { clubName }, staff }) as unknown as DecodedFmSavePayload;

test('a staff row becomes a directory record with a stable id', () => {
  const [record] = hydrateStaff(
    decodedWith([
      {
        uid: 301,
        name: '  Jane Doe  ',
        role: ' Assistant Manager ',
        age: 44,
        nation: 'England',
        wagePw: 3200,
        expires: '30 Jun 2028',
        secondaryJob: 'Coach',
        jobRatings: { attacking: 14 },
      },
    ])
  );
  assert.equal(record.id, 'fm-staff-301');
  assert.equal(record.name, 'Jane Doe');
  assert.equal(record.role, 'Assistant Manager');
  assert.equal(record.age, 44);
  assert.equal(record.wagePw, 3200);
  assert.equal(record.secondaryJob, 'Coach');
  assert.deepEqual(record.jobRatings, { attacking: 14 });
});

test('a staff row with no uid still gets a unique id from its position', () => {
  const records = hydrateStaff(
    decodedWith([{ name: 'First', role: 'Scout' }, { name: 'Second', role: 'Scout' }])
  );
  assert.equal(records[0].id, 'fm-staff-0');
  assert.equal(records[1].id, 'fm-staff-1');
});

test('missing text falls back to the app placeholder rather than an empty field', () => {
  const [record] = hydrateStaff(decodedWith([{ uid: 1, name: '   ', role: null, nation: null }]));
  assert.equal(record.name, '--');
  assert.equal(record.role, '--');
  assert.equal(record.nation, '--');
  assert.equal(record.expires, '--');
});

test('an unusable age is reported as unknown instead of zero', () => {
  const records = hydrateStaff(
    decodedWith([
      { uid: 1, name: 'Zero', role: 'Coach', age: 0 },
      { uid: 2, name: 'Null', role: 'Coach', age: null },
      { uid: 3, name: 'Text', role: 'Coach', age: 'forty' },
      { uid: 4, name: 'Fine', role: 'Coach', age: '44' },
    ])
  );
  assert.ok(Number.isNaN(records[0].age));
  assert.ok(Number.isNaN(records[1].age));
  assert.ok(Number.isNaN(records[2].age));
  assert.equal(records[3].age, 44);
});

test('an unusable wage becomes null, never a fake figure', () => {
  const records = hydrateStaff(
    decodedWith([
      { uid: 1, name: 'A', role: 'Coach', wagePw: null },
      { uid: 2, name: 'B', role: 'Coach', wagePw: Number.POSITIVE_INFINITY },
      { uid: 3, name: 'C', role: 'Coach', wagePw: 900 },
    ])
  );
  assert.equal(records[0].wagePw, null);
  assert.equal(records[1].wagePw, null);
  assert.equal(records[2].wagePw, 900);
});

test('the club falls back to the save club name when the staff row has none', () => {
  const [record] = hydrateStaff(decodedWith([{ uid: 1, name: 'A', role: 'Coach' }], 'KVV Zelzate'));
  assert.equal(record.club, 'KVV Zelzate');
});

test('missing attributes are filled with a neutral 10 and the coaching numbers are kept', () => {
  const [record] = hydrateStaff(
    decodedWith([
      {
        uid: 1,
        name: 'A',
        role: 'Coach',
        coachingAttacking: 15,
        coachingDefending: 12,
        coachingTactical: 16,
        judgingAbility: 13,
        judgingPotential: 11,
      },
    ])
  );
  assert.equal(record.attributes.attacking, 15);
  assert.equal(record.attributes.defending, 12);
  assert.equal(record.attributes.tactical, 16);
  assert.equal(record.attributes.judging_player_ability, 13);
  assert.equal(record.attributes.judging_player_potential, 11);
  assert.equal(record.attributes.fitness, 10);
  assert.equal(record.attributes.analysing_data, 10);
});

test('attributes the save already provides are used as given', () => {
  const provided = { attacking: 9, defending: 8, fitness: 7, goalkeeping: 6, mental: 5 };
  const [record] = hydrateStaff(
    decodedWith([{ uid: 1, name: 'A', role: 'Coach', attributes: provided, coachingAttacking: 20 }])
  );
  assert.deepEqual(record.attributes, provided);
});

test('an empty staff list produces an empty directory', () => {
  assert.deepEqual(hydrateStaff(decodedWith([])), []);
});
