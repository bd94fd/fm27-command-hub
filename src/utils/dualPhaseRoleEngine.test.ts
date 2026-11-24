import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlayerRecord } from '../types/fm27.ts';
import {
  computeTouchlineAttributeFit,
  evaluateDualPhaseRoles,
  FM27_TOUCHLINE_ROLES,
  recommendTrainingFromEffectiveness,
  scoreTouchlineRole,
} from './dualPhaseRoleEngine.ts';

const RETIRED_FM24_ROLE_RE =
  /\b(mezzala|enganche|trequartista|carrilero|raumdeuter|segundo volante)\b/i;

function makeStriker(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id: 'st1',
    uid: 501,
    number: 9,
    name: 'Test Striker',
    age: 22,
    position: 'ST',
    positionRatings: { ST: 20, MC: 4 },
    ability: 3.5,
    potential: 4.5,
    wagePw: 1200,
    expires: '30/06/2029',
    nation: 'Belgium',
    personality: 'Resolute',
    status: 'Starter',
    ipRole: 'Channel Forward',
    oopRole: 'Pressing Centre Forward',
    condition: 95,
    morale: 'Good',
    apps: '12',
    minutes: 1000,
    goals: 8,
    xG: 7.1,
    xGPer90: 0.64,
    assists: 2,
    xA: 1.9,
    xAPer90: 0.17,
    drbPer90: 2.0,
    prPassesPer90: 2.5,
    hdrPct: 48,
    intPer90: 0.4,
    tckPct: 55,
    rating: 7.3,
    notes: '',
    attributes: {
      pace: 16,
      acceleration: 16,
      finishing: 15,
      offTheBall: 15,
      composure: 14,
      anticipation: 14,
      firstTouch: 14,
      dribbling: 14,
      workRate: 15,
      stamina: 15,
      decisions: 13,
      determination: 15,
      tackling: 8,
      strength: 13,
      jumpingReach: 13,
      agility: 14,
      balance: 13,
      teamwork: 14,
      aggression: 13,
      passing: 12,
      technique: 13,
      heading: 13,
    },
    ...overrides,
  };
}

test('FM27_TOUCHLINE_ROLES catalog contains both IP and OOP roles and zero retired FM24 roles', () => {
  const inRoles = FM27_TOUCHLINE_ROLES.filter((r) => r.phase === 'in');
  const outRoles = FM27_TOUCHLINE_ROLES.filter((r) => r.phase === 'out');
  assert.ok(inRoles.length > 0);
  assert.ok(outRoles.length > 0);
  for (const role of FM27_TOUCHLINE_ROLES) {
    assert.equal(
      RETIRED_FM24_ROLE_RE.test(role.name),
      false,
      `Retired FM24 role leaked into catalog: ${role.name}`
    );
  }
});

test('computeTouchlineAttributeFit weights priority 3x vs supporting 1x and returns null on empty attributes', () => {
  const role = {
    name: 'Test Role',
    phase: 'in' as const,
    position_groups: ['Striker'],
    priority: ['Pace'],
    supporting: ['Finishing'],
  };
  // (3*20 + 1*1) / 4 = 15.25 -> ((15.25 - 1)/19)*100 = 75.0
  assert.equal(
    computeTouchlineAttributeFit(role, { pace: 20, finishing: 1 } as PlayerRecord['attributes']),
    75
  );
  assert.equal(computeTouchlineAttributeFit(role, {} as PlayerRecord['attributes']), null);
});

test('scoreTouchlineRole and evaluateDualPhaseRoles alias ST <-> STC and enforce PosFam >= 15 gate', () => {
  const striker = makeStriker({ positionRatings: { ST: 20, MC: 4 } });
  const profile = evaluateDualPhaseRoles(striker, 3);

  assert.ok(profile.bestInPossession !== null);
  assert.ok(profile.bestOutOfPossession !== null);
  assert.equal(profile.bestInPossession?.eligible, true);
  assert.ok(
    profile.bestInPossession?.position === 'ST' || profile.bestInPossession?.position === 'STC'
  );

  // Must NOT be eligible for a Central Midfielder role with MC: 4
  const cmRole = FM27_TOUCHLINE_ROLES.find((r) => r.position_groups.includes('Central midfield'));
  assert.ok(cmRole);
  const cmScored = scoreTouchlineRole(cmRole, striker);
  assert.ok(cmScored !== null);
  assert.equal(cmScored.eligible, false);
  assert.equal(cmScored.overall, null);
});

test('recommendTrainingFromEffectiveness sorts weakest measured factors first and assigns priority bands', () => {
  const recs = recommendTrainingFromEffectiveness(
    [
      {
        id: 'f1',
        area: 'Tactical Understanding',
        label: 'Out-of-Possession Shape',
        score: 42,
        recommendedSession: 'Defending Engaged',
      },
      {
        id: 'f2',
        area: 'Player Buy-In',
        label: 'Morale Cohesion',
        score: 80,
        recommendedSession: 'Team Bonding',
      },
      {
        id: 'f3',
        area: 'Next Match Info',
        label: 'Opposition Scouting',
        score: 62,
        recommendedSession: 'Match Preview',
      },
      {
        id: 'f4',
        area: 'Player Ability',
        label: 'Unmeasured',
        score: null,
        recommendedSession: 'None',
      },
    ],
    2
  );

  assert.equal(recs.length, 2);
  assert.equal(recs[0].factorLabel, 'Out-of-Possession Shape');
  assert.equal(recs[0].priority, 'High');
  assert.equal(recs[1].factorLabel, 'Opposition Scouting');
  assert.equal(recs[1].priority, 'Medium');
});
