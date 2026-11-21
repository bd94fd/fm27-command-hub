import {
  MatchLogEntry,
  PlayerRecord,
  RecruitmentCase,
  StaffRecord,
} from '../types/fm27';
import { PLAYBOOK_V2_REFERENCE_RULES } from '../data/matchAndTacticsData';
import { buildFm27KnowledgeGroundingBlock } from '../data/fm27KnowledgeBase';
import {
  buildDynamicSetPieceRoutines,
  buildDynamicTacticalPlan,
  buildDynamicTrainingSchedule,
  computeCompetitiveSummary,
  computeFm27EngineMetrics,
} from './fmSyncEngine';
import { Pass0ExtractionPayload } from '../types/fmSave';
import {
  calculateFinancialRunway,
  HydratedSaveState,
} from './fmSaveHydrator';
import { buildSquadTransferAudit } from './transferAudit';

export function buildTacticalAnalystContext(data: Pass0ExtractionPayload): string {
  const runway = calculateFinancialRunway(data.monthlyFinances);

  const vacanciesList =
    (data.jobVacancies || [])
      .map((v) => `${v.role || 'Staff'} at ${v.club || 'Unknown'}`)
      .join(', ') || 'None';

  const suspensionBlock =
    data.activeSuspensions && data.activeSuspensions.length > 0
      ? `\nACTIVE SUSPENSIONS (DO NOT SELECT BANNED STARTERS):\n${data.activeSuspensions
          .map(
            (b) =>
              `- ${b.playerName}: BANNED (${b.matchesRemaining}m · ${b.competitionName} [${b.scope}] · ${b.reason})`
          )
          .join('\n')}`
      : '';

  const squadOverview = data.squad
    .map((p) => {
      const extStr =
        p.contractDetails?.optionalExtensionYears && p.contractDetails.optionalExtensionYears > 0
          ? `, ClubOpt=+${p.contractDetails.optionalExtensionYears}y`
          : '';
      const banStr =
        p.activeSuspensions && p.activeSuspensions.length > 0
          ? `, BANNED(${p.activeSuspensions[0].matchesRemaining}m)`
          : '';
      return `- ${p.name} (${p.primaryPosition}, ${p.age}y${extStr}${banStr}): Badges=[${p.scoutBadges.join(', ')}], Traits=[${p.traits.join(', ')}]`;
    })
    .join('\n');

  return `
=== TACTICAL ANALYST SYSTEM CONTEXT ===
Club UID: ${data.clubUid}
Financial Runway Status: ${runway.status} (${runway.runwayMonths} months remaining, Burn Rate: €${Math.round(runway.monthlyBurnRate).toLocaleString()}/mo)
Facilities: Training=${String(data.facilities?.training || 'Unknown')}, Youth=${String(data.facilities?.youth || 'Unknown')}
Active Job Vacancies: ${vacanciesList}${suspensionBlock}

SQUAD LIST & QUALITATIVE PROFILES:
${squadOverview}
=======================================
`.trim();
}

export type AnalystReasoningMode = 'deep_high' | 'max_xhigh' | 'fast_lite';

export interface AnalystChatHistoryTurn {
  id: string;
  role: 'user' | 'assistant';
  userText?: string;
  imageNames?: string[];
  screenDetected?: string;
  inGameDate?: string;
  analysisMarkdown?: string;
  immediateClicks?: string[];
  targetSheetTable?: string;
  chronicleTitle?: string;
  chronicleOutcomeMetric?: string;
  playerUpdatesApplied?: string[];
  followUpQuestions?: string[];
}

export interface ExtendedPlayerAutoUpdate {
  name: string;
  rating?: number;
  goalsAdded?: number;
  assistsAdded?: number;
  minutesAdded?: number;
  ipRole?: string;
  oopRole?: string;
  status?: PlayerRecord['status'];
  condition?: number;
  notes: string;
}

