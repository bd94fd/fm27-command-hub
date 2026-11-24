import test from 'node:test';
import assert from 'node:assert/strict';
import type { MatchLogEntry, PlayerRecord } from '../types/fm27';
import {
  buildXgMomentumRankedRows,
  classifyScatterQuadrant,
  describeMatchXgVerdict,
  getPaddedRadialViewBox,
  getResponsiveChartBox,
  rankAgeValuePlayers,
  rankScatterExplorerPlayers,
  resolveTouchTooltipSelection,
} from './mobileChartHelpers';

function makePlayer(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id: 'p-1',
    number: 9,
    name: 'Test Striker',
    position: 'STC',
    apps: '10',
    minutes: 850,
    rating: 7.2,
    goals: 6,
    xG: 5.1,
    xGPer90: 0.54,
    assists: 2,
    xA: 1.9,
    xAPer90: 0.2,
    drbPer90: 1.4,
    prPassesPer90: 3.2,
    hdrPct: 48,
    intPer90: 0.8,
    tckPct: 72,
    personality: 'Balanced',
    age: 23,
    ability: 3.5,
    potential: 4.5,
    expires: '30/06/2028',
    nation: 'Belgium',
    wagePw: 1200,
    marketValue: 450_000,
    status: 'Starter',
    attributes: {
      pace: 15,
      acceleration: 15,
      stamina: 14,
      jumpingReach: 11,
      determination: 13,
      passing: 11,
      finishing: 14,
      tackling: 6,
      firstTouch: 13,
      decisions: 12,
      workRate: 13,
      offTheBall: 14,
    },
    ipRole: 'Centre Forward',
    oopRole: 'Central Outlet Centre Forward',
    notes: '',
    ...overrides,
  };
}

function makeMatch(overrides: Partial<MatchLogEntry> = {}): MatchLogEntry {
  return {
    id: 'm-1',
    eventNumber: 1,
    date: '15/09/2026',
    opponent: 'Club Brugge NXT',
    venue: 'H',
    competition: 'Challenger Pro League',
    score: '2-1',
    result: 'W',
    xGFor: 2.15,
    xGAgainst: 0.85,
    possession: 54,
    shotsFor: '14 (6)',
    shotsAgainst: '7 (3)',
    cccFor: 2,
    cccAgainst: 1,
    passCompletion: 84,
    goalTimeline: '23\', 67\'',
    potm: 'Test Striker',
    defensiveWatchpoints: '',
    tacticalAudit: '',
    ...overrides,
  };
}

test('getResponsiveChartBox narrows viewBox and enlarges touch hit targets on mobile', () => {
  const mobileScatter = getResponsiveChartBox('scatter', true);
  const desktopScatter = getResponsiveChartBox('scatter', false);

  assert.equal(mobileScatter.width, 360);
  assert.ok(mobileScatter.width < desktopScatter.width);
  assert.ok(mobileScatter.hitRadius >= 15);
  assert.ok(mobileScatter.dotRadius > desktopScatter.dotRadius);
  assert.equal(mobileScatter.plotW, mobileScatter.width - mobileScatter.padL - mobileScatter.padR);

  const mobileXg = getResponsiveChartBox('xgTrend', true);
  const desktopXg = getResponsiveChartBox('xgTrend', false);
  assert.equal(mobileXg.width, 360);
  assert.ok(mobileXg.width < desktopXg.width);
  assert.ok(mobileXg.hitRadius > desktopXg.hitRadius);

  const mobileSpark = getResponsiveChartBox('sparkline', true);
  assert.equal(mobileSpark.width, 320);
  assert.ok(mobileSpark.hitRadius >= 15);
});

test('getPaddedRadialViewBox expands symmetrically so labels never clip or overflow', () => {
  const box = getPaddedRadialViewBox(280, 28);
  assert.equal(box.minX, -28);
  assert.equal(box.minY, -28);
  assert.equal(box.fullSize, 336);
  assert.equal(box.viewBox, '-28 -28 336 336');
});

