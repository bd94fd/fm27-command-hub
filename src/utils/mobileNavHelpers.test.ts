import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLocalCacheStatusSummary,
  formatCacheBytes,
  getMobileTabAction,
  resolveMobileNavHighlight,
} from './mobileNavHelpers';

test('resolveMobileNavHighlight highlights primary tabs and maps secondary tabs to More', () => {
  assert.equal(resolveMobileNavHighlight('sync', false), 'sync');
  assert.equal(resolveMobileNavHighlight('squad', false), 'squad');
  assert.equal(resolveMobileNavHighlight('tactics', false), 'tactics');
  assert.equal(resolveMobileNavHighlight('setpieces', false), 'tactics');
  assert.equal(resolveMobileNavHighlight('recruitment', false), 'recruitment');
  assert.equal(resolveMobileNavHighlight('matches', false), 'more');
  assert.equal(resolveMobileNavHighlight('staff', false), 'more');

  // While More sheet is open, More stays highlighted regardless of active tab
  assert.equal(resolveMobileNavHighlight('squad', true), 'more');
  assert.equal(resolveMobileNavHighlight('sync', true), 'more');
});

test('getMobileTabAction scrolls to top when tapping active primary tab and switches otherwise', () => {
  assert.deepEqual(getMobileTabAction('more', 'sync', false), {
    kind: 'toggle-more',
  });
  assert.deepEqual(getMobileTabAction('more', 'matches', true), {
    kind: 'toggle-more',
  });

  // Tapping active primary tab scrolls to top without resetting sub-tabs
  assert.deepEqual(getMobileTabAction('squad', 'squad', false), {
    kind: 'scroll-top',
    closeMore: false,
  });
  assert.deepEqual(getMobileTabAction('tactics', 'setpieces', false), {
    kind: 'scroll-top',
    closeMore: false,
  });
  assert.deepEqual(getMobileTabAction('squad', 'squad', true), {
    kind: 'scroll-top',
    closeMore: true,
  });

  // Tapping a different primary tab switches and closes More if open
  assert.deepEqual(getMobileTabAction('tactics', 'squad', false), {
    kind: 'switch-tab',
    tab: 'tactics',
    closeMore: false,
  });
  assert.deepEqual(getMobileTabAction('recruitment', 'matches', true), {
    kind: 'switch-tab',
    tab: 'recruitment',
    closeMore: true,
  });
});

test('formatCacheBytes formats bytes, KB, MB, GB, and handles invalid inputs safely', () => {
  assert.equal(formatCacheBytes(null), '—');
  assert.equal(formatCacheBytes(undefined), '—');
  assert.equal(formatCacheBytes(-5), '—');
  assert.equal(formatCacheBytes(Number.NaN), '—');
  assert.equal(formatCacheBytes(0), '0 B');
  assert.equal(formatCacheBytes(512), '512 B');
  assert.equal(formatCacheBytes(2048), '2.0 KB');
  assert.equal(formatCacheBytes(250 * 1024), '250 KB');
  assert.equal(formatCacheBytes(4.5 * 1024 * 1024), '4.5 MB');
  assert.equal(formatCacheBytes(18 * 1024 * 1024), '18 MB');
  assert.equal(formatCacheBytes(1.5 * 1024 * 1024 * 1024), '1.50 GB');
});

test('buildLocalCacheStatusSummary respects Awaiting .fm Save empty state (zero fake data)', () => {
  const emptySummary = buildLocalCacheStatusSummary({
    hasLoadedSave: false,
    clubName: 'FM27 Command Hub',
    saveDate: '--',
    playersCount: 0,
    matchesCount: 0,
    staffCount: 0,
    isOnline: true,
    isRestoredFromMemory: false,
    cacheStats: {
      cachedSavesCount: 0,
      cachedBriefingsCount: 0,
      snapshotPointsCount: 0,
      indexedDbAvailable: true,
    },
    storageUsageBytes: null,
    storageQuotaBytes: null,
  });

  assert.equal(emptySummary.headline, 'Awaiting .fm Save');
  assert.equal(emptySummary.hasLocalData, false);
  assert.equal(emptySummary.savesLabel, '0 cached .fm saves');
  assert.equal(emptySummary.snapshotsLabel, '0 journey snapshots');
  assert.match(emptySummary.offlineNote, /cached for offline use/i);
});

test('buildLocalCacheStatusSummary reports loaded club, cache counts, and offline guidance', () => {
  const loadedOffline = buildLocalCacheStatusSummary({
    hasLoadedSave: true,
    clubName: 'KVV Zelzate',
    saveDate: '14/02/2027',
    playersCount: 28,
    matchesCount: 24,
    staffCount: 11,
    isOnline: false,
    isRestoredFromMemory: true,
    cacheStats: {
      cachedSavesCount: 1,
      cachedBriefingsCount: 2,
      snapshotPointsCount: 5,
      indexedDbAvailable: true,
    },
    storageUsageBytes: 12 * 1024 * 1024,
    storageQuotaBytes: 2 * 1024 * 1024 * 1024,
  });

  assert.equal(loadedOffline.headline, 'KVV Zelzate · 14/02/2027');
  assert.equal(loadedOffline.hasLocalData, true);
  assert.equal(loadedOffline.savesLabel, '1 cached .fm save');
  assert.equal(loadedOffline.snapshotsLabel, '5 journey snapshots');
  assert.equal(loadedOffline.storageLabel, '12 MB used of 2.00 GB');
  assert.match(loadedOffline.subline, /28 players · 24 matches · 11 staff/);
  assert.match(loadedOffline.offlineNote, /offline/i);
});
