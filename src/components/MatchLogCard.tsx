/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import type { MatchLogEntry } from '../types/fm27';
import type { PostMatchDebriefData } from './MatchLogArchive';

interface MatchLogCardProps {
  match: MatchLogEntry;
  seasonLabel: string;
  compBucket: 'league' | 'cup' | 'friendly';
  isDebriefOpen: boolean;
  onToggleDebrief: () => void;
  debrief: PostMatchDebriefData | null;
  hasAiDebrief: boolean;
  isLoadingAi: boolean;
  aiError?: string;
  onRequestAiDebrief: () => void;
}

/**
 * Complete-KPI Match Card for mobile & desktop Match Log Archive.
 * Surfaces Result/Score, xG Battle & delta, Shots, Possession, and Pass %
 * in a clean 2×2 mobile / 4-column desktop KPI block with 44px touch targets.
 */
export const MatchLogCard: React.FC<MatchLogCardProps> = ({
  match: m,
  seasonLabel,
  compBucket,
  isDebriefOpen,
  onToggleDebrief,
  debrief,
  hasAiDebrief,
  isLoadingAi,
  aiError,
  onRequestAiDebrief,
}) => {
  const hasXg = typeof m.xGFor === 'number' && typeof m.xGAgainst === 'number';
  const xgDelta = hasXg ? Number(((m.xGFor ?? 0) - (m.xGAgainst ?? 0)).toFixed(2)) : null;

  const resultBadge =
    m.result === 'W'
      ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40'
      : m.result === 'D'
        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40'
        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40';

  const resultHairlineBorder =
    m.result === 'W'
      ? 'border-emerald-500/30 dark:border-emerald-500/25'
      : m.result === 'D'
        ? 'border-amber-500/30 dark:border-amber-500/25'
        : 'border-rose-500/30 dark:border-rose-500/25';

  const hasShots = Boolean(m.shotsFor && m.shotsFor !== '—' && m.shotsFor !== '-');
  const hasMetrics =
    hasXg || m.possession !== null || hasShots || m.passCompletion !== null;

  return (
    <div
      className={`rounded-xl border ${resultHairlineBorder} bg-white dark:bg-slate-950/60 p-3.5 space-y-2.5`}
    >
      {/* Top Row: Clean unboxed metadata + crisp scoreline badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
            <span className="font-mono tabular-nums">{m.date}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">
              {seasonLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span
              className={`font-semibold truncate max-w-[165px] sm:max-w-none ${
                compBucket === 'league'
                  ? 'text-emerald-800 dark:text-emerald-300'
                  : compBucket === 'cup'
                    ? 'text-sky-700 dark:text-sky-300'
                    : 'text-amber-700 dark:text-amber-300'
              }`}
            >
              {m.competition}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
              vs {m.opponent}
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {m.venue === 'H' ? 'Home' : 'Away'}
            </span>
            {xgDelta !== null && (
              <>
                <span aria-hidden="true" className="text-[11px] text-slate-400 dark:text-slate-600">
                  ·
                </span>
                <span
                  className={`text-[11px] font-mono font-bold tabular-nums ${
                    xgDelta >= 0.35
                      ? 'text-emerald-800 dark:text-emerald-300'
                      : xgDelta <= -0.35
                        ? 'text-rose-700 dark:text-rose-300'
                        : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  xG {xgDelta >= 0 ? '+' : ''}
                  {xgDelta.toFixed(2)}
                </span>
              </>
            )}
          </div>
        </div>

        <span
          className={`shrink-0 rounded-lg border px-2.5 py-1 text-sm font-mono font-extrabold tabular-nums whitespace-nowrap ${resultBadge}`}
        >
          {m.result} {m.score}
        </span>
      </div>

      {/* Complete-KPI Match Stat Grid (2x2 on phones, 4-across on sm+) */}
      {hasMetrics ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 px-2.5 py-1.5 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              xG Battle
            </div>
            <div className="mt-0.5 font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100 truncate">
              {hasXg
                ? `${m.xGFor?.toFixed(2)} – ${m.xGAgainst?.toFixed(2)}`
                : '—'}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 px-2.5 py-1.5 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Shots
            </div>
            <div className="mt-0.5 font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100 truncate">
              {hasShots
                ? `${m.shotsFor}${
                    m.shotsAgainst && m.shotsAgainst !== '—'
                      ? ` vs ${m.shotsAgainst}`
                      : ''
                  }`
                : '—'}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 px-2.5 py-1.5 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Possession
            </div>
            <div className="mt-0.5 font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100 truncate">
              {m.possession !== null
                ? `${Number(m.possession).toFixed(
                    Number.isInteger(m.possession) ? 0 : 1
                  )}%`
                : '—'}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 px-2.5 py-1.5 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Pass Acc.
            </div>
            <div className="mt-0.5 font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100 truncate">
              {m.passCompletion !== null ? `${m.passCompletion}%` : '—'}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800/70 bg-slate-50 dark:bg-slate-900/40 px-2.5 py-1.5 text-[11px] text-slate-600 dark:text-slate-400">
          Scoreline &amp; result recorded · Detailed xG/shot stats unavailable in save
        </div>
      )}

      {/* Touch-Friendly Debrief Toggle */}
      <div className="flex items-center justify-end pt-0.5">
        <button
          type="button"
          onClick={onToggleDebrief}
          className={`w-full sm:w-auto min-h-[44px] sm:min-h-[34px] inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
            isDebriefOpen
              ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40'
              : 'bg-slate-100 dark:bg-slate-900/80 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-emerald-500/40'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{isDebriefOpen ? 'Hide Post-Match Debrief' : 'Post-Match Debrief'}</span>
          {isDebriefOpen ? (
            <ChevronUp className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          )}
        </button>
      </div>

      {/* Expanded Debrief Panel */}
      {isDebriefOpen && debrief && (
        <div className="rounded-xl border border-emerald-500/30 bg-slate-50 dark:bg-slate-950/90 p-3.5 space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-emerald-800 dark:text-emerald-300">{debrief.headlineVerdict}</div>
              <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 mt-0.5">
                {debrief.xgAndExecutionAudit}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                {debrief.source}
              </span>
              {!hasAiDebrief && (
                <button
                  type="button"
                  disabled={isLoadingAi}
                  onClick={onRequestAiDebrief}
                  className="min-h-[44px] sm:min-h-[36px] rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-1.5 text-xs sm:text-[11px] font-semibold text-white transition cursor-pointer whitespace-nowrap"
                >
                  {isLoadingAi ? 'Analyzing…' : 'Deep AI Debrief'}
                </button>
              )}
            </div>
          </div>

          {aiError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
              {aiError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-2.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                Primary Tactical Flaws
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                {debrief.primaryTacticalFlaws.map((f, idx) => (
                  <li key={idx}>{f}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-2.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                Dual-Phase Role Audit
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                {debrief.subOptimalRoleCombinations.map((r, idx) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-2.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                In-Game Adjustments
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                {debrief.inGameAdjustmentRecommendations.map((adj, idx) => (
                  <li key={idx}>{adj}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
