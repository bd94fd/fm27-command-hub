/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MatchLogEntry,
  PlayerRecord,
  RecruitmentCase,
  ShortlistRecord,
  StaffRecord,
} from '../types/fm27';
import { RecruitmentTarget } from '../types/fmSave';
import { HydratedSaveState } from '../utils/fmSaveHydrator';

import { FormationPresetKey } from '../utils/bestXiSolver';

export const FM27_STORAGE_KEY = 'fm27_command_hub_state_v1';
export const FM27_PREVIOUS_KEY = 'fm27_command_hub_prev_snapshot_v1';
export const FM27_TRACKED_TARGETS_KEY = 'fm27_command_hub_tracked_targets_v1';
export const CURRENT_SCHEMA_VERSION = 2;

export interface PersistedCustomSlot {
  slotId: string;
  playerId?: string | null;
  ipRole: string;
  oopRole: string;
}

export interface ArchivedSaveSnapshot {
  id: string;
  saveDate: string;
  clubName: string;
  savedAt: string;
  playersCount: number;
  matchesCount: number;
}

export interface FmHubPersistedState {
  version: number;
  schemaVersion?: number;
  lastSyncedAt: string; // ISO string
  saveDate: string;
  nextFixture: string;
  leagueStandingSub: string;
  wageSpend: string;
  balance: string;
  clubName?: string;
  players: PlayerRecord[];
  matches: MatchLogEntry[];
  staff?: StaffRecord[];
  recruitmentCases?: RecruitmentCase[];
  shortlists?: ShortlistRecord[];
  hydratedFmSave: HydratedSaveState | null;
  // Pass 2 (v2.1) additive tactical builder & snapshot archive fields
  activeShape?: FormationPresetKey;
  customSlots?: PersistedCustomSlot[];
  applyToAnalystOnly?: boolean;
  archivedSaveSnapshots?: ArchivedSaveSnapshot[];
}

export interface FmHubPreviousSnapshot {
  saveDate: string;
  savedAt: string;
  playersCount: number;
  matchesCount: number;
  playersSnapshot: Array<{
    name: string;
    position: string;
    goals: number;
    assists: number;
    minutes: number;
    rating: number | null;
    attributes: PlayerRecord['attributes'];
  }>;
}

export interface StateSchemaValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_SHAPES = new Set<string>([
  '4-3-3 DM Wide',
  '4-2-3-1 DM AM Wide',
  '4-4-2',
  '3-4-2-1',
]);

/**
 * Validates raw persisted or imported JSON against the FM27 Command Hub v1/v2 schema.
 */