export interface ActiveLineupOverrideSlot {
  slotId: string;
  playerName: string;
  ipRole: string;
  oopRole: string;
  condition?: number | null;
}

export interface ActiveLineupOverride {
  shape: string;
  applyToAnalystOnly?: boolean;
  slots: ActiveLineupOverrideSlot[];
}

export interface LiveAnalystStateInput {
  clubName: string;
  managerName: string;
  saveDate: string;
  nextFixture: string;
  leagueStandingSub: string;
  wageSpend: string;
  balance: string;
  players: PlayerRecord[];
  matches: MatchLogEntry[];
  hydratedFmSave: HydratedSaveState | null;
  staff?: StaffRecord[];
  recruitmentCases?: RecruitmentCase[];
  userQuery?: string;
  activeLineupOverride?: ActiveLineupOverride | null;
}

export const FM27_ENGINE_KNOWLEDGE_BASE = `=== FOOTBALL MANAGER 27 (PATCH 27.1.0) MATCH ENGINE & BOBBY DEAN PLAYBOOK v2.0 MASTER CODEX ===
1. DUAL-PHASE IN-POSSESSION (IP) / OUT-OF-POSSESSION (OOP) ENGINE ARCHITECTURE:
   - FM27 replaces legacy Duty (Defend/Support/Attack) sliders with two separate formations and role assignments: In-Possession (IP) and Out-of-Possession (OOP).
   - Every player executes an IP role when your team has the ball and transitions immediately into their OOP role when possession is lost.
   - CRITICAL FLANK OVERLOAD FIX (Patch 27.1.0): Using "Wide Outlet Winger (WOW)" OOP on AML/AMR leaves your full-backs isolated in 2v1 wide overloads against overlapping opposition full-backs/wing-backs. Both AML and AMR MUST be locked to "Tracking Winger (TW)" OOP (or "Wide Midfielder" OOP in a 4-1-4-1 OOP block) to track opposition full-backs all the way into the defensive third.
   - PRIMARY DUAL-PHASE 4-3-3 BLUEPRINT:
     * GK: No-Nonsense GK (NGK) IP / Goalkeeper (GK) OOP (Short/Mixed Distribution to CBs).
     * RB & LB: Full-Back (FB) IP / Full-Back (FB) OOP (or Inverted Full-Back if holding a 3-2 rest-defence base).
     * RCB: Ball-Playing CB (BCB) IP / Centre-Back (CB) OOP.
     * LCB: Centre-Back (CB) IP / Centre-Back (CB) OOP.
     * DM (Zone 5 Anchor): Defensive Midfielder (DM) or Half-Back (HB) IP / Defensive Midfielder (DM) OOP.
     * LCM (Runner / Box-to-Box): Central Midfielder (CM) IP / Central Midfielder (CM) OOP.
     * RCM (Half-Space Creator): Attacking Midfielder (AM) or Channel Midfielder IP / Wide Central Midfielder (WCM) OOP.
     * RW (AMR): Winger (W) or Inside Forward (IF) IP / Tracking Winger (TW) OOP.
     * LW (AML): Inside Forward (IF) IP / Tracking Winger (TW) OOP.
     * ST: Poacher (P) or Channel Forward (CF) IP / Outlet Centre Forward (OCF) or Splitting Outlet Forward OOP.
   - CORE TEAM INSTRUCTIONS:
     * Build-Up: Balanced Ground Build-Up (never force High Crosses unless ST has Jumping Reach >= 15 and Heading >= 14).
     * Passing Directness: Standard (prevents cheap turnover cascades in Patch 27.1.0).
     * Tempo: Slightly Higher (Positive Mentality) or Standard (Balanced Mentality away at top-4 opponents).
     * Defensive Line & Press: Higher Defensive Line + Mid Block / High Press with Trigger Press "More Often", Step Up More OFF when facing Pace 15+ strikers.

2. PATCH 27.1.0 PHYSICAL MATCH ENGINE WEIGHTS & FORMULAS:
   - Top Sprint Speed: \`8.05 + 0.11 * Pace\` (m/s). Pace + Acceleration remain the highest-weighted match engine attributes for transition separation and recovery tackles.
   - Aerial Reach Above Standing Height: \`(Jumping Reach + 5) / 30\` (m). Jumping Reach dictates whether a player contests the header at apex; Heading + Strength + Bravery govern directional accuracy and duel win %.
   - Sprint Stamina Drain Rate: \`2.5 - 0.075 * Stamina\`. Players with Stamina <= 11 suffer a sharp drop in acceleration, tackling accuracy, and concentration once in-match Condition falls below 72%.
   - 8 Tactical Effectiveness Familiarity Areas: Build Up, Chance Creation, Pressing Intensity, Defensive Shape, Transition Speed, Set Pieces, Width Balance, and Rest-Defence. Build Up, Chance Creation, and Pressing Intensity carry the heaviest match engine weight (target >= 51 threshold).

3. THE 5 NON-NEGOTIABLE TOUCHLINE & SQUAD MANAGEMENT LAWS (PLAYBOOK v2.0):
   - LAW 1 (The Golden Rule): Make ONE structural tactical change at a time and observe 20–25 in-game minutes so you isolate cause and effect.
   - LAW 2 (Dual-CB 90-Minute Continuity Lock): NEVER substitute both starting Centre-Backs simultaneously when protecting a lead or parity. Newly introduced CB pairs suffer a temporary positioning/marking synchronization penalty in FM27.
   - LAW 3 (2-Window Substitution Script): Never burn all 3 second-half substitution stoppages before the 75th minute. Batch all 5 substitutions into at most 2 second-half stoppages (plus optional Half-Time 45' free stoppage):
     * Window 1 (60'–63'): Sub off your 2–3 lowest-Stamina non-CB starters (typically Tracking Wingers / Full-Backs / DM).
     * Window 2 (75'+): Sub on 1–2 fresh closers (Striker / Central Midfielder).
   - LAW 4 (Keep 3-Man Midfield Intact Late — Never Pull DM for 4-2-4): Removing your holding DM after 75' to chase a goal in a 4-2-4 surrenders Zone 5 and kills ball progression. Keep your 3-man midfield triangle intact and activate Touchline Tweaks ("Play With More Urgency" + "Swap Wings") + Shout "Up Your Game" (or "Encourage" at parity / "Calm Down" when leading by 1 goal after 80').
   - LAW 5 (180-Minute Double-Gameweek Stamina Cap & Post-Match Rest Law): Across Wednesday/Saturday double gameweeks, cap standard outfielders at <= 125 combined minutes (<= 150m for Stamina >= 13 anchors) so no starter kicks off below 85% Condition. Schedule a full Post-Match Rest + Recovery day immediately after every match to reduce the training injury roll from 13.8% to 4.0%.`;

