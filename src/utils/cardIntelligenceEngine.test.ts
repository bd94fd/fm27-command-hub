import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlayerRecord } from '../types/fm27.ts';
import type {
  ClubGovernanceState,
  DivisionBenchmarks,
  LastMatchTacticBlueprint,
  RecruitmentTarget,
} from '../types/fmSave.ts';
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

function makeFlatAttrs(level: number): PlayerRecord['attributes'] {
  const base = makeAttrs();
  const flat: Record<string, number> = {};
  for (const key of Object.keys(base)) flat[key] = level;
  return flat as PlayerRecord['attributes'];
}

function makeStriker(id: string, level: number, overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return makePlayer({
    id,
    name: id,
    position: 'ST',
    ability: 3.5,
    age: 25,
    wagePw: 600,
    attributes: makeFlatAttrs(level),
    ...overrides,
  });
}

function makeScoutTarget(overrides: Partial<RecruitmentTarget> = {}): RecruitmentTarget {
  return {
    uid: 5001,
    name: 'Scout Target',
    age: 24,
    nationality: 'Belgium',
    primaryPosition: 'ST',
    isFreeAgent: false,
    contractExpiryMonths: 12,
    demandedWageEur: 400,
    attributes: makeFlatAttrs(14),
    ...overrides,
  } as RecruitmentTarget;
}

test('computePositionPercentilePizza blends division medians and reports the benchmark value', () => {
  const benchmarks = {
    competitionName: 'Test Division',
    scope: 'division',
    clubCount: 16,
    byPositionGroup: {
      MID: {
        sampleSize: 16,
        medianWeeklyWage: 900,
        medianAttributes: {
          passing: 10,
          firstTouch: 10,
          tackling: 10,
          vision: 10,
          decisions: 10,
          workRate: 10,
          stamina: 10,
          pace: 10,
        },
      },
    },
  } as unknown as DivisionBenchmarks;

  const player = makePlayer({ attributes: makeAttrs({ passing: 16 }) });
  const blended = computePositionPercentilePizza(player, [player], benchmarks);
  const plain = computePositionPercentilePizza(player, [player]);

  const passing = blended.find((slice) => slice.key === 'passing');
  const passingPlain = plain.find((slice) => slice.key === 'passing');
  assert.ok(passing && passingPlain);
  assert.equal(passing.benchmarkValue, 10);
  assert.equal(passing.percentile, 77);
  assert.equal(passingPlain.percentile, 50);
  assert.equal(blended.find((slice) => slice.key === 'vision')?.benchmarkValue, 10);
});

function promiseGovernance(
  status: 'met' | 'on_track' | 'at_risk' | 'breached' | 'preseason'
): ClubGovernanceState {
  return {
    playerPromiseAudits: [
      {
        playerId: 'p1',
        playerUid: 1001,
        playerName: 'Jan Peeters',
        position: 'MC',
        promisedPlayingTime: 'Star Player',
        expectedMinMinutesSharePct: 60,
        actualMinutesSharePct: 30,
        minutesPlayed: 500,
        status,
        note: 'Promise note for test',
      },
    ],
  } as unknown as ClubGovernanceState;
}

test('evaluateSquadPlayerCard labels met, at-risk and on-track promises differently', () => {
  const pool = [makePlayer({ id: 'p1', uid: 1 })];
  const player = makePlayer({ id: 'p1', uid: 1 });

  const met = evaluateSquadPlayerCard(player, pool, { governance: promiseGovernance('met') });
  assert.equal(met.promiseTag, 'Promise Met');

  const atRisk = evaluateSquadPlayerCard(player, pool, { governance: promiseGovernance('at_risk') });
  assert.equal(atRisk.promiseTag, 'Monitor: Star Player');
  assert.equal(atRisk.primaryRisk, 'Promise note for test');

  const onTrack = evaluateSquadPlayerCard(player, pool, { governance: promiseGovernance('on_track') });
  assert.equal(onTrack.promiseTag, null);
});

test('evaluateSquadPlayerCard puts injury and contract expiry ahead of the weakest attribute', () => {
  const pool = [makePlayer({ id: 'p1', uid: 1 })];
  const injured = evaluateSquadPlayerCard(
    makePlayer({ id: 'i1', uid: 2, status: 'Injured', attributes: makeAttrs({ stamina: 15 }) }),
    pool
  );
  assert.match(injured.primaryRisk, /Currently injured/);

  const expiring = evaluateSquadPlayerCard(
    makePlayer({
      id: 'e1',
      uid: 3,
      status: 'Rotation',
      age: 26,
      contractExpiryMonths: 4,
      attributes: makeAttrs({ stamina: 15 }),
    }),
    pool
  );
  assert.match(expiring.primaryRisk, /Contract expires in 4m/);
});

