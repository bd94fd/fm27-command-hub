/**
 * Memory guardrails for very large .fm saves.
 *
 * These are deliberately conservative. The browser decoder must use zero-copy
 * WORKERFS above the buffer limit, and a server fallback on a phone should not
 * start a Full Sync decode that has already been shown to stress mobile RAM.
 */

export const LARGE_SAVE_BYTES = 200 * 1024 * 1024;
export const BROWSER_WORKER_BUFFER_LIMIT_BYTES = 64 * 1024 * 1024;
export const LOW_MEMORY_DEVICE_GB = 4;

export function isLargeSaveFile(fileSizeBytes: number): boolean {
  return Number.isFinite(fileSizeBytes) && fileSizeBytes >= LARGE_SAVE_BYTES;
}

export function isLowMemoryDevice(deviceMemoryGb: number | undefined): boolean {
  return (
    typeof deviceMemoryGb === 'number' &&
    Number.isFinite(deviceMemoryGb) &&
    deviceMemoryGb > 0 &&
    deviceMemoryGb < LOW_MEMORY_DEVICE_GB
  );
}

/**
 * Decides the sync mode for a browser fallback after the native server path has
 * failed. An explicit Fast Sync choice is always kept; a large save on a phone
 * or low-memory device is upgraded to Fast Sync so the fallback is not more
 * memory-hungry than the failed path.
 */
export function resolveFallbackFastSync(params: {
  requestedFastSync?: boolean;
  fileSizeBytes: number;
  isMobile: boolean;
  deviceMemoryGb?: number;
}): boolean {
  if (params.requestedFastSync === true) return true;
  if (params.isMobile) return true;
  if (
    isLargeSaveFile(params.fileSizeBytes) &&
    isLowMemoryDevice(params.deviceMemoryGb)
  ) {
    return true;
  }
  return false;
}
