/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultPanelForTab,
  isValidPanel,
  parseNavigationParams,
  type HubPanel,
  type TacticsPanel,
} from '../utils/navigationUrl';
import { parsePwaLaunchParams } from './usePwaLifecycle';
import { sectionHref, sectionLabel } from '../utils/sectionLabels';
import {
  browserViewStorage,
  readRecentViews,
  recordRecentView,
  writeRecentViews,
  type RecentView,
} from '../utils/viewPreferences';
import { useSectionHistory } from './useHistoryNavigation';

export type ActiveTab =
  | 'sync'
  | 'tactics'
  | 'squad'
  | 'recruitment'
  | 'staff'
  | 'setpieces'
  | 'matches';

export interface NavSection {
  tab: string;
  panel: string | null;
}

/** Reads the tab and panels a cold start should open from `?tab=`, `?panel=` and PWA shortcuts. */
export function resolveInitialSection(search: string): {
  tab: ActiveTab;
  hubPanel: HubPanel;
  tacticsSubTab: TacticsPanel;
} {
  const nav = parseNavigationParams(search);
  const launchTab = parsePwaLaunchParams(search).initialTab as ActiveTab | null;
  const panel = nav.panel;
  return {
    tab: (nav.tab as ActiveTab | null) ?? launchTab ?? 'sync',
    hubPanel: (panel && isValidPanel('sync', panel) ? panel : 'analyst') as HubPanel,
    tacticsSubTab: (panel && isValidPanel('tactics', panel) ? panel : 'pitch') as TacticsPanel,
  };
}

/** `?tab=setpieces` is an old link to a panel inside Tactics, not a tab of its own. */
export function resolveTabTarget(tab: ActiveTab, hubPanel: HubPanel): NavSection {
  if (tab === 'setpieces') return { tab: 'tactics', panel: 'setpieces' };
  if (tab === 'tactics') return { tab: 'tactics', panel: 'pitch' };
  if (tab === 'sync') return { tab: 'sync', panel: hubPanel };
  return { tab, panel: defaultPanelForTab(tab) };
}

export interface AppNavigation {
  activeTab: ActiveTab;
  hubPanel: HubPanel;
  tacticsSubTab: TacticsPanel;
  navSection: NavSection;
  recentViews: RecentView[];
  setActiveTab: React.Dispatch<React.SetStateAction<ActiveTab>>;
  selectTab: (tab: ActiveTab) => void;
  changeHubPanel: (panel: HubPanel) => void;
  changeTacticsSubTab: (panel: TacticsPanel) => void;
  openRecentView: (href: string) => void;
  scrollToTop: () => void;
}

/**
 * Owns which section the app shows and keeps the URL, browser history and the
 * recent-views list in step with it. `isOverlayOpen` decides whether a tab
 * change replaces the overlay's history entry or stacks a new one.
 */
export function useAppNavigation(isOverlayOpen: () => boolean): AppNavigation {
  const [initial] = useState(() =>
    resolveInitialSection(typeof window === 'undefined' ? '' : window.location.search)
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>(initial.tab);
  const [hubPanel, setHubPanelState] = useState<HubPanel>(initial.hubPanel);
  const [tacticsSubTab, setTacticsSubTabState] = useState<TacticsPanel>(
    initial.tacticsSubTab
  );
  const [recentViews, setRecentViews] = useState<RecentView[]>(() =>
    readRecentViews(browserViewStorage())
  );

  const overlayRef = useRef(isOverlayOpen);
  overlayRef.current = isOverlayOpen;

  const scrollToTop = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const navSection = useMemo<NavSection>(
    () => ({
      tab: activeTab as string,
      panel:
        activeTab === 'sync'
          ? hubPanel
          : activeTab === 'tactics'
            ? tacticsSubTab
            : defaultPanelForTab(activeTab),
    }),
    [activeTab, hubPanel, tacticsSubTab]
  );

  useEffect(() => {
    const href = sectionHref(navSection.tab, navSection.panel);
    setRecentViews((prev) => {
      if (prev[0]?.href === href) return prev;
      const next = recordRecentView(prev, {
        href,
        label: sectionLabel(navSection.tab, navSection.panel),
      });
      writeRecentViews(browserViewStorage(), next);
      return next;
    });
  }, [navSection.tab, navSection.panel]);

  const applySection = useCallback(
    (tab: ActiveTab, panel: string | null) => {
      setActiveTab(tab);
      if (tab === 'sync' && panel) setHubPanelState(panel as HubPanel);
      if (tab === 'tactics' && panel) setTacticsSubTabState(panel as TacticsPanel);
      scrollToTop();
    },
    [scrollToTop]
  );

  const { pushSection, replaceSection } = useSectionHistory(navSection, (next) =>
    applySection(next.tab as ActiveTab, next.panel)
  );

  const selectTab = useCallback(
    (tab: ActiveTab) => {
      const target = resolveTabTarget(tab, hubPanel);
      if (tab === 'setpieces') {
        setTacticsSubTabState('setpieces');
      } else if (tab === 'tactics') {
        setTacticsSubTabState('pitch');
      }
      // A tab chosen while an overlay is open replaces that overlay's history entry
      // instead of stacking a stale entry behind the new tab.
      if (overlayRef.current()) {
        replaceSection(target);
      } else {
        pushSection(target);
      }
      setActiveTab(target.tab as ActiveTab);
      scrollToTop();
    },
    [hubPanel, pushSection, replaceSection, scrollToTop]
  );

  const openRecentView = useCallback(
    (href: string) => {
      const { tab, panel } = parseNavigationParams(href);
      if (!tab) return;
      const nextTab = tab as ActiveTab;
      setActiveTab(nextTab);
      if (nextTab === 'sync' && panel) setHubPanelState(panel as HubPanel);
      if (nextTab === 'tactics' && panel) setTacticsSubTabState(panel as TacticsPanel);
      pushSection({ tab: nextTab, panel: panel ?? defaultPanelForTab(nextTab) });
      scrollToTop();
    },
    [pushSection, scrollToTop]
  );

  const changeHubPanel = useCallback(
    (panel: HubPanel) => {
      setHubPanelState(panel);
      pushSection({ tab: 'sync', panel });
    },
    [pushSection]
  );

  const changeTacticsSubTab = useCallback(
    (panel: TacticsPanel) => {
      setTacticsSubTabState(panel);
      pushSection({ tab: 'tactics', panel });
    },
    [pushSection]
  );

  return {
    activeTab,
    hubPanel,
    tacticsSubTab,
    navSection,
    recentViews,
    setActiveTab,
    selectTab,
    changeHubPanel,
    changeTacticsSubTab,
    openRecentView,
    scrollToTop,
  };
}
