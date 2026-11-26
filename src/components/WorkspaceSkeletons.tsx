/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export type WorkspaceSkeletonVariant =
  | 'sync'
  | 'squad'
  | 'tactics'
  | 'recruitment'
  | 'matches'
  | 'staff';

const PULSE = 'animate-pulse motion-reduce:animate-none';

/**
 * Geometry-matched Suspense fallback for lazy-loaded primary tabs.
 * Preserves the exact outer card border, padding, header height, and primary
 * content rhythm of each workspace so lazy hydration avoids layout shifts.
 */
export const TabWorkspaceSkeleton: React.FC<{
  variant: WorkspaceSkeletonVariant;
  label: string;
}> = ({ variant, label }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading ${label}`}
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
    >
      <span className="sr-only">Loading {label}...</span>

      {/* Header bar matched to workspace headers (~58px) */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between gap-3">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className={`h-4 w-40 rounded-md bg-slate-200 dark:bg-slate-800 ${PULSE}`} />
          <div className={`h-3 w-56 max-w-full rounded-md bg-slate-200/70 dark:bg-slate-800/70 ${PULSE}`} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`h-9 sm:h-8 w-24 rounded-lg bg-slate-200 dark:bg-slate-800 ${PULSE}`} />
          <div className={`hidden sm:block h-8 w-20 rounded-lg bg-slate-200 dark:bg-slate-800 ${PULSE}`} />
        </div>
      </div>

      {/* Variant-specific body geometry */}
      {variant === 'sync' && (
        <div className="p-3.5 sm:p-5 space-y-3.5">
          {/* Quick prompt row */}
          <div className="flex items-center gap-1.5 overflow-hidden">
            {[112, 128, 108, 132].map((w, idx) => (
              <div
                key={idx}
                style={{ width: w }}
                className={`h-11 sm:h-9 rounded-lg bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 shrink-0 ${PULSE}`}
              />
            ))}
          </div>
          {/* Primary workspace / hero area */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-3 min-h-[210px]">
            <div className={`h-5 w-3/5 max-w-sm rounded-md bg-slate-200 dark:bg-slate-800 ${PULSE}`} />
            <div className={`h-3.5 w-full max-w-xl rounded-md bg-slate-200/70 dark:bg-slate-800/70 ${PULSE}`} />
            <div className={`h-3.5 w-4/5 max-w-lg rounded-md bg-slate-200/70 dark:bg-slate-800/70 ${PULSE}`} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-20 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 ${PULSE}`}
                />
              ))}
            </div>
          </div>
          {/* Composer strip */}
          <div className="flex items-center gap-2">
            <div className={`h-11 w-11 sm:w-36 rounded-xl bg-slate-200 dark:bg-slate-800 shrink-0 ${PULSE}`} />
            <div className={`h-11 flex-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 ${PULSE}`} />
            <div className={`h-11 w-11 sm:w-20 rounded-xl bg-emerald-500/20 shrink-0 ${PULSE}`} />
          </div>
        </div>
      )}

      {variant === 'squad' && (
        <div className="p-3.5 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className={`h-11 sm:h-9 flex-1 min-w-[160px] rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 ${PULSE}`} />
            <div className={`h-11 sm:h-9 w-28 rounded-lg bg-slate-100 dark:bg-slate-800 ${PULSE}`} />
            <div className={`h-11 sm:h-9 w-24 rounded-lg bg-slate-100 dark:bg-slate-800 ${PULSE}`} />
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`h-14 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 ${PULSE}`}
              />
            ))}
          </div>
        </div>
      )}

      {variant === 'tactics' && (
        <div className="p-3.5 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-3">
            <div className={`aspect-[4/5] sm:aspect-[16/11] w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-emerald-500/5 dark:bg-emerald-950/20 ${PULSE}`} />
            <div className={`h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`} />
          </div>
          <div className="lg:col-span-5 space-y-3">
            <div className={`h-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`} />
            <div className={`h-40 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`} />
          </div>
        </div>
      )}

      {variant === 'recruitment' && (
        <div className="p-3.5 sm:p-5 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-20 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`h-11 rounded-xl bg-slate-100 dark:bg-slate-800/70 ${PULSE}`}
              />
            ))}
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-16 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`}
              />
            ))}
          </div>
        </div>
      )}

      {(variant === 'matches' || variant === 'staff') && (
        <div className="p-3.5 sm:p-5 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-16 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`}
              />
            ))}
          </div>
          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-28 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Geometry-matched Suspense fallback for SaveSnapshotDiffPanel.
 */
export const JourneyPanelSkeleton: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading Save-to-Save Journey"
    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4 sm:p-5 space-y-4"
  >
    <span className="sr-only">Loading Save-to-Save Journey...</span>
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="space-y-1.5">
        <div className={`h-4 w-52 rounded-md bg-slate-200 dark:bg-slate-800 ${PULSE}`} />
        <div className={`h-3 w-72 max-w-full rounded-md bg-slate-200/70 dark:bg-slate-800/70 ${PULSE}`} />
      </div>
      <div className={`h-11 sm:h-9 w-36 rounded-lg bg-slate-200 dark:bg-slate-800 shrink-0 ${PULSE}`} />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className={`h-11 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 ${PULSE}`} />
      <div className={`h-11 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 ${PULSE}`} />
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`h-16 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`}
        />
      ))}
    </div>
  </div>
);

/**
 * Geometry-matched Suspense fallback for FmUploadProgressCard.
 * Matches its compact card height so upload handoff has no vertical jump.
 */
export const UploadProgressSkeleton: React.FC<{ label: string }> = ({ label }) => (
  <div
    role="status"
    aria-live="polite"
    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-3.5 sm:p-4 space-y-2.5"
  >
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
        {label}
      </div>
      <div className={`h-4 w-12 rounded-md bg-slate-200 dark:bg-slate-800 shrink-0 ${PULSE}`} />
    </div>
    <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
      <div className={`h-full w-1/3 rounded-full bg-emerald-500/60 ${PULSE}`} />
    </div>
  </div>
);

/**
 * Geometry-matched Suspense fallback for lazy Squad sub-views
 * (SquadAnalyticsView, SquadCompareView, SquadProgressionView).
 */
export const SquadSubViewSkeleton: React.FC<{
  variant: 'analytics' | 'compare' | 'progression';
}> = ({ variant }) => {
  const label =
    variant === 'analytics'
      ? 'Squad Analytics charts'
      : variant === 'compare'
        ? 'Player Comparison'
        : 'Progression Diff';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading ${label}`}
      className="pt-4 space-y-4"
    >
      <span className="sr-only">Loading {label}...</span>
      {variant === 'analytics' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`} />
            <div className={`h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`} />
          </div>
          <div className={`h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`} />
        </>
      )}

      {variant === 'compare' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className={`h-11 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`} />
            <div className={`h-11 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`} />
          </div>
          <div className={`h-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`} />
        </>
      )}

      {variant === 'progression' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-16 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`}
              />
            ))}
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-16 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 ${PULSE}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
