import React from 'react';
import { GitCompare } from 'lucide-react';
import type { RecruitmentTarget } from '../../types/fmSave';
import type { ShortlistTargetAdvice } from '../../utils/shortlistAdviceEngine';
import { isScoutTargetTracked } from '../../services/fmStorage';
import type { ActiveComparison } from './recruitmentTypes';
import { MobileSheetFrame } from '../MobileSheetFrame';
import { formatWeeklyWage } from '../../utils/squadViewHelpers';

interface CompareTargetModalProps {
  activeComparison: ActiveComparison | null;
  shortlistAdvice?: ShortlistTargetAdvice | null;
  setCompareTarget: (target: RecruitmentTarget | null) => void;
  handleOpenTargetCard: (target: RecruitmentTarget) => void;
  handleToggleTrack: (target: RecruitmentTarget) => void;
  trackedTargets: RecruitmentTarget[];
}

export const CompareTargetModal: React.FC<CompareTargetModalProps> = ({
  activeComparison,
  shortlistAdvice = null,
  setCompareTarget,
  handleOpenTargetCard,
  handleToggleTrack,
  trackedTargets,
}) => {
  if (!activeComparison) return null;

  return (
    <MobileSheetFrame
      isOpen={Boolean(activeComparison)}
      onClose={() => setCompareTarget(null)}
      ariaLabel={`Compare ${activeComparison.target.name} against current senior starter`}
      closeAriaLabel="Close comparison"
      maxWidthClass="sm:max-w-2xl"
      bodyClassName="p-4 sm:p-5 space-y-4"
      header={
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
            <GitCompare className="h-3.5 w-3.5 shrink-0" />
            1-Tap Compare vs Current Senior Starter
          </div>
          <h3 className="text-base font-bold text-white mt-0.5 break-words">
            <span className="text-emerald-300">
              {activeComparison.target.name}
            </span>{' '}
            <span className="text-slate-500">vs</span>{' '}
            <span className="text-sky-300">
              {activeComparison.starter
                ? activeComparison.starter.name
                : 'No Senior Starter'}
            </span>
          </h3>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              const t = activeComparison.target;
              setCompareTarget(null);
              handleOpenTargetCard(t);
            }}
            className="min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 text-xs font-semibold text-slate-200 transition cursor-pointer"
          >
            Open Full Card
          </button>
          <button
            type="button"
            onClick={() => handleToggleTrack(activeComparison.target)}
            className="min-h-[44px] rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 px-4 text-xs font-semibold text-emerald-200 transition cursor-pointer"
          >
            {isScoutTargetTracked(trackedTargets, activeComparison.target)
              ? '✓ Tracked'
              : '+ Track'}
          </button>
        </div>
      }
    >

        {!activeComparison.comparison || !activeComparison.starter ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-6 text-center text-xs text-slate-400">
            No senior starter found in the squad for{' '}
            <strong>{activeComparison.target.primaryPosition}</strong> to compare against yet.
          </div>
        ) : (
          <>
            {/* SVG 6-Axis Radar Comparison */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col sm:flex-row items-center gap-4">
              <div className="shrink-0">
                {(() => {
                  const axes = activeComparison.comparison.radarAxes;
                  const cx = 110;
                  const cy = 110;
                  const maxR = 76;
                  const pointAt = (idx: number, val: number) => {
                    const angle = (Math.PI * 2 * idx) / axes.length - Math.PI / 2;
                    const r = (Math.max(1, Math.min(20, val)) / 20) * maxR;
                    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
                  };
                  const targetPoly = axes
                    .map((ax, i) => pointAt(i, ax.targetVal))
                    .join(' ');
                  const starterPoly = axes
                    .map((ax, i) => pointAt(i, ax.starterVal))
                    .join(' ');
                  return (
                    <svg
                      viewBox="-16 -16 252 252"
                      className="w-52 h-52 sm:w-56 sm:h-56 max-w-full"
                      aria-label="Attribute radar comparison"
                    >
                      {[5, 10, 15, 20].map((ring) => (
                        <polygon
                          key={ring}
                          points={axes
                            .map((_, i) => pointAt(i, ring))
                            .join(' ')}
                          fill="none"
                          stroke="rgb(51 65 85)"
                          strokeWidth="1"
                          strokeDasharray={ring === 20 ? undefined : '2 2'}
                        />
                      ))}
                      {axes.map((ax, i) => {
                        const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
                        const x2 = cx + maxR * Math.cos(angle);
                        const y2 = cy + maxR * Math.sin(angle);
                        const lx = cx + (maxR + 18) * Math.cos(angle);
                        const ly = cy + (maxR + 18) * Math.sin(angle);
                        return (
                          <g key={ax.label}>
                            <line
                              x1={cx}
                              y1={cy}
                              x2={x2}
                              y2={y2}
                              stroke="rgb(51 65 85)"
                              strokeWidth="1"
                            />
                            <text
                              x={lx}
                              y={ly}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="rgb(203 213 225)"
                              fontSize="10"
                              fontFamily="monospace"
                            >
                              {ax.label}
                            </text>
                          </g>
                        );
                      })}
                      <polygon
                        points={starterPoly}
                        fill="rgba(56, 189, 248, 0.20)"
                        stroke="rgb(56, 189, 248)"
                        strokeWidth="2"
                      />
                      <polygon
                        points={targetPoly}
                        fill="rgba(16, 185, 129, 0.25)"
                        stroke="rgb(16, 185, 129)"
                        strokeWidth="2"
                      />
                    </svg>
                  );
                })()}
              </div>

              {/* Age, Wage & Archetype Summary */}
              <div className="flex-1 w-full space-y-2 text-xs">
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    {activeComparison.target.name} ({activeComparison.target.primaryPosition})
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sky-300 font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                    {activeComparison.starter.name} ({activeComparison.starter.position})
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2.5">
                    <div className="text-[10px] text-slate-400">Age Comparison</div>
                    <div className="font-mono font-bold text-white mt-0.5">
                      {activeComparison.target.age} vs {activeComparison.starter.age}
                    </div>
                    <div
                      className={`text-[10px] font-mono font-semibold ${
                        activeComparison.comparison.ageDelta <= 0
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }`}
                    >
                      {activeComparison.comparison.ageDelta > 0 ? '+' : ''}
                      {activeComparison.comparison.ageDelta} yrs
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2.5">
                    <div className="text-[10px] text-slate-400">Weekly Wage</div>
                    <div className="font-mono font-bold text-white mt-0.5">
                      {formatWeeklyWage(activeComparison.target.demandedWageEur)} vs{' '}
                      {formatWeeklyWage(activeComparison.starter.wagePw)}
                    </div>
                    <div
                      className={`text-[10px] font-mono font-semibold ${
                        activeComparison.comparison.wageDelta <= 0
                          ? 'text-emerald-300'
                          : 'text-rose-300'
                      }`}
                    >
                      {activeComparison.comparison.wageDelta > 0 ? '+' : ''}
                      £{activeComparison.comparison.wageDelta.toLocaleString()}/wk
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2.5 flex items-center justify-between">
                  <span className="text-[11px] text-slate-300">
                    Playbook Archetype:{' '}
                    <strong className="text-white">
                      {activeComparison.comparison.archetype.name}
                    </strong>
                  </span>
                  <span className="font-mono text-xs font-bold">
                    <span className="text-emerald-300">
                      {activeComparison.comparison.archetype.score}%
                    </span>{' '}
                    <span className="text-slate-500">vs</span>{' '}
                    <span className="text-sky-300">
                      {activeComparison.comparison.starterArchetype.score}%
                    </span>
                  </span>
                </div>

                {/* Personality, Deal Fee & Budget Gate Comparison */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2.5 space-y-1.5 text-[11px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-400">Personality</span>
                    <span className="font-semibold">
                      <span className="text-emerald-300">
                        {shortlistAdvice?.character.personalityLabel ||
                          activeComparison.target.personality ||
                          'Balanced'}
                      </span>{' '}
                      <span className="text-slate-500">vs</span>{' '}
                      <span className="text-sky-300">
                        {activeComparison.starter.personality || 'Balanced'}
                      </span>
                    </span>
                  </div>
                  {shortlistAdvice && (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-slate-400">Deal / Budget Gate</span>
                        <span
                          className={`font-mono font-semibold ${
                            shortlistAdvice.budget.passesBudgetGate
                              ? 'text-emerald-300'
                              : 'text-amber-300'
                          }`}
                        >
                          {shortlistAdvice.budget.feeLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug pt-0.5 border-t border-slate-800/80">
                        {shortlistAdvice.whyUpgradeOrHold}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Green/Red Attribute Deltas */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {activeComparison.comparison.radarAxes.map((ax) => (
                <div
                  key={ax.label}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 flex items-center justify-between text-xs font-mono"
                >
                  <span className="text-slate-300 font-semibold">{ax.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-300 font-bold">
                      {ax.targetVal}
                    </span>
                    <span className="text-slate-500">/</span>
                    <span className="text-sky-300">{ax.starterVal}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        ax.delta > 0
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : ax.delta < 0
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {ax.delta > 0 ? `+${ax.delta}` : ax.delta}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

    </MobileSheetFrame>
  );
};