/**
 * Compiles the live, deterministic ground-truth snapshot of the entire FM27 Command Hub
 * so the Tactical Analyst knows every player, attribute, Patch 27.1.0 physical metric,
 * computed War Room Starting XI, 62m/75m substitution plan, Set-Piece assignment,
 * match result, upcoming fixture, finance figure, and injury on EVERY turn of the chat.
 */
export const MAX_LIVE_ANALYST_CONTEXT_CHARS = 5800;

export function buildLiveTacticalAnalystContext(
  state: LiveAnalystStateInput
): string {
  const {
    clubName,
    managerName,
    saveDate,
    nextFixture,
    leagueStandingSub,
    wageSpend,
    balance,
    players,
    matches,
    hydratedFmSave,
  } = state;

  const hasSaveOrSquad = players.length > 0 || Boolean(hydratedFmSave);
  const sections: string[] = [
    [
      '=== FM27 PATCH 27.1.0 & PLAYBOOK v2.0 CORE RULES ===',
      '- Dual-Phase 4-3-3: Tracking Winger (TW) OOP on both flanks stops 2v1 overlaps; Balanced Ground Build-Up + Short/Mixed GK Distribution + Standard Passing.',
      '- Non-Negotiable Laws: 1 structural change per 20-25m; never sub both starting CBs protecting a lead; batch 5 subs into <=2 second-half windows (60-63m, 75m+); keep 3 midfielders late (never 4-2-4); <=125m double-GW stamina cap + Post-Match Rest day.',
      '- Policy: ZERO raw CA/PA or hidden integers; use Star Ratings, visible attributes, and authentic FM27 IP/OOP roles only.',
    ].join('\n'),
  ];

  if (!hasSaveOrSquad) {
    sections.push(
      '=== CURRENT APP STATE: AWAITING .FM SAVE OR EXPORT IMPORT ===\nNo .fm save or squad export loaded yet (0 players, 0 matches). Answer tactically using FM27 Patch 27.1.0 & Playbook v2.0 principles without inventing fake players.'
    );
    return sections.join('\n\n').slice(0, MAX_LIVE_ANALYST_CONTEXT_CHARS);
  }

  const decoded = hydratedFmSave?.decodedPayload;
  const summary = computeCompetitiveSummary(matches);
  const tacticalPlan = buildDynamicTacticalPlan(players);
  const setPiecePlan = buildDynamicSetPieceRoutines(players);

  // 1. Club Standing, Next Opponent & Wage Runway
  const clubLines: string[] = [
    '=== LIVE CLUB SNAPSHOT ===',
    `Club: ${clubName !== '--' ? clubName : decoded?.meta.clubName || 'Managed Club'} | Manager: ${managerName !== '--' ? managerName : decoded?.meta.managerName || 'Human Manager'} | Date: ${saveDate}`,
    `Standing: ${hydratedFmSave?.leagueRecordLabel || `${summary.played}GP (${summary.wins}W-${summary.draws}D-${summary.losses}L, ${summary.points}Pts)`} · ${leagueStandingSub}`,
    `Next Opponent: ${nextFixture}`,
    `Finances: Balance ${balance} | Wages ${wageSpend}${
      hydratedFmSave?.financialRunway
        ? ` | Runway: ${hydratedFmSave.financialRunway.status} (${hydratedFmSave.financialRunway.runwayMonths < 999 ? `${hydratedFmSave.financialRunway.runwayMonths}m` : 'Positive'}, net £${Math.round(hydratedFmSave.financialRunway.monthlyBurnRate).toLocaleString()}/mo)`
        : ''
    }`,
  ];

  if (decoded?.leagueStanding) {
    const ls = decoded.leagueStanding;
    if (ls.nextOpponentStanding) {
      const no = ls.nextOpponentStanding;
      clubLines.push(
        `Next Opponent Form: ${no.clubName} #${no.position} (${no.points}pts, ${no.played}GP, ${no.goalDiff >= 0 ? '+' : ''}${no.goalDiff}GD)`
      );
    }
    const tablePreview =
      ls.rows && ls.rows.length > 0
        ? ls.rows
            .slice(0, 6)
            .map((r) => `#${r.position} ${r.clubName}(${r.points}pts)`)
            .join(' | ')
        : (ls.top5 || [])
            .slice(0, 5)
            .map((r) => `#${r.pos} ${r.club}(${r.pts}pts)`)
            .join(' | ');
    if (tablePreview) {
      clubLines.push(`Table (${ls.competitionName}): ${tablePreview}`);
    }
  }

  if (hydratedFmSave?.competitionRules) {
    const cr = hydratedFmSave.competitionRules;
    const ruleBits: string[] = [];
    if (cr.maxSquadSize) ruleBits.push(`Max Squad ${cr.maxSquadSize}`);
    if (cr.minHomegrownClub) ruleBits.push(`HGC>=${cr.minHomegrownClub}`);
    if (cr.minHomegrownNation) ruleBits.push(`HGN>=${cr.minHomegrownNation}`);
    if (cr.maxForeignPlayers) ruleBits.push(`MaxFor ${cr.maxForeignPlayers}`);
    if (cr.u21Exempt !== null) ruleBits.push(`U21Ex:${cr.u21Exempt ? 'Y' : 'N'}`);
    if (cr.matchdaySubsLimit) ruleBits.push(`Subs ${cr.matchdaySubsLimit}`);
    if (ruleBits.length > 0) {
      clubLines.push(
        `Competition Registration Rules (${cr.competitionName || 'League'}): ${ruleBits.join(' · ')}`
      );
    }
  }

  if (hydratedFmSave?.divisionBenchmarks) {
    const db = hydratedFmSave.divisionBenchmarks;
    const grpBits = (['GK', 'DEF', 'MID', 'FWD'] as const)
      .map((g) => {
        const b = db.byPositionGroup?.[g];
        if (!b || !b.sampleSize) return null;
        return `${g} £${Math.round(b.medianWeeklyWage)}/wk`;
      })
      .filter(Boolean);
    if (grpBits.length > 0) {
      clubLines.push(
        `Division Benchmarks (${db.clubCount} clubs): ${grpBits.join(' | ')}`
      );
    }
  }

  // 2. Active Suspensions & Injuries
  const activeSuspensions =
    hydratedFmSave?.activeSuspensions && hydratedFmSave.activeSuspensions.length > 0
      ? hydratedFmSave.activeSuspensions
      : players.flatMap((p) => p.activeSuspensions || []);
  if (activeSuspensions.length > 0) {
    clubLines.push(
      `ACTIVE SUSPENSIONS — DO NOT SELECT AS STARTER (${activeSuspensions.length}): ${activeSuspensions
        .slice(0, 8)
        .map(
          (b) =>
            `${b.playerName || `UID ${b.playerUid}`} (${b.matchesRemaining}m ${b.scope} · ${b.reason})`
        )
        .join(' | ')}`
    );
  }

  if (decoded?.activeInjuries && decoded.activeInjuries.length > 0) {
    clubLines.push(
      `Active Injuries (${decoded.activeInjuries.length}): ${decoded.activeInjuries
        .slice(0, 8)
        .map((i) => `${i.playerName || 'Player'} (${i.typeName}, ${i.severity || i.kind})`)
        .join(' | ')}`
    );
  } else {
    const injuredInSquad = players.filter((p) => p.status === 'Injured');
    clubLines.push(
      `Active Injuries: ${
        injuredInSquad.length > 0
          ? injuredInSquad.slice(0, 8).map((p) => p.name).join(', ')
          : '0'
      }`
    );
  }

  sections.push(clubLines.join('\n'));

  // 3. Compact War Room XI (or Custom Active Lineup Override) & Set-Piece Specialists
  if (
    state.activeLineupOverride &&
    state.activeLineupOverride.slots.length > 0
  ) {
    const ov = state.activeLineupOverride;
    const ovCompact = ov.slots
      .map(
        (s) =>
          `${s.slotId}:${s.playerName}(${s.ipRole}/${s.oopRole},C${s.condition ?? '?'}%)`
      )
      .join(' | ');
    sections.push(
      `=== ACTIVE PITCH BUILDER LINEUP OVERRIDE (${ov.shape}${ov.applyToAnalystOnly ? ' · Analyst-Only' : ''}) ===\n${ovCompact}`
    );
  } else if (tacticalPlan.startingXI.length > 0) {
    const xiCompact = tacticalPlan.startingXI
      .map(
        (s) =>
          `${s.slotCode}:${s.player.name}(${s.ipRole}/${s.oopRole},C${s.player.condition ?? '?'}%)`
      )
      .join(' | ');
    sections.push(
      `=== WAR ROOM COMPUTED DUAL-PHASE 4-3-3 STARTING XI ===\nCB Lock: ${tacticalPlan.cbPairNames}\n${xiCompact}`
    );
  }

  if (setPiecePlan.aerialThreats.length > 0) {
    const aerialStr = setPiecePlan.aerialThreats
      .slice(0, 2)
      .map((a) => `${a.name}(JR${a.jumpingReach})`)
      .join(', ');
    const ltStr = setPiecePlan.leftFootTakers
      .slice(0, 2)
      .map((t) => `${t.name}(Cor${t.corners})`)
      .join(', ');
    const rtStr = setPiecePlan.rightFootTakers
      .slice(0, 2)
      .map((t) => `${t.name}(Cor${t.corners})`)
      .join(', ');
    sections.push(
      `=== CORNERS & SET-PIECE SPECIALIST RANKINGS ===\nAerial: ${aerialStr} | L-Foot: ${ltStr} | R-Foot: ${rtStr}`
    );
  }

  // 4. Top 25 First-Team Squad With Role Fits (compact, zero raw CA/PA)
  const top25 = [...players]
    .sort((a, b) => {
      const rank = (s: PlayerRecord['status']) =>
        s === 'Starter' ? 0 : s === 'Rotation' ? 1 : s === 'Youth' ? 2 : 3;
      return (
        rank(a.status) - rank(b.status) ||
        (b.ability || 0) - (a.ability || 0) ||
        (b.minutes || 0) - (a.minutes || 0)
      );
    })
    .slice(0, 25);

  const squadLines = top25.map((p) => {
    const a = p.attributes;
    const banTag =
      p.activeSuspensions && p.activeSuspensions.length > 0 ? ' [BANNED]' : '';
    const injTag = p.status === 'Injured' ? ' [INJ]' : '';
    return `${p.name}|${p.position}|${p.age}y|${p.ability.toFixed(1)}★|C${p.condition ?? '?'}%|${p.ipRole}/${p.oopRole}|P${a.pace}S${a.stamina}J${a.jumpingReach}Pa${a.passing}F${a.finishing}T${a.tackling}D${a.decisions}|${p.rating !== null ? p.rating.toFixed(2) : '-'}rt${banTag}${injTag}`;
  });
  sections.push(
    `=== TOP ${top25.length} FIRST-TEAM SQUAD (OF ${players.length}) ===\n${squadLines.join('\n')}`
  );

  // 5. Recent 5 Matches (compact)
  if (matches.length > 0) {
    const matchLines = matches.slice(0, 5).map((m) => {
      const xgPart =
        m.xGFor !== null && m.xGAgainst !== null
          ? ` xG ${m.xGFor.toFixed(2)}-${m.xGAgainst.toFixed(2)}`
          : '';
      return `${m.date} ${m.opponent}(${m.venue}) ${m.result} ${m.score}${xgPart}`;
    });
    sections.push(`=== RECENT MATCHES ===\n${matchLines.join(' | ')}`);
  }

  let output = sections.join('\n\n');
  if (output.length > MAX_LIVE_ANALYST_CONTEXT_CHARS) {
    output = `${output.slice(0, MAX_LIVE_ANALYST_CONTEXT_CHARS - 20).trimEnd()}\n[Context trimmed]`;
  }
  return output;
}

