import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  Clock,
  Layers,
  Search,
  Star,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { EmptyStatePanel } from './EmptyStatePanel';
import { EMPTY_STATES } from '../utils/emptyStateCopy';
import { StaffRecord } from '../types/fm27';
import { formatContractExpiry, formatWeeklyWage } from '../utils/squadViewHelpers';
import { JobVacancyEntry } from '../types/fmSave';
import { normalizeJobVacancy } from '../utils/jobVacancies';
import {
  buildUnifiedStaffMatrix,
  classifyStaffDepartment,
  computeStaffKpiSummary,
  formatStars,
  getStaffHeadlineDisplay,
  isStaffContractExpiringSoon,
  StaffDepartmentGroup,
  StaffKpiSummary,
} from '../utils/staffRatings';

interface StaffDirectoryProps {
  staff: StaffRecord[];
  clubName?: string;
  saveDate?: string;
  jobVacancies?: JobVacancyEntry[];
  onSelectStaff: (member: StaffRecord) => void;
  onRequestImport?: () => void;
}

type StaffDirectoryView = 'directory' | 'matrix';
type StaffDirectoryFilter = 'all' | StaffDepartmentGroup | 'expiring';

const FILTER_ORDER: StaffDirectoryFilter[] = [
  'all',
  'coaching',
  'scouting',
  'medical',
  'board',
  'expiring',
];

const StaffKpiStrip: React.FC<{ kpi: StaffKpiSummary }> = ({ kpi }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 leading-tight">
        <UserCheck className="h-3.5 w-3.5 text-sky-400 shrink-0" />
        <span>Total Staff</span>
      </div>
      <div className="mt-1 font-mono text-xl font-bold text-white tabular-nums">
        {kpi.totalStaff}
      </div>
    </div>
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 leading-tight">
        <Wallet className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        <span>Weekly Staff Payroll</span>
      </div>
      <div className="mt-1 font-mono text-sm font-bold text-emerald-300 break-words tabular-nums">
        {kpi.weeklyPayrollLabel}
      </div>
    </div>
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 leading-tight">
        <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span>Expiring Soon</span>
      </div>
      <div className="mt-1 font-mono text-xl font-bold text-amber-300 tabular-nums">
        {kpi.expiringSoonCount}
      </div>
      <div className="text-[11px] text-slate-400">≤ 190 days</div>
    </div>
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 leading-tight">
        <Star className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span>Avg Staff Rating</span>
      </div>
      <div className="mt-1 font-mono text-xl font-bold text-amber-300 tabular-nums">
        {kpi.averageHeadlineLabel}
      </div>
    </div>
  </div>
);

