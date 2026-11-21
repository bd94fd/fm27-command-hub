/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { PlayerRecord } from '../types/fm27';
import { ActiveSuspensionRecord } from '../types/fmSave';
import {
  IN_POSSESSION_ROLES,
  OUT_OF_POSSESSION_ROLES,
} from '../utils/fm27RoleMatcher';
import {
  buildSuspensionLookup,
  evaluatePlayerForSlot,
  FORMATION_PRESETS,
  FormationPresetKey,
  getPlayerSuspension,
  solveBestXi,
  SolvedSlot,
} from '../utils/bestXiSolver';
import { PersistedCustomSlot } from '../services/fmStorage';

export interface PlaybookGuardrailAlert {
  id: string;
  severity: 'error' | 'warning';
  category: 'rest-defence' | 'wide-oop' | 'central-pivot' | 'availability';
  title: string;
  detail: string;
}

const HIGH_IP_FULLBACK_ROLES = new Set([
  'wing-back',
  'attacking wing-back',
  'inverted wing-back',
  'playmaking wing-back',
  'inside wing-back',
  'overlapping full-back',
]);

const HOLDING_PIVOT_IP_ROLES = new Set([
  'defensive midfielder',
  'half-back',
  'deep-lying playmaker',
  'holding midfielder',
  'anchor',
]);

const HOLDING_PIVOT_OOP_ROLES = new Set([
  'screening defensive midfielder',
  'dropping defensive midfielder',
  'screening central midfielder',
  'holding central midfielder',
]);

/**
 * Evaluates Bobby Dean Playbook v2.0 tactical guardrails on the active 11 slots.
 */
export function evaluatePlaybookGuardrails(
  slots: SolvedSlot[],
  shape: FormationPresetKey,
  activeSuspensions: ActiveSuspensionRecord[] = []
): PlaybookGuardrailAlert[] {
  const alerts: PlaybookGuardrailAlert[] = [];
  const players = slots
    .map((s) => s.player)
    .filter((p): p is PlayerRecord => Boolean(p));
  const suspensionLookup = buildSuspensionLookup(players, activeSuspensions);

  // 1. Rest-defence flank check (both full-backs high IP without holding cover)
  const fbSlots = slots.filter(
    (s) => s.positionGroup === 'Full-Back / Wing-Back'
  );
  const leftFb = fbSlots.find((s) => s.flank === 'L');
  const rightFb = fbSlots.find((s) => s.flank === 'R');
  const cbCount = slots.filter((s) => s.positionGroup === 'Centre-Back').length;
  const hasHoldingDm = slots.some(
    (s) =>
      (s.positionGroup === 'Defensive Midfielder' ||
        s.positionGroup === 'Central Midfielder') &&
      (HOLDING_PIVOT_IP_ROLES.has(s.ipRole.toLowerCase()) ||
        HOLDING_PIVOT_OOP_ROLES.has(s.oopRole.toLowerCase()))
  );

  const leftFbHigh =
    leftFb && HIGH_IP_FULLBACK_ROLES.has(leftFb.ipRole.toLowerCase());
  const rightFbHigh =
    rightFb && HIGH_IP_FULLBACK_ROLES.has(rightFb.ipRole.toLowerCase());

  if (leftFbHigh && rightFbHigh && cbCount < 3 && !hasHoldingDm) {
    alerts.push({
      id: 'rest-defence-flanks',
      severity: 'error',
      category: 'rest-defence',
      title: 'Rest-Defence Flank Exposure',
      detail: `Both ${leftFb.label} (${leftFb.ipRole}) and ${rightFb.label} (${rightFb.ipRole}) push high In Possession in a back-4 without a holding DM/Half-Back cover.`,
    });
  }

  // 2. Wide OOP overload warning (Wide Outlet Winger on same flank as attacking full-back)
  const wideSlots = slots.filter(
    (s) => s.positionGroup === 'Wide Midfielder / Winger'
  );
  for (const wide of wideSlots) {
    if (wide.oopRole.toLowerCase().includes('wide outlet winger')) {
      const sameFlankFb = fbSlots.find((fb) => fb.flank === wide.flank);
      const fbIsAttacking =
        sameFlankFb &&
        HIGH_IP_FULLBACK_ROLES.has(sameFlankFb.ipRole.toLowerCase());
      alerts.push({
        id: `wide-oop-${wide.slotId}`,
        severity: fbIsAttacking ? 'error' : 'warning',
        category: 'wide-oop',
        title: `Patch 27.1.0 Wide OOP Overload (${wide.label})`,
        detail: fbIsAttacking
          ? `${wide.label} is set to Wide Outlet Winger OOP on the same flank as attacking ${sameFlankFb?.label} (${sameFlankFb?.ipRole}). Switch ${wide.label} to Tracking Winger OOP to prevent 2v1 flank overloads.`
          : `${wide.label} is set to Wide Outlet Winger OOP. Playbook v2.0 recommends Tracking Winger OOP to protect full-backs against overlapping opponents.`,
      });
    }
  }

  // 3. Central pivot check
  if (!hasHoldingDm) {
    alerts.push({
      id: 'central-pivot-missing',
      severity: 'warning',
      category: 'central-pivot',
      title: `No Holding Central Pivot (${shape})`,
      detail:
        'Midfield lacks a Defensive Midfielder, Half-Back, Deep-Lying Playmaker, or Screening pivot. Zone 5 transitions are exposed.',
    });
  }

  // 4. Natural position / injury / ban / <85% condition warnings
  for (const slot of slots) {
    if (!slot.player) continue;
    const p = slot.player;
    const ban = getPlayerSuspension(p, suspensionLookup);
    if (ban) {
      alerts.push({
        id: `ban-${slot.slotId}`,
        severity: 'error',
        category: 'availability',
        title: `${slot.label}: ${p.name} is SUSPENDED`,
        detail: `Banned for ${ban.matchesRemaining}m (${ban.competitionName} · ${ban.reason}). Replace before matchday.`,
      });
    }
    if (p.status === 'Injured') {
      alerts.push({
        id: `inj-${slot.slotId}`,
        severity: 'error',
        category: 'availability',
        title: `${slot.label}: ${p.name} is INJURED`,
        detail: 'Player is flagged Injured in the current save.',
      });
    }
    if (typeof p.condition === 'number' && p.condition < 85) {
      alerts.push({
        id: `cond-${slot.slotId}`,
        severity: 'warning',
        category: 'availability',
        title: `${slot.label}: ${p.name} Low Condition (${p.condition}%)`,
        detail:
          'Playbook v2.0 Law 5 requires starters >= 85% Condition to avoid late-game stamina collapse.',
      });
    }
    if (!slot.isNaturalPosition) {
      alerts.push({
        id: `pos-${slot.slotId}`,
        severity: 'warning',
        category: 'availability',
        title: `${slot.label}: ${p.name} Out of Natural Position`,
        detail: `${p.name} (${p.position}) is playing out of natural familiarity in ${slot.label} (${slot.combinedFitPct}% fit).`,
      });
    }
  }

  return alerts;
}

