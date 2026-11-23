import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  RotateCcw,
  Shield,
  Sliders,
  Sparkles,
  Users,
} from 'lucide-react';
import { PlayerRecord } from '../types/fm27';
import {
  DeepTacticRecord,
  LastMatchTacticBlueprint,
  TacticSlotAssignment,
} from '../types/fmSave';
import { buildLastMatchTacticBlueprint } from '../utils/clubGovernanceAndTactics';
import type { DecodedFmSavePayload } from '../utils/fmSaveHydrator';
import {
  describeFm27RoleBrief,
  filterMeaningfulInstructions,
} from '../utils/squadPlannerHelper';
import {
  buildTacticOverrideKey,
  clearTacticRoleOverrides,
  getFm27RoleTendencies,
  getValidFm27RolesForSlot,
  loadTacticRoleOverrides,
  saveTacticRoleOverride,
  TacticRoleResolutionSource,
} from '../utils/fm27TacticRoleInference';

interface LastMatchTacticBlueprintCardProps {
  decodedPayload?: DecodedFmSavePayload | null;
  defaultBlueprint?: LastMatchTacticBlueprint | null;
  players: PlayerRecord[];
  dictionaryVersion?: number;
  onOpenCalibrationLab?: (tab?: 'roles' | 'instructions' | 'diff' | 'governance') => void;
  onAskAnalyst?: (prompt: string) => void;
}

function formatRoleSourceBadge(
  source?: TacticRoleResolutionSource,
  confidence?: number
): { label: string; className: string } {
  if (source === 'dictionary_decoded') {
    return {
      label: 'Binary Decoded',
      className: 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300',
    };
  }
  if (source === 'confirmed') {
    return {
      label: 'Confirmed',
      className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    };
  }
  if (source === 'fingerprint_matched') {
    return {
      label: 'Auto-Matched',
      className: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
    };
  }
  if (source === 'save_decoded') {
    return {
      label: 'Auto-Decoded (.fm)',
      className: 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300',
    };
  }
  return {
    label: `Worked Out${confidence ? ` · ${confidence}%` : ''}`,
    className: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
  };
}

