/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SlidersHorizontal, Shield, AlertTriangle } from 'lucide-react';
import {
  computeDurabilityProfile,
  type SolvedSlot,
} from '../utils/bestXiSolver';
import {
  getRestDefenseRoleExplanation,
  type RestDefenseSlotNode,
} from '../utils/restDefenseEngine';

interface PitchInspectStripProps {
  slot: SolvedSlot | undefined;
  restNode: RestDefenseSlotNode | undefined;
  onJumpToEditor?: () => void;
}

/**
 * Docked Tap-to-Inspect IP/OOP strip positioned immediately below the pitch.
 * Lets Android/mobile users tap any compact pitch node and read the player's
 * full name, star rating, Durability, IP & OOP roles, and plain-English Rest
 * Defence job without scrolling down to the full role editor.
 */
export const PitchInspectStrip: React.FC<PitchInspectStripProps> = ({
  slot,
  restNode,
  onJumpToEditor,
}) => {
  if (!slot) return null;

  const player = slot.player;
  const dur = player ? computeDurabilityProfile(player) : null;
  const hasWarning = slot.warnings.length > 0 || !slot.isNaturalPosition;

  const restToneClass =
    restNode?.category === 'BASE_ANCHOR'
      ? 'border-emerald-500/35 bg-emerald-950/35 text-emerald-200'
      : restNode?.category === 'TRANSITION_SHUTTLE'
        ? 'border-sky-500/35 bg-sky-950/35 text-sky-200'
        : restNode?.category === 'ATTACKING_OUTLET'
          ? 'border-purple-500/35 bg-purple-950/35 text-purple-200'
          : 'border-slate-700 bg-slate-900/70 text-slate-300';

  const durToneClass =
    dur?.label === 'Ironman'
      ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
      : dur?.label === 'Durable'
        ? 'bg-sky-500/15 border-sky-500/35 text-sky-300'
        : dur?.label === 'Manage Load' || dur?.label === 'Low Sharpness'
          ? 'bg-amber-500/15 border-amber-500/35 text-amber-300'
          : 'bg-rose-500/15 border-rose-500/35 text-rose-300';

  return (
    <div
      data-testid="pitch-inspect-strip"
      className="rounded-xl border border-emerald-500/35 bg-slate-950/85 p-3 space-y-2.5"
    >
      {/* Top Identity Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-2xs font-mono font-bold text-emerald-300">
              {slot.label}
            </span>
            <span className="text-sm font-bold text-white truncate">
              {player ? player.name : 'Unassigned Slot'}
            </span>
            {player && (
              <span className="font-mono text-micro font-bold text-amber-400 tabular-nums shrink-0">
                {(player.ability || 0).toFixed(1)}★
                <span className="text-slate-500 font-normal">
                  /{(player.potential || 0).toFixed(1)}★
                </span>
              </span>
            )}
          </div>

          {player && dur && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-micro">
              <span className="rounded-md bg-slate-800 px-1.5 py-0.5 font-mono text-2xs text-slate-300">
                {player.position}
              </span>
              <span
                className={`rounded-md border px-1.5 py-0.5 text-2xs font-semibold ${durToneClass}`}
              >
                {dur.label} · Sta {dur.stamina} / NF {dur.naturalFitness}
              </span>
              {dur.sharpness !== null && (
                <span className="font-mono text-2xs text-slate-400">
                  Sharp {dur.sharpness}%
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {player && (
            <span
              className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold tabular-nums border ${
                slot.combinedFitPct >= 80
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : slot.combinedFitPct >= 65
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              }`}
            >
              {slot.combinedFitPct}% Fit
            </span>
          )}
          {onJumpToEditor && (
            <button
              type="button"
              onClick={onJumpToEditor}
              className="lg:hidden inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 min-h-[44px] text-xs font-semibold text-slate-200 transition cursor-pointer whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Edit Role</span>
            </button>
          )}
        </div>
      </div>

      {/* Dual-Phase IP & OOP Role Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-1.5 min-w-0">
          <div className="flex items-center justify-between gap-1 text-2xs font-mono uppercase tracking-wider text-emerald-400">
            <span>In Possession</span>
            {player && <span className="font-bold tabular-nums">{slot.ipFitPct}%</span>}
          </div>
          <div className="mt-0.5 text-xs font-semibold text-white leading-snug break-words">
            {slot.ipRole}
          </div>
        </div>

        <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 px-2.5 py-1.5 min-w-0">
          <div className="flex items-center justify-between gap-1 text-2xs font-mono uppercase tracking-wider text-sky-400">
            <span>Out of Poss.</span>
            {player && <span className="font-bold tabular-nums">{slot.oopFitPct}%</span>}
          </div>
          <div className="mt-0.5 text-xs font-semibold text-white leading-snug break-words">
            {slot.oopRole}
          </div>
        </div>
      </div>

      {/* Plain-English Rest Defence Job */}
      {restNode && (
        <div className={`rounded-lg border px-2.5 py-1.5 text-micro leading-snug ${restToneClass}`}>
          <div className="flex items-center gap-1.5 font-bold">
            <Shield className="w-3 h-3 shrink-0" />
            <span>
              {restNode.categoryLabel.replace('Rest-Defense', 'Rest Defence')}
            </span>
          </div>
          <p className="mt-0.5 opacity-90">
            {getRestDefenseRoleExplanation(restNode.categoryLabel, restNode.category)}
          </p>
        </div>
      )}

      {/* Natural Position / Warning Callout */}
      {hasWarning && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-2.5 py-1.5 text-micro text-amber-200 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span>
            {slot.warnings.length > 0
              ? slot.warnings.join(' · ')
              : 'Out-of-position assignment — tap a natural sub from the bench rail below to strengthen this slot.'}
          </span>
        </div>
      )}
    </div>
  );
};
