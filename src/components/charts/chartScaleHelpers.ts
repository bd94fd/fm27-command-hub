import type { PlayerRecord } from '../../types/fm27';

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
    .map((p) =>
      typeof p.marketValue === 'number' && p.marketValue > 0 ? p.marketValue : 0
    )
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

  const rawMax =
    values.length > 0
      ? Math.max(...values)
      : metric === 'wagePw'
        ? 500
        : 100_000;
  const maxWithHeadroom = Math.max(10, Math.ceil(rawMax * 1.1));

  // Round ceiling to a clean human step scaled to the magnitude
  const mag = Math.pow(
    10,
    Math.max(0, Math.floor(Math.log10(maxWithHeadroom)) - 1)
  );
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
