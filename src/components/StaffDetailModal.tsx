import React from 'react';
import { Star, UserCheck } from 'lucide-react';
import { StaffAttributes, StaffRecord } from '../types/fm27';
import {
  calculateAllStaffRoleRatings,
  formatStars,
  getBestStaffRoleRating,
  STAFF_ATTRIBUTE_LABELS,
} from '../utils/staffRatings';
import { MobileSheetFrame } from './MobileSheetFrame';

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
  const best = getBestStaffRoleRating(staff);

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
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-xs font-semibold text-amber-300">
                <Star className="h-3 w-3" />
                Best: {best.label} ({formatStars(best.stars)})
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Age {staff.age} · {staff.nation} · £{staff.wagePw.toLocaleString()}/wk (exp{' '}
              {staff.expires})
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
    </MobileSheetFrame>
  );
};
