import React from 'react';
import { GitCompare, X } from 'lucide-react';
import type { PlayerRecord } from '../../types/fm27';
import type { RecruitmentTarget } from '../../types/fmSave';
import { buildMultiPlayerComparison } from '../../utils/playerComparisonEngine';
import { findTopSeniorStarterForPosition } from '../../utils/recruitmentHelpers';
import { MultiPlayerComparisonChart } from '../FootballAnalyticsCharts';

interface SelectionCompareDockProps {
  compareTrayTargets: RecruitmentTarget[];
  handleToggleCompareTray: (target: RecruitmentTarget) => void;
  setCompareTrayTargets: (targets: RecruitmentTarget[]) => void;
  isMultiCompareOpen: boolean;
  setIsMultiCompareOpen: (open: boolean) => void;
  auditPlayers: PlayerRecord[];
}

export const SelectionCompareDock: React.FC<SelectionCompareDockProps> = ({
  compareTrayTargets,
  handleToggleCompareTray,
  setCompareTrayTargets,
  isMultiCompareOpen,
  setIsMultiCompareOpen,
  auditPlayers,
}) => {
  return (
    <>
    {compareTrayTargets.length > 0 && (
      <div className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-6 z-40 max-w-xl rounded-2xl border border-emerald-500/40 bg-slate-900/95 backdrop-blur-md shadow-2xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
            Compare Tray ({compareTrayTargets.length}/3)
          </span>
          {compareTrayTargets.map((t) => (
            <button
              key={t.uid}
              type="button"
              onClick={() => handleToggleCompareTray(t)}
              className="inline-flex items-center gap-1 rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-rose-500/50"
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
            onClick={() => setCompareTrayTargets([])}
            className="min-h-[40px] px-2.5 rounded-xl border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setIsMultiCompareOpen(true)}
            className="min-h-[40px] px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <GitCompare className="h-3.5 w-3.5" />
            Compare ({compareTrayTargets.length})
          </button>
        </div>
      </div>
    )}

    {/* 3-Player Switchable Radar / Pizza / Bars Comparison Modal */}
    {isMultiCompareOpen && compareTrayTargets.length > 0 && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-4"
        onClick={() => setIsMultiCompareOpen(false)}
      >
        <div
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-4 sm:p-5 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <GitCompare className="h-3.5 w-3.5" />
                Multi-Player Comparison (Radar · Pizza % · Bars)
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                {compareTrayTargets.map((t) => t.name).join(' vs ')}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsMultiCompareOpen(false)}
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
              aria-label="Close multi-player comparison"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <MultiPlayerComparisonChart
            dataset={buildMultiPlayerComparison(
              compareTrayTargets.length === 1
                ? (() => {
                    const starter = findTopSeniorStarterForPosition(
                      compareTrayTargets[0].primaryPosition,
                      auditPlayers
                    );
                    return starter
                      ? [compareTrayTargets[0], starter]
                      : compareTrayTargets;
                  })()
                : compareTrayTargets,
              auditPlayers
            )}
          />
        </div>
      </div>
    )}
    </>
  );
};
