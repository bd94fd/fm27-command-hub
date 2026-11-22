/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Plan 3: FM-Arena Meta Score, PA Meta, and Small-Club Scouting Benchmarks.
 *
 * Outfield & Goalkeeper Meta Score attribute weights adapted from
 * mavarobli/FMSuperScout (MIT License), based on FM-Arena match-engine testing.
 * Small-club scouting metrics (Starter Gain, Reputation Fit, Median/Top-11 League Benchmarks)
 * inspired by tmdavid/dugout (MIT License).
 */

import { PlayerRecord } from '../types/fm27';

export const FM_ARENA_OUTFIELD_META_WEIGHTS: Partial<
  Record<keyof PlayerRecord['attributes'], number>
> = {
  pace: 20.5,
  acceleration: 20.4,
  jumpingReach: 11.6,
  dribbling: 9.8,
  balance: 5.3,
  concentration: 4.5,
  anticipation: 4.3,
  determination: 2.7,
  agility: 2.7,
  stamina: 2.5,
  strength: 1.9,
  firstTouch: 1.5,
  composure: 1.2,
  workRate: 1.1,
  finishing: 1.1,
  flair: 1.1,
  longShots: 1.0,
  aggression: 1.0,
  heading: 0.6,
  offTheBall: 0.5,
};

export const FM_ARENA_GK_META_WEIGHTS: Partial<
  Record<keyof PlayerRecord['attributes'], number>
> = {
  reflexes: 12.8,
  agility: 8.0,
  acceleration: 4.7,
  pace: 3.5,
  aerialReach: 3.4,
};

export interface PlayerMetaEvaluation {
  metaScore: number | null; // 1.0 - 20.0
  paMetaScore: number | null; // projected meta score at full potential
  isGoalkeeper: boolean;
  tier: 'Elite' | 'Strong' | 'Solid' | 'Below Par' | 'Unrated';
}

export function isGoalkeeperPlayer(player: PlayerRecord): boolean {
  const pos = player.position.toUpperCase();
  if (pos === 'GK' || pos.startsWith('GK ')) return true;
  return (player.positionRatings?.GK ?? 0) >= 15;
}

/**
 * Computes the FM-Arena Meta Score (1-20) and projected PA Meta Score for a player.
 */
export function evaluatePlayerMetaScore(player: PlayerRecord): PlayerMetaEvaluation {
  const isGk = isGoalkeeperPlayer(player);
  const weights = isGk ? FM_ARENA_GK_META_WEIGHTS : FM_ARENA_OUTFIELD_META_WEIGHTS;
  const attrs = player.attributes;

  let sum = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights) as Array<
    [keyof PlayerRecord['attributes'], number]
  >) {
    const val = attrs[key];
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      sum += val * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) {
    return {
      metaScore: null,
      paMetaScore: null,
      isGoalkeeper: isGk,
      tier: 'Unrated',
    };
  }

  const metaScore = Number((sum / totalWeight).toFixed(2));

  // Estimate PA Meta uplift from remaining star headroom (physicals taper after age 23)
  const starHeadroom = Math.max(0, (player.potential ?? player.ability) - player.ability);
  const ageFactor = player.age <= 21 ? 1.0 : player.age <= 24 ? 0.65 : 0.25;
  const projectedUplift = starHeadroom * 1.15 * ageFactor;
  const paMetaScore = Number(Math.min(20, Math.max(metaScore, metaScore + projectedUplift)).toFixed(2));

  const tier: PlayerMetaEvaluation['tier'] =
    metaScore >= 14.5
      ? 'Elite'
      : metaScore >= 12.5
        ? 'Strong'
        : metaScore >= 10.5
          ? 'Solid'
          : 'Below Par';

  return {
    metaScore,
    paMetaScore,
    isGoalkeeper: isGk,
    tier,
  };
}

export interface StarterGainResult {
  candidateMeta: number | null;
  starterMeta: number | null;
  metaGain: number | null;
  isUpgrade: boolean;
}

/**
 * Compares a transfer target's Meta Score against your current best starter in that position.
 */
export function computeStarterGain(
  candidate: PlayerRecord,
  currentStarter: PlayerRecord | null
): StarterGainResult {
  const candidateMeta = evaluatePlayerMetaScore(candidate).metaScore;
  const starterMeta = currentStarter ? evaluatePlayerMetaScore(currentStarter).metaScore : null;
  if (candidateMeta == null || starterMeta == null) {
    return { candidateMeta, starterMeta, metaGain: null, isUpgrade: false };
  }
  const metaGain = Number((candidateMeta - starterMeta).toFixed(2));
  return {
    candidateMeta,
    starterMeta,
    metaGain,
    isUpgrade: metaGain > 0.25,
  };
}

export interface ReputationFitResult {
  gap: number; // playerRep - clubRep
  likelihood: 'Likely Interested' | 'Realistic Stretch' | 'Unlikely' | 'Out of Reach';
}

/**
 * Evaluates whether a target will realistically talk to a small club based on reputation gap.
 */
export function evaluateClubReputationFit(
  playerReputation: number,
  clubReputation: number
): ReputationFitResult {
  const gap = playerReputation - clubReputation;
  if (gap <= 500) return { gap, likelihood: 'Likely Interested' };
  if (gap <= 1500) return { gap, likelihood: 'Realistic Stretch' };
  if (gap <= 3000) return { gap, likelihood: 'Unlikely' };
  return { gap, likelihood: 'Out of Reach' };
}

export interface LeagueClubBenchmark {
  clubName: string;
  squadCount: number;
  medianValue: number | null;
  top11AverageMeta: number | null;
}

/**
 * Computes Dugout-style median squad value and Top-11 average Meta Score so a single
 * outlier wonderkid doesn't skew club comparisons.
 */
export function computeClubBenchmark(
  clubName: string,
  players: PlayerRecord[]
): LeagueClubBenchmark {
  const values = players
    .map((p) => p.marketValue)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);

  let medianValue: number | null = null;
  if (values.length > 0) {
    const mid = Math.floor(values.length / 2);
    medianValue =
      values.length % 2 === 0
        ? Math.round((values[mid - 1] + values[mid]) / 2)
        : values[mid];
  }

  const metas = players
    .map((p) => evaluatePlayerMetaScore(p).metaScore)
    .filter((m): m is number => m !== null)
    .sort((a, b) => b - a)
    .slice(0, 11);

  const top11AverageMeta =
    metas.length > 0
      ? Number((metas.reduce((acc, v) => acc + v, 0) / metas.length).toFixed(2))
      : null;

  return {
    clubName,
    squadCount: players.length,
    medianValue,
    top11AverageMeta,
  };
}
