/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Readable names for locations, used by the palette's recent list.
 */

import { defaultPanelForTab } from './navigationUrl';

export const TAB_LABELS: Record<string, string> = {
  sync: 'Hub & Analyst',
  squad: 'Squad ratings',
  tactics: 'Tactics & Corners',
  recruitment: 'Transfers',
  matches: 'Matches',
  staff: 'Staff',
};

export const PANEL_LABELS: Record<string, string> = {
  analyst: 'Analyst',
  finances: 'Finances',
  journey: 'Journey',
  quality: 'Data quality',
  pitch: 'Pitch XI',
  prep: 'Match prep',
  setpieces: 'Corners & training',
  playbook: 'Playbook',
};

/** `Tactics & Corners · Match prep`, or just the tab name for a default panel. */
export function sectionLabel(tab: string, panel?: string | null): string {
  const base = TAB_LABELS[tab] ?? 'Command Hub';
  if (!panel || panel === defaultPanelForTab(tab)) return base;
  const extra = PANEL_LABELS[panel];
  return extra ? `${base} · ${extra}` : base;
}

/** In-app href for a location, always starting at `?` so storage can validate it. */
export function sectionHref(tab: string, panel?: string | null): string {
  const params = new URLSearchParams();
  params.set('tab', tab);
  if (panel && panel !== defaultPanelForTab(tab)) params.set('panel', panel);
  return `?${params.toString()}`;
}
