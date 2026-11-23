/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { FmHubPersistedState } from '../services/fmStorage';
import {
  hasPersistedContent,
  isIndexedDbSnapshotNewer,
  persistedStateTimestamp,
} from './persistedStateRecency';

function makeState(
  overrides: Partial<FmHubPersistedState> = {}
): FmHubPersistedState {
  return {
    version: 1,
    schemaVersion: 2,
    lastSyncedAt: '2026-11-20T10:00:00.000Z',
    saveDate: '20/11/2026',
    nextFixture: 'vs Club B',
    leagueStandingSub: '3rd',
    wageSpend: '£10K/wk',
    balance: '£1M',
    players: [{ id: 'p1', name: 'Test Player' } as FmHubPersistedState['players'][number]],
    matches: [],
    hydratedFmSave: null,
    ...overrides,
  };
}

test('hasPersistedContent only reports snapshots with restorable data', () => {
  assert.equal(hasPersistedContent(null), false);
  assert.equal(
    hasPersistedContent(makeState({ players: [], matches: [] })),
    false
  );
  assert.equal(hasPersistedContent(makeState()), true);
  assert.equal(
    hasPersistedContent(
      makeState({ players: [], matches: [], staff: [{ id: 's1' } as never] })
    ),
    true
  );
  assert.equal(
    hasPersistedContent(
      makeState({
        players: [],
        matches: [],
        recruitmentCases: [{ id: 'rec-1' } as never],
      })
    ),
    true
  );
  assert.equal(
    hasPersistedContent(
      makeState({
        players: [],
        matches: [],
        shortlists: [{ id: 'sl-1' } as never],
      })
    ),
    true
  );
  assert.equal(
    hasPersistedContent(
      makeState({ players: [], matches: [], hydratedFmSave: {} as never })
    ),
    true
  );
});

test('persistedStateTimestamp prefers lastSyncedAt and falls back to decodedAtIso', () => {
  assert.equal(persistedStateTimestamp(null), 0);
  assert.equal(
    persistedStateTimestamp(makeState()),
    Date.parse('2026-11-20T10:00:00.000Z')
  );

  const withoutSyncStamp = makeState({
    lastSyncedAt: '',
    hydratedFmSave: {
      decodedPayload: { meta: { decodedAtIso: '2026-11-21T08:30:00.000Z' } },
    } as never,
  });
  assert.equal(
    persistedStateTimestamp(withoutSyncStamp),
    Date.parse('2026-11-21T08:30:00.000Z')
  );

  assert.equal(
    persistedStateTimestamp(makeState({ lastSyncedAt: 'not-a-date' })),
    0
  );
});

test('an older IndexedDB cache can never overwrite a newer localStorage session', () => {
  const newerLocal = makeState({ lastSyncedAt: '2026-11-22T12:00:00.000Z' });
  const olderIdb = makeState({ lastSyncedAt: '2026-11-21T12:00:00.000Z' });

  assert.equal(isIndexedDbSnapshotNewer(olderIdb, newerLocal), false);
  assert.equal(isIndexedDbSnapshotNewer(newerLocal, olderIdb), true);
});

test('equal timestamps keep the localStorage session authoritative', () => {
  const local = makeState();
  const idb = makeState();
  assert.equal(isIndexedDbSnapshotNewer(idb, local), false);
});

test('IndexedDB restores when localStorage is missing or older, but never when empty', () => {
  const idb = makeState({ lastSyncedAt: '2026-11-22T12:00:00.000Z' });
  assert.equal(isIndexedDbSnapshotNewer(idb, null), true);

  const emptyIdb = makeState({
    lastSyncedAt: '2026-11-23T12:00:00.000Z',
    players: [],
    matches: [],
  });
  assert.equal(isIndexedDbSnapshotNewer(emptyIdb, null), false);

  const staleIdbWithoutTimestamp = makeState({ lastSyncedAt: '' });
  assert.equal(isIndexedDbSnapshotNewer(staleIdbWithoutTimestamp, makeState()), false);
  assert.equal(isIndexedDbSnapshotNewer(staleIdbWithoutTimestamp, null), false);
});
