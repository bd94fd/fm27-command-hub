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

test('positional-familiarity gate excludes unnatural positions (AMC 20/20, MC 2/20) from MC role rankings and default roles', async () => {
  const {
    scorePlayerForFm27Role,
    rankSquadForFm27Role,
    resolveNaturalDefaultRoles,
  } = await import('./fm27RoleMatcher');

  const baseAttrs = {
    pace: 13,
    acceleration: 13,
    stamina: 14,
    jumpingReach: 10,
    determination: 14,
    passing: 16,
    finishing: 13,
    tackling: 10,
    firstTouch: 15,
    decisions: 15,
    workRate: 14,
    offTheBall: 15,
    vision: 16,
    technique: 15,
    composure: 14,
  };

  const amcOnlyPlayer = {
    id: 'p-amc',
    number: 10,
    name: 'AMC Specialist',
    position: 'AM (C)',
    apps: '10',
    minutes: 900,
    rating: 7.2,
    goals: 5,
    xG: 4.1,
    xGPer90: 0.41,
    assists: 4,
    xA: 3.5,
    xAPer90: 0.35,
    drbPer90: 1.5,
    prPassesPer90: 4.2,
    hdrPct: 40,
    intPer90: 0.8,
    tckPct: 65,
    personality: 'Professional',
    age: 24,
    ability: 4.0,
    potential: 4.0,
    expires: '2028-06-30',
    nation: 'Belgium',
    wagePw: 600,
    status: 'Starter' as const,
    positionRatings: { AMC: 20, MC: 2 },
    attributes: baseAttrs,
    ipRole: 'Central Midfielder', // Deliberately wrong unnatural role
    oopRole: 'Pressing Central Midfielder',
    notes: '',
  };

  const naturalMcPlayer = {
    ...amcOnlyPlayer,
    id: 'p-mc',
    number: 8,
    name: 'Natural MC',
    position: 'M (C)',
    ability: 3.0,
    positionRatings: { MC: 18, AMC: 8 },
    ipRole: 'Box-to-Box Midfielder',
    oopRole: 'Pressing Central Midfielder',
  };

  const mcRole = IN_POSSESSION_ROLES.find(
    (r) => r.positionGroup === 'Central Midfielder'
  );
  assert.ok(mcRole, 'Expected a Central Midfielder role in IN_POSSESSION_ROLES');

  const amcScoreInMc = scorePlayerForFm27Role(amcOnlyPlayer, mcRole);
  const mcScoreInMc = scorePlayerForFm27Role(naturalMcPlayer, mcRole);
  assert.ok(
    amcScoreInMc < 35 && mcScoreInMc > amcScoreInMc + 35,
    `Expected unnatural MC (2/20) score (${amcScoreInMc}) to be heavily penalized vs natural MC (${mcScoreInMc})`
  );

  const ranked = rankSquadForFm27Role([amcOnlyPlayer, naturalMcPlayer], mcRole, 5);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].player.id, 'p-mc');

  const defaults = resolveNaturalDefaultRoles(amcOnlyPlayer);
  const resolvedIp = IN_POSSESSION_ROLES.find((r) => r.name === defaults.ipRole);
  const resolvedOop = OUT_OF_POSSESSION_ROLES.find((r) => r.name === defaults.oopRole);
  assert.equal(resolvedIp?.positionGroup, 'Attacking Midfielder');
  assert.equal(resolvedOop?.positionGroup, 'Attacking Midfielder');
});

