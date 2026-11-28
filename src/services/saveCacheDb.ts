/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The IndexedDB plumbing under the save cache: open the database, write with
 * room for eviction, and read one payload back. The public cache API lives in
 * `saveCache.ts`, which owns the keys, the snapshot history and the stats.
 */

export const SAVE_CACHE_DB_NAME = 'fm27_command_hub_save_cache_v1';
export const SAVE_CACHE_STORE = 'parsed_saves';
export const SNAPSHOT_HISTORY_STORE = 'snapshot_history';
export const MAX_CACHED_SAVES = 5;

export function openSaveCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      resolve(db);
    };
    try {
      const req = indexedDB.open(SAVE_CACHE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SAVE_CACHE_STORE)) {
          db.createObjectStore(SAVE_CACHE_STORE);
        }
        if (!db.objectStoreNames.contains(SNAPSHOT_HISTORY_STORE)) {
          db.createObjectStore(SNAPSHOT_HISTORY_STORE);
        }
      };
      req.onsuccess = () => finish(req.result);
      req.onerror = () => finish(null);
      req.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(String(e.message || ''))
  );
}

/**
 * Opens a readwrite transaction over the cached save payloads and, where the
 * database has it, the snapshot history store keyed by the same cache key.
 */
export function openSaveCacheWriteTx(db: IDBDatabase): {
  tx: IDBTransaction;
  store: IDBObjectStore;
  historyStore: IDBObjectStore | null;
} {
  let hasHistoryStore = false;
  try {
    hasHistoryStore = db.objectStoreNames.contains(SNAPSHOT_HISTORY_STORE);
  } catch {
    hasHistoryStore = false;
  }
  const tx = db.transaction(
    hasHistoryStore ? [SAVE_CACHE_STORE, SNAPSHOT_HISTORY_STORE] : SAVE_CACHE_STORE,
    'readwrite'
  );
  let historyStore: IDBObjectStore | null = null;
  if (hasHistoryStore) {
    try {
      historyStore = tx.objectStore(SNAPSHOT_HISTORY_STORE);
    } catch {
      historyStore = null;
    }
  }
  return { tx, store: tx.objectStore(SAVE_CACHE_STORE), historyStore };
}

export async function evictOldestCachedSavesForQuota(
  db: IDBDatabase,
  excludeKey?: string,
  maxToEvict = 2
): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (evicted: number) => {
      if (settled) return;
      settled = true;
      resolve(evicted);
    };
    try {
      const { tx, store, historyStore } = openSaveCacheWriteTx(db);
      const entries: Array<{ key: string; cachedAt: string }> = [];
      let evictedCount = 0;

      const deleteOldest = () => {
        const candidates = entries
          .filter((e) => e.key && e.key !== excludeKey)
          .sort((a, b) => a.cachedAt.localeCompare(b.cachedAt))
          .slice(0, maxToEvict);
        for (const c of candidates) {
          store.delete(c.key);
          // Evicted payloads must not leave their Journey history orphaned.
          historyStore?.delete(c.key);
          evictedCount += 1;
        }
      };

      if (typeof store.openCursor === 'function') {
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            const val = cursor.value as { key?: string; cachedAt?: string } | undefined;
            const entryKey =
              typeof val?.key === 'string'
                ? val.key
                : typeof cursor.key === 'string'
                  ? cursor.key
                  : '';
            if (entryKey) {
              entries.push({
                key: entryKey,
                cachedAt: typeof val?.cachedAt === 'string' ? val.cachedAt : '',
              });
            }
            cursor.continue();
          } else {
            deleteOldest();
          }
        };
      } else {
        const allReq = store.getAll();
        allReq.onsuccess = () => {
          const all = (allReq.result as Array<{ key?: string; cachedAt?: string }>) || [];
          for (const item of all) {
            if (item?.key) {
              entries.push({ key: item.key, cachedAt: item.cachedAt || '' });
            }
          }
          deleteOldest();
        };
      }

      tx.oncomplete = () => finish(evictedCount);
      tx.onerror = () => finish(0);
      tx.onabort = () => finish(0);
    } catch {
      finish(0);
    }
  });
}

