/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isUpdateCheckDue,
  resolveForegroundUpdateIntervalMs,
} from '../utils/pwaUpdateCheck';

export const PWA_INSTALL_DISMISSED_KEY = 'fm27_pwa_install_dismissed_v1';

export type PwaLaunchTab =
  | 'sync'
  | 'tactics'
  | 'squad'
  | 'recruitment'
  | 'staff'
  | 'matches';

export interface PwaLaunchParams {
  initialTab: PwaLaunchTab | null;
  shouldPromptSync: boolean;
  isFileOpenAction: boolean;
}

interface BeforeInstallPromptEventLike extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface LaunchParamsLike {
  files?: Array<{
    getFile?: () => Promise<File>;
  }>;
}

interface LaunchQueueLike {
  setConsumer: (consumer: (launchParams: LaunchParamsLike) => void) => void;
}

const VALID_LAUNCH_TABS = new Set<PwaLaunchTab>([
  'sync',
  'tactics',
  'squad',
  'recruitment',
  'staff',
  'matches',
]);

/**
 * Parses Android PWA shortcut URLs (`/?tab=tactics`, `/?action=sync`, `/?action=open-fm`).
 */
export function parsePwaLaunchParams(search: string): PwaLaunchParams {
  if (!search) {
    return { initialTab: null, shouldPromptSync: false, isFileOpenAction: false };
  }
  const params = new URLSearchParams(search);
  const rawTab = (params.get('tab') || '').trim().toLowerCase();
  const rawAction = (params.get('action') || '').trim().toLowerCase();

  const initialTab = VALID_LAUNCH_TABS.has(rawTab as PwaLaunchTab)
    ? (rawTab as PwaLaunchTab)
    : rawAction === 'sync' || rawAction === 'open-fm'
      ? 'sync'
      : null;

  return {
    initialTab,
    shouldPromptSync: rawAction === 'sync',
    isFileOpenAction: rawAction === 'open-fm',
  };
}

/**
 * Detects iOS Safari (where `beforeinstallprompt` is unsupported and a 2-step Share tip helps).
 */
export function isIosSafariUserAgent(userAgent: string): boolean {
  const ua = userAgent || '';
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  if (!isIos) return false;
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return /Safari/i.test(ua) && !isOtherIosBrowser;
}

/**
 * Never interrupt an active .fm upload/decode or AI response with an update banner.
 */
export function shouldShowUpdatePrompt(
  updateAvailable: boolean,
  updateDismissed: boolean,
  isBusy: boolean
): boolean {
  return updateAvailable && !updateDismissed && !isBusy;
}

/**
 * Shows the install banner on Android Chrome (native prompt) or iOS Safari (manual tip)
 * only when not already installed and not dismissed by the user.
 */
export function shouldShowInstallBanner(options: {
  isInstalled: boolean;
  dismissed: boolean;
  hasNativePrompt: boolean;
  isIosSafari: boolean;
}): boolean {
  if (options.isInstalled || options.dismissed) return false;
  return options.hasNativePrompt || options.isIosSafari;
}

function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  const mediaStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return Boolean(mediaStandalone || nav.standalone);
}

function readDismissedFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PWA_INSTALL_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export interface PwaLifecycleState {
  isOnline: boolean;
  isInstalled: boolean;
  isIosSafari: boolean;
  canPromptInstall: boolean;
  showInstallBanner: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  dismissInstallBanner: () => void;
  updateAvailable: boolean;
  showUpdateBanner: boolean;
  applyUpdate: () => void;
  dismissUpdateBanner: () => void;
  launchedFmFile: File | null;
  clearLaunchedFmFile: () => void;
}

