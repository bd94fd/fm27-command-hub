import React from 'react';
import { Star, UserCheck, X } from 'lucide-react';
import { StaffAttributes, StaffRecord } from '../types/fm27';
import {
  calculateAllStaffRoleRatings,
  formatStars,
  getBestStaffRoleRating,
  STAFF_ATTRIBUTE_LABELS,
} from '../utils/staffRatings';

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
  React.useEffect(() => {
    if (!staff) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [staff, onClose]);

  if (!staff) return null;

  const allRatings = calculateAllStaffRoleRatings(staff.attributes);
  const best = getBestStaffRoleRating(staff);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-white">{staff.name}</h2>
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

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            aria-label="Close staff modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
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
      </div>
    </div>
  );
};
