/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

export interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
  removeEventListener?: (type: 'release', listener: () => void) => void;
}

export interface WakeLockNavigatorLike {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
}

export interface VisibilityDocumentLike {
  visibilityState: string;
  addEventListener: (type: 'visibilitychange', listener: () => void) => void;
  removeEventListener: (type: 'visibilitychange', listener: () => void) => void;
}

export interface BeforeUnloadWindowLike {
  addEventListener: (
    type: 'beforeunload',
    listener: (e: { preventDefault: () => void; returnValue: string }) => void
  ) => void;
  removeEventListener: (
    type: 'beforeunload',
    listener: (e: { preventDefault: () => void; returnValue: string }) => void
  ) => void;
}

export interface WakeLockManager {
  isSupported: boolean;
  acquire: () => Promise<boolean>;
  release: () => Promise<void>;
  dispose: () => Promise<void>;
}

/**
 * Pure, unit-testable Screen Wake Lock manager that automatically re-acquires
 * when the browser tab returns to the foreground (Android Chrome releases wake
 * locks whenever a tab is backgrounded).
 */
export function createWakeLockManager(options: {
  nav?: WakeLockNavigatorLike;
  doc?: VisibilityDocumentLike;
  onActiveChange?: (active: boolean) => void;
} = {}): WakeLockManager {
  const nav =
    options.nav ??
    (typeof navigator !== 'undefined'
      ? (navigator as unknown as WakeLockNavigatorLike)
      : undefined);
  const doc =
    options.doc ??
    (typeof document !== 'undefined'
      ? (document as unknown as VisibilityDocumentLike)
      : undefined);

  const isSupported = Boolean(nav?.wakeLock && typeof nav.wakeLock.request === 'function');
  let sentinel: WakeLockSentinelLike | null = null;
  let wanted = false;
  let disposed = false;

  const notify = (active: boolean) => {
    try {
      options.onActiveChange?.(active);
    } catch {
      // ignore listener errors
    }
  };

  const handleSentinelRelease = () => {
    sentinel = null;
    notify(false);
  };

  const acquire = async (): Promise<boolean> => {
    wanted = true;
    if (!isSupported || disposed || !nav?.wakeLock) return false;
    if (sentinel && !sentinel.released) return true;
    if (doc && doc.visibilityState !== 'visible') return false;
    try {
      const next = await nav.wakeLock.request('screen');
      if (disposed || !wanted) {
        await next.release().catch(() => {});
        return false;
      }
      sentinel = next;
      sentinel.addEventListener?.('release', handleSentinelRelease);
      notify(true);
      return true;
    } catch {
      sentinel = null;
      notify(false);
      return false;
    }
  };

  const release = async (): Promise<void> => {
    wanted = false;
    const current = sentinel;
    sentinel = null;
    if (current) {
      current.removeEventListener?.('release', handleSentinelRelease);
      try {
        await current.release();
      } catch {
        // ignore if already released by OS
      }
    }
    notify(false);
  };

  const handleVisibilityChange = () => {
    if (disposed || !wanted) return;
    if (doc?.visibilityState === 'visible') {
      void acquire();
    }
  };

  doc?.addEventListener('visibilitychange', handleVisibilityChange);

  const dispose = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    doc?.removeEventListener('visibilitychange', handleVisibilityChange);
    await release();
  };

  return {
    isSupported,
    acquire,
    release,
    dispose,
  };
}

/**
 * Attaches a beforeunload prompt while an upload or decode is active so users
 * on Android Chrome do not accidentally swipe-refresh or close mid-transfer.
 */
export function attachBeforeUnloadGuard(
  active: boolean,
  win?: BeforeUnloadWindowLike
): () => void {
  const target =
    win ??
    (typeof window !== 'undefined'
      ? (window as unknown as BeforeUnloadWindowLike)
      : undefined);
  if (!active || !target) {
    return () => {};
  }
  const handler = (event: { preventDefault: () => void; returnValue: string }) => {
    event.preventDefault();
    event.returnValue = '';
  };
  target.addEventListener('beforeunload', handler);
  return () => {
    target.removeEventListener('beforeunload', handler);
  };
}

export interface UseUploadWakeLockOptions {
  /** Hold screen awake while actively uploading or decoding */
  keepAwake: boolean;
  /** Warn before leaving/refreshing tab while upload/decode is active or paused */
  warnBeforeUnload: boolean;
}

export function useUploadWakeLock({
  keepAwake,
  warnBeforeUnload,
}: UseUploadWakeLockOptions): {
  wakeLockSupported: boolean;
  wakeLockActive: boolean;
} {
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockSupported =
    typeof navigator !== 'undefined' &&
    Boolean((navigator as unknown as WakeLockNavigatorLike).wakeLock?.request);

  useEffect(() => {
    if (!keepAwake) {
      setWakeLockActive(false);
      return;
    }
    const manager = createWakeLockManager({
      onActiveChange: setWakeLockActive,
    });
    void manager.acquire();
    return () => {
      void manager.dispose();
    };
  }, [keepAwake]);

  useEffect(() => {
    return attachBeforeUnloadGuard(warnBeforeUnload);
  }, [warnBeforeUnload]);

  return {
    wakeLockSupported,
    wakeLockActive,
  };
}