test('evaluateSquadPlayerCard reads wage efficiency from the squad and division median', () => {
  const pool = [
    makePlayer({ id: 'a', uid: 1, wagePw: 1000 }),
    makePlayer({ id: 'b', uid: 2, wagePw: 1000 }),
    makePlayer({ id: 'c', uid: 3, wagePw: 1000 }),
  ];

  assert.equal(
    evaluateSquadPlayerCard(makePlayer({ id: 'n', uid: 4, wagePw: Number.NaN }), pool).valueTag,
    'Wage not decoded'
  );
  assert.equal(
    evaluateSquadPlayerCard(
      makePlayer({ id: 'h', uid: 5, wagePw: 500, attributes: makeFlatAttrs(12) }),
      pool
    ).valueTag,
    'High Wage Value'
  );
  assert.equal(
    evaluateSquadPlayerCard(
      makePlayer({ id: 'x', uid: 6, wagePw: 2000, attributes: makeFlatAttrs(12) }),
      pool
    ).valueTag,
    'Expensive Wage'
  );
  assert.equal(
    evaluateSquadPlayerCard(makePlayer({ id: 'f', uid: 7, wagePw: 1000 }), pool).valueTag,
    'Fair Market Wage'
  );
});

test('evaluateSquadPlayerCard maps DNA bands and transfer verdicts to the right label', () => {
  const pool = [makePlayer({ id: 'p1', uid: 1 })];

  const rotation = evaluateSquadPlayerCard(
    makePlayer({ id: 'r', uid: 2, status: 'Rotation', age: 24, attributes: makeFlatAttrs(12) }),
    pool
  );
  assert.equal(rotation.verdictLabel, 'Rotation / Cover');
  assert.equal(rotation.tone, 'sky');

  const succession = evaluateSquadPlayerCard(
    makePlayer({ id: 's', uid: 3, status: 'Rotation', age: 30, attributes: makeFlatAttrs(10) }),
    pool
  );
  assert.equal(succession.verdictLabel, 'Succession Watch');
  assert.equal(succession.tone, 'amber');

  const core = evaluateSquadPlayerCard(
    makePlayer({ id: 'c', uid: 4, status: 'Rotation', age: 24, attributes: makeFlatAttrs(14) }),
    pool
  );
  assert.equal(core.verdictLabel, 'Core Starter');
  assert.equal(core.tone, 'emerald');

  assert.equal(
    evaluateSquadPlayerCard(makePlayer({ id: 'rn', uid: 5 }), pool, { transferVerdict: 'Renew Now' })
      .verdictLabel,
    'Priority Renewal'
  );
  assert.equal(
    evaluateSquadPlayerCard(makePlayer({ id: 'py', uid: 6 }), pool, {
      transferVerdict: 'Protect Youth Asset',
    }).verdictLabel,
    'Protect U21 Asset'
  );
  assert.equal(
    evaluateSquadPlayerCard(makePlayer({ id: 'sl', uid: 7 }), pool, {
      transferVerdict: 'Sell / Transfer List',
    }).verdictLabel,
    'Surplus / Offload'
  );
});

test('evaluateSquadPlayerCard prefers the last tactic over the best-fit note when the player started', () => {
  const pool = [makePlayer({ id: 'p1', uid: 1001 })];
  const player = makePlayer({ id: 'p1', uid: 1001, name: 'Jan Peeters' });
  const activeTactic = {
    inPossessionFormation: '4-3-3',
    starters: [
      {
        slotIndex: 0,
        position: 'MC',
        playerUid: 1001,
        playerName: 'Jan Peeters',
        inPossessionRole: 'Mezzala',
        outOfPossessionRole: 'Pressing Midfielder',
      },
    ],
  } as unknown as LastMatchTacticBlueprint;

  const started = evaluateSquadPlayerCard(player, pool, { activeTactic });
  assert.equal(started.tacticalFitNote, 'Last Tactic: Mezzala IP / Pressing Midfielder OOP');

  const benched = evaluateSquadPlayerCard(player, pool);
  assert.equal(
    benched.tacticalFitNote,
    'Best Fit: Box-to-Box Midfielder IP / Pressing Central Midfielder OOP'
  );
});

function makeStrikerSquad(level: number, size: number): PlayerRecord[] {
  return Array.from({ length: size }, (_, index) =>
    makeStriker(`st${index + 1}`, level, { ability: 4 - index * 0.1 })
  );
}

