/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isSuspensionActiveForCompetition } from './bestXiSolver';
import { buildSaveDataQualityReport, formatSaveDataQualityForAnalyst } from './saveDataQuality';
import { normalizeJobVacancy } from './jobVacancies';
import {
  buildSponsorshipPanelRows,
  filterUsableSponsorshipDeals,
  formatClubMoney,
} from './clubFinances';
import { formatAge, formatNation } from './squadViewHelpers';
import type {
  ActiveSuspensionRecord,
  CompetitionRegistrationRules,
  FinancialRunway,
  RecruitmentTarget,
} from '../types/fmSave';
import type { PlayerRecord } from '../types/fm27';
import type { DecodedFmSavePayload } from './fmSaveHydrator';

export interface AnalystSaveContextInput {
  decoded: DecodedFmSavePayload;
  saveDateLabel: string;
  nextFixtureLabel: string | null;
  leagueStandingLabel: string | null;
  wageComplianceLabel: string | null;
  balanceLabel: string | null;
  financialRunway: FinancialRunway | null;
  changedPlayers: Array<{ name: string; changes: string[] }>;
  removedPlayers: PlayerRecord[];
  newlyAddedCount: number;
  recruitmentTargets: RecruitmentTarget[];
  suspensions: ActiveSuspensionRecord[];
}

/**
 * Competition rules arrive as a loose record from the reader; normalise them once
 * so the prompt and the hydrated payload show the same numbers.
 */
export function resolveCompetitionRules(
  decoded: Pick<DecodedFmSavePayload, 'competitionRules' | 'leagueStanding'>
): CompetitionRegistrationRules | null {
  const rawRules = decoded.competitionRules as
    | Partial<CompetitionRegistrationRules>
    | undefined;
  if (
    !rawRules ||
    (!rawRules.competitionName &&
      rawRules.maxSquadSize === undefined &&
      rawRules.matchdaySubsLimit === undefined)
  ) {
    return null;
  }
  const num = (value: unknown): number | null =>
    typeof value === 'number' ? value : null;
  return {
    competitionName:
      typeof rawRules.competitionName === 'string'
        ? rawRules.competitionName
        : decoded.leagueStanding?.competitionName || null,
    maxSquadSize: num(rawRules.maxSquadSize),
    minHomegrownClub: num(rawRules.minHomegrownClub),
    minHomegrownNation: num(rawRules.minHomegrownNation),
    maxForeignPlayers: num(rawRules.maxForeignPlayers),
    u21Exempt:
      typeof rawRules.u21Exempt === 'boolean' ? rawRules.u21Exempt : null,
    matchdaySubsLimit: num(rawRules.matchdaySubsLimit),
    fixturesPerClub: num(rawRules.fixturesPerClub),
    promotionPlaces: num(rawRules.promotionPlaces),
    playoffPlaces: num(rawRules.playoffPlaces),
    relegationPlaces: num(rawRules.relegationPlaces),
    prizeMoney: num(rawRules.prizeMoney),
    rounds: num(rawRules.rounds),
  };
}

/**
 * Reader warnings plus the sponsorship date-reversal note, deduplicated so the
 * same line never appears twice in the prompt.
 */
export function collectExtractionWarnings(
  decoded: Pick<DecodedFmSavePayload, 'extractionWarnings' | 'warnings' | 'sponsorships'>
): string[] {
  const reordered = (Array.isArray(decoded.sponsorships) ? decoded.sponsorships : [])
    .filter((deal) => (deal as { dates_reordered?: boolean } | null)?.dates_reordered === true);
  const sponsorshipWarnings =
    reordered.length > 0
      ? [
          `sponsorships: fmsave reversed the stored dates of ${reordered.length} ended FM27 contract(s) using the financial term — start and end are swapped for those rows, so read the dates with that in mind`,
        ]
      : [];
  return Array.from(
    new Set([
      ...(Array.isArray(decoded.extractionWarnings) ? decoded.extractionWarnings : []),
      ...(Array.isArray(decoded.warnings) ? decoded.warnings : []),
      ...sponsorshipWarnings,
    ])
  );
}

/**
 * The block the Tactical Analyst reads about a freshly imported save. It carries
 * match results, availability and club context, never raw CA/PA.
 */
