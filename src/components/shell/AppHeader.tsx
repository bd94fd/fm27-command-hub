/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BookOpen, Download, RefreshCw, Search, Share2, Trash2, Upload } from 'lucide-react';
import type { AppActiveTabId } from '../../utils/mobileNavHelpers';
import type { BackgroundSyncStatus } from './backgroundSync';

interface AppHeaderProps {
  clubName: string;
  activeTab: AppActiveTabId;
  squadCount: number;
  matchCount: number;
  staffCount: number;
  hasData: boolean;
  backgroundSync: BackgroundSyncStatus | null;
  confirmResetPending: boolean;
  quickFmInputRef: React.RefObject<HTMLInputElement | null>;
  backupInputRef: React.RefObject<HTMLInputElement | null>;
  onSelectTab: (tab: AppActiveTabId) => void;
  onQuickSync: () => void;
  onQuickFmPicked: React.ChangeEventHandler<HTMLInputElement>;
  onImportBackup: React.ChangeEventHandler<HTMLInputElement>;
  onOpenSearch: () => void;
  onOpenKnowledgeBase: () => void;
  onOpenShare: () => void;
  onExportBackup: () => void;
  onResetMemory: () => void;
}

/**
 * Skip link, brand, desktop section nav and the header actions. The mobile
 * action set is deliberately small; everything else lives in the More sheet.
 */
