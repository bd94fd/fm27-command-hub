import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { RotateCcw } from 'lucide-react';
import type {
  AvailabilityFilter,
  PositionGroupFilter,
} from '../../utils/squadViewHelpers';

interface SquadFilterDrawerProps {
  filtersOpen: boolean;
  posFilter: PositionGroupFilter;
  setPosFilter: Dispatch<SetStateAction<PositionGroupFilter>>;
  statusFilter: string;
  setStatusFilter: Dispatch<SetStateAction<string>>;
  availabilityFilter: AvailabilityFilter;
  setAvailabilityFilter: Dispatch<SetStateAction<AvailabilityFilter>>;
  availableExpiryYears: string[];
  expiryYearFilter: string;
  setExpiryYearFilter: Dispatch<SetStateAction<string>>;
  activeSecondaryFilterCount: number;
  search: string;
  handleResetFilters: () => void;
}

export const SquadFilterDrawer: React.FC<SquadFilterDrawerProps> = ({
  filtersOpen,
  posFilter,
  setPosFilter,
  statusFilter,
  setStatusFilter,
  availabilityFilter,
  setAvailabilityFilter,
  availableExpiryYears,
  expiryYearFilter,
  setExpiryYearFilter,
  activeSecondaryFilterCount,
  search,
  handleResetFilters,
}) => {
  return (
    <>
    {filtersOpen && (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
            {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map((grp) => (
              <button
                key={grp}
                type="button"
                onClick={() => setPosFilter(grp)}
                className={`px-2 py-1 text-micro font-semibold rounded-md transition cursor-pointer ${
                  posFilter === grp
                    ? 'bg-white dark:bg-slate-900 text-emerald-500 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {grp}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg overflow-x-auto">
            {(['ALL', 'Starter', 'Rotation', 'Youth', 'Surplus'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2 py-1 text-micro font-medium rounded-md transition whitespace-nowrap cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg overflow-x-auto">
            {(
              [
                { id: 'ALL', label: 'All Avail.' },
                { id: 'AVAILABLE', label: 'Available' },
                { id: 'UNAVAILABLE', label: 'Banned / Inj' },
                { id: 'EXPIRING', label: 'Expiring ≤6m' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAvailabilityFilter(opt.id)}
                className={`px-2 py-1 text-micro font-medium rounded-md transition whitespace-nowrap cursor-pointer ${
                  availabilityFilter === opt.id
                    ? 'bg-white dark:bg-slate-900 text-emerald-500 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {availableExpiryYears.length > 0 && (
            <select
              aria-label="Filter by contract expiry year"
              value={expiryYearFilter}
              onChange={(e) => setExpiryYearFilter(e.target.value)}
              className="px-2.5 py-1 text-micro font-medium bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="ALL">Expiry: All Years</option>
              {availableExpiryYears.map((yr) => (
                <option key={yr} value={yr}>
                  Expires {yr}
                </option>
              ))}
            </select>
          )}

          {(activeSecondaryFilterCount > 0 || search) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 px-2 py-1 text-micro font-semibold text-rose-400 hover:text-rose-300 cursor-pointer ml-auto"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
      </div>
    )}
    </>
  );
};
