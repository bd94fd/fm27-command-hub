/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatchLogEntry } from '../types/fm27';

export interface MatchMomentumSummary {
  matchesAnalysed: number;
  matchesWithXg: number;
  actualPoints: number;
  expectedPoints: number;
  pointsDelta: number;
  goalsFor: number;
  goalsAgainst: number;
  xGFor: number;
  xGAgainst: number;
  finishingDelta: number;
  defensiveDelta: number;
  verdictTitle: string;
  verdictDetail: string;
}

export interface SeasonChronicleEntry {
  seasonLabel: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  longestUnbeatenRun: number;
  biggestWin: string | null;
  cupMatches: number;
}

function parseScore(score: string): [number, number] {
  const parts = (score || '0 - 0').split('-').map((s) => Number(s.trim()));
  const gf = Number.isFinite(parts[0]) ? parts[0] : 0;
  const ga = Number.isFinite(parts[1]) ? parts[1] : 0;
  return [gf, ga];
}

function extractSeasonLabel(dateStr: string): string {
  const s = (dateStr || '').trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const startYear = month >= 7 ? year : year - 1;
    return `${startYear}/${String(startYear + 1).slice(-2)}`;
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const startYear = month >= 7 ? year : year - 1;
    return `${startYear}/${String(startYear + 1).slice(-2)}`;
  }
  return 'Current Season';
}

/**
 * Estimates expected points (0–3) for a single match from xG For vs xG Against
 * using a smooth logistic win/draw/loss approximation.
 */
export function estimateExpectedPoints(xgFor: number, xgAgainst: number): number {
  const diff = xgFor - xgAgainst;
  const winProb = 1 / (1 + Math.exp(-1.35 * (diff - 0.15)));
  const lossProb = 1 / (1 + Math.exp(1.35 * (diff + 0.15)));
  const drawProb = Math.max(0, 1 - winProb - lossProb);
  return Math.max(0, Math.min(3, winProb * 3 + drawProb * 1));
}

/**
 * Computes Match Momentum & xG Story (Actual vs Expected Points, Finishing & Defensive Deltas)
 * strictly from real synced match records.
 */
