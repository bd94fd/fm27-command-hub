/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Plan 1: IndexedDB Save Cache & Multi-Snapshot Diffing (CA Growth + Youth Intake Radar).
 * Inspired by aitester2025tgl-collab/fm27-explorer (MIT) and mavarobli/FMSuperScout (MIT).
 */
import { MatchLogEntry, PlayerRecord } from '../types/fm27';
import type { CompactBinaryDiffSnapshot } from '../utils/fm27BinaryDictionary';
import {
  CompetitionScopeBreakdown,
  deriveFootballSeasonLabel,
  summarizeMatchesByScope,
} from '../utils/matchScopeHelpers';

export const SAVE_CACHE_DB_NAME = 'fm27_command_hub_save_cache_v1';
export const SAVE_CACHE_STORE = 'parsed_saves';
export const SNAPSHOT_HISTORY_STORE = 'snapshot_history';
export const MAX_CACHED_SAVES = 5;
export const MAX_SNAPSHOT_POINTS = 60;
export const DECODED_CACHE_SCHEMA_VERSION = 'r15-v1';

export interface CompactPlayerSnapshot {
  uid: number;
  name: string;
  position: string;
  age: number;
  ability: number;
  potential: number;
  marketValue: number | null;
  wagePw: number;
  expires?: string;
  squadStatus?: string;
  rating?: number | null;
  goals?: number;
  assists?: number;
  minutes?: number;
  xG?: number;
  xA?: number;
  ipRole?: string;
  oopRole?: string;
  teamSlot?: number;
}

export interface SaveHistoryPoint {
  cacheKey: string;
  saveName: string;
  inGameDate: string;
  seasonLabel?: string;
  clubName: string;
  capturedAt: string;
  balance?: string;
  balanceNum?: number | null;
  monthlyBurnRate?: number | null;
  wagePayrollWeekly?: number | null;
  wageBudgetWeekly?: number | null;
  leaguePosition?: number | null;
  played?: number | null;
  won?: number | null;
  drawn?: number | null;
  lost?: number | null;
  points?: number | null;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
  xgFor?: number | null;
  xgAgainst?: number | null;
  competitionBreakdown?: CompetitionScopeBreakdown | null;
  tacticName?: string | null;
  tacticFormation?: string | null;
  tacticMentality?: string | null;
  activeInjuriesCount?: number | null;
  activeSuspensionsCount?: number | null;
  promisesAtRiskCount?: number | null;
  managerExpires?: string | null;
  boardGrade?: string | null;
  supporterGrade?: string | null;
  binaryDiffSnapshot?: CompactBinaryDiffSnapshot | null;
  players: CompactPlayerSnapshot[];
}

export interface AiJourneyBriefingResult {
  headline: string;
  journeyArc: string;
  whatImproved: string[];
  whatWorsened: string[];
  thingsToNote: string[];
  tacticalEvolution: string;
  governanceAndPromisesAudit: string;
  priorityNextActions: string[];
  generatedAtIso?: string;
}

export {
  buildDeepJourneyReport,
  diffSaveHistoryPoints,
} from '../utils/saveJourneyReport';
export type {
  ContractChangeDelta,
  DeepJourneyReport,
  JourneyFindingItem,
  JourneyTimelinePoint,
  PlayerGrowthDelta,
  SnapshotDiffSummary,
  SnapshotKpiDeltas,
} from '../utils/saveJourneyReport';


/**
 * Deterministic cache key for a parsed .fm save + in-game date.
 */
export function buildSaveCacheKey(saveName: string, inGameDate: string): string {
  const cleanName = saveName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
  const cleanDate = inGameDate.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
  return `${cleanName || 'save'}::${cleanDate || 'unknown'}`;
}

/**
 * Cache key for a decoded payload keyed by the save file's content fingerprint.
 * Scope and sync mode are part of the key because they change the decoded shape.
 */
