/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy } from 'react';
import { ChevronDown, ChevronUp, Database } from 'lucide-react';
import type { HydratedSaveState } from '../../utils/fmSaveHydrator';
import type { ClubGovernanceState } from '../../types/fmSave';
import type { computeCompetitiveSummary } from '../../utils/competitiveSummary';

const LiveFmSaveProofCard = lazy(() =>
  import('../LiveFmSaveProofCard').then((m) => ({ default: m.LiveFmSaveProofCard }))
);
const ClubGovernanceBanner = lazy(() =>
  import('../ClubGovernanceBanner').then((m) => ({ default: m.ClubGovernanceBanner }))
);

interface ClubBaselineStripProps {
  hydrated: HydratedSaveState | null;
  hasSave: boolean;
  saveDate: string;
  nextFixture: string;
  managerName: string;
  balance: string;
  wageSpend: string;
  squadSize: number;
  playerBasicWeekly: number;
  summary: ReturnType<typeof computeCompetitiveSummary>;
  leagueStandingSub: string;
  hasManualMatches: boolean;
  manualMatchCount: number;
  isRestoredFromMemory: boolean;
  showMobileDetails: boolean;
  liveGovernance: ClubGovernanceState | null;
  onToggleMobileDetails: () => void;
  onAskAnalystPrompt: (prompt: string) => void;
  onOpenCalibrationLab: () => void;
}

/**
 * The save receipt above the tabs: date and file, the club title, the four
 * headline numbers, then the verification card and the governance banner.
 * Renders nothing until a save exists.
 */
