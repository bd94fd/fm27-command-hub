import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BROWSER_WORKER_BUFFER_LIMIT_BYTES,
  isLargeSaveFile,
  isLowMemoryDevice,
  LARGE_SAVE_BYTES,
  resolveFallbackFastSync,
} from './saveMemoryBudget';

test('large save threshold covers 250-265 MB FM saves', () => {
  assert.equal(LARGE_SAVE_BYTES, 200 * 1024 * 1024);
  assert.equal(BROWSER_WORKER_BUFFER_LIMIT_BYTES, 64 * 1024 * 1024);
  assert.equal(isLargeSaveFile(10), false);
  assert.equal(isLargeSaveFile(199 * 1024 * 1024), false);
  assert.equal(isLargeSaveFile(250 * 1024 * 1024), true);
  assert.equal(isLargeSaveFile(Number.NaN), false);
});

test('low-memory detection ignores unknown and desktop-class devices', () => {
  assert.equal(isLowMemoryDevice(undefined), false);
  assert.equal(isLowMemoryDevice(0), false);
  assert.equal(isLowMemoryDevice(2), true);
  assert.equal(isLowMemoryDevice(4), false);
  assert.equal(isLowMemoryDevice(8), false);
});

test('a browser fallback keeps Fast Sync on phones for any save size', () => {
  assert.equal(
    resolveFallbackFastSync({
      requestedFastSync: false,
      fileSizeBytes: 2 * 1024 * 1024,
      isMobile: true,
    }),
    true
  );
});

test('a large save on a low-memory desktop is upgraded to Fast Sync', () => {
  assert.equal(
    resolveFallbackFastSync({
      requestedFastSync: false,
      fileSizeBytes: 250 * 1024 * 1024,
      isMobile: false,
      deviceMemoryGb: 2,
    }),
    true
  );
});

test('a desktop fallback keeps the requested mode when memory is adequate', () => {
  assert.equal(
    resolveFallbackFastSync({
      requestedFastSync: false,
      fileSizeBytes: 250 * 1024 * 1024,
      isMobile: false,
      deviceMemoryGb: 8,
    }),
    false
  );
  assert.equal(
    resolveFallbackFastSync({
      requestedFastSync: undefined,
      fileSizeBytes: 250 * 1024 * 1024,
      isMobile: false,
      deviceMemoryGb: 8,
    }),
    false
  );
});
