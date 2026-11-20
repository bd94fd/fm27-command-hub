import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  HeartPulse,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import type { WorkspaceSnapshot } from '../domain/types';

interface LiveFmSaveProofCardProps {
  snapshot: WorkspaceSnapshot;
  onSelectPlayer?: (playerId: number) => void;
}

export function LiveFmSaveProofCard({ snapshot, onSelectPlayer }: LiveFmSaveProofCardProps) {
  const [showRawInspector, setShowRawInspector] = useState(false);

  const meta = snapshot.metadata;
  const managedClubLower = (meta.managedClubName || '').toLowerCase();

  const managedSquad = managedClubLower
    ? snapshot.players.filter(
        (p) =>
          p.playingClub.toLowerCase() === managedClubLower ||
          p.club.toLowerCase() === managedClubLower,
      )
    : snapshot.players;

  const topPlayers = [...managedSquad]
    .sort(
      (a, b) =>
        (b.seasonStats?.minutes ?? 0) - (a.seasonStats?.minutes ?? 0) ||
        (b.ca ?? 0) - (a.ca ?? 0),
    )
    .slice(0, 5);

  const upcomingFixtures = snapshot.fixtures
    .filter((f) => f.status === 'Upcoming')
    .slice(0, 5);
  const recentResults = snapshot.matchLogs.slice(0, 5);

  return (
    <section className="rounded-[8px] border border-emerald-500/40 bg-[#0d1f19]/85 p-5 space-y-4 shadow-lg">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-emerald-500/25 pb-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 min-w-0">
          <div className="inline-flex items-center gap-2 font-mono text-[12px] font-semibold text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="truncate">
              LIVE SAVE VERIFIED · {meta.saveName || meta.sourceLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-[#d4ced8]">
            <span>
              Game: <strong className="text-white">{meta.game ?? '--'}</strong> (Build{' '}
              <span className="font-mono">{meta.build ?? '--'}</span>)
            </span>
            <span className="text-[#6f6778]">·</span>
            <span>
              Save Date:{' '}
              <strong className="font-mono text-emerald-300">
                {meta.gameDateDmy || meta.gameDate || '--'}
              </strong>
            </span>
            <span className="text-[#6f6778]">·</span>
            <span>
              Club:{' '}
              <strong className="text-white">{meta.managedClubName || '--'}</strong>
              {meta.managerName ? ` (${meta.managerName})` : ''}
            </span>
            <span className="text-[#6f6778]">·</span>
            <span>
              Loaded: <strong className="text-white">{snapshot.players.length}</strong> players ·{' '}
              <strong className="text-white">{snapshot.matchLogs.length}</strong> results ·{' '}
              <strong className="text-white">{upcomingFixtures.length}</strong> upcoming
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowRawInspector((prev) => !prev)}
          className="inline-flex items-center gap-1.5 self-start rounded-[5px] border border-emerald-500/40 bg-[#121116] px-3 py-1.5 text-[12px] font-semibold text-emerald-200 hover:bg-[#1a2c26] cursor-pointer shrink-0 sm:self-center"
        >
          <Database className="h-3.5 w-3.5 text-emerald-400" />
          <span>
            {showRawInspector ? 'Hide Raw Snapshot Data' : 'Inspect Raw Decoded .fm Data'}
          </span>
          {showRawInspector ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Non-fatal parser warnings */}
      {meta.warnings && meta.warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-[6px] border border-amber-500/35 bg-amber-500/10 px-3.5 py-2 text-[11.5px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span>
            Non-fatal parser notes ({meta.fmsaveVersion ? `fmsave ${meta.fmsaveVersion}` : 'reader'}):{' '}
            {meta.warnings.join(' · ')}
          </span>
        </div>
      )}

      {/* 4-Column Save Proof Grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 text-[12px]">
        {/* 1. Top 5 League Table */}
        <div className="rounded-[6px] border border-[#2d4039] bg-[#0b1210]/90 p-3.5 space-y-2">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
            League Table{' '}
            {snapshot.leagueStanding
              ? `(${snapshot.leagueStanding.totalTeams} Teams)`
              : ''}
          </div>
          {snapshot.leagueStanding ? (
            <div className="space-y-1 font-mono text-[11px]">
              <div className="truncate text-[10.5px] text-[#9c92a6] pb-1">
                {snapshot.leagueStanding.competitionName}
              </div>
              {snapshot.leagueStanding.top5.map((row) => {
                const isOwn =
                  managedClubLower &&
                  row.club.toLowerCase().includes(managedClubLower.slice(0, 6));
                return (
                  <div
                    key={row.pos}
                    className={`flex items-center justify-between gap-2 ${
                      isOwn ? 'font-bold text-emerald-300' : 'text-[#d4ced8]'
                    }`}
                  >
                    <span className="truncate">
                      {row.pos}. {row.club}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {row.played}GP · {row.pts}pts ({row.gd >= 0 ? `+${row.gd}` : row.gd})
                    </span>
                  </div>
                );
              })}
              {snapshot.leagueStanding.position > 5 && (
                <div className="mt-1.5 flex items-center justify-between border-t border-[#263832] pt-1.5 font-bold text-emerald-300">
                  <span className="truncate">
                    {snapshot.leagueStanding.position}.{' '}
                    {meta.managedClubName || 'Managed Club'}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {snapshot.leagueStanding.played}GP · {snapshot.leagueStanding.points}pts (
                    {snapshot.leagueStanding.goalDiff >= 0
                      ? `+${snapshot.leagueStanding.goalDiff}`
                      : snapshot.leagueStanding.goalDiff}
                    )
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[11.5px] text-[#9c92a6]">
              No league standing table decoded in this snapshot.
            </div>
          )}
        </div>

        {/* 2. Last 5 Results */}
        <div className="rounded-[6px] border border-[#2d4039] bg-[#0b1210]/90 p-3.5 space-y-2">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
            Last 5 Results
          </div>
          {recentResults.length > 0 ? (
            <div className="space-y-1.5 font-mono text-[11px]">
              {recentResults.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 text-[#d4ced8]"
                >
                  <span className="truncate">
                    {m.date} {m.opponent} ({m.venue})
                  </span>
                  <span
                    className={`shrink-0 font-bold ${
                      m.result === 'W'
                        ? 'text-emerald-400'
                        : m.result === 'D'
                          ? 'text-amber-400'
                          : 'text-[#ff758b]'
                    }`}
                  >
                    {m.result} {m.score}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11.5px] text-[#9c92a6]">
              No completed match results decoded yet.
            </div>
          )}
        </div>

        {/* 3. Next 5 Upcoming Fixtures */}
        <div className="rounded-[6px] border border-[#2d4039] bg-[#0b1210]/90 p-3.5 space-y-2">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
            Next 5 Fixtures
          </div>
          {upcomingFixtures.length > 0 ? (
            <div className="space-y-1.5 font-mono text-[11px] text-[#d4ced8]">
              {upcomingFixtures.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    {f.kickoffDate} vs {f.opponent}
                  </span>
                  <span className="shrink-0 text-[#9c92a6]">
                    ({f.home ? 'H' : 'A'})
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11.5px] text-[#9c92a6]">
              No upcoming fixtures decoded.
            </div>
          )}
        </div>

        {/* 4. Top 5 Squad CA / PA */}
        <div className="rounded-[6px] border border-[#2d4039] bg-[#0b1210]/90 p-3.5 space-y-2">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
            Top 5 Squad (CA / PA)
          </div>
          {topPlayers.length > 0 ? (
            <div className="space-y-1.5 font-mono text-[11px] text-[#d4ced8]">
              {topPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2"
                >
                  {onSelectPlayer ? (
                    <button
                      type="button"
                      onClick={() => onSelectPlayer(p.id)}
                      className="truncate text-left hover:text-[#dc87ff] hover:underline cursor-pointer"
                    >
                      {p.name} ({p.ca ?? '--'}/{p.pa ?? '--'})
                    </button>
                  ) : (
                    <span className="truncate">
                      {p.name} ({p.ca ?? '--'}/{p.pa ?? '--'})
                    </span>
                  )}
                  <span className="shrink-0 tabular-nums text-emerald-300">
                    {p.seasonStats?.minutes != null ? `${p.seasonStats.minutes}m` : '--'} ·{' '}
                    {p.seasonStats?.rating != null ? p.seasonStats.rating.toFixed(2) : '--'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11.5px] text-[#9c92a6]">
              No squad players extracted yet.
            </div>
          )}
        </div>
      </div>

      {/* Active Injuries & Mentoring Groups Row */}
      {(snapshot.activeInjuries.length > 0 || snapshot.mentoring.length > 0) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-[6px] border border-[#39333f] bg-[#121116]/90 p-3.5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#ff8fa2]">
              <HeartPulse className="h-3.5 w-3.5" />
              <span>Active Injuries ({snapshot.activeInjuries.length})</span>
            </div>
            {snapshot.activeInjuries.length === 0 ? (
              <p className="text-[12px] text-[#9c92a6]">Zero active injuries recorded.</p>
            ) : (
              <ul className="space-y-1 text-[12px] text-[#d4ced8]">
                {snapshot.activeInjuries.slice(0, 6).map((inj, i) => (
                  <li key={`${inj.playerName ?? 'inj'}-${i}`} className="flex justify-between gap-2">
                    <span className="font-semibold text-white truncate">
                      {inj.playerName || `UID ${inj.playerUid ?? '--'}`}
                    </span>
                    <span className="text-[#ffb5c1] truncate">
                      {inj.typeName}
                      {inj.severity ? ` (${inj.severity})` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-[6px] border border-[#39333f] bg-[#121116]/90 p-3.5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#dc87ff]">
              <Users className="h-3.5 w-3.5" />
              <span>Mentoring Groups ({snapshot.mentoring.length})</span>
            </div>
            {snapshot.mentoring.length === 0 ? (
              <p className="text-[12px] text-[#9c92a6]">No active mentoring groups decoded.</p>
            ) : (
              <div className="space-y-1.5 text-[12px] text-[#d4ced8]">
                {snapshot.mentoring.map((mg) => (
                  <div key={mg.groupNumber} className="rounded bg-white/[0.03] px-2.5 py-1.5">
                    <span className="font-bold text-[#ecc2ff]">
                      {mg.label || `Group ${mg.groupNumber}`}:{' '}
                    </span>
                    <span>{mg.members.join(', ') || '--'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expandable Raw Decoded Inspector */}
      {showRawInspector && (
        <div className="rounded-[6px] border border-[#2d4039] bg-[#080d0c] p-3.5 space-y-2">
          <div className="font-mono text-[11px] text-[#9c92a6]">
            Raw normalized snapshot summary (100% read from your loaded file):
          </div>
          <pre className="max-h-72 overflow-auto font-mono text-[11px] leading-relaxed text-emerald-200/90 whitespace-pre-wrap break-words">
            {JSON.stringify(
              {
                metadata: meta,
                leagueStanding: snapshot.leagueStanding,
                finances: snapshot.finances,
                tacticsCount: snapshot.tactics.length,
                activeInjuries: snapshot.activeInjuries,
                mentoring: snapshot.mentoring,
                matchLogsPreview: snapshot.matchLogs.slice(0, 8),
                upcomingFixturesPreview: upcomingFixtures,
                playersCount: snapshot.players.length,
                playersSample: topPlayers.map((p) => ({
                  name: p.name,
                  pos: p.positionText,
                  age: p.age,
                  ca: p.ca,
                  pa: p.pa,
                  wagePw: p.wagePw,
                  expires: p.expires,
                  stats: p.seasonStats ?? null,
                })),
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </section>
  );
}
