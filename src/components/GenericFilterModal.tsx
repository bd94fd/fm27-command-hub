import { Check, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import {
  createEmptyClubFilter,
  createEmptyCompetitionFilter,
  createEmptyStaffFilter,
} from '../domain/filters';
import { STAFF_COACHING_ROLES } from '../domain/staffRatings';
import type {
  ClubFilterCriteria,
  CompetitionFilterCriteria,
  StaffFilterCriteria,
} from '../domain/types';

function parseOptionalNumber(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const inputClass =
  'h-[36px] w-full rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none';

interface StaffFilterModalProps {
  open: boolean;
  initial: StaffFilterCriteria;
  jobs: string[];
  clubs: string[];
  nations: string[];
  onApply: (c: StaffFilterCriteria) => void;
  onClose: () => void;
}

export function StaffFilterModal({
  open,
  initial,
  jobs,
  clubs,
  nations,
  onApply,
  onClose,
}: StaffFilterModalProps) {
  const [draft, setDraft] = useState<StaffFilterCriteria>(() => ({ ...initial }));
  if (!open) return null;

  return (
    <FilterDialogShell
      title="Staff filter"
      onClear={() => setDraft(createEmptyStaffFilter())}
      onClose={onClose}
      onApply={() => {
        onApply(draft);
        onClose();
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold">Name contains</span>
          <input
            type="text"
            value={draft.nameContains}
            onChange={(e) => setDraft({ ...draft, nameContains: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold">Job</span>
          <select
            value={draft.job}
            onChange={(e) => setDraft({ ...draft, job: e.target.value })}
            className={inputClass}
          >
            <option value="">Any job</option>
            {jobs.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold">Best coaching role</span>
          <select
            value={draft.bestRole}
            onChange={(e) => setDraft({ ...draft, bestRole: e.target.value })}
            className={inputClass}
          >
            <option value="">Any role</option>
            {STAFF_COACHING_ROLES.map((r) => (
              <option key={r.key} value={r.label}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold">Minimum Stars</span>
          <select
            value={draft.minStars ?? ''}
            onChange={(e) => setDraft({ ...draft, minStars: parseOptionalNumber(e.target.value) })}
            className={inputClass}
          >
            <option value="">Any</option>
            {[2.5, 3.0, 3.5, 4.0, 4.5, 5.0].map((st) => (
              <option key={st} value={st}>
                {st.toFixed(1)}+ stars
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold">Club</span>
          <select
            value={draft.club}
            onChange={(e) => setDraft({ ...draft, club: e.target.value })}
            className={inputClass}
          >
            <option value="">Any club</option>
            {clubs.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold">Nationality</span>
          <select
            value={draft.nationality}
            onChange={(e) => setDraft({ ...draft, nationality: e.target.value })}
            className={inputClass}
          >
            <option value="">Any nationality</option>
            {nations.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </FilterDialogShell>
  );
}

interface ClubFilterModalProps {
  open: boolean;
  initial: ClubFilterCriteria;
  nations: string[];
  competitions: string[];
  onApply: (c: ClubFilterCriteria) => void;
  onClose: () => void;
}

export function ClubFilterModal({
  open,
  initial,
  nations,
  competitions,
  onApply,
  onClose,
}: ClubFilterModalProps) {
  const [draft, setDraft] = useState<ClubFilterCriteria>(() => ({ ...initial }));
  if (!open) return null;

  return (
    <FilterDialogShell
      title="Club filter"
      onClear={() => setDraft(createEmptyClubFilter())}
      onClose={onClose}
      onApply={() => {
        onApply(draft);
        onClose();
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold">Name contains</span>
          <input
            type="text"
            value={draft.nameContains}
            onChange={(e) => setDraft({ ...draft, nameContains: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold">Nation</span>
          <select
            value={draft.nation}
            onChange={(e) => setDraft({ ...draft, nation: e.target.value })}
            className={inputClass}
          >
            <option value="">Any nation</option>
            {nations.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold">Competition</span>
          <select
            value={draft.competition}
            onChange={(e) => setDraft({ ...draft, competition: e.target.value })}
            className={inputClass}
          >
            <option value="">Any competition</option>
            {competitions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold">Reputation min</span>
          <input
            type="number"
            value={draft.reputationMin ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, reputationMin: parseOptionalNumber(e.target.value) })
            }
            className={inputClass}
          />
        </label>
      </div>
    </FilterDialogShell>
  );
}

interface CompetitionFilterModalProps {
  open: boolean;
  initial: CompetitionFilterCriteria;
  nations: string[];
  onApply: (c: CompetitionFilterCriteria) => void;
  onClose: () => void;
}

export function CompetitionFilterModal({
  open,
  initial,
  nations,
  onApply,
  onClose,
}: CompetitionFilterModalProps) {
  const [draft, setDraft] = useState<CompetitionFilterCriteria>(() => ({ ...initial }));
  if (!open) return null;

  return (
    <FilterDialogShell
      title="Competition filter"
      onClear={() => setDraft(createEmptyCompetitionFilter())}
      onClose={onClose}
      onApply={() => {
        onApply(draft);
        onClose();
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold">Name contains</span>
          <input
            type="text"
            value={draft.nameContains}
            onChange={(e) => setDraft({ ...draft, nameContains: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold">Nation</span>
          <select
            value={draft.nation}
            onChange={(e) => setDraft({ ...draft, nation: e.target.value })}
            className={inputClass}
          >
            <option value="">Any nation</option>
            {nations.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold">Gender</span>
          <select
            value={draft.gender}
            onChange={(e) =>
              setDraft({
                ...draft,
                gender: e.target.value as CompetitionFilterCriteria['gender'],
              })
            }
            className={inputClass}
          >
            <option value="Any">Any</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold">Reputation min</span>
          <input
            type="number"
            value={draft.reputationMin ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, reputationMin: parseOptionalNumber(e.target.value) })
            }
            className={inputClass}
          />
        </label>
      </div>
    </FilterDialogShell>
  );
}

function FilterDialogShell({
  title,
  onClear,
  onClose,
  onApply,
  children,
}: {
  title: string;
  onClear: () => void;
  onClose: () => void;
  onApply: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040308]/75 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex w-full max-w-[680px] flex-col overflow-hidden rounded-[8px] border border-[#d0c6db]/25 bg-[#121116] shadow-[0_24px_64px_rgba(0,0,0,0.65)]">
        <div className="flex h-[56px] items-center justify-between border-b border-[#39333f] bg-[#202128] px-6">
          <h2 className="fm-font-display text-[19px] font-bold text-[#f0edf4]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="rounded p-1 text-[#b2acbb] hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
        <div className="flex h-[58px] items-center justify-end gap-2.5 border-t border-[#39333f] bg-[#202128] px-6">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-[36px] items-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#241f2a] px-3.5 text-[13px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[36px] items-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#241f2a] px-3.5 text-[13px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            <span>Cancel</span>
          </button>
          <button
            type="button"
            onClick={onApply}
            className="inline-flex h-[36px] items-center gap-1.5 rounded-[5px] bg-[#850be3] px-4 text-[13px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
          >
            <Check className="h-4 w-4" />
            <span>Apply filters</span>
          </button>
        </div>
      </div>
    </div>
  );
}
