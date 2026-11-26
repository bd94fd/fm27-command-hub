import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from 'lucide-react';
import type { SaveDataQualityReport } from '../utils/saveDataQuality';

interface DataQualityPanelProps {
  report: SaveDataQualityReport;
}

function scoreTone(score: number): string {
  if (score >= 98) {
    return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40';
  }
  if (score >= 90) {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40';
  }
  return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40';
}

const DataQualityTile: React.FC<{
  label: string;
  value: string;
  hint: string;
}> = ({ label, value, hint }) => (
  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-2 min-w-0">
    <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">
      {label}
    </div>
    <div className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums truncate">
      {value}
    </div>
    <div className="mt-0.5 text-micro text-slate-400 truncate">{hint}</div>
  </div>
);

export const DataQualityPanel: React.FC<DataQualityPanelProps> = ({ report }) => {
  const [expanded, setExpanded] = useState(false);
  const gaps = report.sections.flatMap((section) =>
    section.gaps
      .filter((gap) => gap.missing > 0 && gap.severity !== 'info')
      .map((gap) => ({ ...gap, section: section.title }))
  );
  const infoGaps = report.sections.flatMap((section) =>
    section.gaps
      .filter((gap) => gap.missing > 0 && gap.severity === 'info')
      .map((gap) => ({ ...gap, section: section.title }))
  );

  return (
    <section
      aria-labelledby="hub-data-quality-heading"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id="hub-data-quality-heading"
            className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"
          >
            <ShieldCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
            Save Data Quality
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Missing wages, ages, contracts, staff roles and sections — the same
            report the Analyst receives.
          </p>
          <p className="text-micro text-slate-400 mt-1 font-mono truncate">
            {report.fileName} · {report.saveDate}
          </p>
        </div>
        <span
          className={`rounded-md border px-2 py-0.5 font-mono text-micro font-semibold tabular-nums ${scoreTone(
            report.scorePct
          )}`}
        >
          {report.scorePct}% complete
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <DataQualityTile
          label="Completeness"
          value={`${report.scorePct}%`}
          hint={`${report.checks.missing}/${report.checks.total} checks missing`}
        />
        <DataQualityTile
          label="Field Coverage"
          value={`${report.coverage.supplied}/${report.coverage.total}`}
          hint={`${report.coverage.partial} partial · ${report.coverage.missing} missing`}
        />
        <DataQualityTile
          label="Missing Sections"
          value={String(report.missingSections.length)}
          hint={
            report.missingSections.length > 0
              ? report.missingSections.slice(0, 2).join(', ')
              : 'None'
          }
        />
        <DataQualityTile
          label="Reader Notes"
          value={String(report.warnings.length)}
          hint={report.warnings.length > 0 ? 'Review before syncing' : 'No warnings'}
        />
      </div>

      {gaps.length === 0 ? (
        <p className="flex items-start gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1.5 text-micro text-emerald-700 dark:text-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>No blocking data gaps in the checked squad, staff, match and recruitment fields.</span>
        </p>
      ) : (
        <div className="space-y-2">
          <h4 className="text-micro font-bold uppercase tracking-wider text-slate-400">
            Gaps to review
          </h4>
          <ul className="space-y-1.5">
            {gaps.slice(0, expanded ? gaps.length : 5).map((gap) => (
              <li
                key={`${gap.section}-${gap.key}`}
                className="flex items-start justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 text-xs"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {gap.section} · {gap.label}
                  </span>
                  <span className="block text-slate-400">
                    {gap.missing} of {gap.total} missing
                  </span>
                </span>
                <span className="shrink-0 font-mono text-micro font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                  {gap.pct}% complete
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.missingSections.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-micro font-bold uppercase tracking-wider text-slate-400">
            Missing sections
          </span>
          {report.missingSections.map((section) => (
            <span
              key={section}
              className="rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-micro font-semibold text-amber-700 dark:text-amber-300"
            >
              {section}
            </span>
          ))}
        </div>
      )}

      {(gaps.length > 5 || infoGaps.length > 0 || report.warnings.length > 0) && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="hub-data-quality-details"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {expanded ? 'Hide data-quality details' : 'Show all data-quality details'}
        </button>
      )}

      {expanded && (
        <div id="hub-data-quality-details" className="space-y-3">
          {infoGaps.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-micro font-bold uppercase tracking-wider text-slate-400">
                Optional gaps
              </h4>
              <ul className="space-y-1">
                {infoGaps.map((gap) => (
                  <li
                    key={`${gap.section}-${gap.key}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-slate-700 dark:text-slate-300">
                      {gap.section} · {gap.label}
                    </span>
                    <span className="shrink-0 font-mono text-micro text-slate-400 tabular-nums">
                      {gap.missing}/{gap.total}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.warnings.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-micro font-bold uppercase tracking-wider text-slate-400">
                Reader notes
              </h4>
              <ul className="space-y-1">
                {report.warnings.map((warning, index) => (
                  <li
                    key={`${warning}-${index}`}
                    className="flex items-start gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <span className="min-w-0 break-words">{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
