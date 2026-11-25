import assert from 'node:assert/strict';
import test from 'node:test';
import type { PatchCompatibilitySummary } from '../types/fmSave';
import type { PatchDiagnosticPayload } from './fm27PatchDiagnostics';
import {
  buildMemoryKey,
  FM27_BUILD_MEMORY_STORAGE_KEY,
  getFm27BuildProfile,
  loadFm27BuildMemory,
  recordFm27BuildRun,
  type BuildMemoryStorage,
} from './fm27BuildMemory';

function createStorage(): BuildMemoryStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function makeCompat(
  overrides: Partial<PatchCompatibilitySummary> = {}
): PatchCompatibilitySummary {
  return {
    detectedBuild: '27.2.0+2506012',
    isFm27: true,
    layoutStatus: 'dynamic',
    layoutBase: '27.1',
    isUntestedBuild: true,
    runtimePatchesApplied: true,
    dynamicBuildRegistered: true,
    sections: [
      { id: 'players', label: 'Squad', status: 'clean', fallbacks: 0 },
      { id: 'tactics_set_piece', label: 'Tactics', status: 'fallback', fallbacks: 2 },
    ],
    summary: '27.2.0+2506012 · dynamic layout (27.1 base) · 1 clean, 1 fallback, 0 unavailable',
    advisory: null,
    ...overrides,
  };
}

function makePayload(
  build = '27.2.0+2506012',
  fmsaveVersion = '0.14.4',
  compat = makeCompat({ detectedBuild: build })
): PatchDiagnosticPayload {
  return {
    meta: {
      build,
      game: 'FM27',
      fmsaveVersion,
      patchCompatibility: compat,
    },
  };
}

test('build memory records first run, increments repeat runs, and keeps the first-seen date', () => {
  const storage = createStorage();
  const first = recordFm27BuildRun(makePayload(), storage);
  assert.ok(first);
  assert.equal(first.seenCount, 1);
  assert.equal(first.cleanCount, 1);
  assert.equal(first.fallbackCount, 1);
  assert.equal(first.unavailableCount, 0);
  assert.equal(first.sections.tactics_set_piece?.fallbacks, 2);
  const firstSeen = first.firstSeenIso;

  const second = recordFm27BuildRun(makePayload(), storage);
  assert.ok(second);
  assert.equal(second.seenCount, 2);
  assert.equal(second.firstSeenIso, firstSeen);
  assert.ok(second.lastSeenIso >= firstSeen);

  const loaded = getFm27BuildProfile('27.2.0+2506012', '0.14.4', storage);
  assert.ok(loaded);
  assert.equal(loaded.seenCount, 2);
});

test('build memory isolates builds and fmsave versions but can fall back to the same build', () => {
  const storage = createStorage();
  recordFm27BuildRun(makePayload('27.2.0+2506012', '0.14.4'), storage);
  recordFm27BuildRun(makePayload('27.3.0+2507001', '0.14.4'), storage);

  assert.equal(
    getFm27BuildProfile('27.2.0+2506012', '0.14.4', storage)?.seenCount,
    1
  );
  assert.equal(
    getFm27BuildProfile('27.2.0+2506012', '0.15.0', storage)?.build,
    '27.2.0+2506012'
  );
  assert.equal(getFm27BuildProfile('27.4.0+2508001', '0.14.4', storage), null);
  assert.equal(
    loadFm27BuildMemory(storage).profiles[
      buildMemoryKey('27.3.0+2507001', '0.14.4')
    ]?.build,
    '27.3.0+2507001'
  );
});

test('build memory ignores corrupt storage and missing diagnostics', () => {
  const storage = createStorage();
  storage.setItem(FM27_BUILD_MEMORY_STORAGE_KEY, 'not json');
  assert.deepEqual(loadFm27BuildMemory(storage).profiles, {});
  assert.equal(recordFm27BuildRun({ meta: {} }, storage), null);
  assert.equal(recordFm27BuildRun(null, storage), null);
});

test('build memory degrades without a storage target', () => {
  const profile = recordFm27BuildRun(makePayload(), null);
  assert.ok(profile);
  assert.equal(profile.seenCount, 1);
  assert.equal(getFm27BuildProfile('27.2.0+2506012', '0.14.4', null), null);
});
