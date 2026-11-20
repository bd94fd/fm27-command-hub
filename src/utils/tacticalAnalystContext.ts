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
import { HydratedSaveState } from './fmSaveHydrator';

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
  const sections: string[] = [FM27_ENGINE_KNOWLEDGE_BASE];

  // Add concise summary of Playbook v2.0 Reference Rules
  const playbookLines = PLAYBOOK_V2_REFERENCE_RULES.map(
    (r) => `- [${r.section}] ${r.title}: ${r.summary} (In-Game: ${r.inGameSetting})`
  ).join('\n');
  sections.push(`=== PLAYBOOK v2.0 QUICK-CHECK CARDS ===\n${playbookLines}`);
  sections.push(buildFm27KnowledgeGroundingBlock(state.userQuery || '', 3));

  if (!hasSaveOrSquad) {
    sections.push(
      `=== CURRENT APP STATE: AWAITING .FM SAVE OR EXPORT IMPORT ===
- Status: No .fm save file or squad export has been loaded yet (0 players, 0 matches).
- How to respond in this state:
  1. Answer any FM27 tactical, match-engine, role-pairing (IP vs OOP), set-piece, training, scouting, mentoring, or Playbook v2.0 question with deep, authoritative Football Manager 27 expertise.
  2. Reference the conversation history naturally if the manager is discussing a specific tactical scenario, formation tweak, or match problem they are facing in their save.
  3. Remind them they can also drop their .fm save file (or screenshot/CSV) anytime to auto-populate their exact squad, attributes, star ratings, fixtures, and league table.`
    );
    return sections.join('\n\n');
  }

  const decoded = hydratedFmSave?.decodedPayload;
  const summary = computeCompetitiveSummary(matches);
  const tacticalPlan = buildDynamicTacticalPlan(players);
  const setPiecePlan = buildDynamicSetPieceRoutines(players);
  const upcomingFixtures = decoded?.upcomingFixtures || [];
  const trainingSchedule = buildDynamicTrainingSchedule(
    saveDate,
    upcomingFixtures
  );

  // 1. Club & Executive KPI Snapshot
  const clubHeaderLines: string[] = [
    `=== LIVE IN-APP CLUB & SAVE SNAPSHOT (GROUND TRUTH — NEVER FABRICATE OUTSIDE THIS DATA) ===`,
    `- Managed Club: ${clubName !== '--' ? clubName : decoded?.meta.clubName || 'Managed Club'}`,
    `- Manager: ${managerName !== '--' ? managerName : decoded?.meta.managerName || 'Human Manager'}`,
    `- Current In-Game Date: ${saveDate}`,
    `- Next Scheduled Fixture: ${nextFixture}`,
    `- League Standing / Record: ${hydratedFmSave?.leagueRecordLabel || `${summary.played} GP (${summary.wins}W-${summary.draws}D-${summary.losses}L, ${summary.points} Pts)`} · ${leagueStandingSub}`,
    `- Finances & Wage Compliance: Balance ${balance} · Weekly Wage vs Budget: ${wageSpend}`,
  ];

  if (decoded?.leagueStanding) {
    const ls = decoded.leagueStanding;
    if (ls.top5 && ls.top5.length > 0) {
      clubHeaderLines.push(
        `- Division Top 5 (${ls.competitionName}): ${ls.top5
          .map(
            (t) =>
              `#${t.pos} ${t.club} (${t.played}GP, ${t.pts}Pts, ${t.gd >= 0 ? '+' : ''}${t.gd}GD)`
          )
          .join(' | ')}`
      );
    }
    if (ls.nextOpponentStanding) {
      const no = ls.nextOpponentStanding;
      clubHeaderLines.push(
        `- Next Opponent Standing: ${no.clubName} is #${no.position} with ${no.points} Pts (${no.played} GP, ${no.goalDiff >= 0 ? '+' : ''}${no.goalDiff} GD)`
      );
    }
  }

  if (decoded?.tactics && decoded.tactics.length > 0) {
    clubHeaderLines.push(
      `- Active Tactics in Save: ${decoded.tactics
        .map((t) => `Slot ${t.index}: ${t.name} (${t.styleName}, ${t.mentality})`)
        .join(' | ')}`
    );
  }

  if (decoded?.activeInjuries && decoded.activeInjuries.length > 0) {
    clubHeaderLines.push(
      `- Active Medical / Injury List (${decoded.activeInjuries.length}): ${decoded.activeInjuries
        .map(
          (i) =>
            `${i.playerName || 'Player'} — ${i.typeName} (${i.severity || i.kind}, since ${i.date || 'active'})`
        )
        .join(' | ')}`
    );
  } else {
    const injuredInSquad = players.filter((p) => p.status === 'Injured');
    clubHeaderLines.push(
      `- Active Injuries: ${
        injuredInSquad.length > 0
          ? injuredInSquad.map((p) => `${p.name} (${p.notes})`).join(' | ')
          : '0 active injuries'
      }`
    );
  }

  if (decoded?.mentoring && decoded.mentoring.length > 0) {
    clubHeaderLines.push(
      `- Active Mentoring Groups: ${decoded.mentoring
        .map((m) => `${m.label}: [${m.members.join(', ')}]`)
        .join(' | ')}`
    );
  }

  sections.push(clubHeaderLines.join('\n'));

  // 2. War Room Computed Dual-Phase 4-3-3 Starting XI & 62m/75m Substitution Script
  if (tacticalPlan.startingXI.length > 0) {
    const xiLines = tacticalPlan.startingXI.map(
      (s) =>
        `  * ${s.slotCode}: #${s.player.number} ${s.player.name} (${s.player.position}, Age ${s.player.age}, ${s.player.ability.toFixed(1)}★/${s.player.potential.toFixed(1)}★, Cond ${s.player.condition ?? '?'}%) -> IP: ${s.ipRole} | OOP: ${s.oopRole} | Plan: ${s.plannedMinutes}m${s.subOffFor ? ` (Sub off at ${s.plannedMinutes}' for ${s.subOffFor})` : ' (Full 90m Lock)'}`
    );
    const subLines = tacticalPlan.subPlan.map(
      (sub) =>
        `  * ${sub.windowLabel} [${sub.slotCode}]: OFF ${sub.playerOff} -> ON ${sub.playerOn} (${sub.reason})`
    );
    const benchNames = tacticalPlan.bench
      .map(
        (b) =>
          `#${b.number} ${b.name} (${b.position}, Sta ${b.attributes.stamina}, Pac ${b.attributes.pace}, Cond ${b.condition ?? '?'}%)`
      )
      .join(', ');

    sections.push(
      `=== WAR ROOM COMPUTED DUAL-PHASE 4-3-3 STARTING XI & 2-WINDOW SUB SCRIPT ===
- Dual-CB 90m Continuity Pair: ${tacticalPlan.cbPairNames}
- Recommended Starting XI:
${xiLines.join('\n')}
- Recommended 62m / 75m Substitution Script:
${subLines.length > 0 ? subLines.join('\n') : '  * No automated subs required'}
- Available Bench Pool: ${benchNames || 'None'}`
    );
  }

  // 3. Computed Set-Piece Specialists & Training Schedule
  if (setPiecePlan.aerialThreats.length > 0) {
    const aerialStr = setPiecePlan.aerialThreats
      .map(
        (a) =>
          `A${a.rank} ${a.name} (${a.position}: JR ${a.jumpingReach}, Hdr ${a.heading}, Score ${a.aerialScore})`
      )
      .join(' | ');
    const leftTakersStr = setPiecePlan.leftFootTakers
      .map(
        (t) =>
          `${t.name} (${t.foot}: Cor ${t.corners}, Cro ${t.crossing}, Tec ${t.technique})`
      )
      .join(' | ');
    const rightTakersStr = setPiecePlan.rightFootTakers
      .map(
        (t) =>
          `${t.name} (${t.foot}: Cor ${t.corners}, Cro ${t.crossing}, Tec ${t.technique})`
      )
      .join(' | ');
    const recStr = setPiecePlan.recoveryDefenders
      .map(
        (d, idx) =>
          `D${idx + 1} ${d.name} (Pac ${d.pace}, Acc ${d.acceleration}, Tck ${d.tackling})`
      )
      .join(' | ');

    sections.push(
      `=== CORNERS & SET-PIECE SPECIALIST RANKINGS (FROM LIVE SQUAD ATTRIBUTES) ===
- Top Aerial Threats (Near Post A1 / Mark Keeper A2 / Far Post A3): ${aerialStr}
- Right-Side Inswinger Corner Takers (Left-Footed): ${leftTakersStr}
- Left-Side Inswinger Corner Takers (Right-Footed): ${rightTakersStr}
- Recovery Defenders (Stay Back D1/D2): ${recStr}`
    );
  }

  if (trainingSchedule.length > 0) {
    const trainLines = trainingSchedule
      .slice(0, 4)
      .map(
        (t) =>
          `  * ${t.week} (${t.date} · ${t.fixtureContext}): [Slot 1: ${t.slot1}] [Slot 2: ${t.slot2}] [Slot 3: ${t.slot3}] -> ${t.directive}`
      )
      .join('\n');
    sections.push(
      `=== UPCOMING TRAINING & RECOVERY PERIODISATION ===\n${trainLines}`
    );
  }

  // 4. Full Squad Database Table with Patch 27.1.0 Physical Metrics (Stars + Engine Metrics only, NEVER raw CA/PA)
  const squadLines = players.slice(0, 45).map((p) => {
    const a = p.attributes;
    const eng = computeFm27EngineMetrics(p);
    const starStr = `${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★`;
    return `- #${p.number} ${p.name} [${p.position} | ${p.status} | Age ${p.age} | ${p.preferredFoot || 'Right'} Foot | ${starStr} | Cond ${p.condition ?? '?'}% | £${p.wagePw}/wk exp ${p.expires}]: Apps ${p.apps} (${p.minutes}m), Rat ${p.rating !== null ? p.rating.toFixed(2) : '-'}, ${p.goals}G (${p.xG.toFixed(2)} xG, ${p.xGPer90.toFixed(2)}/90), ${p.assists}A (${p.xA.toFixed(2)} xA, ${p.xAPer90.toFixed(2)}/90), Drb ${p.drbPer90}/90, PrP ${p.prPassesPer90}/90, Hdr ${p.hdrPct}%, Int ${p.intPer90}/90, Tck ${p.tckPct}% | Attrs: Pac ${a.pace} Acc ${a.acceleration} Sta ${a.stamina} JR ${a.jumpingReach} Hdr ${a.heading ?? 10} Det ${a.determination} Pas ${a.passing} Fin ${a.finishing} Tck ${a.tackling} Fir ${a.firstTouch} Dec ${a.decisions} WR ${a.workRate} OtB ${a.offTheBall} Cor ${a.corners ?? 10} Cro ${a.crossing ?? 10} Tec ${a.technique ?? 10} Pos ${a.positioning ?? 10} Str ${a.strength ?? 10} Ldr ${a.leadership ?? 10} | Patch 27.1.0 Engine: ${eng.topSpeedMps} m/s Sprint, +${eng.jumpHeightMeters}m Jump, Score ${eng.physicalEngineScore}/100 | Roles: IP=${p.ipRole} / OOP=${p.oopRole} | Notes: ${p.notes}`;
  });

  sections.push(
    `=== FULL MANAGED SQUAD DATABASE (${players.length} PLAYERS) ===\n${squadLines.join('\n')}`
  );

  if (state.recruitmentCases && state.recruitmentCases.length > 0) {
    const recLines = state.recruitmentCases.slice(0, 15).map(
      (c) =>
        `- ${c.playerName} (${c.position}, ${c.currentClub || 'Free/Unknown'}) | Stage: ${c.stage} | Interest: ${c.interest} | Est Fee: ${c.estimatedFee || '--'} | Target Roles: IP=${c.targetIpRole || '--'} / OOP=${c.targetOopRole || '--'}`
    );
    sections.push(
      `=== ACTIVE RECRUITMENT PIPELINE (${state.recruitmentCases.length} TARGETS) ===\n${recLines.join('\n')}`
    );
  }

  if (state.staff && state.staff.length > 0) {
    const staffLines = state.staff.slice(0, 20).map(
      (s) =>
        `- ${s.name} (${s.role}, Age ${s.age}, £${s.wagePw}/wk exp ${s.expires})`
    );
    sections.push(
      `=== CLUB BACKROOM STAFF (${state.staff.length} STAFF) ===\n${staffLines.join('\n')}`
    );
  }

  // 5. Recent Played Match Log & Upcoming Fixtures
  if (matches.length > 0) {
    const matchLines = matches.slice(0, 20).map((m) => {
      const xgPart =
        m.xGFor !== null && m.xGAgainst !== null
          ? ` | xG ${m.xGFor.toFixed(2)}-${m.xGAgainst.toFixed(2)}`
          : '';
      const possPart =
        m.possession !== null ? ` | Poss ${m.possession}%` : '';
      return `- Event #${m.eventNumber} (${m.date}) [${m.competition}] vs ${m.opponent} (${m.venue}): ${m.result} ${m.score}${xgPart}${possPart} | Shots ${m.shotsFor} vs ${m.shotsAgainst} | Audit: ${m.tacticalAudit}`;
    });
    sections.push(
      `=== PLAYED MATCH LOG (${matches.length} TOTAL MATCHES, NEWEST FIRST) ===\n${matchLines.join('\n')}`
    );
  }

  if (upcomingFixtures.length > 0) {
    const upcomingLines = upcomingFixtures
      .slice(0, 12)
      .map(
        (f, idx) =>
          `- Fixture #${idx + 1}: ${f.dateDmy || f.dateIso} [${f.competition}] vs ${f.opponent} (${f.venue === 'H' ? 'Home' : 'Away'})`
      );
    sections.push(
      `=== UPCOMING FIXTURE SCHEDULE FROM ${saveDate} ===\n${upcomingLines.join('\n')}`
    );
  }

  return sections.join('\n\n');
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
