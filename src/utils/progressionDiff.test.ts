/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerRecord } from '../types/fm27';
import {
  buildPlayerProgressionSeries,
  buildProgressionSnapshot,
  captureProgressionSnapshot,
  clearProgressionArchive,
  computeProgressionDiff,
  FM27_PROGRESSION_ARCHIVE_KEY,
  loadProgressionArchive,
  MAX_PROGRESSION_SNAPSHOTS,
  StorageLike,
} from './progressionDiff';

function makePlayer(
  uid: number,
  name: string,
  age: number,
  attrOverrides: Partial<PlayerRecord['attributes']> = {}
): PlayerRecord {
  return {
    id: `p-${uid}`,
    uid,
    number: 10,
    name,
    position: 'MC',
    apps: '10',
    minutes: 900,
    rating: 7.0,
    goals: 2,
    xG: 1.5,
    xGPer90: 0.15,
    assists: 3,
    xA: 2.0,
    xAPer90: 0.2,
    drbPer90: 1.0,
    prPassesPer90: 5.0,
    hdrPct: 50,
    intPer90: 1.2,
    tckPct: 75,
    personality: 'Balanced',
    age,
    ability: 3.0,
    potential: 4.0,
    expires: '2028-06-30',
    nation: 'Belgium',
    wagePw: 350,
    status: 'Starter',
    attributes: {
      pace: 12,
      acceleration: 12,
      stamina: 12,
      jumpingReach: 10,
      determination: 11,
      passing: 12,
      finishing: 10,
      tackling: 11,
      firstTouch: 12,
      decisions: 12,
      workRate: 12,
      offTheBall: 12,
      ...attrOverrides,
    },
    ipRole: 'CM(s)',
    oopRole: 'CM',
    notes: '',
  };
}

function createMemoryStorage(maxBytes?: number): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    setItem(key: string, value: string): void {
      if (typeof maxBytes === 'number' && value.length > maxBytes) {
        const err = new Error('Storage quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      }
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    },
  };
}

test('captureProgressionSnapshot enforces 30-save rolling cap and deduplicates by saveDate', () => {
  const store = createMemoryStorage();
  const baseSquad = [makePlayer(1001, 'Lucas Peeters', 20)];

  for (let i = 1; i <= 35; i += 1) {
    const day = String(i).padStart(2, '0');
    captureProgressionSnapshot(
      `2026-09-${day}`,
      'KVV Zelzate',
      baseSquad,
      store
    );
  }

  let archive = loadProgressionArchive(store);
  assert.equal(archive.length, MAX_PROGRESSION_SNAPSHOTS);
  assert.equal(archive[0].saveDate, '2026-09-06');
  assert.equal(archive[archive.length - 1].saveDate, '2026-09-35');

  // Re-capturing an existing saveDate deduplicates instead of growing
  const updatedSquad = [
    makePlayer(1001, 'Lucas Peeters', 20, { determination: 15 }),
  ];
  captureProgressionSnapshot(
    '2026-09-35',
    'KVV Zelzate',
    updatedSquad,
    store
  );

  archive = loadProgressionArchive(store);
  assert.equal(archive.length, MAX_PROGRESSION_SNAPSHOTS);
  const matching = archive.filter((s) => s.saveDate === '2026-09-35');
  assert.equal(matching.length, 1);
  assert.equal(matching[0].players[1001].attributes.determination, 15);

  clearProgressionArchive(store);
  assert.equal(loadProgressionArchive(store).length, 0);
});

