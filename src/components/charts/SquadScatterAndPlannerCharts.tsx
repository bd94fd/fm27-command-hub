import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PlayerRecord } from "../../types/fm27";
import type { LastMatchTacticBlueprint, SquadPlannerSlot } from "../../types/fmSave";
import type { PositionalSigningNeed } from "../../utils/transferAudit";
import {
  formatSquadPlannerSeasonLabel,
  normalizeTacticPositionToPlannerCode,
  resolveSquadPlannerSlotMeta,
} from "../../utils/squadPlannerHelper";
import {
  classifyScatterQuadrant,
  getResponsiveChartBox,
  rankAgeValuePlayers,
  rankScatterExplorerPlayers,
  resolveTouchTooltipSelection,
  type ChartViewMode,
  type ScatterExplorerPresetKey,
} from "../../utils/mobileChartHelpers";
import {
  ChartRankedListToggle,
  useCompactChartViewport,
} from "../ChartRankedListToggle";

import {
  type DynamicScatterScale,
  formatDynamicCurrency,
  computeDynamicScatterScale,
} from './chartScaleHelpers';

export {
  type DynamicScatterScale,
  formatDynamicCurrency,
  computeDynamicScatterScale,
};

export interface SquadAgeValueScatterPlotProps {
  players: PlayerRecord[];
  selectedPlayerId?: string | null;
  onSelectPlayer?: (player: PlayerRecord) => void;
}

type ScatterXMetric = 'age' | 'pace' | 'stamina' | 'passing' | 'decisions';
type ScatterYMetric = 'auto' | 'ability' | 'rating' | 'xGPer90';
type PositionGroupFilter = 'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD';

