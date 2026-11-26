import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultDecodeTarget,
  isMobileUserAgent,
  resolveDecodeTarget,
  shouldPrewarmLocalDecoder,
} from './decodeTarget.ts';

test('phone decode is the default on mobile and server is opt-in', () => {
  assert.equal(defaultDecodeTarget(true), 'local');
  assert.equal(defaultDecodeTarget(false), 'server');
  assert.equal(resolveDecodeTarget('server', true), 'server');
  assert.equal(resolveDecodeTarget('local', false), 'local');
  assert.equal(resolveDecodeTarget('garbage', true), 'local');
  assert.equal(resolveDecodeTarget(null, false), 'server');
});

test('mobile user agents are detected', () => {
  assert.equal(isMobileUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 10 Pro XL)'), true);
  assert.equal(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)'), true);
  assert.equal(isMobileUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), false);
});

test('local prewarm is skipped on server/offline/data-saver/slow or low-memory phones', () => {
  const base = { target: 'local' as const, online: true };
  assert.equal(shouldPrewarmLocalDecoder(base), true);
  assert.equal(shouldPrewarmLocalDecoder({ ...base, target: 'server' }), false);
  assert.equal(shouldPrewarmLocalDecoder({ ...base, online: false }), false);
  assert.equal(shouldPrewarmLocalDecoder({ ...base, saveData: true }), false);
  assert.equal(shouldPrewarmLocalDecoder({ ...base, effectiveType: '2g' }), false);
  assert.equal(shouldPrewarmLocalDecoder({ ...base, deviceMemoryGb: 2 }), false);
  assert.equal(shouldPrewarmLocalDecoder({ ...base, deviceMemoryGb: 8 }), true);
});
