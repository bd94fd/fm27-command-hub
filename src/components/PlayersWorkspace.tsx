import { Activity, FileArchive, Grid, Search, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatMoney, formatWage, wagePeriodSuffix } from '../domain/filters';
import { computeFm27EngineMetrics } from '../domain/fmEngine';
import type { AppSettings, PlayerRecord } from '../domain/types';
import { DataTable, type TableColumn } from './DataTable';

interface PlayersWorkspaceProps {
  players: PlayerRecord[];
  totalPlayersInSnapshot: number;
  managedClubName: string | null;
  saveStatus: 'awaiting_save' | 'loaded';
  settings: AppSettings;
  onSelectPlayer: (player: PlayerRecord) => void;
  onOpenLoadSave: () => void;
}

export function PlayersWorkspace({
  players,
  totalPlayersInSnapshot,
  managedClubName,
  saveStatus,
  settings,
  onSelectPlayer,
  onOpenLoadSave,
}: PlayersWorkspaceProps) {
  const [viewMode, setViewMode] = useState<'scouting' | 'analytics'>('scouting');
  const [quickSearch, setQuickSearch] = useState('');
  const [clubScope, setClubScope] = useState<'all' | 'managed'>('all');
  const [sortBy, setSortBy] = useState<'rating' | 'xGI' | 'speed' | 'ca' | 'wage'>('rating');

  const scoutingColumns = useMemo<TableColumn<PlayerRecord>[]>(
    () => [
      {
        key: 'name',
        header: 'Name',
        minWidth: '185px',
        sortValue: (p) => p.name,
        render: (p) => p.name,
      },
      {
        key: 'age',
        header: 'Age',
        sortValue: (p) => p.age,
        render: (p) => (p.age !== null ? p.age : '--'),
      },
      {
        key: 'heightCm',
        header: 'Height',
        sortValue: (p) => p.heightCm,
        render: (p) => (p.heightCm !== null ? `${p.heightCm} cm` : '--'),
      },
      {
        key: 'nationality',
        header: 'Nationality',
        minWidth: '120px',
        sortValue: (p) => p.nationality,
        render: (p) => p.nationality ?? '--',
      },
      {
        key: 'club',
        header: 'Club',
        minWidth: '130px',
        sortValue: (p) => p.club,
        render: (p) => p.club || 'Free Agent',
        cellClassName: (p) =>
          p.club && p.playingClub && p.club !== p.playingClub ? 'fm-loan-out-cell' : '',
      },
      {
        key: 'playingClub',
        header: 'Playing Club',
        minWidth: '130px',
        sortValue: (p) => p.playingClub,
        render: (p) => p.playingClub || 'Free Agent',
        cellClassName: (p) =>
          p.club && p.playingClub && p.club !== p.playingClub ? 'fm-loan-in-cell' : '',
      },
      {
        key: 'position',
        header: 'Position',
        minWidth: '115px',
        sortValue: (p) => p.positionText,
        render: (p) => p.positionText || '--',
      },
      {
        key: 'ca',
        header: 'CA',
        align: 'right',
        sortValue: (p) => p.ca,
        render: (p) => (p.ca !== null ? p.ca : '--'),
      },
      {
        key: 'pa',
        header: 'PA',
        align: 'right',
        sortValue: (p) => p.pa,
        render: (p) => (p.pa !== null ? p.pa : '--'),
      },
      {
        key: 'salary',
        header: `Wage (${wagePeriodSuffix(settings)})`,
        align: 'right',
        sortValue: (p) => p.wagePw,
        render: (p) => formatWage(p.wagePw, settings),
      },
      {
        key: 'askingPrice',
        header: 'Asking / Value',
        align: 'right',
        sortValue: (p) => p.askingPrice ?? p.estimatedValue,
        render: (p) => formatMoney(p.askingPrice ?? p.estimatedValue, settings),
      },
      {
        key: 'contractEnd',
        header: 'Expires',
        sortValue: (p) => p.contractEnd ?? p.expires ?? '',
        render: (p) => p.contractEnd ?? p.expires ?? '--',
      },
      {
        key: 'status',
        header: 'Status',
        sortValue: (p) =>
          p.injured ? 'Injured' : p.transferListed ? 'Listed' : p.listedForLoan ? 'Loan' : '',
        render: (p) =>
          p.injured ? (
            <span className="rounded bg-[#40212b] px-2 py-0.5 text-[11px] font-bold text-[#ff8fa2]">
              Inj
            </span>
          ) : p.transferListed ? (
            <span className="rounded bg-[#34223f] px-2 py-0.5 text-[11px] font-bold text-[#dc87ff]">
              Lst
            </span>
          ) : p.listedForLoan ? (
            <span className="rounded bg-[#192d41] px-2 py-0.5 text-[11px] font-bold text-[#85d0ff]">
              Loan
            </span>
          ) : (
            <span className="text-[#6f6778]">--</span>
          ),
      },
    ],
    [settings],
  );

  const visiblePlayers = useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    const clubLower = (managedClubName || '').toLowerCase();

    return players
      .filter((p) => {
        if (clubScope === 'managed' && clubLower) {
          const matchesClub =
            p.playingClub.toLowerCase() === clubLower || p.club.toLowerCase() === clubLower;
          if (!matchesClub) return false;
        }
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.positionText.toLowerCase().includes(q) ||
          p.club.toLowerCase().includes(q) ||
          p.playingClub.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (viewMode === 'scouting') return 0; // DataTable handles sorting in scouting mode
        if (sortBy === 'rating') {
          return (b.seasonStats?.rating ?? -1) - (a.seasonStats?.rating ?? -1);
        }
        if (sortBy === 'xGI') {
          const bx = (b.seasonStats?.xG ?? 0) + (b.seasonStats?.xA ?? 0);
          const ax = (a.seasonStats?.xG ?? 0) + (a.seasonStats?.xA ?? 0);
          return bx - ax;
        }
        if (sortBy === 'speed') {
          const bs = (b.attributes.pace ?? 0) + (b.attributes.acceleration ?? 0);
          const as = (a.attributes.pace ?? 0) + (a.attributes.acceleration ?? 0);
          return bs - as;
        }
        if (sortBy === 'ca') {
          return (b.ca ?? -1) - (a.ca ?? -1);
        }
        return (b.wagePw ?? -1) - (a.wagePw ?? -1);
      });
  }, [players, quickSearch, clubScope, managedClubName, viewMode, sortBy]);

  if (saveStatus === 'awaiting_save' && totalPlayersInSnapshot === 0) {
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
            No Squad or Scouting Players Loaded
          </h3>
          <p className="text-[13px] text-[#b2acbb]">
            Load an FM27 <code className="text-[#dc87ff]">.fm</code> save file or import a{' '}
            <code className="text-[#d4ced8]">.csv</code> /{' '}
            <code className="text-[#d4ced8]">.html</code> /{' '}
            <code className="text-[#d4ced8]">.rtf</code> squad export to inspect 59 attributes,
            Patch 27.1.0 speed/jump metrics, and Data Hub per-90 output.
          </p>
          <button
            type="button"
            onClick={onOpenLoadSave}
            className="mt-2 inline-flex h-[38px] items-center gap-2 rounded-[5px] bg-[#850be3] px-4 text-[13px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            <span>Load .fm Save / Export</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Toolbar: View Switcher + Quick Search + Scope */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[7px] border border-[#39333f] bg-[#14111a] px-4 py-2.5 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-[5px] border border-[#39333f] bg-[#0e0c12] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('scouting')}
              className={`inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-[12px] font-semibold transition-colors cursor-pointer ${
                viewMode === 'scouting'
                  ? 'bg-[#34223f] text-[#ecc2ff]'
                  : 'text-[#b2acbb] hover:text-white'
              }`}
            >
              <Grid className="h-3.5 w-3.5" />
              <span>Scouting Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('analytics')}
              className={`inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-[12px] font-semibold transition-colors cursor-pointer ${
                viewMode === 'analytics'
                  ? 'bg-[#142c21] text-emerald-300'
                  : 'text-[#b2acbb] hover:text-white'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Analytics &amp; Patch 27.1.0 Physics</span>
            </button>
          </div>

          {managedClubName && (
            <div className="flex items-center rounded-[5px] border border-[#39333f] bg-[#0e0c12] p-0.5">
              <button
                type="button"
                onClick={() => setClubScope('all')}
                className={`rounded-[4px] px-2.5 py-1 text-[11.5px] font-semibold cursor-pointer ${
                  clubScope === 'all'
                    ? 'bg-[#251f2d] text-white'
                    : 'text-[#9c92a6] hover:text-white'
                }`}
              >
                All ({players.length})
              </button>
              <button
                type="button"
                onClick={() => setClubScope('managed')}
                className={`rounded-[4px] px-2.5 py-1 text-[11.5px] font-semibold cursor-pointer ${
                  clubScope === 'managed'
                    ? 'bg-[#251f2d] text-[#dc87ff]'
                    : 'text-[#9c92a6] hover:text-white'
                }`}
              >
                {managedClubName}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9c92a6]" />
            <input
              type="text"
              aria-label="Quick search players"
              placeholder="Search name, pos, club…"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              className="h-[32px] w-[200px] rounded-[5px] border border-[#59515f] bg-[#202128] pl-8 pr-2.5 text-[12px] text-[#f0edf4] placeholder:text-[#8e8598] focus:border-[#dc87ff] focus:outline-none"
            />
          </div>

          {viewMode === 'analytics' && (
            <select
              aria-label="Sort analytics view"
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as 'rating' | 'xGI' | 'speed' | 'ca' | 'wage')
              }
              className="h-[32px] rounded-[5px] border border-[#59515f] bg-[#202128] px-2.5 text-[12px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
            >
              <option value="rating">Sort: Match Rating</option>
              <option value="xGI">Sort: xG + xA</option>
              <option value="speed">Sort: Top Speed (Pac+Acc)</option>
              <option value="ca">Sort: Current Ability</option>
              <option value="wage">Sort: Weekly Wage</option>
            </select>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1">
        {viewMode === 'scouting' ? (
          <DataTable
            rows={visiblePlayers}
            columns={scoutingColumns}
            rowKey={(p) => p.id}
            defaultSortKey="ca"
            defaultSortDir="desc"
            onRowClick={onSelectPlayer}
            emptyMessage="No players match the current filters."
          />
        ) : (
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[7px] border border-[#59515f] bg-[#100e14]">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="fm-grid-table w-full border-collapse text-[12px] text-[#f0edf4]">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="h-[40px] px-3 text-left whitespace-nowrap">Player &amp; Club</th>
                    <th className="h-[40px] px-2 text-left whitespace-nowrap">Pos</th>
                    <th className="h-[40px] px-2 text-right whitespace-nowrap">CA / PA</th>
                    <th className="h-[40px] px-2 text-right whitespace-nowrap">Cond / Shp</th>
                    <th className="h-[40px] px-2 text-right whitespace-nowrap">Apps (Mins)</th>
                    <th className="h-[40px] px-2 text-right whitespace-nowrap">Rating</th>
                    <th className="h-[40px] px-2 text-right whitespace-nowrap">G (xG) / 90</th>
                    <th className="h-[40px] px-2 text-right whitespace-nowrap">A (xA) / 90</th>
                    <th className="h-[40px] px-2 text-right whitespace-nowrap">Drb / PrP /90</th>
                    <th className="h-[40px] px-2 text-right whitespace-nowrap">Hdr% / Int / Tck%</th>
                    <th className="h-[40px] px-2 text-right whitespace-nowrap">Pac/Acc/Sta/JR</th>
                    <th className="h-[40px] px-3 text-right whitespace-nowrap">
                      Speed / Jump (27.1.0)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlayers.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-[#b2acbb]">
                        No players match the current filters.
                      </td>
                    </tr>
                  ) : (
                    visiblePlayers.map((p) => {
                      const engine = computeFm27EngineMetrics(p);
                      const ss = p.seasonStats;
                      return (
                        <tr
                          key={p.id}
                          onClick={() => onSelectPlayer(p)}
                          className="cursor-pointer border-b border-white/[0.04]"
                        >
                          <td className="h-[38px] px-3 max-w-[230px]">
                            <div className="truncate font-semibold text-[#faf5fc]">{p.name}</div>
                            <div className="truncate text-[10.5px] text-[#9c92a6]">
                              {p.playingClub || p.club || 'Free Agent'}
                              {p.injured ? ' · Injured' : ''}
                            </div>
                          </td>
                          <td className="px-2 font-mono whitespace-nowrap">
                            {p.positionText || '--'}
                          </td>
                          <td className="px-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {p.ca ?? '--'}/{p.pa ?? '--'}
                          </td>
                          <td className="px-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {p.condition !== null ? `${p.condition}%` : '--'} /{' '}
                            {p.sharpness !== null ? `${p.sharpness}%` : '--'}
                          </td>
                          <td className="px-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {ss?.apps ?? '--'} ({ss?.minutes !== null && ss?.minutes !== undefined ? `${ss.minutes}m` : '--'})
                          </td>
                          <td className="px-2 text-right font-mono font-bold tabular-nums text-emerald-400">
                            {ss?.rating != null ? ss.rating.toFixed(2) : '--'}
                          </td>
                          <td className="px-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {ss?.goals ?? '--'} ({ss?.xG != null ? ss.xG.toFixed(2) : '--'}) ·{' '}
                            {ss?.xGPer90 != null ? ss.xGPer90.toFixed(2) : '--'}
                          </td>
                          <td className="px-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {ss?.assists ?? '--'} ({ss?.xA != null ? ss.xA.toFixed(2) : '--'}) ·{' '}
                            {ss?.xAPer90 != null ? ss.xAPer90.toFixed(2) : '--'}
                          </td>
                          <td className="px-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {ss?.drbPer90 != null ? ss.drbPer90.toFixed(2) : '--'} /{' '}
                            {ss?.prPassesPer90 != null ? ss.prPassesPer90.toFixed(2) : '--'}
                          </td>
                          <td className="px-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {ss?.hdrPct != null ? `${ss.hdrPct}%` : '--'} /{' '}
                            {ss?.intPer90 != null ? ss.intPer90.toFixed(2) : '--'} /{' '}
                            {ss?.tckPct != null ? `${ss.tckPct}%` : '--'}
                          </td>
                          <td className="px-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {p.attributes.pace ?? '--'}/{p.attributes.acceleration ?? '--'}/
                            {p.attributes.stamina ?? '--'}/{p.attributes.jumping_reach ?? '--'}
                          </td>
                          <td className="px-3 text-right font-mono tabular-nums text-emerald-300 whitespace-nowrap">
                            {engine.topSpeedMps !== null ? `${engine.topSpeedMps} m/s` : '--'} /{' '}
                            {engine.jumpHeightMeters !== null
                              ? `+${engine.jumpHeightMeters} m`
                              : '--'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
