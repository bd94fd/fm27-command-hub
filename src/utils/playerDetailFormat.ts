/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlayerRecord } from '../types/fm27';

export interface AttrRowItem {
  label: string;
  value: number | null;
}

/** FM27 attributes run 1–20: 16+ is elite, 13+ strong, 10+ usable. */
export function attrColorClass(val: number | null): string {
  if (val === null) return 'text-slate-600';
  if (val >= 16) return 'text-emerald-300 font-bold';
  if (val >= 13) return 'text-lime-300 font-semibold';
  if (val >= 10) return 'text-amber-200';
  return 'text-slate-400';
}

/** Familiarity badges on the pitch map: 18+ is natural, 9 and under is a stretch. */
export function pitchBadgeClass(rating: number): string {
  if (rating >= 18) return 'border-emerald-400 bg-emerald-500/20 text-emerald-200';
  if (rating >= 15) return 'border-lime-400/70 bg-lime-500/15 text-lime-200';
  if (rating >= 12) return 'border-amber-400/60 bg-amber-500/15 text-amber-200';
  if (rating >= 9) return 'border-orange-400/50 bg-orange-500/10 text-orange-200';
  return 'border-slate-700 bg-slate-900/70 text-slate-500';
}

/** Role priorities use snake_case keys while player attributes are camelCase. */
export function normalizeAttrKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

/** A save can omit an attribute, which reads as zero; zero is not a real value. */
export function readOptionalAttr(val: number | undefined | null): number | null {
  return typeof val === 'number' && Number.isFinite(val) && val > 0 ? val : null;
}

export function formatFootLabel(player: PlayerRecord): string {
  const pref = player.preferredFoot || 'Right';
  if (
    typeof player.leftFoot === 'number' &&
    typeof player.rightFoot === 'number' &&
    player.leftFoot > 0 &&
    player.rightFoot > 0
  ) {
    return `${pref} (L ${player.leftFoot} / R ${player.rightFoot})`;
  }
  return `${pref} Foot`;
}

export function tierBadgeClass(tier: 'Natural Fit' | 'Solid' | 'Makeshift'): string {
  return tier === 'Natural Fit'
    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
    : tier === 'Solid'
      ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
      : 'bg-amber-500/15 border-amber-500/40 text-amber-300';
}

export function durabilityBadgeClass(tier: string): string {
  return tier === 'Ironman'
    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
    : tier === 'Reliable'
      ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
      : tier === 'Manage Load'
        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
        : 'bg-rose-500/15 border-rose-500/40 text-rose-300';
}
