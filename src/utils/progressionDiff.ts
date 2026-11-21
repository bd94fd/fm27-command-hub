/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PlayerRecord } from '../types/fm27';

export const FM27_PROGRESSION_ARCHIVE_KEY =
  'fm27_command_hub_progression_archive_v1';
export const MAX_PROGRESSION_SNAPSHOTS = 30;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PlayerProgressionSnapshot {
  uid: number;
  name: string;
  position: string;
  age: number;
  attributes: Record<string, number>;
}

export interface ProgressionSnapshot {
  saveDate: string;
  clubName: string;
  capturedAt: string;
  players: Record<number, PlayerProgressionSnapshot>;
}

export interface AttributeDeltaEntry {
  uid: number;
  playerName: string;
  position: string;
  age: number;
  attributeName: string;
  fromValue: number;
  toValue: number;
  delta: number;
}

export interface PlayerProgressionSummary {
  uid: number;
  playerName: string;
  position: string;
  age: number;
  netDelta: number;
  totalRises: number;
  totalFalls: number;
  deltas: AttributeDeltaEntry[];
}

export interface YouthIntakeFlag {
  uid: number;
  playerName: string;
  position: string;
  age: number;
  isYouthIntakeHighlight: boolean;
  determination: number;
  pace: number;
}

export interface ProgressionDiffReport {
  baselineSaveDate: string;
  latestSaveDate: string;
  risers: AttributeDeltaEntry[];
  fallers: AttributeDeltaEntry[];
  playerSummaries: PlayerProgressionSummary[];
  mentoringDeterminationJumps: AttributeDeltaEntry[];
  newgenRadar: YouthIntakeFlag[];
  youthIntakeHighlights: YouthIntakeFlag[];
}

function getDefaultStorage(): StorageLike | null {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    try {
      return globalThis.localStorage;
    } catch {
      return null;
    }
  }
  return null;
}

function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  if (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
  ) {
    return true;
  }
  if (e.code === 22 || e.code === 1014) {
    return true;
  }
  if (
    typeof e.message === 'string' &&
    e.message.toLowerCase().includes('quota')
  ) {
    return true;
  }
  return false;
}

/**
 * Extracts only numeric camelCase attributes (1-20) from a PlayerRecord.
 * Explicitly excludes any raw CA/PA fields.
 */
function extractNumericCamelCaseAttributes(
  attrs: PlayerRecord['attributes'] | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!attrs || typeof attrs !== 'object') return out;
  for (const [key, val] of Object.entries(attrs)) {
    if (key.includes('_')) continue;
    const lower = key.toLowerCase();
    if (
      lower === 'ca' ||
      lower === 'pa' ||
      lower === 'currentability' ||
      lower === 'potentialability'
    ) {
      continue;
    }
    if (typeof val === 'number' && Number.isFinite(val)) {
      out[key] = val;
    }
  }
  return out;
}

/**
 * Builds a compact progression snapshot keyed by numeric player `uid`.
 */
export function buildProgressionSnapshot(
  saveDate: string,
  clubName: string,
  players: PlayerRecord[],
  capturedAt: string = new Date().toISOString()
): ProgressionSnapshot {
  const playersByUid: Record<number, PlayerProgressionSnapshot> = {};

  for (const p of players) {
    if (typeof p.uid !== 'number' || !Number.isFinite(p.uid) || p.uid <= 0) {
      continue;
    }
    playersByUid[p.uid] = {
      uid: p.uid,
      name: p.name,
      position: p.position,
      age: p.age,
      attributes: extractNumericCamelCaseAttributes(p.attributes),
    };
  }

  return {
    saveDate: saveDate.trim() || 'Unknown Date',
    clubName: clubName.trim() || 'Managed Club',
    capturedAt,
    players: playersByUid,
  };
}

/**
 * Loads the rolling progression snapshot archive from storage.
 */
export function loadProgressionArchive(
  storage?: StorageLike | null
): ProgressionSnapshot[] {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return [];

  try {
    const raw = store.getItem(FM27_PROGRESSION_ARCHIVE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ProgressionSnapshot =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof item.saveDate === 'string' &&
        Boolean(item.players) &&
        typeof item.players === 'object'
    );
  } catch {
    return [];
  }
}

/**
 * Persists the rolling progression archive, capping at 30 entries and
 * automatically pruning the oldest entries if `QuotaExceededError` is thrown.
 */
export function saveProgressionArchive(
  archive: ProgressionSnapshot[],
  storage?: StorageLike | null
): { saved: boolean; prunedCount: number; count: number } {
  const store = storage === undefined ? getDefaultStorage() : storage;
  const working = archive.slice(-MAX_PROGRESSION_SNAPSHOTS);
  let prunedCount = Math.max(0, archive.length - working.length);

  if (!store) {
    return { saved: false, prunedCount, count: working.length };
  }

  while (working.length > 0) {
    try {
      store.setItem(FM27_PROGRESSION_ARCHIVE_KEY, JSON.stringify(working));
      return { saved: true, prunedCount, count: working.length };
    } catch (err) {
      if (isQuotaExceededError(err)) {
        working.shift();
        prunedCount += 1;
      } else {
        return { saved: false, prunedCount, count: working.length };
      }
    }
  }

  try {
    store.setItem(FM27_PROGRESSION_ARCHIVE_KEY, JSON.stringify([]));
  } catch {
    // ignore
  }
  return { saved: false, prunedCount, count: 0 };
}

