import React from 'react';
import {
  Bookmark,
  BookmarkCheck,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  X,
} from 'lucide-react';
import { PlayerRecord } from '../types/fm27';
import {
  ClubGovernanceState,
  DivisionBenchmarks,
  LastMatchTacticBlueprint,
  RecruitmentTarget,
} from '../types/fmSave';
import { evaluateScoutTargetCard } from '../utils/cardIntelligenceEngine';
import { AttributeRadarChart, PercentilePizzaChart } from './FootballAnalyticsCharts';

interface ScoutTargetDetailModalProps {
  target: RecruitmentTarget | null;
  squadPlayers: PlayerRecord[];
  divisionBenchmarks?: DivisionBenchmarks | null;
  lastMatchTactic?: LastMatchTacticBlueprint | null;
  governance?: ClubGovernanceState | null;
  isTracked: boolean;
  onToggleTrack: (target: RecruitmentTarget) => void;
  onAskAnalyst?: (prompt: string) => void;
  onClose: () => void;
}

const TONE_TEXT: Record<string, string> = {
  emerald: 'text-emerald-300',
  sky: 'text-sky-300',
  amber: 'text-amber-300',
  rose: 'text-rose-300',
  slate: 'text-slate-300',
};

const TONE_BORDER: Record<string, string> = {
  emerald: 'border-emerald-500/40 bg-emerald-500/10',
  sky: 'border-sky-500/40 bg-sky-500/10',
  amber: 'border-amber-500/40 bg-amber-500/10',
  rose: 'border-rose-500/40 bg-rose-500/10',
  slate: 'border-slate-700 bg-slate-900/70',
};

export const ScoutTargetDetailModal: React.FC<ScoutTargetDetailModalProps> = ({
  target,
  squadPlayers,
  divisionBenchmarks = null,
  lastMatchTactic = null,
  governance = null,
  isTracked,
  onToggleTrack,
  onAskAnalyst,
  onClose,
}) => {
  if (!target) return null;

  const intel = evaluateScoutTargetCard(target, squadPlayers, {
    divisionBenchmarks,
    activeTactic: lastMatchTactic,
    governance,
  });

  const weeklyWage = Math.round(target.demandedWageEur || 0);
  const clubLabel = target.currentClub || 'Unattached';

  const handleAsk = () => {
    if (!onAskAnalyst) return;
    const prompt = `Give me a full FM27 Patch 27.1.0 scouting & financial verdict on ${target.name} (${target.primaryPosition}, Age ${target.age}, ${clubLabel}, ${weeklyWage > 0 ? `£${weeklyWage.toLocaleString()}/wk` : 'Free Agent'}, expires ${target.expires || 'N/A'}). Compare him directly against ${intel.starterName || 'our current starter'} for ${intel.bestIpRole} IP / ${intel.bestOopRole} OOP, check wage budget fit, and flag any playing-time promise risks.`;
    onClose();
    onAskAnalyst(prompt);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Deep scouting dossier for ${target.name}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-white truncate">
                {target.name}
              </h2>
              <span className="font-mono text-xs text-emerald-300 font-semibold">
                {target.primaryPosition}
              </span>
              <span className="text-xs text-slate-400">
                Age {target.age} · {target.nationality || 'Unknown'} · {clubLabel}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {intel.contractSummary} · 3-Yr Est. Cost:{' '}
              <span className="font-mono text-slate-200">{intel.cost3YrLabel}</span> ·{' '}
              <span className="text-slate-300">{intel.archetypeLabel}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scout modal"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Verdict Banner */}
        <div className={`rounded-xl border p-3.5 space-y-2 ${TONE_BORDER[intel.tone] || TONE_BORDER.slate}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`text-sm font-bold ${TONE_TEXT[intel.tone] || 'text-white'}`}>
              {intel.verdictLabel}
            </span>
            <span className="font-mono text-xs tabular-nums text-slate-200">
              Club DNA {intel.dnaFitPct}% · Role Fit {intel.bestRoleFitPct}% · {intel.depthPriority}
            </span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">
            {intel.inlineRationale}
          </p>
        </div>

        {/* FM27 Dual-Phase Fit + Starter Comparison KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              FM27 Dual-Phase Roles
            </div>
            <div className="font-semibold text-emerald-300">IP: {intel.bestIpRole}</div>
            <div className="font-semibold text-sky-300">OOP: {intel.bestOopRole}</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              vs. Current Starter
            </div>
            <div className="font-semibold text-white truncate">
              {intel.starterName || 'No direct senior starter'}
            </div>
            <div
              className={`font-mono text-[11px] tabular-nums ${
                (intel.starterDnaDelta ?? 0) >= 0 ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              {intel.starterDnaDelta != null
                ? `${intel.starterDnaDelta >= 0 ? '+' : ''}${intel.starterDnaDelta}% Club DNA delta`
                : 'Fills open depth slot'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Value &amp; Promise Audit
            </div>
            <div className="font-semibold text-slate-100">{intel.valueTag}</div>
            <div className="text-[11px] text-slate-400">
              {intel.promiseTag || 'No active promise conflict flagged'}
            </div>
          </div>
        </div>

        {/* Visual Charts: Percentile Pizza + Starter Overlay Radar */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 flex items-center justify-center">
            <PercentilePizzaChart
              slices={intel.pizzaSlices}
              playerName={target.name}
              subtitle="8-spoke percentile vs. squad & division"
              size={260}
            />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 flex items-center justify-center">
            <AttributeRadarChart
              player={intel.syntheticPlayerRecord}
              comparePlayer={intel.starterRecord}
              size={255}
            />
          </div>
        </div>

        {/* Tactical Fit, Strengths & Risks */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
              <TrendingUp className="h-3.5 w-3.5" /> Top Strength
            </div>
            <p className="text-slate-200">{intel.topStrength}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-400 font-semibold">
              <ShieldCheck className="h-3.5 w-3.5" /> Primary Risk
            </div>
            <p className="text-slate-200">{intel.primaryRisk}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-sky-400 font-semibold">
              Active Tactic Fit
            </div>
            <p className="text-slate-200">{intel.tacticalFitNote}</p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={() => onToggleTrack(target)}
            className={`min-h-[44px] inline-flex items-center gap-2 rounded-xl px-4 text-xs font-semibold border transition-colors ${
              isTracked
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                : 'border-slate-700 bg-slate-950 text-slate-200 hover:border-emerald-500/40'
            }`}
          >
            {isTracked ? (
              <>
                <BookmarkCheck className="h-4 w-4" /> Tracked on Shortlist
              </>
            ) : (
              <>
                <Bookmark className="h-4 w-4" /> Track Target
              </>
            )}
          </button>

          {onAskAnalyst && (
            <button
              type="button"
              onClick={handleAsk}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 text-xs font-semibold text-white transition-colors"
            >
              <MessageSquare className="h-4 w-4" /> Ask Analyst About {target.name.split(' ').slice(-1)[0]}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
