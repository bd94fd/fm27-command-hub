/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalizeAnalystCitations } from '../utils/analystCitations';

export const FM27_CHAT_STORAGE_KEY = 'fm27_command_hub_chat_history_v1';
export const MAX_TURNS_PER_CLUB = 40;
export const MAX_STORED_CLUBS = 8;

export interface ChatTurnPayload {
  id: string;
  role: 'user' | 'assistant';
  userText?: string;
  imageNames?: string[];
  screenDetected?: string;
  inGameDate?: string;
  analysisMarkdown?: string;
  immediateClicks?: string[];
  followUpQuestions?: string[];
  sourceCitations?: string[];
  chronicleTitle?: string;
  chronicleOutcomeMetric?: string;
  eventNumber?: number;
  playerUpdatesApplied?: string[];
}

export interface StoredClubChatRecord {
  clubKey: string;
  updatedAt: string;
  turns: ChatTurnPayload[];
}

interface PersistedChatStore {
  version: 1;
  clubs: Record<string, StoredClubChatRecord>;
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const EMPTY_PLACEHOLDER_CLUBS = new Set([
  '',
  '--',
  'awaiting .fm save',
  'no club loaded',
  'unknown club',
  'unknown',
]);

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Private browsing or blocked storage
  }
  return null;
}

/**
 * Resolves a stable, normalized club key for per-club offline chat persistence.
 * Uses the normalized club name when available so CSV + .fm imports for the
 * same club share one continuous thread, falling back to clubUid or 'general'.
 */
export function resolveChatClubKey(
  clubName?: string | null,
  clubUid?: number | null
): string {
  const trimmedName = (clubName ?? '').trim();
  if (trimmedName && !EMPTY_PLACEHOLDER_CLUBS.has(trimmedName.toLowerCase())) {
    const slug = trimmedName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (slug) {
      return `club:${slug}`;
    }
  }

  if (typeof clubUid === 'number' && Number.isFinite(clubUid) && clubUid > 0) {
    return `club-uid:${Math.trunc(clubUid)}`;
  }

  return 'general';
}

function sanitizeStringArray(value: unknown, limit = 16): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, limit);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function sanitizePersistedTurn(raw: unknown): ChatTurnPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : null;
  const role = obj.role === 'user' || obj.role === 'assistant' ? obj.role : null;
  if (!id || !role) return null;

  const turn: ChatTurnPayload = { id, role };
  if (typeof obj.userText === 'string') turn.userText = obj.userText;
  const imageNames = sanitizeStringArray(obj.imageNames, 8);
  if (imageNames) turn.imageNames = imageNames;
  if (typeof obj.screenDetected === 'string') turn.screenDetected = obj.screenDetected;
  if (typeof obj.inGameDate === 'string') turn.inGameDate = obj.inGameDate;
  if (typeof obj.analysisMarkdown === 'string') turn.analysisMarkdown = obj.analysisMarkdown;
  const immediateClicks = sanitizeStringArray(obj.immediateClicks, 12);
  if (immediateClicks) turn.immediateClicks = immediateClicks;
  const followUpQuestions = sanitizeStringArray(obj.followUpQuestions, 8);
  if (followUpQuestions) turn.followUpQuestions = followUpQuestions;
  const sourceCitations = normalizeAnalystCitations(obj.sourceCitations, 10);
  if (sourceCitations.length > 0) turn.sourceCitations = sourceCitations;
  if (typeof obj.chronicleTitle === 'string') turn.chronicleTitle = obj.chronicleTitle;
  if (typeof obj.chronicleOutcomeMetric === 'string') {
    turn.chronicleOutcomeMetric = obj.chronicleOutcomeMetric;
  }
  if (typeof obj.eventNumber === 'number' && Number.isFinite(obj.eventNumber)) {
    turn.eventNumber = obj.eventNumber;
  }
  const playerUpdatesApplied = sanitizeStringArray(obj.playerUpdatesApplied, 24);
  if (playerUpdatesApplied) turn.playerUpdatesApplied = playerUpdatesApplied;

  return turn;
}

