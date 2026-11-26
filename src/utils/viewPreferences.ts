/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Small, separate store for view preferences and recent views. It is deliberately
 * not part of the save state blob, so clearing filters can never touch save data.
 */

export const VIEW_PREFS_KEY = 'fm27_view_prefs_v1';
export const RECENT_VIEWS_KEY = 'fm27_recent_views_v1';
export const RECENT_VIEW_LIMIT = 6;

export type ViewPreferenceKey =
  | 'squadView'
  | 'recruitmentView'
  | 'matchesSeason'
  | 'matchesCompetition';

const PREFERENCE_KEYS: ViewPreferenceKey[] = [
  'squadView',
  'recruitmentView',
  'matchesSeason',
  'matchesCompetition',
];

export type ViewPreferences = Partial<Record<ViewPreferenceKey, string>>;

export interface RecentView {
  /** In-app location, for example `?tab=matches` or `?tab=tactics&panel=pitch`. */
  href: string;
  label: string;
  visitedAt: number;
}

export interface ReadonlyStorage {
  getItem(key: string): string | null;
}

export interface WritableStorage extends ReadonlyStorage {
  setItem(key: string, value: string): void;
}

const isPreferenceKey = (value: string): value is ViewPreferenceKey =>
  (PREFERENCE_KEYS as string[]).includes(value);

/** Stored values are only ever short identifiers, never user text. */
const isSaneValue = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 40;

export function parseViewPreferences(raw: string | null): ViewPreferences {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: ViewPreferences = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (isPreferenceKey(key) && isSaneValue(value)) out[key] = value;
  }
  return out;
}

export function readViewPreferences(storage: ReadonlyStorage | null): ViewPreferences {
  if (!storage) return {};
  try {
    return parseViewPreferences(storage.getItem(VIEW_PREFS_KEY));
  } catch {
    return {};
  }
}

export function readViewPreference(
  storage: ReadonlyStorage | null,
  key: ViewPreferenceKey
): string | null {
  return readViewPreferences(storage)[key] ?? null;
}

export function writeViewPreference(
  storage: WritableStorage | null,
  key: ViewPreferenceKey,
  value: string
): void {
  if (!storage || !isSaneValue(value)) return;
  try {
    const current = readViewPreferences(storage);
    const next = { ...current, [key]: value };
    storage.setItem(VIEW_PREFS_KEY, JSON.stringify(next));
  } catch {
    // A full or blocked storage must not break the view.
  }
}

export function clearViewPreferences(storage: WritableStorage | null): void {
  if (!storage) return;
  try {
    storage.setItem(VIEW_PREFS_KEY, '{}');
  } catch {
    // ignore
  }
}

const isHref = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('?') && value.length <= 120;

export function parseRecentViews(raw: string | null): RecentView[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: RecentView[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const { href, label, visitedAt } = entry as Partial<RecentView>;
    if (!isHref(href)) continue;
    if (typeof label !== 'string' || label.length === 0 || label.length > 60) continue;
    if (typeof visitedAt !== 'number' || !Number.isFinite(visitedAt)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ href, label, visitedAt });
  }
  return out.slice(0, RECENT_VIEW_LIMIT);
}

/** Newest first, one entry per location, capped. */
export function recordRecentView(
  existing: RecentView[],
  entry: { href: string; label: string } & { visitedAt?: number },
  limit = RECENT_VIEW_LIMIT
): RecentView[] {
  const next: RecentView = {
    href: entry.href,
    label: entry.label,
    visitedAt: entry.visitedAt ?? Date.now(),
  };
  const withoutDuplicate = existing.filter((view) => view.href !== next.href);
  return [next, ...withoutDuplicate].slice(0, limit);
}

export function readRecentViews(storage: ReadonlyStorage | null): RecentView[] {
  if (!storage) return [];
  try {
    return parseRecentViews(storage.getItem(RECENT_VIEWS_KEY));
  } catch {
    return [];
  }
}

export function writeRecentViews(
  storage: WritableStorage | null,
  views: RecentView[]
): void {
  if (!storage) return;
  try {
    storage.setItem(RECENT_VIEWS_KEY, JSON.stringify(views.slice(0, RECENT_VIEW_LIMIT)));
  } catch {
    // ignore
  }
}

/** Browser storage, or null when it is unavailable (private mode, tests). */
export function browserViewStorage(): WritableStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
