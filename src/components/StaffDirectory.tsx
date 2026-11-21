import React, { useMemo, useState } from 'react';
import { AlertTriangle, Briefcase, Search, Star, UserCheck } from 'lucide-react';
import { StaffRecord } from '../types/fm27';
import { JobVacancyEntry } from '../types/fmSave';
import {
  evaluateBackroomDepartmentEfficiency,
  formatStars,
  getBestStaffRoleRating,
} from '../utils/staffRatings';

interface StaffDirectoryProps {
  staff: StaffRecord[];
  clubName?: string;
  jobVacancies?: JobVacancyEntry[];
  onSelectStaff: (member: StaffRecord) => void;
}

export const StaffDirectory: React.FC<StaffDirectoryProps> = ({
  staff,
  clubName,
  jobVacancies = [],
  onSelectStaff,
}) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...staff]
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.role.toLowerCase().includes(q)
      )
      .sort(
        (a, b) =>
          getBestStaffRoleRating(b).score - getBestStaffRoleRating(a).score
      );
  }, [staff, search]);

  const departmentSummaries = useMemo(
    () => evaluateBackroomDepartmentEfficiency(staff),
    [staff]
  );

  const weakDepartments = useMemo(
    () =>
      departmentSummaries.filter(
        (d) => d.status === 'Weak / Upgrade Needed'
      ),
    [departmentSummaries]
  );

  if (!staff || staff.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-sky-400" />
            Backroom Staff Directory &amp; Department Efficiency Engine
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {staff.length} club-scoped staff members synced for {clubName || 'your club'} · 8-Department Efficiency Matrix &amp; Star Ratings
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

      {/* Phase 2 (v3.0): 8-Department Backroom Efficiency Matrix */}
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
              Try clearing your search filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/70 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Def / Att / Tac</th>
                  <th className="px-4 py-3">Judging Abil / Pot</th>
                  <th className="px-4 py-3">Best FM27 Specialty</th>
                  <th className="px-4 py-3">Star Rating</th>
                  <th className="px-4 py-3">Wage / Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filtered.map((s) => {
                  const best = getBestStaffRoleRating(s);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => onSelectStaff(s)}
                      className="cursor-pointer hover:bg-slate-800/50 transition"
                    >
                      <td className="px-4 py-3 font-semibold text-white">
                        {s.name}
                      </td>
                      <td className="px-4 py-3 text-sky-300">{s.role}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">
                        {s.attributes.defending} / {s.attributes.attacking} / {s.attributes.tactical}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-300">
                        {s.attributes.judging_player_ability} / {s.attributes.judging_player_potential}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{best.label}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono font-bold text-amber-300">
                          <Star className="h-3 w-3" />
                          {formatStars(best.stars)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        £{s.wagePw.toLocaleString()}/wk · {s.expires}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
