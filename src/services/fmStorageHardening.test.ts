import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPersistedFmState,
  loadPersistedFmState,
  loadPersistedFmStateFromIndexedDb,
  savePersistedFmState,
  type FmHubPersistedState,
} from './fmStorage.ts';
import {
  createSaveHistoryPoint,
  putCachedSavePayload,
  putSaveHistoryPoint,
  SAVE_CACHE_STORE,
} from './saveCache.ts';
import { decodeFmSaveViaServer, createUploadController } from './fmSaveReader.ts';
import {
  hydrateAppFromDecodedFmSave,
  type DecodedFmSavePayload,
} from '../utils/fmSaveHydrator.ts';
import { isIndexedDbSnapshotNewer } from '../utils/persistedStateRecency.ts';

function toMb(bytes: number): number {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

function buildLargeSyntheticDecodedSave(): DecodedFmSavePayload {
  const players = Array.from({ length: 120 }, (_, i) => ({
    uid: 10_000 + i,
    name: `Squad Player ${i + 1}`,
    age: 18 + (i % 15),
    nation: 'Belgium',
    position: i % 11 === 0 ? 'GK' : i % 3 === 0 ? 'DC' : i % 3 === 1 ? 'MC' : 'ST (C)',
    wagePw: 350 + i * 25,
    expires: '30/06/2029',
    personality: 'Balanced',
    status: i < 11 ? 'Starter' : i < 23 ? 'Squad' : 'Youth',
    teamSlot: i < 28 ? 0 : i < 65 ? 1 : 2,
    apps: String(5 + (i % 25)),
    minutes: 450 + (i % 25) * 80,
    goals: i % 10,
    assists: i % 7,
    xG: Number(((i % 10) * 0.85).toFixed(2)),
    xA: Number(((i % 7) * 0.72).toFixed(2)),
    rating: Number((6.6 + (i % 12) * 0.08).toFixed(2)),
    abilityStars: 2.5 + (i % 5) * 0.5,
    potentialStars: 3.0 + (i % 5) * 0.5,
    // Intentionally include forbidden raw fields in input to confirm scrubbing
    ca: 112,
    pa: 138,
    attributes: {
      pace: 12 + (i % 6),
      acceleration: 12 + (i % 6),
      stamina: 13 + (i % 5),
      jumpingReach: 11 + (i % 7),
      determination: 13 + (i % 6),
      passing: 11 + (i % 6),
      finishing: 10 + (i % 7),
      tackling: 10 + (i % 7),
      firstTouch: 12 + (i % 5),
      decisions: 12 + (i % 5),
      workRate: 13 + (i % 5),
      offTheBall: 11 + (i % 6),
    },
  }));

  const playedMatches = Array.from({ length: 60 }, (_, i) => ({
    dateIso: `2027-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
    dateDmy: `${String((i % 27) + 1).padStart(2, '0')}/${String((i % 12) + 1).padStart(2, '0')}/2027`,
    competition: i % 5 === 0 ? 'Belgian Cup' : 'Challenger Pro League',
    opponent: `Opponent Club ${(i % 16) + 1}`,
    venue: i % 2 === 0 ? 'H' : 'A',
    result: i % 3 === 0 ? 'W' : i % 3 === 1 ? 'D' : 'L',
    score: i % 3 === 0 ? '2 - 0' : i % 3 === 1 ? '1 - 1' : '0 - 1',
    xGFor: 1.65,
    xGAgainst: 0.85,
    possession: 54,
    shotsFor: '13 (5)',
    shotsAgainst: '7 (2)',
    cccFor: 2,
    cccAgainst: 1,
    passCompletion: 84,
  }));

  const recruitmentTargets = Array.from({ length: 500 }, (_, i) => ({
    uid: 90_000 + i,
    name: `Scout Target ${i + 1}`,
    age: 19 + (i % 12),
    nationality: 'Belgium',
    primaryPosition: i % 4 === 0 ? 'DC' : i % 4 === 1 ? 'MC' : i % 4 === 2 ? 'AMR' : 'ST (C)',
    isFreeAgent: i % 2 === 0,
    contractExpiryMonths: i % 2 === 0 ? 0 : 4,
    demandedWageEur: 400 + (i % 15) * 50,
    attributes: { pace: 13, acceleration: 13, passing: 12, finishing: 12 },
  }));

  return {
    meta: {
      game: 'Football Manager 27',
      build: '27.4.0',
      fmsaveVersion: '0.14.3',
      saveName: 'stress-multi-season.fm',
      clubName: 'KVV Zelzate',
      managerName: 'Bobby',
      gameDateIso: '2028-04-12',
      gameDateDmy: '12/04/2028',
      decodedAtIso: '2028-04-12T10:00:00.000Z',
    },
    finances: {
      balance: 480_000,
      wageBudgetPw: 18_500,
      wageSpendPw: 14_200,
      transferBudget: 125_000,
    },
    leagueStanding: {
      competitionName: 'Challenger Pro League',
      position: 2,
      totalTeams: 16,
      played: 28,
      won: 18,
      drawn: 6,
      lost: 4,
      goalDiff: 26,
      points: 60,
      rows: [],
    },
    players,
    staff: [],
    playedMatches,
    upcomingFixtures: [
      {
        dateIso: '2028-04-19',
        dateDmy: '19/04/2028',
        competition: 'Challenger Pro League',
        opponent: 'KMSK Deinze',
        venue: 'H',
      },
    ],
    activeInjuries: [],
    activeSuspensions: [],
    mentoring: [],
    tactics: [],
    recruitmentTargets,
    warnings: [],
  } as unknown as DecodedFmSavePayload;
}

function createMockIndexedDb(options?: {
  writeDelayMs?: number;
  failFirstWriteWithQuota?: boolean;
}) {
  const stores = new Map<string, Map<string, unknown>>([
    ['hub_state', new Map()],
    [SAVE_CACHE_STORE, new Map()],
    ['snapshot_history', new Map()],
  ]);
  let putCount = 0;
  let quotaFailedOnce = false;

  const indexedDB = {
    open: () => {
      const req: Record<string, unknown> = {
        result: {
          objectStoreNames: {
            contains: (name: string) => stores.has(name),
          },
          createObjectStore: (name: string) => {
            if (!stores.has(name)) stores.set(name, new Map());
          },
          transaction: (storeNames: string | string[]) => {
            const firstStoreName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
            const tx: Record<string, unknown> = {
              error: null,
              objectStore: (name: string) => {
                const map = stores.get(name) ?? new Map<string, unknown>();
                stores.set(name, map);
                return {
                  put: (value: unknown, key: string) => {
                    putCount += 1;
                    const delay = options?.writeDelayMs ?? 2;
                    setTimeout(() => {
                      if (
                        options?.failFirstWriteWithQuota &&
                        !quotaFailedOnce &&
                        (name === SAVE_CACHE_STORE || name === 'snapshot_history')
                      ) {
                        quotaFailedOnce = true;
                        const err = new Error('QuotaExceededError');
                        err.name = 'QuotaExceededError';
                        tx.error = err;
                        if (typeof tx.onerror === 'function') (tx.onerror as () => void)();
                        return;
                      }
                      map.set(key, value);
                      if (typeof tx.oncomplete === 'function') (tx.oncomplete as () => void)();
                    }, delay);
                  },
                  get: (key: string) => {
                    const getReq: Record<string, unknown> = {};
                    setTimeout(() => {
                      getReq.result = map.get(key);
                      if (typeof getReq.onsuccess === 'function') {
                        (getReq.onsuccess as () => void)();
                      }
                    }, 0);
                    return getReq;
                  },
                  delete: (key: string) => {
                    map.delete(key);
                    setTimeout(() => {
                      if (typeof tx.oncomplete === 'function') (tx.oncomplete as () => void)();
                    }, 0);
                  },
                  openCursor: () => {
                    const cursorReq: Record<string, unknown> = {};
                    const entries = Array.from(map.entries());
                    let idx = 0;
                    const emit = () => {
                      if (idx < entries.length) {
                        const [k, v] = entries[idx++];
                        cursorReq.result = {
                          key: k,
                          value: v,
                          continue: () => setTimeout(emit, 0),
                        };
                      } else {
                        cursorReq.result = null;
                      }
                      if (typeof cursorReq.onsuccess === 'function') {
                        (cursorReq.onsuccess as () => void)();
                      }
                    };
                    setTimeout(emit, 0);
                    return cursorReq;
                  },
                };
              },
            };
            // Avoid unused variable warning
            void firstStoreName;
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

  return {
    indexedDB,
    stores,
    getPutCount: () => putCount,
  };
}

test('Synthetic large hydration (120 players, 60 matches, 500 targets) scrubs CA/PA and degrades gracefully across localStorage QuotaExceededError tiers while IndexedDB retains full fidelity', async () => {
  const t0 = performance.now();
  const decoded = buildLargeSyntheticDecodedSave();
  const hydrated = hydrateAppFromDecodedFmSave(decoded, [], []);

  assert.equal(hydrated.updatedSquad.length, 120);
  assert.equal(hydrated.updatedMatches.length, 60);
  assert.equal(hydrated.recruitmentTargets.length, 500);

  // Zero raw numeric CA/PA invariant in hydrated squad or analyst prompt context
  const hydratedSquadJson = JSON.stringify(hydrated.updatedSquad);
  assert.equal(/"(?:currentAbility|potentialAbility|rawCa|rawPa|ca|pa)"\s*:/i.test(hydratedSquadJson), false);
  assert.equal(/\bCA\s*[:=]?\s*112\b|\bPA\s*[:=]?\s*138\b/i.test(hydrated.analystPromptContext), false);

  const storageMap = new Map<string, string>();
  const mockIdb = createMockIndexedDb();
  let setCalls = 0;

  // Enforce a tight 220 KB synthetic Android localStorage ceiling so Tiers 1 & 2 throw QuotaExceededError
  const MAX_LOCAL_CHARS = 220_000;
  const mockLocalStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, val: string) => {
      setCalls += 1;
      if (val.length > MAX_LOCAL_CHARS) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      storageMap.set(key, val);
    },
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };

  const prevWindow = (globalThis as unknown as { window?: unknown }).window;
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: mockLocalStorage,
    indexedDB: mockIdb.indexedDB,
  };

  try {
    const ok = await savePersistedFmState({
      saveDate: hydrated.saveDateLabel || '--',
      nextFixture: hydrated.nextFixtureLabel || '--',
      leagueStandingSub: hydrated.leagueStandingLabel || '--',
      wageSpend: hydrated.wageComplianceLabel || '--',
      balance: hydrated.balanceLabel || '--',
      clubName: decoded.meta.clubName,
      players: hydrated.updatedSquad,
      matches: hydrated.updatedMatches,
      staff: hydrated.updatedStaff,
      hydratedFmSave: hydrated,
    });
    assert.equal(ok, true);
    assert.ok(setCalls >= 2, 'tight quota should trigger progressive localStorage compaction');

    const localLoaded = loadPersistedFmState();
    const idbLoaded = await loadPersistedFmStateFromIndexedDb();
    assert.ok(localLoaded, 'compacted localStorage shell should still persist cleanly');
    assert.ok(idbLoaded, 'IndexedDB should persist full payload');
    assert.equal(localLoaded.localStorageCompacted, true);
    assert.equal(idbLoaded.localStorageCompacted, undefined);
    assert.equal(
      localLoaded.lastSyncedAt,
      idbLoaded.lastSyncedAt,
      'localStorage and IndexedDB must share the exact same syncedAt timestamp'
    );
    assert.equal(
      isIndexedDbSnapshotNewer(idbLoaded, localLoaded),
      true,
      'full IndexedDB snapshot must upgrade compacted localStorage shell on reload'
    );
    assert.equal(idbLoaded.hydratedFmSave?.recruitmentTargets?.length, 500);

    const elapsedMs = Math.round(performance.now() - t0);
    const mem = process.memoryUsage();
    console.log(
      `[Phase 4 Stress] Large Hydration + Tiered Persistence (120p/60m/500t): ${elapsedMs}ms | RSS=${toMb(mem.rss)} MB | heapUsed=${toMb(mem.heapUsed)} MB | localStorageChars=${storageMap.get('fm27_command_hub_state_v1')?.length ?? 0}`
    );
  } finally {
    await clearPersistedFmState();
    if (prevWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      (globalThis as unknown as { window?: unknown }).window = prevWindow;
    }
  }
});

test('fmStorage coalesces rapid concurrent IndexedDB writes (latest-wins) and cancels queued writes on reset', async () => {
  const storageMap = new Map<string, string>();
  const mockIdb = createMockIndexedDb({ writeDelayMs: 15 });
  const prevWindow = (globalThis as unknown as { window?: unknown }).window;
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => storageMap.set(k, v),
      removeItem: (k: string) => storageMap.delete(k),
      clear: () => storageMap.clear(),
    },
    indexedDB: mockIdb.indexedDB,
  };

  try {
    const writes = [1, 2, 3, 4, 5].map((n) =>
      savePersistedFmState({
        saveDate: `0${n}/04/2028`,
        nextFixture: `Match ${n}`,
        leagueStandingSub: `#${n}`,
        wageSpend: '£10K',
        balance: '£500K',
        players: [],
        matches: [],
        hydratedFmSave: null,
      })
    );
    const results = await Promise.all(writes);
    assert.ok(results.every(Boolean));
    assert.ok(
      mockIdb.getPutCount() < 5,
      `expected rapid concurrent IDB writes to coalesce (puts=${mockIdb.getPutCount()})`
    );

    const idbFinal = await loadPersistedFmStateFromIndexedDb();
    assert.equal(idbFinal?.saveDate, '05/04/2028', 'latest write must win in IndexedDB');

    // Trigger a write and immediately clear -> cleared state must not be resurrected
    const pendingSave = savePersistedFmState({
      saveDate: '09/04/2028',
      nextFixture: 'Stale',
      leagueStandingSub: '#1',
      wageSpend: '£10K',
      balance: '£500K',
      players: [],
      matches: [],
      hydratedFmSave: null,
    });
    await clearPersistedFmState();
    await pendingSave;
    const afterClear = (await loadPersistedFmStateFromIndexedDb()) as FmHubPersistedState | null;
    assert.equal(afterClear, null, 'queued write must never resurrect state after clear');
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      (globalThis as unknown as { window?: unknown }).window = prevWindow;
    }
  }
});