export function ClubBaselineStrip({
  hydrated,
  hasSave,
  saveDate,
  nextFixture,
  managerName,
  balance,
  wageSpend,
  squadSize,
  playerBasicWeekly,
  summary,
  leagueStandingSub,
  hasManualMatches,
  manualMatchCount,
  isRestoredFromMemory,
  showMobileDetails,
  liveGovernance,
  onToggleMobileDetails,
  onAskAnalystPrompt,
  onOpenCalibrationLab,
}: ClubBaselineStripProps) {
  if (!hasSave) return null;
  return (
    <>
        {/* Compact Status Bar (shown once a save is loaded so first-entry welcome hero stays clean) */}
        {hasSave && (
          <div className="md:hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                <span className="truncate">
                  {saveDate} · {hydrated?.leagueRecordLabel || `${squadSize} Players`}
                </span>
              </div>
              <div className="text-micro text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Next: {nextFixture} · Bal: {balance}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToggleMobileDetails()}
              className="inline-flex items-center gap-1 shrink-0 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap cursor-pointer"
            >
              {showMobileDetails ? (
                <>
                  Hide <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                </>
              ) : (
                <>
                  Club KPIs <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                </>
              )}
            </button>
          </div>
        )}

        {/* Executive Club & Save Baseline Strip (shown once a save is loaded; expandable on mobile) */}
        {hasSave && (
        <div className={showMobileDetails ? 'space-y-4' : 'hidden md:block space-y-5'}>
          <section className="p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    {hydrated
                      ? `${hydrated?.decodedPayload?.meta?.clubName} (${hydrated?.decodedPayload?.meta?.game} Build ${hydrated?.decodedPayload?.meta?.build})`
                      : 'Football Manager 27 · Local Browser Engine'}
                  </span>
                  <span>&middot;</span>
                  <span>
                    Save Date:{' '}
                    <span className="font-mono font-semibold text-slate-900 dark:text-emerald-300">
                      {saveDate}
                    </span>
                  </span>
                  <span
                    className={`px-2 py-0.5 text-2xs font-mono font-semibold rounded-md border ${
                      hydrated
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {hydrated
                      ? `LIVE .FM SYNCED (${hydrated?.decodedPayload?.meta?.fileName || hydrated?.decodedPayload?.meta?.saveName || '.fm'})`
                      : 'AWAITING .FM SAVE — DROP .FM SAVE TO SYNC'}
                  </span>

                  {isRestoredFromMemory && squadSize > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-mono font-semibold rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30">
                      <Database className="w-3 h-3 text-blue-400" />
                      MEMORY ACTIVE
                    </span>
                  )}
                </div>
                <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {hydrated
                    ? `${hydrated?.decodedPayload?.meta?.clubName} Command Hub`
                    : 'FM27 Command Hub & AI Tactical Co-Pilot'}
                </h2>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-400 lg:text-right space-y-1">
                <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                  Next Fixture: {nextFixture}
                </div>
                <div>
                  {hydrated
                    ? `Manager: ${managerName} · Decoded locally via fmsave ${hydrated?.decodedPayload?.meta?.fmsaveVersion}`
                    : 'Status: Zero Mock Baseline · Verified Patch 27.1.0 KB Ready'}
                </div>
              </div>
            </div>

            {/* 4-Column Quantitative KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {hydrated
                    ? `Live League Standing (${hydrated?.decodedPayload?.leagueStanding?.competitionName || 'League'})`
                    : 'League Standing'}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                  {(hasManualMatches ? null : hydrated?.leagueRecordLabel) ||
                    (summary.played > 0
                      ? `${summary.played} GP · ${summary.wins}W-${summary.draws}D-${summary.losses}L · ${summary.points} Pts`
                      : '--')}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {hasManualMatches
                    ? hydrated
                      ? `Includes ${manualMatchCount} chat-logged match${manualMatchCount === 1 ? '' : 'es'} not yet in the .fm save`
                      : 'Awaiting .fm save'
                    : hydrated?.leagueStandingLabel ||
                      (summary.played > 0
                        ? leagueStandingSub
                        : hydrated
                          ? '0 competitive matches played yet'
                          : 'Awaiting .fm save')}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {hydrated?.squadOutputLabel
                    ? 'Live Squad Season Output (All Comp)'
                    : 'Cumulative Expected Goals'}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {hydrated?.squadOutputLabel ||
                    (summary.played > 0
                      ? `${summary.totalXgFor.toFixed(2)} xGF vs ${summary.totalXgAgainst.toFixed(2)} xGA`
                      : '--')}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {hydrated?.squadOutputSubLabel ||
                    (summary.played > 0
                      ? `Net Quality Differential: ${summary.xgDiff >= 0 ? '+' : ''}${summary.xgDiff.toFixed(2)} xG`
                      : 'Awaiting .fm save')}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {hydrated
                    ? 'Live Active Tactic, Injuries & Mentoring'
                    : 'Dual-Phase Tactic & Setup'}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                  {hydrated?.tacticHeadlineLabel || '--'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {hydrated?.tacticSubLabel || 'Awaiting .fm save'}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Player Wage Bill &amp; Wage Compliance
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                  {wageSpend}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Balance: {balance} · {squadSize}-Man Squad
                  {(() => {
                    const basicSum = playerBasicWeekly;
                    const clubPayroll = hydrated?.decodedPayload?.finances?.wagePayrollWeekly;
                    if (basicSum <= 0) return null;
                    if (typeof clubPayroll === 'number' && Math.abs(clubPayroll - basicSum) < 5) {
                      return null;
                    }
                    return ` · Player Basic: £${basicSum.toLocaleString()}/wk`;
                  })()}
                </div>
              </div>
            </div>
          </section>

          {/* Live .fm Save Verification Receipt & Club Governance Banner */}
          {hydrated && (
            <Suspense fallback={null}>
              <LiveFmSaveProofCard hydrated={hydrated} />
            </Suspense>
          )}
          {hydrated && liveGovernance && (
            <Suspense fallback={null}>
              <ClubGovernanceBanner
                governance={liveGovernance}
                extractionManifest={hydrated?.decodedPayload?.extractionManifest ?? null}
                onAskAnalyst={onAskAnalystPrompt}
                onOpenCalibrationLab={onOpenCalibrationLab}
              />
            </Suspense>
          )}
        </div>
        )}
    </>
  );
}
