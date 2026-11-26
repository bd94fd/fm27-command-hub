/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  RefreshCw,
  Share,
  Smartphone,
  Trash2,
  Trophy,
  Upload,
  UserCheck,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  AppActiveTabId,
  buildLocalCacheStatusSummary,
  readLocalCacheDiagnostics,
  SecondaryMobileTabId,
} from '../utils/mobileNavHelpers';
import { SaveCacheStats } from '../services/saveCache';

interface MobileMoreSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: AppActiveTabId;
  onSelectSecondaryTab: (tab: SecondaryMobileTabId) => void;
  onOpenKnowledgeBase: () => void;
  matchesCount: number;
  staffCount: number;
  playersCount: number;
  hasLoadedSave: boolean;
  hasBackupableData: boolean;
  clubName: string;
  saveDate: string;
  isOnline: boolean;
  isRestoredFromMemory: boolean;
  isInstalled: boolean;
  canPromptInstall: boolean;
  isIosSafari: boolean;
  updateAvailable: boolean;
  onPromptInstall: () => void;
  onApplyUpdate: () => void;
  onExportBackup: () => void;
  onRequestRestore: () => void;
  confirmResetPending: boolean;
  onResetMemory: () => void;
}

const DEFAULT_CACHE_STATS: SaveCacheStats = {
  cachedSavesCount: 0,
  cachedBriefingsCount: 0,
  snapshotPointsCount: 0,
  indexedDbAvailable: true,
};

