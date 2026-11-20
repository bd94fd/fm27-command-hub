import { Activity, CloudUpload, FileArchive, Upload } from 'lucide-react';
import { computeCompetitiveSummary } from '../domain/fmEngine';
import type { LeagueStandingSummary, MatchLogEntry } from '../domain/types';

interface MatchLogArchiveProps {
  matches: MatchLogEntry[];
  saveStatus: 'awaiting_save' | 'loaded';
  saveLabel: string;
  leagueStanding: LeagueStandingSummary | null;
  onOpenLoadSave: () => void;
  onOpenSync: () => void;
}

export function MatchLogArchive({
  matches,
  saveStatus,
  saveLabel,
  leagueStanding,
  onOpenLoadSave,
  onOpenSync,
}: MatchLogArchiveProps) {
  const summary = computeCompetitiveSummary(matches);

  if (saveStatus === 'awaiting_save' && matches.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[8px] border border-dashed border-[#59515f] bg-[#14111a]/90 p-8 text-center">
        <div className="max-w-[520px] space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#734096] bg-[#34223f] text-[#dc87ff]">
            <FileArchive className="h-5 w-5" />
          </div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#dc87ff]">
            Awaiting .fm Save
          </div>
          <h3 className="fm-font-display text-[20px] font-bold text-white">
            Table 1G · Competitive Match Log Empty
          </h3>
          <p className="text-[13px] text-[#b2acbb]">
            Load your <code className="text-[#dc87ff]">.fm</code> save to extract match chronology,
            or attach Data Hub screenshots in AI &amp; Auto-Sync to populate xG, possession, shots,
            and tactical audits.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onOpenLoadSave}
              className="inline-flex h-[38px] items-center gap-2 rounded-[5px] bg-[#850be3] px-4 text-[13px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              <span>Load .fm Save</span>
            </button>
            <button
              type="button"
              onClick={onOpenSync}
              className="inline-flex h-[38px] items-center gap-2 rounded-[5px] border border-[#59515f] bg-[#202128] px-4 text-[13px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] cursor-pointer"
            >
              <CloudUpload className="h-4 w-4 text-emerald-400" />
              <span>Attach Match Screenshot</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-[8px] border border-[#39333f] bg-[#14111a] p-5 shrink-0 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            <h2 className="fm-font-display text-[17px] font-bold text-white">
              Table 1G · Competitive Match Log &amp; Data Hub Audit Archive
            </h2>
          </div>
          <p className="mt-1 text-[12px] text-[#b2acbb]">
            Source: {saveLabel} · Missing xG/possession metrics strictly display{' '}
            <code className="text-[#dc87ff]">--</code> until enriched via Data Hub screenshots.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 font-mono text-[12px] text-[#d4ced8]">
          <span className="rounded border border-[#39333f] bg-[#1b1623] px-3 py-1.5">
            Record:{' '}
            <strong className="text-white">
              {leagueStanding
                ? `${leagueStanding.played} GP (${leagueStanding.won}W-${leagueStanding.drawn}D-${leagueStanding.lost}L · ${leagueStanding.points} Pts)`
                : `${summary.played} GP (${summary.wins}W-${summary.draws}D-${summary.losses}L · ${summary.points} Pts)`}
            </strong>
          </span>

          <span className="rounded border border-[#39333f] bg-[#1b1623] px-3 py-1.5">
            xG ({summary.xgMatchesCount}m):{' '}
            <strong className="text-emerald-300">
              {summary.totalXgFor !== null && summary.totalXgAgainst !== null
                ? `${summary.totalXgFor.toFixed(2)} - ${summary.totalXgAgainst.toFixed(2)} (${
                    summary.xgDiff !== null && summary.xgDiff >= 0
                      ? `+${summary.xgDiff}`
                      : summary.xgDiff
                  })`
                : '--'}
            </strong>
          </span>

          <span className="rounded border border-[#39333f] bg-[#1b1623] px-3 py-1.5">
            Avg Poss:{' '}
            <strong className="text-white">
              {summary.avgPossession !== null ? `${summary.avgPossession}%` : '--'}
            </strong>
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[7px] border border-[#59515f] bg-[#100e14]">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="fm-grid-table w-full border-collapse text-[12px] text-[#f0edf4]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="h-[40px] px-3 text-left whitespace-nowrap">Event &amp; Date</th>
                <th className="h-[40px] px-3 text-left whitespace-nowrap">Fixture</th>
                <th className="h-[40px] px-3 text-left whitespace-nowrap">Result</th>
                <th className="h-[40px] px-3 text-right whitespace-nowrap">xG (Diff)</th>
                <th className="h-[40px] px-3 text-right whitespace-nowrap">Poss / Pass%</th>
                <th className="h-[40px] px-3 text-right whitespace-nowrap">Shots / CCC</th>
                <th className="h-[40px] px-3 text-left whitespace-nowrap">Goal Timeline &amp; POTM</th>
                <th className="h-[40px] px-3 text-left whitespace-nowrap">Tactical Audit</th>
              </tr>
            </thead>
            <tbody>
              {matches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-[13px] text-[#b2acbb]">
                    No completed fixtures recorded in this save yet.
                  </td>
                </tr>
              ) : (
                matches.map((m) => {
                  const hasXg =
                    typeof m.xGFor === 'number' && typeof m.xGAgainst === 'number';
                  const xgDelta = hasXg
                    ? Number(((m.xGFor ?? 0) - (m.xGAgainst ?? 0)).toFixed(2))
                    : null;
                  const resultColor =
                    m.result === 'W'
                      ? 'text-emerald-400'
                      : m.result === 'D'
                        ? 'text-amber-400'
                        : 'text-[#ff758b]';

                  return (
                    <tr key={m.id} className="border-b border-white/[0.04] align-top">
                      <td className="px-3 py-3 font-mono whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-bold text-white">
                          <span>Event #{m.eventNumber}</span>
                          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                            {m.source === 'FM_SAVE' ? '.FM' : m.source === 'EXPORT' ? 'EXP' : 'AI'}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#9c92a6]">{m.date || '--'}</div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="font-semibold text-white">
                          vs {m.opponent} ({m.venue})
                        </div>
                        <div className="text-[11px] text-[#9c92a6]">{m.competition}</div>
                      </td>
                      <td className={`px-3 py-3 font-mono font-bold whitespace-nowrap ${resultColor}`}>
                        {m.result} {m.score}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                        {hasXg ? (
                          <>
                            <div className="font-semibold text-white">
                              {(m.xGFor ?? 0).toFixed(2)} - {(m.xGAgainst ?? 0).toFixed(2)}
                            </div>
                            <div className="text-[11px] text-[#9c92a6]">
                              {xgDelta !== null && xgDelta >= 0 ? `+${xgDelta}` : xgDelta}
                            </div>
                          </>
                        ) : (
                          <span className="text-[#6f6778]">--</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                        {typeof m.possession === 'number' || typeof m.passCompletion === 'number'
                          ? `${m.possession ?? '--'}% / ${m.passCompletion ?? '--'}%`
                          : '--'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <div>
                          {m.shotsFor ? `${m.shotsFor} vs ${m.shotsAgainst ?? '--'}` : '--'}
                        </div>
                        {typeof m.cccFor === 'number' && (
                          <div className="text-[11px] text-[#9c92a6]">
                            CCC: {m.cccFor} - {m.cccAgainst ?? '--'}
                          </div>
                        )}
                      </td>
                      <td className="min-w-[190px] px-3 py-3 space-y-1">
                        <div className="text-[#d4ced8]">{m.goalTimeline ?? '--'}</div>
                        {m.potm && (
                          <div className="font-medium text-emerald-400">POTM: {m.potm}</div>
                        )}
                      </td>
                      <td className="min-w-[240px] px-3 py-3 space-y-1 text-[#b2acbb]">
                        {m.defensiveWatchpoints && <div>{m.defensiveWatchpoints}</div>}
                        <div className="text-[#d4ced8]">{m.tacticalAudit ?? '--'}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