export function writeCachedSavePayloadOnce<T>(
  db: IDBDatabase,
  key: string,
  payload: T
): Promise<{ ok: boolean; quotaExceeded: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean, quotaExceeded = false) => {
      if (settled) return;
      settled = true;
      resolve({ ok, quotaExceeded });
    };
    try {
      const { tx, store, historyStore } = openSaveCacheWriteTx(db);
      const cachedAt = new Date().toISOString();
      store.put({ key, cachedAt, payload }, key);

      const pruneEntries = (meta: Array<{ key: string; cachedAt: string }>) => {
        if (meta.length <= MAX_CACHED_SAVES) return;
        meta.sort((a, b) => {
          const cmp = a.cachedAt.localeCompare(b.cachedAt);
          if (cmp !== 0) return cmp;
          if (a.key === key && b.key !== key) return 1;
          if (b.key === key && a.key !== key) return -1;
          return 0;
        });
        const excess = meta.slice(0, meta.length - MAX_CACHED_SAVES);
        for (const old of excess) {
          if (old.key) {
            store.delete(old.key);
            // Pruned payloads must not leave their Journey history orphaned.
            historyStore?.delete(old.key);
          }
        }
      };

      // Use cursor iteration when supported so pruning never holds all full save payloads in RAM at once
      if (typeof store.openCursor === 'function') {
        const meta: Array<{ key: string; cachedAt: string }> = [];
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            const val = cursor.value as { key?: string; cachedAt?: string } | undefined;
            const entryKey =
              typeof val?.key === 'string'
                ? val.key
                : typeof cursor.key === 'string'
                  ? cursor.key
                  : '';
            if (entryKey) {
              meta.push({
                key: entryKey,
                cachedAt: typeof val?.cachedAt === 'string' ? val.cachedAt : '',
              });
            }
            cursor.continue();
          } else {
            pruneEntries(meta);
          }
        };
      } else {
        const allReq = store.getAll();
        allReq.onsuccess = () => {
          const all = (allReq.result as Array<{ key?: string; cachedAt?: string }>) || [];
          pruneEntries(
            all
              .filter((item): item is { key: string; cachedAt?: string } => Boolean(item?.key))
              .map((item) => ({ key: item.key, cachedAt: item.cachedAt || '' }))
          );
        };
      }

      tx.oncomplete = () => finish(true, false);
      tx.onerror = () => finish(false, isQuotaError(tx.error));
      tx.onabort = () => finish(false, isQuotaError(tx.error));
    } catch (err) {
      finish(false, isQuotaError(err));
    }
  });
}

export async function putCachedSavePayloadByKey<T>(
  key: string,
  payload: T
): Promise<boolean> {
  const db = await openSaveCacheDb();
  if (!db) return false;
  try {
    const first = await writeCachedSavePayloadOnce(db, key, payload);
    if (first.ok) return true;
    if (first.quotaExceeded) {
      const evicted = await evictOldestCachedSavesForQuota(db, key, MAX_CACHED_SAVES);
      if (evicted > 0) {
        const retry = await writeCachedSavePayloadOnce(db, key, payload);
        return retry.ok;
      }
    }
    return false;
  } finally {
    try {
      db.close();
    } catch {
      // ignore close errors
    }
  }
}

export async function getCachedSavePayloadByKey<T>(key: string): Promise<T | null> {
  const db = await openSaveCacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val: T | null) => {
      if (settled) return;
      settled = true;
      try {
        db.close();
      } catch {
        // ignore close errors
      }
      resolve(val);
    };
    try {
      const tx = db.transaction(SAVE_CACHE_STORE, 'readonly');
      const req = tx.objectStore(SAVE_CACHE_STORE).get(key);
      req.onsuccess = () => {
        const record = req.result as { payload?: T } | undefined;
        finish(record?.payload ?? null);
      };
      req.onerror = () => finish(null);
      tx.onabort = () => finish(null);
    } catch {
      finish(null);
    }
  });
}
