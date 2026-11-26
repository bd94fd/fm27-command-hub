/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  buildSectionHistoryState,
  buildSectionUrl,
} from '../utils/navigationUrl';

const SHEET_STATE_KEY = '__fm27Sheet';
const TAB_STATE_KEY = '__fm27Tab';
const PANEL_STATE_KEY = '__fm27Panel';
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

export interface NavSection {
  tab: string;
  panel: string | null;
}

function sectionState(section: NavSection, current: Record<string, unknown>) {
  return buildSectionHistoryState(section.tab, section.panel, current, {
    tab: TAB_STATE_KEY,
    panel: PANEL_STATE_KEY,
    sheet: SHEET_STATE_KEY,
  });
}

function sameSection(a: NavSection, b: NavSection): boolean {
  return a.tab === b.tab && (a.panel ?? null) === (b.panel ?? null);
}

/**
 * Keeps the active tab and its panel in the URL and browser history. Back walks the panels
 * and tabs the user visited, then reaches the initial entry and the next Back leaves the app.
 */
export function useSectionHistory<S extends NavSection>(
  section: S,
  onPop: (section: S) => void
): { pushSection: (section: S) => void; replaceSection: (section: S) => void } {
  const sectionRef = useRef(section);
  sectionRef.current = section;
  const onPopRef = useRef(onPop);
  onPopRef.current = onPop;
  const applyingPopRef = useRef(false);
  const writtenRef = useRef<NavSection | null>(null);

  if (writtenRef.current === null) writtenRef.current = section;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const current = sectionRef.current;
    replaceState(
      sectionState(current, readHistoryState()),
      buildSectionUrl(window.location.href, current.tab, current.panel)
    );
    writtenRef.current = current;

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as Record<string, unknown> | null;
      const nextTab = state?.[TAB_STATE_KEY];
      if (typeof nextTab !== 'string') return;
      const nextPanel =
        typeof state?.[PANEL_STATE_KEY] === 'string'
          ? (state[PANEL_STATE_KEY] as string)
          : null;
      if (sameSection({ tab: nextTab, panel: nextPanel }, sectionRef.current)) return;
      applyingPopRef.current = true;
      writtenRef.current = { tab: nextTab, panel: nextPanel };
      onPopRef.current({ ...sectionRef.current, tab: nextTab, panel: nextPanel });
      window.setTimeout(() => {
        applyingPopRef.current = false;
      }, 0);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // A section changed by code rather than by the user (a finished import, a launch action)
  // still has to be the section the address bar shows. Replace, never push, to keep one
  // entry per visit.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const current = sectionRef.current;
    if (writtenRef.current && sameSection(writtenRef.current, current)) return;
    replaceState(
      sectionState(current, readHistoryState()),
      buildSectionUrl(window.location.href, current.tab, current.panel)
    );
    writtenRef.current = current;
  }, [section.tab, section.panel]);

  const pushSection = useCallback((next: S) => {
    if (typeof window === 'undefined' || applyingPopRef.current) return;
    writtenRef.current = next;
    if (sameSection(next, sectionRef.current)) return;
    pushState(sectionState(next, readHistoryState()), buildSectionUrl(window.location.href, next.tab, next.panel));
  }, []);

  const replaceSection = useCallback((next: S) => {
    if (typeof window === 'undefined') return;
    writtenRef.current = next;
    replaceState(sectionState(next, readHistoryState()), buildSectionUrl(window.location.href, next.tab, next.panel));
  }, []);

  return { pushSection, replaceSection };
}
