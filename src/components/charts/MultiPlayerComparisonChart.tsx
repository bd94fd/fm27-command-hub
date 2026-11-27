import React, { useState } from "react";
import type {
  ComparisonChartMode,
  MultiPlayerComparisonDataset,
} from "../../utils/playerComparisonEngine";
import {
  getPaddedRadialViewBox,
  resolveTouchTooltipSelection,
} from "../../utils/mobileChartHelpers";

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
          className="inline-flex rounded-xl border border-slate-800 bg-slate-950/85 p-1"
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
        <div className="flex flex-wrap items-center gap-2 text-micro">
          {players.map((p, idx) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/70 px-2.5 py-1 text-slate-200"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: colors[idx] }}
              />
              <span className="font-medium truncate max-w-[120px]">{p.name}</span>
              <span className="text-2xs text-slate-400 font-mono">{p.position}</span>
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
                    className={`text-2xs font-semibold ${
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
            <div className="w-full rounded-lg border border-emerald-500/30 bg-slate-950/85 px-3 py-2 text-micro flex flex-wrap items-center justify-between gap-2">
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
            <div className="text-2xs text-slate-500">
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
                <div className="flex items-center justify-between text-micro">
                  <span className="font-semibold text-slate-200">{slice.label}</span>
                  <span className="text-2xs text-slate-500 uppercase tracking-wider">
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
                        <div className="flex items-center justify-between text-2xs font-mono">
                          <span className="text-slate-300 truncate max-w-[110px]">{p.name}</span>
                          <span className="text-slate-200">
                            {val} · <span style={{ color: colors[idx] }}>{pct}p</span>{' '}
                            <span className="text-slate-500">({bucket})</span>
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-[width]"
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
                    className="text-2xs font-mono px-1.5 py-0.5 rounded-md bg-slate-900 border border-slate-700"
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
                    <div key={p.id} className="flex items-center gap-2 text-micro">
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

