/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AttributeRadarChart,
  PlayerProgressionSparkline,
  RolePercentilePizzaChart,
} from '../charts/PlayerRadarAndPizzaCharts';
import { buildPlayerProgressionSeries, loadProgressionArchive } from '../../utils/progressionDiff';
import { durabilityBadgeClass } from '../../utils/playerDetailFormat';
import type { PlayerCardAnalysis } from '../../utils/playerCardAnalysis';
import type { PlayerRecord } from '../../types/fm27';

export interface EngineTabProps {
  player: PlayerRecord;
  analysis: PlayerCardAnalysis;
  squadPlayers: PlayerRecord[];
  effectiveIpRole: string;
  effectiveOopRole: string;
  highlightedPrimaryKeys: Set<string>;
  compareCandidates: PlayerRecord[];
  comparePlayerId: string;
  onComparePlayerChange: (playerId: string) => void;
  resolvedComparePlayer: PlayerRecord | null;
}

export function EngineTab({
  player,
  analysis,
  squadPlayers,
  effectiveIpRole,
  effectiveOopRole,
  highlightedPrimaryKeys,
  compareCandidates,
  comparePlayerId,
  onComparePlayerChange,
  resolvedComparePlayer,
}: EngineTabProps) {
  const a = player.attributes;
  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 space-y-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-2xs uppercase tracking-wider text-slate-400">Physical</span>
            <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-3xs sm:text-2xs font-semibold text-emerald-300">
              {analysis.physical.tier}
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono tabular-nums">
            {analysis.physical.score}/100
          </div>
          <div className="text-micro text-slate-400 leading-snug">
            {analysis.physical.explanation}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 space-y-1 min-w-0">
          <div className="text-2xs uppercase tracking-wider text-slate-400">Top Sprint Speed</div>
          <div className="text-xl sm:text-2xl font-bold text-sky-300 font-mono tabular-nums">
            {analysis.physical.topSpeedKmh}{' '}
            <span className="text-xs sm:text-sm font-normal">km/h</span>
          </div>
          <div className="text-micro text-slate-300 leading-snug">
            {analysis.physical.speedVerdict}
          </div>
          <div className="text-2xs text-slate-500 font-mono">
            {analysis.physical.topSpeedMps} m/s · Pace {a.pace} · Acc {a.acceleration}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 space-y-1 min-w-0">
          <div className="text-2xs uppercase tracking-wider text-slate-400">Aerial Reach</div>
          <div className="text-xl sm:text-2xl font-bold text-amber-300 font-mono tabular-nums">
            +{analysis.physical.jumpHeightMeters} m
          </div>
          <div className="text-micro text-slate-300 leading-snug">
            {analysis.physical.aerialVerdict}
          </div>
          <div className="text-2xs text-slate-500 font-mono">
            Jump {a.jumpingReach}/20 · Head {a.heading ?? '—'}/20
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 space-y-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-2xs uppercase tracking-wider text-slate-400">Durability</span>
            <span
              className={`rounded-md border px-1.5 py-0.5 text-3xs sm:text-2xs font-semibold ${durabilityBadgeClass(
                analysis.physical.durability.tier
              )}`}
            >
              {analysis.physical.durability.tier}
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-100 font-mono tabular-nums">
            {analysis.physical.durability.stamina}
            <span className="text-xs sm:text-sm font-normal text-slate-400"> / </span>
            {analysis.physical.durability.naturalFitness ?? '—'}
          </div>
          <div className="text-micro text-slate-300 leading-snug">
            {analysis.physical.durability.headline}
          </div>
          <div className="text-2xs text-slate-500">Stamina / Natural Fitness</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 flex items-center justify-center min-w-0">
          <RolePercentilePizzaChart
            player={player}
            squadPlayers={squadPlayers}
            ipRoleName={effectiveIpRole}
            oopRoleName={effectiveOopRole}
            highlightedPrimaryKeys={highlightedPrimaryKeys}
          />
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 flex flex-col items-center justify-center space-y-2 min-w-0">
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-200">6-Axis Comparison Radar</div>
            {compareCandidates.length > 0 && (
              <select
                value={comparePlayerId}
                onChange={(e) => onComparePlayerChange(e.target.value)}
                aria-label="Compare with teammate"
                className="w-full sm:w-auto sm:max-w-[210px] min-h-[44px] sm:min-h-[34px] rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-micro text-slate-200"
              >
                {analysis.squadDepth?.bestTeammate && (
                  <option value="__AUTO__">
                    vs {analysis.squadDepth.bestTeammate.name} (Best{' '}
                    {analysis.squadDepth.positionLabel.split(' ')[0]})
                  </option>
                )}
                <option value="__NONE__">No comparison</option>
                {compareCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    vs {c.name} ({c.position})
                  </option>
                ))}
              </select>
            )}
          </div>
          <AttributeRadarChart player={player} comparePlayer={resolvedComparePlayer} />
        </div>
      </div>
      <PlayerProgressionSparkline
        points={buildPlayerProgressionSeries(player.uid, loadProgressionArchive())}
        playerName={player.name}
      />
    </div>
  );
}