export function buildFingerprintSaveCacheKey(
  fingerprint: string,
  scope: string,
  fastSync: boolean
): string {
  const cleanFingerprint = fingerprint.trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, '_');
  const cleanScope = scope.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
  return `fp::${DECODED_CACHE_SCHEMA_VERSION}::${cleanScope || 'scope'}::${
    fastSync ? 'fast' : 'full'
  }::${cleanFingerprint || 'unknown'}`;
}

/**
 * The cache key must describe the payload that was actually decoded. A phone
 * fallback can choose Fast Sync even when the UI requested Full Sync, so the
 * payload's own mode wins over the requested mode.
 */
export function resolveDecodedPayloadFastSync(
  payloadFastSync: boolean | undefined,
  requestedFastSync: boolean
): boolean {
  return typeof payloadFastSync === 'boolean' ? payloadFastSync : requestedFastSync;
}

export function isDecodedCacheSyncModeCompatible(
  payloadFastSync: boolean | undefined,
  requestedFastSync: boolean
): boolean {
  return typeof payloadFastSync !== 'boolean' || payloadFastSync === requestedFastSync;
}

/**
 * Extracts a compact, mobile-safe snapshot from full PlayerRecord[].
 */
export function createSaveHistoryPoint(params: {
  saveName: string;
  inGameDate: string;
  seasonLabel?: string;
  clubName: string;
  players: PlayerRecord[];
  matches?: MatchLogEntry[];
  competitionBreakdown?: CompetitionScopeBreakdown | null;
  balance?: string;
  balanceNum?: number | null;
  monthlyBurnRate?: number | null;
  wagePayrollWeekly?: number | null;
  wageBudgetWeekly?: number | null;
  leaguePosition?: number | null;
  played?: number | null;
  won?: number | null;
  drawn?: number | null;
  lost?: number | null;
  points?: number | null;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
  xgFor?: number | null;
  xgAgainst?: number | null;
  tacticName?: string | null;
  tacticFormation?: string | null;
  tacticMentality?: string | null;
  activeInjuriesCount?: number | null;
  activeSuspensionsCount?: number | null;
  promisesAtRiskCount?: number | null;
  managerExpires?: string | null;
  boardGrade?: string | null;
  supporterGrade?: string | null;
  binaryDiffSnapshot?: CompactBinaryDiffSnapshot | null;
  capturedAt?: string;
}): SaveHistoryPoint {
  const resolvedSeason =
    params.seasonLabel || deriveFootballSeasonLabel(params.inGameDate);
  const computedBreakdown =
    params.competitionBreakdown ??
    (Array.isArray(params.matches) && params.matches.length > 0
      ? summarizeMatchesByScope(
          params.matches,
          resolvedSeason !== 'Unknown Season' ? resolvedSeason : undefined
        )
      : null);

  // Prefer competitive (League + Cup) xG so pre-season friendlies never pollute competitive xG trajectories
  const compXgFor =
    computedBreakdown && computedBreakdown.competitive.xgMatchesCount > 0
      ? computedBreakdown.competitive.xgFor
      : params.xgFor ?? null;
  const compXgAgainst =
    computedBreakdown && computedBreakdown.competitive.xgMatchesCount > 0
      ? computedBreakdown.competitive.xgAgainst
      : params.xgAgainst ?? null;

  const players: CompactPlayerSnapshot[] = params.players
    .filter((p): p is PlayerRecord & { uid: number } => typeof p.uid === 'number' && Number.isFinite(p.uid))
    .map((p) => ({
      uid: p.uid,
      name: p.name,
      position: p.position,
      age: p.age,
      ability: p.ability,
      potential: p.potential,
      marketValue: p.marketValue ?? null,
      wagePw: p.wagePw,
      expires: p.expires || '--',
      squadStatus: p.status,
      rating: p.rating ?? null,
      goals: p.goals ?? 0,
      assists: p.assists ?? 0,
      minutes: p.minutes ?? 0,
      xG: p.xG ?? 0,
      xA: p.xA ?? 0,
      ipRole: p.ipRole || undefined,
      oopRole: p.oopRole || undefined,
      teamSlot: p.teamSlot ?? 0,
    }));

  return {
    cacheKey: buildSaveCacheKey(params.saveName, params.inGameDate),
    saveName: params.saveName,
    inGameDate: params.inGameDate,
    seasonLabel: resolvedSeason,
    clubName: params.clubName,
    capturedAt: params.capturedAt ?? new Date().toISOString(),
    balance: params.balance,
    balanceNum: params.balanceNum ?? null,
    monthlyBurnRate: params.monthlyBurnRate ?? null,
    wagePayrollWeekly: params.wagePayrollWeekly ?? null,
    wageBudgetWeekly: params.wageBudgetWeekly ?? null,
    leaguePosition: params.leaguePosition ?? null,
    played: params.played ?? null,
    won: params.won ?? null,
    drawn: params.drawn ?? null,
    lost: params.lost ?? null,
    points: params.points ?? null,
    goalsFor: params.goalsFor ?? null,
    goalsAgainst: params.goalsAgainst ?? null,
    xgFor: compXgFor,
    xgAgainst: compXgAgainst,
    competitionBreakdown: computedBreakdown,
    tacticName: params.tacticName ?? null,
    tacticFormation: params.tacticFormation ?? null,
    tacticMentality: params.tacticMentality ?? null,
    activeInjuriesCount: params.activeInjuriesCount ?? null,
    activeSuspensionsCount: params.activeSuspensionsCount ?? null,
    promisesAtRiskCount: params.promisesAtRiskCount ?? null,
    managerExpires: params.managerExpires ?? null,
    boardGrade: params.boardGrade ?? null,
    supporterGrade: params.supporterGrade ?? null,
    binaryDiffSnapshot: params.binaryDiffSnapshot ?? null,
    players,
  };
}