test('captureProgressionSnapshot automatically prunes oldest entries on QuotaExceededError', () => {
  const squad = [
    makePlayer(2001, 'Player One', 19),
    makePlayer(2002, 'Player Two', 22),
  ];
  const singlePayloadSize = JSON.stringify([
    buildProgressionSnapshot('2026-10-01', 'KVV Zelzate', squad, '2026-10-01T00:00:00Z'),
  ]).length;

  // Allow roughly 2 snapshots worth of bytes, forcing pruning when a 3rd/4th is added
  const tightStore = createMemoryStorage(Math.floor(singlePayloadSize * 2.3));

  captureProgressionSnapshot('2026-10-01', 'KVV Zelzate', squad, tightStore);
  captureProgressionSnapshot('2026-10-08', 'KVV Zelzate', squad, tightStore);
  const third = captureProgressionSnapshot(
    '2026-10-15',
    'KVV Zelzate',
    squad,
    tightStore
  );

  assert.equal(third.saved, true);
  assert.ok(third.prunedCount >= 1, 'Expected at least 1 oldest entry pruned');
  const loaded = loadProgressionArchive(tightStore);
  assert.ok(loaded.length >= 1 && loaded.length <= 2);
  assert.equal(loaded[loaded.length - 1].saveDate, '2026-10-15');
  assert.ok(tightStore.getItem(FM27_PROGRESSION_ARCHIVE_KEY));
});

test('computeProgressionDiff detects risers, fallers, Mentoring Determination Jumps (>= +2), and Youth Intake / Newgen Radar', () => {
  const baseline = buildProgressionSnapshot('2026-09-01', 'KVV Zelzate', [
    makePlayer(3001, 'Mentored Prospect', 18, {
      determination: 10,
      pace: 13,
      passing: 11,
    }),
    makePlayer(3002, 'Small Det Bump', 21, {
      determination: 12,
      stamina: 14,
    }),
    makePlayer(3003, 'Aging Veteran', 33, {
      pace: 12,
      acceleration: 11,
    }),
  ]);

  const latest = buildProgressionSnapshot('2026-12-01', 'KVV Zelzate', [
    makePlayer(3001, 'Mentored Prospect', 18, {
      determination: 13, // +3 -> Mentoring Determination Jump
      pace: 14, // +1 riser
      passing: 12, // +1 riser
    }),
    makePlayer(3002, 'Small Det Bump', 21, {
      determination: 13, // +1 -> NOT a mentoring jump (requires >= 2)
      stamina: 14,
    }),
    makePlayer(3003, 'Aging Veteran', 33, {
      pace: 10, // -2 faller
      acceleration: 10, // -1 faller
    }),
    // Brand-new UIDs since baseline
    makePlayer(9001, 'Academy Wonderkid', 16, {
      determination: 15,
      pace: 14,
    }),
    makePlayer(9002, 'Mid-Season Signing', 24, {
      determination: 12,
      pace: 13,
    }),
  ]);

  const diff = computeProgressionDiff(baseline, latest);

  assert.equal(diff.baselineSaveDate, '2026-09-01');
  assert.equal(diff.latestSaveDate, '2026-12-01');

  // Risers & Fallers
  assert.ok(diff.risers.length >= 4);
  assert.equal(diff.risers[0].uid, 3001);
  assert.equal(diff.risers[0].attributeName, 'determination');
  assert.equal(diff.risers[0].delta, 3);

  assert.equal(diff.fallers.length, 2);
  assert.equal(diff.fallers[0].uid, 3003);
  assert.equal(diff.fallers[0].attributeName, 'pace');
  assert.equal(diff.fallers[0].delta, -2);

  // Mentoring Determination Jumps (strictly attributeName === 'determination' && delta >= 2)
  assert.equal(diff.mentoringDeterminationJumps.length, 1);
  assert.equal(diff.mentoringDeterminationJumps[0].uid, 3001);
  assert.equal(diff.mentoringDeterminationJumps[0].delta, 3);

  // Youth Intake / Newgen Radar
  assert.equal(diff.newgenRadar.length, 2);
  assert.equal(diff.newgenRadar[0].uid, 9001);
  assert.equal(diff.newgenRadar[0].isYouthIntakeHighlight, true);
  assert.equal(diff.newgenRadar[0].abilityStars, 3.0);
  assert.equal(diff.newgenRadar[0].potentialStars, 4.0);
  assert.ok(diff.newgenRadar[0].clubDnaFitPct >= 50);
  assert.ok(diff.newgenRadar[0].physicalEngineScore >= 50);
  assert.equal(diff.newgenRadar[1].uid, 9002);
  assert.equal(diff.newgenRadar[1].isYouthIntakeHighlight, false);
  assert.equal(diff.youthIntakeHighlights.length, 1);
  assert.equal(diff.youthIntakeHighlights[0].playerName, 'Academy Wonderkid');
});

