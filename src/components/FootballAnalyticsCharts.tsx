import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MatchLogEntry, PlayerRecord } from '../types/fm27';
import type { LastMatchTacticBlueprint, SquadPlannerSlot } from '../types/fmSave';
import type { PercentilePizzaSlice } from '../utils/cardIntelligenceEngine';
import type { PositionalSigningNeed } from '../utils/transferAudit';
import {
  formatSquadPlannerSeasonLabel,
  normalizeTacticPositionToPlannerCode,
  resolveSquadPlannerSlotMeta,
} from '../utils/squadPlannerHelper';
import {
  ComparisonChartMode,
  MultiPlayerComparisonDataset,
} from '../utils/playerComparisonEngine';
import { PlayerProgressionPoint } from '../utils/progressionDiff';
import {
  classifyMatchEntryBucket,
  deriveFootballSeasonLabel,
  extractMatchSeasons,
  formatCompetitionBucketTag,
  MatchCompetitionFilter,
  matchesEntryCompetitionFilter,
  parseScoreGoals,
} from '../utils/matchScopeHelpers';
import {
  buildXgMomentumRankedRows,
  classifyScatterQuadrant,
  describeMatchXgVerdict,
  getPaddedRadialViewBox,
  getResponsiveChartBox,
  rankAgeValuePlayers,
  rankScatterExplorerPlayers,
  resolveTouchTooltipSelection,
  type ChartViewMode,
  type ScatterExplorerPresetKey,
} from '../utils/mobileChartHelpers';
import {
  ChartRankedListToggle,
  useCompactChartViewport,
} from './ChartRankedListToggle';

export interface DynamicScatterScale {
  metric: 'marketValue' | 'wagePw';
  metricLabel: string;
  minY: number;
  maxY: number;
  ticks: number[];
  formatTick: (value: number) => string;
}

export function formatDynamicCurrency(
  value: number,
  metric: 'marketValue' | 'wagePw'
): string {
  const safe = Math.max(0, Math.round(value));
  const suffix = metric === 'wagePw' ? '/wk' : '';
  if (safe >= 1_000_000) {
    return `£${(safe / 1_000_000).toFixed(safe >= 10_000_000 ? 1 : 2)}M${suffix}`;
  }
  if (safe >= 1_000) {
    const k = safe / 1_000;
    return `£${k >= 100 ? Math.round(k) : Number(k.toFixed(1))}K${suffix}`;
  }
  return `£${safe.toLocaleString()}${suffix}`;
}

/**
 * Pure dynamic tier-agnostic Y-axis scale for the Age vs Valuation/Wage scatter plot.
 * Uses marketValue when at least 2 players carry non-zero valuations, otherwise
 * falls back cleanly to weekly wage (wagePw) with 10% headroom above the squad peak.
 * ZERO hardcoded €40M / €100M floors.
 */
export function computeDynamicScatterScale(
  players: PlayerRecord[]
): DynamicScatterScale {
  const validMarketValues = players
    .map((p) => (typeof p.marketValue === 'number' && p.marketValue > 0 ? p.marketValue : 0))
    .filter((v) => v > 0);

  const metric: 'marketValue' | 'wagePw' =
    validMarketValues.length >= 2 ? 'marketValue' : 'wagePw';

  const values = players
    .map((p) =>
      metric === 'marketValue'
        ? typeof p.marketValue === 'number' && p.marketValue > 0
          ? p.marketValue
          : 0
        : Math.max(0, Number(p.wagePw) || 0)
    )
    .filter((v) => v > 0);

  const rawMax = values.length > 0 ? Math.max(...values) : metric === 'wagePw' ? 500 : 100_000;
  const maxWithHeadroom = Math.max(10, Math.ceil(rawMax * 1.1));

  // Round ceiling to a clean human step scaled to the magnitude
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(maxWithHeadroom)) - 1));
  const cleanMax = Math.ceil(maxWithHeadroom / mag) * mag;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(cleanMax * f));

  return {
    metric,
    metricLabel: metric === 'marketValue' ? 'Market Valuation' : 'Weekly Wage',
    minY: 0,
    maxY: cleanMax,
    ticks,
    formatTick: (v: number) => formatDynamicCurrency(v, metric),
  };
}

interface RadarAxis {
  key: keyof PlayerRecord['attributes'];
  label: string;
}

const OUTFIELD_AXES: RadarAxis[] = [
  { key: 'pace', label: 'Pace' },
  { key: 'stamina', label: 'Stamina' },
  { key: 'passing', label: 'Passing' },
  { key: 'finishing', label: 'Finishing' },
  { key: 'tackling', label: 'Tackling' },
  { key: 'decisions', label: 'Decisions' },
];

const GK_AXES: RadarAxis[] = [
  { key: 'reflexes', label: 'Reflexes' },
  { key: 'handling', label: 'Handling' },
  { key: 'aerialReach', label: 'Aerial' },
  { key: 'commandOfArea', label: 'Command' },
  { key: 'agility', label: 'Agility' },
  { key: 'positioning', label: 'Positioning' },
];

function isGkPlayer(player: PlayerRecord): boolean {
  return (player.position || '').toUpperCase().includes('GK');
}

export interface AttributeRadarChartProps {
  player: PlayerRecord;
  comparePlayer?: PlayerRecord | null;
  size?: number;
}

