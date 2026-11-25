import React from 'react';
import { GitCompare, X } from 'lucide-react';
import type { PlayerRecord } from '../../types/fm27';
import type { RecruitmentTarget } from '../../types/fmSave';
import { buildMultiPlayerComparison } from '../../utils/playerComparisonEngine';
import { findTopSeniorStarterForPosition } from '../../utils/recruitmentHelpers';
import { useCompareTray } from '../../context/CompareTrayContext';
import { MultiPlayerComparisonChart } from '../charts/MultiPlayerComparisonChart';
import { MobileSheetFrame } from '../MobileSheetFrame';

interface SelectionCompareDockProps {
  auditPlayers: PlayerRecord[];
}

export const SelectionCompareDock: React.FC<SelectionCompareDockProps> = ({
  auditPlayers,
}) => {
  const {
    targets: compareTrayTargets,
    toggle: handleToggleCompareTray,
    clear: clearCompareTray,
    isOpen: isMultiCompareOpen,
    setOpen: setIsMultiCompareOpen,
  } = useCompareTray();

  return (
    <>
      {compareTrayTargets.length > 0 && (
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-4 left-3 right-3 sm:left-auto sm:right-6 z-40 max-w-xl rounded-2xl border border-emerald-500/40 bg-slate-900/95 backdrop-blur-md shadow-2xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              Compare Tray ({compareTrayTargets.length}/3)
            </span>
            {compareTrayTargets.map((t) => (
              <button
                key={t.uid}
                type="button"
                onClick={() => handleToggleCompareTray(t)}
                className="inline-flex items-center gap-1 rounded-full bg-slate-800 border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200 hover:border-rose-500/50 cursor-pointer"
                title="Remove from tray"
              >
                <span className="truncate max-w-[90px]">{t.name}</span>
                <X className="h-3 w-3 text-slate-400" />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => clearCompareTray()}
              className="min-h-[44px] px-3 rounded-xl border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setIsMultiCompareOpen(true)}
              className="min-h-[44px] px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <GitCompare className="h-3.5 w-3.5" />
              Compare ({compareTrayTargets.length})
            </button>
          </div>
        </div>
      )}

      {/* 3-Player Switchable Radar / Pizza / Bars Comparison Sheet */}
      <MobileSheetFrame
        isOpen={isMultiCompareOpen && compareTrayTargets.length > 0}
        onClose={() => setIsMultiCompareOpen(false)}
        ariaLabel="Multi-player comparison"
        closeAriaLabel="Close multi-player comparison"
        maxWidthClass="sm:max-w-2xl"
        bodyClassName="p-4 sm:p-5 space-y-4"
        header={
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <GitCompare className="h-3.5 w-3.5 shrink-0" />
              Multi-Player Comparison (Radar · Pizza % · Bars)
            </div>
            <h3 className="text-base font-bold text-white mt-0.5 break-words">
              {compareTrayTargets.map((t) => t.name).join(' vs ')}
            </h3>
          </div>
        }
      >
        <MultiPlayerComparisonChart
          dataset={buildMultiPlayerComparison(
            compareTrayTargets.length === 1
              ? (() => {
                  const only = compareTrayTargets[0];
                  const starter = findTopSeniorStarterForPosition(
                    only.primaryPosition,
                    auditPlayers
                  );
                  // A squad member can be the best starter himself: never compare a player with himself.
                  const isSamePlayer =
                    starter !== null && (starter.uid ?? 0) === only.uid;
                  return starter && !isSamePlayer ? [only, starter] : compareTrayTargets;
                })()
              : compareTrayTargets,
            auditPlayers
          )}
        />
      </MobileSheetFrame>
    </>
  );
};
