import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import type { HydratedSaveState } from '../utils/fmSaveHydrator';
import { formatStepTimingLabel } from '../utils/fmSaveUiHelpers';
import { sanitizeReaderNotes } from '../utils/apiResponse';

interface LiveFmSaveProofCardProps {
  hydrated: HydratedSaveState;
}

export const LiveFmSaveProofCard: React.FC<LiveFmSaveProofCardProps> = ({
  hydrated,
}) => {
  const [showRawInspector, setShowRawInspector] = useState(false);
  const [showReaderNotes, setShowReaderNotes] = useState(false);
  const { decodedPayload: d } = hydrated;

  const topPlayers = [...hydrated.updatedSquad]
    .sort(
      (a, b) =>
        (b.minutes || 0) - (a.minutes || 0) ||
        (b.ability || 0) - (a.ability || 0) ||
        (b.rating || 0) - (a.rating || 0)
    )
    .slice(0, 5);

  const staffCount = (d.staff || []).length;
  const targetsCount = (hydrated.recruitmentTargets || d.recruitmentTargets || []).length;
  const firstTeamCount = d.players.filter((p) => !p.teamSlot || p.teamSlot === 0).length;
  const youthCount = d.players.length - firstTeamCount;
  const playersWithSeasonStats = hydrated.updatedSquad.filter((p) => (p.minutes || 0) > 0).length;
  const matchesWithXg = d.playedMatches.filter((m) => m.xGFor !== null && m.xGFor !== undefined).length;
  const removedPlayers = hydrated.removedPlayers || [];
  const runway = hydrated.financialRunway || null;
  const stepTimings =
    hydrated.stepTimingsMs && Object.keys(hydrated.stepTimingsMs).length > 0
      ? hydrated.stepTimingsMs
      : d.stepTimingsMs || {};
  const timingEntries = Object.entries(stepTimings).filter(
    ([, ms]) => typeof ms === 'number' && Number.isFinite(ms)
  );
  const rawWarningsList =
    hydrated.extractionWarnings && hydrated.extractionWarnings.length > 0
      ? hydrated.extractionWarnings
      : d.extractionWarnings || d.warnings || [];
  const warningsList = sanitizeReaderNotes(rawWarningsList);

  const isPreSeasonSnapshot =
    !hydrated.fastSync &&
    d.playedMatches.length === 0 &&
    (d.leagueStanding?.played ?? 0) === 0;

  const healthChecks = [
    { label: 'Squad', ok: d.players.length > 0, detail: `${d.players.length}` },
    {
      label: 'Season Stats',
      ok: playersWithSeasonStats > 0 || isPreSeasonSnapshot,
      detail:
        playersWithSeasonStats > 0
          ? `${playersWithSeasonStats}`
          : isPreSeasonSnapshot
            ? 'Pre-season (0 GP)'
            : hydrated.fastSync
              ? 'Skipped (Fast Sync)'
              : '0',
    },
    {
      label: 'Results',
      ok: d.playedMatches.length > 0 || isPreSeasonSnapshot,
      detail:
        d.playedMatches.length > 0
          ? `${d.playedMatches.length}`
          : isPreSeasonSnapshot
            ? '0 GP'
            : '0',
    },
    { label: 'Staff', ok: staffCount > 0, detail: `${staffCount}` },
    { label: 'Finances', ok: Boolean(runway || d.finances), detail: runway ? runway.status : d.finances ? 'OK' : '—' },
    { label: 'Recruitment', ok: targetsCount > 0, detail: targetsCount > 0 ? `${targetsCount}` : '0' },
  ];

  return (
    <section className="p-5 bg-emerald-950/30 border border-emerald-500/40 rounded-xl space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {healthChecks.map((item) => (
          <span
            key={item.label}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-mono border ${
              item.ok
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                : 'bg-amber-500/15 border-amber-500/35 text-amber-300'
            }`}
          >
            <span>{item.ok ? '✓' : '⚠'}</span>
            <span>{item.label}:</span>
            <strong className="text-white">{item.detail}</strong>
          </span>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-emerald-500/25">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              LIVE .FM SAVE VERIFIED · {d.meta.fileName || d.meta.saveName || 'Loaded Save'}
              {d.meta.fileSizeMb ? ` (${d.meta.fileSizeMb} MB)` : ''}
            </span>
          </div>
          <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              Game: <strong className="text-white">{d.meta.game}</strong> (Build{' '}
              <span className="font-mono">{d.meta.build}</span>)
            </span>
            <span>&middot;</span>
            <span>
              Exact Save Date:{' '}
              <strong className="font-mono text-emerald-300">
                {hydrated.saveDateLabel}
              </strong>
            </span>
            <span>&middot;</span>
            <span>
              Club: <strong className="text-white">{d.meta.clubName}</strong> (
              {d.meta.managerName})
            </span>
            <span>&middot;</span>
            <span>
              Extracted:{' '}
              <strong className="text-white">
                {firstTeamCount} First Team{youthCount > 0 ? ` + ${youthCount} Youth` : ''}
              </strong>
              ,{' '}
              <strong className="text-white">
                {playersWithSeasonStats} w/ season stats
              </strong>
              ,{' '}
              <strong className="text-white">
                {d.playedMatches.length} results{matchesWithXg > 0 ? ` (${matchesWithXg} w/ xG)` : ''}
              </strong>
              ,{' '}
              <strong className="text-white">
                {d.upcomingFixtures.length} upcoming
              </strong>
              {staffCount > 0 && (
                <>
                  , <strong className="text-white">{staffCount} staff</strong>
                </>
              )}
              {targetsCount > 0 && (
                <>
                  , <strong className="text-emerald-300">{targetsCount} scouted targets</strong>
                </>
              )}
            </span>
            {runway && (
              <>
                <span>&middot;</span>
                <span
                  className={`font-mono font-semibold ${
                    runway.status === 'Critical'
                      ? 'text-rose-300'
                      : runway.status === 'Warning'
                        ? 'text-amber-300'
                        : 'text-emerald-300'
                  }`}
                >
                  Runway: {runway.status}
                  {runway.runwayMonths < 999 ? ` (${runway.runwayMonths}m)` : ' (Positive)'}
                </span>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowRawInspector((prev) => !prev)}
          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 text-xs font-semibold text-emerald-200 bg-slate-900/95 hover:bg-slate-800 border border-emerald-500/40 rounded-lg cursor-pointer shrink-0 self-start sm:self-center"
        >
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            {showRawInspector
              ? 'Hide Raw Decoded .fm Data'
              : 'Inspect Raw Decoded .fm Data'}
          </span>
          {showRawInspector ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {removedPlayers.length > 0 && (
        <div className="px-3 py-2 rounded-lg bg-slate-900/95 border border-slate-700 text-micro text-slate-300 flex flex-wrap items-center gap-2">
          <span className="font-mono font-semibold uppercase tracking-wider text-amber-300">
            Squad Sync Diff:
          </span>
          <span>
            {removedPlayers.length} player{removedPlayers.length === 1 ? '' : 's'} no longer at club removed during UID-first hydration:
          </span>
          <span className="font-mono text-slate-200">
            {removedPlayers
              .slice(0, 6)
              .map((p) => p.name)
              .join(', ')}
            {removedPlayers.length > 6 ? ` +${removedPlayers.length - 6} more` : ''}
          </span>
        </div>
      )}

      {timingEntries.length > 0 && (
        <div className="px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-micro flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1 font-mono font-semibold uppercase tracking-wider text-emerald-400">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            Decode Timings{hydrated.fastSync ? ' (Fast Sync)' : ''}:
          </span>
          {timingEntries.map(([stepKey, ms]) => {
            const isTotal = stepKey === 'totalDecodeMs';
            const isSlow = !isTotal && ms >= 5000;
            return (
              <span
                key={stepKey}
                className={`font-mono tabular-nums ${
                  isSlow
                    ? 'text-amber-300 font-semibold'
                    : isTotal
                      ? 'text-emerald-300 font-bold'
                      : 'text-slate-300'
                }`}
              >
                {formatStepTimingLabel(stepKey)}:{' '}
                {ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`}
              </span>
            );
          })}
        </div>
      )}

      {warningsList.length > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowReaderNotes((prev) => !prev)}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-md bg-slate-800/70 hover:bg-slate-800 border border-slate-700 text-micro font-medium text-slate-300 transition cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Save Reader Info ({warningsList.length})</span>
            {showReaderNotes ? (
              <ChevronUp className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            )}
          </button>
          {showReaderNotes && (
            <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-micro text-amber-200/90">
              <ul className="list-disc pl-4 space-y-0.5">
                {warningsList.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 4-Column Undeniable Save Proof Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
        {/* 1. Live League Table Top 5 */}
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
          <div className="font-mono text-micro uppercase tracking-wider text-emerald-400">
            Live League Table ({d.leagueStanding?.totalTeams || '?'} Teams)
          </div>
          {d.leagueStanding ? (
            <div className="space-y-1 font-mono text-micro">
              {d.leagueStanding.top5.map((row) => (
                <div
                  key={row.pos}
                  className={`flex items-center justify-between gap-2 ${
                    row.club
                      .toLowerCase()
                      .includes(d.meta.clubName.toLowerCase().slice(0, 6))
                      ? 'text-emerald-300 font-bold'
                      : 'text-slate-300'
                  }`}
                >
                  <span className="truncate">
                    {row.pos}. {row.club}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {row.played}GP · {row.pts}pts ({row.gd >= 0 ? `+${row.gd}` : row.gd})
                  </span>
                </div>
              ))}
              {d.leagueStanding.position > 5 && (
                <div className="pt-1 mt-1 border-t border-slate-800 flex items-center justify-between text-emerald-300 font-bold">
                  <span className="truncate">
                    {d.leagueStanding.position}. {d.meta.clubName}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {d.leagueStanding.played}GP · {d.leagueStanding.points}pts (
                    {d.leagueStanding.goalDiff >= 0
                      ? `+${d.leagueStanding.goalDiff}`
                      : d.leagueStanding.goalDiff}
                    )
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-micro text-slate-400">
              No league table found in this save.
            </div>
          )}
        </div>

        {/* 2. Last 5 Played Results */}
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
          <div className="font-mono text-micro uppercase tracking-wider text-emerald-400">
            Last 5 Results (From .fm)
          </div>
          {d.playedMatches.length > 0 ? (
            <div className="space-y-1 font-mono text-micro">
              {d.playedMatches.slice(0, 5).map((m, idx) => (
                <div
                  key={`${m.dateDmy}-${m.opponent}-${idx}`}
                  className="flex items-center justify-between gap-2 text-slate-300"
                >
                  <span className="truncate">
                    {m.dateDmy} {m.opponent} ({m.venue})
                  </span>
                  <span
                    className={`shrink-0 font-bold ${
                      m.result === 'W'
                        ? 'text-emerald-400'
                        : m.result === 'D'
                          ? 'text-amber-400'
                          : 'text-red-400'
                    }`}
                  >
                    {m.result} {m.score}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-micro text-slate-400">
              No completed fixtures decoded.
            </div>
          )}
        </div>

        {/* 3. Next 5 Upcoming Fixtures */}
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
          <div className="font-mono text-micro uppercase tracking-wider text-emerald-400">
            Next 5 Fixtures (From {hydrated.saveDateLabel})
          </div>
          {d.upcomingFixtures.length > 0 ? (
            <div className="space-y-1 font-mono text-micro text-slate-300">
              {d.upcomingFixtures.slice(0, 5).map((f, idx) => (
                <div
                  key={`${f.dateDmy}-${f.opponent}-${idx}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    {f.dateDmy} vs {f.opponent}
                  </span>
                  <span className="shrink-0 text-slate-400">({f.venue})</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-micro text-slate-400">
              No upcoming fixtures decoded.
            </div>
          )}
        </div>

        {/* 4. Top 5 Synced Players (Season Stats) */}
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
          <div className="font-mono text-micro uppercase tracking-wider text-emerald-400">
            Top 5 Active Players (Live Season Output)
          </div>
          {topPlayers.length > 0 ? (
            <div className="space-y-1 font-mono text-micro text-slate-300">
              {topPlayers.map((p) => (
                <div
                  key={p.uid}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    {p.name} ({p.position})
                  </span>
                  <span className="shrink-0 tabular-nums text-emerald-300">
                    {p.minutes}m · {p.goals}G/{p.assists}A ·{' '}
                    {p.rating ? p.rating.toFixed(2) : '-'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-micro text-slate-400">
              No players extracted for club UID {d.meta.clubUid ?? 'unknown'}.
            </div>
          )}
        </div>
      </div>

      {/* Expandable Raw Decoded Payload Inspector */}
      {showRawInspector && (
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
          <div className="text-micro font-mono text-slate-400">
            Raw decoded output from local fmsave {d.meta.fmsaveVersion} WebAssembly reader (100% read directly from your .fm file · Zero raw CA/PA exposed):
          </div>
          <pre className="max-h-72 overflow-auto text-micro font-mono text-emerald-200/90 leading-relaxed whitespace-pre-wrap break-words">
            {JSON.stringify(
              {
                meta: d.meta,
                leagueStanding: d.leagueStanding,
                finances: d.finances,
                financialRunway: runway,
                monthlyFinancesCount: (d.monthlyFinances || []).length,
                facilities: d.facilities || null,
                transferWindows: d.transferWindows || null,
                jobVacancies: d.jobVacancies || [],
                tactics: d.tactics,
                activeInjuries: d.activeInjuries,
                mentoring: d.mentoring,
                playedMatches: d.playedMatches,
                upcomingFixtures: d.upcomingFixtures,
                playersSampleCount: d.players.length,
                removedPlayers: removedPlayers.map((p) => ({
                  uid: p.uid ?? null,
                  name: p.name,
                  position: p.position,
                })),
                staffSampleCount: staffCount,
                recruitmentTargetsCount: targetsCount,
                playersPreview: d.players.slice(0, 10).map((p) => ({
                  uid: p.uid,
                  name: p.name,
                  pos: p.position,
                  age: p.age,
                  wagePw: p.wagePw,
                  expires: p.expires,
                  mins: p.minutes,
                  goals: p.goals,
                  xG: p.xG,
                  assists: p.assists,
                  rating: p.rating,
                  scoutBadges: p.scoutBadges || [],
                  traitsCount: (p.traits || []).length,
                })),
                stepTimingsMs: stepTimings,
                warnings: warningsList,
              },
              null,
              2
            )}
          </pre>
        </div>
      )}
    </section>
  );
};