/**
 * Formats the multi-turn conversation history so the Tactical Analyst remembers
 * every question, tactical debate, player role change, screenshot audit, and
 * action plan from earlier turns in the session.
 */
export function buildConversationTranscript(
  turns: AnalystChatHistoryTurn[],
  maxTurns = 14
): Array<{ role: 'user' | 'assistant'; text: string }> {
  const recent = turns.slice(-maxTurns);
  return recent.map((t) => {
    if (t.role === 'user') {
      const attachmentNote =
        t.imageNames && t.imageNames.length > 0
          ? `[Attached in this turn: ${t.imageNames.join(', ')}]\n`
          : '';
      const raw = `${attachmentNote}${t.userText || ''}`.trim();
      return {
        role: 'user',
        text: raw.length > 4500 ? `${raw.slice(0, 4500)}...` : raw,
      };
    }

    const parts: string[] = [];
    if (t.screenDetected) {
      parts.push(`[Detected Context: ${t.screenDetected} | In-Game Date: ${t.inGameDate || '--'}]`);
    }
    if (t.analysisMarkdown) {
      parts.push(t.analysisMarkdown);
    }
    if (t.immediateClicks && t.immediateClicks.length > 0) {
      parts.push(
        `3 Immediate Clicks Recommended:\n${t.immediateClicks
          .map((c, idx) => `${idx + 1}. ${c}`)
          .join('\n')}`
      );
    }
    if (t.playerUpdatesApplied && t.playerUpdatesApplied.length > 0) {
      parts.push(
        `[Squad DB Updated: ${t.playerUpdatesApplied.slice(0, 10).join(', ')}]`
      );
    }

    const combined = parts.join('\n\n').trim();
    return {
      role: 'assistant',
      text:
        combined.length > 5500 ? `${combined.slice(0, 5500)}...` : combined,
    };
  });
}

