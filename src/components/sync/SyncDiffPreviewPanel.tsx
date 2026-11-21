import React from 'react';
import { CheckCircle2, Sparkles, UserMinus, UserPlus, Users } from 'lucide-react';

export interface SyncDiffPreviewPanelProps {
  clubName: string;
  saveDate: string;
  addedNames: string[];
  updatedCount: number;
  removedNames: string[];
  youthIntakeNames?: string[];
  onConfirm?: () => void;
  onDismiss?: () => void;
}

export const SyncDiffPreviewPanel: React.FC<SyncDiffPreviewPanelProps> = ({
  clubName,
  saveDate,
  addedNames,
  updatedCount,
  removedNames,
  youthIntakeNames = [],
  onConfirm,
  onDismiss,
}) => {
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            UID-First Squad Diff Preview — {clubName} ({saveDate})
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              Dismiss
            </button>
          )}
          {onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirm Sync
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
            <UserPlus className="h-3.5 w-3.5" />
            Added ({addedNames.length})
          </div>
          {addedNames.length > 0 ? (
            <div className="mt-1 text-xs text-slate-300">
              {addedNames.slice(0, 6).join(', ')}
              {addedNames.length > 6 ? ` +${addedNames.length - 6} more` : ''}
            </div>
          ) : (
            <div className="mt-1 text-xs text-slate-500">No new signings</div>
          )}
        </div>

        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Updated ({updatedCount})
          </div>
          <div className="mt-1 text-xs text-slate-300">
            Matched via UID-first reconciliation
          </div>
        </div>

        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-300">
            <UserMinus className="h-3.5 w-3.5" />
            Departed / Stale ({removedNames.length})
          </div>
          {removedNames.length > 0 ? (
            <div className="mt-1 text-xs text-slate-300">
              {removedNames.slice(0, 6).join(', ')}
              {removedNames.length > 6 ? ` +${removedNames.length - 6} more` : ''}
            </div>
          ) : (
            <div className="mt-1 text-xs text-slate-500">No departures</div>
          )}
        </div>
      </div>

      {youthIntakeNames.length > 0 && (
        <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span>
            <strong>Youth Intake Highlights:</strong>{' '}
            {youthIntakeNames.slice(0, 5).join(', ')}
            {youthIntakeNames.length > 5
              ? ` (+${youthIntakeNames.length - 5} more)`
              : ''}
          </span>
        </div>
      )}
    </div>
  );
};