test('saveCache recovers automatically from IndexedDB QuotaExceededError by evicting old cached saves and retrying once', async () => {
  const mockIdb = createMockIndexedDb({ failFirstWriteWithQuota: true });
  // Seed an older cached save so eviction has something to free
  mockIdb.stores.get(SAVE_CACHE_STORE)?.set('old_save.fm::01_01_2027', {
    key: 'old_save.fm::01_01_2027',
    cachedAt: '2027-01-01T00:00:00.000Z',
    payload: { stale: true },
  });

  const prevIndexedDb = (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
  (globalThis as unknown as { indexedDB: unknown }).indexedDB = mockIdb.indexedDB;

  try {
    const cachedOk = await putCachedSavePayload('fresh.fm', '12/04/2028', {
      clubName: 'KVV Zelzate',
    });
    assert.equal(cachedOk, true, 'putCachedSavePayload should succeed after quota eviction retry');
    assert.equal(
      mockIdb.stores.get(SAVE_CACHE_STORE)?.has('old_save.fm::01_01_2027'),
      false,
      'oldest cached save should have been evicted'
    );

    const point = createSaveHistoryPoint({
      saveName: 'fresh.fm',
      inGameDate: '12/04/2028',
      clubName: 'KVV Zelzate',
      balanceNum: 480_000,
      leaguePosition: 2,
      played: 28,
      points: 60,
      players: [],
    });
    const histOk = await putSaveHistoryPoint(point);
    assert.equal(histOk, true);
  } finally {
    if (prevIndexedDb === undefined) {
      delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
    } else {
      (globalThis as unknown as { indexedDB?: unknown }).indexedDB = prevIndexedDb;
    }
  }
});

test('fmSaveReader reconciles server receivedRanges strictly and retries partially covered chunks with x-fm-chunk-length header', async () => {
  const ctrl = createUploadController();
  const blob = new Blob([new Uint8Array(20)]); // 2 chunks: [0,10) and [10,20)
  const sentHeaders: Array<{ offset: string | null; length: string | null }> = [];
  let firstChunkAttempt = 0;

  const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/fm27/decode-save/init')) {
      return new Response(
        JSON.stringify({
          uploadId: '66666666-2222-4333-8444-555555555555',
          supportsParallelChunks: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.endsWith('/api/fm27/decode-save/chunk')) {
      const headers = new Headers(init?.headers);
      sentHeaders.push({
        offset: headers.get('x-fm-chunk-offset'),
        length: headers.get('x-fm-chunk-length'),
      });
      if (headers.get('x-fm-chunk-offset') === '0' && firstChunkAttempt === 0) {
        firstChunkAttempt += 1;
        // Pause right before completing chunk 0
        ctrl.pause('manual');
        setTimeout(() => ctrl.resume(), 20);
        throw new TypeError('Simulated pause interruption');
      }
      return new Response(JSON.stringify({ ok: true, bytesReceived: 20 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/fm27/decode-save/upload/') && url.endsWith('/status')) {
      // Server reports ONLY partial bytes [0, 5) for chunk [0, 10) -> must NOT be skipped!
      return new Response(
        JSON.stringify({
          uploadId: '66666666-2222-4333-8444-555555555555',
          bytesReceived: 5,
          expectedTotalBytes: 20,
          receivedOffsets: [0],
          receivedRanges: [{ offset: 0, length: 5 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.endsWith('/api/fm27/decode-save/finish')) {
      return new Response(
        JSON.stringify({ jobId: 'eeeeeeee-bbbb-4ccc-8ddd-eeeeeeeeeeee' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/api/fm27/decode-save/job/')) {
      return new Response(
        JSON.stringify({
          status: 'done',
          payload: {
            meta: { clubName: 'Range Verified FC', gameDateDmy: '12/04/2028', filename: 'r.fm' },
            players: [],
            staff: [],
            playedMatches: [],
            upcomingFixtures: [],
            warnings: [],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  const result = await decodeFmSaveViaServer(
    blob,
    {
      chunkSizeBytes: 10,
      uploadConcurrency: 1,
      pollIntervalMs: 10,
      retryBaseDelayMs: 5,
      uploadControl: ctrl,
      enableOfflineAutoPause: false,
    },
    undefined,
    mockFetch
  );

  assert.equal(result.meta.clubName, 'Range Verified FC');
  const offset0Calls = sentHeaders.filter((h) => h.offset === '0');
  assert.equal(offset0Calls.length, 2, 'partially covered [0,5) range must cause chunk [0,10) to be re-uploaded');
  assert.ok(
    sentHeaders.every((h) => h.length === '10'),
    'every chunk request must send exact x-fm-chunk-length header'
  );
});
