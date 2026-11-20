import React from 'react';
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  FileSpreadsheet,
} from 'lucide-react';
import { PLAYBOOK_V2_REFERENCE_RULES } from '../data/matchAndTacticsData';
import { PlayerRecord } from '../types/fm27';
import { buildDynamicTacticalPlan } from '../utils/fmSyncEngine';

interface TacticalWarRoomProps {
  players: PlayerRecord[];
  saveDate: string;
  nextFixture: string;
  clubName: string;
}

export const TacticalWarRoom: React.FC<TacticalWarRoomProps> = ({
  players,
  saveDate,
  nextFixture,
  clubName,
}) => {
  const tacticalPlan = buildDynamicTacticalPlan(players);
  const hasSquad = players.length > 0;
  const displayClub =
    clubName && clubName !== '--' && clubName !== 'Awaiting .fm Save'
      ? clubName
      : 'Managed Club';

  return (
    <div className="space-y-8">
      {/* Generic Bobby Dean FM27 Playbook v2.0 Reference (Always Available) */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-2.5">
            <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Bobby Dean — Portable FM27 Tactics &amp; Journeyman Playbook
                v2.0 Reference
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Club-independent Patch 27.1.0 Dual-Phase architecture, 2-Window
                Substitution Rule, Set-Piece Zonal Fortress, and Physical Engine
                laws used by the Tactical Analyst &amp; War Room auto-builder.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 shrink-0">
            Patch 27.1.0 Baseline · Dual-Phase IP/OOP
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PLAYBOOK_V2_REFERENCE_RULES.map((rule) => (
            <div
              key={rule.id}
              className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{rule.section}</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                  {rule.tag}
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {rule.title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {rule.summary}
              </p>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                {rule.inGameSetting}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic Tactical War Room: Recommended Dual-Phase 4-3-3 Starting XI & 62m/75m Sub Plan */}
      {!hasSquad ? (
        <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-3">
          <FileSpreadsheet className="w-8 h-8 text-emerald-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Awaiting .fm Save — Dynamic Tactical War Room (-- / 11 Starters)
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Zero pre-filled squad or tactical lineups loaded. Drop or select
            your <span className="font-mono text-emerald-400">.fm</span> save
            file in the <strong>Tactical Analyst Chat</strong> tab to
            automatically build your club&apos;s recommended Dual-Phase 4-3-3
            Starting XI, IP/OOP roles, 62m/75m Touchline Substitution Plan, and
            Double-Gameweek Stamina Load Audit strictly from your imported
            players&apos; positions, Stamina, Pace, Acceleration, and Jumping
            Reach.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto pt-2 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">Recommended Starting XI</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                --
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">62m / 75m Sub Script</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                --
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">Dual-CB 90m Lock</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                --
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Dynamically Built Dual-Phase 4-3-3 Starting XI */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {displayClub} · Recommended Dual-Phase 4-3-3 Starting XI (
                  {nextFixture !== '--' ? `Next: ${nextFixture}` : saveDate})
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Auto-constructed from your imported {players.length}-man
                  squad&apos;s actual positions, Stamina, Pace, Acceleration,
                  Jumping Reach, and Condition.
                </p>
              </div>
              <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
                Save Date: {saveDate} · Tracking Wingers OOP Active
              </span>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-4">Slot</th>
                    <th className="py-2.5 pr-4">Recommended Starter</th>
                    <th className="py-2.5 pr-4">In-Possession (IP) Role</th>
                    <th className="py-2.5 pr-4">
                      Out-of-Possession (OOP) Role
                    </th>
                    <th className="py-2.5 pr-4 text-right">
                      Sta / Pac / Acc / JR
                    </th>
                    <th className="py-2.5 pr-4">Sub Window Plan</th>
                    <th className="py-2.5">Playbook v2.0 Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {tacticalPlan.startingXI.map((item) => {
                    const a = item.player.attributes;
                    return (
                      <tr
                        key={item.slotCode}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <td className="py-2.5 pr-4 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {item.slotCode}
                        </td>
                        <td className="py-2.5 pr-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          #{item.player.number} {item.player.name}
                        </td>
                        <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {item.ipRole}
                        </td>
                        <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {item.oopRole}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {a.stamina}/{a.pace}/{a.acceleration}/{a.jumpingReach}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                          {item.subOffFor
                            ? `${item.plannedMinutes}' → ${item.subOffFor}`
                            : 'Full 90m'}
                        </td>
                        <td className="py-2.5 text-slate-600 dark:text-slate-400">
                          {item.rationale}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Non-Negotiable Touchline Substitution Script Bar */}
          <div className="p-5 bg-slate-100 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
                <div className="font-bold text-slate-900 dark:text-slate-100">
                  Playbook v2.0 Touchline Substitution Script (2 Second-Half
                  Stoppage Windows Max)
                </div>
                {tacticalPlan.subPlan.length > 0 ? (
                  <div className="space-y-1">
                    {tacticalPlan.subPlan.map((sub, idx) => (
                      <div key={idx}>
                        <strong>
                          {sub.windowLabel} [{sub.slotCode}]:
                        </strong>{' '}
                        {sub.playerOn} on for {sub.playerOff} &mdash;{' '}
                        {sub.reason}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    Squad has 11 or fewer fit players — add bench options to
                    populate 62m/75m substitutions.
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400 shrink-0">
              <AlertTriangle className="w-4 h-4" />
              <span>
                Dual-CB 90&apos; Lock: {tacticalPlan.cbPairNames} Never Both
                Subbed Off
              </span>
            </div>
          </div>

          {/* Dynamic Physical Stamina & Double-Gameweek Load Audit */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Squad Stamina &amp; 180-Minute Double-Gameweek Load Audit
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Enforcing the &le;125-minute outfield cap across back-to-back
                  fixtures based on each player&apos;s actual Stamina and
                  Condition.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {tacticalPlan.loadRows.filter((r) => r.passedCap).length}/
                  {tacticalPlan.loadRows.length} Starters Within Cap
                </span>
              </div>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-4">Player (Slot)</th>
                    <th className="py-2.5 pr-4 text-right">Stamina</th>
                    <th className="py-2.5 pr-4 text-right">Season Mins</th>
                    <th className="py-2.5 pr-4">Next Match Rotation Plan</th>
                    <th className="py-2.5 pr-4 text-right">
                      Projected 2-GW Load
                    </th>
                    <th className="py-2.5 text-right">Cap Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {tacticalPlan.loadRows.map((row) => (
                    <tr
                      key={row.playerId}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="py-2.5 pr-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {row.playerName}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {row.stamina}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {row.seasonMinutes}m
                      </td>
                      <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300 font-medium">
                        {row.rolePlan}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {row.projectedDoubleGwMinutes}m / {row.capLimit}m
                      </td>
                      <td className="py-2.5 text-right font-mono whitespace-nowrap">
                        {row.passedCap ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            PASSED
                          </span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 font-semibold">
                            OVERLOAD
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
