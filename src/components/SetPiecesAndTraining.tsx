import React, { useState } from 'react';
import {
  SET_PIECE_ROUTINES,
  SEPTEMBER_TRAINING_CALENDAR,
} from '../data/matchAndTacticsData';

export const SetPiecesAndTraining: React.FC = () => {
  const [activeRoutineId, setActiveRoutineId] = useState<string>(
    SET_PIECE_ROUTINES[0]?.id || ''
  );

  const activeRoutine =
    SET_PIECE_ROUTINES.find((r) => r.id === activeRoutineId) ||
    SET_PIECE_ROUTINES[0] ||
    null;

  return (
    <div className="space-y-8">
      {/* Calibrated Set-Piece Architecture */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Calibrated FM27 Set-Piece Routines
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Defending Corners: 43/43 Shutout (100% clean) &middot; Attacking
              Corners: Re-calibrated to Centre delivery with 3-man edge-of-box
              counter-press wall.
            </p>
          </div>

          {SET_PIECE_ROUTINES.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {SET_PIECE_ROUTINES.map((routine) => (
                <button
                  key={routine.id}
                  type="button"
                  onClick={() => setActiveRoutineId(routine.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeRoutineId === routine.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {routine.name.split('—')[1]?.trim() || routine.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {activeRoutine ? (
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
                      <td className="py-2 pr-4 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {a.code}
                      </td>
                      <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-200">
                        {a.role}
                      </td>
                      <td className="py-2 pr-4 font-semibold text-slate-900 dark:text-slate-100">
                        {a.player}
                      </td>
                      <td className="py-2 text-slate-600 dark:text-slate-400">
                        {a.instruction}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-xs">
            Awaiting .fm save or set-piece import to populate specialized routine assignments.
          </div>
        )}
      </div>

      {/* Training Calendar */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
        <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Training Calendar &amp; Tactical Familiarity Hub
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Tactical Understanding sessions to lift Familiarity above the 51
            threshold + mandatory recovery and rest stamina buffers.
          </p>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4">Week</th>
                <th className="py-2.5 pr-4">Date</th>
                <th className="py-2.5 pr-4">Fixture Context</th>
                <th className="py-2.5 pr-4">Slot 1 (Primary)</th>
                <th className="py-2.5 pr-4">Slot 2 (Secondary)</th>
                <th className="py-2.5 pr-4">Slot 3 (Dev / Rest)</th>
                <th className="py-2.5">Periodisation Directive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {SEPTEMBER_TRAINING_CALENDAR.length > 0 ? (
                SEPTEMBER_TRAINING_CALENDAR.map((day) => (
                  <tr
                    key={day.date}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
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
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    Awaiting .fm save or training schedule to populate calendar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