export function buildAnalystSaveContext({
  decoded,
  saveDateLabel,
  nextFixtureLabel,
  leagueStandingLabel,
  wageComplianceLabel,
  balanceLabel,
  financialRunway,
  changedPlayers,
  removedPlayers,
  newlyAddedCount,
  recruitmentTargets,
  suspensions: activeSuspensionsList,
}: AnalystSaveContextInput): string {
  const nextFixtureCompetition = decoded.upcomingFixtures[0]?.competition || null;

  const playedLines = decoded.playedMatches
    .map(
      (m) =>
        `- ${m.dateDmy || m.dateIso} [${m.competition}] vs ${m.opponent} (${m.venue}): ${m.result} ${m.score}` +
        (typeof m.xGFor === 'number'
          ? ` | xG ${m.xGFor.toFixed(2)} - ${(m.xGAgainst ?? 0).toFixed(2)} | Poss ${m.possession ?? '?'}% | Shots ${m.shotsFor ?? '?'} vs ${m.shotsAgainst ?? '?'} | CCC ${m.cccFor ?? '?'}-${m.cccAgainst ?? '?'}`
          : '')
    )
    .join('\n');

  const upcomingLines = decoded.upcomingFixtures
    .map(
      (f) =>
        `- ${f.dateDmy || f.dateIso}: [${f.competition}] vs ${f.opponent} (${f.venue === 'H' ? 'Home' : 'Away'})`
    )
    .join('\n');

  const injuryLines =
    decoded.activeInjuries.length > 0
      ? decoded.activeInjuries
          .map(
            (i) =>
              `- ${i.playerName || 'Player'}: ${i.typeName} (${i.severity || i.kind}, ${
                i.expectedReturn ? `expected return ${i.expectedReturn}` : i.date || 'active'
              })`
          )
          .join('\n')
      : '- No active injuries reported in save.';

  const suspensionLines =
    activeSuspensionsList.length > 0
      ? activeSuspensionsList
          .map((b) => {
            const blocksNext = isSuspensionActiveForCompetition(
              b,
              nextFixtureCompetition
            );
            return blocksNext
              ? `- ${b.playerName}: BANNED FOR NEXT MATCH (${b.matchesRemaining}m remaining · ${b.competitionName} [${b.scope}] · ${b.reason}) — DO NOT SELECT AS STARTER`
              : `- ${b.playerName}: OTHER-COMPETITION BAN ONLY (${b.matchesRemaining}m in ${b.competitionName} [${b.scope}] · ${b.reason}) — AVAILABLE FOR NEXT MATCH (${nextFixtureCompetition})`;
          })
          .join('\n')
      : '- No active disciplinary suspensions.';

  const mentoringLines =
    decoded.mentoring.length > 0
      ? decoded.mentoring
          .map((m) => `- ${m.label}: ${m.members.join(', ')}`)
          .join('\n')
      : '- No mentoring groups returned by reader.';

  const diffLines =
    changedPlayers.length > 0
      ? changedPlayers
          .slice(0, 20)
          .map((c) => `- ${c.name}: ${c.changes.join(', ')}`)
          .join('\n')
      : '- Baseline synced directly from .fm save.';

  const runwayLine = financialRunway
    ? `Financial Runway: ${financialRunway.status} (${financialRunway.runwayMonths} months remaining · Monthly Burn: £${Math.round(financialRunway.monthlyBurnRate).toLocaleString()}/mo)`
    : '';

  const facilitiesLine = decoded.facilities
    ? `Club Facilities: Training=${String(decoded.facilities.training ?? 'Unknown')}, Youth=${String(decoded.facilities.youth ?? 'Unknown')}, Corporate=${String(decoded.facilities.corporate ?? 'Unknown')}`
    : '';

  const vacanciesLine =
    decoded.jobVacancies && decoded.jobVacancies.length > 0
      ? `Job Centre Vacancies (${decoded.jobVacancies.length}; feed may include filled roles): ${decoded.jobVacancies
          .slice(0, 8)
          .map((v, index) => normalizeJobVacancy(v, index))
          .map((v) => `${v.role || 'Staff'} at ${v.club || 'Club'}`)
          .join(', ')}`
      : '';

  const sponsorshipRows = buildSponsorshipPanelRows(
    filterUsableSponsorshipDeals(decoded.sponsorships) ?? []
  );
  const sponsorshipLine =
    sponsorshipRows.length > 0
      ? `Sponsorship Deals (${sponsorshipRows.length}): ${sponsorshipRows
          .slice(0, 8)
          .map(
            (row) =>
              `${row.name} ${row.annualValueLabel === '--' ? '--' : `${row.annualValueLabel}/yr`}`
          )
          .join(', ')}`
      : '';

  const typedRules = resolveCompetitionRules(decoded);
  const rulesSummaryParts: string[] = [];
  if (typedRules?.maxSquadSize) rulesSummaryParts.push(`Max Squad ${typedRules.maxSquadSize}`);
  if (typedRules?.minHomegrownClub) rulesSummaryParts.push(`Min HGC ${typedRules.minHomegrownClub}`);
  if (typedRules?.minHomegrownNation) rulesSummaryParts.push(`Min HGN ${typedRules.minHomegrownNation}`);
  if (typedRules?.maxForeignPlayers) rulesSummaryParts.push(`Max Foreign ${typedRules.maxForeignPlayers}`);
  if (typedRules?.u21Exempt !== null && typedRules?.u21Exempt !== undefined) {
    rulesSummaryParts.push(`U21 Exempt: ${typedRules.u21Exempt ? 'Yes' : 'No'}`);
  }
  if (typedRules?.matchdaySubsLimit) rulesSummaryParts.push(`Subs Limit ${typedRules.matchdaySubsLimit}`);
  const rulesLine =
    rulesSummaryParts.length > 0
      ? `Registration & Competition Rules (${typedRules?.competitionName || 'League'}): ${rulesSummaryParts.join(' · ')}`
      : '';

  const fullTableLines =
    decoded.leagueStanding?.rows && decoded.leagueStanding.rows.length > 0
      ? `\n=== FULL DOMESTIC LEAGUE TABLE (${decoded.leagueStanding.competitionName}) ===\n${decoded.leagueStanding.rows
          .map(
            (r) =>
              `#${r.position} ${r.clubName} (${r.played}P ${r.won}W-${r.drawn}D-${r.lost}L, ${r.goalDifference >= 0 ? '+' : ''}${r.goalDifference}GD, ${r.points}Pts${r.form && r.form.length > 0 ? `, Form ${r.form.join('')}` : ''})`
          )
          .join('\n')}\n`
      : '';

  const targetsSummary =
    recruitmentTargets.length > 0
      ? `\n=== MANAGER'S IN-GAME FM27 SHORTLIST (${recruitmentTargets.length} PLAYERS) ===\n${recruitmentTargets
          .slice(0, 12)
          .map((t) => {
            const clubStr = t.isFreeAgent
              ? 'Free Agent'
              : `${t.currentClub || 'Club'} (Exp ${t.expires || `<=${t.contractExpiryMonths}m`})`;
            const valStr =
              typeof t.transferValue === 'number' &&
              t.transferValue > 0 &&
              t.transferValueState !== 'capped'
                ? ` · Val £${t.transferValue.toLocaleString()}`
                : '';
            const persStr = t.personality ? ` · ${t.personality}` : '';
            return `- ${t.name} (${t.primaryPosition}, Age ${formatAge(t.age)}, ${formatNation(t.nationality)}): ${clubStr}${valStr} · Wage ~£${(t.currentWagePw ?? t.demandedWageEur ?? 0).toLocaleString()}/wk${persStr}`;
          })
          .join('\n')}\n`
      : '';

  const mergedWarnings = collectExtractionWarnings(decoded);

  // Contract clauses are not part of the canonical squad profile line, so they travel here — only
  // for players that actually carry one, which keeps this a clause appendix rather than a second
  // squad table.
  const contractClauseLines = decoded.players
    .map((p) => {
      const cd = p.contractDetails;
      if (!cd) return null;
      const parts: string[] = [];
      if (cd.promisedPlayingTime) parts.push(`PT: ${cd.promisedPlayingTime}`);
      if (cd.optionalExtensionYears && cd.optionalExtensionYears > 0) {
        parts.push(`Club Opt +${cd.optionalExtensionYears}y`);
      }
      for (const rc of cd.releaseClauses || []) {
        parts.push(`${rc.type} ${formatClubMoney(rc.amount)}`);
      }
      return parts.length > 0 ? `- ${p.name}: ${parts.join(' · ')}` : null;
    })
    .filter((line): line is string => Boolean(line));

  const contractClauseBlock =
    contractClauseLines.length > 0
      ? `=== CONTRACT CLAUSES IN SAVE (${contractClauseLines.length} PLAYERS) ===\n${contractClauseLines.join('\n')}\n\n`
      : '';

  const usedFastSync = Boolean(decoded.fastSync ?? decoded.meta?.fastSync ?? false);

  const dataQualityBlock = formatSaveDataQualityForAnalyst(
    buildSaveDataQualityReport(decoded)
  );

  return `[LIVE FULL .FM SAVE DECODED VIA FMSAVE ${decoded.meta.fmsaveVersion} — PASS 0 & PASS 1 TIER-1 REAL IN-GAME DATA${usedFastSync ? ' · FAST SYNC MODE' : ''}]
