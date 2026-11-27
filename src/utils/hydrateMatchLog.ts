import type { MatchLogEntry } from '../types/fm27';
import type { TeamMatchStat } from '../types/fmSave';
import type { DecodedFmSaveMatch, DecodedFmSavePayload } from './fmSaveHydrator';

const isGenericCompetitionLabel = (label?: string | null): boolean =>
  !label ||
  /^(league\s*\/\s*cup|cup\s*\/\s*friendly|unclassified(?:\s+match)?|domestic\s+league|unknown)$/i.test(
    label.trim()
  );

export interface MatchLogBuildInput {
  decoded: DecodedFmSavePayload;
  currentMatches: MatchLogEntry[];
}

export interface MatchLogBuildResult {
  matches: MatchLogEntry[];
  newlyAddedCount: number;
}

/**
 * Builds the match log from the save's played matches.
 *
 * A match already in the log keeps the detail only a human could have entered
 * (report text, player of the match, watchpoints) and takes the score, date,
 * competition and any missing numbers from the save. A match the log has never
 * seen is added as a new entry with the numbers the save can prove.
 */
export function buildMatchLog({ decoded, currentMatches }: MatchLogBuildInput): MatchLogBuildResult {
    // 2. Build honest Match Log from .fm save enriched with Group 2 teamMatchStats
    const teamStatsList = decoded.teamMatchStats || [];
    const findTeamMatchStat = (pm: DecodedFmSaveMatch): TeamMatchStat | undefined => {
      const oppLower = (pm.opponent || '').toLowerCase();
      return teamStatsList.find((ts) => {
        if (pm.matchId && ts.matchId && ts.matchId === pm.matchId) return true;
        if (pm.dateIso && ts.date && ts.date === pm.dateIso) return true;
        return (
          ts.opponent.toLowerCase() === oppLower &&
          ts.isHome === (pm.venue === 'H')
        );
      });
    };

    const findExistingMatchDetails = (pm: DecodedFmSaveMatch): MatchLogEntry | undefined => {
      const dateKey = (pm.dateDmy || pm.dateIso || '').trim();
      const safeOpp = (pm.opponent || '').toLowerCase();
      const safeScore = (pm.score || '').replace(/\s+/g, '');
      return currentMatches.find((m) => {
        const mOpp = (m.opponent || '').toLowerCase();
        const oppMatch =
          mOpp === safeOpp ||
          (safeOpp.length >= 5 && mOpp.includes(safeOpp.slice(0, 6))) ||
          (mOpp.length >= 5 && safeOpp.includes(mOpp.slice(0, 6)));
        if (!oppMatch) return false;
        if (dateKey && m.date.trim() === dateKey) return true;
        return (m.score || '').replace(/\s+/g, '') === safeScore && m.venue === pm.venue;
      });
    };

    let maxEventNum = currentMatches.reduce(
      (max, m) => Math.max(max, m.eventNumber || 0),
      0
    );

    const chronologicalPlayed = [...decoded.playedMatches].reverse();
    let newlyAddedCount = 0;
    const fmHydratedMatches: MatchLogEntry[] = [];

    for (const pm of chronologicalPlayed) {
      const dateKey = (pm.dateDmy || pm.dateIso || '').trim();
      const safeOpp = pm.opponent || 'Opponent';
      const safeScore = pm.score || '0 - 0';
      const oppKey = safeOpp.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!dateKey) continue;

      const tms = findTeamMatchStat(pm);
      const enrichedXgFor = pm.xGFor ?? tms?.xgFor ?? null;
      const enrichedXgAgainst = pm.xGAgainst ?? tms?.xgAgainst ?? null;
      const enrichedPoss = pm.possession ?? tms?.possession ?? null;
      const enrichedPass = pm.passCompletion ?? tms?.passCompletion ?? null;
      const enrichedShots =
        pm.shotsFor ||
        (tms && tms.shots !== null
          ? tms.shotsOnTarget !== null
            ? `${tms.shots} (${tms.shotsOnTarget})`
            : String(tms.shots)
          : '—');

      const decodedComp = (pm.competition || '').trim();
      const resolvedCompetition =
        decodedComp && !isGenericCompetitionLabel(decodedComp)
          ? decodedComp
          : decodedComp || 'Friendly';

      const existing = findExistingMatchDetails(pm);
      if (existing) {
        const nextComp =
          !isGenericCompetitionLabel(decodedComp)
            ? decodedComp
            : isGenericCompetitionLabel(existing.competition)
              ? resolvedCompetition
              : existing.competition;
        fmHydratedMatches.push({
          ...existing,
          date: dateKey,
          competition: nextComp,
          score: safeScore,
          result: pm.result,
          xGFor: existing.xGFor ?? enrichedXgFor,
          xGAgainst: existing.xGAgainst ?? enrichedXgAgainst,
          possession: existing.possession ?? enrichedPoss,
          passCompletion: existing.passCompletion ?? enrichedPass,
          shotsFor: existing.shotsFor !== '—' ? existing.shotsFor : enrichedShots,
          source: 'FM_SAVE',
        });
        continue;
      }

      newlyAddedCount++;
      maxEventNum++;
      fmHydratedMatches.push({
        id: `fm-match-${dateKey}-${oppKey}`,
        eventNumber: maxEventNum,
        date: dateKey,
        competition: resolvedCompetition,
        opponent: safeOpp,
        venue: pm.venue,
        result: pm.result,
        score: safeScore,
        xGFor: enrichedXgFor,
        xGAgainst: enrichedXgAgainst,
        possession: enrichedPoss,
        passCompletion: enrichedPass,
        shotsFor: enrichedShots,
        shotsAgainst: pm.shotsAgainst || '—',
        cccFor: pm.cccFor ?? null,
        cccAgainst: pm.cccAgainst ?? null,
        goalTimeline: 'Result & scoreline decoded directly from .fm save',
        potm: 'Attach Data Hub screenshot for match report',
        defensiveWatchpoints: pm.distanceKm
          ? `Team distance: ${pm.distanceKm} km`
          : '—',
        tacticalAudit: `Verified directly from ${decoded.meta.fileName || decoded.meta.saveName || '.fm save'} (${pm.result} ${safeScore}${enrichedXgFor !== null ? `, xG ${enrichedXgFor.toFixed(2)}-${(enrichedXgAgainst ?? 0).toFixed(2)}` : ''}).`,
        source: 'FM_SAVE',
      });
    }

    const fmNewestFirst = [...fmHydratedMatches].reverse();
    if (decoded.playedMatches.length >= 4) {
      return { matches: fmNewestFirst, newlyAddedCount };
    }
    // A short save can hold only the most recent matches, so older log rows stay.
    // A match the save does hold takes the save's numbers, as it does for a full log.
    const fmIds = new Set(fmNewestFirst.map((fm) => fm.id));
    return {
      matches: [...fmNewestFirst, ...currentMatches.filter((cm) => !fmIds.has(cm.id))],
      newlyAddedCount,
    };
}
