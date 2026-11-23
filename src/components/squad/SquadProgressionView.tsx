import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Sparkles, Trash2, TrendingUp } from 'lucide-react';
import type { PlayerRecord } from '../../types/fm27';
import type { ProgressionDiffReport, ProgressionSnapshot } from '../../utils/progressionDiff';

interface SquadProgressionViewProps {
  progressionArchive: ProgressionSnapshot[];
  progressionDiff: ProgressionDiffReport | null;
  baselineIdx: number;
  setBaselineIdx: Dispatch<SetStateAction<number>>;
  confirmClearProgression: boolean;
  handleClearProgressionSnapshots: () => void;
  progressionDirection: 'ALL' | 'RISERS' | 'FALLERS';
  setProgressionDirection: Dispatch<SetStateAction<'ALL' | 'RISERS' | 'FALLERS'>>;
  showMinorProgressionShifts: boolean;
  setShowMinorProgressionShifts: Dispatch<SetStateAction<boolean>>;
  expandedMinorUids: Record<number, boolean>;
  setExpandedMinorUids: Dispatch<SetStateAction<Record<number, boolean>>>;
  players: PlayerRecord[];
  onSelectPlayer?: (player: PlayerRecord) => void;
}

export const SquadProgressionView: React.FC<SquadProgressionViewProps> = ({
  progressionArchive,
  progressionDiff,
  baselineIdx,
  setBaselineIdx,
  confirmClearProgression,
  handleClearProgressionSnapshots,
  progressionDirection,
  setProgressionDirection,
  showMinorProgressionShifts,
  setShowMinorProgressionShifts,
  expandedMinorUids,
  setExpandedMinorUids,
  players,
  onSelectPlayer,
}) => {
  return (
    <div className="pt-4 space-y-5">
      {progressionArchive.length < 2 || !progressionDiff ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-6 text-center space-y-3">
          <TrendingUp className="w-6 h-6 text-emerald-500 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Awaiting Multi-Save Progression Baseline
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            {progressionArchive.length === 1
              ? `1 snapshot captured (${progressionArchive[0].saveDate}). Sync a second .fm save from a later in-game date to unlock attribute risers/fallers, Mentoring Determination Jumps, and Youth Intake Radar.`
              : 'Sync at least two .fm saves from different in-game dates to track rolling 30-save progression diffs.'}
          </p>
          {progressionArchive.length === 1 && (
            <button
              type="button"
              onClick={() => void handleClearProgressionSnapshots()}
              className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                confirmClearProgression
                  ? 'border-rose-500/60 bg-rose-950/80 text-rose-200 hover:bg-rose-900/80'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-rose-500/40 hover:text-rose-400'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {confirmClearProgression ? 'Tap Again to Clear Snapshot' : 'Clear Stored Snapshot'}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Comparing{' '}
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                {progressionDiff.baselineSaveDate}
              </span>{' '}
              &rarr;{' '}
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {progressionDiff.latestSaveDate}
              </span>{' '}
              ({progressionArchive.length}/30 archived saves)
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <span>Baseline:</span>
                <select
                  aria-label="Baseline snapshot"
                  value={Math.min(baselineIdx, progressionArchive.length - 2)}
                  onChange={(e) => setBaselineIdx(Number(e.target.value))}
                  className="px-2.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  {progressionArchive.slice(0, -1).map((snap, idx) => (
                    <option key={snap.saveDate} value={idx}>
                      {snap.saveDate} ({Object.keys(snap.players).length} players)
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void handleClearProgressionSnapshots()}
                className={`min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  confirmClearProgression
                    ? 'border-rose-500/60 bg-rose-950/80 text-rose-200 hover:bg-rose-900/80'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-rose-500/40 hover:text-rose-400'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {confirmClearProgression ? 'Confirm Clear?' : 'Clear Snapshots'}
              </button>
            </div>
          </div>

          {/* Progression Signal Summary & Filter Controls */}
          {(() => {
            const totalPlayersChanged = progressionDiff.playerSummaries.length;
            const netPositivePlayers = progressionDiff.playerSummaries.filter(
              (s) => s.netDelta > 0
            ).length;
            const filteredSummaries = progressionDiff.playerSummaries.filter((s) => {
              if (progressionDirection === 'RISERS' && s.netDelta <= 0) return false;
              if (progressionDirection === 'FALLERS' && s.netDelta >= 0) return false;
              if (!showMinorProgressionShifts && s.meaningfulDeltas.length === 0) {
                return false;
              }
              return true;
            });
            const hiddenMinorOnlyPlayers =
              !showMinorProgressionShifts
                ? progressionDiff.playerSummaries.filter(
                    (s) => s.meaningfulDeltas.length === 0
                  ).length
                : 0;

            return (
              <div className="space-y-4">
                {/* Compact Progression KPI Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-3">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Players Developing
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-emerald-500 mt-0.5">
                      {netPositivePlayers} / {totalPlayersChanged}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Net positive attribute shift
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-3">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Major Shifts (|&Delta;| &ge; 2)
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-sky-400 mt-0.5">
                      {progressionDiff.majorShiftsCount}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      High-impact growth/decline
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-3">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Mentoring Det Jumps
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-amber-400 mt-0.5">
                      {progressionDiff.mentoringDeterminationJumps.length}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Determination +2 or higher
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-3">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Noise Filtered Out
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-slate-300 mt-0.5">
                      {progressionDiff.filteredIrrelevantCount}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Irrelevant GK/outfield stats
                    </div>
                  </div>
                </div>

                {/* Mentoring Determination Jumps */}
                {progressionDiff.mentoringDeterminationJumps.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        Mentoring Determination Jumps (+2 or more)
                      </h3>
                      <span className="text-xs font-mono tabular-nums text-amber-400">
                        {progressionDiff.mentoringDeterminationJumps.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {progressionDiff.mentoringDeterminationJumps.map((j) => (
                        <span
                          key={`${j.uid}-${j.attributeName}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-200 border border-amber-500/30"
                        >
                          <span>{j.playerName}</span>
                          <span className="font-mono tabular-nums font-bold">
                            {j.fromValue}&rarr;{j.toValue} (+{j.delta})
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Player-Grouped Progression Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'ALL', label: 'All Players' },
                        { id: 'RISERS', label: 'Net Risers' },
                        { id: 'FALLERS', label: 'Net Decliners' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setProgressionDirection(opt.id)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition cursor-pointer ${
                          progressionDirection === opt.id
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setShowMinorProgressionShifts((prev) => !prev)
                    }
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition cursor-pointer ${
                      showMinorProgressionShifts
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        : 'bg-slate-900/70 text-slate-300 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    {showMinorProgressionShifts
                      ? 'Showing All Relevant Shifts (incl. minor ±1)'
                      : `Meaningful Shifts First${hiddenMinorOnlyPlayers > 0 ? ` (+${hiddenMinorOnlyPlayers} minor-only hidden)` : ''}`}
                  </button>
                </div>

                {/* Player-Grouped Impact Cards */}
                {filteredSummaries.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center space-y-2">
                    <p className="text-xs text-slate-400">
                      {totalPlayersChanged === 0
                        ? 'No relevant attribute changes recorded between these two saves.'
                        : 'No players match this filter with meaningful shifts (|Δ| ≥ 2 or key role attributes).'}
                    </p>
                    {!showMinorProgressionShifts && totalPlayersChanged > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowMinorProgressionShifts(true)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-300 border border-slate-700 cursor-pointer"
                      >
                        Show All {totalPlayersChanged} Players (Including Minor ±1 Shifts)
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredSummaries.map((summary) => {
                      const matchedPlayer = players.find(
                        (p) => p.uid === summary.uid
                      );
                      const isExpanded = Boolean(
                        expandedMinorUids[summary.uid]
                      );
                      const visibleDeltas =
                        showMinorProgressionShifts || isExpanded
                          ? summary.deltas
                          : summary.meaningfulDeltas;
                      const hiddenMinorCount =
                        !showMinorProgressionShifts && !isExpanded
                          ? summary.minorDeltas.length
                          : 0;

                      return (
                        <div
                          key={summary.uid}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-3.5 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                matchedPlayer &&
                                onSelectPlayer?.(matchedPlayer)
                              }
                              className={`text-left min-w-0 flex-1 ${
                                matchedPlayer && onSelectPlayer
                                  ? 'cursor-pointer group'
                                  : ''
                              }`}
                            >
                              <div className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-400 transition break-words">
                                {summary.playerName}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                                {summary.position} · Age {summary.age}
                                {summary.majorCount > 0
                                  ? ` · ${summary.majorCount} major shift${summary.majorCount === 1 ? '' : 's'}`
                                  : ''}
                              </div>
                            </button>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`rounded-md border px-2 py-0.5 text-xs font-mono tabular-nums font-bold ${
                                  summary.netDelta > 0
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                                    : summary.netDelta < 0
                                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                                      : 'bg-slate-800 text-slate-300 border-slate-700'
                                }`}
                              >
                                Net {summary.netDelta > 0 ? `+${summary.netDelta}` : summary.netDelta}
                              </span>
                            </div>
                          </div>

                          {/* Humanized Attribute Delta Chips */}
                          <div className="flex flex-wrap gap-1.5">
                            {visibleDeltas.map((d) => {
                              const isMajor = d.impactTier === 'major';
                              const isRise = d.delta > 0;
                              return (
                                <span
                                  key={`${summary.uid}-${d.attributeName}`}
                                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${
                                    isRise
                                      ? isMajor
                                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200 font-semibold'
                                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                      : isMajor
                                        ? 'bg-rose-500/20 border-rose-400/50 text-rose-200 font-semibold'
                                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                                  }`}
                                >
                                  <span>{d.attributeLabel}</span>
                                  <span className="font-mono tabular-nums font-bold">
                                    {d.fromValue}&rarr;{d.toValue} (
                                    {d.delta > 0 ? `+${d.delta}` : d.delta})
                                  </span>
                                </span>
                              );
                            })}
                          </div>

                          {hiddenMinorCount > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedMinorUids((prev) => ({
                                  ...prev,
                                  [summary.uid]: true,
                                }))
                              }
                              className="text-[11px] font-medium text-slate-400 hover:text-emerald-300 cursor-pointer"
                            >
                              + Show {hiddenMinorCount} minor &plusmn;1 shift
                              {hiddenMinorCount === 1 ? '' : 's'}
                            </button>
                          )}
                          {!showMinorProgressionShifts &&
                            isExpanded &&
                            summary.minorDeltas.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedMinorUids((prev) => ({
                                    ...prev,
                                    [summary.uid]: false,
                                  }))
                                }
                                className="text-[11px] font-medium text-slate-400 hover:text-slate-200 cursor-pointer"
                              >
                                Hide minor &plusmn;1 shifts
                              </button>
                            )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Youth Intake / Newgen Radar */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400">
                  Youth Intake &amp; Newgen Radar (Ranked by Stars · Club DNA Fit % · Physical Score)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Brand-new player UIDs since {progressionDiff.baselineSaveDate} — strictly zero raw CA/PA.
                </p>
              </div>
              <span className="text-xs font-mono text-sky-400">
                {progressionDiff.youthIntakeHighlights.length} U18 /{' '}
                {progressionDiff.newgenRadar.length} total
              </span>
            </div>
            {progressionDiff.newgenRadar.length === 0 ? (
              <p className="text-xs text-slate-500">
                No new player UIDs added since {progressionDiff.baselineSaveDate}.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {progressionDiff.newgenRadar.map((n, idx) => {
                  const matchedPlayer = players.find((p) => p.uid === n.uid);
                  return (
                    <button
                      key={n.uid}
                      type="button"
                      onClick={() => matchedPlayer && onSelectPlayer?.(matchedPlayer)}
                      className={`text-left rounded-xl p-2.5 text-xs border transition ${
                        n.isYouthIntakeHighlight
                          ? 'bg-sky-500/10 text-sky-200 border-sky-500/40 hover:border-sky-400'
                          : 'bg-slate-800/50 text-slate-300 border-slate-700 hover:border-slate-600'
                      } ${matchedPlayer && onSelectPlayer ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-white truncate">
                          #{idx + 1} {n.playerName}
                        </span>
                        {n.isYouthIntakeHighlight && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-sky-500/30 text-sky-100 shrink-0">
                            U18 INTAKE
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                        <span className="text-slate-300">
                          {n.position} · Age {n.age}
                        </span>
                        <span className="text-amber-400 font-bold">
                          {n.abilityStars.toFixed(1)}★/{n.potentialStars.toFixed(1)}★
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                        <span className="rounded bg-emerald-500/15 border border-emerald-500/35 px-1.5 py-0.5 text-emerald-300 font-semibold">
                          DNA Fit {n.clubDnaFitPct}% ({n.bestArchetypeShortLabel})
                        </span>
                        <span className="rounded bg-indigo-500/15 border border-indigo-500/35 px-1.5 py-0.5 text-indigo-300">
                          Phys {n.physicalEngineScore}/100
                        </span>
                        <span className="text-slate-400">
                          Det {n.determination} · Pac {n.pace}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
