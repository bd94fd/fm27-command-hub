import React from 'react';
import type { PlayerRecord } from '../../types/fm27';
import type {
  ClubGovernanceState,
  DivisionBenchmarks,
  LastMatchTacticBlueprint,
} from '../../types/fmSave';
import type { TransferActionVerdict } from '../../utils/transferAudit';
import { evaluateSquadPlayerCard } from '../../utils/cardIntelligenceEngine';
import {
  EnrichedSquadRow,
  SQUAD_COLUMNS,
  SquadColumnId,
} from '../../utils/squadViewHelpers';
import { renderColumnValue } from './squadBadges';

interface SquadCardsListProps {
  visibleRows: EnrichedSquadRow[];
  players: PlayerRecord[];
  onSelectPlayer?: (player: PlayerRecord) => void;
  divisionBenchmarks: DivisionBenchmarks | null;
  lastMatchTactic: LastMatchTacticBlueprint | null;
  governance: ClubGovernanceState | null;
  transferVerdictById: Map<string, TransferActionVerdict>;
  cardMetricColumns: SquadColumnId[];
}

export const SquadCardsList: React.FC<SquadCardsListProps> = ({
  visibleRows,
  players,
  onSelectPlayer,
  divisionBenchmarks,
  lastMatchTactic,
  governance,
  transferVerdictById,
  cardMetricColumns,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {visibleRows.map((row) => {
        const p = row.player;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectPlayer?.(p)}
            className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-emerald-500/50 dark:hover:bg-slate-800/40 p-3 transition cursor-pointer"
          >
            {/* Top line: Shirt #, Name, Pos, Age, Stars */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                {row.shirtNumber !== null && (
                  <span className="font-mono text-[11px] font-bold text-slate-400">
                    #{row.shirtNumber}
                  </span>
                )}
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                  {p.name}
                </span>
                <span className="rounded bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:text-slate-200">
                  {p.position}
                </span>
                {p.age > 0 && (
                  <span className="text-[11px] font-mono text-slate-400">
                    {p.age}y
                  </span>
                )}
              </div>
              <div className="shrink-0 font-mono text-xs font-bold text-amber-500 tabular-nums">
                {(p.ability || 0).toFixed(1)}★
                <span className="text-slate-500 font-normal">
                  /{(p.potential || 0).toFixed(1)}★
                </span>
              </div>
            </div>

            {/* Second line: Roles + Status/Availability badges */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              {(p.ipRole || p.oopRole) && (
                <span className="text-slate-500 dark:text-slate-400 truncate max-w-full">
                  {p.ipRole}
                  {p.oopRole ? ` / ${p.oopRole}` : ''}
                </span>
              )}
              {row.isBanned && (
                <span className="rounded bg-rose-500/20 border border-rose-500/45 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                  BANNED ({row.activeBanMatches}m)
                </span>
              )}
              {row.isInjured && (
                <span className="rounded bg-amber-500/20 border border-amber-500/45 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                  INJURED
                </span>
              )}
              {p.onLoan && (
                <span className="rounded bg-indigo-500/20 border border-indigo-500/45 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                  LOAN
                </span>
              )}
              {row.optYears > 0 && (
                <span className="rounded bg-sky-500/15 border border-sky-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                  +{row.optYears}y Opt
                </span>
              )}
            </div>

            {row.cleanNote && (
              <div className="mt-1 text-[11px] text-slate-400 truncate">
                {row.cleanNote}
              </div>
            )}

            {/* Inline FM27 Card Analysis Strip */}
            {(() => {
              const cardEval = evaluateSquadPlayerCard(p, players, {
                divisionBenchmarks,
                activeTactic: lastMatchTactic,
                governance,
                transferVerdict: transferVerdictById.get(p.id) ?? null,
              });
              const toneText =
                cardEval.tone === 'emerald'
                  ? 'text-emerald-400'
                  : cardEval.tone === 'sky'
                    ? 'text-sky-300'
                    : cardEval.tone === 'amber'
                      ? 'text-amber-300'
                      : cardEval.tone === 'rose'
                        ? 'text-rose-400'
                        : 'text-slate-300';
              return (
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] pt-1.5 border-t border-slate-800/70">
                  <span className="truncate text-slate-300">
                    <strong className={toneText}>{cardEval.verdictLabel}</strong>
                    <span className="text-slate-500"> · </span>
                    <span className="text-slate-400">{cardEval.inlineRationale}</span>
                  </span>
                  {cardEval.promiseTag && (
                    <span className="font-mono text-[10px] text-amber-300 shrink-0">
                      {cardEval.promiseTag}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Preset Metric Chips */}
            <div
              className={`mt-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800/80 grid gap-2 ${
                cardMetricColumns.length >= 4
                  ? 'grid-cols-2 sm:grid-cols-4'
                  : 'grid-cols-3'
              }`}
            >
              {cardMetricColumns.map((colId) => {
                const meta = SQUAD_COLUMNS[colId];
                return (
                  <div key={colId} className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                      {meta.shortLabel}
                    </div>
                    <div className="mt-0.5 text-xs truncate">
                      {renderColumnValue(row, colId)}
                    </div>
                  </div>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
};
