import type {
  DoubleGwTrackerRow,
  MatchLogEntry,
  PlayerAttributes,
  PlayerRecord,
} from './types';

export interface Fm27EngineMetrics {
  topSpeedMps: number | null;
  jumpHeightMeters: number | null;
  sprintDrainRate: number | null;
  physicalEngineScore: number | null;
}

/**
 * Patch 27.1.0 physics & load metrics.
 * Never fabricates missing attributes — returns null for any metric whose source attribute is null.
 */
export function computeFm27EngineMetrics(
  playerOrAttrs: PlayerRecord | PlayerAttributes,
): Fm27EngineMetrics {
  const attrs: PlayerAttributes =
    'attributes' in playerOrAttrs ? playerOrAttrs.attributes : playerOrAttrs;

  const pace = attrs.pace;
  const acceleration = attrs.acceleration;
  const jumpingReach = attrs.jumping_reach;
  const stamina = attrs.stamina;

  const topSpeedMps =
    typeof pace === 'number' && Number.isFinite(pace)
      ? Number((8.05 + 0.11 * pace).toFixed(2))
      : null;

  const jumpHeightMeters =
    typeof jumpingReach === 'number' && Number.isFinite(jumpingReach)
      ? Number(((jumpingReach + 5) / 30).toFixed(2))
      : null;

  const sprintDrainRate =
    typeof stamina === 'number' && Number.isFinite(stamina)
      ? Number((2.5 - 0.075 * stamina).toFixed(2))
      : null;

  const physicalEngineScore =
    typeof pace === 'number' &&
    typeof acceleration === 'number' &&
    typeof jumpingReach === 'number' &&
    typeof stamina === 'number'
      ? Math.min(
          100,
          Math.round(pace * 1.4 + acceleration * 1.5 + jumpingReach * 1.1 + stamina * 1.0),
        )
      : null;

  return {
    topSpeedMps,
    jumpHeightMeters,
    sprintDrainRate,
    physicalEngineScore,
  };
}

/**
 * Evaluates Double-Gameweek two-match minute load against FM27 Playbook v2.0 caps:
 * - 125 minutes for standard outfielders
 * - 150 minutes exception for high-stamina players (Stamina >= 13)
 */
export function evaluateDoubleGwLoad(row: DoubleGwTrackerRow): {
  combinedMinutes: number;
  capLimit: number;
  passed: boolean;
  riskTier: 'Optimal' | 'Protected' | 'Overload Risk';
} {
  const combinedMinutes = (row.match1Minutes || 0) + (row.match2Minutes || 0);
  const isHighStamina = (row.stamina ?? 0) >= 13;
  const capLimit = isHighStamina ? 150 : 125;
  const passed = combinedMinutes <= capLimit;

  let riskTier: 'Optimal' | 'Protected' | 'Overload Risk' = 'Optimal';
  if (!passed) {
    riskTier = 'Overload Risk';
  } else if (combinedMinutes > 115) {
    riskTier = 'Protected';
  }

  return {
    combinedMinutes,
    capLimit,
    passed,
    riskTier,
  };
}

export interface CompetitiveSummary {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  totalXgFor: number | null;
  totalXgAgainst: number | null;
  xgDiff: number | null;
  xgMatchesCount: number;
  avgPossession: number | null;
}

/**
 * Computes aggregate competitive metrics from played MatchLogEntry rows.
 * Preserves null for xG and possession when no match-level stats are recorded.
 */
export function computeCompetitiveSummary(
  matches: MatchLogEntry[],
  options?: { leagueOnly?: boolean },
): CompetitiveSummary {
  const filtered = options?.leagueOnly
    ? matches.filter((m) => {
        const comp = (m.competition || '').toLowerCase();
        return !comp.includes('friendly') && !comp.includes('cup');
      })
    : matches;

  const wins = filtered.filter((m) => m.result === 'W').length;
  const draws = filtered.filter((m) => m.result === 'D').length;
  const losses = filtered.filter((m) => m.result === 'L').length;
  const points = wins * 3 + draws;

  const xgMatches = filtered.filter(
    (m) => typeof m.xGFor === 'number' && typeof m.xGAgainst === 'number',
  );
  const totalXgFor =
    xgMatches.length > 0
      ? Number(xgMatches.reduce((sum, m) => sum + (m.xGFor ?? 0), 0).toFixed(2))
      : null;
  const totalXgAgainst =
    xgMatches.length > 0
      ? Number(xgMatches.reduce((sum, m) => sum + (m.xGAgainst ?? 0), 0).toFixed(2))
      : null;
  const xgDiff =
    totalXgFor !== null && totalXgAgainst !== null
      ? Number((totalXgFor - totalXgAgainst).toFixed(2))
      : null;

  const possMatches = filtered.filter((m) => typeof m.possession === 'number');
  const avgPossession =
    possMatches.length > 0
      ? Math.round(
          possMatches.reduce((sum, m) => sum + (m.possession ?? 0), 0) / possMatches.length,
        )
      : null;

  return {
    played: filtered.length,
    wins,
    draws,
    losses,
    points,
    totalXgFor,
    totalXgAgainst,
    xgDiff,
    xgMatchesCount: xgMatches.length,
    avgPossession,
  };
}
