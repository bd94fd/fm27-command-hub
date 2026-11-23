import React from 'react';
import { RotateCcw } from 'lucide-react';
import {
  ALL_CUSTOMISABLE_COLUMNS,
  SQUAD_COLUMNS,
  SquadColumnId,
  SquadViewPreset,
} from '../../utils/squadViewHelpers';

interface SquadColumnsPickerProps {
  columnsOpen: boolean;
  activePreset: SquadViewPreset;
  hasCustomColumnsForPreset: boolean;
  handleResetPresetColumns: () => void;
  activeColumns: SquadColumnId[];
  handleToggleColumn: (colId: SquadColumnId) => void;
}

export const SquadColumnsPicker: React.FC<SquadColumnsPickerProps> = ({
  columnsOpen,
  activePreset,
  hasCustomColumnsForPreset,
  handleResetPresetColumns,
  activeColumns,
  handleToggleColumn,
}) => {
  return (
    <>
    {columnsOpen && (
      <div className="rounded-xl border border-sky-500/30 bg-slate-50 dark:bg-slate-950/70 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Columns for {activePreset.label}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {activePreset.description}
            </div>
          </div>
          {hasCustomColumnsForPreset && (
            <button
              type="button"
              onClick={handleResetPresetColumns}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300 shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Preset
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_CUSTOMISABLE_COLUMNS.map((colId) => {
            const meta = SQUAD_COLUMNS[colId];
            const checked = activeColumns.includes(colId);
            return (
              <button
                key={colId}
                type="button"
                onClick={() => handleToggleColumn(colId)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium border transition cursor-pointer ${
                  checked
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-200'
                    : 'bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-200'
                }`}
              >
                {checked ? '✓ ' : '+ '}
                {meta.shortLabel}
              </button>
            );
          })}
        </div>
      </div>
    )}
    </>
  );
};
