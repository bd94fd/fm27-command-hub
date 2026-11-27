import type { MatchLogEntry, PlayerRecord } from '../types/fm27';
import type { DecodedFmSavePayload } from './fmSaveHydrator';
import { classifyMatchCompetitionBucket, deriveFootballSeasonLabel } from './matchScopeHelpers';

export interface ExecutiveLabelsInput {
  decoded: DecodedFmSavePayload;
  finalSquad: PlayerRecord[];
  updatedMatches: MatchLogEntry[];
}

export interface ExecutiveLabels {
  saveDateLabel: string;
  nextFixtureLabel: string | null;
  leagueRecordLabel: string | null;
  leagueStandingLabel: string | null;
  squadOutputLabel: string | null;
  squadOutputSubLabel: string | null;
  tacticHeadlineLabel: string | null;
  tacticSubLabel: string | null;
}

/**
 * Builds the labels on the executive strip: the save date, the next fixture,
 * the league record and standing, the squad's output and the tactic headline.
 *
 * A label the save cannot support says so (for example "No league table yet")
 * rather than showing a zero that would read as fact.
 */
export function buildExecutiveLabels({
  decoded,
  finalSquad,
  updatedMatches,
}: ExecutiveLabelsInput): ExecutiveLabels {
  const saveDateLabel =
    decoded.meta.gameDateDmy || decoded.meta.gameDateIso || 'Live .fm Save';

  let nextFixtureLabel: string | null = null;
  if (decoded.upcomingFixtures.length > 0) {
    const nf = decoded.upcomingFixtures[0];
    const oppStanding = decoded.leagueStanding?.nextOpponentStanding;
    const standingSuffix = oppStanding
      ? ` — #${oppStanding.position} (${oppStanding.points} Pts)`
      : '';
    nextFixtureLabel = `${nf.dateDmy || nf.dateIso} vs ${nf.opponent} (${nf.venue === 'H' ? 'Home' : 'Away'}${standingSuffix})`;
  }

  let leagueRecordLabel: string | null = null;
  let leagueStandingLabel: string | null = null;
  if (decoded.leagueStanding) {
    const ls = decoded.leagueStanding;
    const gdStr = ls.goalDiff >= 0 ? `+${ls.goalDiff}` : `${ls.goalDiff}`;
    leagueRecordLabel = `${ls.played} GP · ${ls.won}W-${ls.drawn}D-${ls.lost}L · ${ls.points} Pts`;
    leagueStandingLabel = `#${ls.position} of ${ls.totalTeams} (${ls.goalsFor} GF / ${ls.goalsAgainst} GA · ${gdStr} GD)`;
  } else {
    leagueRecordLabel = '0 GP · Pre-Season';
    leagueStandingLabel = 'No league table yet — 0 competitive matches played';
  }

  let squadOutputLabel: string | null = null;
  let squadOutputSubLabel: string | null = null;
  if (finalSquad.length > 0) {
    const totalGoals = finalSquad.reduce((s, p) => s + (p.goals || 0), 0);
    const totalXg = finalSquad.reduce((s, p) => s + (p.xG || 0), 0);
    const totalAssists = finalSquad.reduce((s, p) => s + (p.assists || 0), 0);
    const totalXa = finalSquad.reduce((s, p) => s + (p.xA || 0), 0);
    const hasPlayerProduction =
      totalGoals > 0 ||
      totalAssists > 0 ||
      totalXg > 0 ||
      totalXa > 0 ||
      finalSquad.some((p) => (p.minutes || 0) > 0);
    const ls = decoded.leagueStanding;
    const looksMultiSeason =
      ls && ls.played > 0 && totalGoals > ls.goalsFor + 6;

    if ((looksMultiSeason || !hasPlayerProduction) && ls && ls.played > 0) {
      const gdStr = ls.goalDiff >= 0 ? `+${ls.goalDiff}` : `${ls.goalDiff}`;
      const gfPerGame = (ls.goalsFor / ls.played).toFixed(2);
      const gaPerGame = (ls.goalsAgainst / ls.played).toFixed(2);
      squadOutputLabel = `${ls.goalsFor} GF / ${ls.goalsAgainst} GA (${gdStr} GD)`;
      const currentSeasonLabel = deriveFootballSeasonLabel(saveDateLabel);
      const leagueXgMatches = updatedMatches.filter((m) => {
        if (typeof m.xGFor !== 'number' || typeof m.xGAgainst !== 'number') {
          return false;
        }
        if (classifyMatchCompetitionBucket(m.competition) !== 'league') {
          return false;
        }
        if (currentSeasonLabel !== 'Unknown Season') {
          const matchSeason = deriveFootballSeasonLabel(m.date);
          if (matchSeason !== 'Unknown Season' && matchSeason !== currentSeasonLabel) {
            return false;
          }
        }
        return true;
      });
      if (!hasPlayerProduction && leagueXgMatches.length > 0) {
        const sumXgFor = leagueXgMatches.reduce((s, m) => s + (m.xGFor ?? 0), 0);
        const sumXgAg = leagueXgMatches.reduce((s, m) => s + (m.xGAgainst ?? 0), 0);
        squadOutputSubLabel = `League (${ls.played} GP) · xG ${sumXgFor.toFixed(2)} For vs ${sumXgAg.toFixed(2)} Against`;
      } else {
        squadOutputSubLabel = `Current Season League (${ls.played} GP · ${gfPerGame} GF/g · ${gaPerGame} GA/g)`;
      }
    } else if (hasPlayerProduction) {
      const hasPerPlayerXg = totalXg > 0 || totalXa > 0;
      squadOutputLabel = hasPerPlayerXg
        ? `${totalGoals} Gls (${totalXg.toFixed(2)} xG) · ${totalAssists} Ast (${totalXa.toFixed(2)} xA)`
        : `${totalGoals} Gls · ${totalAssists} Ast`;
      const topScorer = [...finalSquad].sort((a, b) => (b.goals || 0) - (a.goals || 0))[0];
      const topRated = [...finalSquad]
        .filter((p) => typeof p.rating === 'number' && (p.minutes || 0) >= 90)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
      const subParts: string[] = [];
      if (topScorer && topScorer.goals > 0) {
        subParts.push(`Top Scorer: ${topScorer.name} (${topScorer.goals}G)`);
      }
      if (topRated && topRated.rating) {
        subParts.push(`Best Rat: ${topRated.name} (${topRated.rating.toFixed(2)})`);
      }
      squadOutputSubLabel =
        subParts.length > 0
          ? subParts.join(' · ')
          : `Current season across ${finalSquad.length} squad players`;
    } else {
      squadOutputLabel = '0 GP · Season Not Started';
      squadOutputSubLabel = decoded.meta.fastSync
        ? `Re-sync with Full Sync if matches have been played (${finalSquad.length} players)`
        : `0 competitive matches played yet (${finalSquad.length} players)`;
    }
  }

  const injuryLabel = `${decoded.activeInjuries.length} Active Injur${decoded.activeInjuries.length === 1 ? 'y' : 'ies'}`;
  const tacticSubLabel = `${injuryLabel} · ${decoded.mentoring.length} Mentoring Groups`;
  const tacticHeadlineLabel =
    decoded.tactics.length > 0
      ? `${decoded.tactics[0].name} (${decoded.tactics[0].mentality})`
      : 'Dual-Phase 4-3-3 (War Room)';

  return {
    saveDateLabel,
    nextFixtureLabel,
    leagueRecordLabel,
    leagueStandingLabel,
    squadOutputLabel,
    squadOutputSubLabel,
    tacticHeadlineLabel,
    tacticSubLabel,
  };
}
