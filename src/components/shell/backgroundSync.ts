/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Progress of a background .fm sync, shared by the header CTA and the pill. */
export interface BackgroundSyncStatus {
  label: string;
  clubCoreReady: boolean;
  progressPct?: number;
  paused?: boolean;
}
