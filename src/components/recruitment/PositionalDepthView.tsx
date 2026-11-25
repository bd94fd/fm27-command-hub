import React from 'react';
import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import type { PlayerRecord } from '../../types/fm27';
import type { RecruitmentTarget } from '../../types/fmSave';
import type { ShortlistTargetAdvice } from '../../utils/shortlistAdviceEngine';
import type { PositionBucketCode } from '../../utils/transferAudit';
import { formatWeeklyWage } from '../../utils/squadViewHelpers';
import type { PositionalNeed, SquadAudit } from './recruitmentTypes';

interface PositionalDepthViewProps {
  audit: SquadAudit;
  thinPositions: PositionalNeed[];
  promoteInternalPositions: PositionalNeed[];
  successionGapPositions: PositionalNeed[];
  overstockedPositions: PositionalNeed[];
  shortlistByBucketCode?: Record<PositionBucketCode, ShortlistTargetAdvice[]>;
  onSelectPlayer: (player: PlayerRecord) => void;
  onOpenShortlistTarget?: (target: RecruitmentTarget) => void;
}

export const PositionalDepthView: React.FC<PositionalDepthViewProps> = ({
  audit,
  thinPositions,
  promoteInternalPositions,
  successionGapPositions,
  overstockedPositions,
  shortlistByBucketCode,
  onSelectPlayer,
  onOpenShortlistTarget,
}) => {
  return (
    <div className="space-y-3">
      {/* Squad Depth Audit Summary Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-slate-300">
          <span className="font-semibold text-white">
            Squad-Relative Primary Depth
          </span>
          <span className="text-slate-500">·</span>
          <span>
            First-Team Ready U21s (≥{' '}
            <strong className="font-mono text-teal-300">
              {audit.tierBenchmarks.firstTeamRotationFloor.toFixed(1)}★
            </strong>
            , Starter ≥{' '}
            <strong className="font-mono text-emerald-300">
              {audit.tierBenchmarks.firstTeamStarterFloor.toFixed(1)}★
            </strong>
            ) are separated from raw Academy prospects so 3.5★ ready players are never mixed with 1.0★ teenagers.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono tabular-nums">
          <span className="rounded bg-rose-500/15 border border-rose-500/35 px-2 py-0.5 text-rose-300">
            Need Signing: {thinPositions.length}
          </span>
          <span className="rounded bg-teal-500/15 border border-teal-500/35 px-2 py-0.5 text-teal-300">
            Promote Internal: {promoteInternalPositions.length}
          </span>
          <span className="rounded bg-purple-500/15 border border-purple-500/35 px-2 py-0.5 text-purple-300">
            Succession: {successionGapPositions.length}
          </span>
          <span className="rounded bg-amber-500/15 border border-amber-500/35 px-2 py-0.5 text-amber-300">
            Overstocked: {overstockedPositions.length}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {audit.positionalNeeds.map((b) => {
          const isThin = b.status === 'Need Signing';
          const isPromoteInternal = b.status === 'Promote Internal';
          const isOver = b.status === 'Overstocked';
          const isSuccessionGap = b.hasSuccessionGap;
          const readyYouthCount = b.firstTeamReadyYouthPlayers.length;
          return (
            <div
              key={b.code}
              className={`rounded-2xl border p-4 space-y-3 flex flex-col ${
                isThin
                  ? 'border-rose-500/40 bg-rose-950/20'
                  : isPromoteInternal
                    ? 'border-teal-500/45 bg-teal-950/15'
                    : isSuccessionGap
                      ? 'border-purple-500/45 bg-purple-950/20'
                      : isOver
                        ? 'border-amber-500/40 bg-amber-950/15'
                        : 'border-slate-800 bg-slate-900/60'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <h4 className="text-sm font-bold text-white">{b.label}</h4>
                  {isPromoteInternal && (
                    <span className="rounded bg-teal-500/20 border border-teal-500/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-200">
                      Promote Internal
                    </span>
                  )}
                  {isSuccessionGap && (
                    <span className="rounded bg-purple-500/25 border border-purple-500/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-200">
                      Succession Gap
                    </span>
                  )}
                </div>
                <span
                  className={`text-[11px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-md shrink-0 ${
                    isThin
                      ? 'bg-rose-500/20 text-rose-300'
                      : isPromoteInternal
                        ? 'bg-teal-500/20 text-teal-200'
                        : isOver
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                  }`}
                >
                  {b.currentCount} Senior
                  {readyYouthCount > 0 ? ` + ${readyYouthCount} Ready` : ''} (Ideal {b.idealMin}–{b.idealMax})
                </span>
              </div>

              {isSuccessionGap && (
                <div className="rounded-lg border border-purple-500/35 bg-purple-950/40 p-2.5 text-[11px] text-purple-200 leading-snug">
                  All senior primary options are <strong>28+</strong> with <strong>no U23 cover</strong> — scout a U23 successor.
                </div>
              )}

              {isPromoteInternal && (
                <div className="rounded-lg border border-teal-500/35 bg-teal-950/35 p-2.5 text-[11px] text-teal-100 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-teal-300">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      No External Signing Needed — Promote {readyYouthCount} First-Team Ready U21 Option{readyYouthCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 leading-snug">
                    {b.firstTeamReadyYouthPlayers
                      .map((p) => `${p.name} (Age ${p.age}, ${p.ability.toFixed(1)}★)`)
                      .join(', ')}{' '}
                    already meet your {audit.tierBenchmarks.firstTeamRotationFloor.toFixed(1)}★ First-Team standard.
                  </div>
                </div>
              )}

              {isThin && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-950/40 p-2.5 text-[11px] text-rose-200 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-rose-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      First-Team Primary Gap ({b.effectiveReadyCount}/{b.idealMin} ready
                      {b.secondaryCoverPlayers.length > 0
                        ? `, ${b.secondaryCoverPlayers.length} versatile cover`
                        : ''}
                      )
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 leading-snug">
                    {b.scoutProfile}
                  </div>
                </div>
              )}

              {isOver && (
                <div className="text-[11px] text-amber-300 leading-snug">
                  Senior primary depth is overstocked ({b.currentCount} vs ideal {b.idealMin}–{b.idealMax}) — review paid backups before adding wages.
                </div>
              )}

              {/* Contextual In-Game Shortlist Matches for Gaps & Succession */}
              {(isThin || isSuccessionGap) && shortlistByBucketCode && (() => {
                const bucketMatches = (shortlistByBucketCode[b.code] || []).filter(
                  (m) => m.isActionable || m.tier === 'monitor_budget_blocked'
                );
                const actionableMatches = bucketMatches.filter((m) => m.isActionable);
                return (
                  <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-2.5 space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between gap-1.5 font-bold text-sky-200">
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5 text-sky-300 shrink-0" />
                        On Your In-Game Shortlist ({actionableMatches.length} Budget-Ready)
                      </span>
                    </div>
                    {bucketMatches.length === 0 ? (
                      <p className="text-slate-400 leading-snug">
                        No matching {b.code} on your in-game shortlist yet — add a {b.code} matching the profile above in FM27 and re-sync.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {bucketMatches.slice(0, 3).map((m) => (
                          <button
                            key={m.target.uid}
                            type="button"
                            onClick={() => onOpenShortlistTarget?.(m.target)}
                            className="w-full rounded-lg border border-slate-800 bg-slate-950/80 hover:border-emerald-500/50 px-2.5 py-1.5 text-left transition cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-semibold text-white truncate">
                                {m.target.name}{' '}
                                <span className="font-normal text-slate-400">
                                  ({m.target.age}y · {m.bestIpRole} {m.ipRoleFitPct}%)
                                </span>
                              </span>
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                  m.isActionable
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-amber-500/20 text-amber-300'
                                }`}
                              >
                                {m.tierLabel}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 truncate mt-0.5">
                              {m.budget.feeLabel} · {m.character.personalityLabel}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 1. Senior Primary Players (All rows shown cleanly, zero mid-row clipping) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  <span>Senior First Team (Primary)</span>
                  <span>{b.seniorPrimaryPlayers.length}</span>
                </div>
                {b.seniorPrimaryPlayers.length === 0 ? (
                  <div className="text-[11px] text-slate-500 italic px-1">
                    {readyYouthCount > 0
                      ? '0 assigned to Senior slot — promote Ready U21 below'
                      : 'No senior primary options'}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {b.seniorPrimaryPlayers.map((p) => {
                      const isSurplus =
                        p.status === 'Surplus' ||
                        /surplus/i.test(
                          p.contractDetails?.promisedPlayingTime || ''
                        );
                      const isTeenStarter =
                        p.age <= 20 &&
                        p.ability >= audit.tierBenchmarks.firstTeamStarterFloor;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onSelectPlayer(p)}
                          className="w-full flex items-center justify-between gap-2 rounded-lg bg-slate-950/75 border border-slate-800/80 px-2.5 py-2 text-xs hover:border-emerald-500/40 transition text-left cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-100 break-words leading-tight">
                              {p.name}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span>Age {p.age}</span>
                              <span>·</span>
                              <span className="font-mono tabular-nums">
                                {formatWeeklyWage(p.wagePw)}
                              </span>
                              {isTeenStarter && (
                                <span className="rounded bg-emerald-500/20 px-1 text-[9px] font-bold text-emerald-300">
                                  Young Starter
                                </span>
                              )}
                              {isSurplus && (
                                <span className="rounded bg-rose-500/20 px-1 text-[9px] font-bold text-rose-300">
                                  Surplus
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-mono tabular-nums text-amber-300 font-semibold text-[11px] shrink-0">
                            {p.ability.toFixed(1)}★/{p.potential.toFixed(1)}★
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. First-Team Ready U21 / Reserve Players (Meet squad rotation/starter CA floor — Promote Now) */}
              {b.firstTeamReadyYouthPlayers.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800/70">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-teal-300">
                    <span>First-Team Ready (U21 / Reserve — Promote)</span>
                    <span>{b.firstTeamReadyYouthPlayers.length}</span>
                  </div>
                  <div className="space-y-1">
                    {b.firstTeamReadyYouthPlayers.map((p) => {
                      const isStarterQual =
                        p.ability >= audit.tierBenchmarks.firstTeamStarterFloor;
                      return (
                        <button
                          key={`rdy-${p.id}`}
                          type="button"
                          onClick={() => onSelectPlayer(p)}
                          className="w-full flex items-center justify-between gap-2 rounded-lg bg-teal-950/30 border border-teal-500/35 px-2.5 py-1.5 text-[11px] hover:border-teal-400/70 transition text-left cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-teal-50 font-semibold break-words">
                              {p.name}{' '}
                              <span className="text-[10px] font-normal text-teal-200/80">
                                (Age {p.age})
                              </span>
                            </span>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1">
                              <span
                                className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${
                                  isStarterQual
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-teal-500/20 text-teal-200'
                                }`}
                              >
                                {isStarterQual ? 'Starter Level' : 'Rotation Ready'}
                              </span>
                              <span className="text-[9px] font-mono text-slate-400">
                                {formatWeeklyWage(p.wagePw)}
                              </span>
                            </div>
                          </div>
                          <span className="font-mono tabular-nums text-amber-300 font-semibold shrink-0">
                            {p.ability.toFixed(1)}★/{p.potential.toFixed(1)}★
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Secondary Versatility / Cover (Marked clearly as cover, NOT counted as separate bodies) */}
              {b.secondaryCoverPlayers.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800/70">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-sky-400/90">
                    <span>Versatility / Cover (Secondary)</span>
                    <span>+{b.secondaryCoverPlayers.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {b.secondaryCoverPlayers.map((p) => (
                      <button
                        key={`cov-${p.id}`}
                        type="button"
                        onClick={() => onSelectPlayer(p)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/10 border border-sky-500/25 px-2 py-1 text-[11px] text-sky-200 hover:border-sky-400 transition cursor-pointer"
                      >
                        <span className="font-medium">{p.name}</span>
                        <span className="text-[10px] font-mono text-sky-300/80">
                          ({p.position.split(',')[0].trim()})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Academy / Developing Prospects (Below First-Team CA floor — long-term pipeline) */}
              {b.academyProspectPlayers.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800/70">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-purple-300/90">
                    <span>Academy / Developing (Not Senior-Ready Yet)</span>
                    <span>{b.academyProspectPlayers.length}</span>
                  </div>
                  <div className="space-y-1">
                    {b.academyProspectPlayers.map((p) => {
                      const isDeveloping =
                        p.ability >=
                        Math.max(2.0, audit.tierBenchmarks.firstTeamRotationFloor - 1.0);
                      const isHighCeiling = p.potential >= 4.0;
                      return (
                        <button
                          key={`yth-${p.id}`}
                          type="button"
                          onClick={() => onSelectPlayer(p)}
                          className="w-full flex items-center justify-between gap-2 rounded-lg bg-purple-950/20 border border-purple-500/20 px-2.5 py-1.5 text-[11px] hover:border-purple-400/50 transition text-left cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-purple-100/90 font-medium break-words">
                              {p.name}{' '}
                              <span className="text-[10px] text-purple-300/70">
                                (Age {p.age})
                              </span>
                            </span>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1">
                              <span
                                className={`rounded px-1.5 py-0.2 text-[9px] font-semibold ${
                                  isDeveloping
                                    ? 'bg-sky-500/15 text-sky-300'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {isDeveloping ? 'Developing U21' : 'Raw Academy'}
                              </span>
                              {isHighCeiling && (
                                <span className="rounded bg-amber-500/15 px-1.5 py-0.2 text-[9px] font-semibold text-amber-300">
                                  High Ceiling
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-mono tabular-nums text-amber-300/85 shrink-0">
                            {p.ability.toFixed(1)}★/{p.potential.toFixed(1)}★
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. Out on Loan */}
              {b.onLoanPlayers.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800/70">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-indigo-300">
                    <span>Out on Loan</span>
                    <span>{b.onLoanPlayers.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {b.onLoanPlayers.map((p) => (
                      <button
                        key={`loan-${p.id}`}
                        type="button"
                        onClick={() => onSelectPlayer(p)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 px-2 py-1 text-[11px] text-indigo-200 hover:border-indigo-400 transition cursor-pointer"
                      >
                        <span>{p.name}</span>
                        <span className="font-mono text-[10px] text-amber-300">
                          {p.ability.toFixed(1)}★/{p.potential.toFixed(1)}★
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
