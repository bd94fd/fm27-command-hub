import type { MatchLogEntry, PlayerRecord } from '../types/fm27';
import { parseScoreGoals } from './matchScopeHelpers';

export type ChartViewMode = 'chart' | 'list';

export type ScatterExplorerPresetKey =
  | 'ageValue'
  | 'attackOutput'
  | 'transitionEngine'
  | 'valueEfficiency';

export interface ResponsiveChartBox {
  width: number;
  height: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  plotW: number;
  plotH: number;
  dotRadius: number;
  selectedDotRadius: number;
  hitRadius: number;
  axisFontClass: string;
  labelFontClass: string;
}

/**
 * Returns mobile-tuned vs desktop SVG geometry so dense charts stay legible
 * at 360px–430px (no 540px-to-320px shrink-down of text or tiny touch targets).
 */
export function getResponsiveChartBox(
  kind: 'scatter' | 'xgTrend' | 'sparkline',
  isMobile: boolean
): ResponsiveChartBox {
  if (kind === 'xgTrend') {
    const width = isMobile ? 360 : 540;
    const height = isMobile ? 225 : 215;
    const padL = isMobile ? 34 : 38;
    const padR = isMobile ? 14 : 16;
    const padT = 18;
    const padB = isMobile ? 38 : 34;
    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      plotW: width - padL - padR,
      plotH: height - padT - padB,
      dotRadius: isMobile ? 4.2 : 3.5,
      selectedDotRadius: isMobile ? 6 : 5,
      hitRadius: isMobile ? 16 : 10,
      axisFontClass: isMobile ? 'text-2xs' : 'text-3xs',
      labelFontClass: 'text-3xs',
    };
  }

  if (kind === 'sparkline') {
    const width = isMobile ? 320 : 360;
    const height = isMobile ? 124 : 110;
    const padL = 22;
    const padR = 22;
    const padT = 18;
    const padB = 20;
    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      plotW: width - padL - padR,
      plotH: height - padT - padB,
      dotRadius: isMobile ? 4.5 : 3.5,
      selectedDotRadius: isMobile ? 6.5 : 5,
      hitRadius: isMobile ? 16 : 11,
      axisFontClass: isMobile ? 'text-2xs' : 'text-3xs',
      labelFontClass: 'text-3xs',
    };
  }

  // Scatter plots (InteractiveScatterExplorer & SquadAgeValueScatterPlot)
  const width = isMobile ? 360 : 520;
  const height = isMobile ? 255 : 265;
  const padL = isMobile ? 54 : 60;
  const padR = isMobile ? 16 : 18;
  const padT = 20;
  const padB = isMobile ? 36 : 36;
  return {
    width,
    height,
    padL,
    padR,
    padT,
    padB,
    plotW: width - padL - padR,
    plotH: height - padT - padB,
    dotRadius: isMobile ? 5.5 : 4.5,
    selectedDotRadius: isMobile ? 7.5 : 6.5,
    hitRadius: isMobile ? 16 : 11,
    axisFontClass: isMobile ? 'text-2xs' : 'text-3xs',
    labelFontClass: 'text-3xs',
  };
}

export interface PaddedRadialViewBox {
  minX: number;
  minY: number;
  fullSize: number;
  viewBox: string;
}

/**
 * Pads radial SVG viewBoxes symmetrically so outer axis/slice labels never clip
 * or overflow horizontally on 360px phones (eliminating `overflow-visible` leaks).
 */
export function getPaddedRadialViewBox(
  size: number,
  pad = 28
): PaddedRadialViewBox {
  const safeSize = Math.max(120, Math.round(size));
  const safePad = Math.max(0, Math.round(pad));
  const fullSize = safeSize + safePad * 2;
  return {
    minX: -safePad,
    minY: -safePad,
    fullSize,
    viewBox: `${-safePad} ${-safePad} ${fullSize} ${fullSize}`,
  };
}

/**
 * Deterministic tooltip/inspect selection:
 * - On touch devices, tapping pins an item (`pinned`).
 * - Desktop hover previews (`hovered`) when nothing is pinned, or while moving over other points.
 */
export function resolveTouchTooltipSelection<T>(
  pinned: T | null,
  hovered: T | null,
  fallback: T | null = null
): T | null {
  return hovered ?? pinned ?? fallback;
}

export interface RankedScatterRow {
  rank: number;
  player: PlayerRecord;
  xVal: number;
  yVal: number;
  score: number;
  quadrantLabel: string;
  quadrantTone: 'emerald' | 'sky' | 'amber' | 'rose';
}

export function classifyScatterQuadrant(
  preset: ScatterExplorerPresetKey,
  xVal: number,
  yVal: number,
  midX: number,
  midY: number
): { label: string; tone: 'emerald' | 'sky' | 'amber' | 'rose' } {
  const highX = xVal >= midX;
  const highY = yVal >= midY;

  if (preset === 'transitionEngine') {
    if (highX && highY) return { label: 'Elite 27.1.0 Runner', tone: 'emerald' };
    if (highX && !highY) return { label: 'Explosive (Sub Risk)', tone: 'amber' };
    if (!highX && highY) return { label: 'Tireless Engine', tone: 'sky' };
    return { label: 'Fatigue / Speed Risk', tone: 'rose' };
  }

  if (preset === 'attackOutput') {
    if (highX && highY) return { label: 'Dual Goal + Creator', tone: 'emerald' };
    if (highX && !highY) return { label: 'Box Finisher', tone: 'sky' };
    if (!highX && highY) return { label: 'Chance Creator', tone: 'sky' };
    return { label: 'Low Attack Volume', tone: 'amber' };
  }

  if (preset === 'valueEfficiency') {
    if (!highX && highY) return { label: 'Bargain Performer', tone: 'emerald' };
    if (highX && highY) return { label: 'Paid Leader', tone: 'sky' };
    if (!highX && !highY) return { label: 'Low-Wage Depth', tone: 'amber' };
    return { label: 'Overpaid Output', tone: 'rose' };
  }

  // ageValue
  if (!highX && highY) return { label: 'High-Value Young Core', tone: 'emerald' };
  if (!highX && !highY) return { label: 'Low-Cost Youth', tone: 'sky' };
  if (highX && highY) return { label: 'High-Cost Veteran', tone: 'amber' };
  return { label: 'Experienced Cover', tone: 'amber' };
}