export const AttributeRadarChart: React.FC<AttributeRadarChartProps> = ({
  player,
  comparePlayer = null,
  size = 280,
}) => {
  const [pinnedAxisKey, setPinnedAxisKey] = useState<string | null>(null);
  const [hoveredAxisKey, setHoveredAxisKey] = useState<string | null>(null);

  const axes = isGkPlayer(player) ? GK_AXES : OUTFIELD_AXES;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const rings = [5, 10, 15, 20];
  const radialBox = getPaddedRadialViewBox(size, 30);

  const getPoint = (axisIndex: number, value: number): [number, number] => {
    const angle = (Math.PI * 2 * axisIndex) / axes.length - Math.PI / 2;
    const clamped = Math.min(20, Math.max(1, value || 1));
    const r = (clamped / 20) * radius;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };

  const toPolygon = (p: PlayerRecord): string =>
    axes
      .map((ax, idx) => {
        const val = Number(p.attributes?.[ax.key] ?? 10);
        const [x, y] = getPoint(idx, val);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const primaryPoints = toPolygon(player);
  const comparePoints = comparePlayer ? toPolygon(comparePlayer) : null;
  const activeAxisKey = resolveTouchTooltipSelection(pinnedAxisKey, hoveredAxisKey);
  const activeAxis = axes.find((a) => a.key === activeAxisKey) ?? null;

  return (
    <div className="flex flex-col items-center w-full min-w-0">
      <svg
        viewBox={radialBox.viewBox}
        role="img"
        aria-label={`Attribute radar for ${player.name}${comparePlayer ? ` vs ${comparePlayer.name}` : ''}`}
        className="w-full max-w-[300px] h-auto select-none"
      >
        {/* Concentric grid polygons */}
        {rings.map((ringVal) => {
          const pts = axes
            .map((_, idx) => {
              const [x, y] = getPoint(idx, ringVal);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');
          return (
            <polygon
              key={ringVal}
              points={pts}
              fill="none"
              stroke="currentColor"
              strokeWidth={ringVal === 20 ? 1.2 : 0.75}
              className="text-slate-700/70"
            />
          );
        })}

        {/* Axis spokes & tappable labels */}
        {axes.map((ax, idx) => {
          const [xEnd, yEnd] = getPoint(idx, 20);
          const angle = (Math.PI * 2 * idx) / axes.length - Math.PI / 2;
          const lx = cx + (radius + 23) * Math.cos(angle);
          const ly = cy + (radius + 21) * Math.sin(angle);
          const pVal = Number(player.attributes?.[ax.key] ?? 10);
          const isSelected = activeAxisKey === ax.key;
          return (
            <g
              key={ax.key}
              onMouseEnter={() => setHoveredAxisKey(ax.key)}
              onMouseLeave={() =>
                setHoveredAxisKey((curr) => (curr === ax.key ? null : curr))
              }
              onClick={() =>
                setPinnedAxisKey((curr) => (curr === ax.key ? null : ax.key))
              }
              className="cursor-pointer"
            >
              <line
                x1={cx}
                y1={cy}
                x2={xEnd}
                y2={yEnd}
                stroke="currentColor"
                strokeWidth={isSelected ? 1.4 : 0.75}
                className={isSelected ? 'text-emerald-400/80' : 'text-slate-700/70'}
              />
              <circle cx={lx} cy={ly + 4} r={20} fill="transparent" />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className={`text-[10.5px] font-semibold ${
                  isSelected ? 'fill-white' : 'fill-slate-300'
                }`}
              >
                {ax.label}
              </text>
              <text
                x={lx}
                y={ly + 12}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-emerald-400 text-[9.5px] font-mono tabular-nums"
              >
                {pVal}
                {comparePlayer
                  ? `/${Number(comparePlayer.attributes?.[ax.key] ?? 10)}`
                  : ''}
              </text>
            </g>
          );
        })}

        {/* Compare player polygon */}
        {comparePoints && (
          <polygon
            points={comparePoints}
            fill="rgba(56, 189, 248, 0.22)"
            stroke="#38bdf8"
            strokeWidth={2}
          />
        )}

        {/* Primary player polygon */}
        <polygon
          points={primaryPoints}
          fill="rgba(16, 185, 129, 0.28)"
          stroke="#10b981"
          strokeWidth={2}
        />

        {/* Vertex dots with generous touch hit areas */}
        {axes.map((ax, idx) => {
          const [x, y] = getPoint(idx, Number(player.attributes?.[ax.key] ?? 10));
          const isSelected = activeAxisKey === ax.key;
          return (
            <g
              key={`dot-p1-${ax.key}`}
              onMouseEnter={() => setHoveredAxisKey(ax.key)}
              onMouseLeave={() =>
                setHoveredAxisKey((curr) => (curr === ax.key ? null : curr))
              }
              onClick={() =>
                setPinnedAxisKey((curr) => (curr === ax.key ? null : ax.key))
              }
              className="cursor-pointer"
            >
              <circle cx={x} cy={y} r={14} fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={isSelected ? 4.8 : 3.2}
                fill="#34d399"
                stroke={isSelected ? '#ffffff' : '#022c22'}
                strokeWidth={isSelected ? 1.5 : 1}
              />
            </g>
          );
        })}
        {comparePlayer &&
          axes.map((ax, idx) => {
            const [x, y] = getPoint(
              idx,
              Number(comparePlayer.attributes?.[ax.key] ?? 10)
            );
            const isSelected = activeAxisKey === ax.key;
            return (
              <circle
                key={`dot-p2-${ax.key}`}
                cx={x}
                cy={y}
                r={isSelected ? 4.2 : 3}
                fill="#38bdf8"
                stroke={isSelected ? '#ffffff' : '#082f49'}
                strokeWidth={1}
              />
            );
          })}
      </svg>

      {activeAxis ? (() => {
        const p1Val = Number(player.attributes?.[activeAxis.key] ?? 10);
        const p2Val = comparePlayer
          ? Number(comparePlayer.attributes?.[activeAxis.key] ?? 10)
          : null;
        const delta = p2Val !== null ? p1Val - p2Val : null;
        return (
          <div className="mt-2 w-full rounded-lg border border-emerald-500/30 bg-slate-950/85 px-3 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-white">{activeAxis.label}</span>
            <span className="font-mono tabular-nums text-emerald-300">
              {p1Val}/20
              {p2Val !== null && (
                <>
                  {' '}
                  <span className="text-slate-400">vs</span>{' '}
                  <span className="text-sky-300">{p2Val}/20</span>{' '}
                  <span
                    className={
                      delta !== null && delta > 0
                        ? 'text-emerald-400'
                        : delta !== null && delta < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                    }
                  >
                    ({delta !== null && delta > 0 ? `+${delta}` : delta})
                  </span>
                </>
              )}
            </span>
          </div>
        );
      })() : (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            {player.name} ({player.position})
          </span>
          {comparePlayer && (
            <span className="inline-flex items-center gap-1.5 text-sky-300 font-semibold">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
              {comparePlayer.name} ({comparePlayer.position})
            </span>
          )}
        </div>
      )}
    </div>
  );
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
              className={`min-h-[40px] sm:min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
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
              className="min-h-[40px] sm:min-h-[32px] rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-200 text-[11px]"
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
              className="min-h-[40px] sm:min-h-[32px] rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-200 text-[11px]"
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
                  className="min-h-[40px] sm:min-h-[32px] px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-semibold text-emerald-300 cursor-pointer shrink-0"
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

export interface PizzaSliceDefinition {
  key: keyof PlayerRecord['attributes'];
  label: string;
  category: 'Physical' | 'Technical' | 'Mental';
}

const FWD_PIZZA_SLICES: PizzaSliceDefinition[] = [
  { key: 'pace', label: 'Pace', category: 'Physical' },
  { key: 'acceleration', label: 'Accel', category: 'Physical' },
  { key: 'stamina', label: 'Stamina', category: 'Physical' },
  { key: 'jumpingReach', label: 'Jumping', category: 'Physical' },
  { key: 'finishing', label: 'Finishing', category: 'Technical' },
  { key: 'firstTouch', label: '1st Touch', category: 'Technical' },
  { key: 'dribbling', label: 'Dribbling', category: 'Technical' },
  { key: 'passing', label: 'Passing', category: 'Technical' },
  { key: 'offTheBall', label: 'Off Ball', category: 'Mental' },
  { key: 'composure', label: 'Composure', category: 'Mental' },
  { key: 'decisions', label: 'Decisions', category: 'Mental' },
  { key: 'anticipation', label: 'Anticip.', category: 'Mental' },
];

const DEF_PIZZA_SLICES: PizzaSliceDefinition[] = [
  { key: 'pace', label: 'Pace', category: 'Physical' },
  { key: 'acceleration', label: 'Accel', category: 'Physical' },
  { key: 'jumpingReach', label: 'Jumping', category: 'Physical' },
  { key: 'strength', label: 'Strength', category: 'Physical' },
  { key: 'tackling', label: 'Tackling', category: 'Technical' },
  { key: 'marking', label: 'Marking', category: 'Technical' },
  { key: 'heading', label: 'Heading', category: 'Technical' },
  { key: 'passing', label: 'Passing', category: 'Technical' },
  { key: 'positioning', label: 'Position', category: 'Mental' },
  { key: 'decisions', label: 'Decisions', category: 'Mental' },
  { key: 'concentration', label: 'Focus', category: 'Mental' },
  { key: 'anticipation', label: 'Anticip.', category: 'Mental' },
];

const MID_PIZZA_SLICES: PizzaSliceDefinition[] = [
  { key: 'pace', label: 'Pace', category: 'Physical' },
  { key: 'acceleration', label: 'Accel', category: 'Physical' },
  { key: 'stamina', label: 'Stamina', category: 'Physical' },
  { key: 'workRate', label: 'Work Rate', category: 'Mental' },
  { key: 'passing', label: 'Passing', category: 'Technical' },
  { key: 'firstTouch', label: '1st Touch', category: 'Technical' },
  { key: 'dribbling', label: 'Dribbling', category: 'Technical' },
  { key: 'tackling', label: 'Tackling', category: 'Technical' },
  { key: 'decisions', label: 'Decisions', category: 'Mental' },
  { key: 'vision', label: 'Vision', category: 'Mental' },
  { key: 'offTheBall', label: 'Off Ball', category: 'Mental' },
  { key: 'positioning', label: 'Position', category: 'Mental' },
];

const GK_PIZZA_SLICES: PizzaSliceDefinition[] = [
  { key: 'agility', label: 'Agility', category: 'Physical' },
  { key: 'jumpingReach', label: 'Jumping', category: 'Physical' },
  { key: 'pace', label: 'Speed', category: 'Physical' },
  { key: 'reflexes', label: 'Reflexes', category: 'Technical' },
  { key: 'handling', label: 'Handling', category: 'Technical' },
  { key: 'commandOfArea', label: 'Command', category: 'Technical' },
  { key: 'aerialReach', label: 'Aerial', category: 'Technical' },
  { key: 'oneOnOnes', label: '1v1s', category: 'Technical' },
  { key: 'kicking', label: 'Kicking', category: 'Technical' },
  { key: 'decisions', label: 'Decisions', category: 'Mental' },
  { key: 'positioning', label: 'Position', category: 'Mental' },
  { key: 'concentration', label: 'Focus', category: 'Mental' },
];

export function getPizzaSlicesForPosition(position: string): PizzaSliceDefinition[] {
  const p = (position || '').toUpperCase();
  if (p.includes('GK')) return GK_PIZZA_SLICES;
  if (/\bSTC\b|\bST\b|\bCF\b|ST\s*\(/i.test(p)) return FWD_PIZZA_SLICES;
  if (
    p.includes('DC') ||
    p.includes('CB') ||
    p.includes('DL') ||
    p.includes('DR') ||
    p.includes('D (') ||
    p.includes('WB')
  ) {
    return DEF_PIZZA_SLICES;
  }
  return MID_PIZZA_SLICES;
}

export function estimateAttributePercentile(
  rawValue: number,
  baselineMean = 11.5
): number {
  const val = Math.max(1, Math.min(20, Number(rawValue) || 10));
  // Smooth logistic curve centered on division baseline mean
  const z = (val - baselineMean) / 2.2;
  const logistic = 1 / (1 + Math.exp(-z));
  return Math.max(5, Math.min(99, Math.round(logistic * 100)));
}

export function computeSquadRelativePercentile(
  rawValue: number,
  attrKey: keyof PlayerRecord['attributes'],
  squadPlayers: PlayerRecord[]
): number {
  const values = squadPlayers
    .map((p) => p.attributes?.[attrKey])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (values.length < 4) {
    return estimateAttributePercentile(rawValue);
  }
  const below = values.filter((v) => v < rawValue).length;
  const equal = values.filter((v) => v === rawValue).length;
  const pct = Math.round(((below + equal * 0.5) / values.length) * 100);
  return Math.max(5, Math.min(99, pct));
}

function buildWedgePath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
}

export interface RolePercentilePizzaChartProps {
  player: PlayerRecord;
  squadPlayers?: PlayerRecord[];
  ipRoleName?: string;
  oopRoleName?: string;
  highlightedPrimaryKeys?: Set<string>;
  size?: number;
}

export const RolePercentilePizzaChart: React.FC<RolePercentilePizzaChartProps> = ({
  player,
  squadPlayers = [],
  ipRoleName,
  oopRoleName,
  highlightedPrimaryKeys,
  size = 310,
}) => {
  const [pinnedSliceKey, setPinnedSliceKey] = useState<string | null>(null);
  const [hoveredSliceKey, setHoveredSliceKey] = useState<string | null>(null);

  const slices = getPizzaSlicesForPosition(player.position);
  const useSquadBaseline = squadPlayers.length >= 4;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.33;
  const sliceAngle = (Math.PI * 2) / slices.length;
  const radialBox = getPaddedRadialViewBox(size, 32);

  const categoryColor = (cat: PizzaSliceDefinition['category']) => {
    if (cat === 'Physical') return { fill: '#10b981', stroke: '#34d399' };
    if (cat === 'Technical') return { fill: '#0ea5e9', stroke: '#38bdf8' };
    return { fill: '#f59e0b', stroke: '#fbbf24' };
  };

  const activeSliceKey = resolveTouchTooltipSelection(
    pinnedSliceKey,
    hoveredSliceKey
  );
  const activeSlice = slices.find((s) => String(s.key) === activeSliceKey) ?? null;

  return (
    <div className="flex flex-col items-center space-y-2 w-full min-w-0">
      <div className="text-center">
        <div className="text-xs font-bold text-slate-200">
          Position Attribute Profile ({player.position})
        </div>
        <div className="text-[10px] text-slate-400">
          {useSquadBaseline
            ? `Compared against your ${squadPlayers.length}-player squad`
            : 'Compared against division baseline'}
        </div>
        {(ipRoleName || oopRoleName) && (
          <div className="text-[11px] text-slate-400 mt-0.5">
            IP: <span className="text-emerald-300 font-semibold">{ipRoleName || '--'}</span>
            {' · '}OOP:{' '}
            <span className="text-sky-300 font-semibold">{oopRoleName || '--'}</span>
          </div>
        )}
      </div>

      <svg
        viewBox={radialBox.viewBox}
        role="img"
        aria-label={`Role and attribute percentile pizza chart for ${player.name}`}
        className="w-full max-w-[300px] h-auto select-none"
      >
        {/* Background full wedges & concentric percentile rings */}
        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <circle
            key={frac}
            cx={cx}
            cy={cy}
            r={maxR * frac}
            fill="none"
            stroke="currentColor"
            strokeWidth={frac === 1 ? 1.1 : 0.7}
            strokeDasharray={frac === 0.5 ? '2 2' : undefined}
            className="text-slate-700/75"
          />
        ))}

        {slices.map((slice, idx) => {
          const startAngle = idx * sliceAngle - Math.PI / 2 + 0.03;
          const endAngle = (idx + 1) * sliceAngle - Math.PI / 2 - 0.03;
          const midAngle = (startAngle + endAngle) / 2;

          const rawVal = Number(player.attributes?.[slice.key] ?? 10);
          const pct = useSquadBaseline
            ? computeSquadRelativePercentile(rawVal, slice.key, squadPlayers)
            : estimateAttributePercentile(rawVal);
          const r = Math.max(maxR * 0.14, (pct / 100) * maxR);
          const colors = categoryColor(slice.category);
          const normKey = String(slice.key).toLowerCase().replace(/[^a-z]/g, '');
          const isRoleKey = highlightedPrimaryKeys?.has(normKey) ?? false;
          const sliceId = String(slice.key);
          const isSelected = activeSliceKey === sliceId;

          const lx = cx + (maxR + 24) * Math.cos(midAngle);
          const ly = cy + (maxR + 22) * Math.sin(midAngle);

          return (
            <g
              key={slice.key}
              onMouseEnter={() => setHoveredSliceKey(sliceId)}
              onMouseLeave={() =>
                setHoveredSliceKey((curr) => (curr === sliceId ? null : curr))
              }
              onClick={() =>
                setPinnedSliceKey((curr) => (curr === sliceId ? null : sliceId))
              }
              className="cursor-pointer"
            >
              <path
                d={buildWedgePath(cx, cy, maxR, startAngle, endAngle)}
                fill="rgba(15, 23, 42, 0.45)"
                stroke="rgba(51, 65, 85, 0.5)"
                strokeWidth={0.6}
              />
              <path
                d={buildWedgePath(cx, cy, r, startAngle, endAngle)}
                fill={colors.fill}
                fillOpacity={isSelected ? 0.95 : isRoleKey ? 0.85 : 0.62}
                stroke={isSelected || isRoleKey ? '#ffffff' : colors.stroke}
                strokeWidth={isSelected ? 2 : isRoleKey ? 1.5 : 0.9}
              />
              <text
                x={lx}
                y={ly - 4}
                textAnchor="middle"
                dominantBaseline="middle"
                className={`text-[9.5px] font-semibold ${
                  isSelected || isRoleKey ? 'fill-white font-bold' : 'fill-slate-300'
                }`}
              >
                {slice.label}
              </text>
              <text
                x={lx}
                y={ly + 6}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-emerald-300 text-[8.5px] font-mono tabular-nums"
              >
                {rawVal} ({pct}p)
              </text>
            </g>
          );
        })}
      </svg>

      {activeSlice ? (() => {
        const rawVal = Number(player.attributes?.[activeSlice.key] ?? 10);
        const pct = useSquadBaseline
          ? computeSquadRelativePercentile(rawVal, activeSlice.key, squadPlayers)
          : estimateAttributePercentile(rawVal);
        const normKey = String(activeSlice.key).toLowerCase().replace(/[^a-z]/g, '');
        const isRoleKey = highlightedPrimaryKeys?.has(normKey) ?? false;
        return (
          <div className="w-full rounded-lg border border-emerald-500/30 bg-slate-950/85 px-3 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="font-semibold text-white">{activeSlice.label}</span>
              <span className="ml-1.5 text-[10px] text-slate-400">
                ({activeSlice.category}{isRoleKey ? ' · Key Role Attr' : ''})
              </span>
            </div>
            <span className="font-mono tabular-nums text-emerald-300 shrink-0">
              {rawVal}/20 · {pct}th pct
            </span>
          </div>
        );
      })() : (
        <>
          <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Physical
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> Technical / GK
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Mental
            </span>
            <span className="inline-flex items-center gap-1 text-slate-300">
              <span className="h-2.5 w-2.5 rounded-sm border border-white bg-slate-700" /> White rim = Key for Role
            </span>
          </div>
          <p className="text-[10px] text-slate-500 text-center max-w-xs">
            Tap any slice to inspect. E.g. <span className="font-mono text-slate-300">85p</span> means higher than 85% of {useSquadBaseline ? 'your squad' : 'the division baseline'}.
          </p>
        </>
      )}
    </div>
  );
};

export interface MultiPlayerComparisonChartProps {
  dataset: MultiPlayerComparisonDataset;
  initialMode?: ComparisonChartMode;
  size?: number;
}

export const MultiPlayerComparisonChart: React.FC<MultiPlayerComparisonChartProps> = ({
  dataset,
  initialMode = 'radar',
  size = 280,
}) => {
  const [mode, setMode] = useState<ComparisonChartMode>(initialMode);
  const [pinnedAxisKey, setPinnedAxisKey] = useState<string | null>(null);
  const [hoveredAxisKey, setHoveredAxisKey] = useState<string | null>(null);
  const { players, colors, radarAxes, pizzaSlices, barMetrics } = dataset;

  if (players.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center text-xs text-slate-400">
        Select 1 to 3 players to compare.
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const rings = [5, 10, 15, 20];
  const radialBox = getPaddedRadialViewBox(size, 28);

  const getRadarPoint = (axisIndex: number, value: number, total: number): [number, number] => {
    const angle = (Math.PI * 2 * axisIndex) / total - Math.PI / 2;
    const clamped = Math.min(20, Math.max(1, value || 1));
    const r = (clamped / 20) * radius;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };

  const activeAxisKey = resolveTouchTooltipSelection(pinnedAxisKey, hoveredAxisKey);
  const activeAxis = radarAxes.find((a) => a.key === activeAxisKey) ?? null;

  return (
    <div className="space-y-3 min-w-0">
      {/* Mode switcher — 44px touch targets on mobile */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div
          role="tablist"
          aria-label="Comparison chart mode"
          className="inline-flex rounded-xl border border-slate-800 bg-slate-950/80 p-1"
        >
          {(
            [
              { id: 'radar', label: 'Radar' },
              { id: 'pizza', label: 'Pizza %' },
              { id: 'bars', label: 'Bars' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              onClick={() => setMode(tab.id)}
              className={`min-h-[44px] sm:min-h-[38px] px-3.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mode === tab.id
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Player color legend */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {players.map((p, idx) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-slate-200"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: colors[idx] }}
              />
              <span className="font-medium truncate max-w-[120px]">{p.name}</span>
              <span className="text-[10px] text-slate-400 font-mono">{p.position}</span>
            </span>
          ))}
        </div>
      </div>

      {/* RADAR MODE */}
      {mode === 'radar' && (
        <div className="flex flex-col items-center space-y-2">
          <svg
            viewBox={radialBox.viewBox}
            role="img"
            aria-label={`Multi-player radar comparison for ${players.map((p) => p.name).join(' vs ')}`}
            className="w-full max-w-[300px] h-auto select-none"
          >
            {rings.map((ring) => {
              const pts = radarAxes
                .map((_, i) => getRadarPoint(i, ring, radarAxes.length).join(','))
                .join(' ');
              return (
                <polygon
                  key={ring}
                  points={pts}
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.18)"
                  strokeWidth={ring === 20 ? 1.2 : 0.8}
                />
              );
            })}
            {radarAxes.map((ax, i) => {
              const [x2, y2] = getRadarPoint(i, 20, radarAxes.length);
              const [lx, ly] = getRadarPoint(i, 24.5, radarAxes.length);
              const isSelected = activeAxisKey === ax.key;
              return (
                <g
                  key={ax.key}
                  onMouseEnter={() => setHoveredAxisKey(ax.key)}
                  onMouseLeave={() =>
                    setHoveredAxisKey((curr) => (curr === ax.key ? null : curr))
                  }
                  onClick={() =>
                    setPinnedAxisKey((curr) => (curr === ax.key ? null : ax.key))
                  }
                  className="cursor-pointer"
                >
                  <line
                    x1={cx}
                    y1={cy}
                    x2={x2}
                    y2={y2}
                    stroke={isSelected ? '#34d399' : 'rgba(148, 163, 184, 0.18)'}
                    strokeWidth={isSelected ? 1.4 : 0.8}
                  />
                  <circle cx={lx} cy={ly} r={18} fill="transparent" />
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={`text-[10px] font-semibold ${
                      isSelected ? 'fill-white' : 'fill-slate-300'
                    }`}
                  >
                    {ax.label}
                  </text>
                </g>
              );
            })}
            {players.map((p, pIdx) => {
              const polyPts = radarAxes
                .map((ax, aIdx) =>
                  getRadarPoint(aIdx, ax.values[pIdx] ?? 10, radarAxes.length).join(',')
                )
                .join(' ');
              const color = colors[pIdx];
              return (
                <g key={p.id}>
                  <polygon
                    points={polyPts}
                    fill={color}
                    fillOpacity={0.16}
                    stroke={color}
                    strokeWidth={2}
                  />
                  {radarAxes.map((ax, aIdx) => {
                    const [x, y] = getRadarPoint(
                      aIdx,
                      ax.values[pIdx] ?? 10,
                      radarAxes.length
                    );
                    const isSelected = activeAxisKey === ax.key;
                    return (
                      <circle
                        key={ax.key}
                        cx={x}
                        cy={y}
                        r={isSelected ? 4.5 : 3}
                        fill={color}
                        stroke={isSelected ? '#ffffff' : 'none'}
                        strokeWidth={isSelected ? 1.2 : 0}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>

          {activeAxis ? (
            <div className="w-full rounded-lg border border-emerald-500/30 bg-slate-950/85 px-3 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-white">{activeAxis.label}</span>
              <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
                {players.map((p, idx) => (
                  <span key={p.id} style={{ color: colors[idx] }}>
                    {p.name.split(' ').slice(-1)[0]}: {activeAxis.values[idx] ?? 10}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-slate-500">
              Tap any axis label to inspect exact scores side-by-side
            </div>
          )}
        </div>
      )}

      {/* PIZZA PERCENTILE MODE */}
      {mode === 'pizza' && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pizzaSlices.map((slice) => (
              <div
                key={slice.key}
                className="rounded-lg border border-slate-800/90 bg-slate-950/60 p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-200">{slice.label}</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                    {slice.category}
                  </span>
                </div>
                <div className="space-y-1">
                  {players.map((p, idx) => {
                    const pct = slice.percentiles[idx] ?? 50;
                    const val = slice.values[idx] ?? 10;
                    const bucket = slice.buckets[idx];
                    return (
                      <div key={p.id} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-300 truncate max-w-[110px]">{p.name}</span>
                          <span className="text-slate-200">
                            {val} · <span style={{ color: colors[idx] }}>{pct}p</span>{' '}
                            <span className="text-slate-500">({bucket})</span>
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: colors[idx],
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HORIZONTAL BARS MODE */}
      {mode === 'bars' && (
        <div className="space-y-2">
          {barMetrics.map((metric) => (
            <div
              key={metric.key}
              className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2 space-y-1.5"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">{metric.label}</span>
                {metric.leaderIndex !== null && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700"
                    style={{ color: colors[metric.leaderIndex] }}
                  >
                    Leader: {players[metric.leaderIndex]?.name.split(' ').slice(-1)[0]}
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {players.map((p, idx) => {
                  const val = metric.values[idx] ?? 10;
                  const widthPct = Math.round((val / 20) * 100);
                  return (
                    <div key={p.id} className="flex items-center gap-2 text-[11px]">
                      <span className="w-24 truncate text-slate-400">{p.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor: colors[idx],
                          }}
                        />
                      </div>
                      <span className="w-7 text-right font-mono font-semibold text-slate-200">
                        {val}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export interface PlayerProgressionSparklineProps {
  points: PlayerProgressionPoint[];
  playerName: string;
}

export const PlayerProgressionSparkline: React.FC<PlayerProgressionSparklineProps> = ({
  points,
  playerName,
}) => {
  const isMobile = useCompactChartViewport();
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
        Save at least 2 `.fm` snapshots over time to unlock {playerName}&apos;s progression timeline (star rating &amp; attribute delta).
      </div>
    );
  }

  const box = getResponsiveChartBox('sparkline', isMobile);
  const { width, height, padL: padX, padT: padY, plotW, plotH } = box;

  const deltas = points.map((p) => p.netDeltaFromStart);
  const minD = Math.min(0, ...deltas);
  const maxD = Math.max(2, ...deltas);
  const spanD = Math.max(1, maxD - minD);

  const coords = points.map((pt, i) => {
    const x = padX + (i / Math.max(1, points.length - 1)) * plotW;
    const y = padY + plotH - ((pt.netDeltaFromStart - minD) / spanD) * plotH;
    return { x, y, pt, i };
  });

  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const latest = points[points.length - 1];
  const first = points[0];
  const activeIdx = resolveTouchTooltipSelection(
    pinnedIdx !== null && pinnedIdx < points.length ? pinnedIdx : null,
    hoveredIdx !== null && hoveredIdx < points.length ? hoveredIdx : null,
    points.length - 1
  );
  const activePoint = activeIdx !== null ? points[activeIdx] : latest;
  const deltaSign = activePoint.netDeltaFromStart > 0 ? '+' : '';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-200">
          Progression Timeline ({points.length} saves)
        </span>
        <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
          <span
            className={
              activePoint.netDeltaFromStart >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }
          >
            {deltaSign}
            {activePoint.netDeltaFromStart} net attr
          </span>
          {activePoint.abilityStars != null && (
            <span className="text-amber-300">{activePoint.abilityStars.toFixed(1)}★</span>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Progression timeline for ${playerName}`}
        className="w-full h-auto select-none"
      >
        <line
          x1={padX}
          y1={padY + plotH - ((0 - minD) / spanD) * plotH}
          x2={width - padX}
          y2={padY + plotH - ((0 - minD) / spanD) * plotH}
          stroke="rgba(148, 163, 184, 0.2)"
          strokeDasharray="3 3"
        />
        <polyline
          fill="none"
          stroke={latest.netDeltaFromStart >= 0 ? '#10b981' : '#f43f5e'}
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={polyline}
        />
        {coords.map(({ x, y, pt, i }) => {
          const isSel = activeIdx === i;
          return (
            <g
              key={`${pt.saveDate}-${i}`}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx((curr) => (curr === i ? null : curr))}
              onClick={() => setPinnedIdx((curr) => (curr === i ? null : i))}
              className="cursor-pointer"
            >
              <circle cx={x} cy={y} r={box.hitRadius} fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={isSel ? box.selectedDotRadius : box.dotRadius}
                fill={pt.netDeltaFromStart >= 0 ? '#10b981' : '#f43f5e'}
                stroke={isSel ? '#ffffff' : '#0f172a'}
                strokeWidth={isSel ? 1.8 : 1.2}
              />
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
        <span>{first.saveDate}</span>
        <span className="text-slate-200">
          {activePoint.saveDate} · Avg Core {activePoint.avgCoreAttr.toFixed(1)}
        </span>
        <span>{latest.saveDate}</span>
      </div>
    </div>
  );
};

// ============================================================================
// FM27 ANALYTICS VISUAL SUITE (v2.0):
// 1. PercentilePizzaChart (8-spoke interactive radial percentile pizza)
// 2. MatchXgMomentumChart (dual-series xG For vs Against + finishing variance)
// 3. InteractiveScatterExplorer (preset-driven multi-axis scatter + quadrants)
// 4. SquadDepthAndPlannerChart (Senior vs U21/Loan depth + FM27 Squad Planner)
// ============================================================================

export interface PercentilePizzaChartProps {
  slices: PercentilePizzaSlice[];
  playerName: string;
  subtitle?: string;
  size?: number;
}

export const PercentilePizzaChart: React.FC<PercentilePizzaChartProps> = ({
  slices,
  playerName,
  subtitle,
  size = 276,
}) => {
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  if (!slices || slices.length === 0) {
    return null;
  }

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.34;
  const sliceAngle = (Math.PI * 2) / slices.length;
  const radialBox = getPaddedRadialViewBox(size, 30);

  const getSliceStyle = (cat: PercentilePizzaSlice['category']) => {
    if (cat === 'physical') return { fill: '#10b981', stroke: '#34d399', text: 'text-emerald-300' };
    if (cat === 'technical' || cat === 'goalkeeping')
      return { fill: '#0ea5e9', stroke: '#38bdf8', text: 'text-sky-300' };
    return { fill: '#f59e0b', stroke: '#fbbf24', text: 'text-amber-300' };
  };

  const activeKey = resolveTouchTooltipSelection(pinnedKey, hoveredKey);
  const activeSlice = slices.find((s) => s.key === activeKey) ?? null;

  return (
    <div className="flex flex-col items-center space-y-2 w-full min-w-0">
      <div className="text-center">
        <div className="text-xs font-semibold text-slate-100">
          Position Percentile Profile
        </div>
        {subtitle && (
          <div className="text-[11px] text-slate-400 mt-0.5">{subtitle}</div>
        )}
      </div>

      <svg
        viewBox={radialBox.viewBox}
        role="img"
        aria-label={`8-spoke percentile pizza chart for ${playerName}`}
        className="w-full max-w-[290px] h-auto select-none"
      >
        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <circle
            key={frac}
            cx={cx}
            cy={cy}
            r={maxR * frac}
            fill="none"
            stroke="currentColor"
            strokeWidth={frac === 1 ? 1.1 : 0.7}
            strokeDasharray={frac === 0.5 ? '2 2' : undefined}
            className="text-slate-700/75"
          />
        ))}

        {slices.map((slice, idx) => {
          const startAngle = idx * sliceAngle - Math.PI / 2 + 0.04;
          const endAngle = (idx + 1) * sliceAngle - Math.PI / 2 - 0.04;
          const midAngle = (startAngle + endAngle) / 2;
          const r = Math.max(maxR * 0.16, (slice.percentile / 100) * maxR);
          const style = getSliceStyle(slice.category);
          const isSelected = activeKey === slice.key;
          const lx = cx + (maxR + 23) * Math.cos(midAngle);
          const ly = cy + (maxR + 21) * Math.sin(midAngle);

          return (
            <g
              key={slice.key}
              onMouseEnter={() => setHoveredKey(slice.key)}
              onMouseLeave={() => setHoveredKey((curr) => (curr === slice.key ? null : curr))}
              onClick={() =>
                setPinnedKey((curr) => (curr === slice.key ? null : slice.key))
              }
              className="cursor-pointer"
            >
              <path
                d={buildWedgePath(cx, cy, maxR, startAngle, endAngle)}
                fill="rgba(15, 23, 42, 0.45)"
                stroke="rgba(51, 65, 85, 0.5)"
                strokeWidth={0.65}
              />
              <path
                d={buildWedgePath(cx, cy, r, startAngle, endAngle)}
                fill={style.fill}
                fillOpacity={isSelected ? 0.94 : 0.68}
                stroke={isSelected ? '#ffffff' : style.stroke}
                strokeWidth={isSelected ? 1.9 : 0.9}
              />
              <text
                x={lx}
                y={ly - 4}
                textAnchor="middle"
                dominantBaseline="middle"
                className={`text-[9.5px] font-semibold ${
                  isSelected ? 'fill-white' : 'fill-slate-300'
                }`}
              >
                {slice.shortLabel}
              </text>
              <text
                x={lx}
                y={ly + 7}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-emerald-300 text-[8.5px] font-mono tabular-nums"
              >
                {slice.value} ({slice.percentile}p)
              </text>
            </g>
          );
        })}
      </svg>

      {activeSlice ? (
        <div className="w-full rounded-lg border border-emerald-500/30 bg-slate-950/85 px-3 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-slate-100">{activeSlice.label}</span>
          <span className="font-mono tabular-nums text-emerald-300">
            {activeSlice.value}/20 · {activeSlice.percentile}th pct
            {typeof activeSlice.benchmarkValue === 'number'
              ? ` · Div avg ${activeSlice.benchmarkValue.toFixed(1)}`
              : ''}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Physical
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-sky-500" /> Technical / GK
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-amber-500" /> Mental
          </span>
        </div>
      )}
    </div>
  );
};

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

  const rankedRows = useMemo(
    () => buildXgMomentumRankedRows(xgMatches),
    [xgMatches]
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
    if (xgMatches.length === 0) return -1;
    const found = xgMatches.findIndex((m) => m.id === selectedId);
    return found >= 0 ? found : xgMatches.length - 1;
  }, [xgMatches, selectedId]);

  const selectedMatch = selectedIndex >= 0 ? xgMatches[selectedIndex] : null;

  if (matches.length === 0) {
    return null;
  }

  const box = getResponsiveChartBox('xgTrend', isMobile);
  const { width, height, padL, padR, padT, plotW, plotH } = box;

  const maxXg = Math.max(
    2.5,
    ...xgMatches.map((m) => Math.max(m.xGFor || 0, m.xGAgainst || 0))
  );
  const yCeiling = Math.ceil(maxXg * 2) / 2;

  const mapX = (idx: number, count: number) =>
    count <= 1 ? padL + plotW / 2 : padL + (idx / (count - 1)) * plotW;
  const mapY = (val: number) =>
    padT + plotH - (Math.min(yCeiling, Math.max(0, val)) / yCeiling) * plotH;

  const xgForLine = xgMatches
    .map((m, idx) => `${mapX(idx, xgMatches.length).toFixed(1)},${mapY(m.xGFor || 0).toFixed(1)}`)
    .join(' ');
  const xgAgLine = xgMatches
    .map((m, idx) => `${mapX(idx, xgMatches.length).toFixed(1)},${mapY(m.xGAgainst || 0).toFixed(1)}`)
    .join(' ');

  const hitColWidth =
    xgMatches.length > 1
      ? Math.max(14, plotW / (xgMatches.length - 1))
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
                <span className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                  {activeSeason}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
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
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            {seasons.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedSeason(s)}
                className={`min-h-[38px] sm:min-h-[30px] px-2.5 rounded-md border font-mono font-semibold transition-colors cursor-pointer ${
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
              className={`min-h-[38px] sm:min-h-[30px] px-2.5 rounded-md border font-semibold transition-colors cursor-pointer ${
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap gap-1">
            {scopeTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setScope(tab.id)}
                className={`min-h-[38px] sm:min-h-[32px] px-2.5 rounded-lg border font-semibold transition-colors cursor-pointer ${
                  activeScope === tab.id
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                {tab.label}{' '}
                <span className="font-mono text-[10px] opacity-75">({tab.count})</span>
              </button>
            ))}
          </div>
          {viewMode === 'chart' && (
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
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
          {rankedRows.map((row) => {
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
                className="rounded-xl border border-slate-800 bg-slate-950/75 p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {row.match.date}
                    </span>
                    <span className="text-xs font-semibold text-white truncate">
                      vs {row.match.opponent} ({row.match.venue})
                    </span>
                  </div>
                  <span
                    className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold shrink-0 tabular-nums ${resClass}`}
                  >
                    {row.match.result} {row.match.score}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                  <div className="flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
                    <span className="text-emerald-300">
                      xG {row.xgFor.toFixed(2)}–{row.xgAgainst.toFixed(2)}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="text-[10px] text-slate-400 font-sans">
                      {formatCompetitionBucketTag(bucket)}
                    </span>
                    {row.match.possession != null && (
                      <span className="text-slate-400">{row.match.possession}%</span>
                    )}
                  </div>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${verdictToneClass(
                      row.verdictTone
                    )}`}
                  >
                    {row.verdict}
                  </span>
                </div>
              </div>
            );
          })}
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

            {xgMatches.map((m, idx) => {
              const x = mapX(idx, xgMatches.length);
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
                Math.floor(xgMatches.length / (isMobile ? 4 : 5))
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
                    idx === xgMatches.length - 1 ||
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
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2.5 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-slate-200 min-w-0">
                    <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold shrink-0 ${bucketBadgeClass}`}>
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
                        if (selectedIndex > 0) setSelectedId(xgMatches[selectedIndex - 1].id);
                      }}
                      className="min-h-[40px] min-w-[40px] sm:min-h-[30px] sm:min-w-[30px] inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 disabled:opacity-35 cursor-pointer"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next match"
                      disabled={selectedIndex >= xgMatches.length - 1}
                      onClick={() => {
                        if (selectedIndex < xgMatches.length - 1) {
                          setSelectedId(xgMatches[selectedIndex + 1].id);
                        }
                      }}
                      className="min-h-[40px] min-w-[40px] sm:min-h-[30px] sm:min-w-[30px] inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 disabled:opacity-35 cursor-pointer"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2.5 font-mono tabular-nums text-[11px]">
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
                    className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${verdictToneClass(
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
              className={`min-h-[40px] sm:min-h-[34px] px-2.5 sm:px-3 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
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
              className={`min-h-[40px] sm:min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
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
                    className="min-h-[40px] sm:min-h-[32px] px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-semibold text-emerald-300 cursor-pointer shrink-0"
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



