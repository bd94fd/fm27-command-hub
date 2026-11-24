/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowLeftRight, Users } from 'lucide-react';
import { evaluatePlayerForSlot, type SolvedSlot } from '../utils/bestXiSolver';
import {
  formatMobileSurname,
  type BenchRailEntry,
} from '../utils/mobilePitchLayout';

interface PitchBenchRailProps {
  benchEntries: BenchRailEntry[];
  selectedSlot: SolvedSlot | undefined;
  readOnly?: boolean;
  onAssignToSelectedSlot: (playerId: string) => void;
}

/**
 * Swipeable 2-row matchday bench rail below the pitch.
 * Shows live slot fit % for the currently inspected pitch slot and lets Bobby
 * sub any bench player straight into that slot with a single tap.
 */
export const PitchBenchRail: React.FC<PitchBenchRailProps> = ({
  benchEntries,
  selectedSlot,
  readOnly = false,
  onAssignToSelectedSlot,
}) => {
  if (benchEntries.length === 0) return null;

  return (
    <div
      data-testid="pitch-bench-rail"
      className="rounded-xl border border-slate-800 bg-slate-950/75 p-2.5 space-y-2"
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-200 min-w-0">
          <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">
            Matchday Bench ({benchEntries.length})
          </span>
          {selectedSlot && !readOnly && (
            <span className="hidden xs:inline text-[10px] font-normal text-slate-400 truncate">
              · Tap to sub into {selectedSlot.label}
            </span>
          )}
        </div>
        {benchEntries.length > 4 && (
          <span className="text-[10px] font-mono text-slate-400 shrink-0 md:hidden">
            ← Swipe →
          </span>
        )}
      </div>

      {/* 2-row horizontal swipeable bench rail on mobile; compact multi-column grid on desktop */}
      <div className="grid grid-rows-2 grid-flow-col auto-cols-[minmax(144px,1fr)] sm:grid-rows-none sm:grid-flow-row sm:grid-cols-3 gap-1.5 overflow-x-auto sm:overflow-visible snap-x snap-mandatory pb-1 sm:pb-0 -mx-0.5 px-0.5">
        {benchEntries.map((entry) => {
          const p = entry.player;
          const fit = selectedSlot
            ? evaluatePlayerForSlot(
                p,
                selectedSlot.positionGroup,
                selectedSlot.ipRole,
                selectedSlot.oopRole,
                selectedSlot.flank
              )
            : null;
          const isNaturalFit = Boolean(fit?.isNaturalPosition);
          const fitPct = fit?.combinedFitPct ?? 0;

          const fitBadgeCls = isNaturalFit
            ? fitPct >= 75
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-sky-500/15 text-sky-300 border-sky-500/35'
            : 'bg-slate-800 text-slate-400 border-slate-700';

          return (
            <button
              key={p.id}
              type="button"
              disabled={readOnly || !selectedSlot}
              onClick={() => onAssignToSelectedSlot(p.id)}
              title={
                readOnly
                  ? `${p.name} (${p.position}) — Switch to Best XI or Saved Tactic to swap players`
                  : selectedSlot
                    ? `Tap to put ${p.name} into ${selectedSlot.label} (${fitPct}% fit)`
                    : p.name
              }
              className={`snap-start min-h-[54px] rounded-lg border px-2.5 py-1.5 text-left transition flex flex-col justify-between gap-1 ${
                readOnly
                  ? 'border-slate-800 bg-slate-900/60 opacity-75 cursor-default'
                  : isNaturalFit
                    ? 'border-emerald-500/30 bg-slate-900/90 hover:border-emerald-400/70 active:scale-[0.98] cursor-pointer'
                    : 'border-slate-800 bg-slate-900/70 hover:border-slate-600 active:scale-[0.98] cursor-pointer'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-bold text-slate-100 truncate">
                  {formatMobileSurname(p.name)}
                </span>
                {selectedSlot && (
                  <span
                    className={`shrink-0 inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${fitBadgeCls}`}
                  >
                    {!readOnly && <ArrowLeftRight className="w-2.5 h-2.5 opacity-80" />}
                    {fitPct}%
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="rounded bg-slate-800 px-1 py-0.5 text-slate-300 truncate max-w-[60px]">
                    {p.position}
                  </span>
                  <span className="text-amber-400 font-semibold tabular-nums">
                    {(p.ability || 0).toFixed(1)}★
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {entry.cupBanOnly && (
                    <span className="rounded bg-amber-500/15 border border-amber-500/40 px-1 text-[9px] text-amber-300">
                      CUP
                    </span>
                  )}
                  <span className="text-slate-400 tabular-nums">
                    Sta {entry.stamina}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
