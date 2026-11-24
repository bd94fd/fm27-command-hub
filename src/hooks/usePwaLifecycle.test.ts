import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isIosSafariUserAgent,
  parsePwaLaunchParams,
  shouldShowInstallBanner,
  shouldShowUpdatePrompt,
} from './usePwaLifecycle.ts';

test('parsePwaLaunchParams parses Android PWA shortcuts and open-fm actions', () => {
  assert.deepEqual(parsePwaLaunchParams(''), {
    initialTab: null,
    shouldPromptSync: false,
    isFileOpenAction: false,
  });

  assert.deepEqual(parsePwaLaunchParams('?tab=tactics'), {
    initialTab: 'tactics',
    shouldPromptSync: false,
    isFileOpenAction: false,
  });

  assert.deepEqual(parsePwaLaunchParams('?tab=SQUAD'), {
    initialTab: 'squad',
    shouldPromptSync: false,
    isFileOpenAction: false,
  });

  assert.deepEqual(parsePwaLaunchParams('?action=sync'), {
    initialTab: 'sync',
    shouldPromptSync: true,
    isFileOpenAction: false,
  });

  assert.deepEqual(parsePwaLaunchParams('?action=open-fm'), {
    initialTab: 'sync',
    shouldPromptSync: false,
    isFileOpenAction: true,
  });

  assert.deepEqual(parsePwaLaunchParams('?tab=invalid-tab'), {
    initialTab: null,
    shouldPromptSync: false,
    isFileOpenAction: false,
  });
});

test('shouldShowUpdatePrompt defers while uploading or chatting', () => {
  assert.equal(shouldShowUpdatePrompt(true, false, false), true);
  assert.equal(shouldShowUpdatePrompt(true, false, true), false);
  assert.equal(shouldShowUpdatePrompt(true, true, false), false);
  assert.equal(shouldShowUpdatePrompt(false, false, false), false);
});

test('shouldShowInstallBanner respects installed state, dismissal, and platform capability', () => {
  assert.equal(
    shouldShowInstallBanner({
      isInstalled: false,
      dismissed: false,
      hasNativePrompt: true,
      isIosSafari: false,
    }),
    true
  );

  assert.equal(
    shouldShowInstallBanner({
      isInstalled: true,
      dismissed: false,
      hasNativePrompt: true,
      isIosSafari: false,
    }),
    false
  );

  assert.equal(
    shouldShowInstallBanner({
      isInstalled: false,
      dismissed: true,
      hasNativePrompt: true,
      isIosSafari: false,
    }),
    false
  );

  assert.equal(
    shouldShowInstallBanner({
      isInstalled: false,
      dismissed: false,
      hasNativePrompt: false,
      isIosSafari: true,
    }),
    true
  );

  assert.equal(
    shouldShowInstallBanner({
      isInstalled: false,
      dismissed: false,
      hasNativePrompt: false,
      isIosSafari: false,
    }),
    false
  );
});

test('isIosSafariUserAgent matches iPhone Safari and excludes Android Chrome / Chrome on iOS', () => {
  assert.equal(
    isIosSafariUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    ),
    true
  );
  assert.equal(
    isIosSafariUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1'
    ),
    false
  );
  assert.equal(
    isIosSafariUserAgent(
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
    ),
    false
  );
});
