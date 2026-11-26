import test from 'node:test';
import assert from 'node:assert/strict';
import {
  savePersistedFmState,
  loadPersistedFmState,
  recordPreviousSnapshot,
  loadPreviousSnapshot,
  clearPersistedFmState,
  exportFmStateBackupJson,
  importFmStateBackupJson,
  loadTrackedScoutTargets,
  toggleTrackedScoutTarget,
  removeTrackedScoutTarget,
  isScoutTargetTracked,
  CURRENT_SCHEMA_VERSION,
  migratePersistedState,
  validateStateSchema,
  exportBackupJson,
  importBackupJson,
} from './fmStorage';
import { PlayerRecord, MatchLogEntry } from '../types/fm27';
import { RecruitmentTarget } from '../types/fmSave';

// Mock localStorage for Node test runner
const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => storageMap.set(key, val),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

(globalThis as unknown as { window: { localStorage: typeof mockLocalStorage } }).window = {
  localStorage: mockLocalStorage,
};

const samplePlayer: PlayerRecord = {
  id: 'p1',
  number: 9,
  name: 'Mbey Epolo',
  position: 'ST (C)',
  apps: '5',
  minutes: 401,
  rating: 7.42,
  goals: 5,
  xG: 5.15,
  xGPer90: 1.16,
  assists: 1,
  xA: 0.25,
  xAPer90: 0.06,
  drbPer90: 0.45,
  prPassesPer90: 1.3,
  hdrPct: 48,
  intPer90: 0.3,
  tckPct: 0,
  personality: 'Fairly Determined',
  age: 26,
  ability: 3.5,
  potential: 4.0,
  expires: '30/06/2029',
  nation: 'Belgium',
  wagePw: 650,
  status: 'Starter',
  attributes: {
    pace: 13,
    acceleration: 12,
    stamina: 13,
    jumpingReach: 13,
    determination: 16,
    passing: 8,
    finishing: 14,
    tackling: 1,
    firstTouch: 14,
    decisions: 10,
    workRate: 8,
    offTheBall: 8,
  },
  ipRole: 'Poacher',
  oopRole: 'Central Outlet Centre Forward',
  notes: 'FM Save CA 92/PA 104',
};

const sampleMatch: MatchLogEntry = {
  id: 'm1',
  eventNumber: 34,
  date: '18/09/2027',
  competition: '1e Nationale VV',
  opponent: 'Jong Cercle',
  venue: 'A',
  result: 'W',
  score: '2 - 0',
  xGFor: 1.88,
  xGAgainst: 0.41,
  possession: 44,
  shotsFor: '13 (6)',
  shotsAgainst: '6 (1)',
  cccFor: 3,
  cccAgainst: 0,
  passCompletion: 85,
  goalTimeline: '22m Epolo, 58m Epolo',
  potm: 'Mbey Epolo (8.40)',
  defensiveWatchpoints: 'Clean sheet',
  tacticalAudit: 'Counter Positive win',
};

test('fmStorage saves, loads, and persists state across reloads', async () => {
  mockLocalStorage.clear();

  const success = await savePersistedFmState({
    saveDate: '18/09/2027',
    nextFixture: '02/10/2027 vs KFC Dessel Sport',
    leagueStandingSub: '#3 of 16 | 9 Pts',
    wageSpend: '£9,707 / £10,203 p/w',
    balance: '(£710K)',
    clubName: 'KVV Zelzate',
    players: [samplePlayer],
    matches: [sampleMatch],
    hydratedFmSave: null,
  });

  assert.equal(success, true);

  const loaded = loadPersistedFmState();
  assert.ok(loaded);
  assert.equal(loaded.saveDate, '18/09/2027');
  assert.equal(loaded.players.length, 1);
  assert.equal(loaded.players[0].name, 'Mbey Epolo');
  assert.equal(loaded.matches.length, 1);
  assert.equal(loaded.matches[0].opponent, 'Jong Cercle');
  assert.equal(loaded.version, 1);
  assert.ok(loaded.lastSyncedAt);
});