export function AppHeader({
  clubName,
  activeTab,
  squadCount,
  matchCount,
  staffCount,
  hasData,
  backgroundSync,
  confirmResetPending,
  quickFmInputRef,
  backupInputRef,
  onSelectTab,
  onQuickSync,
  onQuickFmPicked,
  onImportBackup,
  onOpenSearch,
  onOpenKnowledgeBase,
  onOpenShare,
  onExportBackup,
  onResetMemory,
}: AppHeaderProps) {
  return (
    <>
      <a
        href="#main-content"
        onClick={(event) => {
          // Focus the target directly and keep the hash out of the URL: sheet
          // history handling re-applies a fragment on close and would pull
          // focus back to <main> from whatever opened the sheet.
          event.preventDefault();
          const main = document.getElementById('main-content');
          if (main) {
            main.focus();
            main.scrollIntoView({ block: 'start' });
          }
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      {/* Top Navigation Shell (mobile header ~56.6px + BottomNav ~55.8px = ~112.4px <= 15% of 800px) */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-x-2.5 sm:gap-x-4 px-3.5 sm:px-6 pb-1.5 sm:pb-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800"
        style={{
          paddingTop: 'calc(0.35rem + env(safe-area-inset-top, 0px))',
        }}
      >
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('sync');
          }}
          className="min-h-[44px] md:min-h-[36px] flex items-center text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 min-w-0 flex-1 md:flex-initial"
        >
          <h1 className="truncate text-base sm:text-lg font-bold tracking-tight">
            {clubName}
          </h1>
        </a>

        {/* Desktop Navigation Tabs (mobile uses 5-tab fixed bottom bar + More sheet below) */}
        <nav
          aria-label="Primary sections"
          className="hidden md:flex items-center gap-4 lg:gap-5 text-xs lg:text-sm font-medium text-slate-600 dark:text-slate-400 overflow-x-auto"
        >
          {[
            { id: 'sync' as const, label: 'Hub & Analyst' },
            { id: 'squad' as const, label: `Squad (${squadCount})` },
            { id: 'tactics' as const, label: 'Tactics & Corners' },
            { id: 'recruitment' as const, label: 'Transfers' },
            { id: 'matches' as const, label: `Matches (${matchCount})` },
            {
              id: 'staff' as const,
              label: staffCount > 0 ? `Staff (${staffCount})` : 'Staff',
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`inline-flex items-center min-h-[36px] px-1.5 hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'text-emerald-700 dark:text-emerald-400 underline underline-offset-4 font-semibold'
                  : ''
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Actions: Mobile stays uncluttered (1-Tap Sync .fm + Quick Search); KB/Backup/Restore/Reset move to More sheet on mobile */}
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={quickFmInputRef}
            type="file"
            accept=".fm"
            onChange={onQuickFmPicked}
            className="hidden"
          />
          <input
            ref={backupInputRef}
            type="file"
            accept=".json"
            onChange={onImportBackup}
            className="hidden"
          />

          {/* Always-visible 1-tap mobile Sync .fm CTA (44px+ touch target) */}
          <button
            type="button"
            onClick={onQuickSync}
            title={
              backgroundSync
                ? 'View active .fm save upload progress'
                : 'Pick a .fm save file to sync immediately'
            }
            className={`md:hidden inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              backgroundSync
                ? backgroundSync.paused
                  ? 'text-slate-950 bg-amber-400 hover:bg-amber-300'
                  : 'text-slate-950 bg-emerald-400 hover:bg-emerald-300'
                : 'text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-sm shadow-emerald-500/20'
            }`}
          >
            {backgroundSync ? (
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${
                  backgroundSync.paused ? '' : 'animate-spin motion-reduce:animate-none'
                }`}
              />
            ) : (
              <Upload className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>
              {backgroundSync
                ? backgroundSync.paused
                  ? 'Paused'
                  : typeof backgroundSync.progressPct === 'number'
                    ? `${backgroundSync.progressPct}%`
                    : 'Syncing'
                : 'Sync .fm'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenSearch()}
            aria-label="Quick Search players, staff, and scout targets"
            title="Quick Search players, staff, and scout targets"
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] md:min-h-[38px] md:min-w-[38px] px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl md:rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <Search className="w-4 h-4 md:w-3.5 md:h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden md:inline">Search</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenKnowledgeBase()}
            aria-label="FM27 KB: open the Patch 27.1.0 knowledge base"
            title="Open FM27 Patch 27.1.0 Knowledge Base"
            className="hidden md:inline-flex items-center justify-center gap-1 min-h-[38px] min-w-[38px] px-2.5 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>FM27 KB</span>
          </button>

          {hasData ? (
            <>
              <button
                type="button"
                onClick={() => onOpenShare()}
                aria-label="Share and export a clean report"
                title="Share and export: CSV, PNG card, print or PDF, read-only link"
                className="hidden md:inline-flex items-center justify-center gap-1 min-h-[38px] min-w-[38px] px-2 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden lg:inline">Share</span>
              </button>

              <button
                type="button"
                onClick={onExportBackup}
                aria-label="Export campaign snapshot as JSON backup"
                title="Export campaign snapshot as JSON backup"
                className="hidden md:inline-flex items-center justify-center gap-1 min-h-[38px] min-w-[38px] px-2 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline">Backup</span>
              </button>

              <button
                type="button"
                onClick={onResetMemory}
                aria-label={
                  confirmResetPending
                    ? 'Confirm Reset?'
                    : 'Reset: clear saved memory'
                }
                title={
                  confirmResetPending
                    ? 'Click again to wipe saved memory and return to Awaiting .fm Save'
                    : 'Clear saved memory and return to clean Awaiting Save state'
                }
                className={`hidden md:inline-flex items-center justify-center gap-1 min-h-[38px] min-w-[38px] px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  confirmResetPending
                    ? 'text-rose-200 bg-rose-950/80 border-rose-500/60 hover:bg-rose-900/80'
                    : 'text-slate-400 hover:text-red-400 bg-slate-800/70 hover:bg-red-950/40 border-slate-700/80 hover:border-red-800/50'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className={confirmResetPending ? 'inline' : 'hidden lg:inline'}>
                  {confirmResetPending ? 'Confirm Reset?' : 'Reset'}
                </span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
              aria-label="Restore previous campaign from a JSON backup file"
              title="Restore previous campaign from a JSON backup file"
              className="hidden md:inline-flex items-center justify-center gap-1 min-h-[38px] min-w-[38px] px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span>Restore</span>
            </button>
          )}
        </div>
      </header>
    </>
  );
}
