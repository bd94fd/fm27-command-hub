import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferFm27Roles,
  IP_ROLE_NAMES,
  OOP_ROLE_NAMES,
  IN_POSSESSION_ROLES,
  OUT_OF_POSSESSION_ROLES,
} from './fm27RoleMatcher';

test('inferFm27Roles returns authentic FM27 dual-phase roles from the canonical catalog', () => {
  assert.equal(IN_POSSESSION_ROLES.length, 40, 'Must have authentic FM27 IP roles');
  assert.equal(OUT_OF_POSSESSION_ROLES.length, 28, 'Must have authentic FM27 OOP roles');

  const positionsToTest = [
    'GK',
    'D (C)',
    'D (R)',
    'D (L)',
    'WB (R)',
    'WB (L)',
    'DM',
    'DM, M (C)',
    'M (C)',
    'AM (R)',
    'AM (L)',
    'M/AM (RL)',
    'AM (C)',
    'ST (C)',
  ];

  const forbiddenRetired = [
    'Defend',
    'Support',
    'Attack',
    'Mezzala',
    'Enganche',
    'Trequartista',
  ];

  for (const pos of positionsToTest) {
    const roles = inferFm27Roles(pos);
    
    assert.ok(
      IP_ROLE_NAMES.has(roles.ipRole),
      `IP role "${roles.ipRole}" for ${pos} must be an authentic FM27 IP role`
    );
    assert.ok(
      OOP_ROLE_NAMES.has(roles.oopRole),
      `OOP role "${roles.oopRole}" for ${pos} must be an authentic FM27 OOP role`
    );

    for (const forbidden of forbiddenRetired) {
      assert.ok(
        !roles.ipRole.includes(forbidden),
        `IP role "${roles.ipRole}" must not include retired token "${forbidden}"`
      );
      assert.ok(
        !roles.oopRole.includes(forbidden),
        `OOP role "${roles.oopRole}" must not include retired token "${forbidden}"`
      );
    }
  }
});

test('inferFm27Roles differentiates striker roles based on finishing vs acceleration/pace', () => {
  const poacherAttrs = {
    finishing: 15,
    offTheBall: 10,
    pace: 10,
    acceleration: 10,
    passing: 8,
    jumpingReach: 10,
    stamina: 10,
    determination: 12,
    tackling: 2,
    firstTouch: 12,
    decisions: 10,
    workRate: 10,
  };
  const poacher = inferFm27Roles('ST (C)', poacherAttrs);
  assert.equal(poacher.ipRole, 'Poacher');
  assert.equal(poacher.oopRole, 'Central Outlet Centre Forward');

  const channelForwardAttrs = {
    finishing: 10,
    offTheBall: 14,
    pace: 15,
    acceleration: 15,
    passing: 10,
    jumpingReach: 10,
    stamina: 12,
    determination: 12,
    tackling: 4,
    firstTouch: 12,
    decisions: 11,
    workRate: 12,
  };
  const cf = inferFm27Roles('ST (C)', channelForwardAttrs);
  assert.equal(cf.ipRole, 'Channel Forward');
  assert.equal(cf.oopRole, 'Central Outlet Centre Forward');

  const targetForwardAttrs = {
    finishing: 12,
    offTheBall: 9,
    pace: 10,
    acceleration: 9,
    passing: 9,
    jumpingReach: 16,
    stamina: 12,
    determination: 14,
    tackling: 5,
    firstTouch: 11,
    decisions: 11,
    workRate: 12,
  };
  const tf = inferFm27Roles('ST (C)', targetForwardAttrs);
  assert.equal(tf.ipRole, 'Target Forward');
  assert.equal(tf.oopRole, 'Central Outlet Centre Forward');
});
