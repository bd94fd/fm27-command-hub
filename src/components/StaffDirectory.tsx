import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  Clock,
  Search,
  Star,
  UserCheck,
} from 'lucide-react';
import { StaffRecord } from '../types/fm27';
import { JobVacancyEntry } from '../types/fmSave';
import {
  buildCoachingCategoryMatrix,
  classifyStaffDepartment,
  computeWeeklyStaffPayroll,
  evaluateBackroomDepartmentEfficiency,
  formatStars,
  formatWeeklyStaffPayroll,
  getBestStaffRoleRating,
  isStaffContractExpiringSoon,
  StaffDepartmentGroup,
} from '../utils/staffRatings';

interface StaffDirectoryProps {
  staff: StaffRecord[];
  clubName?: string;
  saveDate?: string;
  jobVacancies?: JobVacancyEntry[];
  onSelectStaff: (member: StaffRecord) => void;
}

type StaffViewFilter = 'all' | StaffDepartmentGroup;

export const StaffDirectory: React.FC<StaffDirectoryProps> = ({
  staff,
  clubName,
  saveDate,
  jobVacancies = [],
  onSelectStaff,
}) => {
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<StaffViewFilter>('all');
  const [onlyExpiring, setOnlyExpiring] = useState(false);

  const counts = useMemo(() => {
    let coaching = 0;
    let scouting = 0;
    let medical = 0;
    let expiring = 0;
    for (const s of staff) {
      const grp = classifyStaffDepartment(s);
      if (grp === 'coaching') coaching += 1;
      else if (grp === 'scouting') scouting += 1;
      else medical += 1;
      if (isStaffContractExpiringSoon(s.expires, saveDate)) {
        expiring += 1;
      }
    }
    return { coaching, scouting, medical, expiring };
  }, [staff, saveDate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...staff]
      .filter((s) => {
        if (departmentFilter !== 'all' && classifyStaffDepartment(s) !== departmentFilter) {
          return false;
        }
        if (onlyExpiring && !isStaffContractExpiringSoon(s.expires, saveDate)) {
          return false;
        }
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.role.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          getBestStaffRoleRating(b).score - getBestStaffRoleRating(a).score
      );
  }, [staff, search, departmentFilter, onlyExpiring, saveDate]);

  const departmentSummaries = useMemo(
    () => evaluateBackroomDepartmentEfficiency(staff),
    [staff]
  );

  const weeklyPayrollLabel = useMemo(
    () => formatWeeklyStaffPayroll(computeWeeklyStaffPayroll(staff)),
    [staff]
  );

  const coachingMatrix = useMemo(
    () => buildCoachingCategoryMatrix(staff),
    [staff]
  );

  const weakDepartments = useMemo(
    () =>
      departmentSummaries.filter(
        (d) => d.status === 'Weak / Upgrade Needed'
      ),
    [departmentSummaries]
  );

  const overloadedCategories = useMemo(
    () =>
      coachingMatrix.filter((c) => c.workload === 'Heavy / Overloaded'),
    [coachingMatrix]
  );

  if (!staff || staff.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center space-y-2.5">
        <UserCheck className="h-8 w-8 text-sky-400 mx-auto" />
        <h2 className="text-base sm:text-lg font-bold text-white">
          Awaiting .fm Save — Backroom Staff Directory
        </h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
          Import your <span className="font-mono text-emerald-400">.fm</span> save
          in the <strong>Hub</strong> tab to audit Coaching, Scouting &amp;
          Recruitment, and Medical/Performance staff with the FM27 Coaching
          Category Rating Matrix, workload indicators, and expiring contract flags.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-sky-400" />
            Backroom Staff Directory &amp; Coaching Matrix
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {staff.length} club-scoped staff synced for {clubName || 'your club'} ·
            FM27 2x DDM Star Weighting (Determination, Level of Discipline, Motivating)
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Weekly staff payroll:{' '}
            <span className="font-mono text-slate-200">{weeklyPayrollLabel}</span>
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            aria-label="Filter staff name or role"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter staff name or role..."
            className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Filterable Department Views + Expiring Contract Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'all', label: `All Staff (${staff.length})` },
              { id: 'coaching', label: `Coaching (${counts.coaching})` },
              { id: 'scouting', label: `Scouting & Recruitment (${counts.scouting})` },
              { id: 'medical', label: `Medical / Performance (${counts.medical})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDepartmentFilter(tab.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                departmentFilter === tab.id
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'bg-slate-900/70 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setOnlyExpiring((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
            onlyExpiring
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/45'
              : 'bg-slate-900/70 text-slate-400 border border-slate-800 hover:text-amber-300'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Expiring Soon ({counts.expiring})
        </button>
      </div>

      {/* Deterministic FM27 Coaching Category Rating Matrix (shown on All & Coaching views) */}
      {(departmentFilter === 'all' || departmentFilter === 'coaching') && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-200">
                FM27 Coaching Category Rating Matrix (9 Training Units)
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Specialist attributes + Determination, Authority &amp; Motivating weighted 2x, with workload/overload flags.
              </p>
            </div>
            {overloadedCategories.length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/35 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {overloadedCategories.length} Overloaded Category
                {overloadedCategories.length === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="rounded-md bg-emerald-500/15 border border-emerald-500/35 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                Coaching Workload Balanced
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {coachingMatrix.map((row) => {
              const workloadCls =
                row.workload === 'Heavy / Overloaded'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                  : row.workload === 'Average'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';

              return (
                <div
                  key={row.key}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white truncate">
                      {row.label}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-300 shrink-0">
                      <Star className="h-3 w-3" />
                      {formatStars(row.stars)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 truncate">
                    Lead: <strong className="text-white">{row.leadCoachName}</strong>{' '}
                    <span className="text-slate-400">({row.leadCoachRole})</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-[10px] text-slate-400">
                      {row.qualifiedCount} coach{row.qualifiedCount === 1 ? '' : 'es'} ≥ 2.5★
                    </span>
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${workloadCls}`}
                    >
                      {row.workload}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 8-Department Backroom Efficiency Summary */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Backroom Department Efficiency Matrix (8 Core Units)
          </div>
          {weakDepartments.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 border border-rose-500/35 px-2.5 py-0.5 text-[11px] font-semibold text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              {weakDepartments.length} Priority Hiring Gap
              {weakDepartments.length === 1 ? '' : 's'}:{' '}
              {weakDepartments.map((d) => d.label).join(', ')}
            </span>
          ) : (
            <span className="rounded-md bg-emerald-500/15 border border-emerald-500/35 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
              All 8 Backroom Departments Rated ≥ 2.5★
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {departmentSummaries.map((dept) => {
            const toneCls =
              dept.status === 'Elite'
                ? 'border-emerald-500/35 bg-emerald-950/20'
                : dept.status === 'Solid'
                  ? 'border-sky-500/30 bg-slate-950/70'
                  : 'border-rose-500/45 bg-rose-950/25';
            const badgeCls =
              dept.status === 'Elite'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : dept.status === 'Solid'
                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/35'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40';

            return (
              <div
                key={dept.departmentId}
                className={`rounded-xl border p-3 space-y-1.5 ${toneCls}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-white truncate">
                    {dept.label}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-bold border ${badgeCls}`}
                  >
                    {formatStars(dept.stars)} ({dept.efficiencyScore})
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 truncate">
                  Lead: <strong className="text-white">{dept.leadStaffName}</strong>{' '}
                  <span className="text-slate-400">({dept.leadStaffRole})</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  {dept.status}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {jobVacancies.length > 0 && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 px-4 py-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-sky-300">
            <Briefcase className="h-3.5 w-3.5" />
            Open Market Vacancies ({jobVacancies.length}):
          </span>
          <div className="flex flex-wrap gap-1.5">
            {jobVacancies.slice(0, 6).map((v, idx) => (
              <span
                key={`${v.club || 'club'}-${v.role || 'role'}-${idx}`}
                className="rounded-md bg-slate-900/90 border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300"
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
            <p className="text-xs text-slate-500">
              Try clearing your search or department filter.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile staff cards (< md) — zero horizontal scrolling at 360px */}
            <div className="md:hidden divide-y divide-slate-800/80">
              {filtered.map((s) => {
                const best = getBestStaffRoleRating(s);
                const dept = classifyStaffDepartment(s);
                const expiringSoon = isStaffContractExpiringSoon(
                  s.expires,
                  saveDate
                );
                const keyAttrsLabel =
                  dept === 'medical'
                    ? `Phy ${s.attributes.physiotherapy} · Sci ${s.attributes.sports_science}`
                    : dept === 'scouting'
                      ? `JPA ${s.attributes.judging_player_ability} · JPP ${s.attributes.judging_player_potential} · Data ${s.attributes.analysing_data}`
                      : `Def ${s.attributes.defending} · Att ${s.attributes.attacking} · Tac ${s.attributes.tactical}`;
                return (
                  <button
                    key={`m-${s.id}`}
                    type="button"
                    onClick={() => onSelectStaff(s)}
                    className="w-full text-left p-3.5 hover:bg-slate-800/40 active:bg-slate-800/60 transition space-y-2 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {s.name}
                        </div>
                        <div className="text-xs text-sky-300 truncate">
                          {s.role}{' '}
                          <span className="text-[10px] uppercase text-slate-500">
                            · {dept}
                          </span>
                        </div>
                        {s.secondaryJob && (
                          <div className="text-[11px] text-slate-400 truncate">
                            2nd job: {s.secondaryJob}
                          </div>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-xs font-bold text-amber-300 shrink-0">
                        <Star className="h-3 w-3" />
                        {formatStars(best.stars)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 px-2 py-1.5 min-w-0">
                        <div className="text-[9px] uppercase text-slate-500">Best Specialty</div>
                        <div className="text-slate-200 font-medium truncate">{best.label}</div>
                      </div>
                      <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 px-2 py-1.5 min-w-0">
                        <div className="text-[9px] uppercase text-slate-500">DDM (Det/Dis/Mot)</div>
                        <div className="font-mono text-slate-200">
                          {s.attributes.determination} / {s.attributes.authority} / {s.attributes.motivating}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-mono text-slate-400">
                      <span>{keyAttrsLabel}</span>
                      <span className="inline-flex items-center gap-1">
                        £{s.wagePw.toLocaleString()}/wk · {s.expires}
                        {expiringSoon && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-sans font-semibold text-amber-300">
                            <Clock className="h-2.5 w-2.5" />
                            Exp
                          </span>
                        )}
                      </span>
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
                    <th className="px-4 py-3">Key Attributes</th>
                    <th className="px-4 py-3">DDM (Det/Dis/Mot)</th>
                    <th className="px-4 py-3">Best FM27 Specialty</th>
                    <th className="px-4 py-3">Star Rating</th>
                    <th className="px-4 py-3">Wage / Contract</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filtered.map((s) => {
                    const best = getBestStaffRoleRating(s);
                    const dept = classifyStaffDepartment(s);
                    const expiringSoon = isStaffContractExpiringSoon(
                      s.expires,
                      saveDate
                    );
                    const keyAttrsLabel =
                      dept === 'medical'
                        ? `Phy ${s.attributes.physiotherapy} · Sci ${s.attributes.sports_science}`
                        : dept === 'scouting'
                          ? `JPA ${s.attributes.judging_player_ability} · JPP ${s.attributes.judging_player_potential} · Data ${s.attributes.analysing_data}`
                          : `Def ${s.attributes.defending} · Att ${s.attributes.attacking} · Tac ${s.attributes.tactical}`;

                    return (
                      <tr
                        key={s.id}
                        onClick={() => onSelectStaff(s)}
                        className="cursor-pointer hover:bg-slate-800/50 transition"
                      >
                        <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                          {s.name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sky-300">{s.role}</div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">
                            {dept}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                          {s.secondaryJob || '--'}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">
                          {keyAttrsLabel}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">
                          {s.attributes.determination} / {s.attributes.authority} /{' '}
                          {s.attributes.motivating}
                        </td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                          {best.label}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono font-bold text-amber-300">
                            <Star className="h-3 w-3" />
                            {formatStars(best.stars)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>
                              £{s.wagePw.toLocaleString()}/wk · {s.expires}
                            </span>
                            {expiringSoon && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-sans font-semibold text-amber-300">
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
  );
};
