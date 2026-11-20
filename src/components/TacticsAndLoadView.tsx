import {
  AlertTriangle,
  CheckCircle2,
  FileArchive,
  Plus,
  Shield,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { evaluateDoubleGwLoad } from '../domain/fmEngine';
import {
  getRoleFitScore,
  IN_POSSESSION_ROLES,
  OUT_OF_POSSESSION_ROLES,
} from '../domain/playerCatalog';
import type {
  AiContextState,
  DoubleGwTrackerRow,
  PlayerRecord,
  PositionCode,
  TacticDefinition,
  TacticSlot,
} from '../domain/types';

interface TacticsAndLoadViewProps {
  saveStatus: 'awaiting_save' | 'loaded';
  tactics: TacticDefinition[];
  activeTacticId: string | null;
  players: PlayerRecord[];
  managedClubName: string | null;
  onSelectActiveTactic: (tacticId: string) => void;
  onAddTactic: (tactic: Partial<TacticDefinition>) => Promise<void>;
  onOpenLoadSave: () => void;
  onSelectPlayer: (player: PlayerRecord) => void;
}

function getBestFitForSlot(
  squad: PlayerRecord[],
  slot: TacticSlot,
): { player: PlayerRecord; score: number | null } | null {
  if (squad.length === 0) return null;
  const candidates = squad
    .filter((p) => (p.positions[slot.position] ?? 1) >= 12)
    .sort((a, b) => {
      const aFit = getRoleFitScore(a.attributes, 'In Possession', slot.inPossessionRole) ?? 0;
      const bFit = getRoleFitScore(b.attributes, 'In Possession', slot.inPossessionRole) ?? 0;
      const aScore = aFit * 5 + (a.ca ?? 0) * 0.4 + (a.positions[slot.position] ?? 1);
      const bScore = bFit * 5 + (b.ca ?? 0) * 0.4 + (b.positions[slot.position] ?? 1);
      return bScore - aScore;
    });
  const best = candidates[0] ?? squad[0];
  if (!best) return null;
  return {
    player: best,
    score: getRoleFitScore(best.attributes, 'In Possession', slot.inPossessionRole),
  };
}

export function TacticsAndLoadView({
  saveStatus,
  tactics,
  activeTacticId,
  players,
  managedClubName,
  onSelectActiveTactic,
  onAddTactic,
  onOpenLoadSave,
  onSelectPlayer,
}: TacticsAndLoadViewProps) {
  const activeTactic = tactics.find((t) => t.id === activeTacticId) ?? tactics[0] ?? null;

  const managedSquad = useMemo(() => {
    const clubLower = (managedClubName || '').toLowerCase();
    const filtered = clubLower
      ? players.filter(
          (p) =>
            p.playingClub.toLowerCase() === clubLower || p.club.toLowerCase() === clubLower,
        )
      : players;
    return [...filtered].sort((a, b) => (b.ca ?? 0) - (a.ca ?? 0));
  }, [players, managedClubName]);

  // Dynamic Double-GW 180-Min Load Planner state keyed by playerId
  const [plannedMinutes, setPlannedMinutes] = useState<
    Record<number, { m1: number; m2: number }>
  >({});
  const [roleOverrides, setRoleOverrides] = useState<
    Record<number, { ip: string; oop: string }>
  >({});

  useEffect(() => {
    setRoleOverrides({});
  }, [activeTactic?.id]);

  function handleTacticUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const cleanName = file.name.replace(/\.(fmf|json)$/i, '').replace(/[-_]+/g, ' ');
    if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result)) as Partial<TacticDefinition>;
          void onAddTactic({
            ...parsed,
            fileName: file.name,
            name: parsed.name || cleanName,
          });
        } catch {
          void onAddTactic({ fileName: file.name, name: cleanName });
        }
      };
      reader.readAsText(file);
    } else {
      void onAddTactic({
        fileName: file.name,
        name: cleanName,
        formation: file.name.match(/\d-\d-\d(?:-\d)?/)?.[0] ?? '4-3-3 DM Wide',
        mentality: 'Positive',
        tacticalStyle: 'Fluid Counter-Attack',
      });
    }
    e.target.value = '';
  }

  function handleCreateCustomDualPhase433() {
    const layout: Array<[PositionCode, string, string]> = [
      ['GK', 'Goalkeeper', 'Sweeper Keeper'],
      ['DR', 'Full-Back', 'Full-Back'],
      ['DC', 'Centre-Back', 'Centre-Back'],
      ['DC', 'Ball-Playing Centre-Back', 'Centre-Back'],
      ['DL', 'Full-Back', 'Full-Back'],
      ['DM', 'Defensive Midfielder', 'Defensive Midfielder'],
      ['MC', 'Central Midfielder', 'Screening Central Midfielder'],
      ['MC', 'Channel Midfielder', 'Central Midfielder'],
      ['AMR', 'Winger', 'Tracking Winger'],
      ['AML', 'Inside Forward', 'Tracking Winger'],
      ['ST', 'Channel Forward', 'Central Outlet Centre Forward'],
    ];
    void onAddTactic({
      name: `4-3-3 Dual-Phase (${managedClubName || 'Custom'})`,
      formation: '4-3-3 DM Wide',
      mentality: 'Positive',
      tacticalStyle: 'Fluid Counter-Attack',
      inPossessionInstructions: ['Balanced Ground Build-Up', 'Standard Passing Directness'],
      inTransitionInstructions: ['Counter-Attack'],
      outOfPossessionInstructions: ['Mid Block', 'Trigger Press More Often'],
      slots: layout.map(([position, inPossessionRole, outOfPossessionRole], slotIndex) => ({
        slotIndex,
        position,
        inPossessionRole,
        outOfPossessionRole,
      })),
    });
  }

  const doubleGwEvaluations = useMemo(() => {
    return managedSquad.slice(0, 22).map((p) => {
      const plan = plannedMinutes[p.id] ?? { m1: 0, m2: 0 };
      const row: DoubleGwTrackerRow = {
        playerId: p.id,
        player: p.name,
        stamina: p.attributes.stamina,
        match1Minutes: plan.m1,
        match2Minutes: plan.m2,
      };
      return {
        player: p,
        row,
        eval: evaluateDoubleGwLoad(row),
      };
    });
  }, [managedSquad, plannedMinutes]);

  const activePlannedCount = doubleGwEvaluations.filter(
    (d) => d.eval.combinedMinutes > 0,
  ).length;
  const overloadCount = doubleGwEvaluations.filter(
    (d) => d.eval.combinedMinutes > 0 && !d.eval.passed,
  ).length;

  if (saveStatus === 'awaiting_save' && tactics.length === 0 && players.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[8px] border border-dashed border-[#59515f] bg-[#14111a]/90 p-8 text-center">
        <div className="max-w-[540px] space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#734096] bg-[#34223f] text-[#dc87ff]">
            <FileArchive className="h-5 w-5" />
          </div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#dc87ff]">
            Awaiting .fm Save
          </div>
          <h3 className="fm-font-display text-[20px] font-bold text-white">
            No Decoded Tactics or Squad Load Data
          </h3>
          <p className="text-[13px] text-[#b2acbb]">
            Load your <code className="text-[#dc87ff]">.fm</code> save to decode active IP/OOP
            tactics and run dynamic Double-Gameweek 125m/150m load calculations on your real
            squad, or upload a <code className="text-[#d4ced8]">.fmf</code> /{' '}
            <code className="text-[#d4ced8]">.json</code> tactic file.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onOpenLoadSave}
              className="inline-flex h-[38px] items-center gap-2 rounded-[5px] bg-[#850be3] px-4 text-[13px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              <span>Load .fm Save</span>
            </button>
            <label className="inline-flex h-[38px] items-center gap-2 rounded-[5px] border border-[#59515f] bg-[#202128] px-4 text-[13px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] cursor-pointer">
              <Upload className="h-4 w-4 text-[#dc87ff]" />
              <span>Upload .fmf / .json Tactic</span>
              <input
                type="file"
                accept=".fmf,.json"
                onChange={handleTacticUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-5">
      {/* Top Tactic Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#39333f] bg-[#14111a] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#dc87ff]" />
            <span className="text-[13px] font-bold text-white">Active Dual-Phase Tactic</span>
          </div>

          <select
            aria-label="Select active tactic"
            value={activeTactic?.id ?? ''}
            onChange={(e) => onSelectActiveTactic(e.target.value)}
            className="h-[34px] min-w-[230px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[12.5px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
          >
            {tactics.length === 0 ? (
              <option value="">No tactics loaded yet</option>
            ) : (
              tactics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.formation} ({t.mentality})
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCreateCustomDualPhase433}
            className="inline-flex h-[34px] items-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#241f2a] px-3 text-[12px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 text-[#dc87ff]" />
            <span>Add 4-3-3 IP/OOP Slot</span>
          </button>

          <label className="inline-flex h-[34px] items-center gap-1.5 rounded-[5px] bg-[#850be3] px-3.5 text-[12px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            <span>Upload .fmf / .json</span>
            <input
              type="file"
              accept=".fmf,.json"
              onChange={handleTacticUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Dual-Phase 11-Slot Tactical Board */}
      {activeTactic ? (
        <div className="rounded-[8px] border border-[#39333f] bg-[#14111a] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#39333f] pb-3.5">
            <div>
              <h2 className="fm-font-display text-[18px] font-bold text-white">
                {activeTactic.name}
              </h2>
              <p className="text-[12px] text-[#b2acbb]">
                {activeTactic.formation} · {activeTactic.tacticalStyle} · Mentality:{' '}
                <span className="font-semibold text-[#ecc2ff]">{activeTactic.mentality}</span> ·
                Pure FM27 Dual-Phase IP/OOP Model (Zero Legacy Duties)
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {activeTactic.inPossessionInstructions.map((inst) => (
                <span
                  key={`ip-${inst}`}
                  className="rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-emerald-300"
                >
                  IP: {inst}
                </span>
              ))}
              {activeTactic.outOfPossessionInstructions.map((inst) => (
                <span
                  key={`oop-${inst}`}
                  className="rounded border border-[#734096] bg-[#34223f] px-2 py-0.5 text-[#e4adff]"
                >
                  OOP: {inst}
                </span>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="fm-grid-table w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className="h-[38px] px-3 text-left">Slot</th>
                  <th className="h-[38px] px-3 text-left">Position</th>
                  <th className="h-[38px] px-3 text-left">In-Possession (IP) Role</th>
                  <th className="h-[38px] px-3 text-left">Out-of-Possession (OOP) Role</th>
                  <th className="h-[38px] px-3 text-left">Best Natural Squad Fit</th>
                </tr>
              </thead>
              <tbody>
                {activeTactic.slots.map((slot) => {
                  const override = roleOverrides[slot.slotIndex];
                  const ipRole = override?.ip ?? slot.inPossessionRole;
                  const oopRole = override?.oop ?? slot.outOfPossessionRole;
                  const effectiveSlot: TacticSlot = {
                    ...slot,
                    inPossessionRole: ipRole,
                    outOfPossessionRole: oopRole,
                  };
                  const bestFit = getBestFitForSlot(managedSquad, effectiveSlot);

                  return (
                    <tr key={slot.slotIndex} className="border-b border-white/[0.04]">
                      <td className="h-[40px] px-3 font-mono text-[#9c92a6]">
                        #{slot.slotIndex + 1}
                      </td>
                      <td className="h-[40px] px-3 font-mono font-bold text-[#dc87ff]">
                        {slot.position}
                      </td>
                      <td className="h-[40px] px-3">
                        <select
                          aria-label={`IP role for slot ${slot.slotIndex + 1}`}
                          value={ipRole}
                          onChange={(e) =>
                            setRoleOverrides((prev) => ({
                              ...prev,
                              [slot.slotIndex]: {
                                ip: e.target.value,
                                oop: prev[slot.slotIndex]?.oop ?? slot.outOfPossessionRole,
                              },
                            }))
                          }
                          className="h-[30px] min-w-[210px] rounded border border-[#473d50] bg-[#1a151e] px-2 text-[12px] text-[#71e7a7] focus:border-[#dc87ff] focus:outline-none"
                        >
                          {!IN_POSSESSION_ROLES.some((r) => r.name === ipRole) && (
                            <option value={ipRole}>{ipRole}</option>
                          )}
                          {IN_POSSESSION_ROLES.map((r) => (
                            <option key={`ip-${r.positionGroup}-${r.name}`} value={r.name}>
                              {r.name} ({r.positionGroup})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="h-[40px] px-3">
                        <select
                          aria-label={`OOP role for slot ${slot.slotIndex + 1}`}
                          value={oopRole}
                          onChange={(e) =>
                            setRoleOverrides((prev) => ({
                              ...prev,
                              [slot.slotIndex]: {
                                ip: prev[slot.slotIndex]?.ip ?? slot.inPossessionRole,
                                oop: e.target.value,
                              },
                            }))
                          }
                          className="h-[30px] min-w-[210px] rounded border border-[#473d50] bg-[#1a151e] px-2 text-[12px] text-[#ecc2ff] focus:border-[#dc87ff] focus:outline-none"
                        >
                          {!OUT_OF_POSSESSION_ROLES.some((r) => r.name === oopRole) && (
                            <option value={oopRole}>{oopRole}</option>
                          )}
                          {OUT_OF_POSSESSION_ROLES.map((r) => (
                            <option key={`oop-${r.positionGroup}-${r.name}`} value={r.name}>
                              {r.name} ({r.positionGroup})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="h-[40px] px-3">
                        {bestFit ? (
                          <button
                            type="button"
                            onClick={() => onSelectPlayer(bestFit.player)}
                            className="inline-flex items-center gap-2 text-left font-semibold text-white hover:text-[#dc87ff] hover:underline cursor-pointer"
                          >
                            <span>{bestFit.player.name}</span>
                            <span className="font-mono text-[11px] text-[#9c92a6]">
                              (CA {bestFit.player.ca ?? '--'}
                              {bestFit.score !== null ? ` · Fit ${bestFit.score}` : ''})
                            </span>
                          </button>
                        ) : (
                          <span className="text-[#6f6778]">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-[8px] border border-[#39333f] bg-[#14111a] p-5 text-[13px] text-[#b2acbb]">
          No tactic decoded in this save yet. Click &ldquo;Add 4-3-3 IP/OOP Slot&rdquo; or upload a{' '}
          <code className="text-[#dc87ff]">.fmf</code> / <code className="text-[#dc87ff]">.json</code>{' '}
          tactic file above.
        </div>
      )}

      {/* Dynamic Double-Gameweek 180-Min Load Tracker */}
      <div className="rounded-[8px] border border-[#39333f] bg-[#14111a] p-5 space-y-4">
        <div className="flex flex-col gap-2 border-b border-[#39333f] pb-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="fm-font-display text-[18px] font-bold text-white">
              Double-Gameweek 180-Minute Load Tracker
            </h2>
            <p className="text-[12px] text-[#b2acbb]">
              Computed live from your loaded squad: enforces{' '}
              <strong className="text-white">&le;125m</strong> standard outfield cap (or{' '}
              <strong className="text-emerald-300">&le;150m</strong> for Stamina &ge;13).
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[12px]">
            {overloadCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded border border-[#ff758b]/40 bg-[#40212b] px-2.5 py-1 text-[#ffb5c1]">
                <AlertTriangle className="h-3.5 w-3.5" />
                {overloadCount} Overload Risk
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {activePlannedCount > 0
                  ? `${activePlannedCount} Planned · Zero Overloads`
                  : 'Ready to Plan Rotation'}
              </span>
            )}
          </div>
        </div>

        {doubleGwEvaluations.length === 0 ? (
          <p className="text-[13px] text-[#9c92a6]">
            Load a squad to plan Double-Gameweek minute splits.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="fm-grid-table w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  <th className="h-[38px] px-3 text-left">Player</th>
                  <th className="h-[38px] px-2 text-left">Pos</th>
                  <th className="h-[38px] px-2 text-right">Cond</th>
                  <th className="h-[38px] px-2 text-right">Stamina</th>
                  <th className="h-[38px] px-2 text-right">Match 1 (mins)</th>
                  <th className="h-[38px] px-2 text-right">Match 2 (mins)</th>
                  <th className="h-[38px] px-2 text-center">Quick Split</th>
                  <th className="h-[38px] px-2 text-right">Combined / Cap</th>
                  <th className="h-[38px] px-3 text-right">Load Status</th>
                </tr>
              </thead>
              <tbody>
                {doubleGwEvaluations.map(({ player, row, eval: res }) => (
                  <tr key={player.id} className="border-b border-white/[0.04]">
                    <td className="h-[38px] px-3 font-semibold text-white whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(player)}
                        className="hover:text-[#dc87ff] hover:underline cursor-pointer"
                      >
                        {player.name}
                      </button>
                    </td>
                    <td className="px-2 font-mono text-[#b2acbb] whitespace-nowrap">
                      {player.positionText || '--'}
                    </td>
                    <td className="px-2 text-right font-mono tabular-nums">
                      {player.condition !== null ? `${player.condition}%` : '--'}
                    </td>
                    <td className="px-2 text-right font-mono tabular-nums">
                      {player.attributes.stamina ?? '--'}
                    </td>
                    <td className="px-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={120}
                        aria-label={`Match 1 minutes for ${player.name}`}
                        value={row.match1Minutes}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(120, Number(e.target.value) || 0));
                          setPlannedMinutes((prev) => ({
                            ...prev,
                            [player.id]: { m1: v, m2: prev[player.id]?.m2 ?? 0 },
                          }));
                        }}
                        className="h-[26px] w-[58px] rounded border border-[#473d50] bg-[#1a151e] px-1.5 text-right font-mono text-[12px] text-white tabular-nums focus:border-[#dc87ff] focus:outline-none"
                      />
                    </td>
                    <td className="px-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={120}
                        aria-label={`Match 2 minutes for ${player.name}`}
                        value={row.match2Minutes}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(120, Number(e.target.value) || 0));
                          setPlannedMinutes((prev) => ({
                            ...prev,
                            [player.id]: { m1: prev[player.id]?.m1 ?? 0, m2: v },
                          }));
                        }}
                        className="h-[26px] w-[58px] rounded border border-[#473d50] bg-[#1a151e] px-1.5 text-right font-mono text-[12px] text-white tabular-nums focus:border-[#dc87ff] focus:outline-none"
                      />
                    </td>
                    <td className="px-2 text-center whitespace-nowrap">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setPlannedMinutes((prev) => ({
                              ...prev,
                              [player.id]: { m1: 62, m2: 62 },
                            }))
                          }
                          className="rounded border border-[#473d50] bg-[#202128] px-1.5 py-0.5 text-[10.5px] text-[#d4ced8] hover:border-[#dc87ff] cursor-pointer"
                        >
                          62/62
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPlannedMinutes((prev) => ({
                              ...prev,
                              [player.id]: { m1: 90, m2: 0 },
                            }))
                          }
                          className="rounded border border-[#473d50] bg-[#202128] px-1.5 py-0.5 text-[10.5px] text-[#d4ced8] hover:border-[#dc87ff] cursor-pointer"
                        >
                          90/0
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPlannedMinutes((prev) => ({
                              ...prev,
                              [player.id]: { m1: 0, m2: 0 },
                            }))
                          }
                          className="rounded border border-[#473d50] bg-[#14111a] px-1.5 py-0.5 text-[10.5px] text-[#9c92a6] hover:text-white cursor-pointer"
                        >
                          0
                        </button>
                      </div>
                    </td>
                    <td className="px-2 text-right font-mono font-bold tabular-nums text-white whitespace-nowrap">
                      {res.combinedMinutes}m / {res.capLimit}m
                    </td>
                    <td className="px-3 text-right font-mono whitespace-nowrap">
                      {res.riskTier === 'Overload Risk' ? (
                        <span className="rounded bg-[#40212b] px-2 py-0.5 text-[11px] font-bold text-[#ff8fa2]">
                          OVERLOAD
                        </span>
                      ) : res.riskTier === 'Protected' ? (
                        <span className="rounded bg-[#2e2214] px-2 py-0.5 text-[11px] font-bold text-[#f5c469]">
                          PROTECTED
                        </span>
                      ) : (
                        <span className="rounded bg-[#142c21] px-2 py-0.5 text-[11px] font-bold text-[#71e7a7]">
                          OPTIMAL
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
