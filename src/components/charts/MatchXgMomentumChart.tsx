import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MatchLogEntry } from "../../types/fm27";
import { nextWindowLimit, takeLeadingWindow, takeTrailingWindow } from "../../utils/listWindow";
import {
  classifyMatchEntryBucket,
  deriveFootballSeasonLabel,
  extractMatchSeasons,
  formatCompetitionBucketTag,
  MatchCompetitionFilter,
  matchesEntryCompetitionFilter,
  parseScoreGoals,
} from "../../utils/matchScopeHelpers";
import {
  buildXgMomentumRankedRows,
  describeMatchXgVerdict,
  getResponsiveChartBox,
  resolveTouchTooltipSelection,
  type ChartViewMode,
} from "../../utils/mobileChartHelpers";
import {
  ChartRankedListToggle,
  useCompactChartViewport,
} from "../ChartRankedListToggle";

export interface MatchXgMomentumChartProps {
  matches: MatchLogEntry[];
  saveDate?: string;
  title?: string;
  controlledSeason?: string;
  onSeasonChange?: (season: string) => void;
  controlledScope?: MatchCompetitionFilter;
  onScopeChange?: (scope: MatchCompetitionFilter) => void;
}

export const MatchXgMomentumChart: React.FC<MatchXgMomentumChartProps> = ({
  matches,
  saveDate,
  title = 'Match xG Momentum & Finishing Variance',
  controlledSeason,
  onSeasonChange,
  controlledScope,
  onScopeChange,
}) => {
  const isMobile = useCompactChartViewport();
  const [viewMode, setViewMode] = useState<ChartViewMode>('chart');

  const { seasons, currentSeason } = useMemo(
    () => extractMatchSeasons(matches, saveDate),
    [matches, saveDate]
  );

  const [internalSeason, setInternalSeason] = useState<string>('');
  const selectedSeason = controlledSeason ?? internalSeason;
  const setSelectedSeason = (s: string) => {
    setInternalSeason(s);
    onSeasonChange?.(s);
  };
  const activeSeason =
    selectedSeason && (selectedSeason === 'ALL' || seasons.includes(selectedSeason))
      ? selectedSeason
      : currentSeason;

  const seasonMatches = useMemo(() => {
    const chrono = [...matches].reverse();
    if (!activeSeason || activeSeason === 'ALL') return chrono;
    return chrono.filter((m) => deriveFootballSeasonLabel(m.date) === activeSeason);
  }, [matches, activeSeason]);

  const scopeCounts = useMemo(() => {
    let league = 0;
    let cup = 0;
    let friendly = 0;
    for (const m of seasonMatches) {
      const b = classifyMatchEntryBucket(m, seasonMatches);
      if (b === 'league') league += 1;
      else if (b === 'cup') cup += 1;
      else friendly += 1;
    }
    return {
      competitive: league + cup,
      league,
      cup,
      friendly,
      all: seasonMatches.length,
    };
  }, [seasonMatches]);

  const [internalScope, setInternalScope] = useState<MatchCompetitionFilter | null>(null);
  const scope = controlledScope ?? internalScope;
  const setScope = (nextScope: MatchCompetitionFilter) => {
    setInternalScope(nextScope);
    onScopeChange?.(nextScope);
  };
  const activeScope: MatchCompetitionFilter =
    scope ?? (scopeCounts.competitive > 0 ? 'competitive' : 'all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      seasonMatches.filter((m) =>
        matchesEntryCompetitionFilter(m, activeScope, seasonMatches)
      ),
    [seasonMatches, activeScope]
  );

  const xgMatches = useMemo(
    () =>
      filtered.filter(
        (m) => typeof m.xGFor === 'number' && typeof m.xGAgainst === 'number'
      ),
    [filtered]
  );

  // Hundreds of plotted markers in a 350 px wide SVG overlap into noise and cost
  // thousands of nodes, so the chart draws a recent window. The list view and the
  // totals above still cover every match in scope.
  const plotLimit = isMobile ? 30 : 60;
  const plotMatches = useMemo(
    () => takeTrailingWindow(xgMatches, plotLimit),
    [xgMatches, plotLimit]
  );

  const rankedRows = useMemo(
    () => buildXgMomentumRankedRows(xgMatches),
    [xgMatches]
  );

  // The list view renders one card per match inside a fixed-height scroller, so a
  // long career would build hundreds of hidden rows. Show a page at a time.
  const [visibleRowLimit, setVisibleRowLimit] = useState(30);
  useEffect(() => {
    setVisibleRowLimit(30);
  }, [activeSeason, activeScope]);
  const visibleRankedRows = useMemo(
    () => takeLeadingWindow(rankedRows, visibleRowLimit),
    [rankedRows, visibleRowLimit]
  );

  const totals = useMemo(() => {
    let gf = 0;
    let ga = 0;
    let xgf = 0;
    let xga = 0;
    let pts = 0;
    for (const m of filtered) {
      const [g1, g2] = parseScoreGoals(m.score);
      gf += g1;
      ga += g2;
      if (m.result === 'W') pts += 3;
      else if (m.result === 'D') pts += 1;
      if (typeof m.xGFor === 'number') xgf += m.xGFor;
      if (typeof m.xGAgainst === 'number') xga += m.xGAgainst;
    }
    return {
      gp: filtered.length,
      gf,
      ga,
      xgf,
      xga,
      xgDiff: xgf - xga,
      finishingDelta: gf - xgf,
      ppg: filtered.length > 0 ? pts / filtered.length : 0,
    };
  }, [filtered]);

  const selectedIndex = useMemo(() => {
    if (plotMatches.length === 0) return -1;
    const found = plotMatches.findIndex((m) => m.id === selectedId);
    return found >= 0 ? found : plotMatches.length - 1;
  }, [plotMatches, selectedId]);

  const selectedMatch = selectedIndex >= 0 ? plotMatches[selectedIndex] : null;

  if (matches.length === 0) {
    return null;
  }

  const box = getResponsiveChartBox('xgTrend', isMobile);
  const { width, height, padL, padR, padT, plotW, plotH } = box;

  const maxXg = Math.max(
    2.5,
    ...plotMatches.map((m) => Math.max(m.xGFor || 0, m.xGAgainst || 0))
  );
  const yCeiling = Math.ceil(maxXg * 2) / 2;

  const mapX = (idx: number, count: number) =>
    count <= 1 ? padL + plotW / 2 : padL + (idx / (count - 1)) * plotW;
  const mapY = (val: number) =>
    padT + plotH - (Math.min(yCeiling, Math.max(0, val)) / yCeiling) * plotH;

  const xgForLine = plotMatches
    .map((m, idx) => `${mapX(idx, plotMatches.length).toFixed(1)},${mapY(m.xGFor || 0).toFixed(1)}`)
    .join(' ');
  const xgAgLine = plotMatches
    .map((m, idx) => `${mapX(idx, plotMatches.length).toFixed(1)},${mapY(m.xGAgainst || 0).toFixed(1)}`)
    .join(' ');

  const hitColWidth =
    plotMatches.length > 1
      ? Math.max(14, plotW / (plotMatches.length - 1))
      : plotW;

  const scopeTabs: Array<{ id: MatchCompetitionFilter; label: string; count: number }> = [
    { id: 'competitive', label: 'Competitive', count: scopeCounts.competitive },
    { id: 'league', label: 'League', count: scopeCounts.league },
    { id: 'cup', label: 'Cup', count: scopeCounts.cup },
    { id: 'friendly', label: 'Friendlies', count: scopeCounts.friendly },
    { id: 'all', label: 'All', count: scopeCounts.all },
  ];

  const verdictToneClass = (tone: 'emerald' | 'sky' | 'amber' | 'rose') => {
    if (tone === 'emerald') return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30';
    if (tone === 'sky') return 'text-sky-300 bg-sky-500/15 border-sky-500/30';
    if (tone === 'amber') return 'text-amber-300 bg-amber-500/15 border-amber-500/30';
    return 'text-rose-300 bg-rose-500/15 border-rose-500/30';
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 sm:p-4 space-y-3 min-w-0">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-white">{title}</h3>
              {activeSeason && activeSeason !== 'ALL' && (
                <span className="rounded-md border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-2xs font-semibold text-emerald-300">
                  {activeSeason}
                </span>
              )}
            </div>
            <p className="text-micro text-slate-400 mt-0.5">
              {totals.gp} matches · {totals.ppg.toFixed(2)} PPG · xG{' '}
              <span className="font-mono tabular-nums text-emerald-300">
                {totals.xgf.toFixed(2)}
              </span>
              {' - '}
              <span className="font-mono tabular-nums text-rose-300">
                {totals.xga.toFixed(2)}
              </span>{' '}
              ({totals.xgDiff >= 0 ? '+' : ''}
              {totals.xgDiff.toFixed(2)}) · Finishing{' '}
              <span
                className={`font-mono tabular-nums ${
                  totals.finishingDelta >= 0 ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {totals.finishingDelta >= 0 ? '+' : ''}
                {totals.finishingDelta.toFixed(2)} vs xG
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {xgMatches.length >= 2 && (
              <ChartRankedListToggle
                mode={viewMode}
                onChange={setViewMode}
                ariaLabel="Switch match xG momentum between chart and match list"
                listLabel="Match List"
                count={xgMatches.length}
              />
            )}
          </div>
        </div>

        {seasons.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 text-micro">
            {seasons.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedSeason(s)}
                className={`min-h-[44px] sm:min-h-[30px] px-2.5 rounded-md border font-mono font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  activeSeason === s
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedSeason('ALL')}
              className={`min-h-[44px] sm:min-h-[30px] px-2.5 rounded-md border font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeSeason === 'ALL'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              All Seasons
            </button>
          </div>
        )}

        {/* Separate Competition Scope Tabs + Clear Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-micro">
          <div className="flex flex-wrap gap-1">
            {scopeTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setScope(tab.id)}
                className={`min-h-[44px] sm:min-h-[32px] px-2.5 rounded-lg border font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  activeScope === tab.id
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                {tab.label}{' '}
                <span className="font-mono text-2xs opacity-75">({tab.count})</span>
              </button>
            ))}
          </div>
          {viewMode === 'chart' && (
            <div className="flex items-center gap-3 text-2xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3.5 bg-emerald-400 inline-block" /> xG For
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3.5 border-t-2 border-dashed border-rose-400 inline-block" /> xG Against
              </span>
            </div>
          )}
        </div>
      </div>

      {xgMatches.length < 2 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
          Need at least 2 played matches with xG in this scope ({xgMatches.length} currently available in{' '}
          {activeSeason === 'ALL' ? 'all seasons' : activeSeason} · {activeScope}).
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-0.5">
          {visibleRankedRows.map((row) => {
            const bucket = classifyMatchEntryBucket(row.match, matches);
            const resClass =
              row.match.result === 'W'
                ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/35'
                : row.match.result === 'D'
                  ? 'text-amber-300 bg-amber-500/15 border-amber-500/35'
                  : 'text-rose-400 bg-rose-500/15 border-rose-500/35';
            return (
              <div
                key={row.match.id}
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-1.5">
                    <span className="font-mono text-2xs text-slate-400 shrink-0">
                      {row.match.date}
                    </span>
                    <span className="text-xs font-semibold text-white truncate">
                      vs {row.match.opponent} ({row.match.venue})
                    </span>
                  </div>
                  <span
                    className={`rounded-md border px-2 py-0.5 font-mono text-micro font-bold shrink-0 tabular-nums ${resClass}`}
                  >
                    {row.match.result} {row.match.score}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-micro">
                  <div className="flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
                    <span className="text-emerald-300">
                      xG {row.xgFor.toFixed(2)}–{row.xgAgainst.toFixed(2)}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="text-2xs text-slate-400 font-sans">
                      {formatCompetitionBucketTag(bucket)}
                    </span>
                    {row.match.possession != null && (
                      <span className="text-slate-400">{row.match.possession}%</span>
                    )}
                  </div>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-2xs font-semibold ${verdictToneClass(
                      row.verdictTone
                    )}`}
                  >
                    {row.verdict}
                  </span>
                </div>
              </div>
            );
          })}
          {rankedRows.length > visibleRankedRows.length && (
            <div className="flex items-center justify-between gap-2 pt-1.5">
              <span className="text-micro text-slate-400">
                Showing {visibleRankedRows.length} of {rankedRows.length} matches in this chart list
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleRowLimit((prev) => nextWindowLimit(prev, 30, rankedRows.length))
                  }
                  className="min-h-[44px] sm:min-h-[30px] px-2.5 py-1 rounded-lg text-micro font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer transition"
                >
                  Show 30 More
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleRowLimit(rankedRows.length)}
                  className="min-h-[44px] sm:min-h-[30px] px-2.5 py-1 rounded-lg text-micro font-semibold bg-emerald-600/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/25 cursor-pointer transition"
                >
                  Show All ({rankedRows.length})
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Match xG For vs xG Against trend line chart"
            className="w-full h-auto rounded-lg bg-slate-950/60 border border-slate-800 select-none"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((f) => {
              const tick = yCeiling * f;
              const y = mapY(tick);
              return (
                <g key={f}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={width - padR}
                    y2={y}
                    stroke="rgba(51, 65, 85, 0.55)"
                    strokeWidth={0.75}
                  />
                  <text
                    x={padL - 6}
                    y={y + 3}
                    textAnchor="end"
                    className={`fill-slate-400 font-mono tabular-nums ${box.axisFontClass}`}
                  >
                    {tick.toFixed(1)}
                  </text>
                </g>
              );
            })}

            <polyline
              fill="none"
              stroke="#10b981"
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={xgForLine}
            />
            <polyline
              fill="none"
              stroke="#f43f5e"
              strokeWidth={2}
              strokeDasharray="4 2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={xgAgLine}
            />

            {plotMatches.map((m, idx) => {
              const x = mapX(idx, plotMatches.length);
              const yFor = mapY(m.xGFor || 0);
              const yAg = mapY(m.xGAgainst || 0);
              const isSel = selectedMatch?.id === m.id;
              const resultColor =
                m.result === 'W'
                  ? '#10b981'
                  : m.result === 'D'
                    ? '#f59e0b'
                    : '#f43f5e';
              const labelStep = Math.max(
                1,
                Math.floor(plotMatches.length / (isMobile ? 4 : 5))
              );
              return (
                <g
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className="cursor-pointer"
                >
                  {/* Full-height invisible touch strip for reliable mobile taps */}
                  <rect
                    x={x - hitColWidth / 2}
                    y={padT}
                    width={hitColWidth}
                    height={plotH + 22}
                    fill="transparent"
                  />
                  {isSel && (
                    <line
                      x1={x}
                      y1={padT}
                      x2={x}
                      y2={padT + plotH}
                      stroke="rgba(148, 163, 184, 0.45)"
                      strokeWidth={1.2}
                    />
                  )}
                  <circle
                    cx={x}
                    cy={yFor}
                    r={isSel ? box.selectedDotRadius : box.dotRadius}
                    fill="#10b981"
                    stroke={isSel ? '#ffffff' : '#022c22'}
                    strokeWidth={isSel ? 1.8 : 1}
                  />
                  <circle
                    cx={x}
                    cy={yAg}
                    r={isSel ? Math.max(4.5, box.selectedDotRadius - 0.5) : Math.max(3, box.dotRadius - 0.5)}
                    fill="#f43f5e"
                    stroke={isSel ? '#ffffff' : '#4c0519'}
                    strokeWidth={isSel ? 1.8 : 1}
                  />
                  <circle cx={x} cy={height - 18} r={isSel ? 4.2 : 3.5} fill={resultColor} />
                  {(idx === 0 ||
                    idx === plotMatches.length - 1 ||
                    idx % labelStep === 0) && (
                    <text
                      x={x}
                      y={height - 4}
                      textAnchor="middle"
                      className={`fill-slate-400 font-mono ${box.labelFontClass}`}
                    >
                      {m.date.slice(0, 5)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {plotMatches.length < xgMatches.length && (
            <p className="pt-1 text-micro text-slate-400">
              Chart plots the latest {plotMatches.length} of {xgMatches.length} matches in scope. Totals above and the Match List cover all of them.
            </p>
          )}

          {selectedMatch && (() => {
            const selBucket = classifyMatchEntryBucket(selectedMatch, matches);
            const bucketBadgeClass =
              selBucket === 'league'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                : selBucket === 'cup'
                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/35'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/35';
            const [gf] = parseScoreGoals(selectedMatch.score);
            const xgF = selectedMatch.xGFor ?? 0;
            const xgA = selectedMatch.xGAgainst ?? 0;
            const verdict = describeMatchXgVerdict(xgF - xgA, gf - xgF);

            return (
              <div className="rounded-xl border border-slate-800 bg-slate-950/85 px-3 py-2.5 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-slate-200 min-w-0">
                    <span className={`rounded-md border px-1.5 py-0.5 font-mono text-3xs font-bold shrink-0 ${bucketBadgeClass}`}>
                      {formatCompetitionBucketTag(selBucket)}
                    </span>
                    <span className="font-mono text-slate-400 shrink-0">{selectedMatch.date}</span>
                    <span className="font-semibold text-white break-words">
                      vs {selectedMatch.opponent} ({selectedMatch.venue})
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label="Previous match"
                      disabled={selectedIndex <= 0}
                      onClick={() => {
                        if (selectedIndex > 0) setSelectedId(plotMatches[selectedIndex - 1].id);
                      }}
                      className="min-h-[44px] min-w-[44px] sm:min-h-[30px] sm:min-w-[30px] inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 disabled:opacity-35 cursor-pointer"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next match"
                      disabled={selectedIndex >= plotMatches.length - 1}
                      onClick={() => {
                        if (selectedIndex < plotMatches.length - 1) {
                          setSelectedId(plotMatches[selectedIndex + 1].id);
                        }
                      }}
                      className="min-h-[44px] min-w-[44px] sm:min-h-[30px] sm:min-w-[30px] inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 disabled:opacity-35 cursor-pointer"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2.5 font-mono tabular-nums text-micro">
                    <span
                      className={
                        selectedMatch.result === 'W'
                          ? 'text-emerald-400 font-semibold'
                          : selectedMatch.result === 'D'
                            ? 'text-amber-300 font-semibold'
                            : 'text-rose-400 font-semibold'
                      }
                    >
                      {selectedMatch.result} {selectedMatch.score}
                    </span>
                    <span className="text-emerald-300">
                      xG {xgF.toFixed(2)}–{xgA.toFixed(2)}
                    </span>
                    {selectedMatch.possession != null && (
                      <span className="text-slate-400">{selectedMatch.possession}% poss</span>
                    )}
                  </div>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-2xs font-semibold ${verdictToneClass(
                      verdict.tone
                    )}`}
                  >
                    {verdict.verdict}
                  </span>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
};

