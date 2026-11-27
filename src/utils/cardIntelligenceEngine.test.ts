import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlayerRecord } from '../types/fm27.ts';
import type { ClubGovernanceState, RecruitmentTarget } from '../types/fmSave.ts';
import {
  computePositionPercentilePizza,
  evaluateScoutTargetCard,
  evaluateSquadPlayerCard,
} from './cardIntelligenceEngine.ts';

function makeAttrs(
  overrides: Partial<PlayerRecord['attributes']> = {}
): PlayerRecord['attributes'] {
  return {
    passing: 14,
    firstTouch: 14,
    tackling: 13,
    vision: 14,
    decisions: 14,
    determination: 14,
    workRate: 15,
    stamina: 15,
    pace: 14,
    acceleration: 14,
    anticipation: 14,
    positioning: 13,
    marking: 12,
    finishing: 11,
    dribbling: 13,
    offTheBall: 13,
    composure: 13,
    jumpingReach: 11,
    heading: 11,
    reflexes: 4,
    handling: 4,
    oneOnOnes: 4,
    aerialReach: 4,
    commandOfArea: 4,
    agility: 13,
    ...overrides,
  };
}

function makePlayer(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id: 'p1',
    uid: 1001,
    number: 8,
    name: 'Jan Peeters',
    age: 24,
    position: 'MC',
    ability: 3.5,
    potential: 4.0,
    wagePw: 600,
    expires: '30/06/2028',
    contractExpiryMonths: 18,
    nation: 'Belgium',
    personality: 'Balanced',
    status: 'Starter',
    ipRole: 'Box-to-Box Midfielder',
    oopRole: 'Pressing Central Midfielder',
    condition: 94,
    morale: 'Good',
    apps: '15',
    minutes: 1300,
    goals: 3,
    xG: 2.5,
    xGPer90: 0.17,
    assists: 4,
    xA: 3.6,
    xAPer90: 0.25,
    drbPer90: 1.5,
    prPassesPer90: 5.2,
    hdrPct: 45,
    intPer90: 1.8,
    tckPct: 74,
    rating: 7.1,
    notes: '',
    attributes: makeAttrs(),
    ...overrides,
  };
}

test('computePositionPercentilePizza produces 8 position-aware spokes for GK, DEF, MID, and FWD', () => {
  const pool = [
    makePlayer({ id: 'm1', position: 'MC', attributes: makeAttrs({ passing: 10, stamina: 10, pace: 10 }) }),
    makePlayer({ id: 'm2', position: 'MC', attributes: makeAttrs({ passing: 13, stamina: 13, pace: 13 }) }),
    makePlayer({ id: 'm3', position: 'MC', attributes: makeAttrs({ passing: 16, stamina: 16, pace: 16 }) }),
  ];

  const midSlices = computePositionPercentilePizza(pool[2], pool);
  assert.equal(midSlices.length, 8);
  assert.equal(midSlices[0].shortLabel, 'PAS');
  assert.ok(midSlices[0].percentile >= 70);

  const gkSlices = computePositionPercentilePizza(
    makePlayer({ id: 'gk1', position: 'GK', attributes: makeAttrs({ reflexes: 15, handling: 14 }) }),
    pool
  );
  assert.equal(gkSlices.length, 8);
  assert.equal(gkSlices[0].shortLabel, 'REF');
  assert.equal(gkSlices[0].category, 'goalkeeping');
});

test('evaluateSquadPlayerCard flags Surplus, U21 Protect, low stamina sub risk, and breached promises accurately', () => {
  const pool = [
    makePlayer({ id: 'p1', uid: 1, wagePw: 600 }),
    makePlayer({ id: 'p2', uid: 2, wagePw: 600 }),
    makePlayer({ id: 'p3', uid: 3, wagePw: 600 }),
  ];

  const surplus = evaluateSquadPlayerCard(
    makePlayer({ id: 's1', status: 'Surplus', wagePw: 1200 }),
    pool
  );
  assert.equal(surplus.verdictLabel, 'Surplus / Offload');
  assert.equal(surplus.tone, 'rose');

  const youth = evaluateSquadPlayerCard(
    makePlayer({ id: 'y1', age: 18, ability: 2.0, potential: 4.5, wagePw: 0 }),
    pool
  );
  assert.equal(youth.verdictLabel, 'Protect U21 Asset');
  assert.equal(youth.valueTag, 'Youth / Non-Contract');

  const lowStamina = evaluateSquadPlayerCard(
    makePlayer({
      id: 'ls1',
      attributes: makeAttrs({ stamina: 9 }),
    }),
    pool
  );
  assert.match(lowStamina.primaryRisk, /Window 1 \(60–63'\) sub candidate/);

  const govWithBreach = {
    playerPromiseAudits: [
      {
        playerId: 'p1',
        playerUid: 1,
        playerName: 'Jan Peeters',
        promisedPlayingTime: 'Star Player',
        status: 'breached',
        actualSharePct: 30,
        expectedMinPct: 68,
        note: 'Star Player promise breached: only 30% minutes played',
      },
    ],
  } as unknown as ClubGovernanceState;

  const promised = evaluateSquadPlayerCard(pool[0], pool, { governance: govWithBreach });
  assert.equal(promised.promiseTag, 'Promise Risk: Star Player');
  assert.match(promised.primaryRisk, /breached/i);
});

test('evaluateScoutTargetCard scores free agents, critical gaps, and age 30+ risk cleanly', () => {
  const squad = [
    makePlayer({ id: 'cb1', position: 'DC', status: 'Starter', wagePw: 800 }),
  ];

  const target: RecruitmentTarget = {
    uid: 9901,
    name: 'Lukas De Vries',
    age: 21,
    nationality: 'Belgium',
    currentClub: 'Free Agent',
    primaryPosition: 'ST',
    secondaryPositions: ['AMR'],
    positionRatings: { ST: 20, STC: 20, AMR: 15 },
    isFreeAgent: true,
    contractExpiryMonths: 0,
    demandedWageEur: 400,
    scoutBadges: ['Consistent Performer'],
    traits: [],
    attributes: {
      pace: 16,
      acceleration: 16,
      finishing: 14,
      offTheBall: 15,
      dribbling: 14,
      firstTouch: 14,
      composure: 13,
      anticipation: 14,
      stamina: 14,
      workRate: 14,
    },
  } as unknown as RecruitmentTarget;

  const summary = evaluateScoutTargetCard(target, squad);
  assert.equal(summary.valueTag, 'Free Agent');
  assert.equal(summary.depthPriority, 'Critical Gap');
  assert.equal(summary.verdictLabel, 'Priority Signing');
  assert.equal(summary.tone, 'emerald');
  assert.equal(summary.pizzaSlices.length, 8);
  assert.match(summary.cost3YrLabel, /£62K \/ 3y/);

  const veteran = evaluateScoutTargetCard({ ...target, age: 32 }, squad);
  assert.match(veteran.primaryRisk, /Age 32/);
});
