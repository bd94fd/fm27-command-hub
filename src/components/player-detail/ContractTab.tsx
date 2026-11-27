/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatDynamicCurrency } from '../charts/chartScaleHelpers';
import { formatContractExpiry, formatWeeklyWage } from '../../utils/squadViewHelpers';
import {
  getPlaybookContractNotes,
  partitionContractClausesAndBonuses,
} from '../../utils/recruitmentHelpers';
import type { PlayerCardAnalysis } from '../../utils/playerCardAnalysis';
import type { PlayerRecord } from '../../types/fm27';

export interface ContractTabProps {
  player: PlayerRecord;
  analysis: PlayerCardAnalysis;
}

export function ContractTab({ player, analysis }: ContractTabProps) {
  const seasonHistory = player.seasonHistory || [];
  return (
  <div className="space-y-4">
    {analysis.seasonProduction.mode === 'fast_sync_missing' && (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
        <strong>Fast Sync mode active:</strong> Player goals, assists, xG and
        match ratings were skipped for speed. Uncheck <strong>Fast Sync</strong>{' '}
        and re-import your <span className="font-mono">.fm</span> save in the{' '}
        <strong>Hub</strong> tab to populate all player match stats.
      </div>
    )}
    {analysis.seasonProduction.mode === 'preseason_no_matches' && (
      <div className="rounded-xl border border-sky-500/35 bg-sky-950/25 px-4 py-3 text-xs text-sky-200">
        <strong>Pre-season snapshot (0 competitive matches played):</strong>{' '}
        Season stats will populate automatically after your first competitive
        match in this save.
      </div>
    )}
    {analysis.seasonProduction.mode === 'stats_unavailable' && (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
        <strong>Season match stats unavailable in this snapshot:</strong>{' '}
        Full Sync ran, but per-player season stats were not populated (partial
        checkpoint recovery or table timeout). Re-import in the{' '}
        <strong>Hub</strong> tab or check Save Reader Info in Club KPIs.
      </div>
    )}

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h4 className="font-bold uppercase tracking-wider text-slate-400">
            Season Production
          </h4>
          {analysis.seasonProduction.hasPlayed && player.statsSource && (
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-2xs text-slate-300">
              {player.statsSource}
            </span>
          )}
        </div>

        {!analysis.seasonProduction.hasPlayed ? (
          <p className="text-xs text-slate-400 py-3">
            {analysis.seasonProduction.mode === 'fast_sync_missing'
              ? 'Awaiting Full Sync to populate appearances, goals, assists and ratings.'
              : analysis.seasonProduction.mode === 'stats_unavailable'
                ? 'Season stats were not populated for this snapshot.'
                : 'No competitive appearances recorded yet this season.'}
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-slate-400">Apps / Minutes:</span>
              <span className="font-mono text-slate-200 text-right shrink-0 tabular-nums">
                {player.apps} ({player.minutes}m)
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-slate-400">Avg Rating:</span>
              <span className="font-mono text-emerald-300 font-semibold text-right shrink-0 tabular-nums">
                {player.rating !== null && player.rating > 0
                  ? player.rating.toFixed(2)
                  : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-slate-400">Goals (xG / 90):</span>
              <span className="font-mono text-slate-200 text-right shrink-0 tabular-nums">
                {player.goals} ({player.xG.toFixed(2)} · {player.xGPer90.toFixed(2)}/90)
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-slate-400">Assists (xA / 90):</span>
              <span className="font-mono text-slate-200 text-right shrink-0 tabular-nums">
                {player.assists} ({player.xA.toFixed(2)} · {player.xAPer90.toFixed(2)}/90)
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-slate-400">Drb / Prog.P / Int (/90):</span>
              <span className="font-mono text-slate-200 text-right shrink-0 tabular-nums">
                {player.drbPer90 > 0 ? player.drbPer90.toFixed(2) : '—'} /{' '}
                {player.prPassesPer90 > 0 ? player.prPassesPer90.toFixed(2) : '—'} /{' '}
                {player.intPer90 > 0 ? player.intPer90.toFixed(2) : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-slate-400">Tackling / Aerial %:</span>
              <span className="font-mono text-slate-200 text-right shrink-0 tabular-nums">
                {player.tckPct > 0 ? `${player.tckPct}%` : '—'} /{' '}
                {player.hdrPct > 0 ? `${player.hdrPct}%` : '—'}
              </span>
            </div>
            {(analysis.seasonProduction.finishingNote ||
              analysis.seasonProduction.creationNote) && (
              <div className="pt-2 border-t border-slate-800 space-y-1 text-micro text-emerald-300">
                {analysis.seasonProduction.finishingNote && (
                  <div>• {analysis.seasonProduction.finishingNote}</div>
                )}
                {analysis.seasonProduction.creationNote && (
                  <div>• {analysis.seasonProduction.creationNote}</div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-xs">
        <h4 className="font-bold uppercase tracking-wider text-slate-400 mb-2">
          Contract &amp; Squad Standing
        </h4>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-slate-400">Hub Squad Role:</span>
          <span className="font-semibold text-slate-200 text-right">{player.status}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-slate-400">Contract Promise:</span>
          <span className="font-semibold text-indigo-300 text-right">
            {analysis.contractStanding.promisedPlayingTime || 'Not recorded'}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-slate-400">Weekly / Annual:</span>
          <span className="font-mono text-slate-200 text-right tabular-nums">
            {formatWeeklyWage(player.wagePw)} (
            {Number.isFinite(analysis.contractStanding.annualWage)
              ? `£${analysis.contractStanding.annualWage.toLocaleString()}/yr`
              : '--'})
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-slate-400">Contract Expires:</span>
          <span className="font-mono text-amber-300 text-right tabular-nums">
            {formatContractExpiry(player.expires)}
            {analysis.contractStanding.monthsRemaining !== null
              ? ` (${analysis.contractStanding.monthsRemaining}m left)`
              : ''}
          </span>
        </div>
        {typeof player.marketValue === 'number' && player.marketValue >= 0 && (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-slate-400">Market Value:</span>
            <span className="font-mono text-emerald-300 text-right tabular-nums">
              {player.marketValueCapped || player.marketValueState === 'capped'
                ? 'Not for sale (£300m cap)'
                : player.marketValue > 0
                  ? formatDynamicCurrency(player.marketValue, 'marketValue')
                  : '£0'}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-slate-400">Ability / Potential:</span>
          <span
            className="font-mono text-amber-300 text-right tabular-nums"
            title={
              player.potentialUncertain
                ? 'Potential is stored as a dynamic youth range in this FM27 save rather than a fixed ceiling.'
                : undefined
            }
          >
            {player.ability.toFixed(1)}★ / {player.potential.toFixed(1)}★
            {player.potentialUncertain ? ' (Ranged)' : ''}
          </span>
        </div>
        {analysis.contractStanding.promiseMismatch && (
          <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-micro text-amber-200">
            {analysis.contractStanding.promiseMismatch}
          </div>
        )}
      </div>
    </div>

    {/* Contract Clauses, Match Bonuses & Promised Playing Time */}
    {(() => {
      const partitioned = partitionContractClausesAndBonuses(
        player.contractDetails
      );
      const contractNotes = getPlaybookContractNotes(player);
      const hasAnyBonus = Boolean(
        partitioned.bonuses.appearanceFee ||
          partitioned.bonuses.goalBonus ||
          partitioned.bonuses.cleanSheetBonus ||
          partitioned.bonuses.unusedSubFee ||
          typeof partitioned.loanWageContributionPct === 'number'
      );

      return (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold uppercase tracking-wider text-slate-400">
              Contract Clauses &amp; Match Bonuses
            </h4>
            {player.contractDetails?.promisedPlayingTime && (
              <span className="rounded-md bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 text-micro font-semibold text-indigo-300">
                Promised: {player.contractDetails.promisedPlayingTime}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="text-2xs uppercase text-slate-400">
                Optional Club Extension
              </div>
              <div className="mt-0.5 font-mono font-semibold text-slate-100">
                {player.contractDetails?.optionalExtensionYears
                  ? `+${player.contractDetails.optionalExtensionYears} year${player.contractDetails.optionalExtensionYears === 1 ? '' : 's'} (Club Option)`
                  : 'None recorded'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="text-2xs uppercase text-slate-400">
                Release Clauses
              </div>
              {partitioned.releaseClauses.length > 0 ? (
                <div className="mt-0.5 space-y-0.5">
                  {partitioned.releaseClauses.map((rc, idx) => (
                    <div key={`${rc.type}-${idx}`} className="font-mono text-amber-300">
                      {rc.type}: £{rc.amount.toLocaleString()}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-0.5 text-slate-400">No release clauses</div>
              )}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="text-2xs uppercase text-slate-400">
                Match Bonuses
              </div>
              <div className="mt-0.5 space-y-0.5 font-mono text-slate-200">
                {partitioned.bonuses.appearanceFee ? (
                  <div>
                    Appearance Fee: £{partitioned.bonuses.appearanceFee.toLocaleString()}
                  </div>
                ) : null}
                {partitioned.bonuses.goalBonus ? (
                  <div>
                    Goal Bonus: £{partitioned.bonuses.goalBonus.toLocaleString()}
                  </div>
                ) : null}
                {partitioned.bonuses.cleanSheetBonus ? (
                  <div>
                    Clean Sheet Bonus: £{partitioned.bonuses.cleanSheetBonus.toLocaleString()}
                  </div>
                ) : null}
                {partitioned.bonuses.unusedSubFee ? (
                  <div className="text-amber-300">
                    Unused Sub Fee: £{partitioned.bonuses.unusedSubFee.toLocaleString()}
                  </div>
                ) : null}
                {typeof partitioned.loanWageContributionPct === 'number' ? (
                  <div className="text-sky-300">
                    Loan Wage Split: {partitioned.loanWageContributionPct}%
                  </div>
                ) : null}
                {!hasAnyBonus && (
                  <span className="font-sans text-slate-400">Standard terms</span>
                )}
              </div>
            </div>
          </div>

          {contractNotes.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1 text-amber-200">
              <div className="text-2xs font-bold uppercase tracking-wider text-amber-300">
                Playbook v2.0 Contract Notes
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-micro">
                {contractNotes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    })()}

    {/* Career Season History */}
    {seasonHistory.length > 0 && (
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 sm:p-4 space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Career Season History ({seasonHistory.length} Seasons)
        </h4>
        {/* Mobile cards (< sm) — zero horizontal scrolling at 360px */}
        <div className="space-y-1.5 sm:hidden">
          {seasonHistory.map((h, i) => (
            <div
              key={`m-${h.season}-${h.club}-${i}`}
              className="rounded-lg border border-slate-800/80 bg-slate-900/70 px-3 py-2 flex items-center justify-between gap-2 text-xs"
            >
              <div className="min-w-0">
                <div className="font-mono font-semibold text-white">
                  {h.season}{' '}
                  <span className="font-sans font-normal text-slate-300">
                    · {h.club}
                  </span>
                </div>
                <div className="text-micro font-mono text-slate-400 tabular-nums">
                  {h.apps} apps · {h.goals}G · {h.assists}A
                </div>
              </div>
              <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono font-bold text-emerald-300 tabular-nums shrink-0">
                {h.avgRating.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        {/* Desktop table (sm:+) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-300">
            <thead className="bg-slate-900/95 text-2xs uppercase text-slate-400">
              <tr>
                <th className="px-2.5 py-2">Season</th>
                <th className="px-2.5 py-2">Club</th>
                <th className="px-2.5 py-2">Apps</th>
                <th className="px-2.5 py-2">Goals</th>
                <th className="px-2.5 py-2">Assists</th>
                <th className="px-2.5 py-2">Avg Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {seasonHistory.map((h, i) => (
                <tr key={`${h.season}-${h.club}-${i}`}>
                  <td className="px-2.5 py-1.5 font-mono font-medium text-white">
                    {h.season}
                  </td>
                  <td className="px-2.5 py-1.5">{h.club}</td>
                  <td className="px-2.5 py-1.5 font-mono">{h.apps}</td>
                  <td className="px-2.5 py-1.5 font-mono">{h.goals}</td>
                  <td className="px-2.5 py-1.5 font-mono">{h.assists}</td>
                  <td className="px-2.5 py-1.5 font-mono font-semibold text-emerald-300">
                    {h.avgRating.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>
  );
}
