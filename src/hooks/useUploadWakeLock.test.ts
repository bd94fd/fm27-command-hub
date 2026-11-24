import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachBeforeUnloadGuard,
  createWakeLockManager,
  type BeforeUnloadWindowLike,
  type VisibilityDocumentLike,
  type WakeLockNavigatorLike,
  type WakeLockSentinelLike,
} from './useUploadWakeLock.ts';

test('createWakeLockManager acquires, releases, and re-acquires automatically when tab returns visible', async () => {
  let requestCount = 0;
  let releaseCount = 0;
  const listeners: {
    release: (() => void) | null;
    visibility: (() => void) | null;
  } = { release: null, visibility: null };
  const activeHistory: boolean[] = [];

  const doc: VisibilityDocumentLike = {
    visibilityState: 'visible',
    addEventListener: (_type, fn) => {
      listeners.visibility = fn;
    },
    removeEventListener: (_type, fn) => {
      if (listeners.visibility === fn) listeners.visibility = null;
    },
  };

  const nav: WakeLockNavigatorLike = {
    wakeLock: {
      request: async () => {
        requestCount += 1;
        const sentinel: WakeLockSentinelLike = {
          released: false,
          release: async () => {
            sentinel.released = true;
            releaseCount += 1;
          },
          addEventListener: (_t, fn) => {
            listeners.release = fn;
          },
          removeEventListener: (_t, fn) => {
            if (listeners.release === fn) listeners.release = null;
          },
        };
        return sentinel;
      },
    },
  };

  const manager = createWakeLockManager({
    nav,
    doc,
    onActiveChange: (active) => activeHistory.push(active),
  });

  assert.equal(manager.isSupported, true);
  assert.equal(await manager.acquire(), true);
  assert.equal(requestCount, 1);
  assert.deepEqual(activeHistory, [true]);

  // Simulate Android OS releasing wake lock when tab goes to background
  doc.visibilityState = 'hidden';
  listeners.release?.();
  assert.deepEqual(activeHistory, [true, false]);

  // Tab returns to foreground -> manager re-acquires automatically
  doc.visibilityState = 'visible';
  listeners.visibility?.();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(requestCount, 2);
  assert.deepEqual(activeHistory, [true, false, true]);

  await manager.dispose();
  assert.equal(releaseCount, 1);
  assert.equal(listeners.visibility, null);
});

test('createWakeLockManager degrades gracefully when wakeLock API is unsupported', async () => {
  const manager = createWakeLockManager({ nav: {} });
  assert.equal(manager.isSupported, false);
  assert.equal(await manager.acquire(), false);
  await manager.dispose();
});

test('attachBeforeUnloadGuard registers only when active, prevents unload, and cleans up cleanly', () => {
  const state: {
    registered: ((e: { preventDefault: () => void; returnValue: string }) => void) | null;
  } = { registered: null };
  const win: BeforeUnloadWindowLike = {
    addEventListener: (_t, fn) => {
      state.registered = fn;
    },
    removeEventListener: (_t, fn) => {
      if (state.registered === fn) state.registered = null;
    },
  };

  const noopCleanup = attachBeforeUnloadGuard(false, win);
  assert.equal(state.registered, null);
  noopCleanup();

  const cleanup = attachBeforeUnloadGuard(true, win);
  const handler = state.registered as
    | ((e: { preventDefault: () => void; returnValue: string }) => void)
    | null;
  assert.ok(typeof handler === 'function');

  let prevented = false;
  const evt = {
    preventDefault: () => {
      prevented = true;
    },
    returnValue: 'initial',
  };
  handler(evt);
  assert.equal(prevented, true);
  assert.equal(evt.returnValue, '');

  cleanup();
  assert.equal(state.registered, null);
});
