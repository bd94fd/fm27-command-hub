import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  Network,
  Star,
  Users,
  Wallet,
} from 'lucide-react';
import { StaffRecord } from '../../types/fm27';
import { formatContractExpiry, formatWeeklyWage } from '../../utils/squadViewHelpers';
import { formatStars, STAFF_CONTRACT_EXPIRY_WINDOW_DAYS } from '../../utils/staffRatings';
import {
  StaffOrgChart,
  StaffOrgDepartment,
  StaffOrgPerson,
  buildStaffOrgChart,
} from '../../utils/staffOrgChart';

interface StaffOrgChartViewProps {
  staff: StaffRecord[];
  saveDate: string;
  onSelectStaff: (member: StaffRecord) => void;
}

/** Departments longer than this start collapsed, so a phone is not a 2,000px scroll. */
const COLLAPSED_MEMBER_COUNT = 6;

const monthsLeftLabel = (person: StaffOrgPerson): string => {
  if (person.daysRemaining === null) return 'no date';
  const months = Math.round(person.daysRemaining / 30.4);
  if (months <= 0) return 'expires now';
  return months === 1 ? '1 month left' : `${months} months left`;
};

const StarsBadge: React.FC<{ stars: number | null }> = ({ stars }) =>
  stars === null ? (
    <span className="inline-flex items-center rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 font-mono text-xs font-bold text-slate-400 shrink-0">
      --
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-xs font-bold text-amber-300 shrink-0">
      <Star className="h-3 w-3" />
      {formatStars(stars)}
    </span>
  );

const PersonButton: React.FC<{
  person: StaffOrgPerson;
  onSelect: () => void;
  emphasis?: boolean;
}> = ({ person, onSelect, emphasis }) => {
  const expiring =
    person.daysRemaining !== null && person.daysRemaining <= STAFF_CONTRACT_EXPIRY_WINDOW_DAYS;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full min-h-11 text-left px-3 py-2 rounded-lg transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
        emphasis
          ? 'bg-slate-950/60 border border-sky-500/30 hover:bg-slate-950/85'
          : 'hover:bg-slate-800/70'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">{person.name}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-sky-300">{person.role}</span>
            <span className="text-micro text-slate-400">{person.age}y</span>
            {person.secondaryJob && (
              <span className="rounded-md bg-slate-800/70 px-1.5 py-0.5 text-micro text-slate-300">
                2nd: {person.secondaryJob}
              </span>
            )}
          </div>
        </div>
        <StarsBadge stars={person.stars} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-micro text-slate-400 tabular-nums">
        <span className="inline-flex items-center gap-1">
          <Wallet className="h-3 w-3" />
          {formatWeeklyWage(person.wagePw)}
        </span>
        <span>Exp {formatContractExpiry(person.expires)}</span>
        <span className={expiring ? 'text-amber-300' : ''}>{monthsLeftLabel(person)}</span>
      </div>
    </button>
  );
};

