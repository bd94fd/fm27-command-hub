import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createUploadController,
  createUploadSpeedTracker,
  formatBytesMb,
  formatEtaSeconds,
  formatTransferSpeed,
} from './uploadMetrics.ts';
import {
  attachBeforeUnloadGuard,
  createWakeLockManager,
  type WakeLockSentinelLike,
} from '../hooks/useUploadWakeLock.ts';

test('createUploadController supports pause, manual-over-offline precedence, resume, and local fallback', async () => {
  const ctrl = createUploadController();
  const states: Array<{ paused: boolean; pauseReason: string | null; fallback: boolean }> = [];
  const unsub = ctrl.subscribe((s) =>
    states.push({
      paused: s.paused,
      pauseReason: s.pauseReason,
      fallback: s.localFallbackRequested,
    })
  );

  assert.equal(ctrl.isPaused(), false);
  const initialSignal = ctrl.getAttemptSignal();
  assert.equal(initialSignal?.aborted, false);

  ctrl.pause('manual');
  assert.equal(ctrl.isPaused(), true);
  assert.equal(ctrl.getPauseReason(), 'manual');
  assert.equal(initialSignal?.aborted, true);

  // Offline auto-pause must not overwrite explicit manual pause
  ctrl.pause('offline');
  assert.equal(ctrl.getPauseReason(), 'manual');

  const waitPromise = ctrl.waitUntilResumed();
  ctrl.resume();
  assert.equal(await waitPromise, 'resumed');
  assert.equal(ctrl.isPaused(), false);
  assert.equal(ctrl.getAttemptSignal()?.aborted, false);

  // Local fallback wakes waiters immediately with 'fallback'
  ctrl.pause('offline');
  const fallbackWait = ctrl.waitUntilResumed();
  ctrl.requestLocalFallback();
  assert.equal(await fallbackWait, 'fallback');
  assert.equal(ctrl.isLocalFallbackRequested(), true);
  assert.equal(ctrl.isPaused(), false);

  unsub();
  assert.ok(states.length >= 4);
});

test('createUploadSpeedTracker computes accurate MB/s and ETA while excluding paused intervals', () => {
  const totalBytes = 20 * 1024 * 1024; // 20 MB
  const tracker = createUploadSpeedTracker(totalBytes, 1_000);

  // 2 MB in 1 second -> 2 MB/s, 18 MB remaining -> ~9s left
  const s1 = tracker.record(2 * 1024 * 1024, 2_000);
  assert.equal(s1.percent, 10);
  assert.ok(s1.bytesPerSec !== null);
  assert.ok(Math.abs(s1.bytesPerSec! - 2 * 1024 * 1024) < 10_000);
  assert.equal(s1.etaSec, 9);

  // Pause for 60 seconds — paused time must not drag down MB/s
  tracker.markPaused(2_000);
  tracker.markResumed(62_000);

  // Upload another 2 MB in 1 active second (t=63_000 -> active elapsed = 2s, 4 MB total -> still 2 MB/s)
  const s2 = tracker.record(4 * 1024 * 1024, 63_000);
  assert.equal(s2.percent, 20);
  assert.ok(s2.bytesPerSec !== null);
  assert.ok(Math.abs(s2.bytesPerSec! - 2 * 1024 * 1024) < 10_000);
  assert.equal(s2.etaSec, 8);

  // Formatting checks
  assert.equal(formatBytesMb(10.5 * 1024 * 1024), '10.5');
  assert.equal(formatTransferSpeed(2.4 * 1024 * 1024), '2.4 MB/s');
  assert.equal(formatTransferSpeed(50 * 1024), '50 KB/s');
  assert.equal(formatTransferSpeed(null), null);
  assert.equal(formatEtaSeconds(0), 'finishing…');
  assert.equal(formatEtaSeconds(42), '~42s left');
  assert.equal(formatEtaSeconds(135), '~2m 15s left');
  assert.equal(formatEtaSeconds(null), null);
});

test('createWakeLockManager acquires, re-acquires on visibilitychange, and releases cleanly', async () => {
  let requests = 0;
  let releases = 0;
  let visibilityState = 'visible';
  const docListeners = new Set<() => void>();
  const activeStates: boolean[] = [];

  const makeSentinel = (): WakeLockSentinelLike => {
    const sentinelListeners = new Set<() => void>();
    const s: WakeLockSentinelLike = {
      released: false,
      release: async () => {
        if (s.released) return;
        s.released = true;
        releases += 1;
        for (const fn of sentinelListeners) fn();
      },
      addEventListener: (_type, fn) => {
        sentinelListeners.add(fn);
      },
      removeEventListener: (_type, fn) => {
        sentinelListeners.delete(fn);
      },
    };
    return s;
  };

  let currentSentinel: WakeLockSentinelLike | null = null;
  const manager = createWakeLockManager({
    nav: {
      wakeLock: {
        request: async () => {
          requests += 1;
          currentSentinel = makeSentinel();
          return currentSentinel;
        },
      },
    },
    doc: {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener: (_t, fn) => docListeners.add(fn),
      removeEventListener: (_t, fn) => docListeners.delete(fn),
    },
    onActiveChange: (active) => activeStates.push(active),
  });

  assert.equal(manager.isSupported, true);
  assert.equal(await manager.acquire(), true);
  assert.equal(requests, 1);
  assert.equal(activeStates[activeStates.length - 1], true);

  // Simulate Android OS releasing wake lock when tab goes hidden
  visibilityState = 'hidden';
  await currentSentinel!.release();
  assert.equal(activeStates[activeStates.length - 1], false);

  // Returning to foreground automatically re-acquires wake lock
  visibilityState = 'visible';
  for (const fn of docListeners) fn();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(requests, 2);
  assert.equal(activeStates[activeStates.length - 1], true);

  await manager.dispose();
  assert.equal(releases, 2);
  assert.equal(docListeners.size, 0);
  assert.equal(activeStates[activeStates.length - 1], false);
});

test('attachBeforeUnloadGuard attaches and detaches beforeunload protection cleanly', () => {
  const handlers: Array<(e: { preventDefault: () => void; returnValue: string }) => void> = [];
  const fakeWin = {
    addEventListener: (
      _t: 'beforeunload',
      fn: (e: { preventDefault: () => void; returnValue: string }) => void
    ) => {
      handlers.push(fn);
    },
    removeEventListener: (
      _t: 'beforeunload',
      fn: (e: { preventDefault: () => void; returnValue: string }) => void
    ) => {
      const idx = handlers.indexOf(fn);
      if (idx >= 0) handlers.splice(idx, 1);
    },
  };

  const noop = attachBeforeUnloadGuard(false, fakeWin);
  assert.equal(handlers.length, 0);
  noop();

  const detach = attachBeforeUnloadGuard(true, fakeWin);
  assert.equal(handlers.length, 1);

  let prevented = false;
  const ev = {
    preventDefault: () => {
      prevented = true;
    },
    returnValue: 'initial',
  };
  handlers[0](ev);
  assert.equal(prevented, true);
  assert.equal(ev.returnValue, '');

  detach();
  assert.equal(handlers.length, 0);
});
