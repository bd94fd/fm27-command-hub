/**
 * Decides when a running app should ask the browser for a newer service worker.
 *
 * The browser checks on navigation and on its own schedule, which is fine for a tab
 * that is opened and closed. An installed app on a phone is usually resumed from the
 * background instead, sometimes for days, so nothing asks for a new build and the
 * user keeps an old UI and an old decoder.
 */

export const FOREGROUND_UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Test and diagnostic override. A live browser test cannot wait thirty minutes, so it
 * sets `window.__FM27_PWA_UPDATE_INTERVAL_MS__ = 0` to check on every foreground visit.
 * Anything that is not a non-negative finite number is ignored.
 */
export function resolveForegroundUpdateIntervalMs(
  override: unknown = (globalThis as { __FM27_PWA_UPDATE_INTERVAL_MS__?: unknown })
    .__FM27_PWA_UPDATE_INTERVAL_MS__
): number {
  return typeof override === 'number' && Number.isFinite(override) && override >= 0
    ? override
    : FOREGROUND_UPDATE_CHECK_INTERVAL_MS;
}

export function isUpdateCheckDue(
  lastCheckMs: number,
  nowMs: number,
  intervalMs: number = FOREGROUND_UPDATE_CHECK_INTERVAL_MS
): boolean {
  if (!Number.isFinite(lastCheckMs)) return true;
  const elapsed = nowMs - lastCheckMs;
  // A clock that jumped backwards must not suppress checks indefinitely.
  return elapsed < 0 || elapsed >= intervalMs;
}