Game: ${decoded.meta.game} (Build ${decoded.meta.build}) | Save: ${decoded.meta.saveName}
EXACT CURRENT IN-GAME DATE: ${saveDateLabel}
Managed Club: ${decoded.meta.clubName} (Manager: ${decoded.meta.managerName})
${leagueStandingLabel ? `Live League Standing (${decoded.leagueStanding?.competitionName}): ${leagueStandingLabel}` : ''}
${decoded.leagueStanding?.nextOpponentStanding ? `Next Opponent Table Standing: ${decoded.leagueStanding.nextOpponentStanding.clubName} (#${decoded.leagueStanding.nextOpponentStanding.position}, ${decoded.leagueStanding.nextOpponentStanding.points} Pts, ${decoded.leagueStanding.nextOpponentStanding.goalDiff >= 0 ? '+' : ''}${decoded.leagueStanding.nextOpponentStanding.goalDiff} GD)` : ''}
${wageComplianceLabel ? `Live Finances: Balance ${balanceLabel} | Wages ${wageComplianceLabel}` : balanceLabel ? `Live Balance: ${balanceLabel}` : ''}
${runwayLine}
${facilitiesLine}
${sponsorshipLine}
${rulesLine}
${vacanciesLine}
${dataQualityBlock}
=== DIFFS AUTO-APPLIED TO SQUAD DATABASE (${changedPlayers.length} PLAYERS UPDATED, ${removedPlayers.length} REMOVED, ${newlyAddedCount} NEW MATCHES LOGGED) ===
${diffLines}

