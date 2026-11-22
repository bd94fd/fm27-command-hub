import React, { useMemo, useState } from 'react';
import {
  Activity,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { PlayerRecord } from '../types/fm27';
import { DecodedFmSavePayload } from '../utils/fmSaveHydrator';
import {
  buildDynamicSetPieceRoutines,
  buildDynamicTrainingSchedule,
} from '../utils/fmSyncEngine';
import {
  buildWeeklyPlannerFromDynamicSchedule,
  parseFm27TrainerSchedule,
  summarizeWeeklyTrainingLoad,
  TrainingSlotCategory,
  WeeklyTrainingDay,
} from '../utils/trainingPlanner';

const CATEGORY_STYLES: Record<
  TrainingSlotCategory,
  { badge: string; dot: string; label: string }
> = {
  match: {
    badge: 'border-rose-500/40 bg-rose-500/15 text-rose-200',
    dot: 'bg-rose-400',
    label: 'Match',
  },
  tactics: {
    badge: 'border-sky-500/40 bg-sky-500/15 text-sky-200',
    dot: 'bg-sky-400',
    label: 'Tactics',
  },
  attacking: {
    badge: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
    dot: 'bg-emerald-400',
    label: 'Attacking',
  },
  defending: {
    badge: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
    dot: 'bg-amber-400',
    label: 'Defending',
  },
  physical: {
    badge: 'border-orange-500/40 bg-orange-500/15 text-orange-200',
    dot: 'bg-orange-400',
    label: 'Physical',
  },
  set_pieces: {
    badge: 'border-violet-500/40 bg-violet-500/15 text-violet-200',
    dot: 'bg-violet-400',
    label: 'Set Pieces',
  },
  recovery: {
    badge: 'border-teal-500/40 bg-teal-500/15 text-teal-200',
    dot: 'bg-teal-400',
    label: 'Recovery',
  },
  rest: {
    badge: 'border-slate-700 bg-slate-900/80 text-slate-400',
    dot: 'bg-slate-500',
    label: 'Rest',
  },
};

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
  const [selectedMobileDay, setSelectedMobileDay] = useState<number>(0);
  const [importedSchedule, setImportedSchedule] = useState<{
    days: WeeklyTrainingDay[];
    sourceLabel: string;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const autoWeeklyDays = useMemo(
    () => buildWeeklyPlannerFromDynamicSchedule(trainingSchedule),
    [trainingSchedule]
  );
  const activeWeeklyDays = importedSchedule?.days ?? autoWeeklyDays;
  const loadSummary = useMemo(
    () => summarizeWeeklyTrainingLoad(activeWeeklyDays),
    [activeWeeklyDays]
  );

  const handleImportTrainerFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseFm27TrainerSchedule(text);
      if (!parsed) {
        setImportError(
          'Could not parse schedule. Upload a SemHiel2003/fm27-trainer JSON or Mon–Sun 3-slot CSV file.'
        );
        return;
      }
      setImportError(null);
      setImportedSchedule({
        days: parsed.days,
        sourceLabel: `${parsed.sourceLabel} (${file.name})`,
      });
    } catch {
      setImportError('Failed to read the selected training schedule file.');
    }
  };

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

      {/* 7-Day FM27 Training Planner (Mon-Sun, 3 slots/day, Mobile Day-by-Day + fm27-trainer JSON/CSV Import) */}
      <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-2.5">
            <Calendar className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                7-Day Training Planner &amp; Recovery Periodisation (From {saveDate})
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {importedSchedule
                  ? `Active Custom Schedule: ${importedSchedule.sourceLabel}`
                  : `Auto-periodised from ${upcomingFixtures.length} upcoming fixtures · Playbook v2.0 Mandatory Post-Match Rest`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="fm27-trainer-import"
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/25 transition cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              Import fm27-trainer JSON/CSV
              <input
                id="fm27-trainer-import"
                type="file"
                accept=".json,.csv,.txt"
                onChange={handleImportTrainerFile}
                className="hidden"
              />
            </label>
            {importedSchedule && (
              <button
                type="button"
                onClick={() => {
                  setImportedSchedule(null);
                  setImportError(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Auto
              </button>
            )}
          </div>
        </div>

        {importError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {importError}
          </div>
        )}

        {/* Intensity & Fatigue Summary Bar */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <Activity className="h-4 w-4 text-emerald-400" />
              Weekly Intensity &amp; Fatigue Summary
            </div>
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                loadSummary.riskTier === 'Optimal / Low Injury Risk'
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : loadSummary.riskTier === 'Moderate Load'
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                    : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
              }`}
            >
              {loadSummary.riskTier} · Fatigue {loadSummary.fatigueIndex}/100
            </span>
          </div>

          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                loadSummary.fatigueIndex >= 72
                  ? 'bg-rose-500'
                  : loadSummary.fatigueIndex >= 52
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
              }`}
              style={{ width: `${loadSummary.fatigueIndex}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <div className="flex flex-wrap gap-3 font-mono">
              <span className="text-orange-300">High: {loadSummary.highCount}</span>
              <span className="text-sky-300">Med: {loadSummary.mediumCount}</span>
              <span className="text-teal-300">Low: {loadSummary.lowCount}</span>
              <span className="text-slate-300">Rest: {loadSummary.restCount}</span>
            </div>
            <span className="text-slate-400">{loadSummary.summaryNote}</span>
          </div>
        </div>

        {/* Mobile-Friendly Day-by-Day View (Pixel 10 Pro XL) */}
        <div className="md:hidden space-y-3">
          <div className="grid grid-cols-7 gap-1">
            {activeWeeklyDays.map((day, idx) => (
              <button
                key={day.dayShort}
                type="button"
                onClick={() => setSelectedMobileDay(idx)}
                className={`rounded-lg py-2 text-center text-[11px] font-bold transition cursor-pointer ${
                  selectedMobileDay === idx
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-950 text-slate-400 border border-slate-800'
                }`}
              >
                {day.dayShort}
              </button>
            ))}
          </div>

          {(() => {
            const activeDay = activeWeeklyDays[selectedMobileDay] ?? activeWeeklyDays[0];
            return (
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-white">
                      {activeDay.dayFull}
                      {activeDay.dateLabel ? ` · ${activeDay.dateLabel}` : ''}
                    </div>
                    {activeDay.fixtureContext && (
                      <div className="text-[11px] text-emerald-400 mt-0.5">
                        {activeDay.fixtureContext}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Previous day"
                      onClick={() =>
                        setSelectedMobileDay((d) => (d + 6) % 7)
                      }
                      className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-300"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next day"
                      onClick={() =>
                        setSelectedMobileDay((d) => (d + 1) % 7)
                      }
                      className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-300"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {activeDay.slots.map((slot, sIdx) => {
                    const style = CATEGORY_STYLES[slot.category];
                    const slotTitle =
                      sIdx === 0
                        ? 'Slot 1 (Morning)'
                        : sIdx === 1
                          ? 'Slot 2 (Afternoon)'
                          : 'Slot 3 (Extra / Rest)';
                    return (
                      <div
                        key={sIdx}
                        className={`rounded-lg border p-2.5 ${style.badge}`}
                      >
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider opacity-80">
                          <span>{slotTitle}</span>
                          <span>{style.label}</span>
                        </div>
                        <div className="mt-1 text-xs font-semibold">
                          {slot.label}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {activeDay.directive && (
                  <p className="text-[11px] text-slate-400 border-t border-slate-800 pt-2">
                    {activeDay.directive}
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        {/* Desktop 7-Column Mon-Sun Planner Grid */}
        <div className="hidden md:grid md:grid-cols-7 gap-2.5">
          {activeWeeklyDays.map((day) => (
            <div
              key={day.dayShort}
              className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5 flex flex-col gap-2"
            >
              <div className="border-b border-slate-800 pb-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    {day.dayShort}
                  </span>
                  {day.dateLabel && (
                    <span className="font-mono text-[10px] text-slate-400">
                      {day.dateLabel}
                    </span>
                  )}
                </div>
                {day.fixtureContext && (
                  <div
                    className="text-[10px] text-emerald-400 truncate mt-0.5"
                    title={day.fixtureContext}
                  >
                    {day.fixtureContext}
                  </div>
                )}
              </div>

              <div className="space-y-1.5 flex-1">
                {day.slots.map((slot, sIdx) => {
                  const style = CATEGORY_STYLES[slot.category];
                  return (
                    <div
                      key={sIdx}
                      className={`rounded-lg border px-2 py-2 text-[11px] leading-snug ${style.badge}`}
                    >
                      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider opacity-80 mb-0.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                        <span>{style.label}</span>
                      </div>
                      <div className="font-semibold break-words">{slot.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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
