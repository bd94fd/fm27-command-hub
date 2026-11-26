import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFingerprintSaveCacheKey,
  getCachedDecodedSavePayload,
  putCachedDecodedSavePayload,
  SAVE_CACHE_STORE,
} from './saveCache';

function installIndexedDbMock(stores: Map<string, Map<string, unknown>>) {
  const originalIndexedDb = (globalThis as { indexedDB?: unknown }).indexedDB;
  const mockIndexedDb = {
    open: () => {
      const openReq: Record<string, unknown> = {
        result: {
          objectStoreNames: { contains: (name: string) => stores.has(name) },
          createObjectStore: (name: string) => {
            if (!stores.has(name)) stores.set(name, new Map());
          },
          close: () => {},
          transaction: (storeName: string) => {
            const storeMap = stores.get(storeName) ?? new Map<string, unknown>();
            const tx: Record<string, unknown> = {
              oncomplete: null as (() => void) | null,
              onerror: null as (() => void) | null,
              onabort: null as (() => void) | null,
              objectStore: () => ({
                put: (val: unknown, key: string) => storeMap.set(key, val),
                get: (key: string) => {
                  const req: Record<string, unknown> = {
                    result: storeMap.get(key),
                    onsuccess: null as (() => void) | null,
                    onerror: null as (() => void) | null,
                  };
                  queueMicrotask(() => (req.onsuccess as (() => void) | null)?.());
                  return req;
                },
                getAll: () => {
                  const req: Record<string, unknown> = {
                    result: Array.from(storeMap.values()),
                    onsuccess: null as (() => void) | null,
                    onerror: null as (() => void) | null,
                  };
                  queueMicrotask(() => {
                    (req.onsuccess as (() => void) | null)?.();
                    queueMicrotask(() => (tx.oncomplete as (() => void) | null)?.());
                  });
                  return req;
                },
                delete: (key: string) => storeMap.delete(key),
              }),
            };
            return tx;
          },
        },
        onupgradeneeded: null as (() => void) | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      queueMicrotask(() => (openReq.onsuccess as (() => void) | null)?.());
      return openReq;
    },
  };
  (globalThis as { indexedDB?: unknown }).indexedDB = mockIndexedDb;
  return () => {
    if (originalIndexedDb === undefined) {
      delete (globalThis as { indexedDB?: unknown }).indexedDB;
    } else {
      (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDb;
    }
  };
}

test('fingerprint cache key separates scope and sync mode', () => {
  const full = buildFingerprintSaveCacheKey('r15:250:abc', 'club_and_division', false);
  const fast = buildFingerprintSaveCacheKey('r15:250:abc', 'club_and_division', true);
  const clubOnly = buildFingerprintSaveCacheKey('r15:250:abc', 'managed_club_only', false);

  assert.match(full, /^fp::r15-v1::club_and_division::full::r15:250:abc$/);
  assert.notEqual(full, fast);
  assert.notEqual(full, clubOnly);
});

test('decoded payload cache round-trips by file fingerprint', async () => {
  const stores = new Map<string, Map<string, unknown>>([
    [SAVE_CACHE_STORE, new Map()],
  ]);
  const restore = installIndexedDbMock(stores);
  try {
    const payload = { meta: { clubName: 'Cache United' }, players: [] };
    const fingerprint = 'r15:250:abc123';

    assert.equal(
      await putCachedDecodedSavePayload(fingerprint, 'club_and_division', false, payload),
      true
    );
    assert.deepEqual(
      await getCachedDecodedSavePayload(fingerprint, 'club_and_division', false),
      payload
    );
    assert.equal(
      await getCachedDecodedSavePayload(fingerprint, 'club_and_division', true),
      null,
      'Fast Sync must not read the Full Sync payload'
    );
    assert.equal(
      await getCachedDecodedSavePayload('r15:250:different', 'club_and_division', false),
      null
    );
  } finally {
    restore();
  }
});
