import React from 'react';
import { GitCompare } from 'lucide-react';
import type { PlayerRecord } from '../../types/fm27';
import type {
  ClubGovernanceState,
  DivisionBenchmarks,
  LastMatchTacticBlueprint,
  RecruitmentTarget,
} from '../../types/fmSave';
import { evaluateScoutTargetCard } from '../../utils/cardIntelligenceEngine';
import { archetypeBadgeClass } from './recruitmentBadges';
import type { EnrichedScoutTargetWithDna } from './recruitmentTypes';

type ScoutTargetCardItem = Pick<
  EnrichedScoutTargetWithDna,
  | 'target'
  | 'bestRole'
  | 'archetype'
  | 'dna'
  | 'relevantAttributes'
  | 'depth'
  | 'contractDisplay'
>;

interface ScoutTargetCardProps {
  item: ScoutTargetCardItem;
  isTracked: boolean;
  handleOpenTargetCard: (target: RecruitmentTarget) => void;
  handleToggleCompareTray: (target: RecruitmentTarget) => void;
  setCompareTarget: (target: RecruitmentTarget | null) => void;
  handleToggleTrack: (target: RecruitmentTarget) => void;
  compareTrayTargets: RecruitmentTarget[];
  players: PlayerRecord[];
  divisionBenchmarks: DivisionBenchmarks | null;
  lastMatchTactic: LastMatchTacticBlueprint | null;
  governance: ClubGovernanceState | null;
}

export const ScoutTargetCard: React.FC<ScoutTargetCardProps> = ({
  item,
  isTracked,
  handleOpenTargetCard,
  handleToggleCompareTray,
  setCompareTarget,
  handleToggleTrack,
  compareTrayTargets,
  players,
  divisionBenchmarks,
  lastMatchTactic,
  governance,
}) => {
  const { target, bestRole, archetype, dna, relevantAttributes, depth, contractDisplay } =
    item;

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
      className={`rounded-xl border p-4 space-y-2.5 text-left transition cursor-pointer hover:border-emerald-500/50 ${
        depth.isGenuineGap
          ? 'border-amber-500/40 bg-amber-950/15'
          : 'border-slate-800 bg-slate-900/70'
      }`}
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

      {/* Club DNA v3.0 Archetype + Playbook v2.0 + Free Trial Badge + Best Role & Wage */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span
          className={`rounded border px-2 py-0.5 font-bold ${archetypeBadgeClass(
            dna.badgeTone
          )}`}
        >
          DNA: {dna.bestArchetypeShortLabel} · {dna.overallDnaScore}/100
        </span>
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

      {/* 4 Position-Relevant Attributes */}
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

      {target.scoutBadges && target.scoutBadges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {target.scoutBadges.map((badge) => (
            <span
              key={badge}
              className="rounded bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.5 text-[10px] text-indigo-300"
            >
              {badge}
            </span>
          ))}
        </div>
      )}

      {/* Inline FM27 Scout Card Verdict Strip */}
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
              {intel.cost3YrLabel} · Tap for Deep Dossier
            </span>
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center justify-between pt-1.5 border-t border-slate-800/80 text-[11px] gap-2">
        {depth.isGenuineGap ? (
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            {depth.label}
          </span>
        ) : (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-slate-800/80 text-slate-400 border border-slate-700/80">
            {depth.label}
          </span>
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleCompareTray(target);
            }}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition cursor-pointer ${
              compareTrayTargets.some((t) => t.uid === target.uid)
                ? 'bg-amber-500/25 border-amber-400/60 text-amber-200'
                : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700 text-slate-300'
            }`}
            title="Add to 3-player comparison tray"
          >
            {compareTrayTargets.some((t) => t.uid === target.uid)
              ? 'In Tray'
              : '+ Tray'}
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
              handleToggleTrack(target);
            }}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
              isTracked
                ? 'bg-emerald-500/25 hover:bg-emerald-500/35 border-emerald-400/60 text-emerald-200'
                : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {isTracked ? '✓ Tracked' : '+ Track'}
          </button>
        </div>
      </div>
    </div>
  );
};
