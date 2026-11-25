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
import type { ClubDnaPillarWeights } from '../../utils/clubDnaEngine';
import { archetypeBadgeClass } from './recruitmentBadges';
import type { EnrichedScoutTargetWithDna } from './recruitmentTypes';
import { formatAge, formatNation } from '../../utils/squadViewHelpers';

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
  clubDnaWeights?: ClubDnaPillarWeights;
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
  clubDnaWeights,
}) => {
  const { target, bestRole, archetype, dna, relevantAttributes, depth, contractDisplay } =
    item;

  const intel = evaluateScoutTargetCard(target, players, {
    divisionBenchmarks,
    activeTactic: lastMatchTactic,
    governance,
    clubDnaWeights,
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

  const inCompareTray = compareTrayTargets.some((t) => t.uid === target.uid);

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
      className={`rounded-xl border p-3.5 sm:p-4 space-y-2.5 text-left transition cursor-pointer hover:border-emerald-500/50 ${
        depth.isGenuineGap
          ? 'border-amber-500/40 bg-amber-950/15'
          : 'border-slate-800 bg-slate-900/70'
      }`}
    >
      {/* Header: Name, Age/Nation/Pos, Contract Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white truncate">
            {target.name}
          </h3>
          <p className="text-[11px] text-slate-400 truncate">
            {formatAge(target.age)} yrs · {formatNation(target.nationality)} ·{' '}
            <span className="font-mono font-semibold text-emerald-300">
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

      {/* Complete 4-KPI Summary Grid (2×2 on phones, 4-across on sm+) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 truncate">
            Club DNA
          </div>
          <div className="mt-0.5 text-xs font-mono font-bold text-emerald-300 tabular-nums truncate">
            {dna.overallDnaScore}/100{' '}
            <span className="font-sans font-normal text-[10px] text-slate-400">
              {dna.bestArchetypeShortLabel}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 truncate">
            Best Role Fit
          </div>
          <div className="mt-0.5 text-xs font-semibold text-sky-300 truncate">
            {bestRole.fitPct}% · {bestRole.roleName}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 truncate">
            Wage / Deal
          </div>
          <div className="mt-0.5 text-xs font-mono font-semibold text-slate-200 tabular-nums truncate">
            {contractDisplay.wageLabel || contractDisplay.primaryLabel}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 truncate">
            3-Yr Cost
          </div>
          <div className="mt-0.5 text-xs font-mono font-semibold text-amber-300 tabular-nums truncate">
            {intel.cost3YrLabel}
          </div>
        </div>
      </div>

      {/* Archetype + Trial + Scout Badges */}
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
        {target.scoutBadges &&
          target.scoutBadges.map((badge) => (
            <span
              key={badge}
              className="rounded bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.5 text-[10px] text-indigo-300"
            >
              {badge}
            </span>
          ))}
      </div>

      {/* 4 Position-Relevant Attributes (Stacked Label/Value — zero wrap at 360px) */}
      <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
        {relevantAttributes.map((attrChip) => (
          <div
            key={attrChip.label}
            className="rounded-lg bg-slate-950/80 border border-slate-800 px-1.5 py-1.5 min-w-0"
          >
            <div className="text-[9px] uppercase tracking-wider text-slate-400 truncate">
              {attrChip.label}
            </div>
            <div
              className={`text-xs tabular-nums ${
                attrChip.value >= 14
                  ? 'text-emerald-300 font-bold'
                  : attrChip.value >= 11
                    ? 'text-slate-100 font-semibold'
                    : 'text-slate-400'
              }`}
            >
              {attrChip.value}
            </div>
          </div>
        ))}
      </div>

      {/* Inline FM27 Scout Card Verdict Strip (readable 2 lines on mobile) */}
      <div className="rounded-lg border border-slate-800/90 bg-slate-950/75 px-2.5 py-2 text-[11px] space-y-1">
        <div className="line-clamp-2 text-slate-300 leading-snug">
          <strong className={toneCls}>{intel.verdictLabel}</strong>
          <span className="text-slate-500"> · </span>
          <span>{intel.inlineRationale}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
          {depth.isGenuineGap ? (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-sans font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              {depth.label}
            </span>
          ) : (
            <span className="truncate">{depth.label}</span>
          )}
          <span className="shrink-0 text-emerald-400/90">Tap for Dossier →</span>
        </div>
      </div>

      {/* Touch-Friendly 44px Mobile Action Row */}
      <div className="grid grid-cols-3 sm:flex sm:items-center sm:justify-end gap-1.5 pt-1 border-t border-slate-800/80">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleCompareTray(target);
          }}
          className={`min-h-[44px] sm:min-h-[32px] inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 sm:py-1 text-[11px] font-semibold transition cursor-pointer ${
            inCompareTray
              ? 'bg-amber-500/25 border-amber-400/60 text-amber-200'
              : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700 text-slate-300'
          }`}
          title="Add to 3-player comparison tray"
        >
          {inCompareTray ? 'In Tray' : '+ Tray'}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCompareTarget(target);
          }}
          className="min-h-[44px] sm:min-h-[32px] inline-flex items-center justify-center gap-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 px-2 py-1.5 sm:py-1 text-[11px] font-semibold text-sky-300 transition cursor-pointer"
        >
          <GitCompare className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" />
          <span>Compare</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleTrack(target);
          }}
          className={`min-h-[44px] sm:min-h-[32px] inline-flex items-center justify-center rounded-lg border px-2.5 py-1.5 sm:py-1 text-[11px] font-semibold transition cursor-pointer ${
            isTracked
              ? 'bg-emerald-500/25 hover:bg-emerald-500/35 border-emerald-400/60 text-emerald-200'
              : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {isTracked ? '✓ Tracked' : '+ Track'}
        </button>
      </div>
    </div>
  );
};