/**
 * Captures a new snapshot into the 30-save rolling archive, deduplicating by
 * `saveDate` and auto-pruning oldest entries on quota exhaustion.
 */
export function captureProgressionSnapshot(
  saveDate: string,
  clubName: string,
  players: PlayerRecord[],
  storage?: StorageLike | null,
  capturedAt?: string
): {
  archive: ProgressionSnapshot[];
  saved: boolean;
  prunedCount: number;
} {
  const snapshot = buildProgressionSnapshot(
    saveDate,
    clubName,
    players,
    capturedAt
  );
  if (Object.keys(snapshot.players).length === 0) {
    const existing = loadProgressionArchive(storage);
    return { archive: existing, saved: false, prunedCount: 0 };
  }

  const existing = loadProgressionArchive(storage);
  const normalizedDate = snapshot.saveDate.toLowerCase();
  const deduped = existing.filter(
    (entry) => entry.saveDate.trim().toLowerCase() !== normalizedDate
  );
  deduped.push(snapshot);

  const capped = deduped.slice(-MAX_PROGRESSION_SNAPSHOTS);
  const result = saveProgressionArchive(capped, storage);

  const finalArchive =
    result.count < capped.length
      ? capped.slice(capped.length - result.count)
      : capped;

  return {
    archive: finalArchive,
    saved: result.saved,
    prunedCount: result.prunedCount,
  };
}

/**
 * Clears the progression snapshot archive from storage.
 */
export function clearProgressionArchive(storage?: StorageLike | null): void {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return;
  try {
    store.removeItem(FM27_PROGRESSION_ARCHIVE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Computes attribute risers/fallers, Mentoring Determination Jumps
 * (`attributeName === 'determination'` and `delta >= 2`), and Youth Intake /
 * Newgen Radar (brand-new `uid` entries since baseline, highlighting `age <= 18`).
 */
export function computeProgressionDiff(
  baseline: ProgressionSnapshot,
  latest: ProgressionSnapshot
): ProgressionDiffReport {
  const risers: AttributeDeltaEntry[] = [];
  const fallers: AttributeDeltaEntry[] = [];
  const mentoringDeterminationJumps: AttributeDeltaEntry[] = [];
  const playerSummaries: PlayerProgressionSummary[] = [];
  const newgenRadar: YouthIntakeFlag[] = [];

  const baselinePlayers = baseline.players || {};
  const latestPlayers = latest.players || {};

  for (const latestPlayer of Object.values(latestPlayers)) {
    const uid = latestPlayer.uid;
    const basePlayer = baselinePlayers[uid];

    if (!basePlayer) {
      newgenRadar.push({
        uid,
        playerName: latestPlayer.name,
        position: latestPlayer.position,
        age: latestPlayer.age,
        isYouthIntakeHighlight: latestPlayer.age <= 18,
        determination: latestPlayer.attributes.determination ?? 0,
        pace: latestPlayer.attributes.pace ?? 0,
      });
      continue;
    }

    const playerDeltas: AttributeDeltaEntry[] = [];
    let totalRises = 0;
    let totalFalls = 0;

    for (const [attrName, toVal] of Object.entries(latestPlayer.attributes)) {
      const fromVal = basePlayer.attributes[attrName];
      if (typeof fromVal !== 'number' || typeof toVal !== 'number') continue;
      const delta = toVal - fromVal;
      if (delta === 0) continue;

      const entry: AttributeDeltaEntry = {
        uid,
        playerName: latestPlayer.name,
        position: latestPlayer.position,
        age: latestPlayer.age,
        attributeName: attrName,
        fromValue: fromVal,
        toValue: toVal,
        delta,
      };

      playerDeltas.push(entry);

      if (delta > 0) {
        risers.push(entry);
        totalRises += delta;
        if (attrName === 'determination' && delta >= 2) {
          mentoringDeterminationJumps.push(entry);
        }
      } else {
        fallers.push(entry);
        totalFalls += Math.abs(delta);
      }
    }

    if (playerDeltas.length > 0) {
      playerDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      playerSummaries.push({
        uid,
        playerName: latestPlayer.name,
        position: latestPlayer.position,
        age: latestPlayer.age,
        netDelta: totalRises - totalFalls,
        totalRises,
        totalFalls,
        deltas: playerDeltas,
      });
    }
  }

  risers.sort(
    (a, b) => b.delta - a.delta || a.playerName.localeCompare(b.playerName)
  );
  fallers.sort(
    (a, b) => a.delta - b.delta || a.playerName.localeCompare(b.playerName)
  );
  mentoringDeterminationJumps.sort(
    (a, b) => b.delta - a.delta || a.playerName.localeCompare(b.playerName)
  );
  playerSummaries.sort(
    (a, b) =>
      b.netDelta - a.netDelta || a.playerName.localeCompare(b.playerName)
  );
  newgenRadar.sort(
    (a, b) =>
      Number(b.isYouthIntakeHighlight) - Number(a.isYouthIntakeHighlight) ||
      a.age - b.age ||
      a.playerName.localeCompare(b.playerName)
  );

  return {
    baselineSaveDate: baseline.saveDate,
    latestSaveDate: latest.saveDate,
    risers,
    fallers,
    playerSummaries,
    mentoringDeterminationJumps,
    newgenRadar,
    youthIntakeHighlights: newgenRadar.filter((f) => f.isYouthIntakeHighlight),
  };
}
