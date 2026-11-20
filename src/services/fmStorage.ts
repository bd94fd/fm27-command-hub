/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatchLogEntry, PlayerRecord } from '../types/fm27';
import { HydratedSaveState } from '../utils/fmSaveHydrator';

export const FM27_STORAGE_KEY = 'fm27_command_hub_state_v1';
export const FM27_PREVIOUS_KEY = 'fm27_command_hub_prev_snapshot_v1';

export interface FmHubPersistedState {
  version: number;
  lastSyncedAt: string; // ISO string
  saveDate: string;
  nextFixture: string;
  leagueStandingSub: string;
  wageSpend: string;
  balance: string;
  clubName?: string;
  players: PlayerRecord[];
  matches: MatchLogEntry[];
  hydratedFmSave: HydratedSaveState | null;
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

/**
 * Safely load persisted state from localStorage.
 * Returns null if no state exists or if parsing fails.
 */
export function loadPersistedFmState(): FmHubPersistedState | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(FM27_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as FmHubPersistedState;
    if (!parsed || !Array.isArray(parsed.players) || !Array.isArray(parsed.matches)) {
      return null;
    }

    return parsed;
  } catch (err) {
    console.warn('Failed to load persisted FM27 state from localStorage:', err);
    return null;
  }
}

/**
 * Safely persist current state into localStorage.
 */
export function savePersistedFmState(
  state: Omit<FmHubPersistedState, 'version' | 'lastSyncedAt'>
): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }

  try {
    const payload: FmHubPersistedState = {
      ...state,
      version: 1,
      lastSyncedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(FM27_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.warn('Failed to save FM27 state to localStorage:', err);
    return false;
  }
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
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(FM27_STORAGE_KEY);
    window.localStorage.removeItem(FM27_PREVIOUS_KEY);
  } catch (err) {
    console.warn('Failed to clear FM27 state from localStorage:', err);
  }
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
    const parsed = JSON.parse(jsonString) as FmHubPersistedState;
    if (!parsed || !Array.isArray(parsed.players) || !Array.isArray(parsed.matches)) {
      throw new Error('Invalid FM27 backup schema');
    }
    savePersistedFmState(parsed);
    return parsed;
  } catch (err) {
    console.error('Failed to import FM27 state backup:', err);
    return null;
  }
}