export function validateStateSchema(raw: unknown): StateSchemaValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['Root payload must be a JSON object'] };
  }

  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.players)) {
    errors.push('Missing or invalid "players" array');
  }
  if (!Array.isArray(obj.matches)) {
    errors.push('Missing or invalid "matches" array');
  }
  if (
    obj.schemaVersion !== undefined &&
    (typeof obj.schemaVersion !== 'number' ||
      !Number.isInteger(obj.schemaVersion) ||
      obj.schemaVersion < 1)
  ) {
    errors.push('Invalid "schemaVersion" (must be a positive integer)');
  }
  if (
    obj.activeShape !== undefined &&
    (typeof obj.activeShape !== 'string' || !VALID_SHAPES.has(obj.activeShape))
  ) {
    errors.push(`Unsupported "activeShape": ${String(obj.activeShape)}`);
  }
  if (obj.customSlots !== undefined) {
    if (!Array.isArray(obj.customSlots)) {
      errors.push('"customSlots" must be an array');
    } else {
      for (const slot of obj.customSlots) {
        if (
          !slot ||
          typeof slot !== 'object' ||
          typeof (slot as PersistedCustomSlot).slotId !== 'string' ||
          typeof (slot as PersistedCustomSlot).ipRole !== 'string' ||
          typeof (slot as PersistedCustomSlot).oopRole !== 'string'
        ) {
          errors.push('Each entry in "customSlots" must have string slotId, ipRole, and oopRole');
          break;
        }
      }
    }
  }
  if (
    obj.applyToAnalystOnly !== undefined &&
    typeof obj.applyToAnalystOnly !== 'boolean'
  ) {
    errors.push('"applyToAnalystOnly" must be a boolean');
  }
  if (
    obj.archivedSaveSnapshots !== undefined &&
    !Array.isArray(obj.archivedSaveSnapshots)
  ) {
    errors.push('"archivedSaveSnapshots" must be an array');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Migrates v1 (or partial v2) persisted state cleanly to schemaVersion 2
 * without losing any existing fields.
 */
export function migratePersistedState(raw: unknown): FmHubPersistedState | null {
  const validation = validateStateSchema(raw);
  if (!validation.valid) return null;

  const parsed = raw as Partial<FmHubPersistedState>;
  const activeShape: FormationPresetKey =
    parsed.activeShape && VALID_SHAPES.has(parsed.activeShape)
      ? parsed.activeShape
      : '4-3-3 DM Wide';

  const customSlots: PersistedCustomSlot[] = Array.isArray(parsed.customSlots)
    ? parsed.customSlots.filter(
        (s): s is PersistedCustomSlot =>
          Boolean(s) &&
          typeof s.slotId === 'string' &&
          typeof s.ipRole === 'string' &&
          typeof s.oopRole === 'string'
      )
    : [];

  const archivedSaveSnapshots: ArchivedSaveSnapshot[] = Array.isArray(
    parsed.archivedSaveSnapshots
  )
    ? parsed.archivedSaveSnapshots.filter(
        (snap): snap is ArchivedSaveSnapshot =>
          Boolean(snap) &&
          typeof snap.id === 'string' &&
          typeof snap.saveDate === 'string'
      )
    : [];

  return {
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    lastSyncedAt:
      typeof parsed.lastSyncedAt === 'string'
        ? parsed.lastSyncedAt
        : new Date().toISOString(),
    saveDate: typeof parsed.saveDate === 'string' ? parsed.saveDate : '--',
    nextFixture: typeof parsed.nextFixture === 'string' ? parsed.nextFixture : '--',
    leagueStandingSub:
      typeof parsed.leagueStandingSub === 'string' ? parsed.leagueStandingSub : '--',
    wageSpend: typeof parsed.wageSpend === 'string' ? parsed.wageSpend : '--',
    balance: typeof parsed.balance === 'string' ? parsed.balance : '--',
    clubName: parsed.clubName,
    players: Array.isArray(parsed.players) ? parsed.players : [],
    matches: Array.isArray(parsed.matches) ? parsed.matches : [],
    staff: Array.isArray(parsed.staff) ? parsed.staff : [],
    recruitmentCases: Array.isArray(parsed.recruitmentCases)
      ? parsed.recruitmentCases
      : [],
    shortlists: Array.isArray(parsed.shortlists) ? parsed.shortlists : [],
    hydratedFmSave: parsed.hydratedFmSave ?? null,
    activeShape,
    customSlots,
    applyToAnalystOnly: Boolean(parsed.applyToAnalystOnly),
    archivedSaveSnapshots,
  };
}

/**
 * Safely load persisted state from localStorage.
 * Automatically migrates v1 state to schemaVersion 2.
 * Returns null if no state exists or if parsing fails.
 */
export function loadPersistedFmState(): FmHubPersistedState | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(FM27_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return migratePersistedState(parsed);
  } catch (err) {
    console.warn('Failed to load persisted FM27 state from localStorage:', err);
    return null;
  }
}

/**
 * Safely persist current state into localStorage (with schemaVersion: 2).
 */