test('fmStorage records and retrieves previous snapshot for delta tracking', () => {
  mockLocalStorage.clear();

  recordPreviousSnapshot('15/09/2027', [samplePlayer], [sampleMatch]);
  const snap = loadPreviousSnapshot();

  assert.ok(snap);
  assert.equal(snap.saveDate, '15/09/2027');
  assert.equal(snap.playersCount, 1);
  assert.equal(snap.playersSnapshot[0].name, 'Mbey Epolo');
  assert.equal(snap.playersSnapshot[0].goals, 5);
});

test('fmStorage clears persisted state completely', async () => {
  await savePersistedFmState({
    saveDate: '18/09/2027',
    nextFixture: '',
    leagueStandingSub: '',
    wageSpend: '',
    balance: '',
    players: [samplePlayer],
    matches: [],
    hydratedFmSave: null,
  });

  assert.ok(loadPersistedFmState());
  await clearPersistedFmState();
  assert.equal(loadPersistedFmState(), null);
  assert.equal(loadPreviousSnapshot(), null);
});

test('fmStorage exports and imports JSON backups cleanly', async () => {
  mockLocalStorage.clear();

  await savePersistedFmState({
    saveDate: '18/09/2027',
    nextFixture: 'Dessel Sport',
    leagueStandingSub: '#3',
    wageSpend: '£9.7K',
    balance: '£-710K',
    players: [samplePlayer],
    matches: [sampleMatch],
    hydratedFmSave: null,
  });

  const exported = await exportFmStateBackupJson();
  assert.ok(exported);
  assert.ok(exported.includes('Mbey Epolo'));

  mockLocalStorage.clear();
  assert.equal(loadPersistedFmState(), null);

  const imported = await importFmStateBackupJson(exported);
  assert.ok(imported);
  assert.equal(imported.players[0].name, 'Mbey Epolo');

  // Corrupted JSON returns null without crashing
  const badImport = await importFmStateBackupJson('invalid json string');
  assert.equal(badImport, null);
});

test('fmStorage persists Shortlist tracked targets with add/remove toggling', () => {
  mockLocalStorage.clear();

  const targetA: RecruitmentTarget = {
    uid: 9001,
    name: 'Lucas Janssens',
    age: 21,
    nationality: 'Belgium',
    primaryPosition: 'AMR',
    isFreeAgent: true,
    contractExpiryMonths: 0,
    demandedWageEur: 350,
    attributes: { pace: 15, acceleration: 15 },
  };
  const targetB: RecruitmentTarget = {
    uid: 9002,
    name: 'Tomasz Kowalski',
    age: 24,
    nationality: 'Poland',
    primaryPosition: 'DC',
    isFreeAgent: false,
    contractExpiryMonths: 5,
    demandedWageEur: 600,
    attributes: { positioning: 14, jumpingReach: 15 },
  };

  assert.equal(loadTrackedScoutTargets().length, 0);

  // Add targetA
  const addA = toggleTrackedScoutTarget(targetA);
  assert.equal(addA.tracked, true);
  assert.equal(addA.targets.length, 1);
  assert.equal(isScoutTargetTracked(addA.targets, targetA), true);

  // Add targetB
  const addB = toggleTrackedScoutTarget(targetB);
  assert.equal(addB.tracked, true);
  assert.equal(addB.targets.length, 2);

  // Reload from localStorage
  const reloaded = loadTrackedScoutTargets();
  assert.equal(reloaded.length, 2);
  assert.equal(isScoutTargetTracked(reloaded, targetA), true);
  assert.equal(isScoutTargetTracked(reloaded, targetB), true);

  // Toggle targetA again -> untracks
  const untrackA = toggleTrackedScoutTarget(targetA);
  assert.equal(untrackA.tracked, false);
  assert.equal(untrackA.targets.length, 1);
  assert.equal(isScoutTargetTracked(untrackA.targets, targetA), false);

  // Remove targetB explicitly
  const afterRemove = removeTrackedScoutTarget(targetB.uid);
  assert.equal(afterRemove.length, 0);
  assert.equal(loadTrackedScoutTargets().length, 0);
});

