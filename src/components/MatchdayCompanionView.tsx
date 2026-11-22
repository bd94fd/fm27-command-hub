/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  Flag,
  Shield,
  Smartphone,
  Square,
  Sun,
  Timer,
  Zap,
} from 'lucide-react';
import { PlayerRecord } from '../types/fm27';
import { FormationPresetKey, SolvedSlot } from '../utils/bestXiSolver';
import {
  analyzeRestDefenseMatrix,
  classifySlotRestDefenseCategory,
} from '../utils/restDefenseEngine';

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
}

export interface MatchdayCompanionViewProps {
  clubName: string;
  nextFixture: string;
  activeShape: FormationPresetKey;
  slots: SolvedSlot[];
  allPlayers: PlayerRecord[];
}

export const MatchdayCompanionView: React.FC<MatchdayCompanionViewProps> = ({
  clubName,
  nextFixture,
  activeShape,
  slots,
  allPlayers,
}) => {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [wakeLockEnabled, setWakeLockEnabled] = useState<boolean>(false);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [wakeLockSupported] = useState<boolean>(() => {
    return (
      typeof navigator !== 'undefined' &&
      'wakeLock' in navigator &&
      typeof (navigator as Navigator & { wakeLock?: { request?: unknown } })
        .wakeLock?.request === 'function'
    );
  });
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  const acquireWakeLock = useCallback(async () => {
    if (!wakeLockSupported) return false;
    try {
      const nav = navigator as Navigator & {
        wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      };
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        setWakeLockActive(true);
        return true;
      }
      const sentinel = await nav.wakeLock.request('screen');
      wakeLockRef.current = sentinel;
      setWakeLockActive(true);
      sentinel.addEventListener?.('release', () => {
        setWakeLockActive(false);
      });
      return true;
    } catch {
      setWakeLockActive(false);
      return false;
    }
  }, [wakeLockSupported]);

  const releaseWakeLock = useCallback(async () => {
    const current = wakeLockRef.current;
    wakeLockRef.current = null;
    setWakeLockActive(false);
    if (current) {
      try {
        await current.release();
      } catch {
        // ignore release error
      }
    }
  }, []);

  const handleToggleWakeLock = async () => {
    if (wakeLockEnabled) {
      setWakeLockEnabled(false);
      await releaseWakeLock();
      return;
    }
    setWakeLockEnabled(true);
    await acquireWakeLock();
  };

  useEffect(() => {
    if (!wakeLockEnabled) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && wakeLockEnabled) {
        void acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [wakeLockEnabled, acquireWakeLock]);

  useEffect(() => {
    return () => {
      void releaseWakeLock();
    };
  }, [releaseWakeLock]);

  const toggleCheck = (id: string) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const restMatrix = useMemo(
    () => analyzeRestDefenseMatrix(slots, activeShape),
    [slots, activeShape]
  );

  const starters = useMemo(
    () =>
      slots
        .map((s) => s.player)
        .filter((p): p is PlayerRecord => Boolean(p)),
    [slots]
  );

  const setPieceAssignments = useMemo(() => {
    const outfield = starters.filter(
      (p) => !(p.position || '').toUpperCase().includes('GK')
    );
    const byAerial = [...outfield].sort(
      (a, b) =>
        (b.attributes.jumpingReach || 10) * 1.4 +
        (b.attributes.heading ?? 10) -
        ((a.attributes.jumpingReach || 10) * 1.4 + (a.attributes.heading ?? 10))
    );
    const bySpeed = [...outfield].sort(
      (a, b) =>
        (b.attributes.pace || 10) +
        (b.attributes.acceleration || 10) -
        ((a.attributes.pace || 10) + (a.attributes.acceleration || 10))
    );
    const byCorners = [...outfield].sort(
      (a, b) =>
        (b.attributes.corners ?? b.attributes.passing ?? 10) -
        (a.attributes.corners ?? a.attributes.passing ?? 10)
    );
    const byPenalties = [...outfield].sort(
      (a, b) =>
        (b.attributes.penalties ?? b.attributes.finishing ?? 10) -
        (a.attributes.penalties ?? a.attributes.finishing ?? 10)
    );

    return {
      nearPostTarget: byAerial[0] || null,
      farPostRunner: byAerial[1] || null,
      edgeRecoveryGuard: bySpeed[0] || null,
      cornerTaker: byCorners[0] || null,
      penaltyTaker: byPenalties[0] || null,
    };
  }, [starters]);

  const lowestStaminaOutfield = useMemo(() => {
    return slots
      .filter(
        (s) =>
          s.player &&
          s.positionGroup !== 'Goalkeeper' &&
          s.positionGroup !== 'Centre-Back'
      )
      .sort(
        (a, b) =>
          (a.player!.attributes.stamina || 10) * 4 +
          (a.player!.condition ?? 85) -
          ((b.player!.attributes.stamina || 10) * 4 +
            (b.player!.condition ?? 85))
      )
      .slice(0, 3);
  }, [slots]);

  const checklistSteps = useMemo(() => {
    const sub62Names =
      lowestStaminaOutfield
        .slice(0, 2)
        .map((s) => `${s.player?.name} (${s.label}, Sta ${s.player?.attributes.stamina})`)
        .join(' & ') || '2 lowest-stamina wide/CM runners';
    const sub75Name =
      lowestStaminaOutfield[2]
        ? `${lowestStaminaOutfield[2].player?.name} (${lowestStaminaOutfield[2].label})`
        : '1–2 fresh closers';

    return [
      {
        id: 'kickoff',
        minute: "00' Kickoff",
        title: '85%+ Condition Floor & Tracking Wingers OOP Locked',
        detail: `Verify ${restMatrix.structureLabel} (${restMatrix.stabilityScore}/100 Stability) and Short/Mixed GK distribution.`,
      },
      {
        id: 'ht',
        minute: "45' Half-Time",
        title: 'Free Stoppage Assessment (0/3 Second-Half Windows Used)',
        detail:
          'Only sub at HT if a starter drops below 72% condition or carries a yellow card on an exposed flank.',
      },
      {
        id: 'w62',
        minute: "62' Window 1",
        title: `Primary Energy Double-Sub: ${sub62Names}`,
        detail:
          'Replace lowest-stamina wide/box-to-box starters before Patch 27.1.0 sprint-decay threshold.',
      },
      {
        id: 'w75',
        minute: "75' Window 2",
        title: `Tactical Closer Window: ${sub75Name} (Dual-CB Lock Active)`,
        detail:
          'Playbook Law 2: NEVER substitute both starting Centre-Backs together when protecting a lead or draw.',
      },
      {
        id: 'w82',
        minute: "82' Game State",
        title: 'Late Lead Protection / Chasing Protocol',
        detail:
          'Leading: Balanced Mentality + Time Wasting Sometimes. Chasing: Keep 3 midfielders on pitch + Play With More Urgency + Swap Wings.',
      },
    ];
  }, [lowestStaminaOutfield, restMatrix]);

  const benchCount = Math.max(0, allPlayers.length - starters.length);

  return (
    <div className="rounded-2xl border-2 border-emerald-500/40 bg-slate-950 p-4 sm:p-5 space-y-5 text-slate-100 shadow-xl">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                Matchday Touchline Companion
              </h2>
              <span className="rounded-md bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-300">
                {activeShape}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {clubName && clubName !== '--' ? clubName : 'Managed Club'} · Next:{' '}
              <strong className="text-slate-200">{nextFixture || '--'}</strong> ·{' '}
              {restMatrix.structureLabel} ({benchCount} bench options)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleToggleWakeLock()}
            disabled={!wakeLockSupported}
            aria-pressed={wakeLockEnabled}
            title={
              wakeLockSupported
                ? 'Prevent phone or tablet screen from sleeping during live match'
                : 'Screen Wake Lock is not supported by this browser'
            }
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer disabled:opacity-45 ${
              wakeLockEnabled && wakeLockActive
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400/40'
                : wakeLockEnabled
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-300" />
            <span>
              {wakeLockEnabled
                ? wakeLockActive
                  ? 'Screen Awake: ON'
                  : 'Screen Awake: Standby'
                : 'Keep Screen Awake'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCheckedItems({})}
            className="rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition cursor-pointer"
          >
            Reset Match Checklist
          </button>
        </div>
      </div>

      {/* Section 1: Active Starting XI High-Contrast Dual-Phase Strip */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
            <Shield className="w-4 h-4" />
            Active Starting XI — Dual-Phase IP / OOP &amp; Rest-Defense Assignments
          </span>
          <span className="font-mono text-slate-400">
            Transition Stability: {restMatrix.stabilityScore}/100
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {slots.map((slot) => {
            const p = slot.player;
            const restCat = classifySlotRestDefenseCategory(slot);
            const cond = p?.condition ?? 95;
            const condCls =
              cond >= 88
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : cond >= 80
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40';

            return (
              <div
                key={slot.slotId}
                className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                      {slot.label}
                    </span>
                    <span className="text-sm font-bold text-white truncate">
                      {p ? p.name : 'Unassigned'}
                    </span>
                  </div>
                  {p && (
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold shrink-0 ${condCls}`}
                    >
                      C{cond}% · Sta {p.attributes.stamina}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  <span className="rounded bg-emerald-500/15 border border-emerald-500/35 px-1.5 py-0.5 text-emerald-300 font-semibold">
                    IP: {slot.ipRole}
                  </span>
                  <span className="rounded bg-sky-500/15 border border-sky-500/35 px-1.5 py-0.5 text-sky-300 font-semibold">
                    OOP: {slot.oopRole}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5">
                  <span>{restCat.categoryLabel}</span>
                  <span>Fit {slot.combinedFitPct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Set-Piece Routine Card + Interactive 62'/75' Touchline Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Set-Piece Aerial & Taker Quick Card */}
        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-300">
            <Flag className="w-4 h-4" />
            Set-Piece Aerial &amp; Taker Assignments
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-slate-950/80 border border-slate-800 px-3 py-2">
              <span className="text-slate-400">Near-Post Aerial Flick:</span>
              <strong className="font-mono text-emerald-300">
                {setPieceAssignments.nearPostTarget
                  ? `${setPieceAssignments.nearPostTarget.name} (JR ${setPieceAssignments.nearPostTarget.attributes.jumpingReach})`
                  : '--'}
              </strong>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-950/80 border border-slate-800 px-3 py-2">
              <span className="text-slate-400">Far-Post Attacking Runner:</span>
              <strong className="font-mono text-sky-300">
                {setPieceAssignments.farPostRunner
                  ? `${setPieceAssignments.farPostRunner.name} (JR ${setPieceAssignments.farPostRunner.attributes.jumpingReach})`
                  : '--'}
              </strong>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-950/80 border border-slate-800 px-3 py-2">
              <span className="text-slate-400">Edge Counter-Recovery Guard:</span>
              <strong className="font-mono text-amber-300">
                {setPieceAssignments.edgeRecoveryGuard
                  ? `${setPieceAssignments.edgeRecoveryGuard.name} (Pac ${setPieceAssignments.edgeRecoveryGuard.attributes.pace})`
                  : '--'}
              </strong>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-950/80 border border-slate-800 px-3 py-2">
              <span className="text-slate-400">Corner / Penalty Takers:</span>
              <strong className="font-mono text-slate-200">
                {setPieceAssignments.cornerTaker?.name || '--'} /{' '}
                {setPieceAssignments.penaltyTaker?.name || '--'}
              </strong>
            </div>
          </div>
        </div>

        {/* Interactive 62'/75' Matchday Touchline Checklist */}
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300">
              <Timer className="w-4 h-4" />
              Live Touchline &amp; 62&apos;/75&apos; Substitution Checklist
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Tap to check off in-game
            </span>
          </div>

          <div className="space-y-2">
            {checklistSteps.map((step) => {
              const done = Boolean(checkedItems[step.id]);
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => toggleCheck(step.id)}
                  className={`w-full text-left rounded-xl border p-3 transition flex items-start gap-2.5 cursor-pointer ${
                    done
                      ? 'border-emerald-500/40 bg-emerald-950/25 text-slate-300'
                      : 'border-slate-800 bg-slate-950/80 hover:border-slate-700 text-slate-100'
                  }`}
                >
                  {done ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                        {step.minute}
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          done ? 'line-through text-slate-400' : 'text-white'
                        }`}
                      >
                        {step.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      {step.detail}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