export function rankScatterExplorerPlayers(
  players: PlayerRecord[],
  preset: ScatterExplorerPresetKey,
  getX: (p: PlayerRecord) => number,
  getY: (p: PlayerRecord) => number,
  midX: number,
  midY: number
): RankedScatterRow[] {
  const safeMidX = Math.max(1, Math.abs(midX));
  const safeMidY = Math.max(0.01, Math.abs(midY));

  const scored = players.map((player) => {
    const xVal = getX(player);
    const yVal = getY(player);
    const quadrant = classifyScatterQuadrant(preset, xVal, yVal, midX, midY);

    let score = 0;
    if (preset === 'transitionEngine') {
      // FM27 27.1.0 weights Pace + Stamina equally for high-tempo transitions
      score = xVal + yVal;
    } else if (preset === 'attackOutput') {
      score = xVal + yVal;
    } else if (preset === 'valueEfficiency') {
      // Higher rating relative to wage ratio ranks best
      score = yVal - (xVal / safeMidX) * 0.25;
    } else {
      // Age vs Value/Wage: surface highest value/wage asset first, slight youth tiebreak
      score = yVal / safeMidY - xVal * 0.005;
    }

    return {
      player,
      xVal,
      yVal,
      score,
      quadrantLabel: quadrant.label,
      quadrantTone: quadrant.tone,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.player.ability || 0) - (a.player.ability || 0);
  });

  return scored.map((row, index) => ({
    rank: index + 1,
    ...row,
  }));
}

export interface RankedAgeValueRow {
  rank: number;
  player: PlayerRecord;
  xVal: number;
  yVal: number;
}

export function rankAgeValuePlayers(
  players: PlayerRecord[],
  getX: (p: PlayerRecord) => number,
  getY: (p: PlayerRecord) => number
): RankedAgeValueRow[] {
  const rows = players.map((player) => ({
    player,
    xVal: getX(player),
    yVal: getY(player),
  }));
  rows.sort((a, b) => {
    if (b.yVal !== a.yVal) return b.yVal - a.yVal;
    return (b.player.ability || 0) - (a.player.ability || 0);
  });
  return rows.map((row, idx) => ({ rank: idx + 1, ...row }));
}

export interface XgMomentumRankedRow {
  match: MatchLogEntry;
  goalsFor: number;
  goalsAgainst: number;
  xgFor: number;
  xgAgainst: number;
  xgDiff: number;
  finishingDelta: number;
  verdict: string;
  verdictTone: 'emerald' | 'sky' | 'amber' | 'rose';
}

export function describeMatchXgVerdict(
  xgDiff: number,
  finishingDelta: number
): { verdict: string; tone: 'emerald' | 'sky' | 'amber' | 'rose' } {
  if (xgDiff >= 0.75 && finishingDelta >= -0.25) {
    return {
      verdict: `Dominated chances (+${xgDiff.toFixed(2)} xG)`,
      tone: 'emerald',
    };
  }
  if (xgDiff >= 0.5 && finishingDelta < -0.5) {
    return {
      verdict: `Wasteful finishing (${finishingDelta.toFixed(2)} vs xG)`,
      tone: 'amber',
    };
  }
  if (finishingDelta >= 0.65) {
    return {
      verdict: `Clinical finishing (+${finishingDelta.toFixed(2)} vs xG)`,
      tone: 'sky',
    };
  }
  if (xgDiff <= -0.6) {
    return {
      verdict: `Out-created (${xgDiff.toFixed(2)} xG diff)`,
      tone: 'rose',
    };
  }
  return {
    verdict: `Tight xG battle (${xgDiff >= 0 ? '+' : ''}${xgDiff.toFixed(2)})`,
    tone: 'sky',
  };
}

/**
 * Returns newest-first ranked list of matches with xG difference, finishing delta,
 * and plain-English football explanation for mobile scanning.
 */
export function buildXgMomentumRankedRows(
  xgMatchesChronological: MatchLogEntry[]
): XgMomentumRankedRow[] {
  return [...xgMatchesChronological].reverse().map((match) => {
    const [goalsFor, goalsAgainst] = parseScoreGoals(match.score);
    const xgFor = match.xGFor ?? 0;
    const xgAgainst = match.xGAgainst ?? 0;
    const xgDiff = xgFor - xgAgainst;
    const finishingDelta = goalsFor - xgFor;
    const { verdict, tone } = describeMatchXgVerdict(xgDiff, finishingDelta);
    return {
      match,
      goalsFor,
      goalsAgainst,
      xgFor,
      xgAgainst,
      xgDiff,
      finishingDelta,
      verdict,
      verdictTone: tone,
    };
  });
}
