/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SaveCacheStats } from '../services/saveCache';

export type PrimaryMobileTabId = 'sync' | 'squad' | 'tactics' | 'recruitment';
export type MobileNavButtonId = PrimaryMobileTabId | 'more';
export type SecondaryMobileTabId = 'matches' | 'staff';
export type AppActiveTabId =
  | PrimaryMobileTabId
  | SecondaryMobileTabId
  | 'setpieces';

export type MobileTabTapAction =
  | { kind: 'toggle-more' }
  | { kind: 'scroll-top'; closeMore: boolean }
  | { kind: 'switch-tab'; tab: PrimaryMobileTabId; closeMore: boolean };

/**
 * Determines which of the 5 bottom-bar buttons should appear highlighted.
 * - Secondary tabs (`matches`, `staff`) highlight `more` so the user always sees
 *   where they are in the navigation hierarchy.
 * - `setpieces` maps to `tactics` since Set Pieces lives inside Tactics.
 * - While the More sheet is open, `more` is highlighted.
 */
export function resolveMobileNavHighlight(
  activeTab: AppActiveTabId,
  isMoreOpen: boolean
): MobileNavButtonId {
  if (isMoreOpen) return 'more';
  if (activeTab === 'matches' || activeTab === 'staff') return 'more';
  if (activeTab === 'setpieces') return 'tactics';
  return activeTab;
}

/**
 * Resolves what should happen when a user taps one of the 5 bottom-bar tabs:
 * - Tapping `more` toggles the slide-up More sheet.
 * - Tapping the already-active primary tab smoothly scrolls to the top without
 *   resetting sub-tabs.
 * - Tapping another primary tab switches to it and closes the More sheet.
 */
export function getMobileTabAction(
  tappedId: MobileNavButtonId,
  activeTab: AppActiveTabId,
  isMoreOpen: boolean
): MobileTabTapAction {
  if (tappedId === 'more') {
    return { kind: 'toggle-more' };
  }

  const currentPrimary = resolveMobileNavHighlight(activeTab, false);
  if (currentPrimary === tappedId) {
    return { kind: 'scroll-top', closeMore: isMoreOpen };
  }

  return { kind: 'switch-tab', tab: tappedId, closeMore: isMoreOpen };
}

/**
 * Formats byte counts cleanly for Local Cache Status display.
 */
export function formatCacheBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export interface LocalCacheStatusInput {
  hasLoadedSave: boolean;
  clubName: string;
  saveDate: string;
  playersCount: number;
  matchesCount: number;
  staffCount: number;
  isOnline: boolean;
  isRestoredFromMemory: boolean;
  cacheStats: SaveCacheStats;
  storageUsageBytes: number | null;
  storageQuotaBytes: number | null;
}

export interface LocalCacheStatusSummary {
  headline: string;
  subline: string;
  storageLabel: string;
  savesLabel: string;
  snapshotsLabel: string;
  offlineNote: string;
  hasLocalData: boolean;
}

/**
 * Builds a plain-English summary of what is stored locally on the phone.
 * Respects Zero Fake Data: when no save is loaded, displays "Awaiting .fm Save".
 */
export function buildLocalCacheStatusSummary(
  input: LocalCacheStatusInput
): LocalCacheStatusSummary {
  const {
    hasLoadedSave,
    clubName,
    saveDate,
    playersCount,
    matchesCount,
    staffCount,
    isOnline,
    cacheStats,
    storageUsageBytes,
    storageQuotaBytes,
  } = input;

  const hasLocalData =
    hasLoadedSave ||
    playersCount > 0 ||
    cacheStats.cachedSavesCount > 0 ||
    cacheStats.snapshotPointsCount > 0;

  const cleanDate = saveDate && saveDate !== '--' ? saveDate : null;
  const headline = hasLoadedSave
    ? `${clubName || 'Loaded Save'}${cleanDate ? ` · ${cleanDate}` : ''}`
    : 'Awaiting .fm Save';

  const subline = hasLoadedSave
    ? `${playersCount} players · ${matchesCount} matches · ${staffCount} staff stored locally`
    : 'No club loaded yet — upload a .fm save or restore a JSON backup to cache data on this phone.';

  const savesLabel =
    cacheStats.cachedSavesCount === 1
      ? '1 cached .fm save'
      : `${cacheStats.cachedSavesCount} cached .fm saves`;

  const snapshotsLabel =
    cacheStats.snapshotPointsCount === 1
      ? '1 journey snapshot'
      : `${cacheStats.snapshotPointsCount} journey snapshots`;

  let storageLabel = cacheStats.indexedDbAvailable
    ? 'Saved on device'
    : 'Browser storage limited';
  if (typeof storageUsageBytes === 'number' && Number.isFinite(storageUsageBytes)) {
    const usedText = formatCacheBytes(storageUsageBytes);
    if (
      typeof storageQuotaBytes === 'number' &&
      Number.isFinite(storageQuotaBytes) &&
      storageQuotaBytes > 0
    ) {
      storageLabel = `${usedText} used of ${formatCacheBytes(storageQuotaBytes)}`;
    } else {
      storageLabel = `${usedText} stored on device`;
    }
  }

  const offlineNote = isOnline
    ? hasLoadedSave
      ? 'Ready for offline use — your squad, tactics, and journey snapshots stay saved on this phone.'
      : 'App shell is cached for offline use. Once you sync a .fm save, it stays available offline.'
    : hasLoadedSave
      ? 'You are offline — reading your locally cached save data directly from this phone.'
      : 'You are offline — cached screens still open, and you can decode a local .fm save on your phone.';

  return {
    headline,
    subline,
    storageLabel,
    savesLabel,
    snapshotsLabel,
    offlineNote,
    hasLocalData,
  };
}

/**
 * Reads lightweight local IndexedDB counts plus StorageManager byte estimates.
 */
export async function readLocalCacheDiagnostics(): Promise<{
  cacheStats: SaveCacheStats;
  storageUsageBytes: number | null;
  storageQuotaBytes: number | null;
}> {
  const [cacheStats, estimate] = await Promise.all([
    import('../services/saveCache')
      .then(({ getSaveCacheStats }) => getSaveCacheStats())
      .catch(() => ({
        cachedSavesCount: 0,
        cachedBriefingsCount: 0,
        snapshotPointsCount: 0,
        indexedDbAvailable: false,
      })),
    (async () => {
      try {
        if (
          typeof navigator !== 'undefined' &&
          navigator.storage &&
          typeof navigator.storage.estimate === 'function'
        ) {
          return await navigator.storage.estimate();
        }
      } catch {
        // ignore StorageManager permission/unsupported errors
      }
      return null;
    })(),
  ]);

  return {
    cacheStats,
    storageUsageBytes:
      typeof estimate?.usage === 'number' && Number.isFinite(estimate.usage)
        ? estimate.usage
        : null,
    storageQuotaBytes:
      typeof estimate?.quota === 'number' && Number.isFinite(estimate.quota)
        ? estimate.quota
        : null,
  };
}
