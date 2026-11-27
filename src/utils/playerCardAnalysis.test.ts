import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PlayerRecord } from '../types/fm27';
import {
  analyzePlayerCard,
  evaluateContractStanding,
  evaluateDurability,
  evaluateSeasonProduction,
  getRealShirtNumber,
  rankRolesForPlayer,
} from './playerCardAnalysis';
import {
  computeSquadRelativePercentile,
  getPizzaSlicesForPosition,
} from '../components/FootballAnalyticsCharts';

function makePlayer(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id: 'p-1',
    number: 18,
    name: 'Wolf Ackx',
    position: 'STC, AML',
    apps: '0',
    minutes: 0,
    rating: null,
    goals: 0,
    xG: 0,
    xGPer90: 0,
    assists: 0,
    xA: 0,
    xAPer90: 0,
    drbPer90: 0,
    prPassesPer90: 0,
    hdrPct: 0,
    intPer90: 0,
    tckPct: 0,
    personality: 'Balanced',
    age: 25,
    ability: 3.5,
    potential: 5.0,
    heightCm: 167,
    expires: '30/06/2029',
    nation: 'Belgium',
    wagePw: 541,
    status: 'Starter',
    attributes: {
      pace: 15,
      acceleration: 16,
      stamina: 6,
      jumpingReach: 6,
      determination: 12,
      passing: 8,
      finishing: 9,
      tackling: 4,
      firstTouch: 10,
      decisions: 8,
      workRate: 10,
      offTheBall: 4,
      heading: 5,
      composure: 10,
      dribbling: 12,
      naturalFitness: 9,
    },
    ipRole: 'Centre Forward',
    oopRole: 'Central Outlet Centre Forward',
    notes: '',
    ...overrides,
  };
}

test('analyzePlayerCard generates plain-English verdict, strengths, watchpoints, and fragile durability for pacey low-stamina forward', () => {
  const wolf = makePlayer();
  const teammate = makePlayer({
    id: 'p-2',
    name: 'Joran Triest',
    ability: 4.0,
    attributes: { ...wolf.attributes, pace: 12, acceleration: 12, stamina: 14 },
  });
  const squad = [
    wolf,
    teammate,
    makePlayer({ id: 'p-3', position: 'MC', attributes: { ...wolf.attributes, pace: 11 } }),
    makePlayer({ id: 'p-4', position: 'DC', attributes: { ...wolf.attributes, pace: 10 } }),
    makePlayer({ id: 'p-5', position: 'GK', attributes: { ...wolf.attributes, pace: 8 } }),
  ];

  const result = analyzePlayerCard(wolf, squad);

  assert.ok(result.scoutingVerdict.includes('3.5★'));
  assert.ok(result.strengths.some((s) => s.label === 'Acceleration' && s.value === 16));
  assert.ok(result.strengths.some((s) => s.label === 'Pace' && s.value === 15));
  assert.ok(result.watchpoints.some((w) => w.label === 'Stamina' || w.label === 'Off The Ball'));
  assert.equal(result.physical.durability.tier, 'Fragile');
  assert.ok(result.physical.durability.headline.includes('60'));
  assert.equal(result.physical.topSpeedKmh, Number((result.physical.topSpeedMps * 3.6).toFixed(1)));
  assert.equal(result.squadDepth?.rank, 2);
  assert.equal(result.squadDepth?.bestTeammate?.name, 'Joran Triest');
});

test('getRealShirtNumber suppresses #1 on outfield players but keeps #1 on goalkeepers', () => {
  const winger = makePlayer({ number: 1, position: 'AMR' });
  const gk = makePlayer({ number: 1, position: 'GK' });
  const striker = makePlayer({ number: 18, position: 'STC' });

  assert.equal(getRealShirtNumber(winger), null);
  assert.equal(getRealShirtNumber(gk), 1);
  assert.equal(getRealShirtNumber(striker), 18);
});

test('evaluateSeasonProduction distinguishes fast_sync_missing, no_appearances, and has_stats', () => {
  const zeroPlayer = makePlayer({ apps: '0', minutes: 0 });
  const activeTeammate = makePlayer({
    id: 'p-2',
    apps: '10',
    minutes: 900,
    goals: 6,
    xG: 4.2,
  });

  const fastSync = evaluateSeasonProduction(zeroPlayer, [zeroPlayer]);
  assert.equal(fastSync.mode, 'fast_sync_missing');

  const unusedSub = evaluateSeasonProduction(zeroPlayer, [zeroPlayer, activeTeammate]);
  assert.equal(unusedSub.mode, 'no_appearances');

  const clinical = evaluateSeasonProduction(activeTeammate, [zeroPlayer, activeTeammate]);
  assert.equal(clinical.mode, 'has_stats');
  assert.ok(clinical.finishingNote?.includes('above xG'));
});

