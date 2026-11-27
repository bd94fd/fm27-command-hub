/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { PercentilePizzaChart } from '../charts/PlayerRadarAndPizzaCharts';
import { PlayerOverviewKpiStrip } from '../PlayerModalMobileStrip';
import { attrColorClass, durabilityBadgeClass, tierBadgeClass } from '../../utils/playerDetailFormat';
import { formatAge } from '../../utils/squadViewHelpers';
import type { PlayerCardAnalysis, RankedRoleFit } from '../../utils/playerCardAnalysis';
import type { CardIntelligenceSummary } from '../../utils/cardIntelligenceEngine';
import type { ShortlistTargetAdvice } from '../../utils/shortlistAdviceEngine';
import type { PlayerRecord } from '../../types/fm27';
import type { RecruitmentTarget } from '../../types/fmSave';

export interface OverviewTabProps {
  player: PlayerRecord;
  analysis: PlayerCardAnalysis;
  cardIntel: CardIntelligenceSummary | null;
  shortlistUpgrades: ShortlistTargetAdvice[];
  onOpenShortlistTarget?: (target: RecruitmentTarget) => void;
  onClose: () => void;
}

const RoleFitExplainability = ({ fit }: { fit: RankedRoleFit }) => (
  <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
    <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">
      Why this score
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
      {fit.attributeWeights.map((attr) => (
        <div
          key={attr.key}
          className="flex items-center justify-between gap-2 text-micro min-w-0"
        >
          <span className="text-slate-300 truncate">
            {attr.label}
            {attr.missing ? ' (missing)' : ''}
          </span>
          <span className="font-mono text-slate-400 shrink-0 tabular-nums">
            {attr.value}/20 · ×{attr.weight} · {attr.weightSharePct}%
          </span>
        </div>
      ))}
    </div>
    <div className="flex flex-wrap gap-1">
      {fit.keyThresholds.map((threshold) => (
        <span
          key={threshold.key}
          className={`rounded-md border px-1.5 py-0.5 text-2xs font-mono ${
            threshold.met
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
          }`}
        >
          {threshold.label} {threshold.value}/20{' '}
          {threshold.met ? '✓' : `✗ < ${threshold.threshold}`}
        </span>
      ))}
    </div>
    {fit.nearestAlternative && (
      <div className="text-micro text-slate-400">
        Nearest alternative:{' '}
        <span className="text-slate-200">{fit.nearestAlternative.roleName}</span>{' '}
        ({fit.nearestAlternative.fitPct}% · {fit.nearestAlternative.tier})
      </div>
    )}
  </div>
);