function readStore(storage: StorageLike | null): PersistedChatStore {
  if (!storage) {
    return { version: 1, clubs: {} };
  }
  try {
    const raw = storage.getItem(FM27_CHAT_STORAGE_KEY);
    if (!raw) return { version: 1, clubs: {} };
    const parsed = JSON.parse(raw) as Partial<PersistedChatStore> | null;
    if (!parsed || typeof parsed !== 'object' || !parsed.clubs || typeof parsed.clubs !== 'object') {
      return { version: 1, clubs: {} };
    }
    const clubs: Record<string, StoredClubChatRecord> = {};
    for (const [key, entry] of Object.entries(parsed.clubs)) {
      if (!entry || typeof entry !== 'object') continue;
      const rawTurns = Array.isArray(entry.turns) ? entry.turns : [];
      const sanitizedTurns = rawTurns
        .map((t) => sanitizePersistedTurn(t))
        .filter((t): t is ChatTurnPayload => t !== null)
        .slice(-MAX_TURNS_PER_CLUB);
      if (sanitizedTurns.length === 0) continue;
      clubs[key] = {
        clubKey: key,
        updatedAt:
          typeof entry.updatedAt === 'string' && entry.updatedAt
            ? entry.updatedAt
            : new Date(0).toISOString(),
        turns: sanitizedTurns,
      };
    }
    return { version: 1, clubs };
  } catch {
    return { version: 1, clubs: {} };
  }
}

function pruneClubs(clubs: Record<string, StoredClubChatRecord>): Record<string, StoredClubChatRecord> {
  const entries = Object.values(clubs)
    .filter((rec) => rec.turns.length > 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_STORED_CLUBS);

  const next: Record<string, StoredClubChatRecord> = {};
  for (const entry of entries) {
    next[entry.clubKey] = entry;
  }
  return next;
}

function writeStoreWithRetry(storage: StorageLike | null, store: PersistedChatStore): boolean {
  if (!storage) return false;
  const prunedStore: PersistedChatStore = {
    version: 1,
    clubs: pruneClubs(store.clubs),
  };

  if (Object.keys(prunedStore.clubs).length === 0) {
    try {
      storage.removeItem(FM27_CHAT_STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  try {
    storage.setItem(FM27_CHAT_STORAGE_KEY, JSON.stringify(prunedStore));
    return true;
  } catch {
    // QuotaExceededError fallback: trim each club to latest 10 turns and keep newest 3 clubs
    try {
      const compactClubs: Record<string, StoredClubChatRecord> = {};
      const newest = Object.values(prunedStore.clubs)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 3);
      for (const entry of newest) {
        compactClubs[entry.clubKey] = {
          ...entry,
          turns: entry.turns.slice(-10),
        };
      }
      storage.setItem(
        FM27_CHAT_STORAGE_KEY,
        JSON.stringify({ version: 1, clubs: compactClubs })
      );
      return true;
    } catch {
      return false;
    }
  }
}

export function loadClubChatHistory(
  clubKey: string,
  storage: StorageLike | null = getDefaultStorage()
): ChatTurnPayload[] {
  if (!clubKey) return [];
  const store = readStore(storage);
  return store.clubs[clubKey]?.turns ?? [];
}

export function saveClubChatHistory(
  clubKey: string,
  turns: ChatTurnPayload[],
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!clubKey) return false;
  const store = readStore(storage);
  const sanitized = turns
    .map((t) => sanitizePersistedTurn(t))
    .filter((t): t is ChatTurnPayload => t !== null)
    .slice(-MAX_TURNS_PER_CLUB);

  if (sanitized.length === 0) {
    delete store.clubs[clubKey];
  } else {
    store.clubs[clubKey] = {
      clubKey,
      updatedAt: new Date().toISOString(),
      turns: sanitized,
    };
  }
  return writeStoreWithRetry(storage, store);
}

export function clearClubChatHistory(
  clubKey: string,
  storage: StorageLike | null = getDefaultStorage()
): void {
  if (!clubKey) return;
  const store = readStore(storage);
  if (!(clubKey in store.clubs)) return;
  delete store.clubs[clubKey];
  writeStoreWithRetry(storage, store);
}

export function clearAllChatHistory(
  storage: StorageLike | null = getDefaultStorage()
): void {
  if (!storage) return;
  try {
    storage.removeItem(FM27_CHAT_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function listStoredChatClubs(
  storage: StorageLike | null = getDefaultStorage()
): Array<{ clubKey: string; turnCount: number; updatedAt: string }> {
  const store = readStore(storage);
  return Object.values(store.clubs)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((entry) => ({
      clubKey: entry.clubKey,
      turnCount: entry.turns.length,
      updatedAt: entry.updatedAt,
    }));
}
