import React from 'react';
import { MatchLogEntry } from '../types/fm27';
import { computeCompetitiveSummary } from '../utils/fmSyncEngine';

interface MatchLogArchiveProps {
  matches: MatchLogEntry[];
  liveLeagueRecord?: string | null;
  liveSaveFileName?: string | null;
}

export const MatchLogArchive: React.FC<MatchLogArchiveProps> = ({
  matches,
  liveLeagueRecord,
  liveSaveFileName,
}) => {
  const summary = computeCompetitiveSummary(matches);

  return (
    <div className="space-y-6">
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Table 1G · Competitive Match Log &amp; Data Hub Audit Archive
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {liveSaveFileName
                ? `Synced directly from ${liveSaveFileName} (dates, opponents & scorelines from .fm binary; attach Data Hub screenshots to enrich match xG/possession)`
                : 'Awaiting .fm save or match screenshot to populate live match chronology'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-700 dark:text-slate-300">
            <span>
              League Record:{' '}
              {liveLeagueRecord ||
                (summary.played > 0
                  ? `${summary.played} GP (${summary.wins}W-${summary.draws}D-${summary.losses}L · ${summary.points} Pts)`
                  : '--')}
            </span>
            {summary.xgMatchesCount > 0 && (
              <>
                <span>&middot;</span>
                <span>
                  Audited League xG ({summary.xgMatchesCount}m):{' '}
                  {summary.totalXgFor.toFixed(2)} For vs{' '}
                  {summary.totalXgAgainst.toFixed(2)} Against (
                  {summary.xgDiff >= 0 ? `+${summary.xgDiff}` : summary.xgDiff})
                </span>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-3">Event &amp; Date</th>
                <th className="py-2.5 pr-3">Fixture</th>
                <th className="py-2.5 pr-3">Result</th>
                <th className="py-2.5 pr-3 text-right">xG (Diff)</th>
                <th className="py-2.5 pr-3 text-right">Poss / Pass%</th>
                <th className="py-2.5 pr-3 text-right">Shots / CCC</th>
                <th className="py-2.5 pr-3">Goal Timeline &amp; POTM</th>
                <th className="py-2.5">Tactical Audit &amp; Directives</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {matches.map((m) => {
                const hasXg =
                  typeof m.xGFor === 'number' && typeof m.xGAgainst === 'number';
                const xgDelta = hasXg
                  ? Number(((m.xGFor ?? 0) - (m.xGAgainst ?? 0)).toFixed(2))
                  : null;
                const resultColor =
                  m.result === 'W'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : m.result === 'D'
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400';

                return (
                  <tr
                    key={m.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 align-top"
                  >
                    <td className="py-3 pr-3 font-mono whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                        <span>Event #{m.eventNumber}</span>
                        {m.source === 'FM_SAVE' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded">
                            .FM
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {m.date}
                      </div>
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        vs {m.opponent} ({m.venue})
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {m.competition}
                      </div>
                    </td>
                    <td
                      className={`py-3 pr-3 font-mono font-bold whitespace-nowrap ${resultColor}`}
                    >
                      {m.result} {m.score}
                    </td>
                    <td className="py-3 pr-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {hasXg ? (
                        <>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {(m.xGFor ?? 0).toFixed(2)} -{' '}
                            {(m.xGAgainst ?? 0).toFixed(2)}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">
                            {xgDelta !== null && xgDelta >= 0
                              ? `+${xgDelta}`
                              : xgDelta}
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {typeof m.possession === 'number' ||
                      typeof m.passCompletion === 'number'
                        ? `${m.possession ?? '—'}% / ${m.passCompletion ?? '—'}%`
                        : '—'}
                    </td>
                    <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      <div>
                        {m.shotsFor && m.shotsFor !== '—'
                          ? `${m.shotsFor} vs ${m.shotsAgainst}`
                          : '—'}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {typeof m.cccFor === 'number'
                          ? `CCC: ${m.cccFor} - ${m.cccAgainst ?? 0}`
                          : ''}
                      </div>
                    </td>
                    <td className="py-3 pr-3 min-w-[210px] space-y-1">
                      <div className="text-slate-800 dark:text-slate-200">
                        {m.goalTimeline}
                      </div>
                      <div className="text-emerald-700 dark:text-emerald-400 font-medium">
                        {m.potm}
                      </div>
                    </td>
                    <td className="py-3 text-slate-600 dark:text-slate-400 min-w-[260px] space-y-1">
                      {m.defensiveWatchpoints && m.defensiveWatchpoints !== '—' && (
                        <div>{m.defensiveWatchpoints}</div>
                      )}
                      <div className="text-slate-800 dark:text-slate-300 font-medium">
                        {m.tacticalAudit}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