test('evaluateScoutTargetCard calls a stronger target an upgrade over the current starter', () => {
  const summary = evaluateScoutTargetCard(
    makeScoutTarget({ attributes: makeFlatAttrs(16) }),
    makeStrikerSquad(10, 3)
  );

  assert.equal(summary.depthPriority, 'Upgrade Opportunity');
  assert.ok(summary.starterDnaDelta !== null && summary.starterDnaDelta >= 25);
  assert.equal(summary.verdictLabel, `Upgrade (+${summary.starterDnaDelta} DNA)`);
  assert.equal(summary.tone, 'emerald');
  assert.match(summary.primaryRisk, /Under contract \(12m\)/);
  assert.equal(summary.contractSummary, 'Expiring <= 12m · Wage £400/wk');
  assert.equal(summary.cost3YrLabel, '£62K / 3y');
  assert.equal(summary.archetypeLabel, 'Goal Threat');
  assert.ok(summary.bestRoleFitPct > 0);
});

test('evaluateScoutTargetCard passes on a weak target when the position is already stocked', () => {
  const governance = { promisesAtRiskCount: 2, playerPromiseAudits: [] } as unknown as ClubGovernanceState;

  const summary = evaluateScoutTargetCard(
    makeScoutTarget({ attributes: makeFlatAttrs(8) }),
    makeStrikerSquad(16, 4),
    { governance }
  );

  assert.equal(summary.depthPriority, 'Well Covered');
  assert.equal(summary.verdictLabel, 'Pass · Covered');
  assert.equal(summary.tone, 'rose');
  assert.equal(summary.promiseTag, 'Watch Squad Promises');
  assert.match(summary.primaryRisk, /struggles in FM27 dual-phase pressing/);
});

test('evaluateScoutTargetCard keeps a stocked position but files an equal target as low need', () => {
  const summary = evaluateScoutTargetCard(
    makeScoutTarget({ attributes: makeFlatAttrs(14) }),
    makeStrikerSquad(14, 4)
  );

  assert.equal(summary.depthPriority, 'Well Covered');
  assert.equal(summary.verdictLabel, 'Low Need · Stocked');
  assert.equal(summary.tone, 'amber');
});

test('evaluateScoutTargetCard separates value opportunities, U23 upside and depth cover', () => {
  const squad = makeStrikerSquad(14, 3);

  const value = evaluateScoutTargetCard(
    makeScoutTarget({ isFreeAgent: true, attributes: makeFlatAttrs(14) }),
    squad
  );
  assert.equal(value.depthPriority, 'Depth Cover');
  assert.equal(value.verdictLabel, 'Value Opportunity');
  assert.equal(value.tone, 'sky');

  const upside = evaluateScoutTargetCard(
    makeScoutTarget({ isFreeAgent: true, age: 21, attributes: makeFlatAttrs(13) }),
    squad
  );
  assert.ok(upside.starterDnaDelta !== null && upside.starterDnaDelta < 0);
  assert.equal(upside.verdictLabel, 'High-Upside U23');
  assert.equal(upside.tone, 'sky');
});

test('evaluateScoutTargetCard compares age and wage with the current starter', () => {
  const squad = makeStrikerSquad(14, 3).map((player) => ({
    ...player,
    age: 30,
    wagePw: 800,
  }));

  const summary = evaluateScoutTargetCard(
    makeScoutTarget({ isFreeAgent: true, age: 21, demandedWageEur: 400, attributes: makeFlatAttrs(14) }),
    squad
  );

  assert.equal(summary.promiseTag, '9y younger · £400/wk cheaper');
});

test('evaluateScoutTargetCard keeps unknown wages and free-agent terms explicit', () => {
  const summary = evaluateScoutTargetCard(
    makeScoutTarget({
      isFreeAgent: true,
      demandedWageEur: 0,
      contractExpiryMonths: 0,
      attributes: makeFlatAttrs(14),
    }),
    makeStrikerSquad(14, 3)
  );

  assert.equal(summary.valueTag, 'Free Agent');
  assert.equal(summary.cost3YrLabel, 'Wage TBD');
  assert.equal(summary.contractSummary, 'Unattached · Free Transfer · 2-Week Free Trial');
});

test('evaluateScoutTargetCard names the active tactic when one is decoded', () => {
  const activeTactic = {
    inPossessionFormation: '4-2-3-1',
    starters: [],
  } as unknown as LastMatchTacticBlueprint;

  const summary = evaluateScoutTargetCard(
    makeScoutTarget({ attributes: makeFlatAttrs(14) }),
    makeStrikerSquad(14, 3),
    { activeTactic }
  );

  assert.match(summary.tacticalFitNote, /^Fits 4-2-3-1 as /);
});
