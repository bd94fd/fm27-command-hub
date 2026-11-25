/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef } from 'react';

const SHEET_STATE_KEY = '__fm27Sheet';
const TAB_STATE_KEY = '__fm27Tab';
let sheetSequence = 0;

function readHistoryState(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  const state = window.history.state;
  return state && typeof state === 'object'
    ? { ...(state as Record<string, unknown>) }
    : {};
}

function replaceState(state: Record<string, unknown>, url?: string): void {
  try {
    window.history.replaceState(state, '', url);
  } catch {
    // History is unavailable in some embedded webviews; navigation still works.
  }
}

function pushState(state: Record<string, unknown>, url?: string): void {
  try {
    window.history.pushState(state, '', url);
  } catch {
    // History is unavailable in some embedded webviews; navigation still works.
  }
}

export function buildTabUrl(tab: string, href: string): string {
  const url = new URL(href);
  url.searchParams.set('tab', tab);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** A tab entry must not inherit a closed overlay's state, or its cleanup would pop the tab. */
export function buildTabHistoryState<T extends string>(
  tab: T,
  current: Record<string, unknown>
): Record<string, unknown> {
  const state: Record<string, unknown> = { ...current, [TAB_STATE_KEY]: tab };
  delete state[SHEET_STATE_KEY];
  return state;
}

/**
 * Gives one sheet its own history entry. Back closes the sheet instead of leaving the app.
 * Nested sheets each push an entry, so Back unwinds them one at a time.
 */
export function useSheetHistory(isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const layerIdRef = useRef<string>('');

  if (!layerIdRef.current) {
    sheetSequence += 1;
    layerIdRef.current = `fm27-sheet-${sheetSequence}`;
  }

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const layerId = layerIdRef.current;
    pushState({ ...readHistoryState(), [SHEET_STATE_KEY]: layerId });

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as Record<string, unknown> | null;
      if (state?.[SHEET_STATE_KEY] !== layerId) {
        onCloseRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Closing from the UI removes the entry this sheet owns. A popstate close already
      // points at the previous entry, so it must not call back again.
      if (readHistoryState()[SHEET_STATE_KEY] === layerId) {
        try {
          window.history.back();
        } catch {
          // ignore history errors in restricted frames
        }
      }
    };
  }, [isOpen]);
}

/**
 * Keeps the active tab in the URL and browser history. Back walks the tabs the user visited,
 * then reaches the initial entry and the next Back leaves the app.
 */
export function useTabHistory<T extends string>(
  activeTab: T,
  onPopTab: (tab: T) => void
): { pushTab: (tab: T) => void; replaceTab: (tab: T) => void } {
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const onPopTabRef = useRef(onPopTab);
  onPopTabRef.current = onPopTab;
  const applyingPopRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    replaceState(
      buildTabHistoryState(activeTabRef.current, readHistoryState()),
      buildTabUrl(activeTabRef.current, window.location.href)
    );

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as Record<string, unknown> | null;
      const nextTab = state?.[TAB_STATE_KEY];
      if (typeof nextTab !== 'string' || nextTab === activeTabRef.current) return;
      applyingPopRef.current = true;
      onPopTabRef.current(nextTab as T);
      window.setTimeout(() => {
        applyingPopRef.current = false;
      }, 0);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const pushTab = useCallback((tab: T) => {
    if (typeof window === 'undefined' || applyingPopRef.current) return;
    if (tab === activeTabRef.current) return;
    pushState(buildTabHistoryState(tab, readHistoryState()), buildTabUrl(tab, window.location.href));
  }, []);

  const replaceTab = useCallback((tab: T) => {
    if (typeof window === 'undefined') return;
    replaceState(buildTabHistoryState(tab, readHistoryState()), buildTabUrl(tab, window.location.href));
  }, []);

  return { pushTab, replaceTab };
}
