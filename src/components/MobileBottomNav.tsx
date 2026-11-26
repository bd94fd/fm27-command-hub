/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Briefcase,
  LayoutGrid,
  MessageSquare,
  Shield,
  Users,
} from 'lucide-react';
import {
  AppActiveTabId,
  getMobileTabAction,
  MobileNavButtonId,
  PrimaryMobileTabId,
  resolveMobileNavHighlight,
} from '../utils/mobileNavHelpers';

interface MobileBottomNavProps {
  activeTab: AppActiveTabId;
  isMoreOpen: boolean;
  hasActiveSync?: boolean;
  isSyncPaused?: boolean;
  hasUpdateAvailable?: boolean;
  hidden?: boolean;
  onSelectPrimaryTab: (tab: PrimaryMobileTabId) => void;
  onScrollToTop: () => void;
  onToggleMore: () => void;
  onCloseMore: () => void;
}

const MOBILE_NAV_ITEMS: ReadonlyArray<{
  id: MobileNavButtonId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'sync', label: 'Hub', icon: MessageSquare },
  { id: 'squad', label: 'Squad', icon: Users },
  { id: 'tactics', label: 'Tactics', icon: Shield },
  { id: 'recruitment', label: 'Transfers', icon: Briefcase },
  { id: 'more', label: 'More', icon: LayoutGrid },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  isMoreOpen,
  hasActiveSync = false,
  isSyncPaused = false,
  hasUpdateAvailable = false,
  hidden = false,
  onSelectPrimaryTab,
  onScrollToTop,
  onToggleMore,
  onCloseMore,
}) => {
  if (hidden) return null;

  const highlightedId = resolveMobileNavHighlight(activeTab, isMoreOpen);
  const isSecondaryTabActive = activeTab === 'matches' || activeTab === 'staff';

  const handlePress = (id: MobileNavButtonId) => {
    const action = getMobileTabAction(id, activeTab, isMoreOpen);
    if (action.kind === 'toggle-more') {
      onToggleMore();
      return;
    }
    if (action.closeMore) {
      onCloseMore();
    }
    if (action.kind === 'scroll-top') {
      onScrollToTop();
      return;
    }
    onSelectPrimaryTab(action.tab);
  };

  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 px-1.5 pt-1 grid grid-cols-5 gap-1"
      style={{
        paddingBottom: 'calc(0.3rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {MOBILE_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isHighlighted = highlightedId === item.id;
        const isMoreButton = item.id === 'more';
        const showSyncDot = item.id === 'sync' && hasActiveSync;
        const showMoreBadge =
          isMoreButton && (hasUpdateAvailable || (isSecondaryTabActive && !isMoreOpen));

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handlePress(item.id)}
            aria-current={isHighlighted && !isMoreButton ? 'page' : undefined}
            aria-expanded={isMoreButton ? isMoreOpen : undefined}
            aria-controls={isMoreButton ? 'mobile-more-sheet' : undefined}
            className={`relative min-w-0 min-h-[46px] flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-micro leading-tight font-medium transition-colors cursor-pointer select-none whitespace-nowrap ${
              isHighlighted
                ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 active:bg-slate-200/70 dark:active:bg-slate-800/70'
            }`}
          >
            <span className="relative inline-flex items-center justify-center">
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {showSyncDot && (
                <span
                  aria-hidden="true"
                  className={`absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                    isSyncPaused
                      ? 'bg-amber-400'
                      : 'bg-emerald-500 dark:bg-emerald-400 animate-pulse motion-reduce:animate-none'
                  }`}
                />
              )}
              {showMoreBadge && (
                <span
                  aria-hidden="true"
                  className={`absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                    hasUpdateAvailable ? 'bg-sky-500 dark:bg-sky-400' : 'bg-emerald-500 dark:bg-emerald-400'
                  }`}
                />
              )}
            </span>
            <span className="truncate max-w-full whitespace-nowrap">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
