import React, { useMemo, useState } from 'react';
import { Search, Star, UserCheck } from 'lucide-react';
import { StaffRecord } from '../types/fm27';
import { formatStars, getBestStaffRoleRating } from '../utils/staffRatings';

interface StaffDirectoryProps {
  staff: StaffRecord[];
  clubName?: string;
  onSelectStaff: (member: StaffRecord) => void;
}

export const StaffDirectory: React.FC<StaffDirectoryProps> = ({
  staff,
  clubName,
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-sky-400" />
            Backroom Staff Directory &amp; FM27 Star Ratings
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {staff.length > 0
              ? `${staff.length} staff members synced for ${clubName || 'your club'} · Click any row for full coaching, scouting & medical breakdown`
              : 'Awaiting .fm Save — upload your save in Auto-Sync to evaluate your club staff with FM27 star ratings.'}
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter staff name or role..."
            className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-sm font-semibold text-slate-300">
              {staff.length === 0 ? 'Awaiting .fm Save' : 'No matching staff found'}
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {staff.length === 0
                ? 'Drop your .fm save file in the Auto-Sync tab to extract club-scoped coaching, scouting, analysis, and medical staff.'
                : 'Try clearing your search filter.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/70 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Age</th>
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
                        {s.age}
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
