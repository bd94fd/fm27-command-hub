import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  AlertTriangle,
} from 'lucide-react';
import { HydratedSaveState } from '../utils/fmSaveHydrator';

interface LiveFmSaveProofCardProps {
  hydrated: HydratedSaveState;
}

export const LiveFmSaveProofCard: React.FC<LiveFmSaveProofCardProps> = ({
  hydrated,
}) => {
  const [showRawInspector, setShowRawInspector] = useState(false);
  const { decodedPayload: d } = hydrated;

  const topPlayers = [...d.players]
    .sort((a, b) => (b.minutes || 0) - (a.minutes || 0) || (b.ca || 0) - (a.ca || 0))
    .slice(0, 5);

  return (
    <section className="p-5 bg-emerald-950/30 border border-emerald-500/40 rounded-xl space-y-4">
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
              <strong className="text-white">{d.players.length} players</strong>,{' '}
              <strong className="text-white">
                {d.playedMatches.length} results
              </strong>
              ,{' '}
              <strong className="text-white">
                {d.upcomingFixtures.length} upcoming
              </strong>
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowRawInspector((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-200 bg-slate-900/90 hover:bg-slate-800 border border-emerald-500/40 rounded-lg cursor-pointer shrink-0 self-start sm:self-center"
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

      {d.warnings && d.warnings.length > 0 && (
        <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>
            Non-fatal table notes from fmsave {d.meta.fmsaveVersion}:{' '}
            {d.warnings.join(' · ')}
          </span>
        </div>
      )}

      {/* 4-Column Undeniable Save Proof Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
        {/* 1. Live League Table Top 5 */}
        <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
          <div className="font-mono text-[11px] uppercase tracking-wider text-emerald-400">
            Live League Table ({d.leagueStanding?.totalTeams || '?'} Teams)
          </div>
          {d.leagueStanding ? (
            <div className="space-y-1 font-mono text-[11px]">
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
            <div className="text-[11px] text-slate-400">
              No league table found in this save.
            </div>
          )}
        </div>

        {/* 2. Last 5 Played Results */}
        <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
          <div className="font-mono text-[11px] uppercase tracking-wider text-emerald-400">
            Last 5 Results (From .fm)
          </div>
          {d.playedMatches.length > 0 ? (
            <div className="space-y-1 font-mono text-[11px]">
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
            <div className="text-[11px] text-slate-400">
              No completed fixtures decoded.
            </div>
          )}
        </div>

        {/* 3. Next 5 Upcoming Fixtures */}
        <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
          <div className="font-mono text-[11px] uppercase tracking-wider text-emerald-400">
            Next 5 Fixtures (From {hydrated.saveDateLabel})
          </div>
          {d.upcomingFixtures.length > 0 ? (
            <div className="space-y-1 font-mono text-[11px] text-slate-300">
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
            <div className="text-[11px] text-slate-400">
              No upcoming fixtures decoded.
            </div>
          )}
        </div>

        {/* 4. Top 5 Synced Players (Season Stats) */}
        <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
          <div className="font-mono text-[11px] uppercase tracking-wider text-emerald-400">
            Top 5 Active Players (Live Season Output)
          </div>
          {topPlayers.length > 0 ? (
            <div className="space-y-1 font-mono text-[11px] text-slate-300">
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
            <div className="text-[11px] text-slate-400">
              No players extracted for club UID {d.meta.clubUid ?? 'unknown'}.
            </div>
          )}
        </div>
      </div>

      {/* Expandable Raw Decoded Payload Inspector */}
      {showRawInspector && (
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
          <div className="text-[11px] font-mono text-slate-400">
            Raw decoded output from local fmsave {d.meta.fmsaveVersion} WebAssembly reader (100% read directly from your .fm file):
          </div>
          <pre className="max-h-72 overflow-auto text-[11px] font-mono text-emerald-200/90 leading-relaxed whitespace-pre-wrap break-words">
            {JSON.stringify(
              {
                meta: d.meta,
                leagueStanding: d.leagueStanding,
                finances: d.finances,
                tactics: d.tactics,
                activeInjuries: d.activeInjuries,
                mentoring: d.mentoring,
                playedMatches: d.playedMatches,
                upcomingFixtures: d.upcomingFixtures,
                playersSampleCount: d.players.length,
                staffSampleCount: (d.staff || []).length,
                playersPreview: d.players.slice(0, 10).map((p) => ({
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
                })),
                warnings: d.warnings || [],
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
