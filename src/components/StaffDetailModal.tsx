import React from 'react';
import { Star, UserCheck } from 'lucide-react';
import { StaffAttributes, StaffJobRatings, StaffRecord } from '../types/fm27';
import {
  calculateAllStaffRoleRatings,
  formatStars,
  getStaffHeadlineDisplay,
  PREFERRED_JOB_AFFINITY_CAPTION,
  STAFF_ATTRIBUTE_LABELS,
} from '../utils/staffRatings';
import { MobileSheetFrame } from './MobileSheetFrame';
import { formatContractExpiry, formatWeeklyWage } from '../utils/squadViewHelpers';

interface StaffDetailModalProps {
  staff: StaffRecord | null;
  onClose: () => void;
}

const COACHING_KEYS: Array<keyof StaffAttributes> = [
  'attacking',
  'defending',
  'fitness',
  'goalkeeping',
  'mental',
  'possession',
  'set_pieces',
  'tactical',
  'technical',
  'working_with_youngsters',
];

const MENTAL_SCOUTING_KEYS: Array<keyof StaffAttributes> = [
  'adaptability',
  'authority',
  'determination',
  'judging_player_ability',
  'judging_player_potential',
  'judging_staff_ability',
  'man_management',
  'motivating',
  'negotiating',
  'physiotherapy',
  'sports_science',
  'tactical_knowledge',
  'analysing_data',
];

const PREFERRED_JOB_LABELS: Array<[keyof StaffJobRatings, string]> = [
  ['fitness_coach', 'Fitness Coach'],
  ['goalkeeping_coach', 'Goalkeeping Coach'],
  ['set_piece_coach', 'Set-Piece Coach'],
  ['loan_manager', 'Loan Manager'],
  ['physio', 'Physio'],
  ['sports_scientist', 'Sports Scientist'],
];

function attrColor(val: number): string {
  if (val >= 16) return 'text-emerald-300 font-bold';
  if (val >= 13) return 'text-lime-300 font-semibold';
  if (val >= 10) return 'text-amber-200';
  return 'text-slate-400';
}

export const StaffDetailModal: React.FC<StaffDetailModalProps> = ({
  staff,
  onClose,
}) => {
  if (!staff) return null;

  const allRatings = calculateAllStaffRoleRatings(staff.attributes);
  const headline = getStaffHeadlineDisplay(staff);

  return (
    <MobileSheetFrame
      isOpen={Boolean(staff)}
      onClose={onClose}
      ariaLabel={`Staff profile for ${staff.name}`}
      closeAriaLabel="Close staff modal"
      maxWidthClass="sm:max-w-4xl"
      bodyClassName="p-4 sm:p-5"
      header={
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300">
            <UserCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight break-words">
                {staff.name}
              </h2>
              <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium text-sky-300">
                {staff.role}
              </span>
              {staff.secondaryJob && (
                <span className="rounded-md bg-slate-800/70 px-2 py-0.5 text-xs font-medium text-slate-300">
                  2nd job: {staff.secondaryJob}
                </span>
              )}
              {headline.stars === null ? (
                <span className="rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-300">
                  Dept: {headline.label}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-xs font-semibold text-amber-300">
                  <Star className="h-3 w-3" />
                  Dept: {headline.label} ({formatStars(headline.stars)})
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Age {staff.age} · {staff.nation} · {formatWeeklyWage(staff.wagePw)} (exp{' '}
              {formatContractExpiry(staff.expires)})
            </p>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Coaching Attributes */}
        <div className="space-y-1.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Coaching
          </h4>
          {COACHING_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-xs"
            >
              <span className="text-slate-300">{STAFF_ATTRIBUTE_LABELS[key]}</span>
              <span className={`font-mono ${attrColor(staff.attributes[key])}`}>
                {staff.attributes[key]}
              </span>
            </div>
          ))}
        </div>

        {/* Mental, Scouting & Medical */}
        <div className="space-y-1.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Mental, Scouting &amp; Medical
          </h4>
          {MENTAL_SCOUTING_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-xs"
            >
              <span className="text-slate-300">{STAFF_ATTRIBUTE_LABELS[key]}</span>
              <span className={`font-mono ${attrColor(staff.attributes[key])}`}>
                {staff.attributes[key]}
              </span>
            </div>
          ))}
        </div>

        {/* Calculated FM27 Star Ratings */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            FM27 Specialty Star Ratings
          </h4>
          {allRatings.map((r) => (
            <div
              key={r.key}
              className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-200">{r.label}</span>
                <span className="font-mono font-bold text-amber-300">
                  {formatStars(r.stars)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-400"
                  style={{ width: `${r.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {staff.jobRatings && (
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            FM27 Preferred Jobs (fmsave)
          </h4>
          <p className="text-[11px] text-slate-400 mb-2">
            {PREFERRED_JOB_AFFINITY_CAPTION}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
            {PREFERRED_JOB_LABELS.map(([key, label]) => {
              const val = staff.jobRatings?.[key];
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5"
                >
                  <span className="text-slate-300">{label}</span>
                  <span
                    className={`font-mono ${
                      typeof val === 'number' ? attrColor(val) : 'text-slate-500'
                    }`}
                  >
                    {typeof val === 'number' ? val : '--'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </MobileSheetFrame>
  );
};