export function OverviewTab({
  player,
  analysis,
  cardIntel,
  shortlistUpgrades,
  onOpenShortlistTarget,
  onClose,
}: OverviewTabProps) {
  return (
  <div className="space-y-4">
    {/* Instant 4-Tile Snapshot Bar */}
    <PlayerOverviewKpiStrip
      player={player}
      analysis={analysis}
      cardIntel={cardIntel}
      durabilityBadgeClass={durabilityBadgeClass(analysis.physical.durability.tier)}
    />

    {/* Scouting Verdict */}
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 sm:p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
          Scouting Verdict
        </h3>
        {analysis.squadDepth && (
          <span className="rounded-md bg-slate-900/95 border border-slate-700 px-2 py-0.5 text-micro font-medium text-slate-200">
            {analysis.squadDepth.summary}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-200 leading-relaxed">
        {analysis.scoutingVerdict}
      </p>
      <p className="text-micro text-slate-400">
        Stars ({player.ability.toFixed(1)}★ / {player.potential.toFixed(1)}★) are measured relative to your current squad.
      </p>
    </div>

    {/* Role in Squad: Now vs 1–3 Year Future Outlook */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-1">
        <div className="text-2xs font-bold uppercase tracking-wider text-emerald-400">
          Role in Squad · Right Now
        </div>
        <p className="text-slate-200 leading-relaxed">
          {analysis.squadDepth
            ? `${analysis.squadDepth.summary}. `
            : ''}
          Best deployed as{' '}
          <strong className="text-emerald-300">
            {analysis.bestIpRole?.role.name || player.ipRole || 'Standard'}
          </strong>{' '}
          (IP) /{' '}
          <strong className="text-sky-300">
            {analysis.bestOopRole?.role.name || player.oopRole || 'Standard'}
          </strong>{' '}
          (OOP) · {analysis.physical.durability.tier} durability ({analysis.physical.durability.stamina}/20 Stamina).
        </p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-1">
        <div className="text-2xs font-bold uppercase tracking-wider text-sky-400">
          1–3 Year Squad Outlook · {analysis.development.stage}
        </div>
        <p className="text-slate-200 leading-relaxed">
          {analysis.development.headline} — {analysis.development.note}
          {analysis.contractStanding.monthsRemaining !== null &&
          analysis.contractStanding.monthsRemaining <= 12
            ? ` Contract expires in ${analysis.contractStanding.monthsRemaining}m (${player.expires}).`
            : ''}
        </p>
      </div>
    </div>

    {/* Inline In-Game Shortlist Upgrade / Replacement Callout */}
    {shortlistUpgrades.length > 0 && (
      <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3.5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-amber-200">
            ★ In-Game Shortlist Upgrade / Replacement Ready ({shortlistUpgrades.length})
          </span>
          <span className="text-2xs font-mono text-emerald-300">
            Passes Strict Club Budget Gate
          </span>
        </div>
        <div className="space-y-1.5">
          {shortlistUpgrades.slice(0, 2).map((up) => (
            <div
              key={up.target.uid}
              className="rounded-lg border border-slate-800 bg-slate-950/85 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="font-bold text-white">
                  {up.target.name}{' '}
                  <span className="font-mono text-micro text-emerald-300">
                    ({up.target.primaryPosition}, Age {formatAge(up.target.age)})
                  </span>{' '}
                  <span className="rounded-md bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-2xs text-emerald-200">
                    {up.tierLabel}
                  </span>
                </div>
                <p className="text-micro text-slate-300 leading-snug">
                  {up.whyUpgradeOrHold}
                </p>
              </div>
              {onOpenShortlistTarget && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenShortlistTarget(up.target);
                  }}
                  className="min-h-[36px] shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-3 py-1.5 text-micro font-semibold text-emerald-200 transition cursor-pointer"
                >
                  Open Profile →
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    )}

    {/* FM27 Intelligence Profile: 8-Spoke Percentile Pizza + Active Tactic & Promise Audit */}
    {cardIntel && (
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
        <div className="md:col-span-6 flex justify-center">
          <PercentilePizzaChart
            slices={cardIntel.pizzaSlices}
            playerName={player.name}
            subtitle={`Club DNA ${cardIntel.dnaFitPct}% · ${cardIntel.valueTag}`}
            size={238}
          />
        </div>
        <div className="md:col-span-6 space-y-2.5 text-xs">
          <div>
            <div className="text-2xs uppercase tracking-wider text-slate-400 font-semibold">
              Card Intelligence Verdict
            </div>
            <div className="text-sm font-bold text-white mt-0.5">
              {cardIntel.verdictLabel}
            </div>
            <p className="text-slate-300 mt-1 leading-relaxed">
              {cardIntel.inlineRationale}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 space-y-1">
            <div className="text-2xs uppercase tracking-wider text-sky-400 font-semibold">
              Active Tactic &amp; Promise Alignment
            </div>
            <p className="text-micro text-slate-200">{cardIntel.tacticalFitNote}</p>
            <p className="text-micro text-amber-300">
              {cardIntel.promiseTag || 'Playing-time promise currently aligned with minutes'}
            </p>
          </div>
        </div>
      </div>
    )}

    {/* Strengths & Watchpoints */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Top Strengths
        </div>
        {analysis.strengths.length > 0 ? (
          <div className="space-y-2">
            {analysis.strengths.map((s) => (
              <div key={s.attrKey} className="text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-100">{s.label}</span>
                  <span className={`font-mono ${attrColorClass(s.value)}`}>
                    {s.value}/20
                  </span>
                </div>
                <p className="text-micro text-slate-400">{s.summary}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">
            No standout 12+ attributes recorded for this position yet.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          Key Watchpoints
        </div>
        {analysis.watchpoints.length > 0 ? (
          <div className="space-y-2">
            {analysis.watchpoints.map((w) => (
              <div key={w.attrKey} className="text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-100">{w.label}</span>
                  <span className="font-mono text-rose-300 font-semibold">
                    {w.value}/20
                  </span>
                </div>
                <p className="text-micro text-slate-400">{w.summary}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-emerald-300/80">
            No major attribute weaknesses (all key positional traits are 10+).
          </p>
        )}
      </div>
    </div>

    {/* Recommended Dual-Phase Setup */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {analysis.bestIpRole && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-emerald-400">
              Best In-Possession (IP) Role
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 text-2xs font-semibold ${tierBadgeClass(
                analysis.bestIpRole.tier
              )}`}
            >
              {analysis.bestIpRole.fitPct}% · {analysis.bestIpRole.tier}
            </span>
          </div>
          <div className="text-sm font-bold text-white">
            {analysis.bestIpRole.role.name}
          </div>
          <RoleFitExplainability fit={analysis.bestIpRole} />
          {analysis.bestIpRole.topSupporting.length > 0 && (
            <div className="text-micro text-slate-400">
              Driven by:{' '}
              <span className="text-slate-200">
                {analysis.bestIpRole.topSupporting
                  .map((x) => `${x.label} ${x.value}`)
                  .join(' · ')}
              </span>
            </div>
          )}
        </div>
      )}

      {analysis.bestOopRole && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-sky-400">
              Best Out-of-Possession (OOP) Role
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 text-2xs font-semibold ${tierBadgeClass(
                analysis.bestOopRole.tier
              )}`}
            >
              {analysis.bestOopRole.fitPct}% · {analysis.bestOopRole.tier}
            </span>
          </div>
          <div className="text-sm font-bold text-white">
            {analysis.bestOopRole.role.name}
          </div>
          <RoleFitExplainability fit={analysis.bestOopRole} />
          {analysis.bestOopRole.topSupporting.length > 0 && (
            <div className="text-micro text-slate-400">
              Driven by:{' '}
              <span className="text-slate-200">
                {analysis.bestOopRole.topSupporting
                  .map((x) => `${x.label} ${x.value}`)
                  .join(' · ')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>

    {/* Actionable Manager Advice: Durability, Development & Club DNA */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">
            Durability &amp; Workload
          </span>
          <span
            className={`rounded-md border px-2 py-0.5 text-2xs font-semibold ${durabilityBadgeClass(analysis.physical.durability.tier)}`}
          >
            {analysis.physical.durability.tier}
          </span>
        </div>
        <div className="text-xs font-semibold text-white">
          {analysis.physical.durability.headline}
        </div>
        <p className="text-micro text-slate-400 leading-relaxed">
          {analysis.physical.durability.advice}
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">
            Development &amp; Training
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 text-2xs font-semibold text-indigo-300">
            <TrendingUp className="h-3 w-3" />
            {analysis.development.stage}
          </span>
        </div>
        <div className="text-xs font-semibold text-white">
          {analysis.development.headline}
        </div>
        <div className="text-micro text-slate-300">
          Focus: <span className="text-emerald-300">{analysis.development.trainingFocus.join(', ')}</span>
        </div>
        <p className="text-micro text-slate-400 leading-relaxed">
          {analysis.development.note}
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">
            Club DNA Fit
          </span>
          <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-2xs font-mono font-bold text-emerald-300">
            {analysis.clubDna.overallDnaScore}/100
          </span>
        </div>
        <div className="text-xs font-semibold text-white">
          {analysis.clubDna.bestArchetypeLabel}
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-micro">
          <div className="flex justify-between rounded-md bg-slate-900 px-2 py-1">
            <span className="text-slate-400">Physical</span>
            <span className="font-mono text-slate-200">{analysis.clubDna.pillarScores.physicalIntensity}</span>
          </div>
          <div className="flex justify-between rounded-md bg-slate-900 px-2 py-1">
            <span className="text-slate-400">Technical</span>
            <span className="font-mono text-slate-200">{analysis.clubDna.pillarScores.technicalSecurity}</span>
          </div>
          <div className="flex justify-between rounded-md bg-slate-900 px-2 py-1">
            <span className="text-slate-400">Tactical</span>
            <span className="font-mono text-slate-200">{analysis.clubDna.pillarScores.tacticalDiscipline}</span>
          </div>
          <div className="flex justify-between rounded-md bg-slate-900 px-2 py-1">
            <span className="text-slate-400">Aerial</span>
            <span className="font-mono text-slate-200">{analysis.clubDna.pillarScores.aerialDominance}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