export const LastMatchTacticBlueprintCard: React.FC<LastMatchTacticBlueprintCardProps> = ({
  decodedPayload = null,
  defaultBlueprint = null,
  players,
  dictionaryVersion = 0,
  onOpenCalibrationLab,
  onAskAnalyst,
}) => {
  const [selectedTacticIdx, setSelectedTacticIdx] = useState(0);
  const [phaseView, setPhaseView] = useState<'ip' | 'oop'>('ip');
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null);
  const [overrideNonce, setOverrideNonce] = useState(0);

  const savedTactics: DeepTacticRecord[] = decodedPayload?.tactics || [];

  const blueprint = useMemo<LastMatchTacticBlueprint | null>(() => {
    void overrideNonce;
    void dictionaryVersion;
    const overrides = loadTacticRoleOverrides();
    if (decodedPayload && savedTactics.length > 0) {
      return buildLastMatchTacticBlueprint(decodedPayload, players, selectedTacticIdx, overrides);
    }
    return defaultBlueprint;
  }, [decodedPayload, savedTactics.length, players, selectedTacticIdx, defaultBlueprint, overrideNonce, dictionaryVersion]);

  if (!blueprint) {
    return null;
  }

  const chosenRawTactic = savedTactics[selectedTacticIdx] || savedTactics[0] || null;
  const tacticKey = buildTacticOverrideKey(
    blueprint.tacticName,
    chosenRawTactic?.index ?? selectedTacticIdx
  );

  const confirmedSlotsCount = blueprint.starters.filter(
    (s) => s.ipRoleSource === 'confirmed' || s.oopRoleSource === 'confirmed'
  ).length;

  const activeStarter: TacticSlotAssignment | null =
    selectedSlotIdx !== null && blueprint.starters[selectedSlotIdx]
      ? blueprint.starters[selectedSlotIdx]
      : null;

  const ti = blueprint.teamInstructions;
  const totalTeamInstr =
    ti.inPossession.length + ti.inTransition.length + ti.outOfPossession.length;

  const effTone =
    blueprint.tacticalEffectivenessScore >= 75
      ? 'text-emerald-400'
      : blueprint.tacticalEffectivenessScore >= 55
        ? 'text-amber-300'
        : 'text-rose-400';

  const lastMatchLabel = blueprint.opponent
    ? `${blueprint.matchDate || ''} vs ${blueprint.opponent}${blueprint.score ? ` (${blueprint.result || ''} ${blueprint.score})` : ''}`.trim()
    : null;

  const handleConfirmRole = (
    slot: TacticSlotAssignment,
    phase: 'ip' | 'oop',
    roleName: string
  ) => {
    if (!roleName) return;
    saveTacticRoleOverride({
      tacticKey,
      slotIndex: slot.slotIndex,
      phase,
      roleName,
      positionCode: phase === 'ip' ? slot.position : slot.outOfPossessionPosition || slot.position,
      binaryFingerprint:
        phase === 'ip' ? slot.ipBinaryFingerprint : slot.oopBinaryFingerprint,
      roleBits: phase === 'ip' ? slot.ipRoleBits : slot.oopRoleBits,
      trailBits: phase === 'ip' ? slot.ipTrailBits : slot.oopTrailBits,
      roleCoreSignature:
        phase === 'ip' ? slot.ipRoleCoreSignature : slot.oopRoleCoreSignature,
    });
    setOverrideNonce((n) => n + 1);
  };

  const handleResetOverrides = () => {
    clearTacticRoleOverrides(tacticKey);
    setOverrideNonce((n) => n + 1);
  };

  const handleAuditTactic = () => {
    if (!onAskAnalyst) return;
    onAskAnalyst(
      `Audit my exact last-game / active FM27 tactic "${blueprint.tacticName}" (IP ${blueprint.inPossessionFormation} / OOP ${blueprint.outOfPossessionFormation}, ${blueprint.mentality} mentality, ${blueprint.styleName}). Check every starter's IP & OOP role, decoded In-Possession / Transition / Out-of-Possession instructions, and Patch 27.1.0 risks (especially Holding Full-Back pressing, wide OOP Tracking Winger cover, and counter transitions). Give me the top 3 concrete tactical improvements.`
    );
  };

  return (
    <section
      aria-label="Last Game and Active FM27 Save Tactic Blueprint"
      className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 sm:p-5 space-y-4"
    >
      {/* Header + Slot Switcher */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-400 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-white">
              Last Match &amp; Active Save Tactic: {blueprint.tacticName}
            </h2>
            <span className={`font-mono text-xs font-bold tabular-nums ${effTone}`}>
              {blueprint.tacticalEffectivenessScore}/100 Effectiveness
            </span>
          </div>
          <p className="text-xs text-slate-400">
            IP <span className="font-mono text-emerald-300">{blueprint.inPossessionFormation}</span>
            {' · '}OOP <span className="font-mono text-sky-300">{blueprint.outOfPossessionFormation}</span>
            {' · '}
            <span className="text-slate-200">{blueprint.mentality}</span>
            {' · '}
            <span className="text-slate-300">{blueprint.styleName}</span>
            {lastMatchLabel && (
              <span className="text-slate-400"> · Last: {lastMatchLabel}</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {savedTactics.length > 1 && (
            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-[11px]">
              {savedTactics.slice(0, 3).map((tac, idx) => (
                <button
                  key={`${tac.name}-${idx}`}
                  type="button"
                  onClick={() => {
                    setSelectedTacticIdx(idx);
                    setSelectedSlotIdx(null);
                  }}
                  className={`min-h-[34px] px-2.5 rounded-md font-semibold transition-colors ${
                    selectedTacticIdx === idx
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Slot {idx + 1}
                </button>
              ))}
            </div>
          )}

          {confirmedSlotsCount > 0 && (
            <button
              type="button"
              onClick={handleResetOverrides}
              className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
              title="Reset confirmed IP & OOP role locks for this tactic"
            >
              <RotateCcw className="h-3 w-3" /> Reset ({confirmedSlotsCount})
            </button>
          )}

          {onOpenCalibrationLab && (
            <button
              type="button"
              onClick={() => onOpenCalibrationLab('roles')}
              className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-[11px] font-medium text-slate-400 hover:border-slate-600 hover:text-slate-200 transition-colors whitespace-nowrap"
              title="Optional advanced binary inspector for raw .fm tactic bytes & save diffs"
            >
              <Sliders className="h-3.5 w-3.5" /> Inspector
            </button>
          )}

          {onAskAnalyst && (
            <button
              type="button"
              onClick={handleAuditTactic}
              className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Audit Tactic in Analyst
            </button>
          )}
        </div>
      </div>

      {/* 3-Lane Team Instructions Matrix (In Possession / In Transition / Out of Possession) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider text-slate-400">
            <Sliders className="h-3.5 w-3.5 text-sky-400" />
            Decoded Team Instructions ({totalTeamInstr > 0 ? `${totalTeamInstr} active` : 'Standard defaults'})
          </span>
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
            <button
              type="button"
              onClick={() => setPhaseView('ip')}
              className={`min-h-[30px] px-2.5 rounded text-[11px] font-semibold transition-colors ${
                phaseView === 'ip'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              IP Roles ({blueprint.inPossessionFormation})
            </button>
            <button
              type="button"
              onClick={() => setPhaseView('oop')}
              className={`min-h-[30px] px-2.5 rounded text-[11px] font-semibold transition-colors ${
                phaseView === 'oop'
                  ? 'bg-sky-500/20 text-sky-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              OOP Roles ({blueprint.outOfPossessionFormation})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
          {/* In Possession */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              In Possession ({ti.inPossession.length})
            </div>
            {ti.inPossession.length > 0 ? (
              <ul className="space-y-1">
                {ti.inPossession.map((label, idx) => (
                  <li key={`${label}-${idx}`} className="text-[11px] text-slate-200">
                    {label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-500">Balanced / Standard in-possession defaults</p>
            )}
          </div>

          {/* In Transition */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
              In Transition ({ti.inTransition.length})
            </div>
            {ti.inTransition.length > 0 ? (
              <ul className="space-y-1">
                {ti.inTransition.map((label, idx) => (
                  <li key={`${label}-${idx}`} className="text-[11px] text-slate-200">
                    {label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-500">Standard transition &amp; distribution defaults</p>
            )}
          </div>

          {/* Out of Possession */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-400">
              Out of Possession ({ti.outOfPossession.length})
            </div>
            {ti.outOfPossession.length > 0 ? (
              <ul className="space-y-1">
                {ti.outOfPossession.map((label, idx) => (
                  <li key={`${label}-${idx}`} className="text-[11px] text-slate-200">
                    {label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-500">Standard mid-block pressing defaults</p>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Starting XI Role + Instruction Roster */}
      {blueprint.starters.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <span className="font-semibold uppercase tracking-wider">
              Starting XI Used ({blueprint.starters.length} slots) — Tap any player to inspect or confirm IP/OOP roles
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {blueprint.starters.map((slot, idx) => {
              const isSelected = selectedSlotIdx === idx;
              const ipList = filterMeaningfulInstructions(slot.inPossessionInstructions);
              const oopList = filterMeaningfulInstructions(slot.outOfPossessionInstructions);
              const decodedPiCount = ipList.length + oopList.length;
              const ipFlagCount = slot.settingCountIp ?? ipList.length;
              const oopFlagCount = slot.settingCountOop ?? oopList.length;
              const oopPos = slot.outOfPossessionPosition || slot.position;
              const shiftsShape = Boolean(oopPos && oopPos !== slot.position);
              const ipRoleLabel = slot.inPossessionRole || slot.ipRole || 'Standard';
              const oopRoleLabel = slot.outOfPossessionRole || slot.oopRole || ipRoleLabel;
              const isConfirmed =
                slot.ipRoleSource === 'save_decoded' ||
                slot.oopRoleSource === 'save_decoded' ||
                slot.ipRoleSource === 'dictionary_decoded' ||
                slot.oopRoleSource === 'dictionary_decoded' ||
                slot.ipRoleSource === 'confirmed' ||
                slot.oopRoleSource === 'confirmed' ||
                slot.ipRoleSource === 'fingerprint_matched' ||
                slot.oopRoleSource === 'fingerprint_matched';

              return (
                <button
                  key={`${slot.position}-${slot.playerUid ?? idx}`}
                  type="button"
                  onClick={() =>
                    setSelectedSlotIdx((curr) => (curr === idx ? null : idx))
                  }
                  className={`text-left rounded-lg border p-2.5 transition-colors space-y-1 ${
                    isSelected
                      ? 'border-emerald-500/60 bg-emerald-500/10'
                      : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-[11px] font-bold text-emerald-300 shrink-0">
                        {phaseView === 'ip' ? slot.position : oopPos}
                      </span>
                      {shiftsShape && (
                        <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-slate-500">
                          <ArrowRight className="h-2.5 w-2.5" />
                          {phaseView === 'ip' ? oopPos : slot.position}
                        </span>
                      )}
                      <span className="font-semibold text-white truncate">
                        {slot.playerName || 'Vacant Slot'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isConfirmed && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                          title="Confirmed IP/OOP role"
                        />
                      )}
                      {slot.lastMatchRating != null && (
                        <span className="font-mono text-[11px] font-semibold text-amber-300 tabular-nums">
                          {slot.lastMatchRating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-300 truncate">
                    {phaseView === 'ip' ? (
                      <>
                        <span className="text-emerald-300 font-medium">{ipRoleLabel}</span>
                        <span className="text-slate-500"> / OOP: {oopRoleLabel}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-sky-300 font-medium">{oopRoleLabel}</span>
                        <span className="text-slate-500"> / IP: {ipRoleLabel}</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>
                      {decodedPiCount > 0
                        ? `${decodedPiCount} decoded PI${decodedPiCount === 1 ? '' : 's'}`
                        : ipFlagCount > 0 || oopFlagCount > 0
                          ? `${ipFlagCount} IP · ${oopFlagCount} OOP flags`
                          : 'Standard role PIs'}
                    </span>
                    {slot.lastMatchMinutes != null && (
                      <span>{slot.lastMatchMinutes}m played</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Starter Dual-Phase IP & OOP Role Working-Out + Confirmation Drawer */}
          {activeStarter && (() => {
            const ipRole = activeStarter.inPossessionRole || activeStarter.ipRole || 'Standard';
            const oopRole = activeStarter.outOfPossessionRole || activeStarter.oopRole || ipRole;
            const ipPos = activeStarter.position;
            const oopPos = activeStarter.outOfPossessionPosition || activeStarter.position;
            const ipDecoded = filterMeaningfulInstructions(activeStarter.inPossessionInstructions);
            const oopDecoded = filterMeaningfulInstructions(activeStarter.outOfPossessionInstructions);
            const ipBrief = describeFm27RoleBrief(ipRole);
            const oopBrief = describeFm27RoleBrief(oopRole);
            const ipTendencies = getFm27RoleTendencies(ipRole);
            const oopTendencies = getFm27RoleTendencies(oopRole);
            const ipFlagCount = activeStarter.settingCountIp ?? ipDecoded.length;
            const oopFlagCount = activeStarter.settingCountOop ?? oopDecoded.length;
            const ipBadge = formatRoleSourceBadge(activeStarter.ipRoleSource, activeStarter.ipRoleConfidence);
            const oopBadge = formatRoleSourceBadge(activeStarter.oopRoleSource, activeStarter.oopRoleConfidence);
            const validIpRoles = getValidFm27RolesForSlot(ipPos, 'ip').map((r) => r.name);
            const validOopRoles = getValidFm27RolesForSlot(oopPos, 'oop').map((r) => r.name);

            return (
              <div className="rounded-lg border border-emerald-500/35 bg-slate-950/90 p-3.5 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-white">
                    {activeStarter.playerName || 'Selected Slot'}{' '}
                    <span className="font-mono text-emerald-300 ml-1">
                      IP {ipPos} ({ipRole}) → OOP {oopPos} ({oopRole})
                    </span>
                  </div>
                  {activeStarter.lastMatchRating != null && (
                    <span className="font-mono text-amber-300">
                      Last Match: {activeStarter.lastMatchRating.toFixed(2)} rt
                      {activeStarter.lastMatchMinutes != null
                        ? ` · ${activeStarter.lastMatchMinutes}m`
                        : ''}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[11px]">
                  {/* IN POSSESSION CARD */}
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400">
                        In Possession · {ipPos}
                      </div>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold ${ipBadge.className}`}
                      >
                        {ipBadge.label}
                      </span>
                    </div>

                    <div className="text-sm font-semibold text-white">{ipRole}</div>
                    {activeStarter.ipRoleReasoning && (
                      <p className="text-[10px] text-slate-400 leading-snug">
                        {activeStarter.ipRoleReasoning}
                      </p>
                    )}
                    {ipBrief && (
                      <p className="text-slate-200 leading-relaxed">{ipBrief}</p>
                    )}

                    {ipTendencies.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {ipTendencies.map((t) => (
                          <span
                            key={t}
                            className="rounded border border-emerald-500/20 bg-slate-950/70 px-1.5 py-0.5 text-[10px] text-emerald-200"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Quick-Pick Worked-Out Candidates + Full Position Role Selector */}
                    <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="uppercase tracking-wider font-semibold">
                          Confirm / Change IP Role ({ipPos})
                        </span>
                        {activeStarter.ipBinaryFingerprint && (
                          <span className="font-mono text-[9px] text-slate-500">
                            FP {activeStarter.ipBinaryFingerprint}
                          </span>
                        )}
                      </div>
                      {activeStarter.ipRoleCandidates && activeStarter.ipRoleCandidates.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {activeStarter.ipRoleCandidates.map((cand) => {
                            const active = cand.name === ipRole;
                            return (
                              <button
                                key={cand.name}
                                type="button"
                                onClick={() => handleConfirmRole(activeStarter, 'ip', cand.name)}
                                className={`rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                                  active
                                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                                    : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-emerald-500/50 hover:text-white'
                                }`}
                              >
                                {cand.name}{' '}
                                <span className="font-mono opacity-75">{cand.fitPct}%</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {validIpRoles.length > 0 && (
                        <select
                          aria-label={`Select In-Possession role for ${activeStarter.playerName || ipPos}`}
                          value={validIpRoles.includes(ipRole) ? ipRole : ''}
                          onChange={(e) => handleConfirmRole(activeStarter, 'ip', e.target.value)}
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 focus:border-emerald-500 focus:outline-none"
                        >
                          {!validIpRoles.includes(ipRole) && (
                            <option value="">{ipRole} (select FM27 role...)</option>
                          )}
                          {validIpRoles.map((rName) => (
                            <option key={rName} value={rName}>
                              {rName}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {ipDecoded.length > 0 ? (
                      <div className="pt-1.5 border-t border-slate-800/80 text-emerald-200 leading-relaxed">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 mr-1.5">
                          Save PIs:
                        </span>
                        {ipDecoded.join(' · ')}
                      </div>
                    ) : (
                      <div className="pt-1.5 border-t border-slate-800/80 text-[10px] text-slate-500 leading-relaxed">
                        {ipFlagCount > 0
                          ? `${ipFlagCount} binary IP setting unit${ipFlagCount === 1 ? '' : 's'} detected in save (confirming a role calibrates matching slots automatically).`
                          : 'Standard in-possession role defaults active.'}
                      </div>
                    )}
                  </div>

                  {/* OUT OF POSSESSION CARD */}
                  <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-sky-400">
                        Out of Possession · {oopPos}
                      </div>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold ${oopBadge.className}`}
                      >
                        {oopBadge.label}
                      </span>
                    </div>

                    <div className="text-sm font-semibold text-white">{oopRole}</div>
                    {activeStarter.oopRoleReasoning && (
                      <p className="text-[10px] text-slate-400 leading-snug">
                        {activeStarter.oopRoleReasoning}
                      </p>
                    )}
                    {oopBrief && (
                      <p className="text-slate-200 leading-relaxed">{oopBrief}</p>
                    )}

                    {oopTendencies.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {oopTendencies.map((t) => (
                          <span
                            key={t}
                            className="rounded border border-sky-500/20 bg-slate-950/70 px-1.5 py-0.5 text-[10px] text-sky-200"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Quick-Pick Worked-Out Candidates + Full Position Role Selector */}
                    <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="uppercase tracking-wider font-semibold">
                          Confirm / Change OOP Role ({oopPos})
                        </span>
                        {activeStarter.oopBinaryFingerprint && (
                          <span className="font-mono text-[9px] text-slate-500">
                            FP {activeStarter.oopBinaryFingerprint}
                          </span>
                        )}
                      </div>
                      {activeStarter.oopRoleCandidates && activeStarter.oopRoleCandidates.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {activeStarter.oopRoleCandidates.map((cand) => {
                            const active = cand.name === oopRole;
                            return (
                              <button
                                key={cand.name}
                                type="button"
                                onClick={() => handleConfirmRole(activeStarter, 'oop', cand.name)}
                                className={`rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                                  active
                                    ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                                    : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-sky-500/50 hover:text-white'
                                }`}
                              >
                                {cand.name}{' '}
                                <span className="font-mono opacity-75">{cand.fitPct}%</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {validOopRoles.length > 0 && (
                        <select
                          aria-label={`Select Out-of-Possession role for ${activeStarter.playerName || oopPos}`}
                          value={validOopRoles.includes(oopRole) ? oopRole : ''}
                          onChange={(e) => handleConfirmRole(activeStarter, 'oop', e.target.value)}
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 focus:border-sky-500 focus:outline-none"
                        >
                          {!validOopRoles.includes(oopRole) && (
                            <option value="">{oopRole} (select FM27 role...)</option>
                          )}
                          {validOopRoles.map((rName) => (
                            <option key={rName} value={rName}>
                              {rName}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {oopDecoded.length > 0 ? (
                      <div className="pt-1.5 border-t border-slate-800/80 text-sky-200 leading-relaxed">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 mr-1.5">
                          Save PIs:
                        </span>
                        {oopDecoded.join(' · ')}
                      </div>
                    ) : (
                      <div className="pt-1.5 border-t border-slate-800/80 text-[10px] text-slate-500 leading-relaxed">
                        {oopFlagCount > 0
                          ? `${oopFlagCount} binary OOP setting unit${oopFlagCount === 1 ? '' : 's'} detected in save (confirming a role calibrates matching slots automatically).`
                          : 'Standard out-of-possession role defaults active.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Matchday Substitutes + FM27 Patch 27.1.0 Tactical Effectiveness Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs pt-1 border-t border-slate-800">
        {blueprint.substitutes.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <Users className="h-3.5 w-3.5 text-slate-400" /> Matchday Bench / Substitutes ({blueprint.substitutes.length})
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-300">
              {blueprint.substitutes.slice(0, 9).map((sub) => (
                <span key={`${sub.playerUid ?? sub.playerName}`} className="font-mono">
                  <span className="text-white font-sans font-medium">{sub.playerName}</span>{' '}
                  <span className="text-slate-500">({sub.position || 'Sub'})</span>
                  {sub.lastMatchRating != null && (
                    <span className="text-amber-300 ml-1">{sub.lastMatchRating.toFixed(1)}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {blueprint.tacticalEffectivenessNotes.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" /> FM27 Patch 27.1.0 Engine Audit
            </div>
            <ul className="space-y-1 text-[11px] text-slate-300">
              {blueprint.tacticalEffectivenessNotes.map((note, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
};