test('fmStorage v2 migrates v1 state and persists customSlots, activeShape, applyToAnalystOnly, and archivedSaveSnapshots', async () => {
  mockLocalStorage.clear();

  const legacyV1Payload = {
    version: 1,
    lastSyncedAt: '2027-09-18T12:00:00.000Z',
    saveDate: '18/09/2027',
    nextFixture: 'Dessel Sport',
    leagueStandingSub: '#3',
    wageSpend: '£9.7K',
    balance: '£-710K',
    players: [samplePlayer],
    matches: [sampleMatch],
    hydratedFmSave: null,
  };

  const migrated = migratePersistedState(legacyV1Payload);
  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.activeShape, '4-3-3 DM Wide');
  assert.deepEqual(migrated.customSlots, []);
  assert.equal(migrated.applyToAnalystOnly, false);
  assert.deepEqual(migrated.archivedSaveSnapshots, []);
  assert.equal(migrated.players[0].name, 'Mbey Epolo');

  await savePersistedFmState({
    ...migrated,
    activeShape: '4-2-3-1 DM AM Wide',
    customSlots: [
      {
        slotId: 'ST',
        playerId: samplePlayer.id,
        ipRole: 'Channel Forward',
        oopRole: 'Central Outlet Centre Forward',
      },
    ],
    applyToAnalystOnly: true,
    archivedSaveSnapshots: [
      {
        id: 'snap-1',
        saveDate: '18/09/2027',
        clubName: 'KVV Zelzate',
        savedAt: '2027-09-18T12:00:00.000Z',
        playersCount: 1,
        matchesCount: 1,
      },
    ],
  });

  const exported = await exportBackupJson();
  assert.ok(exported);
  mockLocalStorage.clear();

  const imported = await importBackupJson(exported);
  assert.equal(imported.ok, true);
  assert.equal(imported.errors.length, 0);
  assert.equal(imported.state?.schemaVersion, 2);
  assert.equal(imported.state?.activeShape, '4-2-3-1 DM AM Wide');
  assert.equal(imported.state?.customSlots?.length, 1);
  assert.equal(imported.state?.applyToAnalystOnly, true);
  assert.equal(imported.state?.archivedSaveSnapshots?.length, 1);
});

test('fmStorage validateStateSchema and importBackupJson reject malformed payloads cleanly', async () => {
  const invalidShape = validateStateSchema({
    players: [],
    matches: [],
    activeShape: '9-0-1-Invalid',
  });
  assert.equal(invalidShape.valid, false);
  assert.ok(invalidShape.errors.some((e) => e.includes('activeShape')));

  const invalidSlots = validateStateSchema({
    players: [],
    matches: [],
    customSlots: [{ slotId: 123 }],
  });
  assert.equal(invalidSlots.valid, false);

  const badJson = await importBackupJson('{not valid json');
  assert.equal(badJson.ok, false);
  assert.equal(badJson.state, null);
  assert.ok(badJson.errors.length > 0);
});