/**
 * Applies structured player updates returned by the Tactical Analyst during chat
 * (including IP/OOP tactical role changes, squad status changes, condition, stats, and notes).
 */
export function applyAnalystPlayerUpdates(
  players: PlayerRecord[],
  updates: ExtendedPlayerAutoUpdate[]
): { updatedPlayers: PlayerRecord[]; matchedNames: string[] } {
  if (!updates || updates.length === 0 || players.length === 0) {
    return { updatedPlayers: players, matchedNames: [] };
  }

  const matchedNames: string[] = [];

  const updatedPlayers = players.map((player) => {
    const match = updates.find((u) => {
      if (!u.name) return false;
      const target = u.name.trim().toLowerCase();
      const pName = player.name.toLowerCase();
      const lastWord = pName.split(' ').slice(-1)[0];
      return (
        pName === target ||
        pName.includes(target) ||
        (lastWord.length >= 3 && target.includes(lastWord))
      );
    });
    if (!match) return player;

    if (!matchedNames.includes(player.name)) {
      matchedNames.push(player.name);
    }

    const addGoals =
      typeof match.goalsAdded === 'number' && !Number.isNaN(match.goalsAdded)
        ? match.goalsAdded
        : 0;
    const addAssists =
      typeof match.assistsAdded === 'number' &&
      !Number.isNaN(match.assistsAdded)
        ? match.assistsAdded
        : 0;
    const addMinutes =
      typeof match.minutesAdded === 'number' &&
      !Number.isNaN(match.minutesAdded)
        ? match.minutesAdded
        : 0;

    const validStatuses: Array<PlayerRecord['status']> = [
      'Starter',
      'Rotation',
      'Youth',
      'Injured',
    ];
    const nextStatus =
      match.status && validStatuses.includes(match.status)
        ? match.status
        : player.status;

    return {
      ...player,
      rating:
        typeof match.rating === 'number' &&
        !Number.isNaN(match.rating) &&
        match.rating > 0
          ? match.rating
          : player.rating,
      goals: player.goals + addGoals,
      assists: player.assists + addAssists,
      minutes: player.minutes + addMinutes,
      apps: addMinutes > 0 ? `${player.apps} (+1)` : player.apps,
      ipRole:
        match.ipRole && match.ipRole.trim().length > 0
          ? match.ipRole.trim()
          : player.ipRole,
      oopRole:
        match.oopRole && match.oopRole.trim().length > 0
          ? match.oopRole.trim()
          : player.oopRole,
      status: nextStatus,
      condition:
        typeof match.condition === 'number' &&
        match.condition >= 1 &&
        match.condition <= 100
          ? match.condition
          : player.condition,
      notes:
        match.notes && match.notes.trim().length > 0
          ? match.notes.trim()
          : player.notes,
    };
  });

  return { updatedPlayers, matchedNames };
}
