/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FmHubPersistedState } from '../services/fmStorage';

/** True when a persisted snapshot actually carries user data worth restoring. */
export function hasPersistedContent(
  state: FmHubPersistedState | null | undefined
): state is FmHubPersistedState {
  if (!state) return false;
  return (
    state.players.length > 0 ||
    state.matches.length > 0 ||
    (state.staff?.length ?? 0) > 0 ||
    (state.recruitmentCases?.length ?? 0) > 0 ||
    (state.shortlists?.length ?? 0) > 0 ||
    Boolean(state.hydratedFmSave)
  );
}

/**
 * Recency of a persisted snapshot. `lastSyncedAt` is stamped on every write;
 * `decodedAtIso` is the fallback for payloads written before that field existed.
 * Returns 0 when no usable timestamp is present.
 */
export function persistedStateTimestamp(
  state: FmHubPersistedState | null | undefined
): number {
  if (!state) return 0;
  const candidates = [
    state.lastSyncedAt,
    state.hydratedFmSave?.decodedPayload?.meta?.decodedAtIso,
  ];
  for (const value of candidates) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

/**
 * An IndexedDB snapshot may only replace the localStorage session when it is
 * strictly newer and non-empty, so a stale cache can never roll state back.
 */
export function isIndexedDbSnapshotNewer(
  idbState: FmHubPersistedState | null | undefined,
  localState: FmHubPersistedState | null | undefined
): boolean {
  if (!hasPersistedContent(idbState)) return false;
  return persistedStateTimestamp(idbState) > persistedStateTimestamp(localState);
}
