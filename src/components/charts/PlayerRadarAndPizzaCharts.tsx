import React, { useState } from "react";
import type { PlayerRecord } from "../../types/fm27";
import type { PercentilePizzaSlice } from "../../utils/cardIntelligenceEngine";
import type { PlayerProgressionPoint } from "../../utils/progressionDiff";
import {
  getPaddedRadialViewBox,
  getResponsiveChartBox,
  resolveTouchTooltipSelection,
} from "../../utils/mobileChartHelpers";
import { useCompactChartViewport } from "../ChartRankedListToggle";

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
                className={`text-2xs font-semibold ${
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
                className="fill-emerald-400 text-3xs font-mono tabular-nums"
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
          <div className="mt-2 w-full rounded-lg border border-emerald-500/30 bg-slate-950/85 px-3 py-2 text-micro flex flex-wrap items-center justify-between gap-2">
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
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-micro">
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
        <div className="text-2xs text-slate-400">
          {useSquadBaseline
            ? `Compared against your ${squadPlayers.length}-player squad`
            : 'Compared against division baseline'}
        </div>
        {(ipRoleName || oopRoleName) && (
          <div className="text-micro text-slate-400 mt-0.5">
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
                className={`text-3xs font-semibold ${
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
                className="fill-emerald-300 text-3xs font-mono tabular-nums"
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
          <div className="w-full rounded-lg border border-emerald-500/30 bg-slate-950/85 px-3 py-2 text-micro flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="font-semibold text-white">{activeSlice.label}</span>
              <span className="ml-1.5 text-2xs text-slate-400">
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
          <div className="flex flex-wrap items-center justify-center gap-3 text-2xs text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-md bg-emerald-500" /> Physical
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-md bg-sky-500" /> Technical / GK
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-md bg-amber-500" /> Mental
            </span>
            <span className="inline-flex items-center gap-1 text-slate-300">
              <span className="h-2.5 w-2.5 rounded-md border border-white bg-slate-700" /> White rim = Key for Role
            </span>
          </div>
          <p className="text-2xs text-slate-500 text-center max-w-xs">
            Tap any slice to inspect. E.g. <span className="font-mono text-slate-300">85p</span> means higher than 85% of {useSquadBaseline ? 'your squad' : 'the division baseline'}.
          </p>
        </>
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
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
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
        <div className="flex items-center gap-2 font-mono text-micro tabular-nums">
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

      <div className="flex flex-wrap items-center justify-between gap-2 text-2xs font-mono text-slate-400">
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
          <div className="text-micro text-slate-400 mt-0.5">{subtitle}</div>
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
                className={`text-3xs font-semibold ${
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
                className="fill-emerald-300 text-3xs font-mono tabular-nums"
              >
                {slice.value} ({slice.percentile}p)
              </text>
            </g>
          );
        })}
      </svg>

      {activeSlice ? (
        <div className="w-full rounded-lg border border-emerald-500/30 bg-slate-950/85 px-3 py-2 text-micro flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-slate-100">{activeSlice.label}</span>
          <span className="font-mono tabular-nums text-emerald-300">
            {activeSlice.value}/20 · {activeSlice.percentile}th pct
            {typeof activeSlice.benchmarkValue === 'number'
              ? ` · Div avg ${activeSlice.benchmarkValue.toFixed(1)}`
              : ''}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-3 text-2xs text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-md bg-emerald-500" /> Physical
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-md bg-sky-500" /> Technical / GK
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-md bg-amber-500" /> Mental
          </span>
        </div>
      )}
    </div>
  );
};