test('fmStorage falls back to 150 targets in localStorage on quota error while awaiting IndexedDB', async () => {
  mockLocalStorage.clear();
  const win = (globalThis as unknown as {
    window: { localStorage: typeof mockLocalStorage; indexedDB?: unknown };
  }).window;

  const originalSetItem = mockLocalStorage.setItem;
  let setAttempts = 0;
  mockLocalStorage.setItem = (key: string, val: string) => {
    setAttempts += 1;
    if (setAttempts === 1) {
      throw new Error('QuotaExceededError');
    }
    return originalSetItem(key, val);
  };

  let idbPutCompleted = false;
  let idbDeleteCompleted = false;
  let storedTargetCountInIdb = 0;

  win.indexedDB = {
    open: () => {
      const req: Record<string, unknown> = {
        result: {
          objectStoreNames: { contains: () => true },
          transaction: () => {
            const tx: Record<string, unknown> = {
              objectStore: () => ({
                put: (payload: { hydratedFmSave?: { recruitmentTargets?: unknown[] } }) => {
                  storedTargetCountInIdb =
                    payload.hydratedFmSave?.recruitmentTargets?.length ?? 0;
                  setTimeout(() => {
                    idbPutCompleted = true;
                    if (typeof tx.oncomplete === 'function') (tx.oncomplete as () => void)();
                  }, 10);
                },
                delete: () => {
                  setTimeout(() => {
                    idbDeleteCompleted = true;
                    if (typeof tx.oncomplete === 'function') (tx.oncomplete as () => void)();
                  }, 10);
                },
              }),
            };
            return tx;
          },
          close: () => {},
        },
      };
      setTimeout(() => {
        if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
      }, 0);
      return req;
    },
  };

  try {
    const manyTargets: RecruitmentTarget[] = Array.from({ length: 220 }, (_, i) => ({
      uid: 1000 + i,
      name: `Target ${i}`,
      age: 21,
      nationality: 'Belgium',
      primaryPosition: 'MC',
      isFreeAgent: true,
      contractExpiryMonths: 0,
      demandedWageEur: 400,
      attributes: { passing: 13 },
    }));

    const ok = await savePersistedFmState({
      saveDate: '18/09/2027',
      nextFixture: 'Dessel Sport',
      leagueStandingSub: '#3',
      wageSpend: '£9.7K',
      balance: '£-710K',
      players: [samplePlayer],
      matches: [sampleMatch],
      hydratedFmSave: {
        saveDateLabel: '18/09/2027',
        nextFixtureLabel: 'Dessel Sport',
        leagueStandingLabel: '#3',
        wageComplianceLabel: '£9.7K',
        balanceLabel: '£-710K',
        updatedSquad: [samplePlayer],
        updatedMatches: [sampleMatch],
        recruitmentTargets: manyTargets,
      } as never,
    });

    assert.equal(ok, true);
    assert.equal(idbPutCompleted, true);
    assert.equal(storedTargetCountInIdb, 220);

    const loaded = loadPersistedFmState();
    assert.equal(loaded?.hydratedFmSave?.recruitmentTargets?.length, 150);

    await clearPersistedFmState();
    assert.equal(idbDeleteCompleted, true);
    assert.equal(loadPersistedFmState(), null);
  } finally {
    mockLocalStorage.setItem = originalSetItem;
    delete win.indexedDB;
  }
});

test('fmStorage handles IndexedDB transaction errors and aborts without unhandled rejections', async () => {
  mockLocalStorage.clear();
  const win = (globalThis as unknown as {
    window: { localStorage: typeof mockLocalStorage; indexedDB?: unknown };
  }).window;

  win.indexedDB = {
    open: () => {
      const req: Record<string, unknown> = {
        result: {
          objectStoreNames: { contains: () => true },
          transaction: () => {
            const tx: Record<string, unknown> = {
              objectStore: () => ({
                put: () => {
                  setTimeout(() => {
                    if (typeof tx.onerror === 'function') (tx.onerror as () => void)();
                  }, 5);
                },
                delete: () => {
                  setTimeout(() => {
                    if (typeof tx.onabort === 'function') (tx.onabort as () => void)();
                  }, 5);
                },
              }),
            };
            return tx;
          },
          close: () => {},
        },
      };
      setTimeout(() => {
        if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
      }, 0);
      return req;
    },
  };

  try {
    const ok = await savePersistedFmState({
      saveDate: '18/09/2027',
      nextFixture: 'Dessel Sport',
      leagueStandingSub: '#3',
      wageSpend: '£9.7K',
      balance: '£-710K',
      players: [samplePlayer],
      matches: [sampleMatch],
      hydratedFmSave: null,
    });
    assert.equal(ok, true);

    await clearPersistedFmState();
    assert.equal(loadPersistedFmState(), null);
  } finally {
    delete win.indexedDB;
  }
});