test('evaluateContractStanding detects Star Player promise vs Rotation status mismatch', () => {
  const player = makePlayer({
    wagePw: 625,
    status: 'Rotation',
    contractExpiryMonths: 5,
    contractDetails: {
      promisedPlayingTime: 'Star Player',
      releaseClauses: [],
      optionalExtensionYears: 0,
      bonuses: {},
      loanWageContributionPct: null,
    },
  });

  const standing = evaluateContractStanding(player);
  assert.equal(standing.annualWage, 625 * 52);
  assert.equal(standing.renewalRisk, 'Expiring Soon');
  assert.ok(standing.promiseMismatch?.includes('Star Player'));
});

test('evaluateDurability classifies high stamina + natural fitness as Ironman', () => {
  const engine = makePlayer({
    attributes: {
      ...makePlayer().attributes,
      stamina: 15,
      naturalFitness: 14,
    },
  });
  assert.equal(evaluateDurability(engine).tier, 'Ironman');
});

test('getPizzaSlicesForPosition gives forwards attacking slices (no tackling) and squad-relative percentiles scale to squad', () => {
  const fwdSlices = getPizzaSlicesForPosition('STC, AML');
  assert.ok(fwdSlices.some((s) => s.key === 'finishing'));
  assert.ok(fwdSlices.some((s) => s.key === 'composure'));
  assert.equal(
    fwdSlices.some((s) => s.key === 'tackling'),
    false
  );

  const squad = [8, 9, 10, 11, 15].map((pace, i) =>
    makePlayer({
      id: `sq-${i}`,
      attributes: { ...makePlayer().attributes, pace },
    })
  );
  const topPct = computeSquadRelativePercentile(15, 'pace', squad);
  const lowPct = computeSquadRelativePercentile(8, 'pace', squad);
  assert.ok(topPct >= 85);
  assert.ok(lowPct <= 15);
});

test('role-fit explainability lists attribute weights, thresholds and a nearest alternative', () => {
  const wolf = makePlayer();
  const ranked = rankRolesForPlayer(wolf, 'In Possession');
  assert.ok(ranked.length > 0);
  const best = ranked[0];

  assert.ok(best.attributeWeights.length > 0);
  assert.ok(
    best.attributeWeights.every(
      (attr) => attr.value >= 1 && attr.value <= 20 && attr.weight >= 1 && attr.weight <= 2
    )
  );
  const share = best.attributeWeights.reduce((sum, attr) => sum + attr.weightSharePct, 0);
  assert.ok(share >= 95 && share <= 105, `weight shares should total ~100, got ${share}`);
  assert.ok(best.attributeWeights.some((attr) => attr.weight === 2));
  assert.ok(best.keyThresholds.length > 0);
  assert.ok(best.nearestAlternative);
  assert.notEqual(best.nearestAlternative?.roleName, best.role.name);
  assert.equal(best.nearestAlternative?.fitPct, ranked[1].fitPct);
});

test('missing role attributes are labelled and do not appear as supporting strengths', () => {
  const thin = makePlayer({
    attributes: {
      pace: 12,
      acceleration: 12,
      stamina: 10,
      jumpingReach: 10,
      determination: 10,
      passing: 10,
      finishing: 10,
      tackling: 10,
      firstTouch: 10,
      decisions: 10,
      workRate: 10,
      offTheBall: 10,
    },
  });
  const best = rankRolesForPlayer(thin, 'In Possession')[0];
  const missing = best.attributeWeights.filter((attr) => attr.missing);
  assert.ok(missing.length > 0);
  assert.ok(best.topSupporting.every((item) => !missing.some((m) => m.label === item.label)));
});

test('the player sheet overview renders the role-fit explanation, not only a score', () => {
  const source = readFileSync(
    new URL('../components/player-detail/OverviewTab.tsx', import.meta.url),
    'utf8'
  );
  assert.match(source, /RoleFitExplainability/);
  assert.ok(source.includes('Why this score'));
  assert.match(source, /attributeWeights\.map/);
  assert.match(source, /keyThresholds\.map/);
  assert.match(source, /Nearest alternative/);
});