export const StaffDirectory: React.FC<StaffDirectoryProps> = ({
  onRequestImport,
  staff,
  clubName,
  saveDate,
  jobVacancies = [],
  onSelectStaff,
}) => {
  const [search, setSearch] = useState('');
  const [directoryFilter, setDirectoryFilter] =
    useState<StaffDirectoryFilter>('all');
  const [activeView, setActiveView] =
    useState<StaffDirectoryView>('directory');

  const counts = useMemo(() => {
    const result = {
      coaching: 0,
      scouting: 0,
      medical: 0,
      board: 0,
      expiring: 0,
    };
    for (const s of staff) {
      result[classifyStaffDepartment(s)] += 1;
      if (isStaffContractExpiringSoon(s.expires, saveDate)) {
        result.expiring += 1;
      }
    }
    return result;
  }, [staff, saveDate]);

  const kpi = useMemo(
    () => computeStaffKpiSummary(staff, saveDate),
    [staff, saveDate]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...staff]
      .filter((s) => {
        if (directoryFilter === 'expiring') {
          if (!isStaffContractExpiringSoon(s.expires, saveDate)) return false;
        } else if (
          directoryFilter !== 'all' &&
          classifyStaffDepartment(s) !== directoryFilter
        ) {
          return false;
        }
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) || s.role.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Board/Executive cards have no coaching rating, so they sort after salaried staff.
        const aStars = getStaffHeadlineDisplay(a).stars ?? -1;
        const bStars = getStaffHeadlineDisplay(b).stars ?? -1;
        return bStars - aStars;
      });
  }, [staff, search, directoryFilter, saveDate]);

  const unifiedMatrix = useMemo(
    () => buildUnifiedStaffMatrix(staff),
    [staff]
  );

  // Decoded vacancy lists often contain generic "Staff · Club" placeholders; hide them
  // rather than repeating the same meaningless pill for every club.
  const realVacancies = useMemo(
    () =>
      (jobVacancies ?? [])
        .map((v, index) => normalizeJobVacancy(v, index))
        .filter((v) => {
          const role = (v.role || '').trim();
          const club = (v.club || '').trim();
          const genericRole =
            !role || role === '--' || role.toLowerCase() === 'staff';
          const genericClub =
            !club ||
            club === '--' ||
            club.toLowerCase() === 'club' ||
            club.toLowerCase() === 'unknown';
          return !(genericRole && genericClub);
        }),
    [jobVacancies]
  );

  const overloadedCount = useMemo(
    () =>
      unifiedMatrix.filter((row) => row.workload === 'Heavy / Overloaded')
        .length,
    [unifiedMatrix]
  );

  const overloadedLeads = useMemo(() => {
    const byLead = new Map<string, { name: string; units: number }>();
    for (const row of unifiedMatrix) {
      if (row.group !== 'Pitch Training' || row.leadUnitCount < 3) continue;
      const key = `${row.leadStaffName}|${row.leadStaffRole}`;
      const existing = byLead.get(key);
      if (existing) {
        existing.units = Math.max(existing.units, row.leadUnitCount);
      } else {
        byLead.set(key, {
          name: row.leadStaffName,
          units: row.leadUnitCount,
        });
      }
    }
    return [...byLead.values()];
  }, [unifiedMatrix]);

  if (!staff || staff.length === 0) {
    return (
      <div className="space-y-4">
        <StaffKpiStrip kpi={kpi} />
        <EmptyStatePanel
          copy={EMPTY_STATES.staff}
          onRequestImport={onRequestImport}
          icon={<UserCheck className="h-5 w-5" />}
        />
      </div>
    );
  }

  const filterLabels: Record<StaffDirectoryFilter, string> = {
    all: `All (${staff.length})`,
    coaching: `Coaching (${counts.coaching})`,
    scouting: `Scouting (${counts.scouting})`,
    medical: `Medical (${counts.medical})`,
    board: `Board (${counts.board})`,
    expiring: `Expiring Soon (${counts.expiring})`,
  };

  return (
    <div className="space-y-4">
      <StaffKpiStrip kpi={kpi} />

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
        <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-sky-400 shrink-0" />
          Backroom Staff Directory
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          {staff.length} club-scoped staff synced for {clubName || 'your club'} ·
          headline ratings score each person on their actual department first
        </p>
      </div>

      {/* Two clean sub-tabs replace the stacked duplicate matrix walls */}
      <div
        role="tablist"
        aria-label="Staff view"
        className="flex flex-wrap gap-1.5"
      >
        {(
          [
            {
              id: 'directory' as const,
              label: 'Directory',
              icon: <UserCheck className="h-3.5 w-3.5" />,
            },
            {
              id: 'matrix' as const,
              label: 'Training & Dept Matrix',
              icon: <Layers className="h-3.5 w-3.5" />,
            },
          ]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeView === tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
              activeView === tab.id
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'bg-slate-900/70 text-slate-400 border border-slate-800 hover:text-slate-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeView === 'directory' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                aria-label="Filter staff name or role"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter staff name or role…"
                className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTER_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={directoryFilter === id}
                  onClick={() => setDirectoryFilter(id)}
                  className={`min-h-[36px] rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                    directoryFilter === id
                      ? id === 'expiring'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/45'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'bg-slate-900/70 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {filterLabels[id]}
                </button>
              ))}
            </div>
          </div>

          {realVacancies.length > 0 && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 px-4 py-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-sky-300">
                <Briefcase className="h-3.5 w-3.5" />
                Open Market Vacancies ({realVacancies.length}):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {realVacancies.slice(0, 6).map((v, idx) => (
                  <span
                    key={`${v.club || 'club'}-${v.role || 'role'}-${idx}`}
                    className="rounded-md bg-slate-900/90 border border-slate-700 px-2 py-0.5 text-xs text-slate-300"
                  >
                    {v.role || 'Staff'} · {v.club || 'Club'}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-10 text-center space-y-1">
                <div className="text-sm font-semibold text-slate-300">
                  No matching staff found
                </div>
                <p className="text-xs text-slate-400">
                  Try clearing your search or department filter.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile staff cards (< md) — zero horizontal scrolling at 360px */}
                <div className="md:hidden divide-y divide-slate-800/80">
                  {filtered.map((s) => {
                    const headline = getStaffHeadlineDisplay(s);
                    const dept = classifyStaffDepartment(s);
                    const expiringSoon = isStaffContractExpiringSoon(
                      s.expires,
                      saveDate
                    );
                    return (
                      <button
                        key={`m-${s.id}`}
                        type="button"
                        onClick={() => onSelectStaff(s)}
                        className="w-full text-left p-3.5 hover:bg-slate-800/40 active:bg-slate-800/60 transition space-y-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">
                              {s.name}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                              <span className="text-xs text-sky-300 truncate">
                                {s.role}
                              </span>
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] uppercase tracking-wider text-slate-400">
                                {dept}
                              </span>
                              {s.secondaryJob && (
                                <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[11px] text-slate-300 truncate max-w-full">
                                  2nd job: {s.secondaryJob}
                                </span>
                              )}
                            </div>
                          </div>
                          {headline.stars === null ? (
                            <span className="inline-flex items-center rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 font-mono text-xs font-bold text-slate-400 shrink-0">
                              --
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-xs font-bold text-amber-300 shrink-0">
                              <Star className="h-3 w-3" />
                              {formatStars(headline.stars)}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-xs">
                          <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 px-2 py-1.5 min-w-0">
                            <div className="text-[11px] uppercase text-slate-400">
                              Dept Role Rating
                            </div>
                            <div className="text-slate-200 font-medium break-words">
                              {headline.label}
                            </div>
                          </div>
                          <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 px-2 py-1.5 min-w-0">
                            <div className="text-[11px] uppercase text-slate-400">
                              Weekly Wage
                            </div>
                            <div className="font-mono text-slate-200 tabular-nums">
                              {formatWeeklyWage(s.wagePw)}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs font-mono text-slate-400">
                          <span className="truncate">
                            Exp {formatContractExpiry(s.expires)}
                          </span>
                          {expiringSoon && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[11px] font-sans font-semibold text-amber-300">
                              <Clock className="h-2.5 w-2.5" />
                              Expiring
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Desktop table (md:+) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/70 text-[11px] uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Role / Dept</th>
                        <th className="px-4 py-3">Secondary Job</th>
                        <th className="px-4 py-3">Department Role Rating</th>
                        <th className="px-4 py-3">Weekly Wage</th>
                        <th className="px-4 py-3">Contract Expiry</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {filtered.map((s) => {
                        const headline = getStaffHeadlineDisplay(s);
                        const dept = classifyStaffDepartment(s);
                        const expiringSoon = isStaffContractExpiringSoon(
                          s.expires,
                          saveDate
                        );
                        return (
                          <tr
                            key={s.id}
                            tabIndex={0}
                            onClick={() => onSelectStaff(s)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onSelectStaff(s);
                              }
                            }}
                            className="cursor-pointer hover:bg-slate-800/50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                          >
                            <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                              {s.name}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sky-300">{s.role}</div>
                              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                                {dept}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                              {s.secondaryJob || '--'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-slate-300">{headline.label}</div>
                              {headline.stars === null ? (
                                <span className="inline-flex items-center rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 font-mono font-bold text-slate-400">
                                  --
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono font-bold text-amber-300">
                                  <Star className="h-3 w-3" />
                                  {formatStars(headline.stars)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap tabular-nums">
                              {formatWeeklyWage(s.wagePw)}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span>{formatContractExpiry(s.expires)}</span>
                                {expiringSoon && (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[11px] font-sans font-semibold text-amber-300">
                                    <Clock className="h-2.5 w-2.5" />
                                    Expiring
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Training &amp; Department Matrix
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                One star scale across pitch training, scouting, and medical — only
                staff with a real FM job in each unit are eligible as lead. Board /
                Executive staff are excluded from every unit.
              </p>
            </div>
            {overloadedLeads.length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/35 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {overloadedLeads.length === 1
                  ? `Overloaded: ${overloadedLeads[0].name} (${overloadedLeads[0].units} units)`
                  : `${overloadedLeads.length} coaches overloaded`}
              </span>
            ) : overloadedCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/35 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {overloadedCount} Overloaded Unit
                {overloadedCount === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="rounded-md bg-emerald-500/15 border border-emerald-500/35 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                Coaching Workload Balanced
              </span>
            )}
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            FM27 stars use an absolute global scale, not a league-relative one — the
            best assigned coach sets each unit's stars, and extra coaches only lower
            workload. One coach leading 3+ pitch units is overloaded and hurts
            training effectiveness even though the stars stay the same.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {unifiedMatrix.map((row) => {
              const workloadCls =
                row.workload === 'Heavy / Overloaded'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                  : row.workload === 'Average'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';

              return (
                <div
                  key={row.key}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-2 sm:p-2.5 space-y-1.5 min-w-0"
                >
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 break-words">
                    {row.group}
                  </div>
                  <div className="flex items-start justify-between gap-1.5">
                    <span className="text-xs font-bold text-white break-words min-w-0">
                      {row.label}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-300 shrink-0">
                      <Star className="h-3 w-3" />
                      {formatStars(row.stars)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 break-words">
                    Lead: <strong className="text-white">{row.leadStaffName}</strong>{' '}
                    <span className="text-slate-400">({row.leadStaffRole})</span>
                    {row.leadUnitCount >= 2 && (
                      <span className="text-amber-300">
                        {' '}· {row.leadUnitCount} units
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-1 pt-0.5">
                    <span className="text-[11px] text-slate-400">
                      {row.qualifiedCount} qualified ≥ 2.5★
                    </span>
                    {row.workload !== 'n/a' && (
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold shrink-0 ${workloadCls}`}
                      >
                        {row.workload}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