function matchesPosGroup(pos: string, group: PositionGroupFilter): boolean {
  if (group === 'ALL') return true;
  const p = (pos || '').toUpperCase();
  if (group === 'GK') return p.includes('GK');
  if (group === 'DEF') return /(DC|CB|DL|DR|WB|D\s*\()/.test(p);
  if (group === 'MID') return /(DM|MC|CM|ML|MR|AM|M\s*\()/.test(p);
  return /(ST|CF|LW|RW|F\s*\()/.test(p);
}

export const SquadAgeValueScatterPlot: React.FC<SquadAgeValueScatterPlotProps> = ({
  players,
  selectedPlayerId = null,
  onSelectPlayer,
}) => {
  const isMobile = useCompactChartViewport();
  const [viewMode, setViewMode] = useState<ChartViewMode>('chart');
  const [hovered, setHovered] = useState<PlayerRecord | null>(null);
  const [pinned, setPinned] = useState<PlayerRecord | null>(null);
  const [xMetric, setXMetric] = useState<ScatterXMetric>('age');
  const [yMetric, setYMetric] = useState<ScatterYMetric>('auto');
  const [posGroup, setPosGroup] = useState<PositionGroupFilter>('ALL');

  const filteredPlayers = useMemo(
    () => players.filter((p) => matchesPosGroup(p.position, posGroup)),
    [players, posGroup]
  );

  const scale = useMemo(
    () => computeDynamicScatterScale(filteredPlayers.length > 0 ? filteredPlayers : players),
    [filteredPlayers, players]
  );

  const box = getResponsiveChartBox('scatter', isMobile);
  const { width, height, padL: padLeft, padR: padRight, padT: padTop, plotW, plotH } = box;

  const getXVal = (p: PlayerRecord): number => {
    if (xMetric === 'age') return p.age || 22;
    return Number(p.attributes?.[xMetric] ?? 10);
  };

  const getYVal = (p: PlayerRecord): number => {
    if (yMetric === 'ability') return p.ability || 0;
    if (yMetric === 'rating') return p.rating ?? 6.5;
    if (yMetric === 'xGPer90') return p.xGPer90 || 0;
    return scale.metric === 'marketValue' ? p.marketValue || 0 : p.wagePw || 0;
  };

  const xLabel =
    xMetric === 'age'
      ? 'Age'
      : xMetric.charAt(0).toUpperCase() + xMetric.slice(1);
  const yLabel =
    yMetric === 'auto'
      ? scale.metricLabel
      : yMetric === 'ability'
        ? 'Ability ★'
        : yMetric === 'rating'
          ? 'Avg Rating'
          : 'xG / 90';

  const ages = filteredPlayers.map((p) => p.age || 22);
  const minX = xMetric === 'age' ? Math.min(17, ...(ages.length > 0 ? ages : [18])) : 1;
  const maxX = xMetric === 'age' ? Math.max(35, ...(ages.length > 0 ? ages : [34])) : 20;
  const xSpan = Math.max(1, maxX - minX);

  const minY = yMetric === 'rating' ? 5.5 : 0;
  const maxY =
    yMetric === 'auto'
      ? scale.maxY
      : yMetric === 'ability'
        ? 5
        : yMetric === 'rating'
          ? 8.5
          : Math.max(0.8, ...filteredPlayers.map((p) => p.xGPer90 || 0)) * 1.15;
  const ySpan = Math.max(0.01, maxY - minY);

  const mapX = (val: number) =>
    padLeft + ((Math.min(maxX, Math.max(minX, val)) - minX) / xSpan) * plotW;
  const mapY = (val: number) =>
    padTop + plotH - ((Math.min(maxY, Math.max(minY, val)) - minY) / ySpan) * plotH;

  const formatY = (val: number) => {
    if (yMetric === 'auto') return scale.formatTick(val);
    if (yMetric === 'ability') return `${val.toFixed(1)}★`;
    if (yMetric === 'rating') return val.toFixed(2);
    return val.toFixed(2);
  };

  const yTicks =
    yMetric === 'auto'
      ? scale.ticks
      : [0, 0.25, 0.5, 0.75, 1].map((f) => minY + ySpan * f);

  const xTicks =
    xMetric === 'age'
      ? [minX, Math.round((minX + maxX) / 2), 23, 29, maxX]
          .filter((v, i, arr) => v >= minX && v <= maxX && arr.indexOf(v) === i)
          .sort((a, b) => a - b)
      : [1, 5, 10, 15, 20];

  // Peak age band (23–28) when X is age
  const peakX1 = mapX(Math.max(minX, 23));
  const peakX2 = mapX(Math.min(maxX, 28));

  const activePlayer = resolveTouchTooltipSelection(
    pinned && filteredPlayers.some((p) => p.id === pinned.id) ? pinned : null,
    hovered
  );

  const rankedRows = useMemo(
    () => rankAgeValuePlayers(filteredPlayers, getXVal, getYVal),
    [filteredPlayers, xMetric, yMetric, scale.metric]
  );

  return (
    <div className="space-y-2.5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-200">
          {xLabel} vs {yLabel} ({filteredPlayers.length} players)
        </span>
        <ChartRankedListToggle
          mode={viewMode}
          onChange={setViewMode}
          ariaLabel="Switch squad scatter between chart and ranked list"
          count={filteredPlayers.length}
        />
      </div>

      {/* Compact X/Y controls + Position filter chips */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map((grp) => (
            <button
              key={grp}
              type="button"
              onClick={() => setPosGroup(grp)}
              className={`min-h-[44px] sm:min-h-[32px] px-2.5 rounded-lg text-xs sm:text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                posGroup === grp
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {grp}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <label className="inline-flex items-center gap-1 text-slate-400">
            X:
            <select
              value={xMetric}
              onChange={(e) => setXMetric(e.target.value as ScatterXMetric)}
              className="min-h-[44px] sm:min-h-[32px] rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-200 text-base sm:text-[11px]"
            >
              <option value="age">Age</option>
              <option value="pace">Pace</option>
              <option value="stamina">Stamina</option>
              <option value="passing">Passing</option>
              <option value="decisions">Decisions</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1 text-slate-400">
            Y:
            <select
              value={yMetric}
              onChange={(e) => setYMetric(e.target.value as ScatterYMetric)}
              className="min-h-[44px] sm:min-h-[32px] rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-200 text-base sm:text-[11px]"
            >
              <option value="auto">{scale.metricLabel}</option>
              <option value="ability">Ability ★</option>
              <option value="rating">Avg Rating</option>
              <option value="xGPer90">xG / 90</option>
            </select>
          </label>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-0.5">
          {rankedRows.map(({ rank, player: p, xVal, yVal }) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPlayer?.(p)}
              className="w-full min-h-[48px] text-left rounded-xl border border-slate-800 bg-slate-950/70 hover:border-emerald-500/40 px-3 py-2 flex items-center justify-between gap-2 transition cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-6 font-mono text-[11px] font-bold text-slate-500 shrink-0">
                  #{rank}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {p.name}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {p.position} · {p.ability.toFixed(1)}★ · {xLabel}:{' '}
                    {xMetric === 'age' ? `${xVal}y` : xVal}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-mono font-bold text-emerald-300 tabular-nums">
                  {formatY(yVal)}
                </div>
                <div className="text-[10px] text-slate-500">{yLabel}</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`Squad ${xLabel} vs ${yLabel} scatter plot`}
            className="w-full h-auto rounded-lg bg-slate-950/60 border border-slate-800 select-none"
          >
            {/* Peak-age shading (23–28) */}
            {xMetric === 'age' && (
              <>
                <rect
                  x={peakX1}
                  y={padTop}
                  width={Math.max(0, peakX2 - peakX1)}
                  height={plotH}
                  fill="rgba(16, 185, 129, 0.06)"
                />
                <text
                  x={(peakX1 + peakX2) / 2}
                  y={padTop + 12}
                  textAnchor="middle"
                  className={`fill-emerald-500/75 font-semibold ${box.labelFontClass}`}
                >
                  Peak (23–28)
                </text>
              </>
            )}

            {/* Horizontal gridlines + dynamic Y ticks */}
            {yTicks.map((tick) => {
              const y = mapY(tick);
              return (
                <g key={`y-${tick}`}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    stroke="currentColor"
                    strokeWidth={0.75}
                    className="text-slate-800"
                  />
                  <text
                    x={padLeft - 7}
                    y={y + 3}
                    textAnchor="end"
                    className={`fill-slate-400 font-mono tabular-nums ${box.axisFontClass}`}
                  >
                    {formatY(tick)}
                  </text>
                </g>
              );
            })}

            {/* Vertical X ticks */}
            {xTicks.map((tickVal) => {
              const x = mapX(tickVal);
              return (
                <g key={`x-${tickVal}`}>
                  <line
                    x1={x}
                    y1={padTop}
                    x2={x}
                    y2={padTop + plotH}
                    stroke="currentColor"
                    strokeDasharray="2 3"
                    strokeWidth={0.6}
                    className="text-slate-800"
                  />
                  <text
                    x={x}
                    y={height - 12}
                    textAnchor="middle"
                    className={`fill-slate-400 font-mono tabular-nums ${box.axisFontClass}`}
                  >
                    {xMetric === 'age' ? `${tickVal}y` : tickVal}
                  </text>
                </g>
              );
            })}

            {/* Player scatter dots with touch hit targets */}
            {filteredPlayers.map((p) => {
              const x = mapX(getXVal(p));
              const y = mapY(getYVal(p));
              const isBanned =
                Array.isArray(p.activeSuspensions) && p.activeSuspensions.length > 0;
              const isSelected =
                p.id === selectedPlayerId || activePlayer?.id === p.id;
              const fill = isBanned
                ? '#f43f5e'
                : p.age <= 21
                  ? '#38bdf8'
                  : p.age >= 30
                    ? '#f59e0b'
                    : '#10b981';

              return (
                <g
                  key={p.id}
                  onMouseEnter={() => setHovered(p)}
                  onMouseLeave={() => setHovered((curr) => (curr?.id === p.id ? null : curr))}
                  onClick={() => {
                    if (pinned?.id === p.id) {
                      onSelectPlayer?.(p);
                    } else {
                      setPinned(p);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <circle cx={x} cy={y} r={box.hitRadius} fill="transparent" />
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? box.selectedDotRadius : box.dotRadius}
                    fill={fill}
                    fillOpacity={isSelected ? 0.96 : 0.8}
                    stroke={isSelected ? '#ffffff' : '#0f172a'}
                    strokeWidth={isSelected ? 2 : 1}
                  />
                </g>
              );
            })}
          </svg>

          {/* Docked tap-to-inspect strip */}
          {activePlayer ? (
            <div className="rounded-xl border border-emerald-500/35 bg-slate-950/90 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <div className="font-semibold text-white truncate">
                  {activePlayer.name}{' '}
                  <span className="font-mono text-[11px] text-emerald-300">
                    ({activePlayer.position})
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-300 tabular-nums">
                  {xLabel}: {xMetric === 'age' ? `${getXVal(activePlayer)}y` : getXVal(activePlayer)}{' '}
                  · {yLabel}: {formatY(getYVal(activePlayer))} · {activePlayer.ability.toFixed(1)}★
                </div>
              </div>
              {onSelectPlayer && (
                <button
                  type="button"
                  onClick={() => onSelectPlayer(activePlayer)}
                  className="min-h-[44px] sm:min-h-[32px] px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-semibold text-emerald-300 cursor-pointer shrink-0 whitespace-nowrap"
                >
                  Open Profile →
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-1.5 text-[11px] text-slate-400">
              Tap any dot to inspect player details, or switch to Ranked List.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-sky-400" /> U21 Prospect
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Prime (22–29)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-400" /> Senior (30+)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> Suspended
            </span>
          </div>
        </>
      )}
    </div>
  );
};


export interface InteractiveScatterExplorerProps {
  players: PlayerRecord[];
  selectedPlayerId?: string | null;
  onSelectPlayer?: (player: PlayerRecord) => void;
}

type ScatterPresetKey = ScatterExplorerPresetKey;

const SCATTER_PRESETS: Array<{
  key: ScatterPresetKey;
  label: string;
  xLabel: string;
  yLabel: string;
  quadrantTopRight: string;
  quadrantBottomLeft: string;
}> = [
  {
    key: 'ageValue',
    label: 'Age vs Wage / Value',
    xLabel: 'Age',
    yLabel: 'Wage / Value',
    quadrantTopRight: 'High-Cost Veterans',
    quadrantBottomLeft: 'Low-Cost Youth',
  },
  {
    key: 'attackOutput',
    label: 'xG/90 vs xA/90',
    xLabel: 'xG / 90',
    yLabel: 'xA / 90',
    quadrantTopRight: 'Dual Goal + Creator',
    quadrantBottomLeft: 'Low Attack Volume',
  },
  {
    key: 'transitionEngine',
    label: 'Pace vs Stamina (27.1.0)',
    xLabel: 'Pace',
    yLabel: 'Stamina',
    quadrantTopRight: 'Elite 27.1.0 Runner',
    quadrantBottomLeft: 'Fatigue / Speed Risk',
  },
  {
    key: 'valueEfficiency',
    label: 'Rating vs Weekly Wage',
    xLabel: 'Weekly Wage (£)',
    yLabel: 'Avg Rating',
    quadrantTopRight: 'Paid Leaders',
    quadrantBottomLeft: 'Low-Wage Underperformers',
  },
];

export const InteractiveScatterExplorer: React.FC<InteractiveScatterExplorerProps> = ({
  players,
  selectedPlayerId = null,
  onSelectPlayer,
}) => {
  const isMobile = useCompactChartViewport();
  const [viewMode, setViewMode] = useState<ChartViewMode>('chart');
  const [preset, setPreset] = useState<ScatterPresetKey>('transitionEngine');
  const [posGroup, setPosGroup] = useState<PositionGroupFilter>('ALL');
  const [hovered, setHovered] = useState<PlayerRecord | null>(null);
  const [pinned, setPinned] = useState<PlayerRecord | null>(null);

  const filtered = useMemo(() => {
    const byPos = players.filter((p) => matchesPosGroup(p.position, posGroup));
    if (preset === 'attackOutput') {
      const active = byPos.filter((p) => (p.minutes || 0) >= 45);
      return active.length >= 3 ? active : byPos;
    }
    if (preset === 'valueEfficiency') {
      const rated = byPos.filter((p) => p.rating !== null && p.rating > 0);
      return rated.length >= 3 ? rated : byPos;
    }
    return byPos;
  }, [players, posGroup, preset]);

  const dynamicScale = useMemo(
    () => computeDynamicScatterScale(filtered.length > 0 ? filtered : players),
    [filtered, players]
  );

  const activePreset = SCATTER_PRESETS.find((p) => p.key === preset) ?? SCATTER_PRESETS[0];

  const getX = (p: PlayerRecord): number => {
    if (preset === 'ageValue') return p.age || 22;
    if (preset === 'attackOutput') return p.xGPer90 || 0;
    if (preset === 'transitionEngine') return p.attributes?.pace ?? 10;
    return p.wagePw || 0;
  };
  const getY = (p: PlayerRecord): number => {
    if (preset === 'ageValue')
      return dynamicScale.metric === 'marketValue' ? p.marketValue || 0 : p.wagePw || 0;
    if (preset === 'attackOutput') return p.xAPer90 || 0;
    if (preset === 'transitionEngine') return p.attributes?.stamina ?? 10;
    return p.rating ?? 6.5;
  };

  const xValues = filtered.map(getX);
  const yValues = filtered.map(getY);
  const minX =
    preset === 'ageValue'
      ? Math.min(17, ...(xValues.length ? xValues : [17]))
      : preset === 'transitionEngine'
        ? 4
        : 0;
  const maxX =
    preset === 'ageValue'
      ? Math.max(35, ...(xValues.length ? xValues : [35]))
      : preset === 'transitionEngine'
        ? 20
        : Math.max(0.4, ...(xValues.length ? xValues : [1])) * 1.15;
  const minY =
    preset === 'valueEfficiency'
      ? 5.8
      : preset === 'transitionEngine'
        ? 4
        : 0;
  const maxY =
    preset === 'ageValue'
      ? dynamicScale.maxY
      : preset === 'transitionEngine'
        ? 20
        : preset === 'valueEfficiency'
          ? 8.2
          : Math.max(0.4, ...(yValues.length ? yValues : [1])) * 1.15;

  const box = getResponsiveChartBox('scatter', isMobile);
  const { width, height, padL, padR, padT, plotW, plotH } = box;
  const mapX = (v: number) =>
    padL + ((Math.min(maxX, Math.max(minX, v)) - minX) / Math.max(0.01, maxX - minX)) * plotW;
  const mapY = (v: number) =>
    padT + plotH - ((Math.min(maxY, Math.max(minY, v)) - minY) / Math.max(0.01, maxY - minY)) * plotH;

  const midX = xValues.length > 0 ? xValues.reduce((a, b) => a + b, 0) / xValues.length : (minX + maxX) / 2;
  const midY = yValues.length > 0 ? yValues.reduce((a, b) => a + b, 0) / yValues.length : (minY + maxY) / 2;

  const formatVal = (val: number, axis: 'x' | 'y') => {
    if (preset === 'ageValue') {
      return axis === 'x' ? `${Math.round(val)}y` : dynamicScale.formatTick(val);
    }
    if (preset === 'transitionEngine') return `${Math.round(val)}`;
    if (preset === 'valueEfficiency') {
      return axis === 'x' ? formatDynamicCurrency(val, 'wagePw') : val.toFixed(2);
    }
    return val.toFixed(2);
  };

  const activePlayer = resolveTouchTooltipSelection(
    pinned && filtered.some((p) => p.id === pinned.id) ? pinned : null,
    hovered
  );

  const rankedRows = useMemo(
    () => rankScatterExplorerPlayers(filtered, preset, getX, getY, midX, midY),
    [filtered, preset, midX, midY, dynamicScale.metric]
  );

  const quadrantToneClass = (tone: 'emerald' | 'sky' | 'amber' | 'rose') => {
    if (tone === 'emerald') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
    if (tone === 'sky') return 'bg-sky-500/15 text-sky-300 border-sky-500/35';
    if (tone === 'amber') return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
    return 'bg-rose-500/15 text-rose-300 border-rose-500/35';
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 sm:p-4 space-y-3 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">
            Interactive Squad Scatter Explorer
          </h3>
          <p className="text-[11px] text-slate-400">
            {filtered.length} players · Dashed crosshair marks squad average
          </p>
        </div>

        <ChartRankedListToggle
          mode={viewMode}
          onChange={setViewMode}
          ariaLabel="Switch squad scatter explorer between chart and ranked list"
          count={filtered.length}
        />
      </div>

      {/* Position filter chips + Preset switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {SCATTER_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              className={`min-h-[44px] sm:min-h-[34px] px-2.5 sm:px-3 rounded-lg text-xs sm:text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                preset === p.key
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                  : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setPosGroup(g)}
              className={`min-h-[44px] sm:min-h-[32px] px-2.5 rounded-lg text-xs sm:text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                posGroup === g
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-0.5">
          {rankedRows.map(({ rank, player: p, xVal, yVal, quadrantLabel, quadrantTone }) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPlayer?.(p)}
              className="w-full min-h-[52px] text-left rounded-xl border border-slate-800 bg-slate-950/75 hover:border-emerald-500/40 px-3 py-2 flex items-center justify-between gap-2 transition cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-6 font-mono text-[11px] font-bold text-slate-500 shrink-0">
                  #{rank}
                </span>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-semibold text-white truncate">
                      {p.name}
                    </span>
                    <span className="font-mono text-[10px] text-emerald-300 shrink-0">
                      {p.position}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded border px-1.5 py-0.25 text-[9.5px] font-semibold ${quadrantToneClass(
                        quadrantTone
                      )}`}
                    >
                      {quadrantLabel}
                    </span>
                    <span className="text-[10px] font-mono text-amber-300">
                      {p.ability.toFixed(1)}★
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right font-mono tabular-nums shrink-0">
                <div className="text-[11px] font-bold text-white">
                  {activePreset.xLabel.split(' ')[0]}: {formatVal(xVal, 'x')}
                </div>
                <div className="text-[10px] text-sky-300">
                  {activePreset.yLabel.split(' ')[0]}: {formatVal(yVal, 'y')}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`Interactive scatter plot: ${activePreset.label}`}
            className="w-full h-auto rounded-lg bg-slate-950/60 border border-slate-800 select-none"
          >
            {/* Quadrant mean crosshairs */}
            <line
              x1={mapX(midX)}
              y1={padT}
              x2={mapX(midX)}
              y2={padT + plotH}
              stroke="rgba(148, 163, 184, 0.25)"
              strokeDasharray="3 3"
            />
            <line
              x1={padL}
              y1={mapY(midY)}
              x2={width - padR}
              y2={mapY(midY)}
              stroke="rgba(148, 163, 184, 0.25)"
              strokeDasharray="3 3"
            />

            {/* Quadrant labels */}
            <text
              x={width - padR - 4}
              y={padT + 12}
              textAnchor="end"
              className={`fill-emerald-400/75 font-semibold ${box.labelFontClass}`}
            >
              {activePreset.quadrantTopRight}
            </text>
            <text
              x={padL + 6}
              y={padT + plotH - 6}
              textAnchor="start"
              className={`fill-slate-500 font-semibold ${box.labelFontClass}`}
            >
              {activePreset.quadrantBottomLeft}
            </text>

            {/* Ticks */}
            {[0, 0.5, 1].map((f) => {
              const yv = minY + (maxY - minY) * f;
              const xv = minX + (maxX - minX) * f;
              return (
                <g key={f}>
                  <text
                    x={padL - 7}
                    y={mapY(yv) + 3}
                    textAnchor="end"
                    className={`fill-slate-400 font-mono tabular-nums ${box.axisFontClass}`}
                  >
                    {formatVal(yv, 'y')}
                  </text>
                  <text
                    x={mapX(xv)}
                    y={height - 10}
                    textAnchor="middle"
                    className={`fill-slate-400 font-mono tabular-nums ${box.axisFontClass}`}
                  >
                    {formatVal(xv, 'x')}
                  </text>
                </g>
              );
            })}

            {/* Dots with touch hit targets */}
            {filtered.map((p) => {
              const x = mapX(getX(p));
              const y = mapY(getY(p));
              const isSel = p.id === selectedPlayerId || activePlayer?.id === p.id;
              const color =
                p.status === 'Surplus'
                  ? '#f43f5e'
                  : p.age <= 21
                    ? '#38bdf8'
                    : p.status === 'Starter'
                      ? '#10b981'
                      : '#f59e0b';
              return (
                <g
                  key={p.id}
                  onMouseEnter={() => setHovered(p)}
                  onMouseLeave={() => setHovered((curr) => (curr?.id === p.id ? null : curr))}
                  onClick={() => {
                    if (pinned?.id === p.id) {
                      onSelectPlayer?.(p);
                    } else {
                      setPinned(p);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <circle cx={x} cy={y} r={box.hitRadius} fill="transparent" />
                  <circle
                    cx={x}
                    cy={y}
                    r={isSel ? box.selectedDotRadius : box.dotRadius}
                    fill={color}
                    fillOpacity={isSel ? 0.96 : 0.8}
                    stroke={isSel ? '#ffffff' : '#0f172a'}
                    strokeWidth={isSel ? 2 : 1}
                  />
                </g>
              );
            })}
          </svg>

          {/* Docked tap-to-inspect strip with quadrant explanation + Open Profile */}
          {activePlayer ? (() => {
            const xVal = getX(activePlayer);
            const yVal = getY(activePlayer);
            const quad = classifyScatterQuadrant(preset, xVal, yVal, midX, midY);
            return (
              <div className="rounded-xl border border-emerald-500/35 bg-slate-950/90 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-white truncate">
                      {activePlayer.name}
                    </span>
                    <span className="font-mono text-[11px] text-emerald-300">
                      ({activePlayer.position})
                    </span>
                    <span
                      className={`rounded border px-1.5 py-0.25 text-[10px] font-semibold ${quadrantToneClass(
                        quad.tone
                      )}`}
                    >
                      {quad.label}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-300 tabular-nums">
                    {activePreset.xLabel}: {formatVal(xVal, 'x')} · {activePreset.yLabel}:{' '}
                    {formatVal(yVal, 'y')} · {activePlayer.ability.toFixed(1)}★
                  </div>
                </div>
                {onSelectPlayer && (
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(activePlayer)}
                    className="min-h-[44px] sm:min-h-[32px] px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-semibold text-emerald-300 cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    Open Profile →
                  </button>
                )}
              </div>
            );
          })() : (
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-1.5 text-[11px] text-slate-400">
              Tap any dot to inspect player details &amp; quadrant verdict, or switch to Ranked List.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export interface SquadDepthAndPlannerChartProps {
  positionalNeeds: PositionalSigningNeed[];
  squadPlanner?: SquadPlannerSlot[] | null;
  lastMatchTactic?: LastMatchTacticBlueprint | null;
}

export const SquadDepthAndPlannerChart: React.FC<SquadDepthAndPlannerChartProps> = ({
  positionalNeeds,
  squadPlanner = null,
  lastMatchTactic = null,
}) => {
  const plannerSlots = useMemo(
    () => (Array.isArray(squadPlanner) ? squadPlanner : []),
    [squadPlanner]
  );

  // Extract distinct season offsets (FM27 stores 0 = Current, 1 = Next, 2 = +2)
  const availableSeasons = useMemo(() => {
    const set = new Set<number>();
    for (const s of plannerSlots) {
      set.add(typeof s.seasonOffset === 'number' ? s.seasonOffset : 0);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [plannerSlots]);

  const [selectedSeason, setSelectedSeason] = useState<number>(0);
  const activeSeason = availableSeasons.includes(selectedSeason)
    ? selectedSeason
    : (availableSeasons[0] ?? 0);

  // Active XI position codes from the last-match/active tactic blueprint
  const activeXiCodes = useMemo(() => {
    const codes = new Set<string>();
    const starters = lastMatchTactic?.starters || [];
    for (const st of starters) {
      const ipCode = normalizeTacticPositionToPlannerCode(st.position);
      if (ipCode) codes.add(ipCode);
      const oopCode = normalizeTacticPositionToPlannerCode(st.outOfPossessionPosition);
      if (oopCode) codes.add(oopCode);
    }
    return codes;
  }, [lastMatchTactic]);

  const [plannerScope, setPlannerScope] = useState<'xi' | 'all'>(() =>
    activeXiCodes.size > 0 ? 'xi' : 'all'
  );

  // Lookup map for Next Season (+1) depth per slot index so Current Season cards
  // can flag expiring-contract drop-offs immediately.
  const nextSeasonCountBySlot = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of plannerSlots) {
      if ((s.seasonOffset ?? 0) === 1) {
        map.set(s.slot, s.playerNames.length);
      }
    }
    return map;
  }, [plannerSlots]);

  const seasonSlots = useMemo(() => {
    return plannerSlots
      .filter((s) => (s.seasonOffset ?? 0) === activeSeason && s.playerNames.length > 0)
      .map((s) => ({
        raw: s,
        meta: resolveSquadPlannerSlotMeta(s),
      }))
      .sort((a, b) => a.meta.sortOrder - b.meta.sortOrder);
  }, [plannerSlots, activeSeason]);

  const xiFilteredSlots = useMemo(() => {
    if (activeXiCodes.size === 0) return [];
    return seasonSlots.filter(({ meta }) => {
      if (activeXiCodes.has(meta.code)) return true;
      // Treat DC <-> DCR/DCL, MC <-> MCR/MCL, STC <-> STCR/STCL as matching central roles
      if (meta.code === 'DC' && (activeXiCodes.has('DCR') || activeXiCodes.has('DCL'))) return true;
      if ((meta.code === 'DCR' || meta.code === 'DCL') && activeXiCodes.has('DC')) return true;
      if (meta.code === 'MC' && (activeXiCodes.has('MCR') || activeXiCodes.has('MCL'))) return true;
      if ((meta.code === 'MCR' || meta.code === 'MCL') && activeXiCodes.has('MC')) return true;
      if (meta.code === 'DM' && (activeXiCodes.has('DMR') || activeXiCodes.has('DML'))) return true;
      if ((meta.code === 'DMR' || meta.code === 'DML') && activeXiCodes.has('DM')) return true;
      if (meta.code === 'STC' && (activeXiCodes.has('STCR') || activeXiCodes.has('STCL'))) return true;
      if ((meta.code === 'STCR' || meta.code === 'STCL') && activeXiCodes.has('STC')) return true;
      return false;
    });
  }, [seasonSlots, activeXiCodes]);

  const canFilterXi = xiFilteredSlots.length > 0;
  const effectiveScope: 'xi' | 'all' = canFilterXi ? plannerScope : 'all';
  const visiblePlannerSlots =
    effectiveScope === 'xi' ? xiFilteredSlots : seasonSlots;

  const seasonCountMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of plannerSlots) {
      if (s.playerNames.length === 0) continue;
      const off = s.seasonOffset ?? 0;
      map.set(off, (map.get(off) || 0) + 1);
    }
    return map;
  }, [plannerSlots]);

  if (positionalNeeds.length === 0 && plannerSlots.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">
            Primary Positional Depth &amp; FM27 Squad Planner
          </h3>
          <p className="text-[11px] text-slate-400">
            Senior primary depth separated from First-Team Ready U21s, raw Academy prospects, and secondary cover
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Senior
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-teal-400" /> Ready U21
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-purple-500/80" /> Academy
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-slate-500" /> Cover
          </span>
        </div>
      </div>

      {positionalNeeds.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {positionalNeeds.map((n) => {
            const seniorCount = n.seniorPrimaryPlayers.length;
            const readyYouthCount = n.firstTeamReadyYouthPlayers?.length ?? 0;
            const academyCount =
              n.academyProspectPlayers?.length ??
              Math.max(0, n.youthReservePlayers.length - readyYouthCount);
            const coverCount = n.secondaryCoverPlayers.length;
            const maxBar = Math.max(
              5,
              n.idealMax + 1,
              seniorCount + readyYouthCount + academyCount + coverCount
            );
            const statusTone =
              n.status === 'Need Signing'
                ? 'text-rose-400'
                : n.status === 'Promote Internal'
                  ? 'text-teal-300'
                  : n.hasSuccessionGap
                    ? 'text-amber-300'
                    : n.status === 'Overstocked'
                      ? 'text-sky-300'
                      : 'text-emerald-400';
            return (
              <div
                key={n.code}
                className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">
                    {n.code}{' '}
                    <span className="text-[10px] font-normal text-slate-400">
                      ({n.idealMin}–{n.idealMax} target)
                    </span>
                  </span>
                  <span className={`text-[10px] font-semibold ${statusTone}`}>
                    {n.status === 'Need Signing'
                      ? 'Need'
                      : n.status === 'Promote Internal'
                        ? 'Promote U21'
                        : n.hasSuccessionGap
                          ? 'Succession'
                          : n.status}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden flex">
                  {seniorCount > 0 && (
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${(seniorCount / maxBar) * 100}%` }}
                    />
                  )}
                  {readyYouthCount > 0 && (
                    <div
                      className="h-full bg-teal-400"
                      style={{ width: `${(readyYouthCount / maxBar) * 100}%` }}
                    />
                  )}
                  {academyCount > 0 && (
                    <div
                      className="h-full bg-purple-500/80"
                      style={{ width: `${(academyCount / maxBar) * 100}%` }}
                    />
                  )}
                  {coverCount > 0 && (
                    <div
                      className="h-full bg-slate-500"
                      style={{ width: `${(coverCount / maxBar) * 100}%` }}
                    />
                  )}
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {seniorCount} senior
                  {readyYouthCount > 0 ? ` · ${readyYouthCount} ready U21` : ''}
                  {academyCount > 0 ? ` · ${academyCount} academy` : ''}
                  {coverCount > 0 ? ` · ${coverCount} cover` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {plannerSlots.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-white">
                In-Game FM27 Squad Planner
                <span className="ml-2 text-[11px] font-mono font-normal text-slate-400">
                  ({visiblePlannerSlots.length} {effectiveScope === 'xi' ? 'tactic' : 'pitch'} positions)
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                Your in-game FM27 pecking order (1st → 2nd → 3rd choice) per pitch position across 3 seasons. Switch seasons to spot where expiring contracts thin your depth next year.
              </p>
            </div>

            {canFilterXi && (
              <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950/80 p-0.5 self-start shrink-0">
                <button
                  type="button"
                  onClick={() => setPlannerScope('xi')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    effectiveScope === 'xi'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Active XI ({xiFilteredSlots.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPlannerScope('all')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    effectiveScope === 'all'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All Positions ({seasonSlots.length})
                </button>
              </div>
            )}
          </div>

          {/* 3-Season Planner Selector */}
          {availableSeasons.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {availableSeasons.map((offset) => {
                const isSelected = activeSeason === offset;
                const count = seasonCountMap.get(offset) || 0;
                return (
                  <button
                    key={offset}
                    type="button"
                    onClick={() => setSelectedSeason(offset)}
                    className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      isSelected
                        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {formatSquadPlannerSeasonLabel(offset)}{' '}
                    <span className="font-mono text-[10px] opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {visiblePlannerSlots.map(({ raw: slot, meta }, idx) => {
              const nextYrCount =
                activeSeason === 0 && nextSeasonCountBySlot.size > 0
                  ? (nextSeasonCountBySlot.get(slot.slot) ?? 0)
                  : null;
              const isThinNextYear =
                nextYrCount !== null &&
                nextYrCount <= 1 &&
                nextYrCount < slot.playerNames.length;
              const topChoices = slot.playerNames.slice(0, 3);
              const extraCount = Math.max(0, slot.playerNames.length - 3);

              return (
                <div
                  key={`${slot.seasonOffset}-${slot.slot}-${idx}`}
                  className="rounded-lg border border-slate-800/90 bg-slate-950/70 px-3 py-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300 shrink-0">
                        {meta.code}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-200 truncate">
                        {meta.label}
                      </span>
                    </div>
                    {isThinNextYear ? (
                      <span className="rounded bg-amber-500/15 border border-amber-500/35 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300 shrink-0">
                        Next yr: {nextYrCount}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-slate-500 shrink-0">
                        {slot.playerNames.length} deep
                      </span>
                    )}
                  </div>

                  <ol className="space-y-0.5 text-[11px] leading-snug">
                    {topChoices.map((name, i) => (
                      <li
                        key={`${name}-${i}`}
                        className="flex items-baseline gap-1.5 text-slate-300"
                      >
                        <span
                          className={`font-mono text-[10px] shrink-0 ${
                            i === 0 ? 'font-bold text-emerald-400' : 'text-slate-500'
                          }`}
                        >
                          {i + 1}.
                        </span>
                        <span className={i === 0 ? 'font-medium text-white' : 'text-slate-300'}>
                          {name}
                        </span>
                      </li>
                    ))}
                  </ol>

                  {extraCount > 0 && (
                    <div className="text-[10px] font-mono text-slate-500">
                      +{extraCount} more in planner
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};




