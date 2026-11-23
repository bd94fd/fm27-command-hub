import React from 'react';
import { Bookmark, GitCompare, MessageSquare, Trash2 } from 'lucide-react';
import type { PlayerRecord } from '../../types/fm27';
import type {
  ClubGovernanceState,
  DivisionBenchmarks,
  LastMatchTacticBlueprint,
  RecruitmentTarget,
} from '../../types/fmSave';
import {
  computeTargetBestRoleFit,
  evaluatePlaybookArchetype,
  evaluateTargetSquadDepth,
  formatTargetContractSummary,
  getPositionRelevantAttributes,
} from '../../utils/recruitmentHelpers';
import { evaluateScoutTargetCard } from '../../utils/cardIntelligenceEngine';
import { archetypeBadgeClass } from './recruitmentBadges';

interface ShortlistViewProps {
  trackedTargets: RecruitmentTarget[];
  onAskAnalyst?: (prompt: string) => void;
  handleAskAnalystCompareShortlist: () => void;
  handleOpenTargetCard: (target: RecruitmentTarget) => void;
  setCompareTarget: (target: RecruitmentTarget | null) => void;
  handleRemoveTracked: (target: RecruitmentTarget) => void;
  players: PlayerRecord[];
  divisionBenchmarks: DivisionBenchmarks | null;
  lastMatchTactic: LastMatchTacticBlueprint | null;
  governance: ClubGovernanceState | null;
}

export const ShortlistView: React.FC<ShortlistViewProps> = ({
  trackedTargets,
  onAskAnalyst,
  handleAskAnalystCompareShortlist,
  handleOpenTargetCard,
  setCompareTarget,
  handleRemoveTracked,
  players,
  divisionBenchmarks,
  lastMatchTactic,
  governance,
}) => {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
            <Bookmark className="h-4 w-4 text-emerald-400" />
            Persisted Recruitment Shortlist ({trackedTargets.length})
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Saved locally in browser storage · Tap any card for full 52-attribute profile or compare directly against our senior starter
          </p>
        </div>
        <button
          type="button"
          disabled={trackedTargets.length === 0 || !onAskAnalyst}
          onClick={handleAskAnalystCompareShortlist}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-40 border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition cursor-pointer"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Ask Analyst to Compare Shortlist
        </button>
      </div>

      {trackedTargets.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
          No targets shortlisted yet. Tap <strong>+ Track</strong> on any player in the <strong>Scouted</strong> tab to persist them here.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {trackedTargets.map((target) => {
            const bestRole = computeTargetBestRoleFit(target);
            const archetype = evaluatePlaybookArchetype(
              target.primaryPosition,
              target.attributes
            );
            const relevantAttributes = getPositionRelevantAttributes(target);
            const depth = evaluateTargetSquadDepth(
              target.primaryPosition,
              players
            );
            const contractDisplay = formatTargetContractSummary(target);

            return (
              <div
                key={target.uid || target.name}
                role="button"
                tabIndex={0}
                onClick={() => handleOpenTargetCard(target)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpenTargetCard(target);
                  }
                }}
                className="rounded-xl border border-emerald-500/30 bg-slate-900/75 p-4 space-y-2.5 text-left transition cursor-pointer hover:border-emerald-400/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white truncate">
                      {target.name}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {target.age} yrs · {target.nationality} ·{' '}
                      <span className="font-mono text-emerald-300">
                        {target.primaryPosition}
                      </span>
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold border ${
                      target.isFreeAgent
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    {contractDisplay.primaryLabel}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span
                    className={`rounded border px-2 py-0.5 font-semibold ${archetypeBadgeClass(
                      archetype.badgeTone
                    )}`}
                  >
                    {archetype.name} · {archetype.score}%
                  </span>
                  {contractDisplay.trialBadge && (
                    <span className="rounded bg-teal-500/15 border border-teal-500/40 px-2 py-0.5 text-[10px] font-bold text-teal-300">
                      {contractDisplay.trialBadge}
                    </span>
                  )}
                  <span className="rounded bg-emerald-500/15 border border-emerald-500/35 px-2 py-0.5 font-semibold text-emerald-300">
                    {bestRole.roleName} · {bestRole.fitPct}% Fit
                  </span>
                  {contractDisplay.wageLabel && (
                    <span className="rounded bg-slate-950/80 border border-slate-800 px-2 py-0.5 font-mono text-slate-300">
                      Wage {contractDisplay.wageLabel}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-1.5 text-[11px] font-mono text-slate-200">
                  {relevantAttributes.map((attrChip) => (
                    <div
                      key={attrChip.label}
                      className="rounded bg-slate-950/80 border border-slate-800 px-2 py-1 text-center"
                    >
                      <span className="text-slate-400 mr-1">
                        {attrChip.label}
                      </span>
                      <span
                        className={
                          attrChip.value >= 14
                            ? 'text-emerald-300 font-bold'
                            : attrChip.value >= 11
                              ? 'text-slate-100 font-semibold'
                              : 'text-slate-400'
                        }
                      >
                        {attrChip.value}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Inline FM27 Shortlist Card Verdict Strip */}
                {(() => {
                  const intel = evaluateScoutTargetCard(target, players, {
                    divisionBenchmarks,
                    activeTactic: lastMatchTactic,
                    governance,
                  });
                  const toneCls =
                    intel.tone === 'emerald'
                      ? 'text-emerald-300'
                      : intel.tone === 'sky'
                        ? 'text-sky-300'
                        : intel.tone === 'amber'
                          ? 'text-amber-300'
                          : intel.tone === 'rose'
                            ? 'text-rose-300'
                            : 'text-slate-300';
                  return (
                    <div className="rounded-lg border border-slate-800/90 bg-slate-950/75 px-2.5 py-1.5 text-[11px] flex flex-wrap items-center justify-between gap-2">
                      <span className="truncate text-slate-300">
                        <strong className={toneCls}>{intel.verdictLabel}</strong>
                        <span className="text-slate-500"> · </span>
                        <span>{intel.inlineRationale}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">
                        {intel.cost3YrLabel}
                      </span>
                    </div>
                  );
                })()}

                <div className="flex flex-wrap items-center justify-between pt-1.5 border-t border-slate-800/80 text-[11px] gap-1.5">
                  <span className="text-[10px] text-slate-400">
                    {depth.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenTargetCard(target);
                      }}
                      className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200 transition cursor-pointer"
                    >
                      Open Card
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCompareTarget(target);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 px-2 py-1 text-[11px] font-semibold text-sky-300 transition cursor-pointer"
                    >
                      <GitCompare className="h-3 w-3" />
                      Compare
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTracked(target);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 px-2 py-1 text-[11px] font-semibold text-rose-300 transition cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
