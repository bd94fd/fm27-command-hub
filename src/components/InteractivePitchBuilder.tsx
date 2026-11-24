/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { PlayerRecord } from '../types/fm27';
import { ActiveSuspensionRecord, DeepTacticRecord } from '../types/fmSave';
import {
  IN_POSSESSION_ROLES,
  OUT_OF_POSSESSION_ROLES,
} from '../utils/fm27RoleMatcher';
import {
  buildLineupFromSavedTactic,
  buildSuspensionLookup,
  computeDurabilityProfile,
  evaluatePlayerForSlot,
  FORMATION_PRESETS,
  FormationPresetKey,
  isSuspensionActiveForCompetition,
  getPlayerSuspension,
  solveBestXi,
  SolvedSlot,
} from '../utils/bestXiSolver';
import { PersistedCustomSlot } from '../services/fmStorage';
import {
  analyzeRestDefenseMatrix,
  getRestDefenseRoleExplanation,
  PitchPhaseMode,
} from '../utils/restDefenseEngine';
import {
  buildBenchRailPlayers,
  formatMobileSurname,
  resolveMobilePitchCoordinates,
} from '../utils/mobilePitchLayout';
import { PitchInspectStrip } from './PitchInspectStrip';
import { PitchBenchRail } from './PitchBenchRail';

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
  activeSuspensions: ActiveSuspensionRecord[] = [],
  nextCompetitionName?: string | null
): PlaybookGuardrailAlert[] {
  const alerts: PlaybookGuardrailAlert[] = [];
  const players = slots
    .map((s) => s.player)
    .filter((p): p is PlayerRecord => Boolean(p));
  const suspensionLookup = buildSuspensionLookup(
    players,
    activeSuspensions,
    nextCompetitionName
  );

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
    const durability = computeDurabilityProfile(p);
    if (durability.sharpness !== null && durability.sharpness < 65) {
      alerts.push({
        id: `sharp-${slot.slotId}`,
        severity: 'warning',
        category: 'availability',
        title: `${slot.label}: ${p.name} Low Sharpness (${durability.sharpness}%)`,
        detail:
          'Match sharpness is below 65% — consider rotating in for 30m or playing a friendly/reserve match to build match rhythm.',
      });
    }
    if (durability.isInjuryProne && durability.stamina <= 11) {
      alerts.push({
        id: `dur-${slot.slotId}`,
        severity: 'warning',
        category: 'availability',
        title: `${slot.label}: ${p.name} Injury-Prone / Low Stamina (Sta ${durability.stamina})`,
        detail:
          'Plan a 62m substitution window and avoid back-to-back 90m starts in double gameweeks.',
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
  nextCompetitionName?: string | null;
  savedTactics?: DeepTacticRecord[];
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

const EMPTY_SUSPENSIONS: ActiveSuspensionRecord[] = [];
const EMPTY_SAVED_TACTICS: DeepTacticRecord[] = [];

function formatCompactPitchRole(role: string): string {
  if (!role) return '';
  return role
    .replace(/\bNo-Nonsense Goalkeeper\b/gi, 'No-Nonsense GK')
    .replace(/\bBall-Playing Goalkeeper\b/gi, 'Ball-Playing GK')
    .replace(/\bLine-Holding Keeper\b/gi, 'Line-Holding GK')
    .replace(/\bSweeper Keeper\b/gi, 'Sweeper GK')
    .replace(/\bBall-Playing Centre-Back\b/gi, 'Ball-Playing CB')
    .replace(/\bWide Centre-Back\b/gi, 'Wide CB')
    .replace(/\bStopping Centre-Back\b/gi, 'Stopping CB')
    .replace(/\bCovering Centre-Back\b/gi, 'Covering CB')
    .replace(/\bDefensive Midfielder\b/gi, 'Def. Midfielder')
    .replace(/\bBox-to-Box Midfielder\b/gi, 'Box-to-Box CM')
    .replace(/\bChannel Midfielder\b/gi, 'Channel CM')
    .replace(/\bDeep-Lying Playmaker\b/gi, 'Deep Playmaker')
    .replace(/\bAdvanced Playmaker\b/gi, 'Adv. Playmaker')
    .replace(/\bPressing Central Midfielder\b/gi, 'Pressing CM')
    .replace(/\bScreening Central Midfielder\b/gi, 'Screening CM')
    .replace(/\bScreening Defensive Midfielder\b/gi, 'Screening DM')
    .replace(/\bDropping Defensive Midfielder\b/gi, 'Dropping DM')
    .replace(/\bChannel Forward\b/gi, 'Channel Fwd')
    .replace(/\bCentral Outlet Centre Forward\b/gi, 'Central Outlet CF')
    .replace(/\bDeep-Lying Forward\b/gi, 'Deep-Lying Fwd')
    .replace(/\bTracking Centre Forward\b/gi, 'Tracking CF')
    .replace(/\bTracking Attacking Midfielder\b/gi, 'Tracking AM')
    .replace(/\bTracking Wide Midfielder\b/gi, 'Tracking WM')
    .replace(/\bInverted Full-Back\b/gi, 'Inverted FB')
    .replace(/\bInverted Wing-Back\b/gi, 'Inverted WB')
    .replace(/\bHolding Full-Back\b/gi, 'Holding FB')
    .replace(/\bHolding Wing-Back\b/gi, 'Holding WB');
}

export const InteractivePitchBuilder: React.FC<InteractivePitchBuilderProps> = ({
  players,
  activeSuspensions = EMPTY_SUSPENSIONS,
  nextCompetitionName = null,
  savedTactics = EMPTY_SAVED_TACTICS,
  activeShape,
  customSlots,
  applyToAnalystOnly,
  onChangeShape,
  onChangeCustomSlots,
  onChangeApplyToAnalystOnly,
  onSolvedLineupChange,
}) => {
  const [sharpnessFilter, setSharpnessFilter] = useState(false);
  const hasSavedTactic =
    savedTactics.length > 0 && (savedTactics[0].slots?.length || 0) >= 5;
  const [lineupMode, setLineupMode] = useState<'save' | 'best' | 'bteam'>(
    () => (hasSavedTactic ? 'save' : 'best')
  );
  const prevHasSavedTacticRef = React.useRef<boolean>(hasSavedTactic);
  useEffect(() => {
    if (hasSavedTactic && !prevHasSavedTacticRef.current) {
      setLineupMode('save');
    }
    prevHasSavedTacticRef.current = hasSavedTactic;
  }, [hasSavedTactic]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>('ST');
  const [pitchPhaseMode, setPitchPhaseMode] =
    useState<PitchPhaseMode>('rest-defense');
  const [showRestDefenseGuide, setShowRestDefenseGuide] = useState(true);
  const [selectedLaneName, setSelectedLaneName] = useState<string | null>(null);

  const savedTacticLineup = useMemo(
    () =>
      buildLineupFromSavedTactic(savedTactics[0], players, activeShape, {
        customSlots,
        activeSuspensions,
        nextCompetitionName,
      }),
    [savedTactics, players, activeShape, customSlots, activeSuspensions, nextCompetitionName]
  );

  const effectiveLineupMode: 'save' | 'best' | 'bteam' =
    lineupMode === 'save' && !savedTacticLineup ? 'best' : lineupMode;

  const solved = useMemo(
    () =>
      solveBestXi(players, {
        shape: activeShape,
        customSlots,
        excludeInjured: true,
        excludeSuspended: true,
        activeSuspensions,
        nextCompetitionName,
        minSharpness: sharpnessFilter ? 70 : undefined,
      }),
    [players, activeShape, customSlots, activeSuspensions, nextCompetitionName, sharpnessFilter]
  );

  // Merge manual player overrides from customSlots onto the active XI
  const activeSlots: SolvedSlot[] = useMemo(() => {
    const base =
      effectiveLineupMode === 'bteam'
        ? solved.rotatedBTeam
        : effectiveLineupMode === 'save' && savedTacticLineup
          ? savedTacticLineup.slots
          : solved.startingXI;
    if (effectiveLineupMode === 'bteam') return base;

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
        slot.oopRole,
        slot.flank
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
  }, [solved, effectiveLineupMode, savedTacticLineup, players, customSlots]);

  const onSolvedLineupChangeRef = useRef(onSolvedLineupChange);
  onSolvedLineupChangeRef.current = onSolvedLineupChange;
  const lastEmittedLineupSigRef = useRef<string>('');

  useEffect(() => {
    const callback = onSolvedLineupChangeRef.current;
    if (!callback || effectiveLineupMode === 'bteam') return;
    const sig = activeSlots
      .map(
        (s) =>
          `${s.slotId}:${s.player?.id ?? ''}:${s.ipRole}:${s.oopRole}:${s.combinedFitPct}`
      )
      .join('|');
    if (sig === lastEmittedLineupSigRef.current) return;
    lastEmittedLineupSigRef.current = sig;
    callback(activeSlots);
  }, [activeSlots, effectiveLineupMode]);

  const guardrails = useMemo(
    () =>
      evaluatePlaybookGuardrails(
        activeSlots,
        activeShape,
        activeSuspensions,
        nextCompetitionName
      ),
    [activeSlots, activeShape, activeSuspensions, nextCompetitionName]
  );

  const restDefenseMatrix = useMemo(
    () => analyzeRestDefenseMatrix(activeSlots, activeShape),
    [activeSlots, activeShape]
  );

  const restNodeMap = useMemo(
    () => new Map(restDefenseMatrix.nodes.map((n) => [n.slotId, n])),
    [restDefenseMatrix]
  );

  const slotEditorRef = useRef<HTMLDivElement | null>(null);
  const [isCompactPitch, setIsCompactPitch] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setIsCompactPitch(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const mobilePitchCoords = useMemo(() => {
    const rawCoords = activeSlots.map((slot) => {
      const restNode = restNodeMap.get(slot.slotId);
      const x =
        pitchPhaseMode === 'ip'
          ? restNode?.ipX ?? slot.x
          : pitchPhaseMode === 'oop'
            ? restNode?.oopX ?? slot.x
            : restNode?.restX ?? slot.x;
      const y =
        pitchPhaseMode === 'ip'
          ? restNode?.ipY ?? slot.y
          : pitchPhaseMode === 'oop'
            ? restNode?.oopY ?? slot.y
            : restNode?.restY ?? slot.y;
      return { slotId: slot.slotId, x, y };
    });
    return resolveMobilePitchCoordinates(rawCoords);
  }, [activeSlots, restNodeMap, pitchPhaseMode]);

  const benchEntries = useMemo(
    () =>
      buildBenchRailPlayers(
        players,
        activeSlots,
        activeSuspensions,
        nextCompetitionName,
        9
      ),
    [players, activeSlots, activeSuspensions, nextCompetitionName]
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
    setLineupMode('best');
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

  const activeAvgFit = useMemo(() => {
    const filled = activeSlots.filter((s) => s.player !== null);
    if (filled.length === 0) return 0;
    return Math.round(
      filled.reduce((sum, s) => sum + s.combinedFitPct, 0) / filled.length
    );
  }, [activeSlots]);

  if (players.length === 0) {
    return null;
  }

  return (
    <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-500 shrink-0" />
            <span>Dual-Phase Pitch Builder ({activeShape})</span>
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            {effectiveLineupMode === 'save'
              ? `Showing your live .fm save lineup (${savedTactics[0]?.name || 'Active Tactic'}) — tap any player to inspect or adjust IP/OOP roles.`
              : effectiveLineupMode === 'bteam'
                ? 'Showing rotated B-Team XI for cup fixtures and double-gameweek rotation.'
                : 'Showing familiarity-gated Suggested Best XI based on role fit & star ability.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 3-Way Lineup Mode Switcher */}
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-950 border border-slate-800">
            {savedTacticLineup && (
              <button
                type="button"
                onClick={() => setLineupMode('save')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                  effectiveLineupMode === 'save'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Last Match XI
              </button>
            )}
            <button
              type="button"
              onClick={handleAutoPick}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                effectiveLineupMode === 'best'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <RefreshCw className="w-3 h-3" />
              Best XI
            </button>
            <button
              type="button"
              onClick={() => setLineupMode('bteam')}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                effectiveLineupMode === 'bteam'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3 h-3" />
              B-Team
            </button>
          </div>

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
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
          >
            {PRESET_KEYS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>

          {effectiveLineupMode !== 'save' && (
            <button
              type="button"
              onClick={() => setSharpnessFilter((v) => !v)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                sharpnessFilter
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              Sharp Only {sharpnessFilter ? '(≥70%)' : '(Off)'}
            </button>
          )}

          <label
            title="Test role or player changes with the AI Analyst without changing your saved club roles"
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 ml-1 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={applyToAnalystOnly}
              onChange={(e) => onChangeApplyToAnalystOnly(e.target.checked)}
              className="rounded border-slate-400 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Analyst Sandbox Only</span>
          </label>
        </div>
      </div>

      {/* Phase 1 (v3.0): Dual-Phase & Rest-Defence Matrix Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono font-bold text-emerald-400">
            {restDefenseMatrix.structureLabel.replace('Rest-Defense', 'Rest Defence')}
          </span>
          <span
            className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-bold border ${
              restDefenseMatrix.stabilityScore >= 75
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                : restDefenseMatrix.stabilityScore >= 58
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/35'
            }`}
          >
            Transition Stability: {restDefenseMatrix.stabilityScore}/100
          </span>
          <span className="text-[11px] text-slate-400">
            Base: {restDefenseMatrix.baseDefenderCount} CB +{' '}
            {restDefenseMatrix.pivotScreenCount} Pivot · Shuttles:{' '}
            {restDefenseMatrix.shuttleCount} · Outlets:{' '}
            {restDefenseMatrix.outletCount}
          </span>
          <button
            type="button"
            onClick={() => setShowRestDefenseGuide((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 transition cursor-pointer"
          >
            <HelpCircle className="w-3 h-3 shrink-0" />
            <span>{showRestDefenseGuide ? 'Hide Guide' : 'What is Rest Defence?'}</span>
          </button>
        </div>

        <div className="grid grid-cols-3 sm:flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800 w-full sm:w-auto">
          {(
            [
              { id: 'ip', label: 'IP Attack Shape', shortLabel: 'IP Attack' },
              { id: 'oop', label: 'OOP Def Block', shortLabel: 'OOP Block' },
              { id: 'rest-defense', label: 'Rest Defence', shortLabel: 'Rest Def' },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setPitchPhaseMode(mode.id)}
              className={`min-h-[44px] sm:min-h-[28px] px-2 sm:px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer text-center whitespace-nowrap ${
                pitchPhaseMode === mode.id
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="sm:hidden">{mode.shortLabel}</span>
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Pack 5: Live Decoded FM27 Save Dual-Phase IP -> OOP Slot Shape */}
      {savedTactics.length > 0 && savedTactics[0].slots && savedTactics[0].slots.length > 0 && (
        <div className="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-sky-500/30 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-sky-400">
                Live .fm Save Tactic: {savedTactics[0].name}
              </span>
              <span className="rounded bg-emerald-500/15 border border-emerald-500/35 px-2 py-0.5 text-[11px] font-mono text-emerald-300">
                IP: {savedTactics[0].inPossessionFormation || activeShape}
              </span>
              <span className="rounded bg-sky-500/15 border border-sky-500/35 px-2 py-0.5 text-[11px] font-mono text-sky-300">
                OOP: {savedTactics[0].outOfPossessionFormation || savedTactics[0].inPossessionFormation || activeShape}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {savedTactics[0].mentality} Mentality
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {savedTactics[0].slots.map((sl) => {
              const ipPos = sl.position || `S${sl.slotIndex + 1}`;
              const oopPos = sl.outOfPossessionPosition || ipPos;
              const shifted = oopPos !== ipPos;
              return (
                <span
                  key={sl.slotIndex}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-mono ${
                    shifted
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-200'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                  title={
                    sl.inPossessionRole || sl.outOfPossessionRole
                      ? `${sl.inPossessionRole || 'IP'} / ${sl.outOfPossessionRole || 'OOP'}`
                      : undefined
                  }
                >
                  {sl.playerName && (
                    <span className="font-sans font-semibold text-white">
                      {sl.playerName.split(' ').slice(-1)[0]}:
                    </span>
                  )}
                  <span className="text-emerald-300">{ipPos}</span>
                  {shifted && (
                    <>
                      <span className="text-slate-500">&rarr;</span>
                      <span className="text-sky-300 font-bold">{oopPos} (OOP)</span>
                    </>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Grid: Pitch Canvas + Selected Slot Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Visual Pitch */}
        <div className="lg:col-span-7 space-y-2.5">
          <div className="relative rounded-xl overflow-hidden border border-emerald-700/40 bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-950 min-h-[470px] sm:min-h-[450px] select-none">
            {/* Pitch Markings */}
            <div className="absolute inset-3 border border-emerald-400/25 rounded-lg pointer-events-none">
              <div className="absolute top-1/2 left-0 right-0 h-px bg-emerald-400/25" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-emerald-400/25" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-12 border-b border-x border-emerald-400/25" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-36 h-12 border-t border-x border-emerald-400/25" />
            </div>

            {/* Rest-Defense SVG Overlay (Base Polygon + Exposed Corridors + Transition Vectors) */}
            {pitchPhaseMode === 'rest-defense' && (
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none z-0"
              >
                {/* Exposed or Watch Lane Corridors */}
                {restDefenseMatrix.lanes.map((lane) => {
                  if (lane.status === 'Secure') return null;
                  const fill =
                    lane.status === 'Exposed'
                      ? 'rgba(244, 63, 94, 0.16)'
                      : 'rgba(245, 158, 11, 0.09)';
                  return (
                    <rect
                      key={lane.lane}
                      x={lane.xStart}
                      y={38}
                      width={lane.xEnd - lane.xStart}
                      height={46}
                      fill={fill}
                    />
                  );
                })}

                {/* Rest-Defense Base Shield Polygon */}
                {restDefenseMatrix.basePolygonPoints.length >= 3 && (
                  <polygon
                    points={restDefenseMatrix.basePolygonPoints
                      .map((pt) => `${pt.x},${pt.y}`)
                      .join(' ')}
                    fill="rgba(16, 185, 129, 0.22)"
                    stroke="#34d399"
                    strokeWidth={0.7}
                    strokeDasharray="1.8 1.2"
                  />
                )}
              </svg>
            )}

            {/* 11 Interactive Slot Nodes */}
            {activeSlots.map((slot) => {
              const isSelected = selectedSlot?.slotId === slot.slotId;
              const hasWarning =
                slot.warnings.length > 0 || !slot.isNaturalPosition;
              const restNode = restNodeMap.get(slot.slotId);
              const rawX =
                pitchPhaseMode === 'ip'
                  ? restNode?.ipX ?? slot.x
                  : pitchPhaseMode === 'oop'
                    ? restNode?.oopX ?? slot.x
                    : restNode?.restX ?? slot.x;
              const rawY =
                pitchPhaseMode === 'ip'
                  ? restNode?.ipY ?? slot.y
                  : pitchPhaseMode === 'oop'
                    ? restNode?.oopY ?? slot.y
                    : restNode?.restY ?? slot.y;
              const compactCoord = isCompactPitch
                ? mobilePitchCoords.get(slot.slotId)
                : undefined;
              const displayX = compactCoord?.x ?? rawX;
              const displayY = compactCoord?.y ?? rawY;

              const categoryRing =
                pitchPhaseMode === 'rest-defense' && restNode
                  ? restNode.category === 'BASE_ANCHOR'
                    ? 'ring-2 ring-emerald-400/80'
                    : restNode.category === 'TRANSITION_SHUTTLE'
                      ? 'ring-1 ring-sky-400/70'
                      : restNode.category === 'ATTACKING_OUTLET'
                        ? 'ring-1 ring-purple-400/70'
                        : ''
                  : '';

              const rawNodeRole =
                pitchPhaseMode === 'oop'
                  ? slot.oopRole
                  : pitchPhaseMode === 'rest-defense' && restNode
                    ? restNode.categoryLabel
                    : slot.ipRole;

              return (
                <button
                  key={slot.slotId}
                  type="button"
                  title={
                    slot.player
                      ? `${slot.label}: ${slot.player.name} — ${rawNodeRole}`
                      : `${slot.label}: ${rawNodeRole}`
                  }
                  onClick={() => setSelectedSlotId(slot.slotId)}
                  style={{ left: `${displayX}%`, top: `${displayY}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 px-1 sm:px-2 py-1 sm:py-1.5 rounded-lg text-center transition-all duration-300 w-[62px] min-h-[44px] sm:w-auto sm:min-h-0 sm:min-w-[82px] sm:max-w-[126px] flex flex-col justify-center border cursor-pointer ${categoryRing} ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 border-white shadow-lg scale-105 z-20'
                      : hasWarning
                        ? 'bg-amber-950/90 text-amber-100 border-amber-400/70 hover:bg-amber-900 z-10'
                        : 'bg-slate-950/85 text-slate-100 border-emerald-400/40 hover:border-emerald-300 z-10'
                  }`}
                >
                  <div className="text-[8.5px] sm:text-[10px] font-mono font-bold leading-tight whitespace-nowrap truncate">
                    {slot.label}
                    {slot.player ? ` ${slot.combinedFitPct}%` : ' --'}
                  </div>
                  <div className="text-[10px] sm:text-[11px] font-semibold leading-tight truncate">
                    {slot.player
                      ? formatMobileSurname(slot.player.name)
                      : 'Empty'}
                  </div>
                  <div className="hidden sm:block text-[9px] leading-tight opacity-85 truncate">
                    {formatCompactPitchRole(rawNodeRole)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Docked Tap-to-Inspect IP/OOP Strip */}
          <PitchInspectStrip
            slot={selectedSlot}
            restNode={selectedSlot ? restNodeMap.get(selectedSlot.slotId) : undefined}
            onJumpToEditor={() =>
              slotEditorRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              })
            }
          />

          {/* Swipeable 2-Row Matchday Bench Rail */}
          <PitchBenchRail
            benchEntries={benchEntries}
            selectedSlot={selectedSlot}
            readOnly={effectiveLineupMode === 'bteam'}
            onAssignToSelectedSlot={(playerId) => {
              if (!selectedSlot || effectiveLineupMode === 'bteam') return;
              handleUpdateSlot(selectedSlot.slotId, { playerId });
            }}
          />

          {/* 5-Lane Rest-Defence Corridor Status Bar (tappable on mobile) */}
          <div className="space-y-2">
            <div className="grid grid-cols-5 gap-1.5">
              {restDefenseMatrix.lanes.map((lane) => {
                const isActiveLane = selectedLaneName === lane.lane;
                const badgeCls =
                  lane.status === 'Secure'
                    ? 'border-emerald-500/35 bg-emerald-950/30 text-emerald-300'
                    : lane.status === 'Watch'
                      ? 'border-amber-500/35 bg-amber-950/30 text-amber-300'
                      : 'border-rose-500/45 bg-rose-950/40 text-rose-300';
                return (
                  <button
                    key={lane.lane}
                    type="button"
                    onClick={() =>
                      setSelectedLaneName((curr) =>
                        curr === lane.lane ? null : lane.lane
                      )
                    }
                    title={lane.detail}
                    className={`rounded-lg border px-1.5 sm:px-2 py-1.5 text-center transition cursor-pointer ${badgeCls} ${
                      isActiveLane ? 'ring-2 ring-white/80' : ''
                    }`}
                  >
                    <div className="text-[9px] sm:text-[10px] font-bold truncate">
                      {lane.lane}
                    </div>
                    <div className="text-[9px] sm:text-[10px] font-mono">
                      {lane.status} ({lane.coverageCount})
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedLaneName &&
              (() => {
                const lane = restDefenseMatrix.lanes.find(
                  (l) => l.lane === selectedLaneName
                );
                if (!lane) return null;
                return (
                  <div className="rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-[11px] text-slate-200 flex items-center justify-between gap-2">
                    <div>
                      <strong className="text-emerald-300">{lane.lane}</strong>{' '}
                      <span className="font-mono text-slate-400">
                        ({lane.status} · {lane.coverageCount} covering)
                      </span>
                      : {lane.detail}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedLaneName(null)}
                      className="text-slate-400 hover:text-white text-[10px] font-semibold shrink-0 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                );
              })()}

            {restDefenseMatrix.alerts.length > 0 && (
              <div className="rounded-lg border border-rose-500/35 bg-rose-950/25 px-3 py-2 space-y-1 text-[11px] text-rose-200">
                {restDefenseMatrix.alerts.map((alertText, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <span>{alertText}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Plain-English Rest Defence Guide */}
            {showRestDefenseGuide && (
              <div className="rounded-xl border border-emerald-500/25 bg-slate-950/85 p-3.5 space-y-2.5 text-xs text-slate-300">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 shrink-0" />
                    Rest Defence Explained
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Tap any player or lane above for details
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  <strong className="text-white">Rest Defence</strong> is the shape your
                  team stays in <em>while you have the ball</em> so you don&apos;t get
                  caught on the counter-attack the instant you lose possession. Your{' '}
                  <strong className="text-emerald-300">
                    {restDefenseMatrix.baseDefenderCount}-{restDefenseMatrix.pivotScreenCount} Base
                  </strong>{' '}
                  means {restDefenseMatrix.baseDefenderCount} deep defenders plus{' '}
                  {restDefenseMatrix.pivotScreenCount} holding/tucked screeners stay behind
                  the ball. <strong className="text-white">Transition Stability</strong>{' '}
                  ({restDefenseMatrix.stabilityScore}/100) scores how safely all 5 vertical
                  lanes (flanks, half-spaces &amp; centre) are covered on turnover.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-1.5">
                    <div className="font-bold text-emerald-300">
                      Green Ring &amp; Dashed Shield
                    </div>
                    <div className="text-slate-300 mt-0.5">
                      <strong>Base Anchors</strong> — stay behind the ball to stop
                      counter-attacks immediately.
                    </div>
                  </div>
                  <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 px-2.5 py-1.5">
                    <div className="font-bold text-sky-300">Blue Ring</div>
                    <div className="text-slate-300 mt-0.5">
                      <strong>Shuttles</strong> — support attacks, then counter-press or
                      sprint back to plug gaps.
                    </div>
                  </div>
                  <div className="rounded-lg border border-purple-500/30 bg-purple-950/20 px-2.5 py-1.5">
                    <div className="font-bold text-purple-300">Purple Ring</div>
                    <div className="text-slate-300 mt-0.5">
                      <strong>Outlets</strong> — stay high to pin opposition defenders and
                      launch fast breaks.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Slot Role & Player Editor */}
        <div ref={slotEditorRef} className="lg:col-span-5 space-y-4 scroll-mt-20">
          {selectedSlot && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    SLOT: {selectedSlot.label} ({selectedSlot.positionGroup})
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {selectedSlot.player
                      ? selectedSlot.player.name
                      : 'Unassigned Slot'}
                  </h3>
                  {selectedSlot.player && (() => {
                    const dur = computeDurabilityProfile(selectedSlot.player);
                    return (
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        {dur.label} · {dur.summary}
                      </div>
                    );
                  })()}
                </div>
                {selectedSlot.player && (
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                    Fit {selectedSlot.combinedFitPct}% (IP {selectedSlot.ipFitPct}% / OOP{' '}
                    {selectedSlot.oopFitPct}%)
                  </span>
                )}
              </div>

              {/* Full Rest-Defence Job Explanation for Selected Player */}
              {(() => {
                const selRestNode = restNodeMap.get(selectedSlot.slotId);
                if (!selRestNode) return null;
                const badgeCls =
                  selRestNode.category === 'BASE_ANCHOR'
                    ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                    : selRestNode.category === 'TRANSITION_SHUTTLE'
                      ? 'border-sky-500/35 bg-sky-500/10 text-sky-300'
                      : selRestNode.category === 'ATTACKING_OUTLET'
                        ? 'border-purple-500/35 bg-purple-500/10 text-purple-300'
                        : 'border-slate-700 bg-slate-900 text-slate-300';
                return (
                  <div className={`rounded-lg border px-3 py-2 text-[11px] space-y-0.5 ${badgeCls}`}>
                    <div className="font-bold">
                      Rest-Defence Job: {selRestNode.categoryLabel.replace('Rest-Defense', 'Rest Defence')}
                    </div>
                    <p className="opacity-90 leading-relaxed">
                      {getRestDefenseRoleExplanation(
                        selRestNode.categoryLabel,
                        selRestNode.category
                      )}
                    </p>
                  </div>
                );
              })()}

              {/* Player Override Selector */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Assigned Player
                </label>
                <select
                  disabled={effectiveLineupMode === 'bteam'}
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
                      selectedSlot.oopRole,
                      selectedSlot.flank
                    );
                    const dur = computeDurabilityProfile(p);
                    const activeNextBan = (p.activeSuspensions || []).find((b) =>
                      isSuspensionActiveForCompetition(b, nextCompetitionName)
                    );
                    const otherCompBan = !activeNextBan
                      ? (p.activeSuspensions || [])[0]
                      : undefined;
                    const tag =
                      p.status === 'Injured'
                        ? ' [INJ]'
                        : activeNextBan
                        ? ' [BAN]'
                        : otherCompBan
                        ? otherCompBan.scope === 'cup'
                          ? ' [CUP-BAN]'
                          : ' [OTHER-BAN]'
                        : '';
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.position}) · {sc.combinedFitPct}% · Sta {dur.stamina}
                        {dur.sharpness !== null ? ` · Shp ${dur.sharpness}%` : ''}
                        {tag}
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
                Avg Fit: {activeAvgFit}%
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
