/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Download, RefreshCw, Share, WifiOff, X } from 'lucide-react';

interface PwaStatusBannersProps {
  isOnline: boolean;
  clubName: string;
  hasLoadedSave: boolean;
  showUpdateBanner: boolean;
  onApplyUpdate: () => void;
  onDismissUpdate: () => void;
  showInstallBanner: boolean;
  canPromptInstall: boolean;
  isIosSafari: boolean;
  onPromptInstall: () => void;
  onDismissInstall: () => void;
}

export const PwaStatusBanners: React.FC<PwaStatusBannersProps> = ({
  isOnline,
  clubName,
  hasLoadedSave,
  showUpdateBanner,
  onApplyUpdate,
  onDismissUpdate,
  showInstallBanner,
  canPromptInstall,
  isIosSafari,
  onPromptInstall,
  onDismissInstall,
}) => {
  if (isOnline && !showUpdateBanner && !showInstallBanner) {
    return null;
  }

  return (
    <div className="max-w-[1400px] w-full mx-auto px-3 sm:px-6 pt-2.5 space-y-2">
      {/* Offline Banner */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/60 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-100"
        >
          <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-snug">
            <span className="font-semibold text-amber-900 dark:text-amber-200">Offline mode — </span>
            {hasLoadedSave
              ? `browsing your saved ${clubName} data locally. AI Analyst will use instant offline briefings until signal returns.`
              : 'no internet connection detected. Cached screens still work, and you can import a local .fm save directly on your device.'}
          </p>
        </div>
      )}

      {/* Safe Update Ready Banner (automatically held off while uploading/chatting) */}
      {showUpdateBanner && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/60 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-emerald-950 dark:text-emerald-100"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <RefreshCw className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="leading-snug">
              <strong className="font-semibold text-emerald-900 dark:text-emerald-200">
                New version ready
              </strong>{' '}
              — refresh when convenient to load the latest updates.
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onApplyUpdate}
              className="px-3 py-1.5 min-h-[44px] sm:min-h-[36px] rounded-lg bg-emerald-700 dark:bg-emerald-500 hover:bg-emerald-800 dark:hover:bg-emerald-400 text-white dark:text-slate-950 font-bold text-xs transition cursor-pointer whitespace-nowrap"
            >
              Refresh
            </button>
            <button
              type="button"
              aria-label="Dismiss update notice"
              onClick={onDismissUpdate}
              className="p-1.5 min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] inline-flex items-center justify-center rounded-lg text-emerald-800 dark:text-emerald-300/80 hover:text-emerald-950 dark:hover:text-white hover:bg-emerald-200/70 dark:hover:bg-emerald-900/60 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Android Native Install Prompt / iOS Safari 2-Step Tip */}
      {showInstallBanner && (
        <div
          role="region"
          aria-label="Install FM27 Command Hub"
          className="rounded-xl border border-sky-500/35 bg-white dark:bg-slate-900/95 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-slate-800 dark:text-slate-200 shadow-sm dark:shadow-lg"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            {canPromptInstall ? (
              <Download className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            ) : (
              <Share className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 leading-snug">
              <div className="font-semibold text-slate-900 dark:text-white">
                Install FM27 Hub on your phone
              </div>
              <p className="text-micro text-slate-600 dark:text-slate-400 mt-0.5">
                {canPromptInstall
                  ? 'Opens full-screen like a native app with instant offline access and home-screen shortcuts.'
                  : isIosSafari
                    ? 'Tap Share in Safari, then choose "Add to Home Screen" for full-screen offline access.'
                    : 'Add to your home screen for instant full-screen offline access.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {canPromptInstall && (
              <button
                type="button"
                onClick={onPromptInstall}
                className="px-3 py-1.5 min-h-[44px] sm:min-h-[36px] rounded-lg bg-sky-600 dark:bg-sky-500 hover:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 font-bold text-xs transition cursor-pointer whitespace-nowrap"
              >
                Install
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss install prompt"
              onClick={onDismissInstall}
              className="p-1.5 min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