export const MobileMoreSheet: React.FC<MobileMoreSheetProps> = ({
  isOpen,
  onClose,
  activeTab,
  onSelectSecondaryTab,
  onOpenKnowledgeBase,
  matchesCount,
  staffCount,
  playersCount,
  hasLoadedSave,
  hasBackupableData,
  clubName,
  saveDate,
  isOnline,
  isRestoredFromMemory,
  isInstalled,
  canPromptInstall,
  isIosSafari,
  updateAvailable,
  onPromptInstall,
  onApplyUpdate,
  onExportBackup,
  onRequestRestore,
  confirmResetPending,
  onResetMemory,
}) => {
  const [cacheStats, setCacheStats] = useState<SaveCacheStats>(DEFAULT_CACHE_STATS);
  const [storageUsageBytes, setStorageUsageBytes] = useState<number | null>(null);
  const [storageQuotaBytes, setStorageQuotaBytes] = useState<number | null>(null);
  const [loadingCache, setLoadingCache] = useState<boolean>(false);

  // Refresh lightweight IndexedDB / StorageManager diagnostics whenever sheet opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingCache(true);
    void readLocalCacheDiagnostics().then((diag) => {
      if (cancelled) return;
      setCacheStats(diag.cacheStats);
      setStorageUsageBytes(diag.storageUsageBytes);
      setStorageQuotaBytes(diag.storageQuotaBytes);
      setLoadingCache(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, hasLoadedSave, playersCount, matchesCount]);

  // Escape key dismissal + background scroll lock while sheet is open
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const cacheSummary = useMemo(
    () =>
      buildLocalCacheStatusSummary({
        hasLoadedSave,
        clubName,
        saveDate,
        playersCount,
        matchesCount,
        staffCount,
        isOnline,
        isRestoredFromMemory,
        cacheStats,
        storageUsageBytes,
        storageQuotaBytes,
      }),
    [
      hasLoadedSave,
      clubName,
      saveDate,
      playersCount,
      matchesCount,
      staffCount,
      isOnline,
      isRestoredFromMemory,
      cacheStats,
      storageUsageBytes,
      storageQuotaBytes,
    ]
  );

  if (!isOpen) return null;

  const handleResetTap = () => {
    const wasConfirming = confirmResetPending;
    onResetMemory();
    if (wasConfirming) {
      onClose();
    }
  };

  return (
    <div
      id="mobile-more-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="More navigation and app tools"
      className="md:hidden fixed inset-0 z-50 flex flex-col justify-end"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close More menu"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs cursor-pointer"
      />

      {/* Slide-up Sheet Surface */}
      <div className="relative z-10 w-full max-h-[90dvh] rounded-t-2xl border-t border-slate-700/90 bg-slate-900 text-slate-100 shadow-2xl flex flex-col overflow-hidden">
        {/* Grab handle */}
        <div className="pt-2.5 pb-1 flex justify-center shrink-0">
          <span
            aria-hidden="true"
            className="w-10 h-1 rounded-full bg-slate-700"
          />
        </div>

        {/* Sticky 44px+ Sheet Header */}
        <div className="px-4 pb-3 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">More</h2>
            <p className="text-micro text-slate-400 truncate">
              {hasLoadedSave
                ? `${clubName}${saveDate && saveDate !== '--' ? ` · ${saveDate}` : ''}`
                : 'Awaiting .fm Save'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close More menu"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Sheet Content */}
        <div
          className="overflow-y-auto overscroll-contain px-4 pt-3.5 space-y-4"
          style={{
            paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {/* 1. Secondary Club Sections */}
          <section aria-label="More club sections" className="space-y-2">
            <h3 className="text-micro font-semibold uppercase tracking-wider text-slate-400 px-1">
              Club Sections
            </h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  onSelectSecondaryTab('matches');
                  onClose();
                }}
                className={`w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                  activeTab === 'matches'
                    ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-200'
                    : 'bg-slate-800/70 hover:bg-slate-800 border-slate-700/80 text-slate-100'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-lg bg-slate-900/70 border border-slate-700/70 flex items-center justify-center shrink-0">
                    <Trophy className="w-4 h-4 text-emerald-400" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">Matches</div>
                    <div className="text-micro text-slate-400 truncate">
                      Results, form &amp; post-match tactical debriefs
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {matchesCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-micro font-semibold bg-slate-900 text-emerald-300 border border-slate-700">
                      {matchesCount}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectSecondaryTab('staff');
                  onClose();
                }}
                className={`w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                  activeTab === 'staff'
                    ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-200'
                    : 'bg-slate-800/70 hover:bg-slate-800 border-slate-700/80 text-slate-100'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-lg bg-slate-900/70 border border-slate-700/70 flex items-center justify-center shrink-0">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">Staff</div>
                    <div className="text-micro text-slate-400 truncate">
                      Backroom coaching, medical &amp; scouting ratings
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {staffCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-micro font-semibold bg-slate-900 text-emerald-300 border border-slate-700">
                      {staffCount}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenKnowledgeBase();
                }}
                className="w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border bg-slate-800/70 hover:bg-slate-800 border-slate-700/80 text-slate-100 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4 text-emerald-300" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">FM27 Knowledge Base</div>
                    <div className="text-micro text-slate-400 truncate">
                      Patch 27.1.0 IP/OOP roles &amp; Playbook v2.0
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
              </button>
            </div>
          </section>

          {/* 2. Local Cache Status */}
          <section aria-label="Local cache status" className="space-y-2">
            <h3 className="text-micro font-semibold uppercase tracking-wider text-slate-400 px-1">
              Local Cache Status
            </h3>
            <div className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Database className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-white truncate">
                    {cacheSummary.headline}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold shrink-0 border ${
                    isOnline
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-200 border-amber-500/35'
                  }`}
                >
                  {isOnline ? (
                    <>
                      <Wifi className="w-3 h-3" /> Online
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3" /> Offline
                    </>
                  )}
                </span>
              </div>

              <p className="text-micro text-slate-300 leading-snug">
                {cacheSummary.subline}
              </p>

              <div className="grid grid-cols-2 gap-2 text-micro">
                <div className="rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-2 min-w-0">
                  <div className="text-slate-400 text-2xs">Cached Saves</div>
                  <div className="font-semibold text-slate-100 truncate mt-0.5">
                    {loadingCache ? 'Checking…' : cacheSummary.savesLabel}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-2 min-w-0">
                  <div className="text-slate-400 text-2xs">Save Journey</div>
                  <div className="font-semibold text-slate-100 truncate mt-0.5">
                    {loadingCache ? 'Checking…' : cacheSummary.snapshotsLabel}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-micro text-slate-400 pt-0.5 border-t border-slate-800/80">
                <span>Phone Storage</span>
                <span className="font-mono text-slate-200 truncate">
                  {loadingCache ? 'Checking…' : cacheSummary.storageLabel}
                </span>
              </div>

              <p className="text-micro text-slate-400 leading-snug">
                {cacheSummary.offlineNote}
              </p>
            </div>
          </section>

          {/* 3. App & Data Tools (Install, Update, Backup/Restore, Reset) */}
          <section aria-label="App and data tools" className="space-y-2">
            <h3 className="text-micro font-semibold uppercase tracking-wider text-slate-400 px-1">
              App &amp; Data
            </h3>
            <div className="space-y-2">
              {updateAvailable && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onApplyUpdate();
                  }}
                  className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 flex items-center gap-3 text-left transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4 text-emerald-300 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Apply App Update</div>
                    <div className="text-micro text-emerald-200/80">
                      Refresh now to load the newest version safely
                    </div>
                  </div>
                </button>
              )}

              {/* Install App */}
              {isInstalled ? (
                <div className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-emerald-500/25 bg-emerald-950/25 text-emerald-200 flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Installed as App</div>
                    <div className="text-micro text-slate-400">
                      Running full-screen on your device with offline caching
                    </div>
                  </div>
                </div>
              ) : canPromptInstall ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onPromptInstall();
                  }}
                  className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 text-sky-100 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Smartphone className="w-4 h-4 text-sky-300 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Install App</div>
                      <div className="text-micro text-sky-200/80">
                        Opens full-screen with home-screen shortcuts &amp; offline mode
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-sky-300 shrink-0" />
                </button>
              ) : (
                <div className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-slate-700/80 bg-slate-800/70 text-slate-200 flex items-center gap-3">
                  {isIosSafari ? (
                    <Share className="w-4 h-4 text-sky-400 shrink-0" />
                  ) : (
                    <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Install App</div>
                    <div className="text-micro text-slate-400">
                      {isIosSafari
                        ? 'Tap Share in Safari, then choose "Add to Home Screen"'
                        : 'Open Chrome’s ⋮ menu and tap "Install app" or "Add to Home screen"'}
                    </div>
                  </div>
                </div>
              )}

              {/* Export Backup (when save or recruitment data is present) */}
              {hasBackupableData && (
                <button
                  type="button"
                  onClick={() => {
                    onExportBackup();
                    onClose();
                  }}
                  className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-slate-700/80 bg-slate-800/70 hover:bg-slate-800 text-slate-100 flex items-center gap-3 text-left transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Export JSON Backup</div>
                    <div className="text-micro text-slate-400">
                      Save a portable snapshot of your squad &amp; shortlist
                    </div>
                  </div>
                </button>
              )}

              {/* Restore from Backup */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequestRestore();
                }}
                className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-slate-700/80 bg-slate-800/70 hover:bg-slate-800 text-slate-100 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Restore from Backup</div>
                  <div className="text-micro text-slate-400">
                    Import a previously exported .json campaign backup
                  </div>
                </div>
              </button>

              {/* Reset Local Memory (safe 2-tap confirm) */}
              {(hasBackupableData || cacheSummary.hasLocalData) && (
                <button
                  type="button"
                  onClick={handleResetTap}
                  className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border flex items-center gap-3 text-left transition-colors cursor-pointer ${
                    confirmResetPending
                      ? 'border-rose-500/70 bg-rose-950/80 text-rose-100'
                      : 'border-slate-700/80 bg-slate-800/70 hover:bg-rose-950/35 hover:border-rose-800/50 text-slate-200'
                  }`}
                >
                  <Trash2
                    className={`w-4 h-4 shrink-0 ${
                      confirmResetPending ? 'text-rose-300' : 'text-rose-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      {confirmResetPending
                        ? 'Tap Again to Confirm Reset'
                        : 'Reset Local Memory'}
                    </div>
                    <div
                      className={`text-micro ${
                        confirmResetPending ? 'text-rose-200/90' : 'text-slate-400'
                      }`}
                    >
                      {confirmResetPending
                        ? 'Wipes saved squad, cached .fm saves & snapshots and returns to Awaiting .fm Save'
                        : 'Clear all saved phone data and return to Awaiting .fm Save'}
                    </div>
                  </div>
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