export const JOURNEY_BRIEFING_CACHE_PREFIX = 'journey_brief_v2::';

export async function putCachedJourneyBriefing(
  fromKey: string,
  toKey: string,
  briefing: AiJourneyBriefingResult
): Promise<boolean> {
  return putCachedSavePayload(`${JOURNEY_BRIEFING_CACHE_PREFIX}${fromKey}`, toKey, briefing);
}

export async function getCachedJourneyBriefing(
  fromKey: string,
  toKey: string
): Promise<AiJourneyBriefingResult | null> {
  return getCachedSavePayload<AiJourneyBriefingResult>(
    `${JOURNEY_BRIEFING_CACHE_PREFIX}${fromKey}`,
    toKey
  );
}

function openSaveCacheDb(): Promise<IDBDatabase | null> {
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

function isQuotaError(err: unknown): boolean {
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
function openSaveCacheWriteTx(db: IDBDatabase): {
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

async function evictOldestCachedSavesForQuota(
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

function writeCachedSavePayloadOnce<T>(
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

async function putCachedSavePayloadByKey<T>(
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

async function getCachedSavePayloadByKey<T>(key: string): Promise<T | null> {
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

export async function putCachedSavePayload<T>(
  saveName: string,
  inGameDate: string,
  payload: T
): Promise<boolean> {
  return putCachedSavePayloadByKey(
    buildSaveCacheKey(saveName, inGameDate),
    payload
  );
}

export async function getCachedSavePayload<T>(
  saveName: string,
  inGameDate: string
): Promise<T | null> {
  return getCachedSavePayloadByKey<T>(buildSaveCacheKey(saveName, inGameDate));
}

export async function putCachedDecodedSavePayload<T>(
  fingerprint: string,
  scope: string,
  fastSync: boolean,
  payload: T
): Promise<boolean> {
  return putCachedSavePayloadByKey(
    buildFingerprintSaveCacheKey(fingerprint, scope, fastSync),
    payload
  );
}

export async function getCachedDecodedSavePayload<T>(
  fingerprint: string,
  scope: string,
  fastSync: boolean
): Promise<T | null> {
  return getCachedSavePayloadByKey<T>(
    buildFingerprintSaveCacheKey(fingerprint, scope, fastSync)
  );
}

function writeSaveHistoryPointOnce(
  db: IDBDatabase,
  point: SaveHistoryPoint
): Promise<{ ok: boolean; quotaExceeded: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean, quotaExceeded = false) => {
      if (settled) return;
      settled = true;
      resolve({ ok, quotaExceeded });
    };
    try {
      const tx = db.transaction(SNAPSHOT_HISTORY_STORE, 'readwrite');
      const store = tx.objectStore(SNAPSHOT_HISTORY_STORE);
      store.put(point, point.cacheKey);

      const pruneMeta = (meta: Array<{ cacheKey: string; capturedAt: string }>) => {
        if (meta.length <= MAX_SNAPSHOT_POINTS) return;
        meta.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
        const excess = meta.slice(0, meta.length - MAX_SNAPSHOT_POINTS);
        for (const old of excess) {
          if (old.cacheKey) {
            store.delete(old.cacheKey);
          }
        }
      };

      // Use cursor iteration when supported so pruning stays memory-light on mobile
      if (typeof store.openCursor === 'function') {
        const meta: Array<{ cacheKey: string; capturedAt: string }> = [];
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            const val = cursor.value as { cacheKey?: string; capturedAt?: string } | undefined;
            const entryKey =
              typeof val?.cacheKey === 'string'
                ? val.cacheKey
                : typeof cursor.key === 'string'
                  ? cursor.key
                  : '';
            if (entryKey) {
              meta.push({
                cacheKey: entryKey,
                capturedAt: typeof val?.capturedAt === 'string' ? val.capturedAt : '',
              });
            }
            cursor.continue();
          } else {
            pruneMeta(meta);
          }
        };
      } else {
        const allReq = store.getAll();
        allReq.onsuccess = () => {
          const all = (allReq.result as SaveHistoryPoint[]) || [];
          pruneMeta(
            all
              .filter((item) => Boolean(item?.cacheKey))
              .map((item) => ({ cacheKey: item.cacheKey, capturedAt: item.capturedAt || '' }))
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

/**
 * Persists a compact SaveHistoryPoint in IndexedDB (pruning oldest beyond MAX_SNAPSHOT_POINTS,
 * with automatic 1-shot QuotaExceededError eviction of cached full saves).
 */
export async function putSaveHistoryPoint(
  point: SaveHistoryPoint
): Promise<boolean> {
  const db = await openSaveCacheDb();
  if (!db) return false;
  try {
    const first = await writeSaveHistoryPointOnce(db, point);
    if (first.ok) return true;
    if (first.quotaExceeded) {
      const evicted = await evictOldestCachedSavesForQuota(db, undefined, MAX_CACHED_SAVES);
      if (evicted > 0) {
        const retry = await writeSaveHistoryPointOnce(db, point);
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

/**
 * Lists all cached SaveHistoryPoint snapshots sorted newest-first.
 */
export async function listSaveHistoryPoints(): Promise<SaveHistoryPoint[]> {
  const db = await openSaveCacheDb();
  if (!db) return [];
  return new Promise((resolve) => {
    let settled = false;
    const finish = (items: SaveHistoryPoint[]) => {
      if (settled) return;
      settled = true;
      try {
        db.close();
      } catch {
        // ignore close errors
      }
      resolve(items);
    };
    try {
      const tx = db.transaction(SNAPSHOT_HISTORY_STORE, 'readonly');
      const req = tx.objectStore(SNAPSHOT_HISTORY_STORE).getAll();
      req.onsuccess = () => {
        const items = ((req.result as SaveHistoryPoint[]) || []).filter(
          (item) => item && typeof item.cacheKey === 'string' && Array.isArray(item.players)
        );
        items.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
        finish(items);
      };
      req.onerror = () => finish([]);
      tx.onabort = () => finish([]);
    } catch {
      finish([]);
    }
  });
}

/**
 * Deletes a single cached SaveHistoryPoint snapshot by cacheKey.
 */
export async function deleteSaveHistoryPoint(cacheKey: string): Promise<boolean> {
  const db = await openSaveCacheDb();
  if (!db) return false;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        db.close();
      } catch {
        // ignore close errors
      }
      resolve(ok);
    };
    try {
      const tx = db.transaction(SNAPSHOT_HISTORY_STORE, 'readwrite');
      tx.objectStore(SNAPSHOT_HISTORY_STORE).delete(cacheKey);
      tx.oncomplete = () => finish(true);
      tx.onerror = () => finish(false);
      tx.onabort = () => finish(false);
    } catch {
      finish(false);
    }
  });
}

/**
 * Clears all stored SaveHistoryPoint snapshots from IndexedDB so the user can test fresh.
 */
export async function clearSaveHistoryPoints(): Promise<boolean> {
  const db = await openSaveCacheDb();
  if (!db) return false;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        db.close();
      } catch {
        // ignore close errors
      }
      resolve(ok);
    };
    try {
      const tx = db.transaction(SNAPSHOT_HISTORY_STORE, 'readwrite');
      tx.objectStore(SNAPSHOT_HISTORY_STORE).clear();
      tx.oncomplete = () => finish(true);
      tx.onerror = () => finish(false);
      tx.onabort = () => finish(false);
    } catch {
      finish(false);
    }
  });
}

/**
 * Clears BOTH cached decoded save payloads (including cached AI Journey Briefings)
 * and all stored SaveHistoryPoint snapshots from IndexedDB.
 */
export async function clearAllSaveCache(): Promise<boolean> {
  const db = await openSaveCacheDb();
  if (!db) return false;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        db.close();
      } catch {
        // ignore close errors
      }
      resolve(ok);
    };
    try {
      const tx = db.transaction([SAVE_CACHE_STORE, SNAPSHOT_HISTORY_STORE], 'readwrite');
      tx.objectStore(SAVE_CACHE_STORE).clear();
      tx.objectStore(SNAPSHOT_HISTORY_STORE).clear();
      tx.oncomplete = () => finish(true);
      tx.onerror = () => finish(false);
      tx.onabort = () => finish(false);
    } catch {
      finish(false);
    }
  });
}

export interface SaveCacheStats {
  cachedSavesCount: number;
  cachedBriefingsCount: number;
  snapshotPointsCount: number;
  indexedDbAvailable: boolean;
}

/**
 * Lightweight IndexedDB cache census using key-only / count-only queries
 * so mobile browsers never pull full decoded save payloads into RAM.
 */
export async function getSaveCacheStats(): Promise<SaveCacheStats> {
  const empty: SaveCacheStats = {
    cachedSavesCount: 0,
    cachedBriefingsCount: 0,
    snapshotPointsCount: 0,
    indexedDbAvailable: false,
  };
  const db = await openSaveCacheDb();
  if (!db) return empty;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (stats: SaveCacheStats) => {
      if (settled) return;
      settled = true;
      try {
        db.close();
      } catch {
        // ignore close errors
      }
      resolve(stats);
    };
    try {
      const tx = db.transaction([SAVE_CACHE_STORE, SNAPSHOT_HISTORY_STORE], 'readonly');
      const keysReq = tx.objectStore(SAVE_CACHE_STORE).getAllKeys();
      const snapCountReq = tx.objectStore(SNAPSHOT_HISTORY_STORE).count();
      let cachedSavesCount = 0;
      let cachedBriefingsCount = 0;
      let snapshotPointsCount = 0;

      keysReq.onsuccess = () => {
        const keys = Array.isArray(keysReq.result) ? keysReq.result : [];
        for (const rawKey of keys) {
          const key = String(rawKey || '');
          if (key.startsWith('journey_brief::') || key.startsWith(JOURNEY_BRIEFING_CACHE_PREFIX)) {
            cachedBriefingsCount += 1;
          } else if (key.length > 0) {
            cachedSavesCount += 1;
          }
        }
      };

      snapCountReq.onsuccess = () => {
        snapshotPointsCount = typeof snapCountReq.result === 'number' ? snapCountReq.result : 0;
      };

      tx.oncomplete = () =>
        finish({
          cachedSavesCount,
          cachedBriefingsCount,
          snapshotPointsCount,
          indexedDbAvailable: true,
        });
      tx.onerror = () => finish({ ...empty, indexedDbAvailable: true });
      tx.onabort = () => finish({ ...empty, indexedDbAvailable: true });
    } catch {
      finish(empty);
    }
  });
}



