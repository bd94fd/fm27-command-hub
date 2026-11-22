/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Plan 1: IndexedDB Save Cache & Multi-Snapshot Diffing (CA Growth + Youth Intake Radar).
 * Inspired by aitester2025tgl-collab/fm27-explorer (MIT) and mavarobli/FMSuperScout (MIT).
 */

import { PlayerRecord } from '../types/fm27';

export const SAVE_CACHE_DB_NAME = 'fm27_command_hub_save_cache_v1';
export const SAVE_CACHE_STORE = 'parsed_saves';
export const SNAPSHOT_HISTORY_STORE = 'snapshot_history';
export const MAX_CACHED_SAVES = 5;
export const MAX_SNAPSHOT_POINTS = 60;

export interface CompactPlayerSnapshot {
  uid: number;
  name: string;
  position: string;
  age: number;
  ability: number;
  potential: number;
  marketValue: number | null;
  wagePw: number;
}

export interface SaveHistoryPoint {
  cacheKey: string;
  saveName: string;
  inGameDate: string;
  clubName: string;
  capturedAt: string;
  balance?: string;
  leaguePosition?: number | null;
  players: CompactPlayerSnapshot[];
}

export interface PlayerGrowthDelta {
  uid: number;
  name: string;
  position: string;
  age: number;
  abilityDelta: number;
  potentialDelta: number;
  valueDelta: number | null;
  isNewgen: boolean;
}

export interface SnapshotDiffSummary {
  fromDate: string;
  toDate: string;
  totalTracked: number;
  risers: PlayerGrowthDelta[];
  fallers: PlayerGrowthDelta[];
  newgens: PlayerGrowthDelta[];
}

/**
 * Deterministic cache key for a parsed .fm save + in-game date.
 */
export function buildSaveCacheKey(saveName: string, inGameDate: string): string {
  const cleanName = saveName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
  const cleanDate = inGameDate.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
  return `${cleanName || 'save'}::${cleanDate || 'unknown'}`;
}

/**
 * Extracts a compact, mobile-safe snapshot from full PlayerRecord[].
 */
export function createSaveHistoryPoint(params: {
  saveName: string;
  inGameDate: string;
  clubName: string;
  players: PlayerRecord[];
  balance?: string;
  leaguePosition?: number | null;
  capturedAt?: string;
}): SaveHistoryPoint {
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
    }));

  return {
    cacheKey: buildSaveCacheKey(params.saveName, params.inGameDate),
    saveName: params.saveName,
    inGameDate: params.inGameDate,
    clubName: params.clubName,
    capturedAt: params.capturedAt ?? new Date().toISOString(),
    balance: params.balance,
    leaguePosition: params.leaguePosition ?? null,
    players,
  };
}

/**
 * Compares two save history points to compute player growth deltas and detect
 * newly appeared players (Youth Intake Radar).
 */
export function diffSaveHistoryPoints(
  previous: SaveHistoryPoint,
  current: SaveHistoryPoint
): SnapshotDiffSummary {
  const prevByUid = new Map<number, CompactPlayerSnapshot>();
  for (const p of previous.players) {
    prevByUid.set(p.uid, p);
  }

  const risers: PlayerGrowthDelta[] = [];
  const fallers: PlayerGrowthDelta[] = [];
  const newgens: PlayerGrowthDelta[] = [];

  for (const curr of current.players) {
    const prev = prevByUid.get(curr.uid);
    if (!prev) {
      newgens.push({
        uid: curr.uid,
        name: curr.name,
        position: curr.position,
        age: curr.age,
        abilityDelta: 0,
        potentialDelta: 0,
        valueDelta: curr.marketValue,
        isNewgen: true,
      });
      continue;
    }

    const abilityDelta = Number((curr.ability - prev.ability).toFixed(2));
    const potentialDelta = Number((curr.potential - prev.potential).toFixed(2));
    const valueDelta =
      curr.marketValue != null && prev.marketValue != null
        ? curr.marketValue - prev.marketValue
        : null;

    if (abilityDelta > 0) {
      risers.push({
        uid: curr.uid,
        name: curr.name,
        position: curr.position,
        age: curr.age,
        abilityDelta,
        potentialDelta,
        valueDelta,
        isNewgen: false,
      });
    } else if (abilityDelta < 0) {
      fallers.push({
        uid: curr.uid,
        name: curr.name,
        position: curr.position,
        age: curr.age,
        abilityDelta,
        potentialDelta,
        valueDelta,
        isNewgen: false,
      });
    }
  }

  risers.sort((a, b) => b.abilityDelta - a.abilityDelta);
  fallers.sort((a, b) => a.abilityDelta - b.abilityDelta);
  newgens.sort((a, b) => a.age - b.age || b.uid - a.uid);

  return {
    fromDate: previous.inGameDate,
    toDate: current.inGameDate,
    totalTracked: current.players.length,
    risers,
    fallers,
    newgens,
  };
}

function openSaveCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
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
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putCachedSavePayload<T>(
  saveName: string,
  inGameDate: string,
  payload: T
): Promise<boolean> {
  const db = await openSaveCacheDb();
  if (!db) return false;
  const key = buildSaveCacheKey(saveName, inGameDate);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(SAVE_CACHE_STORE, 'readwrite');
      tx.objectStore(SAVE_CACHE_STORE).put(
        { key, cachedAt: new Date().toISOString(), payload },
        key
      );
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

export async function getCachedSavePayload<T>(
  saveName: string,
  inGameDate: string
): Promise<T | null> {
  const db = await openSaveCacheDb();
  if (!db) return null;
  const key = buildSaveCacheKey(saveName, inGameDate);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(SAVE_CACHE_STORE, 'readonly');
      const req = tx.objectStore(SAVE_CACHE_STORE).get(key);
      req.onsuccess = () => {
        const record = req.result as { payload?: T } | undefined;
        db.close();
        resolve(record?.payload ?? null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}