export function savePersistedFmState(
  state: Omit<FmHubPersistedState, 'version' | 'lastSyncedAt'>
): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }

  const buildPayload = (maxTargets?: number): FmHubPersistedState => {
    let compactHydrated = state.hydratedFmSave;
    if (compactHydrated) {
      const targets = Array.isArray(compactHydrated.recruitmentTargets)
        ? typeof maxTargets === 'number'
          ? compactHydrated.recruitmentTargets.slice(0, maxTargets)
          : compactHydrated.recruitmentTargets
        : [];
      compactHydrated = {
        ...compactHydrated,
        recruitmentTargets: targets,
        decodedPayload: compactHydrated.decodedPayload
          ? {
              ...compactHydrated.decodedPayload,
              // Avoid duplicating 500 scouted targets inside localStorage
              recruitmentTargets: [],
            }
          : compactHydrated.decodedPayload,
      };
    }
    return {
      ...state,
      hydratedFmSave: compactHydrated,
      version: 1,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      lastSyncedAt: new Date().toISOString(),
      activeShape: state.activeShape || '4-3-3 DM Wide',
      customSlots: Array.isArray(state.customSlots) ? state.customSlots : [],
      applyToAnalystOnly: Boolean(state.applyToAnalystOnly),
      archivedSaveSnapshots: Array.isArray(state.archivedSaveSnapshots)
        ? state.archivedSaveSnapshots
        : [],
    };
  };

  const fullPayload = buildPayload();
  void savePersistedFmStateToIndexedDb(fullPayload);

  try {
    window.localStorage.setItem(FM27_STORAGE_KEY, JSON.stringify(fullPayload));
    return true;
  } catch (err) {
    try {
      window.localStorage.setItem(FM27_STORAGE_KEY, JSON.stringify(buildPayload(150)));
      return true;
    } catch {
      console.warn('Failed to save FM27 state to localStorage:', err);
      return false;
    }
  }
}

const IDB_DB_NAME = 'fm27_command_hub_idb';
const IDB_STORE_NAME = 'hub_state';

