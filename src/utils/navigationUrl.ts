/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One place that decides which tab and which panel a URL describes, so the address bar,
 * history and deep links always agree with what the user sees.
 */

export const NAV_TABS = [
  'sync',
  'squad',
  'tactics',
  'recruitment',
  'matches',
  'staff',
] as const;

export type NavTab = (typeof NAV_TABS)[number];

export const HUB_PANELS = ['analyst', 'finances', 'journey', 'quality'] as const;
export type HubPanel = (typeof HUB_PANELS)[number];

export const TACTICS_PANELS = ['pitch', 'prep', 'setpieces', 'playbook'] as const;
export type TacticsPanel = (typeof TACTICS_PANELS)[number];

/** URL panel id to the id AutoSyncWorkspace uses internally. */
export const HUB_PANEL_TO_VIEW: Record<HubPanel, 'chat' | 'finances' | 'journey' | 'data'> = {
  analyst: 'chat',
  finances: 'finances',
  journey: 'journey',
  quality: 'data',
};

export const VIEW_TO_HUB_PANEL: Record<
  'chat' | 'finances' | 'journey' | 'data',
  HubPanel
> = {
  chat: 'analyst',
  finances: 'finances',
  journey: 'journey',
  data: 'quality',
};

/** Tabs whose panels are addressable. A tab without panels keeps `?panel=` empty. */
const PANELS_BY_TAB: Partial<Record<NavTab, readonly string[]>> = {
  sync: HUB_PANELS,
  tactics: TACTICS_PANELS,
};

/**
 * `?tab=setpieces` was a real destination inside Tactics before panels had addresses.
 * Links and saved shortcuts that use it must keep working.
 */
const TAB_ALIASES: Record<string, { tab: NavTab; panel: string }> = {
  setpieces: { tab: 'tactics', panel: 'setpieces' },
};

const DEFAULT_PANEL: Partial<Record<NavTab, string>> = {
  sync: 'analyst',
  tactics: 'pitch',
};

export function isNavTab(value: string): value is NavTab {
  return (NAV_TABS as readonly string[]).includes(value);
}

export function panelsForTab(tab: string): readonly string[] {
  return isNavTab(tab) ? (PANELS_BY_TAB[tab] ?? []) : [];
}

export function isValidPanel(tab: string, panel: string): boolean {
  return panelsForTab(tab).includes(panel);
}

export function defaultPanelForTab(tab: string): string | null {
  return isNavTab(tab) ? (DEFAULT_PANEL[tab] ?? null) : null;
}

/**
 * Reads `?tab=` and `?panel=`. Unknown values become null instead of being trusted, so a
 * hand-edited or stale URL cannot leave the app in a state it cannot render.
 */
export function parseNavigationParams(search: string): {
  tab: NavTab | null;
  panel: string | null;
} {
  if (!search) return { tab: null, panel: null };
  const params = new URLSearchParams(search);
  const rawTab = (params.get('tab') || '').trim().toLowerCase();
  const rawPanel = (params.get('panel') || '').trim().toLowerCase();
  if (!rawTab) return { tab: null, panel: null };

  const alias = TAB_ALIASES[rawTab];
  if (alias) {
    return {
      tab: alias.tab,
      panel: isValidPanel(alias.tab, rawPanel) ? rawPanel : alias.panel,
    };
  }
  if (!isNavTab(rawTab)) return { tab: null, panel: null };
  return { tab: rawTab, panel: isValidPanel(rawTab, rawPanel) ? rawPanel : null };
}

/** Builds the URL for a section, dropping `panel` for tabs that have none. */
export function buildSectionUrl(href: string, tab: string, panel?: string | null): string {
  const url = new URL(href);
  url.searchParams.set('tab', tab);
  url.searchParams.delete('panel');
  if (panel && isValidPanel(tab, panel)) {
    url.searchParams.set('panel', panel);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** A section entry must not inherit a closed overlay's state. */
export function buildSectionHistoryState(
  tab: string,
  panel: string | null | undefined,
  current: Record<string, unknown>,
  keys: { tab: string; panel: string; sheet: string }
): Record<string, unknown> {
  const state: Record<string, unknown> = { ...current, [keys.tab]: tab };
  delete state[keys.sheet];
  if (panel) {
    state[keys.panel] = panel;
  } else {
    delete state[keys.panel];
  }
  return state;
}