=== RECENT PLAYED MATCHES (NEWEST FIRST) ===
${playedLines || 'None found'}

=== UPCOMING SCHEDULE FROM CURRENT IN-GAME DATE (${saveDateLabel}) ===
${upcomingLines || 'None found'}

=== ACTIVE INJURIES ===
${injuryLines}

=== ACTIVE SUSPENSIONS (DO NOT SELECT BANNED STARTERS) ===
${suspensionLines}

=== LIVE MENTORING GROUPS IN SAVE ===
${mentoringLines}
${fullTableLines}
=== SQUAD DATA — SEE THE CANONICAL SQUAD PROFILES BLOCK ===
Per-player squad detail is NOT repeated here. It is carried once, by the live app context block
"SQUAD PROFILES & SEASON STATS (X OF N FULL POOL)" — the same pool the Squad tab renders, with star
ratings, contract/wage, Best Fit %, season stats, attributes, badges, traits, Last-5 form, suspensions
and injuries. Always quote squad counts from that block (Full Pool + First Team), never from an
earlier import summary.

${contractClauseBlock}${targetsSummary}${mergedWarnings.length > 0 ? `\n=== READER NOTES (NON-FATAL) ===\n${mergedWarnings.map((w) => `- ${w}`).join('\n')}\n` : ''}
ANALYST MISSION FOR THIS .FM SAVE DROP:
1. Acknowledge the exact in-game date (${saveDateLabel}), league position, recent results (never fabricate match-level xG or possession if not present in the save — cite the exact player season xG/xA and fixture scorelines), financial runway, and finances directly from the .fm file.
2. Audit player performance, attribute changes, Last-5 form trends, Scout Report Badges, traits, fatigue/minutes load, contract clauses/extensions, injuries, and active suspensions. NEVER select a BANNED player as a starter, and NEVER cite raw hidden CA/PA or raw hidden attribute numbers.
3. Produce a **COMPLETE ACTION PLAN FROM ${saveDateLabel} FORWARD**:
   - Exact Starting XI + Bench + 62m/75m substitution plan for the very next fixture (${nextFixtureLabel || 'next scheduled match'}), obeying Playbook v2.0 & Club Rules #1–#6 (Tracking Wingers OOP, 3-man midfield late, never pull both CBs, <=125m Double-GW cap).
   - Multi-match rotation & training schedule plan across the upcoming fixtures listed above.
   - Wage/contract/recruitment/mentoring actions to click before hitting Continue.
4. Populate the structured JSON fields (docEventBulletBlock, sheetRowValues, inGameDate="${saveDateLabel}") so ${decoded.meta.managerName || 'the manager'} can push this full save checkpoint straight to their Google Sheet & Google Doc in one click.`;
}