test('resolveTouchTooltipSelection prefers active hover, then pinned tap, then fallback', () => {
  assert.equal(resolveTouchTooltipSelection('pinned', 'hovered', 'fallback'), 'hovered');
  assert.equal(resolveTouchTooltipSelection('pinned', null, 'fallback'), 'pinned');
  assert.equal(resolveTouchTooltipSelection(null, null, 'fallback'), 'fallback');
  assert.equal(resolveTouchTooltipSelection(null, null, null), null);
});

test('rankScatterExplorerPlayers sorts transitionEngine by Pace + Stamina and tags quadrants', () => {
  const runner = makePlayer({
    id: 'runner',
    name: 'Fast Runner',
    attributes: { ...makePlayer().attributes, pace: 17, stamina: 16 },
  });
  const slow = makePlayer({
    id: 'slow',
    name: 'Slow Vet',
    attributes: { ...makePlayer().attributes, pace: 9, stamina: 8 },
  });
  const sprinter = makePlayer({
    id: 'sprinter',
    name: 'Fragile Sprinter',
    attributes: { ...makePlayer().attributes, pace: 16, stamina: 9 },
  });

  const ranked = rankScatterExplorerPlayers(
    [slow, sprinter, runner],
    'transitionEngine',
    (p) => p.attributes.pace,
    (p) => p.attributes.stamina,
    13,
    12
  );

  assert.equal(ranked[0].player.id, 'runner');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].quadrantLabel, 'Elite 27.1.0 Runner');
  assert.equal(ranked[0].quadrantTone, 'emerald');

  assert.equal(ranked[1].player.id, 'sprinter');
  assert.equal(ranked[1].quadrantLabel, 'Explosive (Sub Risk)');

  assert.equal(ranked[2].player.id, 'slow');
  assert.equal(ranked[2].quadrantLabel, 'Fatigue / Speed Risk');
  assert.equal(ranked[2].quadrantTone, 'rose');
});

test('classifyScatterQuadrant covers attackOutput, valueEfficiency, and ageValue presets', () => {
  assert.equal(classifyScatterQuadrant('attackOutput', 0.6, 0.35, 0.3, 0.2).label, 'Dual Goal + Creator');
  assert.equal(classifyScatterQuadrant('valueEfficiency', 500, 7.4, 1500, 7.0).label, 'Bargain Performer');
  assert.equal(classifyScatterQuadrant('valueEfficiency', 3000, 6.4, 1500, 7.0).tone, 'rose');
  assert.equal(classifyScatterQuadrant('ageValue', 20, 900_000, 24, 300_000).label, 'High-Value Young Core');
});

test('rankAgeValuePlayers sorts descending by Y metric with ability tie-breaker', () => {
  const p1 = makePlayer({ id: 'a', wagePw: 800, ability: 3.0 });
  const p2 = makePlayer({ id: 'b', wagePw: 1500, ability: 3.5 });
  const p3 = makePlayer({ id: 'c', wagePw: 1500, ability: 4.5 });

  const ranked = rankAgeValuePlayers([p1, p2, p3], (p) => p.age, (p) => p.wagePw);
  assert.deepEqual(
    ranked.map((r) => r.player.id),
    ['c', 'b', 'a']
  );
  assert.deepEqual(
    ranked.map((r) => r.rank),
    [1, 2, 3]
  );
});

test('buildXgMomentumRankedRows returns newest-first rows with plain-English finishing verdicts', () => {
  const older = makeMatch({
    id: 'm-old',
    date: '01/09/2026',
    score: '1-1',
    result: 'D',
    xGFor: 2.3,
    xGAgainst: 0.7,
  });
  const newer = makeMatch({
    id: 'm-new',
    date: '08/09/2026',
    score: '3-0',
    result: 'W',
    xGFor: 1.8,
    xGAgainst: 0.6,
  });

  const rows = buildXgMomentumRankedRows([older, newer]);
  assert.equal(rows[0].match.id, 'm-new');
  assert.equal(rows[0].goalsFor, 3);
  assert.ok(rows[0].verdict.includes('Dominated chances'));

  assert.equal(rows[1].match.id, 'm-old');
  assert.ok(rows[1].verdict.includes('Wasteful finishing'));
  assert.equal(rows[1].verdictTone, 'amber');

  const outCreated = describeMatchXgVerdict(-0.9, -0.2);
  assert.equal(outCreated.tone, 'rose');
});
