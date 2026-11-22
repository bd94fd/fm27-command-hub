import React, { useMemo, useState } from 'react';
import { PlayerRecord } from '../types/fm27';

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

export const SquadAgeValueScatterPlot: React.FC<SquadAgeValueScatterPlotProps> = ({
  players,
  selectedPlayerId = null,
  onSelectPlayer,
}) => {
  const [hovered, setHovered] = useState<PlayerRecord | null>(null);
  const scale = useMemo(() => computeDynamicScatterScale(players), [players]);

  const width = 520;
  const height = 270;
  const padLeft = 64;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 38;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const ages = players.map((p) => p.age || 22);
  const minAge = Math.min(17, ...(ages.length > 0 ? ages : [18]));
  const maxAge = Math.max(35, ...(ages.length > 0 ? ages : [34]));
  const ageSpan = Math.max(1, maxAge - minAge);

  const mapX = (age: number) =>
    padLeft + ((Math.min(maxAge, Math.max(minAge, age)) - minAge) / ageSpan) * plotW;
  const mapY = (val: number) =>
    padTop + plotH - (Math.min(scale.maxY, Math.max(0, val)) / Math.max(1, scale.maxY)) * plotH;

  const ageTicks = [minAge, Math.round((minAge + maxAge) / 2), 23, 29, maxAge]
    .filter((v, i, arr) => v >= minAge && v <= maxAge && arr.indexOf(v) === i)
    .sort((a, b) => a - b);

  // Peak age band (23–28)
  const peakX1 = mapX(Math.max(minAge, 23));
  const peakX2 = mapX(Math.min(maxAge, 28));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-200">
          Age vs {scale.metricLabel} (Dynamic Club-Tier Scale: 0 – {scale.formatTick(scale.maxY)})
        </span>
        {hovered ? (
          <span className="font-mono text-[11px] text-emerald-300">
            {hovered.name} · Age {hovered.age} ·{' '}
            {scale.formatTick(
              scale.metric === 'marketValue'
                ? hovered.marketValue || 0
                : hovered.wagePw || 0
            )}{' '}
            · {hovered.ability.toFixed(1)}★
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">
            Hover or click any dot to inspect player profile
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Squad Age vs ${scale.metricLabel} scatter plot`}
        className="w-full h-auto rounded-lg bg-slate-950/60 border border-slate-800"
      >
        {/* Peak-age shading (23–28) */}
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

        {/* Horizontal gridlines + dynamic Y ticks */}
        {scale.ticks.map((tick) => {
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
                {scale.formatTick(tick)}
              </text>
            </g>
          );
        })}

        {/* Vertical X ticks (Age) */}
        {ageTicks.map((age) => {
          const x = mapX(age);
          return (
            <g key={`x-${age}`}>
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
                {age}y
              </text>
            </g>
          );
        })}

        {/* Player scatter dots */}
        {players.map((p) => {
          const val =
            scale.metric === 'marketValue' ? p.marketValue || 0 : p.wagePw || 0;
          const x = mapX(p.age || 22);
          const y = mapY(val);
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

