import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  ShieldAlert,
} from 'lucide-react';
import {
  FM27_SAVE_COMPATIBILITY_MATRIX,
  type SaveCompatibilityLevel,
  type SaveCompatibilityResolution,
} from '../utils/fm27SaveCompatibility';

interface SaveCompatibilityPanelProps {
  compatibility: SaveCompatibilityResolution;
}

const LEVEL_LABEL: Record<SaveCompatibilityLevel, string> = {
  verified: 'Verified',
  supported: 'Supported',
  untested: 'Untested',
  unsupported: 'Unsupported',
  unknown: 'Unknown',
};

function levelTone(level: SaveCompatibilityLevel): string {
  switch (level) {
    case 'verified':
      return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40';
    case 'supported':
      return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40';
    case 'untested':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40';
    default:
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40';
  }
}

export const SaveCompatibilityPanel: React.FC<SaveCompatibilityPanelProps> = ({
  compatibility,
}) => {
  const Icon =
    compatibility.level === 'verified'
      ? CheckCircle2
      : compatibility.level === 'unsupported'
        ? ShieldAlert
        : AlertTriangle;

  return (
    <section
      aria-labelledby="hub-save-compatibility-heading"
      className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 p-4 sm:p-5 space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id="hub-save-compatibility-heading"
            className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"
          >
            <GitBranch className="h-4 w-4 text-sky-500 dark:text-sky-400 shrink-0" />
            Save Compatibility
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Which FM27 patches and save formats this Hub can trust.
          </p>
        </div>
        <span
          className={`rounded-md border px-2 py-0.5 font-mono text-micro font-semibold ${levelTone(
            compatibility.level
          )}`}
        >
          {LEVEL_LABEL[compatibility.level]}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-2 min-w-0">
          <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">
            Detected Build
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-white truncate">
            {compatibility.build}
          </div>
          <div className="mt-0.5 text-micro text-slate-400 truncate">
            fmsave {compatibility.fmsaveVersion}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-2 min-w-0">
          <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">
            Layout
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-white truncate">
            {compatibility.layoutBase ?? '--'}
          </div>
          <div className="mt-0.5 text-micro text-slate-400 truncate">
            {compatibility.label}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-2 min-w-0">
          <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">
            Changed Fields
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
            {compatibility.fieldsChanged.length}
          </div>
          <div className="mt-0.5 text-micro text-slate-400 truncate">
            {compatibility.fieldsChanged.length > 0
              ? 'listed below'
              : 'none recorded'}
          </div>
        </div>
      </div>

      <p
        className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-micro ${
          compatibility.needsAttention
            ? 'border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
            : 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
        }`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{compatibility.message}</span>
      </p>

      {compatibility.fieldsChanged.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {compatibility.fieldsChanged.map((field) => (
            <span
              key={field}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 text-micro text-slate-500 dark:text-slate-400"
            >
              {field}
            </span>
          ))}
        </div>
      )}

      <details className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
        <summary className="cursor-pointer list-none px-2.5 py-2 text-micro font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-lg">
          Known builds and changed fields
        </summary>
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {FM27_SAVE_COMPATIBILITY_MATRIX.map((row) => (
            <div key={row.id} className="px-2.5 py-2 space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  {row.label}
                </span>
                <span
                  className={`rounded-md border px-1.5 py-0.5 font-mono text-2xs font-semibold ${levelTone(
                    row.level
                  )}`}
                >
                  {LEVEL_LABEL[row.level]}
                </span>
                <span className="text-micro text-slate-400">
                  layout {row.layoutBase ?? '--'}
                </span>
              </div>
              <p className="text-micro text-slate-400">{row.note}</p>
              {row.fieldsChanged.length > 0 && (
                <p className="text-micro text-slate-400">
                  Changed: {row.fieldsChanged.join(' · ')}
                </p>
              )}
            </div>
          ))}
          <div className="px-2.5 py-2 space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                Any other build
              </span>
              <span
                className={`rounded-md border px-1.5 py-0.5 font-mono text-2xs font-semibold ${levelTone(
                  'unsupported'
                )}`}
              >
                Unsupported
              </span>
            </div>
            <p className="text-micro text-slate-400">
              The Hub does not trust FM27 fields. Import a supported 27.0 or 27.1
              save.
            </p>
          </div>
        </div>
      </details>
    </section>
  );
};