export interface InteractivePitchBuilderProps {
  players: PlayerRecord[];
  activeSuspensions?: ActiveSuspensionRecord[];
  activeShape: FormationPresetKey;
  customSlots: PersistedCustomSlot[];
  applyToAnalystOnly: boolean;
  onChangeShape: (shape: FormationPresetKey) => void;
  onChangeCustomSlots: (slots: PersistedCustomSlot[]) => void;
  onChangeApplyToAnalystOnly: (val: boolean) => void;
  onSolvedLineupChange?: (slots: SolvedSlot[]) => void;
}

const PRESET_KEYS: FormationPresetKey[] = [
  '4-3-3 DM Wide',
  '4-2-3-1 DM AM Wide',
  '4-4-2',
  '3-4-2-1',
];

export const InteractivePitchBuilder: React.FC<InteractivePitchBuilderProps> = ({
  players,
  activeSuspensions = [],
  activeShape,
  customSlots,
  applyToAnalystOnly,
  onChangeShape,
  onChangeCustomSlots,
  onChangeApplyToAnalystOnly,
  onSolvedLineupChange,
}) => {
  const [matchdayMode, setMatchdayMode] = useState(true);
  const [viewBTeam, setViewBTeam] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string>('ST');

  const solved = useMemo(
    () =>
      solveBestXi(players, {
        shape: activeShape,
        customSlots,
        excludeInjured: true,
        excludeSuspended: true,
        activeSuspensions,
        minCondition: matchdayMode ? 80 : undefined,
      }),
    [players, activeShape, customSlots, activeSuspensions, matchdayMode]
  );

  // Merge manual player overrides from customSlots onto the solved XI
  const activeSlots: SolvedSlot[] = useMemo(() => {
    const base = viewBTeam ? solved.rotatedBTeam : solved.startingXI;
    if (viewBTeam) return base;

    const playerById = new Map(players.map((p) => [p.id, p]));
    const customMap = new Map(customSlots.map((c) => [c.slotId, c]));

    return base.map((slot) => {
      const custom = customMap.get(slot.slotId);
      if (!custom?.playerId) return slot;
      const overridePlayer = playerById.get(custom.playerId);
      if (!overridePlayer) return slot;
      const score = evaluatePlayerForSlot(
        overridePlayer,
        slot.positionGroup,
        slot.ipRole,
        slot.oopRole
      );
      return {
        ...slot,
        player: overridePlayer,
        ipFitPct: score.ipFitPct,
        oopFitPct: score.oopFitPct,
        combinedFitPct: score.combinedFitPct,
        isNaturalPosition: score.isNaturalPosition,
      };
    });
  }, [solved, viewBTeam, players, customSlots]);

  useEffect(() => {
    if (onSolvedLineupChange && !viewBTeam) {
      onSolvedLineupChange(activeSlots);
    }
  }, [activeSlots, viewBTeam, onSolvedLineupChange]);

  const guardrails = useMemo(
    () => evaluatePlaybookGuardrails(activeSlots, activeShape, activeSuspensions),
    [activeSlots, activeShape, activeSuspensions]
  );

  const selectedSlot =
    activeSlots.find((s) => s.slotId === selectedSlotId) || activeSlots[0];

  const handleUpdateSlot = (
    slotId: string,
    patch: Partial<PersistedCustomSlot>
  ) => {
    const templates = FORMATION_PRESETS[activeShape];
    const tpl = templates.find((t) => t.slotId === slotId);
    if (!tpl) return;

    const existing = customSlots.find((c) => c.slotId === slotId);
    const updated: PersistedCustomSlot = {
      slotId,
      ipRole: patch.ipRole ?? existing?.ipRole ?? tpl.defaultIpRole,
      oopRole: patch.oopRole ?? existing?.oopRole ?? tpl.defaultOopRole,
      playerId:
        patch.playerId !== undefined ? patch.playerId : existing?.playerId,
    };

    const next = [
      ...customSlots.filter((c) => c.slotId !== slotId),
      updated,
    ];
    onChangeCustomSlots(next);
  };

  const handleAutoPick = () => {
    // Keep custom IP/OOP roles, clear manual playerId locks so solver picks best XI
    const cleared = customSlots.map((c) => ({
      slotId: c.slotId,
      ipRole: c.ipRole,
      oopRole: c.oopRole,
      playerId: null,
    }));
    onChangeCustomSlots(cleared);
    setViewBTeam(false);
  };

  const ipOptionsForSelected = useMemo(() => {
    if (!selectedSlot) return IN_POSSESSION_ROLES;
    const exact = IN_POSSESSION_ROLES.filter(
      (r) =>
        r.positionGroup.toLowerCase() ===
        selectedSlot.positionGroup.toLowerCase()
    );
    return exact.length > 0 ? exact : IN_POSSESSION_ROLES;
  }, [selectedSlot]);

  const oopOptionsForSelected = useMemo(() => {
    if (!selectedSlot) return OUT_OF_POSSESSION_ROLES;
    const exact = OUT_OF_POSSESSION_ROLES.filter(
      (r) =>
        r.positionGroup.toLowerCase() ===
        selectedSlot.positionGroup.toLowerCase()
    );
    return exact.length > 0 ? exact : OUT_OF_POSSESSION_ROLES;
  }, [selectedSlot]);

  if (players.length === 0) {
    return null;
  }

  return (
    <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-500" />
            Interactive Dual-Phase Pitch Builder ({activeShape})
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            68 authentic FM27 IP/OOP roles · Familiarity-gated Best XI &amp;
            Rotated B-Team solver · Live Playbook v2.0 guardrails.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Shape Selector */}
          <select
            aria-label="Formation preset shape"
            value={activeShape}
            onChange={(e) => {
              const nextShape = e.target.value as FormationPresetKey;
              onChangeShape(nextShape);
              onChangeCustomSlots([]);
              setSelectedSlotId(FORMATION_PRESETS[nextShape][10]?.slotId || 'GK');
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
          >
            {PRESET_KEYS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleAutoPick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Auto-Pick Best XI
          </button>

          <button
            type="button"
            onClick={() => setMatchdayMode((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              matchdayMode
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}
          >
            Matchday Mode {matchdayMode ? '(≥80% Cond)' : '(Off)'}
          </button>

          <button
            type="button"
            onClick={() => setViewBTeam((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              viewBTeam
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            {viewBTeam ? 'Viewing Rotated B-Team' : 'Show Rotated B-Team'}
          </button>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 ml-1 cursor-pointer">
            <input
              type="checkbox"
              checked={applyToAnalystOnly}
              onChange={(e) => onChangeApplyToAnalystOnly(e.target.checked)}
              className="rounded border-slate-400 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Apply to Analyst Only</span>
          </label>
        </div>
      </div>

      {/* Main Grid: Pitch Canvas + Selected Slot Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Visual Pitch */}
        <div className="lg:col-span-7 relative rounded-xl overflow-hidden border border-emerald-700/40 bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-950 min-h-[430px] select-none">
          {/* Pitch Markings */}
          <div className="absolute inset-3 border border-emerald-400/25 rounded-lg pointer-events-none">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-emerald-400/25" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-emerald-400/25" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-12 border-b border-x border-emerald-400/25" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-36 h-12 border-t border-x border-emerald-400/25" />
          </div>

          {/* 11 Interactive Slot Nodes */}
          {activeSlots.map((slot) => {
            const isSelected = selectedSlot?.slotId === slot.slotId;
            const hasWarning =
              slot.warnings.length > 0 || !slot.isNaturalPosition;
            return (
              <button
                key={slot.slotId}
                type="button"
                onClick={() => setSelectedSlotId(slot.slotId)}
                style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 px-2 py-1.5 rounded-lg text-center transition max-w-[116px] border ${
                  isSelected
                    ? 'bg-emerald-500 text-slate-950 border-white shadow-lg scale-105 z-20'
                    : hasWarning
                    ? 'bg-amber-950/90 text-amber-100 border-amber-400/70 hover:bg-amber-900 z-10'
                    : 'bg-slate-950/85 text-slate-100 border-emerald-400/40 hover:border-emerald-300 z-10'
                }`}
              >
                <div className="text-[10px] font-mono font-bold leading-tight">
                  {slot.label}{' '}
                  {slot.player ? `· ${slot.combinedFitPct}%` : '· --'}
                </div>
                <div className="text-[11px] font-semibold truncate max-w-[100px]">
                  {slot.player ? slot.player.name.split(' ').slice(-1)[0] : 'Empty'}
                </div>
                <div className="text-[9px] opacity-80 truncate max-w-[100px]">
                  {slot.ipRole}
                </div>
              </button>
            );
          })}
        </div>

        {/* Slot Role & Player Editor */}
        <div className="lg:col-span-5 space-y-4">
          {selectedSlot && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    SLOT: {selectedSlot.label} ({selectedSlot.positionGroup})
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {selectedSlot.player
                      ? `#${selectedSlot.player.number} ${selectedSlot.player.name}`
                      : 'Unassigned Slot'}
                  </h3>
                </div>
                {selectedSlot.player && (
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    Fit {selectedSlot.combinedFitPct}% (IP {selectedSlot.ipFitPct}% / OOP{' '}
                    {selectedSlot.oopFitPct}%)
                  </span>
                )}
              </div>

              {/* Player Override Selector */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Assigned Player
                </label>
                <select
                  disabled={viewBTeam}
                  value={selectedSlot.player?.id || ''}
                  onChange={(e) =>
                    handleUpdateSlot(selectedSlot.slotId, {
                      playerId: e.target.value || null,
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                >
                  <option value="">Auto-pick best fit</option>
                  {players.map((p) => {
                    const sc = evaluatePlayerForSlot(
                      p,
                      selectedSlot.positionGroup,
                      selectedSlot.ipRole,
                      selectedSlot.oopRole
                    );
                    const tag =
                      p.status === 'Injured'
                        ? ' [INJ]'
                        : p.activeSuspensions && p.activeSuspensions.length > 0
                        ? ' [BAN]'
                        : '';
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.position}) · {sc.combinedFitPct}% · C
                        {p.condition ?? '?'}%{tag}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Separate IP Role Dropdown */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  In-Possession (IP) Role — FM27 Pure Role
                </label>
                <select
                  value={selectedSlot.ipRole}
                  onChange={(e) =>
                    handleUpdateSlot(selectedSlot.slotId, {
                      ipRole: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                >
                  {ipOptionsForSelected.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Separate OOP Role Dropdown */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-sky-700 dark:text-sky-400">
                  Out-of-Possession (OOP) Role — FM27 Pure Role
                </label>
                <select
                  value={selectedSlot.oopRole}
                  onChange={(e) =>
                    handleUpdateSlot(selectedSlot.slotId, {
                      oopRole: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                >
                  {oopOptionsForSelected.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Live Playbook v2.0 Guardrails Panel */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                <Shield className="w-4 h-4 text-emerald-500" />
                Playbook v2.0 Live Guardrails
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Avg Fit: {solved.averageFitPct}%
              </span>
            </div>

            {guardrails.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  All Playbook v2.0 rest-defence, wide OOP, central pivot, and
                  fitness checks passed.
                </span>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {guardrails.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-2.5 rounded-lg border text-xs ${
                      alert.severity === 'error'
                        ? 'bg-rose-500/10 border-rose-500/40 text-rose-800 dark:text-rose-200'
                        : 'bg-amber-500/10 border-amber-500/40 text-amber-900 dark:text-amber-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{alert.title}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] opacity-90">
                      {alert.detail}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
