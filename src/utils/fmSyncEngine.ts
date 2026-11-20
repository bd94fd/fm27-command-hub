import {
  MatchLogEntry,
  ChronicleEvent,
  DoubleGwTrackerRow,
  SyncBlockOutput,
  PlayerRecord,
} from '../types/fm27';

/**
 * Calculates combined double-gameweek minutes and verifies whether the player
 * passes the 125-minute (or 150-minute striker exception) FM27 physical load cap.
 */
export function evaluateDoubleGwLoad(row: DoubleGwTrackerRow): {
  combinedMinutes: number;
  capLimit: number;
  passed: boolean;
  riskTier: 'Optimal' | 'Protected' | 'Overload Risk';
} {
  const combinedMinutes = row.wed15SepKnokke + row.sat18SepJongCercle;
  const isHighStaminaStriker = row.stamina >= 13;
  const capLimit = isHighStaminaStriker ? 150 : 125;
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

/**
 * Computes aggregate season metrics from competitive match logs.
 */
export function computeCompetitiveSummary(matches: MatchLogEntry[]) {
  const leagueMatches = matches.filter((m) => {
    const comp = (m.competition || '').toLowerCase();
    return comp.includes('national') || comp.includes('domestic league') || comp === 'league';
  });
  const wins = leagueMatches.filter((m) => m.result === 'W').length;
  const draws = leagueMatches.filter((m) => m.result === 'D').length;
  const losses = leagueMatches.filter((m) => m.result === 'L').length;
  const points = wins * 3 + draws;

  const xgMatches = leagueMatches.filter(
    (m) => typeof m.xGFor === 'number' && typeof m.xGAgainst === 'number'
  );
  const totalXgFor = Number(
    xgMatches.reduce((sum, m) => sum + (m.xGFor ?? 0), 0).toFixed(2)
  );
  const totalXgAgainst = Number(
    xgMatches.reduce((sum, m) => sum + (m.xGAgainst ?? 0), 0).toFixed(2)
  );
  const possMatches = leagueMatches.filter((m) => typeof m.possession === 'number');
  const avgPossession =
    possMatches.length > 0
      ? Math.round(
          possMatches.reduce((sum, m) => sum + (m.possession ?? 0), 0) /
            possMatches.length
        )
      : 0;

  return {
    played: leagueMatches.length,
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

/**
 * Generates deterministic, guardrail-enforced copy-paste prompts for
 * Gemini in Google Docs and Gemini in Google Sheets, plus raw TSV rows.
 */
export function buildDocAndSheetSyncPrompts(
  match: MatchLogEntry,
  chronicle: ChronicleEvent,
  topBannerDate: string
): SyncBlockOutput {
  const venueLabel = match.venue === 'H' ? 'Home' : 'Away';
  const xgStr =
    typeof match.xGFor === 'number' && typeof match.xGAgainst === 'number'
      ? `${match.xGFor.toFixed(2)} - ${match.xGAgainst.toFixed(2)}`
      : 'N/A';
  const possStr =
    typeof match.possession === 'number' ? `${match.possession}%` : 'N/A';
  const passStr =
    typeof match.passCompletion === 'number'
      ? `${match.passCompletion}%`
      : 'N/A';
  const cccStr =
    typeof match.cccFor === 'number' && typeof match.cccAgainst === 'number'
      ? `${match.cccFor} - ${match.cccAgainst}`
      : 'N/A';

  const rawTsvRow1G = [
    `${match.competition}: KVV Zelzate vs ${match.opponent} (${match.venue}) (${match.date})`,
    `${match.result} ${match.score}`,
    match.goalTimeline.replace(/\n/g, ', '),
    `xG: ${xgStr} | Possession: ${possStr} | Shots (SoT): ${match.shotsFor} - ${match.shotsAgainst} | CCC: ${cccStr} | Passes: ${passStr}`,
    `POTM: ${match.potm}`,
    match.defensiveWatchpoints.replace(/\n/g, ' '),
    match.tacticalAudit.replace(/\n/g, ' '),
  ].join('\t');

  const rawTsvRow10 = [
    `Event #${chronicle.eventNumber}`,
    chronicle.date,
    chronicle.phase,
    chronicle.category,
    chronicle.title,
    chronicle.headlineMetric,
    chronicle.notes.replace(/\n/g, ' '),
  ].join('\t');

  const docPrompt = `INSTRUCTION TO GEMINI IN GOOGLE DOCS:
Please APPEND the following chronological event to this document.
CRITICAL GUARDRAILS:
1. DO NOT delete, overwrite, summarize, or alter any existing text in Sections 1 through 8.
2. Locate the exact section header "SECTION 5: SEPTEMBER 2027 (BOARD/SQUAD DYNAMICS, TACTICAL AUDITS & LEAGUE CAMPAIGN)" and insert this entry directly ABOVE the anchor tag "[INSERT NEXT CHRONOLOGICAL EVENT HERE]" (after Event #${chronicle.eventNumber - 1}).
3. Use flat bullet points (● and -) so Google Docs never creates double-numbered "1. 1." lists.

=== CHRONOLOGICAL EVENT TO INSERT AT [INSERT NEXT CHRONOLOGICAL EVENT HERE] ===
● Event #${chronicle.eventNumber} (${match.date}) — ${match.competition} (${venueLabel} vs ${match.opponent}): ${match.result} ${match.score} (xG ${xgStr}, ${possStr} possession, ${passStr} pass completion, CCC ${cccStr}).
  - Goal Timeline & Standouts: ${match.goalTimeline} | POTM: ${match.potm}.
  - Defensive Watchpoints & Ratings: ${match.defensiveWatchpoints}
  - Tactical Audit & Next Directives: ${match.tacticalAudit}`;

  const sheetPrompt = `INSTRUCTION TO GEMINI IN GOOGLE SHEETS:
Please ADD/UPDATE the following data in the specified tables of this spreadsheet.
CRITICAL GUARDRAILS:
1. DO NOT delete, clear, or overwrite any existing rows or headers in any table.
2. Append the new Match Log row to the bottom of TABLE 1G (Match Log).
3. Update the Top Executive Summary Banner (Row 2) to reflect Save Date ${topBannerDate}.

=== 1. APPEND ROW TO TABLE 1G (MATCH LOG) ===
- Fixture & Date: ${match.competition}: KVV Zelzate vs ${match.opponent} (${match.venue}) (${match.date})
- Result & Score: ${match.result} ${match.score}
- Goal Timeline & Assists: ${match.goalTimeline}
- Match Statistics (xG & Possession): xG: ${xgStr} | Possession: ${possStr} | Shots (SoT): ${match.shotsFor} - ${match.shotsAgainst} | CCC: ${cccStr} | Passes: ${passStr}
- Defensive Watchpoints & Rating: POTM ${match.potm} | ${match.defensiveWatchpoints}
- Tactical Audit, Lessons Learned & Management Action: ${match.tacticalAudit}

=== 2. APPEND ROW TO TAB 10 (CHRONICLES) ===
- Event #: Event #${chronicle.eventNumber}
- In-Game Date: ${chronicle.date}
- Phase / Window: ${chronicle.phase}
- Category: ${chronicle.category}
- Milestone / Match Title: ${chronicle.title}
- Outcome / Headline Metric: ${chronicle.headlineMetric}
- Key Tactical, Squad & Financial Notes: ${chronicle.notes}`;

  return {
    docPrompt,
    sheetPrompt,
    rawTsvRow1G,
    rawTsvRow10,
  };
}

/**
 * Calculates the FM27 physical match engine speed & aerial index for a player
 * based on the community-verified Patch 27.1.0 formulas from the FM27 guide.
 */
export function computeFm27EngineMetrics(player: PlayerRecord): {
  topSpeedMps: number;
  jumpHeightMeters: number;
  sprintDrainRate: number;
  physicalEngineScore: number;
} {
  const pace = Number(player.attributes?.pace) || 10;
  const acceleration = Number(player.attributes?.acceleration) || 10;
  const jumpingReach = Number(player.attributes?.jumpingReach) || 10;
  const stamina = Number(player.attributes?.stamina) || 10;
  // Top speed: 8.05 + 0.11 * Pace m/s
  const topSpeedMps = Number((8.05 + 0.11 * pace).toFixed(2));
  // Jumping reach height above standing reach: (Jumping Reach + 5) / 30 m
  const jumpHeightMeters = Number(((jumpingReach + 5) / 30).toFixed(2));
  // Sprint drain rate: 2.5 - 0.075 * Stamina (lower is better)
  const sprintDrainRate = Number((2.5 - 0.075 * stamina).toFixed(2));

  // Weighted physical score (0-100) emphasizing Pace, Acceleration, Jumping Reach, Stamina
  const raw =
    pace * 1.4 + acceleration * 1.5 + jumpingReach * 1.1 + stamina * 1.0;
  const physicalEngineScore = Math.min(100, Math.round((raw / 100) * 100));

  return {
    topSpeedMps,
    jumpHeightMeters,
    sprintDrainRate,
    physicalEngineScore,
  };
}