export function buildMatchMomentumSummary(
  matches: MatchLogEntry[]
): MatchMomentumSummary | null {
  if (!matches || matches.length === 0) return null;

  let actualPoints = 0;
  let expectedPoints = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let xgGoalsFor = 0;
  let xgGoalsAgainst = 0;
  let xGFor = 0;
  let xGAgainst = 0;
  let matchesWithXg = 0;

  for (const m of matches) {
    const [gf, ga] = parseScore(m.score);
    goalsFor += gf;
    goalsAgainst += ga;
    if (m.result === 'W') actualPoints += 3;
    else if (m.result === 'D') actualPoints += 1;

    if (
      typeof m.xGFor === 'number' &&
      Number.isFinite(m.xGFor) &&
      typeof m.xGAgainst === 'number' &&
      Number.isFinite(m.xGAgainst)
    ) {
      matchesWithXg += 1;
      xgGoalsFor += gf;
      xgGoalsAgainst += ga;
      xGFor += m.xGFor;
      xGAgainst += m.xGAgainst;
      expectedPoints += estimateExpectedPoints(m.xGFor, m.xGAgainst);
    } else {
      expectedPoints += m.result === 'W' ? 3 : m.result === 'D' ? 1 : 0;
    }
  }

  const pointsDelta = Number((actualPoints - expectedPoints).toFixed(1));
  const finishingDelta =
    matchesWithXg > 0 ? Number((xgGoalsFor - xGFor).toFixed(2)) : 0;
  const defensiveDelta =
    matchesWithXg > 0 ? Number((xGAgainst - xgGoalsAgainst).toFixed(2)) : 0;

  let verdictTitle = 'Results Match Underlying Performance';
  let verdictDetail =
    'Your points return tracks closely with the chances created and conceded.';

  if (matchesWithXg === 0) {
    verdictTitle = 'Scoreline Form Tracked (No xG Data Yet)';
    verdictDetail =
      'Sync a full .fm save with match stats to unlock Expected Points (xPts) and finishing deltas.';
  } else if (pointsDelta <= -2.5 && finishingDelta < -1.0) {
    verdictTitle = 'Unlucky Finishing — Tactics Are Working';
    verdictDetail = `You are ${Math.abs(pointsDelta).toFixed(1)} pts below xPts and ${Math.abs(finishingDelta).toFixed(2)} goals under xG. Keep the tactical structure and back your strikers or tweak finishing roles.`;
  } else if (pointsDelta >= 2.5 && defensiveDelta > 1.5) {
    verdictTitle = 'Clinical & Goalkeeper-Backed Overperformance';
    verdictDetail = `You are +${pointsDelta.toFixed(1)} pts above xPts. Tighten rest defence before regression hits.`;
  } else if (defensiveDelta <= -2.0) {
    verdictTitle = 'Conceding More Than Expected';
    verdictDetail = `Conceded ${Math.abs(defensiveDelta).toFixed(2)} more goals than xGA — check goalkeeper form and set-piece marking.`;
  } else if (finishingDelta >= 2.0) {
    verdictTitle = 'Hot Finishing Streak';
    verdictDetail = `Scoring +${finishingDelta.toFixed(2)} goals above xG across ${matchesWithXg} xG-tracked matches.`;
  }

  return {
    matchesAnalysed: matches.length,
    matchesWithXg,
    actualPoints,
    expectedPoints: Number(expectedPoints.toFixed(1)),
    pointsDelta,
    goalsFor,
    goalsAgainst,
    xGFor: Number(xGFor.toFixed(2)),
    xGAgainst: Number(xGAgainst.toFixed(2)),
    finishingDelta,
    defensiveDelta,
    verdictTitle,
    verdictDetail,
  };
}

/**
 * Builds a per-season Season Chronicle (W-D-L, goals, clean sheets, longest unbeaten run, biggest win).
 */
export function buildSeasonChronicle(
  matches: MatchLogEntry[]
): SeasonChronicleEntry[] {
  if (!matches || matches.length === 0) return [];

  const bySeason = new Map<string, MatchLogEntry[]>();
  for (const m of matches) {
    const label = extractSeasonLabel(m.date);
    const list = bySeason.get(label) || [];
    list.push(m);
    bySeason.set(label, list);
  }

  const entries: SeasonChronicleEntry[] = [];
  for (const [seasonLabel, list] of bySeason.entries()) {
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    let cleanSheets = 0;
    let currentUnbeaten = 0;
    let longestUnbeatenRun = 0;
    let bestMargin = 0;
    let biggestWin: string | null = null;
    let cupMatches = 0;

    for (const m of list) {
      const [gf, ga] = parseScore(m.score);
      goalsFor += gf;
      goalsAgainst += ga;
      if (ga === 0) cleanSheets += 1;
      if (/cup|beker|trophy|shield|playoff/i.test(m.competition || '')) {
        cupMatches += 1;
      }

      if (m.result === 'W') {
        wins += 1;
        currentUnbeaten += 1;
        const margin = gf - ga;
        if (margin > bestMargin) {
          bestMargin = margin;
          biggestWin = `${m.score} vs ${m.opponent}`;
        }
      } else if (m.result === 'D') {
        draws += 1;
        currentUnbeaten += 1;
      } else {
        losses += 1;
        currentUnbeaten = 0;
      }

      if (currentUnbeaten > longestUnbeatenRun) {
        longestUnbeatenRun = currentUnbeaten;
      }
    }

    entries.push({
      seasonLabel,
      played: list.length,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      cleanSheets,
      longestUnbeatenRun,
      biggestWin,
      cupMatches,
    });
  }

  return entries.sort((a, b) => b.seasonLabel.localeCompare(a.seasonLabel));
}
