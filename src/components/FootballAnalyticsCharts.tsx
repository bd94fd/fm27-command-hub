import React, { useMemo, useState } from 'react';
import { PlayerRecord } from '../types/fm27';
import {
  ComparisonChartMode,
  MultiPlayerComparisonDataset,
} from '../utils/playerComparisonEngine';
import { PlayerProgressionPoint } from '../utils/progressionDiff';

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
  const axes = isGkPlayer(player) ? GK_AXES : OUTFIELD_AXES;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const rings = [5, 10, 15, 20];

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

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Attribute radar for ${player.name}${comparePlayer ? ` vs ${comparePlayer.name}` : ''}`}
        className="overflow-visible"
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

        {/* Axis spokes & labels */}
        {axes.map((ax, idx) => {
          const [xEnd, yEnd] = getPoint(idx, 20);
          const angle = (Math.PI * 2 * idx) / axes.length - Math.PI / 2;
          const lx = cx + (radius + 22) * Math.cos(angle);
          const ly = cy + (radius + 20) * Math.sin(angle);
          const pVal = Number(player.attributes?.[ax.key] ?? 10);
          return (
            <g key={ax.key}>
              <line
                x1={cx}
                y1={cy}
                x2={xEnd}
                y2={yEnd}
                stroke="currentColor"
                strokeWidth={0.75}
                className="text-slate-700/70"
              />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-slate-300 text-[10px] font-semibold"
              >
                {ax.label}
              </text>
              <text
                x={lx}
                y={ly + 11}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-emerald-400 text-[9px] font-mono"
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

        {/* Vertex dots */}
        {axes.map((ax, idx) => {
          const [x, y] = getPoint(idx, Number(player.attributes?.[ax.key] ?? 10));
          return (
            <circle
              key={`dot-p1-${ax.key}`}
              cx={x}
              cy={y}
              r={3}
              fill="#34d399"
              stroke="#022c22"
              strokeWidth={1}
            />
          );
        })}
        {comparePlayer &&
          axes.map((ax, idx) => {
            const [x, y] = getPoint(
              idx,
              Number(comparePlayer.attributes?.[ax.key] ?? 10)
            );
            return (
              <circle
                key={`dot-p2-${ax.key}`}
                cx={x}
                cy={y}
                r={3}
                fill="#38bdf8"
                stroke="#082f49"
                strokeWidth={1}
              />
            );
          })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[11px]">
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
  const [hovered, setHovered] = useState<PlayerRecord | null>(null);
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

  const width = 520;
  const height = 270;
  const padLeft = 64;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 38;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

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

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-200">
          {xLabel} vs {yLabel} ({filteredPlayers.length} players)
        </span>
        {hovered ? (
          <span className="font-mono text-[11px] text-emerald-300">
            {hovered.name} · {xLabel} {getXVal(hovered)} · {formatY(getYVal(hovered))} ·{' '}
            {hovered.ability.toFixed(1)}★
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">
            Tap any dot to inspect player profile
          </span>
        )}
      </div>

      {/* Compact X/Y controls + Position filter chips */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map((grp) => (
            <button
              key={grp}
              type="button"
              onClick={() => setPosGroup(grp)}
              className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                posGroup === grp
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {grp}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <label className="inline-flex items-center gap-1 text-slate-400">
            X:
            <select
              value={xMetric}
              onChange={(e) => setXMetric(e.target.value as ScatterXMetric)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-200 text-[11px]"
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
              className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-200 text-[11px]"
            >
              <option value="auto">{scale.metricLabel}</option>
              <option value="ability">Ability ★</option>
              <option value="rating">Avg Rating</option>
              <option value="xGPer90">xG / 90</option>
            </select>
          </label>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Squad ${xLabel} vs ${yLabel} scatter plot`}
        className="w-full h-auto rounded-lg bg-slate-950/60 border border-slate-800"
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
              className="fill-emerald-500/70 text-[9px] font-semibold"
            >
              Peak Years (23–28)
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
                x={padLeft - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-400 text-[9px] font-mono"
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
                y={height - 14}
                textAnchor="middle"
                className="fill-slate-400 text-[9px] font-mono"
              >
                {xMetric === 'age' ? `${tickVal}y` : tickVal}
              </text>
            </g>
          );
        })}

        {/* Player scatter dots */}
        {filteredPlayers.map((p) => {
          const x = mapX(getXVal(p));
          const y = mapY(getYVal(p));
          const isBanned =
            Array.isArray(p.activeSuspensions) && p.activeSuspensions.length > 0;
          const isSelected = p.id === selectedPlayerId || hovered?.id === p.id;
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
              onClick={() => onSelectPlayer?.(p)}
              className="cursor-pointer"
            >
              <circle
                cx={x}
                cy={y}
                r={isSelected ? 6.5 : 4.5}
                fill={fill}
                fillOpacity={isSelected ? 0.95 : 0.78}
                stroke={isSelected ? '#ffffff' : '#0f172a'}
                strokeWidth={isSelected ? 1.8 : 1}
              />
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-400">
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
  const slices = getPizzaSlicesForPosition(player.position);
  const useSquadBaseline = squadPlayers.length >= 4;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.33;
  const sliceAngle = (Math.PI * 2) / slices.length;

  const categoryColor = (cat: PizzaSliceDefinition['category']) => {
    if (cat === 'Physical') return { fill: '#10b981', stroke: '#34d399' };
    if (cat === 'Technical') return { fill: '#0ea5e9', stroke: '#38bdf8' };
    return { fill: '#f59e0b', stroke: '#fbbf24' };
  };

  return (
    <div className="flex flex-col items-center space-y-2">
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
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Role and attribute percentile pizza chart for ${player.name}`}
        className="overflow-visible"
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

          const lx = cx + (maxR + 24) * Math.cos(midAngle);
          const ly = cy + (maxR + 22) * Math.sin(midAngle);

          return (
            <g key={slice.key}>
              <path
                d={buildWedgePath(cx, cy, maxR, startAngle, endAngle)}
                fill="rgba(15, 23, 42, 0.45)"
                stroke="rgba(51, 65, 85, 0.5)"
                strokeWidth={0.6}
              />
              <path
                d={buildWedgePath(cx, cy, r, startAngle, endAngle)}
                fill={colors.fill}
                fillOpacity={isRoleKey ? 0.85 : 0.62}
                stroke={isRoleKey ? '#ffffff' : colors.stroke}
                strokeWidth={isRoleKey ? 1.5 : 0.9}
              />
              <text
                x={lx}
                y={ly - 4}
                textAnchor="middle"
                dominantBaseline="middle"
                className={`text-[9px] font-semibold ${
                  isRoleKey ? 'fill-white font-bold' : 'fill-slate-300'
                }`}
              >
                {slice.label}
              </text>
              <text
                x={lx}
                y={ly + 6}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-emerald-300 text-[8.5px] font-mono"
              >
                {rawVal} ({pct}p)
              </text>
            </g>
          );
        })}
      </svg>

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
        Longer slice = stronger attribute. E.g. <span className="font-mono text-slate-300">85p</span> means higher than 85% of {useSquadBaseline ? 'your squad' : 'the division baseline'}.
      </p>
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

  const getRadarPoint = (axisIndex: number, value: number, total: number): [number, number] => {
    const angle = (Math.PI * 2 * axisIndex) / total - Math.PI / 2;
    const clamped = Math.min(20, Math.max(1, value || 1));
    const r = (clamped / 20) * radius;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };

  return (
    <div className="space-y-3">
      {/* Mode switcher — 44px touch targets for Pixel 10 Pro XL */}
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
              className={`min-h-[40px] px-3.5 rounded-lg text-xs font-semibold transition-colors ${
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
        <div className="flex flex-col items-center">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={`Multi-player radar comparison for ${players.map((p) => p.name).join(' vs ')}`}
            className="w-full max-w-[300px] h-auto"
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
              const [lx, ly] = getRadarPoint(i, 24, radarAxes.length);
              return (
                <g key={ax.key}>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(148, 163, 184, 0.18)"
                    strokeWidth={0.8}
                  />
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-slate-300 text-[9.5px] font-semibold"
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
                    return <circle key={ax.key} cx={x} cy={y} r={3} fill={color} />;
                  })}
                </g>
              );
            })}
          </svg>
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
  if (points.length < 2) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
        Save at least 2 `.fm` snapshots over time to unlock {playerName}&apos;s progression timeline (star rating &amp; attribute delta).
      </div>
    );
  }

  const width = 360;
  const height = 110;
  const padX = 24;
  const padY = 18;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const deltas = points.map((p) => p.netDeltaFromStart);
  const minD = Math.min(0, ...deltas);
  const maxD = Math.max(2, ...deltas);
  const spanD = Math.max(1, maxD - minD);

  const coords = points.map((pt, i) => {
    const x = padX + (i / Math.max(1, points.length - 1)) * plotW;
    const y = padY + plotH - ((pt.netDeltaFromStart - minD) / spanD) * plotH;
    return { x, y, pt };
  });

  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const latest = points[points.length - 1];
  const first = points[0];
  const deltaSign = latest.netDeltaFromStart > 0 ? '+' : '';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-200">
          Progression Timeline ({points.length} saves)
        </span>
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span
            className={
              latest.netDeltaFromStart >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }
          >
            {deltaSign}
            {latest.netDeltaFromStart} net attr
          </span>
          {latest.abilityStars != null && (
            <span className="text-amber-300">{latest.abilityStars.toFixed(1)}★</span>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Progression timeline for ${playerName}`}
        className="w-full h-auto"
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
        {coords.map(({ x, y, pt }) => (
          <g key={pt.saveDate}>
            <circle
              cx={x}
              cy={y}
              r={3.5}
              fill={pt.netDeltaFromStart >= 0 ? '#10b981' : '#f43f5e'}
              stroke="#0f172a"
              strokeWidth={1.2}
            />
          </g>
        ))}
      </svg>

      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
        <span>{first.saveDate}</span>
        <span>Avg Core: {latest.avgCoreAttr.toFixed(1)}</span>
        <span>{latest.saveDate}</span>
      </div>
    </div>
  );
};


