import { Star, UserCheck, X } from 'lucide-react';
import { useState } from 'react';
import { formatWage, wagePeriodSuffix } from '../domain/filters';
import { attributeScoreColorClass } from '../domain/playerCatalog';
import {
  calculateAllStaffRoleRatings,
  formatStars,
  getBestStaffRoleRating,
  STAFF_ATTRIBUTE_LABELS,
} from '../domain/staffRatings';
import type { AppSettings, StaffAttributes, StaffRecord } from '../domain/types';

interface StaffDetailModalProps {
  staff: StaffRecord | null;
  settings: AppSettings;
  onClose: () => void;
}

const COACHING_KEYS: (keyof StaffAttributes)[] = [
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

const MENTAL_SCOUTING_KEYS: (keyof StaffAttributes)[] = [
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

export function StaffDetailModal({ staff, settings, onClose }: StaffDetailModalProps) {
  const [tab, setTab] = useState<'ratings' | 'attributes' | 'profile'>('ratings');

  if (!staff) return null;

  const allRatings = calculateAllStaffRoleRatings(staff).sort((a, b) => b.score20 - a.score20);
  const best = getBestStaffRoleRating(staff);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040308]/75 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="staff-dialog-title"
    >
      <div className="flex h-[min(780px,calc(100dvh-32px))] w-full max-w-[960px] flex-col overflow-hidden rounded-[8px] border border-[#d0c6db]/25 bg-[#121116] shadow-[0_24px_64px_rgba(0,0,0,0.65)]">
        <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-[#39333f] bg-[#202128] px-6">
          <h2 id="staff-dialog-title" className="fm-font-display text-[19px] font-bold text-[#f0edf4]">
            {staff.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close staff dialog"
            className="rounded p-1 text-[#b2acbb] hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="fm-profile-hero flex shrink-0 flex-wrap items-center gap-4 px-6 py-5">
          <div className="flex h-[64px] w-[58px] shrink-0 items-center justify-center rounded-[6px] border border-[#ba647a]/40 bg-[#1a0b16]/70 text-[#c28ca3]">
            <UserCheck className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="fm-font-display text-[23px] font-bold text-white truncate">
              {staff.name}
            </h3>
            <p className="mt-0.5 text-[12px] text-[#d8bdc9]">
              {staff.job} {staff.club ? `· ${staff.club}` : '· Unemployed'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              { label: 'Best Role', value: best.label },
              { label: 'Best Stars', value: `${formatStars(best.stars)} ★` },
              { label: 'Age', value: staff.age !== null ? String(staff.age) : '—' },
              { label: 'CA / PA', value: `${staff.ca ?? '—'} / ${staff.pa ?? '—'}` },
            ].map((s) => (
              <div
                key={s.label}
                className="flex min-w-[78px] flex-col border-l border-white/15 px-3.5 py-1"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#b2acbb]">
                  {s.label}
                </span>
                <span className="mt-0.5 text-[15px] font-bold text-[#ecc2ff] tabular-nums">
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div role="tablist" className="flex shrink-0 border-b border-[#39333f] px-6">
          {(
            [
              { id: 'ratings', label: 'Coaching ratings' },
              { id: 'attributes', label: 'Attributes' },
              { id: 'profile', label: 'Non-playing profile' },
            ] as const
          ).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`relative h-[46px] px-4 text-[13px] font-bold cursor-pointer ${
                  active ? 'bg-[#251f2d] text-[#dc87ff]' : 'text-[#b2acbb] hover:text-white'
                }`}
              >
                {t.label}
                {active && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#dc87ff]" />}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
          {tab === 'ratings' && (
            <div className="overflow-hidden rounded-[6px] border border-[#39333f]">
              <table className="fm-grid-table w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className="h-[40px] px-3 text-left">Training assignment</th>
                    <th className="h-[40px] px-3 text-left">Stars</th>
                    <th className="h-[40px] px-3 text-right">Score / 20</th>
                    <th className="h-[40px] px-3 text-left">Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {allRatings.map((r) => (
                    <tr key={r.key} className="border-b border-white/[0.04]">
                      <td className="h-[38px] px-3 font-semibold text-[#faf5fc]">{r.label}</td>
                      <td className="h-[38px] px-3 tabular-nums">
                        <span className="inline-flex items-center gap-1 font-bold text-[#f0d637]">
                          <Star className="h-3.5 w-3.5 fill-[#f0d637]" />
                          {formatStars(r.stars)}
                        </span>
                      </td>
                      <td className="h-[38px] px-3 text-right font-bold tabular-nums text-[#ecc2ff]">
                        {r.score20.toFixed(1)}
                      </td>
                      <td className="h-[38px] px-3 text-[#d4ced8]">{r.quality}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'attributes' && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {[
                { title: 'Coaching Attributes', keys: COACHING_KEYS },
                { title: 'Mental, Scouting & Medical', keys: MENTAL_SCOUTING_KEYS },
              ].map((group) => (
                <div key={group.title}>
                  <div className="mb-2 border-b border-[#39333f] pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#f0edf4]">
                    {group.title}
                  </div>
                  {group.keys.map((key, idx) => {
                    const val = staff.attributes[key];
                    return (
                      <div
                        key={key}
                        className={`flex min-h-[30px] items-center justify-between px-2.5 text-[12px] ${
                          idx % 2 === 0 ? 'bg-white/[0.03]' : ''
                        }`}
                      >
                        <span className="text-[#d4ced8]">{STAFF_ATTRIBUTE_LABELS[key]}</span>
                        <span className={`font-bold tabular-nums ${attributeScoreColorClass(val)}`}>
                          {val !== null && val !== undefined ? val : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {tab === 'profile' && (
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              {[
                { label: 'Job', value: staff.job },
                { label: 'Club', value: staff.club || 'Unemployed' },
                { label: 'Division', value: staff.division || '—' },
                { label: 'Nationality', value: staff.nationality ?? '—' },
                { label: 'Age', value: staff.age !== null ? String(staff.age) : '—' },
                {
                  label: `Salary (${wagePeriodSuffix(settings)})`,
                  value: staff.salaryWeekly !== null ? formatWage(staff.salaryWeekly, settings) : '—',
                },
                { label: 'Contract End', value: staff.contractEndDate ?? '—' },
                {
                  label: 'World Reputation',
                  value: staff.worldReputation !== null ? String(staff.worldReputation) : '—',
                },
                { label: 'Preferred Formation', value: staff.preferredFormation ?? '—' },
                { label: 'Tactical Style', value: staff.tacticalStyle ?? '—' },
              ].map((item, idx) => (
                <div
                  key={item.label}
                  className={`flex justify-between border-b border-[#39333f] px-3 py-2.5 ${
                    idx % 2 === 0 ? 'bg-white/[0.025]' : ''
                  }`}
                >
                  <span className="text-[11px] font-semibold uppercase text-[#b2acbb]">
                    {item.label}
                  </span>
                  <span className="text-[14px] font-semibold text-[#f0edf4]">{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex h-[58px] shrink-0 items-center justify-end border-t border-[#39333f] bg-[#202128] px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[36px] items-center gap-1.5 rounded-[5px] bg-[#850be3] px-4 text-[13px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
          >
            <X className="h-4 w-4" />
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
