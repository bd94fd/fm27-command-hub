import { MatchLogEntry } from '../types/fm27';
import {
  classifyMatchCompetitionBucket,
  deriveFootballSeasonLabel,
} from './matchScopeHelpers';

/**
 * Computes aggregate season metrics from competitive match logs.
 * When `seasonOrSaveDate` is provided (either a season label like "2027/28" or
 * a save date like "15/09/2027"), restricts matches to that season if matching
 * dated fixtures exist so prior seasons never bleed into current-season totals.
 */
export function computeCompetitiveSummary(
  matches: MatchLogEntry[],
  seasonOrSaveDate?: string | null
) {
  let scopedMatches = matches;
  if (seasonOrSaveDate && seasonOrSaveDate !== '--' && seasonOrSaveDate !== 'ALL') {
    const targetSeason = /^\d{4}\/\d{2}$/.test(seasonOrSaveDate.trim())
      ? seasonOrSaveDate.trim()
      : deriveFootballSeasonLabel(seasonOrSaveDate);
    if (targetSeason && targetSeason !== 'Unknown Season') {
      const seasonFiltered = matches.filter(
        (m) => deriveFootballSeasonLabel(m.date) === targetSeason
      );
      if (seasonFiltered.length > 0) {
        scopedMatches = seasonFiltered;
      }
    }
  }

  const competitiveMatches = scopedMatches.filter((m) => {
    const comp = (m.competition || '').toLowerCase();
    if (
      comp.includes('non-comp') ||
      comp.includes('non_comp') ||
      comp.includes('reserve') ||
      comp.includes('u21') ||
      comp.includes('u19') ||
      comp.includes('u18') ||
      comp.includes('youth') ||
      comp.includes('international')
    ) {
      return false;
    }
    return classifyMatchCompetitionBucket(m.competition) !== 'friendly';
  });
  const leagueMatches = competitiveMatches.filter(
    (m) => classifyMatchCompetitionBucket(m.competition) === 'league'
  );
  const targetMatches =
    leagueMatches.length > 0 ? leagueMatches : competitiveMatches;
  const wins = targetMatches.filter((m) => m.result === 'W').length;
  const draws = targetMatches.filter((m) => m.result === 'D').length;
  const losses = targetMatches.filter((m) => m.result === 'L').length;
  const points = wins * 3 + draws;

  const xgMatches = targetMatches.filter(
    (m) => typeof m.xGFor === 'number' && typeof m.xGAgainst === 'number'
  );
  const totalXgFor = Number(
    xgMatches.reduce((sum, m) => sum + (m.xGFor ?? 0), 0).toFixed(2)
  );
  const totalXgAgainst = Number(
    xgMatches.reduce((sum, m) => sum + (m.xGAgainst ?? 0), 0).toFixed(2)
  );
  const possMatches = targetMatches.filter(
    (m) => typeof m.possession === 'number'
  );
  const avgPossession =
    possMatches.length > 0
      ? Math.round(
          possMatches.reduce((sum, m) => sum + (m.possession ?? 0), 0) /
            possMatches.length
        )
      : 0;

  return {
    played: targetMatches.length,
    wins,
    draws,
    losses,
    points,
    totalXgFor,
    totalXgAgainst,
    xgMatchesCount: xgMatches.length,
    xgDiff: Number((totalXgFor - totalXgAgainst).toFixed(2)),
    avgPossession,
  };
}
