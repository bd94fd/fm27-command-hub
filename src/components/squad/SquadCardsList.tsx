import React from 'react';
import type { PlayerRecord } from '../../types/fm27';
import type {
  ClubGovernanceState,
  DivisionBenchmarks,
  LastMatchTacticBlueprint,
} from '../../types/fmSave';
import type { TransferActionVerdict } from '../../utils/transferAudit';
import { evaluateSquadPlayerCard } from '../../utils/cardIntelligenceEngine';
import { resolveCompleteCardColumns } from '../../utils/mobilePitchLayout';
import {
  EnrichedSquadRow,
  formatCompactCurrency,
  SQUAD_COLUMNS,
  SquadColumnId,
  SquadViewPresetId,
} from '../../utils/squadViewHelpers';
import { renderColumnValue } from './squadBadges';
import { CompareTrayToggle } from '../CompareTrayToggle';

interface SquadCardsListProps {
  visibleRows: EnrichedSquadRow[];
  players: PlayerRecord[];
  onSelectPlayer?: (player: PlayerRecord) => void;
  divisionBenchmarks: DivisionBenchmarks | null;
  lastMatchTactic: LastMatchTacticBlueprint | null;
  governance: ClubGovernanceState | null;
  transferVerdictById: Map<string, TransferActionVerdict>;
  cardMetricColumns: SquadColumnId[];
  activePresetId?: SquadViewPresetId;
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
  activePresetId = 'overview',
}) => {
  const completeColumns = resolveCompleteCardColumns(
    cardMetricColumns,
    activePresetId
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
      {visibleRows.map((row) => {
        const p = row.player;
        const isSurplus =
          p.status === 'Surplus' ||
          /surplus/i.test(p.contractDetails?.promisedPlayingTime || '');
        const marketValueText =
          p.marketValueCapped || p.marketValueState === 'capped'
            ? 'Not for sale'
            : formatCompactCurrency(p.marketValue);
        const showAppsFooter = !completeColumns.includes('apps');
        const showGoalsFooter = !completeColumns.includes('goalsXg');
        const showValueFooter = !completeColumns.includes('value');
        const showExpiryFooter = !completeColumns.includes('expiry');

        return (
          <div
            key={p.id}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-emerald-500/50 dark:hover:bg-slate-800/40 transition overflow-hidden"
          >
            <button
              type="button"
              onClick={() => onSelectPlayer?.(p)}
              className="w-full min-h-[44px] text-left p-3.5 cursor-pointer"
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
                  <span
                    title={row.activeBanTooltip || 'Suspended'}
                    className="rounded bg-rose-500/20 border border-rose-500/45 px-1.5 py-0.5 text-[10px] font-bold text-rose-300"
                  >
                    BANNED ({row.activeBanMatches}m)
                  </span>
                )}
                {!row.isBanned && row.hasOtherCompBan && (
                  <span
                    title={row.activeBanTooltip || 'Other-competition ban only — eligible next match'}
                    className="rounded bg-amber-500/15 border border-amber-500/45 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"
                  >
                    CUP BAN ({row.activeBanMatches}m)
                  </span>
                )}
                {row.isInjured && (
                  <span className="rounded bg-amber-500/20 border border-amber-500/45 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                    INJURED
                  </span>
                )}
                {isSurplus && (
                  <span className="rounded bg-rose-500/15 border border-rose-500/40 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                    SURPLUS
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

              {/* Inline FM27 Card Analysis Strip (2-line readable on mobile) */}
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
                  <div className="mt-2 flex items-start justify-between gap-2 text-[11px] pt-1.5 border-t border-slate-200/70 dark:border-slate-800/70">
                    <span className="line-clamp-2 sm:truncate text-slate-600 dark:text-slate-300 leading-snug">
                      <strong className={toneText}>{cardEval.verdictLabel}</strong>
                      <span className="text-slate-500"> · </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {cardEval.inlineRationale}
                      </span>
                    </span>
                    {cardEval.promiseTag && (
                      <span className="font-mono text-[10px] text-amber-300 shrink-0">
                        {cardEval.promiseTag}
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Complete 4-KPI Preset Metric Grid (2×2 on phones, 4-across on sm+) */}
              <div className="mt-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {completeColumns.map((colId) => {
                  const meta = SQUAD_COLUMNS[colId];
                  return (
                    <div
                      key={colId}
                      className="rounded-lg border border-slate-200/80 dark:border-slate-800/90 bg-white/75 dark:bg-slate-900/70 px-2 py-1.5 min-w-0"
                    >
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

              {/* Compact Season & Contract Context Strip */}
              {(showAppsFooter || showGoalsFooter || showValueFooter || showExpiryFooter) && (
                <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  {showAppsFooter && (
                    <span>
                      Apps{' '}
                      <strong className="text-slate-700 dark:text-slate-200">
                        {p.apps || 0}
                      </strong>{' '}
                      ({p.minutes || 0}m)
                    </span>
                  )}
                  {showGoalsFooter && (p.goals > 0 || p.assists > 0) && (
                    <span>
                      G/A{' '}
                      <strong className="text-slate-700 dark:text-slate-200">
                        {p.goals}/{p.assists}
                      </strong>
                    </span>
                  )}
                  {showValueFooter && (
                    <span>
                      Val{' '}
                      <strong className="text-slate-700 dark:text-slate-200">
                        {marketValueText}
                      </strong>
                    </span>
                  )}
                  {showExpiryFooter && row.expiryYear && (
                    <span>
                      Exp{' '}
                      <strong className="text-slate-700 dark:text-slate-200">
                        {row.expiryYear}
                      </strong>
                    </span>
                  )}
                </div>
              )}
            </button>
            <div className="flex items-center justify-end px-3.5 pb-2.5 -mt-1">
              <CompareTrayToggle player={p} />
            </div>
          </div>
        );
      })}
    </div>
  );
};
