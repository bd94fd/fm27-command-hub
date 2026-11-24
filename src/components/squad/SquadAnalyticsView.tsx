import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { MatchLogEntry, PlayerRecord } from '../../types/fm27';
import type {
  ClubGovernanceState,
  DivisionBenchmarks,
  LastMatchTacticBlueprint,
  SquadPlannerSlot,
} from '../../types/fmSave';
import type { SquadTransferAuditSummary, TransferActionVerdict } from '../../utils/transferAudit';
import { evaluateSquadPlayerCard } from '../../utils/cardIntelligenceEngine';
import {
  AttributeRadarChart,
  InteractiveScatterExplorer,
  MatchXgMomentumChart,
  PercentilePizzaChart,
  SquadDepthAndPlannerChart,
} from '../FootballAnalyticsCharts';

interface SquadAnalyticsViewProps {
  players: PlayerRecord[];
  matches: MatchLogEntry[];
  saveDate: string;
  divisionBenchmarks: DivisionBenchmarks | null;
  governance: ClubGovernanceState | null;
  lastMatchTactic: LastMatchTacticBlueprint | null;
  squadPlanner: SquadPlannerSlot[] | null;
  onSelectPlayer?: (player: PlayerRecord) => void;
  activeRadarPlayer: PlayerRecord | null;
  setRadarPlayerId: Dispatch<SetStateAction<string>>;
  squadTransferAudit: SquadTransferAuditSummary;
  transferVerdictById: Map<string, TransferActionVerdict>;
}

export const SquadAnalyticsView: React.FC<SquadAnalyticsViewProps> = ({
  players,
  matches,
  saveDate,
  divisionBenchmarks,
  governance,
  lastMatchTactic,
  squadPlanner,
  onSelectPlayer,
  activeRadarPlayer,
  setRadarPlayerId,
  squadTransferAudit,
  transferVerdictById,
}) => {
  return (
    <div className="space-y-4 mt-4">
      {/* Row 1: Radar + 8-Spoke Percentile Pizza + Verdict */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-semibold text-white">
              Player Radar &amp; Position Percentile Pizza
            </span>
            <p className="text-[11px] text-slate-400">
              Compare attributes and division-benchmarked percentiles side-by-side
            </p>
          </div>
          <select
            aria-label="Select player for attribute radar"
            value={activeRadarPlayer?.id || ''}
            onChange={(e) => setRadarPlayerId(e.target.value)}
            className="w-full sm:w-auto sm:max-w-[260px] min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-200"
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.position})
              </option>
            ))}
          </select>
        </div>

        {activeRadarPlayer && (() => {
          const radarIntel = evaluateSquadPlayerCard(activeRadarPlayer, players, {
            divisionBenchmarks,
            activeTactic: lastMatchTactic,
            governance,
            transferVerdict: transferVerdictById.get(activeRadarPlayer.id) ?? null,
          });
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 flex justify-center min-w-0">
                  <AttributeRadarChart player={activeRadarPlayer} size={265} />
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 flex justify-center min-w-0">
                  <PercentilePizzaChart
                    slices={radarIntel.pizzaSlices}
                    playerName={activeRadarPlayer.name}
                    subtitle={`Club DNA ${radarIntel.dnaFitPct}% · ${radarIntel.verdictLabel}`}
                    size={265}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-200 min-w-0">
                  <strong className="text-emerald-300">{radarIntel.verdictLabel}:</strong>{' '}
                  {radarIntel.inlineRationale}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectPlayer?.(activeRadarPlayer)}
                  className="min-h-[40px] sm:min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold text-sky-300 hover:text-sky-200 bg-sky-500/10 border border-sky-500/30 shrink-0 cursor-pointer"
                >
                  Open Deep Profile →
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Row 2: Interactive Multi-Preset Scatter Explorer */}
      <InteractiveScatterExplorer
        players={players}
        selectedPlayerId={activeRadarPlayer?.id || null}
        onSelectPlayer={(p) => {
          setRadarPlayerId(p.id);
          onSelectPlayer?.(p);
        }}
      />

      {/* Row 3: Match xG Momentum & Finishing Trends */}
      {matches.length >= 2 && (
        <MatchXgMomentumChart
          matches={matches}
          saveDate={saveDate}
          title="Season xG Momentum & Finishing Variance"
        />
      )}

      {/* Row 4: Primary Positional Depth + FM27 Squad Planner */}
      <SquadDepthAndPlannerChart
        positionalNeeds={squadTransferAudit.positionalNeeds}
        squadPlanner={squadPlanner}
        lastMatchTactic={lastMatchTactic}
      />
    </div>
  );
};