function openFm27IndexedDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function savePersistedFmStateToIndexedDb(
  payload: FmHubPersistedState
): Promise<boolean> {
  const db = await openFm27IndexedDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      tx.objectStore(IDB_STORE_NAME).put(payload, FM27_STORAGE_KEY);
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

export async function loadPersistedFmStateFromIndexedDb(): Promise<FmHubPersistedState | null> {
  const db = await openFm27IndexedDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const req = tx.objectStore(IDB_STORE_NAME).get(FM27_STORAGE_KEY);
      req.onsuccess = () => {
        db.close();
        resolve(req.result ? migratePersistedState(req.result) : null);
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

export async function clearPersistedFmStateFromIndexedDb(): Promise<void> {
  const db = await openFm27IndexedDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      tx.objectStore(IDB_STORE_NAME).delete(FM27_STORAGE_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

/**
 * Save snapshot of previous state before applying a new save file.
 * Used for delta / progression comparison across matchdays.
 */
export function recordPreviousSnapshot(
  saveDate: string,
  players: PlayerRecord[],
  matches: MatchLogEntry[]
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (players.length === 0 && matches.length === 0) return;

  try {
    const snapshot: FmHubPreviousSnapshot = {
      saveDate,
      savedAt: new Date().toISOString(),
      playersCount: players.length,
      matchesCount: matches.length,
      playersSnapshot: players.map((p) => ({
        name: p.name,
        position: p.position,
        goals: p.goals,
        assists: p.assists,
        minutes: p.minutes,
        rating: p.rating,
        attributes: { ...p.attributes },
      })),
    };
    window.localStorage.setItem(FM27_PREVIOUS_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('Failed to save previous FM27 snapshot:', err);
  }
}

/**
 * Load the previous snapshot for delta comparison.
 */
export function loadPreviousSnapshot(): FmHubPreviousSnapshot | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(FM27_PREVIOUS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FmHubPreviousSnapshot;
  } catch (err) {
    return null;
  }
}

/**
 * Completely wipe stored save memory to return to clean "Awaiting .fm Save" state.
 */
export function clearPersistedFmState(): void {
  void clearPersistedFmStateFromIndexedDb();
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(FM27_STORAGE_KEY);
    window.localStorage.removeItem(FM27_PREVIOUS_KEY);
    window.localStorage.removeItem(FM27_TRACKED_TARGETS_KEY);
  } catch (err) {
    console.warn('Failed to clear FM27 state from localStorage:', err);
  }
}

/**
 * Load persisted tracked Scouted Shortlist targets from localStorage.
 */
export function loadTrackedScoutTargets(): RecruitmentTarget[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(FM27_TRACKED_TARGETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecruitmentTarget =>
        Boolean(item) && typeof item === 'object' && typeof item.name === 'string'
    );
  } catch (err) {
    console.warn('Failed to load tracked scout targets from localStorage:', err);
    return [];
  }
}

/**
 * Save tracked Scouted Shortlist targets to localStorage.
 */
export function saveTrackedScoutTargets(targets: RecruitmentTarget[]): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }
  try {
    window.localStorage.setItem(FM27_TRACKED_TARGETS_KEY, JSON.stringify(targets));
    return true;
  } catch (err) {
    console.warn('Failed to save tracked scout targets to localStorage:', err);
    return false;
  }
}

export function isScoutTargetTracked(
  targets: RecruitmentTarget[],
  target: Pick<RecruitmentTarget, 'uid' | 'name'>
): boolean {
  const normName = target.name.trim().toLowerCase();
  return targets.some(
    (t) =>
      (typeof target.uid === 'number' && target.uid > 0 && t.uid === target.uid) ||
      t.name.trim().toLowerCase() === normName
  );
}

/**
 * Toggle a scouted target in the persisted Shortlist.
 * Returns the updated list and whether the target is now tracked (`true`) or untracked (`false`).
 */
export function toggleTrackedScoutTarget(
  target: RecruitmentTarget,
  currentList?: RecruitmentTarget[]
): { targets: RecruitmentTarget[]; tracked: boolean } {
  const existing = Array.isArray(currentList)
    ? currentList
    : loadTrackedScoutTargets();
  const normName = target.name.trim().toLowerCase();
  const matchIdx = existing.findIndex(
    (t) =>
      (typeof target.uid === 'number' && target.uid > 0 && t.uid === target.uid) ||
      t.name.trim().toLowerCase() === normName
  );

  let next: RecruitmentTarget[];
  let tracked: boolean;
  if (matchIdx >= 0) {
    next = existing.filter((_, idx) => idx !== matchIdx);
    tracked = false;
  } else {
    next = [target, ...existing];
    tracked = true;
  }

  saveTrackedScoutTargets(next);
  return { targets: next, tracked };
}

/**
 * Remove a tracked target by UID or name from the persisted Shortlist.
 */
export function removeTrackedScoutTarget(
  uidOrName: number | string,
  currentList?: RecruitmentTarget[]
): RecruitmentTarget[] {
  const existing = Array.isArray(currentList)
    ? currentList
    : loadTrackedScoutTargets();
  const next = existing.filter((t) => {
    if (typeof uidOrName === 'number') {
      return t.uid !== uidOrName;
    }
    return t.name.trim().toLowerCase() !== uidOrName.trim().toLowerCase();
  });
  saveTrackedScoutTargets(next);
  return next;
}

/**
 * Export saved state as a portable JSON backup string.
 */
export function exportFmStateBackupJson(): string | null {
  const state = loadPersistedFmState();
  if (!state) return null;
  return JSON.stringify(state, null, 2);
}

/**
 * Import and validate a portable JSON backup.
 */
export function importFmStateBackupJson(jsonString: string): FmHubPersistedState | null {
  try {
    const parsed = JSON.parse(jsonString);
    const migrated = migratePersistedState(parsed);
    if (!migrated) {
      throw new Error('Invalid FM27 backup schema');
    }
    savePersistedFmState(migrated);
    return migrated;
  } catch (err) {
    console.error('Failed to import FM27 state backup:', err);
    return null;
  }
}

/**
 * Pass 2 (v2.1): Export schemaVersion 2 portable JSON backup string.
 */
export function exportBackupJson(): string | null {
  return exportFmStateBackupJson();
}

/**
 * Pass 2 (v2.1): Import, validate, migrate to schemaVersion 2, and persist a JSON backup.
 */
export function importBackupJson(jsonString: string): {
  ok: boolean;
  state: FmHubPersistedState | null;
  errors: string[];
} {
  try {
    const parsed = JSON.parse(jsonString);
    const validation = validateStateSchema(parsed);
    if (!validation.valid) {
      return { ok: false, state: null, errors: validation.errors };
    }
    const migrated = migratePersistedState(parsed);
    if (!migrated) {
      return { ok: false, state: null, errors: ['Failed to migrate state payload'] };
    }
    savePersistedFmState(migrated);
    return { ok: true, state: migrated, errors: [] };
  } catch (err) {
    return {
      ok: false,
      state: null,
      errors: [err instanceof Error ? err.message : 'Invalid JSON backup'],
    };
  }
}