test('Pack 5 Youth Intake Radar ranks U18 intake players strictly by Star Ratings, Club DNA Fit %, and Physical Score with zero raw CA/PA', () => {
  const baseline = buildProgressionSnapshot('2027-03-01', 'KVV Zelzate', [
    makePlayer(1001, 'Senior Starter', 26),
  ]);

  const rawTopProspect = {
    ...makePlayer(9101, 'High DNA Intake Winger', 16, {
      pace: 16,
      acceleration: 16,
      stamina: 14,
      workRate: 15,
      dribbling: 14,
      determination: 16,
    }),
    position: 'AM (R)',
    ability: 2.5,
    potential: 4.5,
  };
  const rawSecondProspect = {
    ...makePlayer(9102, 'Solid Intake Midfielder', 17, {
      pace: 12,
      acceleration: 12,
      stamina: 13,
      passing: 13,
      determination: 14,
    }),
    position: 'MC',
    ability: 2.0,
    potential: 4.5,
  };
  const rawThirdProspect = {
    ...makePlayer(9103, 'Depth Intake Defender', 16, {
      pace: 11,
      acceleration: 11,
      jumpingReach: 12,
      tackling: 11,
      determination: 11,
    }),
    position: 'DC',
    ability: 1.5,
    potential: 3.5,
  };

  const latest = buildProgressionSnapshot('2027-03-20', 'KVV Zelzate', [
    makePlayer(1001, 'Senior Starter', 26),
    rawThirdProspect,
    rawSecondProspect,
    rawTopProspect,
  ]);

  const diff = computeProgressionDiff(baseline, latest);
  assert.equal(diff.youthIntakeHighlights.length, 3);
  assert.equal(diff.youthIntakeHighlights[0].uid, 9101);
  assert.equal(diff.youthIntakeHighlights[1].uid, 9102);
  assert.equal(diff.youthIntakeHighlights[2].uid, 9103);
  assert.ok(
    diff.youthIntakeHighlights[0].clubDnaFitPct >
      diff.youthIntakeHighlights[1].clubDnaFitPct
  );
  assert.ok(
    diff.youthIntakeHighlights[0].physicalEngineScore >
      diff.youthIntakeHighlights[1].physicalEngineScore
  );

  // Verify zero raw CA/PA fields exist anywhere in snapshot or radar report
  const serialized = JSON.stringify({ latest, diff });
  assert.doesNotMatch(serialized, /"ca"|"pa"|"currentAbility"|"potentialAbility"/i);
});

test('buildPlayerProgressionSeries tracks chronological star ratings and net attribute deltas', () => {
  const s1 = buildProgressionSnapshot('2026-09-01', 'KVV Zelzate', [
    { ...makePlayer(5001, 'Rising Mid', 19, { pace: 12, passing: 12 }), ability: 2.5, potential: 4.5 },
  ]);
  const s2 = buildProgressionSnapshot('2026-11-01', 'KVV Zelzate', [
    { ...makePlayer(5001, 'Rising Mid', 19, { pace: 13, passing: 14 }), ability: 3.0, potential: 4.5 },
  ]);
  const s3 = buildProgressionSnapshot('2027-01-01', 'KVV Zelzate', [
    { ...makePlayer(5001, 'Rising Mid', 20, { pace: 14, passing: 15 }), ability: 3.5, potential: 4.5 },
  ]);

  const series = buildPlayerProgressionSeries(5001, [s1, s2, s3]);
  assert.equal(series.length, 3);
  assert.equal(series[0].netDeltaFromStart, 0);
  assert.equal(series[1].netDeltaFromStart, 3);
  assert.equal(series[2].netDeltaFromStart, 5);
  assert.equal(series[0].abilityStars, 2.5);
  assert.equal(series[2].abilityStars, 3.5);
  assert.equal(buildPlayerProgressionSeries(undefined, [s1, s2]).length, 0);
});