const DepartmentCard: React.FC<{
  department: StaffOrgDepartment;
  staffById: Map<string, StaffRecord>;
  onSelectStaff: (member: StaffRecord) => void;
}> = ({ department, staffById, onSelectStaff }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded
    ? department.members
    : department.members.slice(0, COLLAPSED_MEMBER_COUNT);
  const hidden = department.members.length - visible.length;
  const filledRoles = department.coverage.length - department.missingRoles.length;

  const select = (person: StaffOrgPerson) => {
    const record = staffById.get(person.id);
    if (record) onSelectStaff(record);
  };

  return (
    <section
      aria-labelledby={`org-dept-${department.id}`}
      className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden"
    >
      <div className="px-3.5 py-3 border-b border-slate-800 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id={`org-dept-${department.id}`}
            className="text-sm font-bold text-white flex items-center gap-1.5"
          >
            <Users className="h-4 w-4 text-sky-400 shrink-0" />
            {department.label}
          </h3>
          <p className="text-micro text-slate-400 mt-0.5">
            {department.headcount === 0
              ? 'Nobody in this department'
              : `${department.headcount} ${department.headcount === 1 ? 'person' : 'people'} · ${filledRoles}/${department.coverage.length} standard jobs filled`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-xs font-bold text-slate-200 tabular-nums">
            {department.headcount === 0 ? '--' : formatWeeklyWage(department.wageWeekly)}
          </div>
          <div className="text-micro uppercase tracking-wider text-slate-400">weekly</div>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {department.lead ? (
          <div className="space-y-1">
            <div className="text-micro uppercase tracking-wider text-sky-300 font-bold">
              {department.id === 'board'
                ? 'Club leadership'
                : department.leadSource === 'title'
                  ? 'Head of department'
                  : 'Acting head (by rating)'}
            </div>
            <PersonButton person={department.lead} onSelect={() => select(department.lead!)} emphasis />
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
            No head of department in this save.
          </div>
        )}

        {department.members.length > 0 && (
          <div className="space-y-1">
            <div className="text-micro uppercase tracking-wider text-slate-400 font-bold">
              {department.lead && department.id !== 'board'
                ? `Reports to ${department.lead.name}`
                : 'Department members'}
            </div>
            <div className="divide-y divide-slate-800/70">
              {visible.map((person) => (
                <PersonButton key={person.id} person={person} onSelect={() => select(person)} />
              ))}
            </div>
          </div>
        )}

        {(hidden > 0 || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="min-h-11 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:bg-slate-800/70 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Show fewer
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Show {hidden} more in {department.label}
              </>
            )}
          </button>
        )}

        {department.id !== 'board' && department.missingRoles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-micro uppercase tracking-wider text-slate-400 font-bold">
              Not filled
            </span>
            {department.missingRoles.map((role) => (
              <span
                key={role}
                className="rounded-md bg-amber-500/15 border border-amber-500/35 px-1.5 py-0.5 text-micro font-semibold text-amber-200"
              >
                {role}
              </span>
            ))}
          </div>
        )}

        {department.risks.length > 0 && (
          <ul className="space-y-1 pt-1">
            {department.risks.map((risk) => (
              <li
                key={risk.id}
                className={`flex items-start gap-1.5 text-xs ${
                  risk.severity === 'critical'
                    ? 'text-rose-300'
                    : risk.severity === 'warning'
                      ? 'text-amber-200'
                      : 'text-slate-400'
                }`}
              >
                {risk.severity === 'info' ? (
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                )}
                <span>{risk.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export const StaffOrgChartView: React.FC<StaffOrgChartViewProps> = ({
  staff,
  saveDate,
  onSelectStaff,
}) => {
  const chart: StaffOrgChart = useMemo(
    () => buildStaffOrgChart(staff, saveDate),
    [staff, saveDate]
  );
  const staffById = useMemo(
    () => new Map(staff.map((member) => [member.id, member])),
    [staff]
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: 'People', value: String(chart.headcount) },
          { label: 'Weekly wage', value: formatWeeklyWage(chart.wageWeekly) },
          {
            label: 'Heads in place',
            value: `${chart.departments.filter((d) => d.leadSource === 'title').length}/${chart.departments.length}`,
          },
          { label: 'Coverage gaps', value: String(chart.gapCount) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 min-w-0"
          >
            <div className="text-micro font-bold uppercase tracking-wider text-slate-400 leading-tight">
              {stat.label}
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-white tabular-nums break-words">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-sky-500/30 bg-sky-950/20 px-3.5 py-3">
        <h2 className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
          <Network className="h-3.5 w-3.5 shrink-0" />
          How these reporting lines are worked out
        </h2>
        <p className="text-xs text-slate-300 mt-1">{chart.rule}</p>
      </div>

      {chart.unpricedCount > 0 && (
        <p className="text-micro text-slate-400 px-1">
          {chart.unpricedCount} staff {chart.unpricedCount === 1 ? 'wage did not decode and is' : 'wages did not decode and are'} left out of the totals.
        </p>
      )}

      {chart.departments.map((department) => (
        <DepartmentCard
          key={department.id}
          department={department}
          staffById={staffById}
          onSelectStaff={onSelectStaff}
        />
      ))}
    </div>
  );
};
