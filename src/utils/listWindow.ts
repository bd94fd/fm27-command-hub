/**
 * Shared windowing helpers for long lists.
 *
 * A save can carry hundreds of matches, shortlisted players and squad rows. Rendering
 * every item at once puts thousands of nodes in the DOM and blocks the main thread on a
 * phone, so each list shows a page and grows on request.
 */

export function takeLeadingWindow<T>(items: readonly T[], limit: number): readonly T[] {
  if (!Number.isFinite(limit) || limit >= items.length) return items;
  return items.slice(0, Math.max(0, limit));
}

/** Keeps the most recent items, for charts that plot a fixed number of points. */
export function takeTrailingWindow<T>(items: readonly T[], limit: number): readonly T[] {
  if (!Number.isFinite(limit) || limit >= items.length) return items;
  return items.slice(Math.max(0, items.length - Math.max(0, limit)));
}

export function nextWindowLimit(current: number, step: number, total: number): number {
  return Math.min(total, Math.max(0, current) + Math.max(0, step));
}
