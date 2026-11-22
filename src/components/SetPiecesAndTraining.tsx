import React, { useState } from 'react';
import { Calendar, Crosshair } from 'lucide-react';
import { PlayerRecord } from '../types/fm27';
import { DecodedFmSavePayload } from '../utils/fmSaveHydrator';
import {
  buildDynamicSetPieceRoutines,
  buildDynamicTrainingSchedule,
} from '../utils/fmSyncEngine';

interface SetPiecesAndTrainingProps {
  players: PlayerRecord[];
  saveDate: string;
  upcomingFixtures: DecodedFmSavePayload['upcomingFixtures'];
  clubName: string;
}

export const SetPiecesAndTraining: React.FC<SetPiecesAndTrainingProps> = ({
  players,
  saveDate,
  upcomingFixtures,
  clubName,
}) => {
  const setPieceSummary = buildDynamicSetPieceRoutines(players);
  const trainingSchedule = buildDynamicTrainingSchedule(
    saveDate,
    upcomingFixtures
  );

  const [activeRoutineId, setActiveRoutineId] =
    useState<string>('routine-2-centre');

  if (players.length === 0) {
    return (
      <div className="space-y-6">
        <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-3">
          <Crosshair className="w-8 h-8 text-emerald-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Awaiting .fm Save — Dynamic Corners &amp; Training Periodisation
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Zero pre-filled set-piece routines or fake training calendars
            loaded. Once you import your{' '}
            <span className="font-mono text-emerald-400">.fm</span> save file,
            this tab automatically ranks your squad&apos;s{' '}
            <strong>Set-Piece Aerial Threats (Jumping Reach + Heading)</strong>,{' '}
            <strong>Left/Right-Footed Corner Takers</strong>, and{' '}
            <strong>Fast Recovery Defenders</strong>, and generates your
            fixture-congested Training &amp; Post-Match Rest Calendar from your
            save&apos;s live schedule.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto pt-2 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">Top Aerial Threat (JR + Hdr)</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                --
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">Inswinging Corner Takers</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                --
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">Recovery Speed Locks</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                --
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const routines = setPieceSummary.routines;
  const activeRoutine =
    routines.find((r) => r.id === activeRoutineId) || routines[0];
  const displayClub =
    clubName && clubName !== '--' && clubName !== 'Awaiting .fm Save'
      ? clubName
      : 'Managed Club';

  return (
    <div className="space-y-8">
      {/* Dynamic Set-Piece Specialist Rankings (Aerial Threats, L/R Takers, Recovery Defenders) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
          <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            1. Top Aerial Threats (JR + Hdr)
          </div>
          <div className="space-y-1.5 text-xs">
            {setPieceSummary.aerialThreats.slice(0, 5).map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between gap-2"
              >
                <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                  A{item.rank}. {item.name}
                </span>
                <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 shrink-0">
                  JR {item.jumpingReach} · Hdr {item.heading}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
          <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            2. Left-Footed Takers (Right Corner)
          </div>
          <div className="space-y-1.5 text-xs">
            {setPieceSummary.leftFootTakers.map((item, idx) => (
              <div
                key={item.name}
                className="flex items-center justify-between gap-2"
              >
                <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {idx + 1}. {item.name}
                </span>
                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 shrink-0">
                  Cor {item.corners} · Cro {item.crossing} · Tec{' '}
                  {item.technique}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
          <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            3. Right-Footed Takers (Left Corner)
          </div>
          <div className="space-y-1.5 text-xs">
            {setPieceSummary.rightFootTakers.map((item, idx) => (
              <div
                key={item.name}
                className="flex items-center justify-between gap-2"
              >
                <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {idx + 1}. {item.name}
                </span>
                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 shrink-0">
                  Cor {item.corners} · Cro {item.crossing} · Tec{' '}
                  {item.technique}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
          <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            4. Fast Recovery Defenders (Pac + Acc)
          </div>
          <div className="space-y-1.5 text-xs">
            {setPieceSummary.recoveryDefenders.map((item, idx) => (
              <div
                key={item.name}
                className="flex items-center justify-between gap-2"
              >
                <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                  D{idx + 1}. {item.name}
                </span>
                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 shrink-0">
                  Pac {item.pace} · Acc {item.acceleration} · Tck{' '}
                  {item.tackling}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Calibrated Set-Piece Routines Built from Imported Squad */}
      {activeRoutine && (
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {displayClub} · Calibrated FM27 Set-Piece Routines (Auto-Built
                from Squad Attributes)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Inswinging Centre &amp; Far-Post attacking routines paired with
                the Zonal 6-Yard Wall + Edge-of-Area Counter-Attack Hub.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {routines.map((routine) => (
                <button
                  key={routine.id}
                  type="button"
                  onClick={() => setActiveRoutineId(routine.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeRoutine.id === routine.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {routine.name.split('—')[1]?.trim() || routine.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-3">
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Active Routine
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {activeRoutine.name}
                </h3>
                <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {activeRoutine.delivery}
                </p>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">
                    Left-Side Taker (R-Foot Inswinger):
                  </span>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {activeRoutine.leftTaker}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">
                    Right-Side Taker (L-Foot Inswinger):
                  </span>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {activeRoutine.rightTaker}
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                <strong className="text-slate-900 dark:text-slate-200">
                  Calibration Note:
                </strong>{' '}
                {activeRoutine.auditNote}
              </div>
            </div>

            <div className="lg:col-span-8 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-4">Slot</th>
                    <th className="py-2 pr-4">Bucket Category</th>
                    <th className="py-2 pr-4">Assigned Specialist</th>
                    <th className="py-2">Exact FM27 Instruction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {activeRoutine.assignments.map((a) => (
                    <tr
                      key={a.code}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="py-2.5 pr-4 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {a.code}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {a.role}
                      </td>
                      <td className="py-2.5 pr-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {a.player}
                      </td>
                      <td className="py-2.5 font-mono text-slate-700 dark:text-slate-300">
                        {a.instruction}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Upcoming Fixture Training & Post-Match Rest Schedule */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-2.5">
            <Calendar className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Upcoming Fixture Training &amp; Recovery Periodisation (From{' '}
                {saveDate})
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Playbook v2.0 Section 8: Mandatory Post-Match Rest slashes the
                training injury roll from 13.8% to 4.0%, paired with Build Up
                &amp; Attacking Set-Piece prep before each upcoming fixture.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
            {upcomingFixtures.length} Upcoming Fixtures Synced
          </span>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4">Block</th>
                <th className="py-2.5 pr-4">Date</th>
                <th className="py-2.5 pr-4">Fixture Context</th>
                <th className="py-2.5 pr-4">Slot 1 (Primary)</th>
                <th className="py-2.5 pr-4">Slot 2 (Secondary)</th>
                <th className="py-2.5 pr-4">Slot 3 (Dev / Rest)</th>
                <th className="py-2.5">Periodisation Directive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {trainingSchedule.map((day, idx) => (
                <tr
                  key={`${day.date}-${idx}`}
                  className={
                    idx === 0
                      ? 'bg-emerald-500/10'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }
                >
                  <td className="py-2.5 pr-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {day.week}
                  </td>
                  <td className="py-2.5 pr-4 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {day.date}
                  </td>
                  <td className="py-2.5 pr-4 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {day.fixtureContext}
                  </td>
                  <td className="py-2.5 pr-4 font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                    {day.slot1}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {day.slot2}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {day.slot3}
                  </td>
                  <td className="py-2.5 text-slate-600 dark:text-slate-400">
                    {day.directive}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FM27 Tactical Effectiveness — 4-Pillar Weekly Training Focus */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              FM27 Tactical Effectiveness — 4-Pillar Training Guide
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Target your weakest Tactical Effectiveness pillar each week to raise matchday execution.
            </p>
          </div>
          <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
            FM27 Patch 27.1.0
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              pillar: '1. Tactical Understanding',
              sessions: 'Match Tactics · Shadow Play · IP/OOP Shape',
              cue: 'Prioritise after formation tweaks, new signings, or dip in familiarity.',
            },
            {
              pillar: '2. Player Ability',
              sessions: 'Positional Role · Attacking/Defending Units',
              cue: 'Target weak IP/OOP role slots and individual focus attributes.',
            },
            {
              pillar: '3. Player Buy-In',
              sessions: 'Team Bonding · Community Outreach · Praise',
              cue: 'Schedule weekly when morale, dynamics, or squad cohesion slip.',
            },
            {
              pillar: '4. Next Match Info',
              sessions: 'Match Preview · Match Review · Set Pieces',
              cue: 'Always slot Match Preview pre-game and Match Review post-game.',
            },
          ].map((item) => (
            <div
              key={item.pillar}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-1.5"
            >
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {item.pillar}
              </div>
              <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                {item.sessions}
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                {item.cue}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