export function usePwaLifecycle(options?: { isBusy?: boolean }): PwaLifecycleState {
  const isBusy = Boolean(options?.isBusy);

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() =>
    detectStandaloneMode()
  );
  const [installDismissed, setInstallDismissed] = useState<boolean>(() =>
    readDismissedFlag()
  );
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEventLike | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [updateDismissed, setUpdateDismissed] = useState<boolean>(false);
  const [launchedFmFile, setLaunchedFmFile] = useState<File | null>(null);

  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const reloadingRef = useRef<boolean>(false);
  const lastUpdateCheckAtRef = useRef<number>(Number.POSITIVE_INFINITY);

  const isIosSafari =
    typeof navigator !== 'undefined'
      ? isIosSafariUserAgent(navigator.userAgent || '')
      : false;

  // 1. Online / offline tracking
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 2. Native Android Chrome install prompt + standalone detection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEventLike);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };
    mediaQuery?.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery?.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  // 3. Safe Service Worker update detection (never auto-reloads mid-session)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let cancelled = false;
    let registrationRef: ServiceWorkerRegistration | null = null;
    let trackedInstalling: ServiceWorker | null = null;

    const markWaiting = (worker: ServiceWorker | null) => {
      if (cancelled || !worker) return;
      waitingWorkerRef.current = worker;
      setUpdateAvailable(true);
      setUpdateDismissed(false);
    };

    const handleStateChange = () => {
      if (
        trackedInstalling &&
        trackedInstalling.state === 'installed' &&
        navigator.serviceWorker.controller
      ) {
        markWaiting(trackedInstalling);
      }
    };

    const handleUpdateFound = () => {
      if (!registrationRef?.installing) return;
      trackedInstalling?.removeEventListener('statechange', handleStateChange);
      trackedInstalling = registrationRef.installing;
      trackedInstalling.addEventListener('statechange', handleStateChange);
    };

    const handleControllerChange = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      handleControllerChange
    );

    const checkForUpdateOnForeground = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      const reg = registrationRef;
      if (!reg) return;
      const now = Date.now();
      if (
        !isUpdateCheckDue(
          lastUpdateCheckAtRef.current,
          now,
          resolveForegroundUpdateIntervalMs()
        )
      ) {
        return;
      }
      lastUpdateCheckAtRef.current = now;
      void reg.update().catch(() => {
        // Offline or the host refused the check; the next foreground visit retries.
      });
    };

    document.addEventListener('visibilitychange', checkForUpdateOnForeground);

    const attachRegistration = (reg: ServiceWorkerRegistration | undefined) => {
      if (cancelled || !reg) return;
      registrationRef = reg;
      // The browser already checked during this load, so wait a full interval before
      // asking again. A waiting worker from an earlier session still prompts now.
      lastUpdateCheckAtRef.current = Date.now();
      if (reg.waiting && navigator.serviceWorker.controller) {
        markWaiting(reg.waiting);
      }
      reg.addEventListener('updatefound', handleUpdateFound);
    };

    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (reg) {
          attachRegistration(reg);
        } else {
          return navigator.serviceWorker.ready.then((readyReg) => {
            attachRegistration(readyReg);
          });
        }
      })
      .catch(() => {
        // Best-effort SW update hook
      });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', checkForUpdateOnForeground);
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        handleControllerChange
      );
      registrationRef?.removeEventListener('updatefound', handleUpdateFound);
      trackedInstalling?.removeEventListener('statechange', handleStateChange);
    };
  }, []);

  // 4. Chrome/Android PWA file_handlers (`window.launchQueue`) for .fm files
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const win = window as Window & { launchQueue?: LaunchQueueLike };
    if (!win.launchQueue?.setConsumer) return;

    win.launchQueue.setConsumer((launchParams) => {
      const firstHandle = launchParams?.files?.[0];
      if (!firstHandle?.getFile) return;
      void firstHandle
        .getFile()
        .then((file) => {
          if (file && file.name.toLowerCase().endsWith('.fm')) {
            setLaunchedFmFile(file);
          }
        })
        .catch(() => {
          // Ignore unreadable handle
        });
    });
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable';
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  }, [deferredPrompt]);

  const dismissInstallBanner = useCallback(() => {
    setInstallDismissed(true);
    try {
      window.localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, '1');
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const applyUpdate = useCallback(() => {
    const waiting = waitingWorkerRef.current;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  const dismissUpdateBanner = useCallback(() => {
    setUpdateDismissed(true);
  }, []);

  const clearLaunchedFmFile = useCallback(() => {
    setLaunchedFmFile(null);
  }, []);

  const showUpdateBanner = shouldShowUpdatePrompt(
    updateAvailable,
    updateDismissed,
    isBusy
  );
  const showInstallBanner = shouldShowInstallBanner({
    isInstalled,
    dismissed: installDismissed,
    hasNativePrompt: Boolean(deferredPrompt),
    isIosSafari,
  });

  return {
    isOnline,
    isInstalled,
    isIosSafari,
    canPromptInstall: Boolean(deferredPrompt),
    showInstallBanner,
    promptInstall,
    dismissInstallBanner,
    updateAvailable,
    showUpdateBanner,
    applyUpdate,
    dismissUpdateBanner,
    launchedFmFile,
    clearLaunchedFmFile,
  };
}
