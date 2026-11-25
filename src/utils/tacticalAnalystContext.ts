import {
  MatchLogEntry,
  PlayerRecord,
  RecruitmentCase,
  StaffRecord,
} from '../types/fm27';
import {
  buildDynamicSetPieceRoutines,
  computeCompetitiveSummary,
} from './fmSyncEngine';
import {
  ClubGovernanceState,
  LastMatchTacticBlueprint,
  Pass0ExtractionPayload,
  RecruitmentTarget,
} from '../types/fmSave';
import {
  calculateFinancialRunway,
  HydratedSaveState,
} from './fmSaveHydrator';
import { buildSquadTransferAudit } from './transferAudit';
import { evaluateInGameShortlist } from './shortlistAdviceEngine';
import { getPreferredJobRatings } from './staffRatings';
import {
  CustomSlotOverride,
  FormationPresetKey,
  isSuspensionActiveForCompetition,
  solveBestXi,
} from './bestXiSolver';
import { buildAiResearchContextBlock } from './fmfShortlistExporter';
import type { DeepJourneyReport } from '../services/saveCache';
import { evaluateScoutTargetCard } from './cardIntelligenceEngine';
import {
  filterMeaningfulInstructions,
  resolveSquadPlannerSlotMeta,
} from './squadPlannerHelper';
import {
  buildTacticOverrideKey,
  getSlotPositionBucket,
  loadTacticRoleOverrides,
} from './fm27TacticRoleInference';
import {
  buildClubGovernanceState,
  buildLastMatchTacticBlueprint,
} from './clubGovernanceAndTactics';
import { loadFm27BinaryDictionary } from './fm27BinaryDictionary';
import {
  classifyMatchCompetitionBucket,
  deriveFootballSeasonLabel,
  extractMatchSeasons,
  formatBucketCompactSummary,
  formatCompetitionBucketTag,
  formatSignedCurrency,
  summarizeMatchesByScope,
} from './matchScopeHelpers';

export function formatCompactPositionRatings(player: PlayerRecord): string {
  const ratings = player.positionRatings;
  if (!ratings) return '';
  const entries = Object.entries(ratings)
    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0)
    .map(([k, v]) => [k.toUpperCase(), Math.round(v as number)] as [string, number]);
  if (entries.length === 0) return '';

  const upperMap = new Map<string, number>(entries);
  const notable = entries
    .filter(([, v]) => v >= 12)
    .sort((a, b) => b[1] - a[1]);

  // Explicitly expose low MC familiarity when an AMC/Winger has AMC >= 15 so
  // the analyst never mistakes an AMC-only creator (e.g. AMC:20, MC:2) for a CM.
  const amcVal = upperMap.get('AMC') ?? 0;
  const mcVal = upperMap.get('MC');
  if (amcVal >= 15 && typeof mcVal === 'number' && mcVal < 12) {
    notable.push(['MC', mcVal]);
  }
  const stVal = upperMap.get('ST') ?? upperMap.get('STC');
  if (amcVal >= 15 && typeof stVal === 'number' && stVal >= 12 && !notable.some(([k]) => k === 'ST' || k === 'STC')) {
    notable.push(['ST', stVal]);
  }

  if (notable.length === 0) {
    const topTwo = [...entries].sort((a, b) => b[1] - a[1]).slice(0, 2);
    return `PosFam[${topTwo.map(([k, v]) => `${k}:${v}`).join(',')}]`;
  }
  return `PosFam[${notable.slice(0, 6).map(([k, v]) => `${k}:${v}`).join(',')}]`;
}

export function buildTacticalAnalystContext(data: Pass0ExtractionPayload): string {
  const runway = calculateFinancialRunway(data.monthlyFinances);

  const vacanciesList =
    (data.jobVacancies || [])
      .map((v) => `${v.role || 'Staff'} at ${v.club || 'Unknown'}`)
      .join(', ') || 'None';

  const suspensionBlock =
    data.activeSuspensions && data.activeSuspensions.length > 0
      ? `\nACTIVE SUSPENSIONS (CHECK COMPETITION SCOPE BEFORE EXCLUDING):\n${data.activeSuspensions
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
          ? `, BANNED(${p.activeSuspensions[0].matchesRemaining}m ${p.activeSuspensions[0].scope})`
          : '';
      return `- ${p.name} (${p.primaryPosition}, ${p.age}y${extStr}${banStr}): Badges=[${p.scoutBadges.join(', ')}], Traits=[${p.traits.join(', ')}]`;
    })
    .join('\n');

  return `
=== TACTICAL ANALYST SYSTEM CONTEXT ===
Club UID: ${data.clubUid}
Financial Runway Status: ${runway.status} (${runway.runwayMonths} months remaining, Burn Rate: £${Math.round(runway.monthlyBurnRate).toLocaleString()}/mo)
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
  trackedTargets?: RecruitmentTarget[];
  latestJourneyReport?: DeepJourneyReport | null;
  userQuery?: string;
  activeShape?: FormationPresetKey;
  customSlots?: CustomSlotOverride[];
  applyToAnalystOnly?: boolean;
  activeLineupOverride?: ActiveLineupOverride | null;
  // Live recomputed governance / last-match tactic (Calibration Lab overrides) take
  // precedence over values re-derived from the decoded payload.
  liveGovernance?: ClubGovernanceState | null;
  liveLastMatchTactic?: LastMatchTacticBlueprint | null;
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
 * so the Tactical Analyst uses the EXACT same Best XI solver, competition-aware suspension
 * logic, Transfers positional depth chart, and Set-Piece rankings as every other tab.
 */
export type ContextPriorityTier = 'P0' | 'P1' | 'P2' | 'P3';

export interface PriorityContextBlock {
  id: string;
  tier: ContextPriorityTier;
  fullText: string;
  compactText?: string;
  renderToFit?: (availableChars: number) => string;
}

/**
 * Defensive final safety scrubber ensuring zero raw numeric CA/PA tokens ever
 * leak into the AI prompt payload (even from user notes or decoded strings).
 */
export function scrubRawCaPaTokens(text: string): string {
  return text
    .replace(/\b(?:Current\s+Ability|Potential\s+Ability)\s*[:=]\s*\d{1,3}\b/gi, '[redacted]')
    .replace(/\b(?:CA|PA)\s*[:=]\s*\d{1,3}\b/gi, '[redacted]')
    .replace(/\b(?:CA|PA)\s+\d{2,3}\b/g, '[redacted]');
}

/**
 * Deterministically assembles priority-tiered context sections strictly within `maxChars`
 * without brute-force tail slicing that would chop critical P0 blocks (PosFam, IP/OOP
 * blueprint, competition-scoped bans, playing-time promises, season G/xG/A/xA, Journey).
 */
export function assemblePriorityBudgetedContext(
  blocks: PriorityContextBlock[],
  maxChars: number = MAX_LIVE_ANALYST_CONTEXT_CHARS
): string {
  const nonEmpty = blocks.filter((b) => b.fullText.trim().length > 0);
  if (nonEmpty.length === 0) return '';

  const activeText = new Map<string, string | null>(
    nonEmpty.map((b) => [b.id, b.fullText])
  );

  const measureCurrent = (): number => {
    let total = 0;
    let count = 0;
    for (const b of nonEmpty) {
      const txt = activeText.get(b.id);
      if (txt && txt.length > 0) {
        total += txt.length + (count > 0 ? 2 : 0);
        count++;
      }
    }
    return total;
  };

  const joinCurrent = (): string =>
    nonEmpty
      .map((b) => activeText.get(b.id))
      .filter((txt): txt is string => Boolean(txt && txt.length > 0))
      .join('\n\n');

  if (measureCurrent() <= maxChars) {
    return scrubRawCaPaTokens(joinCurrent());
  }

  // Step 1: Trim or omit optional P3 appendices first (e.g. FM27 research appendix)
  for (let i = nonEmpty.length - 1; i >= 0 && measureCurrent() > maxChars; i--) {
    const b = nonEmpty[i];
    if (b.tier !== 'P3') continue;
    const currentTxt = activeText.get(b.id) ?? '';
    const withoutThis = measureCurrent() - currentTxt.length - 2;
    const avail = maxChars - withoutThis - 2;
    if (b.renderToFit && avail > 180) {
      const fitted = b.renderToFit(avail);
      activeText.set(b.id, fitted.length > 0 ? fitted : null);
    } else if (b.compactText && withoutThis + 2 + b.compactText.length <= maxChars) {
      activeText.set(b.id, b.compactText);
    } else {
      activeText.set(b.id, null);
    }
  }

  // Step 2: Compact, then drop P2 supplementary blocks (recruitment, staff, squad planner)
  for (let i = nonEmpty.length - 1; i >= 0 && measureCurrent() > maxChars; i--) {
    const b = nonEmpty[i];
    if (b.tier !== 'P2' || !b.compactText) continue;
    activeText.set(b.id, b.compactText);
  }
  for (let i = nonEmpty.length - 1; i >= 0 && measureCurrent() > maxChars; i--) {
    const b = nonEmpty[i];
    if (b.tier !== 'P2') continue;
    activeText.set(b.id, null);
  }

  // Step 3: Compact P1 high-priority blocks (preserving core signals)
  for (let i = nonEmpty.length - 1; i >= 0 && measureCurrent() > maxChars; i--) {
    const b = nonEmpty[i];
    if (b.tier !== 'P1' || !b.compactText) continue;
    activeText.set(b.id, b.compactText);
  }

  // Step 4: Dynamically size any P0 renderToFit block (e.g. Squad Profiles) so complete lines fit cleanly
  const refitDynamicP0 = () => {
    for (const b of nonEmpty) {
      if (b.tier !== 'P0' || !b.renderToFit) continue;
      if (measureCurrent() <= maxChars) break;
      const cur = activeText.get(b.id) ?? '';
      const otherChars = measureCurrent() - cur.length;
      const avail = Math.max(0, maxChars - otherChars);
      if (avail > 0) {
        activeText.set(b.id, b.renderToFit(avail));
      }
    }
  };
  refitDynamicP0();

  // Step 5: If still over budget under extreme saves, compact P0 optional sub-details
  // (never drops PosFam, IP/OOP blueprint, competition-scoped bans, promises, G/xG/A/xA, or Journey deltas)
  for (let i = nonEmpty.length - 1; i >= 0 && measureCurrent() > maxChars; i--) {
    const b = nonEmpty[i];
    if (b.tier !== 'P0' || !b.compactText) continue;
    activeText.set(b.id, b.compactText);
  }
  refitDynamicP0();

  // Step 6: Last-resort drop of lowest-priority P1 blocks if an ultra-dense P0 payload still exceeds budget
  for (let i = nonEmpty.length - 1; i >= 0 && measureCurrent() > maxChars; i--) {
    const b = nonEmpty[i];
    if (b.tier !== 'P1') continue;
    activeText.set(b.id, null);
  }
  refitDynamicP0();

  const assembled = scrubRawCaPaTokens(joinCurrent());
  if (assembled.length <= maxChars) {
    return assembled;
  }
  return `${assembled.slice(0, Math.max(0, maxChars - 20)).trimEnd()}\n[Context trimmed]`;
}

export const MAX_LIVE_ANALYST_CONTEXT_CHARS = 15500;

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
    staff = [],
    recruitmentCases = [],
    trackedTargets = [],
    latestJourneyReport = null,
    activeShape = '4-3-3 DM Wide',
    customSlots = [],
  } = state;

  const hasSaveOrSquad = players.length > 0 || Boolean(hydratedFmSave);
  const blocks: PriorityContextBlock[] = [
    {
      id: 'core_rules',
      tier: 'P0',
      fullText: [
        '=== FM27 PATCH 27.1.0 & PLAYBOOK v2.0 CORE RULES ===',
        '- Dual-Phase IP/OOP ONLY (no Defend/Support/Attack duties): Tracking Winger (TW) OOP both flanks; Balanced Ground Build-Up + Short/Mixed GK Dist + Standard Passing; Patch 27.1.0 Holding Full-Back presses more aggressively and counter-attack transitions + wide OOP pressing are re-tuned.',
        '- Laws: 1 tweak/20-25m; never sub both CBs protecting lead; <=2 2H sub windows (60-63m, 75m+); keep 3 midfielders late (never 4-2-4); <=125m double-GW cap + Post-Match Rest.',
        '- Truth: ZERO raw CA/PA; match War Room XI, 100%-Fit XI, Last-Match Tactic, Governance/Promises, Transfers Action Plan & PosFam; NEVER put SURPLUS/Sell players on bench when cover exists; NEVER loan Promote-to-Backup youth; cite full season stats (Apps, Mins, G/xG, A/xA, Rt).',
      ].join('\n'),
    },
  ];

  if (!hasSaveOrSquad) {
    blocks.push({
      id: 'awaiting_save',
      tier: 'P0',
      fullText:
        '=== CURRENT APP STATE: AWAITING .FM SAVE OR EXPORT IMPORT ===\nNo .fm save or squad export loaded yet (0 players, 0 matches). Answer tactically using FM27 Patch 27.1.0 & Playbook v2.0 principles without inventing fake players.',
    });
    return assemblePriorityBudgetedContext(blocks, MAX_LIVE_ANALYST_CONTEXT_CHARS);
  }

  const decoded = hydratedFmSave?.decodedPayload;
  const summary = computeCompetitiveSummary(matches, saveDate);
  const setPiecePlan = buildDynamicSetPieceRoutines(players);

  const nextFixtureObj = decoded?.upcomingFixtures?.[0] || null;
  const nextCompetitionName = nextFixtureObj?.competition || null;

  // Use the exact same First-Team pool as InteractivePitchBuilder / TacticalWarRoom
  const firstTeamPool = players.filter(
    (p) => p.teamSlot === undefined || p.teamSlot === 0
  );
  const solverPool = firstTeamPool.length >= 11 ? firstTeamPool : players;

  const activeSuspensions =
    hydratedFmSave?.activeSuspensions && hydratedFmSave.activeSuspensions.length > 0
      ? hydratedFmSave.activeSuspensions
      : players.flatMap((p) => p.activeSuspensions || []);

  const squadBasicWageSum = players.reduce((s, p) => s + (p.wagePw || 0), 0);
  const clubLines: string[] = [
    '=== LIVE CLUB SNAPSHOT ===',
    `Club: ${clubName !== '--' ? clubName : decoded?.meta.clubName || 'Managed Club'} | Mgr: ${managerName !== '--' ? managerName : decoded?.meta.managerName || 'Human Manager'} | Date: ${saveDate}`,
    `Standing: ${hydratedFmSave?.leagueRecordLabel || `${summary.played}GP (${summary.wins}W-${summary.draws}D-${summary.losses}L, ${summary.points}Pts)`} · ${leagueStandingSub}`,
    `Next: ${nextFixture}${nextCompetitionName ? ` [${nextCompetitionName}]` : ''}`,
    `Finances: Bal ${balance} | Club Payroll ${wageSpend}${
      squadBasicWageSum > 0 ? ` | Player Basic Wages £${squadBasicWageSum.toLocaleString()}/wk` : ''
    }${
      hydratedFmSave?.financialRunway
        ? ` | Runway: ${hydratedFmSave.financialRunway.status} (${hydratedFmSave.financialRunway.runwayMonths < 999 ? `${hydratedFmSave.financialRunway.runwayMonths}m` : 'Pos'}, net £${Math.round(hydratedFmSave.financialRunway.monthlyBurnRate).toLocaleString()}/mo)`
        : ''
    }`,
  ];

  if (decoded?.upcomingFixtures && decoded.upcomingFixtures.length > 0) {
    const upPreview = decoded.upcomingFixtures
      .slice(0, 3)
      .map(
        (f) =>
          `${f.dateDmy || f.dateIso} [${f.competition}] vs ${f.opponent}(${f.venue})`
      )
      .join(' | ');
    clubLines.push(`Upcoming: ${upPreview}`);
  }

  if (decoded?.leagueStanding) {
    const ls = decoded.leagueStanding;
    if (ls.nextOpponentStanding) {
      const no = ls.nextOpponentStanding;
      clubLines.push(
        `Next Opp: ${no.clubName} #${no.position} (${no.points}pts,${no.played}GP,${no.goalDiff >= 0 ? '+' : ''}${no.goalDiff}GD)`
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

  // 2. Competition-Aware Suspensions & Active Injuries
  if (activeSuspensions.length > 0) {
    const blockingBans = activeSuspensions.filter((b) =>
      isSuspensionActiveForCompetition(b, nextCompetitionName)
    );
    const otherCompBans = activeSuspensions.filter(
      (b) => !isSuspensionActiveForCompetition(b, nextCompetitionName)
    );

    if (blockingBans.length > 0) {
      clubLines.push(
        `ACTIVE SUSPENSIONS (${nextCompetitionName || 'Next Match'}) — DO NOT SELECT AS STARTER: ${blockingBans
          .slice(0, 8)
          .map(
            (b) =>
              `${b.playerName || `UID ${b.playerUid}`} (${b.matchesRemaining}m ${b.competitionName} [${b.scope}] · ${b.reason})`
          )
          .join(' | ')}`
      );
    }
    if (otherCompBans.length > 0) {
      clubLines.push(
        `OTHER-COMPETITION BANS ONLY (AVAILABLE FOR NEXT MATCH ${nextCompetitionName || ''}): ${otherCompBans
          .slice(0, 8)
          .map(
            (b) =>
              `${b.playerName || `UID ${b.playerUid}`} (${b.matchesRemaining}m in ${b.competitionName} [${b.scope}] ONLY — ELIGIBLE for ${nextCompetitionName})`
          )
          .join(' | ')}`
      );
    }
  }

  if (decoded?.activeInjuries && decoded.activeInjuries.length > 0) {
    clubLines.push(
      `Active Injuries (${decoded.activeInjuries.length}): ${decoded.activeInjuries
        .slice(0, 6)
        .map((i) => `${i.playerName || 'Player'} (${i.typeName})`)
        .join(' | ')}`
    );
  } else {
    const injuredInSquad = players.filter((p) => p.status === 'Injured');
    clubLines.push(
      `Active Injuries: ${
        injuredInSquad.length > 0
          ? injuredInSquad.slice(0, 6).map((p) => p.name).join(', ')
          : '0'
      }`
    );
  }

  // Keep a compact P0 variant that ALWAYS retains Club/Date/Standing/Next/Finances + Competition-Scoped Suspensions + Active Injuries
  const clubCompactLines = clubLines.filter(
    (line) =>
      !line.startsWith('Upcoming: ') &&
      !line.startsWith('Table (') &&
      !line.startsWith('Division Benchmarks (')
  );
  blocks.push({
    id: 'club_snapshot',
    tier: 'P0',
    fullText: clubLines.join('\n'),
    compactText: clubCompactLines.join('\n'),
  });

  // 2b. Governance, Manager Contract, Board/Supporter Confidence, Objectives & Playing-Time Promises
  // Live-evaluate against the latest FM27 Binary Dictionary so newly calibrated offset rules appear immediately
  const liveDict = loadFm27BinaryDictionary();
  const gov =
    state.liveGovernance ??
    (hydratedFmSave?.decodedPayload
      ? buildClubGovernanceState(hydratedFmSave.decodedPayload, players, liveDict)
      : hydratedFmSave?.governance);
  if (gov) {
    const govLines: string[] = ['=== CLUB GOVERNANCE, MANAGER CONTRACT, BOARD TARGETS & PROMISES ==='];
    const mc = gov.managerContract;
    govLines.push(
      mc.available
        ? `Manager Contract: ${mc.managerName} | Wage: ${mc.wagePw ? `£${mc.wagePw.toLocaleString()}/wk` : 'N/A'} | Expires: ${mc.expires || 'N/A'}${mc.contractExpiryMonths != null ? ` (${mc.contractExpiryMonths}m left)` : ''}${mc.jobSecurity ? ` | Job Security: ${mc.jobSecurity}` : ''}`
        : `Manager Contract: ${mc.managerName} (contract details not exposed in this save)`
    );
    govLines.push(
      `Board Rating: ${gov.boardConfidence.available ? `${gov.boardConfidence.grade || gov.boardConfidence.score || 'Available'}${gov.boardConfidence.summary ? ` (${gov.boardConfidence.summary})` : ''}` : 'Not exposed in this FM27 save'} | Supporter Rating: ${gov.supporterConfidence.available ? `${gov.supporterConfidence.grade || gov.supporterConfidence.score || 'Available'}${gov.supporterConfidence.summary ? ` (${gov.supporterConfidence.summary})` : ''}` : 'Not exposed in this FM27 save'}`
    );
    if (gov.boardObjectives.length > 0) {
      govLines.push(
        `Board Objectives: ${gov.boardObjectives
          .slice(0, 6)
          .map((o) => `${o.title}${o.importance ? ` [${o.importance}]` : ''}${o.status ? ` (${o.status})` : ''}`)
          .join(' | ')}`
      );
    }
    if (gov.clubPromises.length > 0) {
      govLines.push(
        `Active Club/Manager Promises: ${gov.clubPromises
          .slice(0, 6)
          .map((pr) => `${pr.subject}${pr.targetName ? ` -> ${pr.targetName}` : ''}${pr.dueDate ? ` by ${pr.dueDate}` : ''}${pr.status ? ` [${pr.status}]` : ''}`)
          .join(' | ')}`
      );
    }
    const atRiskPromises = gov.playerPromiseAudits.filter(
      (a) => a.status === 'breached' || a.status === 'at_risk'
    );
    const onTrackPromises = gov.playerPromiseAudits.filter(
      (a) => a.status === 'on_track'
    );
    if (atRiskPromises.length > 0 || onTrackPromises.length > 0) {
      govLines.push(
        `Squad Playing-Time Promise Audit (${atRiskPromises.length} At Risk/Breached, ${onTrackPromises.length} On Track): ${[
          ...atRiskPromises.slice(0, 6),
          ...onTrackPromises.slice(0, 2),
        ]
          .map(
            (a) =>
              `${a.playerName}[${a.status}]: Promised "${a.promisedPlayingTime}" vs ${a.actualMinutesSharePct}% mins (${a.minutesPlayed}m)`
          )
          .join(' | ')}`
      );
    }
    const govCompactLines = govLines.filter(
      (line) => !line.startsWith('Board Rating: ')
    );
    blocks.push({
      id: 'governance_promises',
      tier: 'P0',
      fullText: govLines.join('\n'),
      compactText: govCompactLines.join('\n'),
    });
  }

  // 2c. Last Match / Active FM27 Save Tactic Blueprint (Full IP/OOP Roles + Instructions + Patch 27.1.0 Audit)
  const roleOverrides = loadTacticRoleOverrides();
  const lastTactic =
    state.liveLastMatchTactic ??
    (hydratedFmSave?.decodedPayload
      ? buildLastMatchTacticBlueprint(
          hydratedFmSave.decodedPayload,
          players,
          0,
          roleOverrides,
          liveDict
        ) ?? hydratedFmSave?.lastMatchTactic
      : hydratedFmSave?.lastMatchTactic);
  if (lastTactic) {
    const tacLines: string[] = [
      `=== LAST GAME / ACTIVE SAVE TACTIC BLUEPRINT (${lastTactic.tacticName}) ===`,
      `Formations: IP ${lastTactic.inPossessionFormation} / OOP ${lastTactic.outOfPossessionFormation} | Mentality: ${lastTactic.mentality} | Style: ${lastTactic.styleName} | Patch 27.1.0 Effectiveness: ${lastTactic.tacticalEffectivenessScore}/100`,
    ];
    if (lastTactic.opponent) {
      tacLines.push(
        `Last Match: ${lastTactic.matchDate || ''} vs ${lastTactic.opponent}${lastTactic.score ? ` (${lastTactic.result || ''} ${lastTactic.score})` : ''}`.trim()
      );
    }
    const ti = lastTactic.teamInstructions;
    const ipTiList = filterMeaningfulInstructions(ti.inPossession);
    const trTiList = filterMeaningfulInstructions(ti.inTransition);
    const oopTiList = filterMeaningfulInstructions(ti.outOfPossession);
    const appendIfMissing = (list: string[], val?: string | null) => {
      if (!val) return;
      const lower = val.toLowerCase();
      if (!list.some((item) => item.toLowerCase().includes(lower))) {
        list.push(val);
      }
    };
    appendIfMissing(ipTiList, ti.passingDirectness);
    appendIfMissing(ipTiList, ti.tempo);
    appendIfMissing(ipTiList, ti.width);
    appendIfMissing(oopTiList, ti.defensiveLine);
    appendIfMissing(oopTiList, ti.lineOfEngagement);
    appendIfMissing(oopTiList, ti.pressingIntensity);
    const ipTi = ipTiList.join(', ');
    const trTi = trTiList.join(', ');
    const oopTi = oopTiList.join(', ');
    if (ipTi || trTi || oopTi) {
      tacLines.push(
        `Team Instructions -> IP[${ipTi || 'Default'}] | Trans[${trTi || 'Default'}] | OOP[${oopTi || 'Default'}]`
      );
    }
    if (lastTactic.starters.length > 0) {
      const tacKey = buildTacticOverrideKey(lastTactic.tacticName || 'Club Tactic', 0);
      const isResolvedSource = (src?: string | null): boolean =>
        src === 'confirmed' ||
        src === 'dictionary_decoded' ||
        src === 'save_decoded' ||
        src === 'fingerprint_matched';
      const starterBits = lastTactic.starters.slice(0, 11).map((s, idx) => {
        const slotIdx = s.slotIndex ?? idx;
        const slotOv = roleOverrides.bySlot?.[`${tacKey}::${slotIdx}`];
        const ipBucket = getSlotPositionBucket(s.position);
        const oopBucket = getSlotPositionBucket(s.outOfPossessionPosition || s.position);
        const ipFp =
          s.ipBinaryFingerprint && roleOverrides.byFingerprint
            ? roleOverrides.byFingerprint[`${ipBucket}::ip::${s.ipBinaryFingerprint}`]
            : undefined;
        const oopFp =
          s.oopBinaryFingerprint && roleOverrides.byFingerprint
            ? roleOverrides.byFingerprint[`${oopBucket}::oop::${s.oopBinaryFingerprint}`]
            : undefined;
        const effIp = slotOv?.ipRole || s.inPossessionRole || ipFp || s.ipRole || 'Std';
        const effOop = slotOv?.oopRole || s.outOfPossessionRole || oopFp || s.oopRole || 'Std';
        const ipResolved = Boolean(slotOv?.ipRole || ipFp) || isResolvedSource(s.ipRoleSource);
        const oopResolved = Boolean(slotOv?.oopRole || oopFp) || isResolvedSource(s.oopRoleSource);
        const ipTag = ipResolved ? '' : '~';
        const oopTag = oopResolved ? '' : '~';

        const piList = [
          ...filterMeaningfulInstructions(s.inPossessionInstructions).slice(0, 3),
          ...filterMeaningfulInstructions(s.outOfPossessionInstructions).slice(0, 3),
        ];
        const piStr = piList.length > 0 ? ` PI[${piList.join(',')}]` : '';
        const shiftStr =
          s.outOfPossessionPosition && s.outOfPossessionPosition !== s.position
            ? `${s.position}->${s.outOfPossessionPosition}`
            : s.position;
        const rtStr = s.lastMatchRating != null ? ` ${s.lastMatchRating.toFixed(1)}rt` : '';
        return `${shiftStr}:${s.playerName || 'Vacant'}(IP:${ipTag}${effIp}/OOP:${oopTag}${effOop}${rtStr}${piStr})`;
      });
      tacLines.push(`Starters Used (auto-decoded from .fm save; ~ = inferred): ${starterBits.join(' | ')}`);
    }
    if (lastTactic.substitutes.length > 0) {
      tacLines.push(
        `Matchday Subs: ${lastTactic.substitutes
          .slice(0, 7)
          .map((sub) => `${sub.playerName}(${sub.position || 'Sub'}${sub.lastMatchRating != null ? `,${sub.lastMatchRating.toFixed(1)}rt` : ''})`)
          .join(' | ')}`
      );
    }
    if (lastTactic.tacticalEffectivenessNotes.length > 0) {
      tacLines.push(`Patch 27.1.0 Audit: ${lastTactic.tacticalEffectivenessNotes.slice(0, 3).join(' | ')}`);
    }
    const tacCompactLines = tacLines.filter(
      (line) => !line.startsWith('Matchday Subs: ') && !line.startsWith('Patch 27.1.0 Audit: ')
    );
    blocks.push({
      id: 'last_tactic',
      tier: 'P0',
      fullText: tacLines.join('\n'),
      compactText: tacCompactLines.join('\n'),
    });
  }

  // 3. Exact War Room Starting XI (Unified with InteractivePitchBuilder / TacticalWarRoom)
  const warRoomSolved = solveBestXi(solverPool, {
    shape: activeShape,
    customSlots,
    excludeInjured: true,
    excludeSuspended: true,
    activeSuspensions,
    nextCompetitionName,
  });

  const fullFitSolved = solveBestXi(solverPool, {
    shape: activeShape,
    customSlots,
    excludeInjured: false,
    excludeSuspended: false,
  });

  // Apply manual Pitch Builder playerId swaps on top of warRoomSolved.startingXI
  const effectiveWarRoomXi = warRoomSolved.startingXI.map((slot) => {
    const override = customSlots?.find((c) => c.slotId === slot.slotId);
    if (!override?.playerId) return slot;
    const manualPlayer = players.find((p) => p.id === override.playerId);
    if (!manualPlayer) return slot;
    return {
      ...slot,
      player: manualPlayer,
      ipRole: override.ipRole || slot.ipRole,
      oopRole: override.oopRole || slot.oopRole,
    };
  });

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
    blocks.push({
      id: 'war_room_xi',
      tier: 'P0',
      fullText: `=== ACTIVE PITCH BUILDER LINEUP OVERRIDE (${ov.shape}${ov.applyToAnalystOnly ? ' · Analyst-Only' : ''}) ===\n${ovCompact}`,
    });
  } else if (effectiveWarRoomXi.length > 0) {
    const cbNames = effectiveWarRoomXi
      .filter((s) => s.positionGroup === 'Centre-Back' && s.player)
      .map((s) => s.player!.name)
      .join(' + ');
    const xiCompact = effectiveWarRoomXi
      .filter((s) => s.player)
      .map(
        (s) =>
          `${s.label}:${s.player!.name}(${s.combinedFitPct}%,C${s.player!.condition ?? '?'}%)`
      )
      .join(' | ');
    const header =
      activeShape === '4-3-3 DM Wide'
        ? '=== WAR ROOM COMPUTED DUAL-PHASE 4-3-3 STARTING XI ==='
        : `=== WAR ROOM COMPUTED ${activeShape} STARTING XI ===`;
    blocks.push({
      id: 'war_room_xi',
      tier: 'P0',
      fullText: `${header}\nAvgFit:${warRoomSolved.averageFitPct}% | CB Lock: ${cbNames || 'N/A'}\n${xiCompact}`,
    });
  }

  // 4. 100%-Fit Full-Strength Best XI & Rotated B-Team
  if (fullFitSolved.startingXI.some((s) => s.player)) {
    const fullXiLine = fullFitSolved.startingXI
      .filter((s) => s.player)
      .map((s) => `${s.label}:${s.player!.name}(${s.player!.ability.toFixed(1)}★,${s.combinedFitPct}%)`)
      .join(' | ');
    const bTeamLine = fullFitSolved.rotatedBTeam
      .filter((s) => s.player)
      .map((s) => `${s.label}:${s.player!.name}(${s.combinedFitPct}%)`)
      .join(' | ');
    blocks.push({
      id: 'full_fit_xi',
      tier: 'P1',
      fullText: `=== 100%-FIT FULL-STRENGTH BEST XI (${activeShape}) ===\nXI: ${fullXiLine}${
        bTeamLine ? `\nB-Team: ${bTeamLine}` : ''
      }`,
      compactText: `=== 100%-FIT FULL-STRENGTH BEST XI (${activeShape}) ===\nXI: ${fullXiLine}`,
    });
  }

  // 5. Transfers, Loans & Squad Advice Positional Depth Chart (calibrated to exact Club & League Level)
  const ls = decoded?.leagueStanding;
  const transferAudit = buildSquadTransferAudit(
    players,
    saveDate,
    {
      balanceNum:
        hydratedFmSave?.canonicalBalanceNum ?? decoded?.finances?.balance ?? null,
      wagePayrollWeekly: decoded?.finances?.wagePayrollWeekly ?? null,
      wageBudgetWeekly: decoded?.finances?.wageBudgetWeekly ?? null,
      transferBudgetRemaining: decoded?.finances?.transferBudgetRemaining ?? null,
      balanceLabel: hydratedFmSave?.balanceLabel || balance,
      wageSpendLabel: hydratedFmSave?.wageComplianceLabel || wageSpend,
      monthlyBurnRate: hydratedFmSave?.financialRunway?.monthlyBurnRate ?? null,
    },
    hydratedFmSave?.divisionBenchmarks ?? null,
    {
      competitionName:
        ls?.competitionName ??
        hydratedFmSave?.divisionBenchmarks?.competitionName ??
        hydratedFmSave?.competitionRules?.competitionName ??
        null,
      leaguePosition: ls?.position ?? null,
      totalClubs:
        ls?.totalTeams ?? hydratedFmSave?.divisionBenchmarks?.clubCount ?? null,
      points: ls?.points ?? null,
      played: ls?.played ?? null,
      competitionRules: hydratedFmSave?.competitionRules ?? null,
      transferWindowOpen:
        typeof decoded?.transferWindows?.isOpen === 'boolean'
          ? decoded.transferWindows.isOpen
          : null,
      boardObjectiveSummary:
        hydratedFmSave?.governance?.boardObjectives?.[0]?.target ?? null,
    }
  );

  const cal = transferAudit.leagueLevelCalibration;
  const loanPlan = transferAudit.loanAdvice;
  const inLoanCodes =
    loanPlan.incomingLoanPriorities.map((i) => i.bucketCode).join(',') || 'Opportunistic(0% wage)';
  const outDevNames =
    loanPlan.developmentLoansOut
      .slice(0, 4)
      .map((d) => `${d.player.name}(${d.primaryBucketCode})`)
      .join(', ') || 'None';
  const reliefNames =
    loanPlan.wageReliefLoanFallbacks
      .slice(0, 3)
      .map((w) => `${w.player.name}(£${w.player.wagePw}/wk)`)
      .join(', ') || 'None';
  const calibrationLines: string[] = [
    `=== CLUB & LEAGUE LEVEL CALIBRATION + LOAN STRATEGY ===`,
    `Level: ${cal.clubTierLabel} | ${cal.standingContextLabel} | Starter Floor: ${transferAudit.tierBenchmarks.firstTeamStarterFloor.toFixed(1)}★ (Attrs >=${cal.starterAttrBaseline}/20, Standout >=${cal.standoutAttrBaseline}/20${cal.divisionMedianWeeklyWage ? `, DivMed £${cal.divisionMedianWeeklyWage}/wk` : ''})`,
    `Loans: In[${inLoanCodes}] · OutDev[${outDevNames} — Regular Starter + Recall] · WageRelief50-100%[${reliefNames}]`,
  ];
  if (transferAudit.tierBenchmarks.divisionDeficits.length > 0) {
    calibrationLines.push(
      `Div Gaps: ${transferAudit.tierBenchmarks.divisionDeficits.slice(0, 3).join(' | ')}`
    );
  }
  blocks.push({
    id: 'league_level_and_loans',
    tier: 'P0',
    fullText: calibrationLines.join('\n'),
    compactText: calibrationLines.slice(0, 3).join('\n'),
  });

  if (transferAudit.positionalNeeds.length > 0) {
    const depthLines = transferAudit.positionalNeeds
      .filter(
        (n) =>
          n.players.length > 0 ||
          n.status === 'Need Signing' ||
          n.status === 'Promote Internal'
      )
      .map((n) => {
        const ranked = n.seniorPrimaryPlayers
          .slice(0, 3)
          .map((p, idx) => `#${idx + 1} ${p.name}(${p.ability.toFixed(1)}★,${p.age}y)`)
          .join(', ');
        const readyU21Note =
          n.firstTeamReadyYouthPlayers.length > 0
            ? ` +${n.firstTeamReadyYouthPlayers.length} ReadyU21[${n.firstTeamReadyYouthPlayers
                .slice(0, 2)
                .map((p) => `${p.name} ${p.ability.toFixed(1)}★/${p.age}y`)
                .join(', ')}]`
            : '';
        const academyNote =
          n.academyProspectPlayers.length > 0
            ? ` +${n.academyProspectPlayers.length} Academy`
            : '';
        const coverNote =
          n.secondaryCoverPlayers.length > 0
            ? ` +${n.secondaryCoverPlayers.length} cover`
            : '';
        const flag =
          n.status === 'Need Signing'
            ? 'NEED'
            : n.status === 'Promote Internal'
              ? 'PROMOTE_U21'
              : n.hasSuccessionGap
                ? 'SUCCESSION'
                : n.status === 'Overstocked'
                  ? 'OVER'
                  : 'OK';
        return `${n.code}[${flag} ${n.currentCount}Sen/${n.effectiveReadyCount}Ready vs ${n.idealMin}-${n.idealMax}${coverNote}${readyU21Note}${academyNote}]:${ranked || 'NONE'}`;
      });
    const compactDepthLines = transferAudit.positionalNeeds
      .filter(
        (n) =>
          n.status === 'Need Signing' ||
          n.status === 'Promote Internal' ||
          n.hasSuccessionGap ||
          n.status === 'Overstocked'
      )
      .map((n) => `${n.code}[${n.status} ${n.currentCount}Sen/${n.effectiveReadyCount}Ready]`);
    const depthHeader = `=== TRANSFERS & SQUAD ADVICE POSITIONAL DEPTH CHART (First-Team Floor: ${transferAudit.tierBenchmarks.firstTeamRotationFloor.toFixed(1)}★ Ready / ${transferAudit.tierBenchmarks.firstTeamStarterFloor.toFixed(1)}★ Starter) ===`;
    blocks.push({
      id: 'transfers_depth',
      tier: 'P1',
      fullText: `${depthHeader}\n${depthLines.join(' | ')}`,
      compactText:
        compactDepthLines.length > 0
          ? `${depthHeader}\n${compactDepthLines.join(' | ')}`
          : undefined,
    });
  }

  // 5b. Authoritative Transfers & Squad Advice Action Plan (exact match with Transfers -> Squad Advice tab)
  const isSurplusPlayer = (p: PlayerRecord): boolean =>
    p.status === 'Surplus' ||
    /surplus/i.test(p.contractDetails?.promisedPlayingTime || '');

  const adviceById = new Map(
    transferAudit.playerAdvice.map((a) => [a.player.id, a])
  );

  const actionPlanLines: string[] = [];
  const surplusPlayers = players.filter((p) => isSurplusPlayer(p));
  if (surplusPlayers.length > 0) {
    actionPlanLines.push(
      `IN-GAME SURPLUS TO REQUIREMENTS (Active Sale Targets — Listed in FM27, DO NOT PICK ON BENCH/XI IF COVER EXISTS): ${surplusPlayers
        .map(
          (p) =>
            `${p.name}(£${p.wagePw}/wk,${p.minutes}m,${p.goals}G/${p.xG.toFixed(2)}xG,${p.assists}A)`
        )
        .join(' | ')}`
    );
  }

  const sellList = transferAudit.playerAdvice.filter(
    (a) => a.verdict === 'Sell / Transfer List'
  );
  const appRecommendedOnlySales = sellList.filter(
    (a) => !isSurplusPlayer(a.player)
  );
  if (appRecommendedOnlySales.length > 0) {
    actionPlanLines.push(
      `APP ADVICE — Recommended to Sell (NOT Listed In-Game Yet): ${appRecommendedOnlySales
        .map((a) => {
          const youthTag = a.tags.find((t) => t.startsWith('Youth Ready: '));
          const succPart = youthTag
            ? `, promote ${youthTag.replace('Youth Ready: ', '')}`
            : '';
          return `${a.player.name}(£${a.player.wagePw}/wk,InGame:${a.player.status}${succPart})`;
        })
        .join(' | ')}`
    );
  }
  const inGameListedWithYouth = sellList.filter((a) => isSurplusPlayer(a.player));
  if (inGameListedWithYouth.length > 0) {
    actionPlanLines.push(
      `Sell / Transfer List (Already Surplus In-Game): ${inGameListedWithYouth
        .map((a) => {
          const youthTag = a.tags.find((t) => t.startsWith('Youth Ready: '));
          const succPart = youthTag
            ? `, promote ${youthTag.replace('Youth Ready: ', '')}`
            : '';
          return `${a.player.name}(£${a.player.wagePw}/wk,IN-GAME SURPLUS${succPart})`;
        })
        .join(' | ')}`
    );
  }

  const replaceList = transferAudit.playerAdvice.filter(
    (a) => a.verdict === 'Replace Before Selling'
  );
  if (replaceList.length > 0) {
    actionPlanLines.push(
      `Replace Before Selling: ${replaceList
        .map((a) => `${a.player.name}(£${a.player.wagePw}/wk)`)
        .join(' | ')}`
    );
  }

  const promoteYouthList = transferAudit.playerAdvice.filter((a) =>
    a.tags.some((t) => t.startsWith('Promote to Backup'))
  );
  if (promoteYouthList.length > 0) {
    actionPlanLines.push(
      `Promote to Backup (DO NOT LOAN OUT): ${promoteYouthList
        .map((a) => {
          const tag = a.tags.find((t) => t.startsWith('Promote to Backup'))!;
          return `${a.player.name}(${a.player.ability.toFixed(1)}★/${a.player.potential.toFixed(1)}★,£${a.player.wagePw}/wk,${tag})`;
        })
        .join(' | ')}`
    );
  }

  const protectList = transferAudit.playerAdvice.filter(
    (a) => a.verdict === 'Protect Youth Asset'
  );
  if (protectList.length > 0) {
    actionPlanLines.push(
      `Protect Youth Asset: ${protectList
        .map((a) => `${a.player.name}(exp ${a.player.expires})`)
        .join(' | ')}`
    );
  }

  const renewList = transferAudit.playerAdvice.filter(
    (a) => a.verdict === 'Renew Now'
  );
  if (renewList.length > 0) {
    actionPlanLines.push(
      `Renew Now: ${renewList
        .map((a) => `${a.player.name}(£${a.player.wagePw}/wk,exp ${a.player.expires})`)
        .join(' | ')}`
    );
  }

  const letExpireList = transferAudit.playerAdvice.filter(
    (a) => a.verdict === 'Let Expire'
  );
  if (letExpireList.length > 0) {
    actionPlanLines.push(
      `Let Expire: ${letExpireList
        .map((a) => `${a.player.name}(£${a.player.wagePw}/wk,exp ${a.player.expires})`)
        .join(' | ')}`
    );
  }

  const loanList = transferAudit.playerAdvice.filter(
    (a) => a.verdict === 'Loan Out'
  );
  if (loanList.length > 0) {
    actionPlanLines.push(
      `Loan Out (Dev Loans — Lock Regular Starter + Recall Clause): ${loanList
        .map((a) => `${a.player.name}(${a.player.age}y,${a.player.ability.toFixed(1)}★/${a.player.potential.toFixed(1)}★,${a.primaryBucketCode})`)
        .join(' | ')}`
    );
  }

  if (actionPlanLines.length > 0) {
    const essentialActionLines = actionPlanLines.filter(
      (line) =>
        line.startsWith('IN-GAME SURPLUS') ||
        line.startsWith('Promote to Backup') ||
        line.startsWith('Sell / Transfer List') ||
        line.startsWith('APP ADVICE — Recommended to Sell') ||
        line.startsWith('Renew Now:') ||
        line.startsWith('Loan Out')
    );
    const header = '=== TRANSFERS & SQUAD ADVICE ACTION PLAN (MUST MATCH TRANSFERS TAB) ===';
    blocks.push({
      id: 'transfers_action_plan',
      tier: 'P1',
      fullText: `${header}\n${actionPlanLines.join('\n')}`,
      compactText:
        essentialActionLines.length > 0
          ? `${header}\n${essentialActionLines.join('\n')}`
          : undefined,
    });
  }

  // 6. Corners & Set-Piece Specialist Rankings (exact match with Set Pieces tab)
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
    blocks.push({
      id: 'set_pieces',
      tier: 'P1',
      fullText: `=== CORNERS & SET-PIECE SPECIALIST RANKINGS ===\nAerial: ${aerialStr} | L-Foot: ${ltStr} | R-Foot: ${rtStr}`,
    });
  }

  // 6b. FM27 Squad Planner, Backroom Staff & Recruitment / Shortlist Targets
  const plannerSlots = hydratedFmSave?.squadPlanner || [];
  if (plannerSlots.length > 0) {
    const currentSeasonSlots = plannerSlots
      .filter((s) => (s.seasonOffset ?? 0) === 0 && s.playerNames.length > 0)
      .map((s) => ({ raw: s, meta: resolveSquadPlannerSlotMeta(s) }))
      .sort((a, b) => a.meta.sortOrder - b.meta.sortOrder);

    const displaySlots =
      currentSeasonSlots.length > 0
        ? currentSeasonSlots
        : plannerSlots
            .filter((s) => s.playerNames.length > 0)
            .map((s) => ({ raw: s, meta: resolveSquadPlannerSlotMeta(s) }))
            .sort((a, b) => a.meta.sortOrder - b.meta.sortOrder);

    const plannerStr = displaySlots
      .slice(0, 14)
      .map(
        ({ raw, meta }) =>
          `${meta.code}:${raw.playerNames.slice(0, 2).join('>')}`
      )
      .join(' | ');

    const nextSeasonSlots = plannerSlots.filter((s) => (s.seasonOffset ?? 0) === 1);
    const nextSeasonMap = new Map<number, number>(
      nextSeasonSlots.map((s) => [s.slot, s.playerNames.length])
    );
    const thinNextYear =
      nextSeasonMap.size > 0
        ? currentSeasonSlots
            .filter(({ raw }) => {
              const nextCnt = nextSeasonMap.get(raw.slot) ?? 0;
              return nextCnt <= 1 && nextCnt < raw.playerNames.length;
            })
            .slice(0, 6)
            .map(({ raw, meta }) => `${meta.code}(${nextSeasonMap.get(raw.slot) ?? 0} left)`)
        : [];

    blocks.push({
      id: 'squad_planner',
      tier: 'P2',
      fullText: `=== FM27 SQUAD PLANNER DEPTH (CURRENT SEASON) ===\n${plannerStr}${
        thinNextYear.length > 0 ? `\nNext Season Thin Spots (+1yr): ${thinNextYear.join(', ')}` : ''
      }`,
      compactText:
        thinNextYear.length > 0
          ? `=== FM27 SQUAD PLANNER DEPTH (CURRENT SEASON) ===\nNext Season Thin Spots (+1yr): ${thinNextYear.join(', ')}`
          : undefined,
    });
  }

  const effectiveStaff =
    staff.length > 0
      ? staff
      : (decoded?.staff || []).map((s) => ({
          id: String(s.uid),
          name: s.name,
          role: s.role,
          secondaryRole: s.secondaryRole ?? null,
          jobRatings: s.jobRatings ?? null,
          age: s.age ?? 40,
          nation: s.nation ?? '',
          wagePw: s.wagePw ?? 0,
          expires: s.expires ?? 'N/A',
          notes: '',
        }));
  if (effectiveStaff.length > 0) {
    const parseDateToUtcMs = (raw?: string | null): number | null => {
      if (!raw) return null;
      const dmy = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmy) return Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
      const iso = raw.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      return null;
    };
    const refMs = parseDateToUtcMs(saveDate);
    const expiringStaff = effectiveStaff
      .filter((st) => {
        if (!st.expires) return false;
        const expMs = parseDateToUtcMs(st.expires);
        if (refMs != null && expMs != null) {
          const monthsLeft = (expMs - refMs) / (1000 * 60 * 60 * 24 * 30.4375);
          return monthsLeft >= -1 && monthsLeft <= 12;
        }
        return false;
      })
      .slice(0, 5)
      .map((st) => `${st.name}(${st.role},exp ${st.expires})`);
    blocks.push({
      id: 'backroom_staff',
      tier: 'P2',
      fullText: `=== BACKROOM STAFF (${effectiveStaff.length}) ===\nRoles: ${effectiveStaff
        .slice(0, 8)
        .map((st) => {
          const secondary = st.secondaryRole ? `+${st.secondaryRole}` : '';
          const preferred = getPreferredJobRatings(st.jobRatings)
            .slice(0, 2)
            .map((job) => `${job.label} ${job.value}/20`)
            .join(', ');
          return `${st.role}${secondary}:${st.name}${preferred ? ` [Preferred: ${preferred}]` : ''}`;
        })
        .join(' | ')}${expiringStaff.length > 0 ? `\nExpiring Soon: ${expiringStaff.join(' | ')}` : ''}`,
      compactText:
        expiringStaff.length > 0
          ? `=== BACKROOM STAFF (${effectiveStaff.length}) ===\nExpiring Soon: ${expiringStaff.join(' | ')}`
          : undefined,
    });
  }

  const inGameShortlist: RecruitmentTarget[] = decoded?.recruitmentTargets || [];
  if (inGameShortlist.length > 0 || trackedTargets.length > 0 || recruitmentCases.length > 0) {
    const shortlistAudit = evaluateInGameShortlist({
      shortlistTargets: inGameShortlist.length > 0 ? inGameShortlist : trackedTargets,
      squadPlayers: players,
      audit: transferAudit,
      divisionBenchmarks: hydratedFmSave?.divisionBenchmarks ?? null,
      lastMatchTactic: lastTactic ?? null,
      transferBudgetRemaining: decoded?.finances?.transferBudgetRemaining ?? null,
    });
    const recLines: string[] = [
      `=== MANAGER'S IN-GAME FM27 SHORTLIST (${shortlistAudit.items.length} PLAYERS · ${shortlistAudit.actionableCount} BUDGET-READY) ===`,
    ];
    if (shortlistAudit.directUpgrades.length > 0) {
      recLines.push(
        `Direct First-Team Upgrades (Budget-Approved): ${shortlistAudit.directUpgrades
          .slice(0, 5)
          .map(
            (u) =>
              `${u.target.name}(${u.target.primaryPosition},${u.target.age}y,${u.target.currentClub || 'Free'},${u.budget.feeLabel},£${u.budget.expectedWagePw}/wk,${u.character.personalityLabel},upgrades ${u.targetIncumbent?.name || u.bucketCode} +${(u.footballDelta ?? 0).toFixed(1)},${u.bestIpRole}/${u.bestOopRole})`
          )
          .join(' | ')}`
      );
    }
    if (shortlistAudit.gapFillersNow.length > 0) {
      recLines.push(
        `Immediate Gap Fillers (Budget-Approved): ${shortlistAudit.gapFillersNow
          .slice(0, 5)
          .map(
            (g) =>
              `${g.target.name}(${g.target.primaryPosition},${g.target.age}y,${g.budget.feeLabel},£${g.budget.expectedWagePw}/wk,${g.character.personalityLabel},${g.bestIpRole} ${g.ipRoleFitPct}%)`
          )
          .join(' | ')}`
      );
    }
    if (shortlistAudit.cheaperBackups.length > 0 || shortlistAudit.futureSuccessors.length > 0) {
      const secondary = [...shortlistAudit.cheaperBackups, ...shortlistAudit.futureSuccessors].slice(0, 4);
      recLines.push(
        `Cheaper Backups & Future U23 Successors: ${secondary
          .map(
            (s) =>
              `${s.target.name}(${s.target.primaryPosition},${s.target.age}y,${s.tierLabel},${s.budget.feeLabel},£${s.budget.expectedWagePw}/wk,${s.character.personalityLabel})`
          )
          .join(' | ')}`
      );
    }
    if (shortlistAudit.budgetBlocked.length > 0) {
      recLines.push(
        `Shortlist Watch (Fee/Wage Blocked Today): ${shortlistAudit.budgetBlocked
          .slice(0, 3)
          .map((b) => `${b.target.name}(${b.target.primaryPosition},${b.target.age}y,${b.budget.budgetSummary})`)
          .join(' | ')}`
      );
    }
    if (recruitmentCases.length > 0) {
      recLines.push(
        `Active Recruitment Briefs: ${recruitmentCases
          .slice(0, 4)
          .map((c) => `${c.position}[${c.stage}]: ${c.playerName} (${c.targetIpRole})`)
          .join(' | ')}`
      );
    }
    blocks.push({
      id: 'recruitment',
      tier: 'P2',
      fullText: recLines.join('\n'),
      compactText:
        recLines.length > 2 ? [recLines[0], recLines[1]].join('\n') : undefined,
    });
  }

  // 7. Match xG Momentum Analytics & Recent 5 Matches (placed before squad profiles so form is never trimmed)
  if (matches.length > 0) {
    const { seasons, currentSeason } = extractMatchSeasons(matches, saveDate);
    const activeSeasonScope =
      currentSeason !== 'ALL' ? currentSeason : deriveFootballSeasonLabel(saveDate);
    const scopeBreakdown = summarizeMatchesByScope(
      matches,
      activeSeasonScope !== 'Unknown Season' ? activeSeasonScope : undefined
    );

    const scopeLines: string[] = [];
    if (scopeBreakdown.competitive.played > 0) {
      scopeLines.push(
        `Competitive (${activeSeasonScope} League+Cup): ${formatBucketCompactSummary(scopeBreakdown.competitive)}`
      );
    }
    if (scopeBreakdown.league.played > 0) {
      scopeLines.push(
        `League Only (${activeSeasonScope}): ${formatBucketCompactSummary(scopeBreakdown.league)}`
      );
    }
    if (scopeBreakdown.cup.played > 0) {
      scopeLines.push(
        `Cup Only (${activeSeasonScope}): ${formatBucketCompactSummary(scopeBreakdown.cup)}`
      );
    }
    if (scopeBreakdown.friendly.played > 0) {
      scopeLines.push(
        `Friendlies Only (${activeSeasonScope} — DO NOT mix into competitive form): ${formatBucketCompactSummary(scopeBreakdown.friendly)}`
      );
    }
    if (seasons.length > 1) {
      const priorSummaries = seasons
        .filter((s) => s !== activeSeasonScope)
        .slice(0, 2)
        .map((s) => {
          const b = summarizeMatchesByScope(matches, s);
          return `${s}: Comp ${b.competitive.won}W-${b.competitive.drawn}D-${b.competitive.lost}L (${b.league.played} LGE, ${b.cup.played} CUP, ${b.friendly.played} FRD)`;
        });
      if (priorSummaries.length > 0) {
        scopeLines.push(`Prior Seasons: ${priorSummaries.join(' | ')}`);
      }
    }

    const recentCompMatches = matches.filter(
      (m) => classifyMatchCompetitionBucket(m.competition) !== 'friendly'
    );
    const recentToList =
      recentCompMatches.length > 0 ? recentCompMatches.slice(0, 6) : matches.slice(0, 5);
    const matchLines = recentToList.map((m) => {
      const tag = formatCompetitionBucketTag(classifyMatchCompetitionBucket(m.competition));
      const seasonTag = deriveFootballSeasonLabel(m.date);
      const xgPart =
        m.xGFor !== null && m.xGAgainst !== null
          ? ` xG ${m.xGFor.toFixed(2)}-${m.xGAgainst.toFixed(2)}`
          : '';
      return `[${tag} ${seasonTag}] ${m.date} ${m.opponent}(${m.venue}) ${m.result} ${m.score}${xgPart}`;
    });
    const matchHeader = '=== RECENT MATCHES & XG ANALYTICS (BY SEASON & COMPETITION) ===';
    const scopeBody = scopeLines.join('\n') || `Season Record: ${summary.played}GP`;
    blocks.push({
      id: 'recent_matches',
      tier: 'P1',
      fullText: `${matchHeader}\n${scopeBody}\nRecent Results: ${matchLines.join(' | ')}`,
      compactText: `${matchHeader}\n${scopeBody}\nRecent Results: ${matchLines.slice(0, 3).join(' | ')}`,
    });
  }

  // 7b. Save-to-Save Journey Trajectory (when 2+ snapshots cached) — P0 Protected
  if (latestJourneyReport) {
    const jr = latestJourneyReport;
    const imp = jr.improved.slice(0, 4).map((i) => `${i.title}${i.deltaLabel ? ` (${i.deltaLabel})` : ''}`).join(' | ');
    const wor = jr.worsened.slice(0, 4).map((i) => `${i.title}${i.deltaLabel ? ` (${i.deltaLabel})` : ''}`).join(' | ');
    const note = jr.thingsToNote.slice(0, 3).map((i) => `${i.title}: ${i.detail}`).join(' | ');
    const fmtSigned = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
    const topDeltas = jr.playerStatDeltas
      .slice(0, 4)
      .map(
        (p) =>
          `${p.name} (${fmtSigned(p.goalsDelta)}G/${fmtSigned(p.assistsDelta)}A/${fmtSigned(p.minutesDelta)}m${
            p.ratingTo != null ? `, ${p.ratingTo.toFixed(2)}rt` : ''
          })`
      )
      .join(', ');
    const compTo = jr.competitionComparison?.to;
    const compLine = compTo
      ? `Competition Split (${jr.toSeason}): League ${formatBucketCompactSummary(compTo.league)} | Cup ${formatBucketCompactSummary(compTo.cup)} | Friendlies ${formatBucketCompactSummary(compTo.friendly)}`
      : null;
    const clubPayrollPart =
      typeof jr.baseDiff.kpiDeltas.toClubWagePayrollWeekly === 'number' &&
      jr.baseDiff.kpiDeltas.toClubWagePayrollWeekly > 0
        ? `, Club Payroll £${jr.baseDiff.kpiDeltas.toClubWagePayrollWeekly.toLocaleString()}/wk`
        : '';
    const kpiLine = `KPI Deltas: Squad ${jr.baseDiff.kpiDeltas.toSquadCount} (${jr.baseDiff.kpiDeltas.squadCountDelta >= 0 ? '+' : ''}${jr.baseDiff.kpiDeltas.squadCountDelta}), Avg ★ ${jr.baseDiff.kpiDeltas.toAvgAbility.toFixed(2)} (${jr.baseDiff.kpiDeltas.avgAbilityDelta >= 0 ? '+' : ''}${jr.baseDiff.kpiDeltas.avgAbilityDelta.toFixed(2)}★), Player Basic Wages £${jr.baseDiff.kpiDeltas.toTotalWagePw.toLocaleString()}/wk (${formatSignedCurrency(jr.baseDiff.kpiDeltas.totalWageDeltaPw)}/wk)${clubPayrollPart}, Balance ${jr.baseDiff.kpiDeltas.fromBalance || '--'} -> ${jr.baseDiff.kpiDeltas.toBalance || '--'}`;
    const journeyHeader = `=== SAVE-TO-SAVE JOURNEY REPORT (${jr.fromDate} [${jr.fromSeason}] -> ${jr.toDate} [${jr.toSeason}], ${jr.timeline.length} saves${jr.sameSeason ? '' : ' — CROSS-SEASON'}) ===`;
    blocks.push({
      id: 'journey_report',
      tier: 'P0',
      fullText: [
        journeyHeader,
        kpiLine,
        compLine,
        `Improved: ${imp || 'None'}`,
        `Worsened: ${wor || 'None'}`,
        topDeltas ? `Standout Player Deltas: ${topDeltas}` : null,
        note ? `Things to Note: ${note}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      compactText: [
        journeyHeader,
        kpiLine,
        `Improved: ${imp || 'None'} | Worsened: ${wor || 'None'}`,
        topDeltas ? `Standout Player Deltas: ${topDeltas}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  // 8. First-Team & Key Squad Profiles with FULL Season Stats, Wages, Standing, PosFam & Transfer Verdict (zero raw CA/PA)
  const formatShortExpiry = (exp: string): string => {
    const m = (exp || '').match(/(\d{1,2})\/(\d{1,2})\/20(\d{2})/);
    if (m) return `${m[2].padStart(2, '0')}/${m[3]}`;
    const iso = (exp || '').match(/20(\d{2})-(\d{2})/);
    if (iso) return `${iso[2]}/${iso[1]}`;
    return exp && exp !== 'N/A' && exp !== '--' ? exp : '-';
  };

  const queryLower = (state.userQuery || '').trim().toLowerCase();
  const isMentionedInQuery = (p: PlayerRecord): boolean => {
    if (!queryLower) return false;
    const fullLower = p.name.trim().toLowerCase();
    if (fullLower.length >= 3 && queryLower.includes(fullLower)) return true;
    const parts = fullLower.split(/\s+/).filter(Boolean);
    const surname = parts[parts.length - 1] || '';
    if (surname.length >= 4) {
      const escaped = surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(queryLower)) return true;
    }
    return false;
  };

  const sortedSquad = [...players].sort((a, b) => {
    const unitA = a.teamSlot === undefined || a.teamSlot === 0 ? 0 : 1;
    const unitB = b.teamSlot === undefined || b.teamSlot === 0 ? 0 : 1;
    const hasAction = (p: PlayerRecord) => {
      const adv = adviceById.get(p.id);
      return adv && (adv.verdict !== 'Hold' || adv.tags.some((t) => t.startsWith('Promote to Backup')))
        ? 0
        : 1;
    };
    const rank = (s: PlayerRecord['status']) =>
      s === 'Starter' ? 0 : s === 'Rotation' ? 1 : s === 'Youth' ? 2 : s === 'Surplus' ? 3 : 4;
    return (
      unitA - unitB ||
      (unitA === 1 ? hasAction(a) - hasAction(b) : 0) ||
      (b.ability || 0) - (a.ability || 0) ||
      (b.minutes || 0) - (a.minutes || 0) ||
      rank(a.status) - rank(b.status)
    );
  });

  const queriedPlayers = queryLower
    ? sortedSquad.filter((p) => isMentionedInQuery(p))
    : [];
  const xiPlayerIds = new Set(
    effectiveWarRoomXi
      .map((s) => s.player?.id)
      .filter((id): id is string => Boolean(id))
  );
  const promiseRiskNames = new Set(
    (gov?.playerPromiseAudits ?? [])
      .filter((a) => a.status === 'breached' || a.status === 'at_risk')
      .map((a) => a.playerName.toLowerCase())
  );
  const suspendedIds = new Set(
    players
      .filter((p) =>
        activeSuspensions.some(
          (b) =>
            (typeof p.uid === 'number' && b.playerUid === p.uid) ||
            (b.playerName && b.playerName.toLowerCase() === p.name.toLowerCase())
        )
      )
      .map((p) => p.id)
  );

  // Deterministic squad priority ordering:
  // 1) Explicitly queried players -> 2) Active War Room XI starters -> 3) Promised/banned/injured/surplus/promoted -> 4) Remaining squad
  const seenIds = new Set<string>();
  const orderedSquadPool: PlayerRecord[] = [];
  const pushUnique = (list: PlayerRecord[]) => {
    for (const p of list) {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        orderedSquadPool.push(p);
      }
    }
  };
  pushUnique(queriedPlayers);
  pushUnique(sortedSquad.filter((p) => xiPlayerIds.has(p.id)));
  pushUnique(
    sortedSquad.filter((p) => {
      const adv = adviceById.get(p.id);
      return (
        suspendedIds.has(p.id) ||
        p.status === 'Injured' ||
        isSurplusPlayer(p) ||
        promiseRiskNames.has(p.name.toLowerCase()) ||
        Boolean(adv?.tags.some((t) => t.startsWith('Promote to Backup')))
      );
    })
  );
  pushUnique(sortedSquad);
  const topSquad = orderedSquadPool.slice(0, 26);

  const squadLines = topSquad.map((p) => {
    const a = p.attributes;
    const pBans = activeSuspensions.filter(
      (b) =>
        (typeof p.uid === 'number' && b.playerUid === p.uid) ||
        (b.playerName && b.playerName.toLowerCase() === p.name.toLowerCase())
    );
    const blocksNext = pBans.some((b) =>
      isSuspensionActiveForCompetition(b, nextCompetitionName)
    );
    const banTag = blocksNext
      ? ' [BANNED]'
      : pBans.length > 0
        ? ' [CUP-BAN]'
        : '';
    const injTag = p.status === 'Injured' ? ' [INJ]' : '';
    const unitTag =
      p.teamSlot && p.teamSlot > 0
        ? p.squadUnit === 'U18'
          ? '[U18]'
          : p.squadUnit === 'U21'
            ? '[U21]'
            : '[RES]'
        : '';
    const standing = isSurplusPlayer(p)
      ? 'SURPLUS'
      : p.status === 'Starter'
        ? 'Start'
        : p.status === 'Rotation'
          ? 'Rot'
          : p.status === 'Youth'
            ? 'Yth'
            : p.status;
    const posFamStr = formatCompactPositionRatings(p);
    const adv = adviceById.get(p.id);
    const isPromoted = adv?.tags.some((t) => t.startsWith('Promote to Backup'));
    const shortVerdict = isPromoted
      ? '|Promote'
      : adv && adv.verdict !== 'Hold'
        ? `|${adv.verdict
            .replace(
              'Sell / Transfer List',
              isSurplusPlayer(p) ? 'InGameSurplus:Sell' : 'AppAdvice:Sell'
            )
            .replace('Replace Before Selling', 'AppAdvice:Replace')
            .replace('Protect Youth Asset', 'ProtectYth')
            .replace('Let Expire', 'LetExp')
            .replace('Renew Now', 'Renew')
            .replace('Loan Out', 'Loan')}`
        : '';
    const hasPlayed =
      (p.minutes || 0) > 0 ||
      p.rating !== null ||
      (p.goals || 0) > 0 ||
      (p.assists || 0) > 0;
    const statsStr = hasPlayed
      ? `${p.apps || '0'}/${p.minutes}m ${p.goals}G(${(p.xG || 0).toFixed(2)}xG) ${p.assists}A(${(p.xA || 0).toFixed(2)}xA) ${p.rating !== null ? `${p.rating.toFixed(2)}rt` : '-rt'}`
      : '0m';
    return `${p.name}${unitTag}|${p.position}|${p.age}y|${p.ability.toFixed(1)}★/${p.potential.toFixed(1)}★|${standing}|£${p.wagePw}/wk|${formatShortExpiry(p.expires)}|C${p.condition ?? '?'}%|${posFamStr ? `${posFamStr}|` : ''}${statsStr}|P${a.pace}S${a.stamina}J${a.jumpingReach}Pa${a.passing}F${a.finishing}T${a.tackling}D${a.decisions}W${a.workRate}${shortVerdict}${banTag}${injTag}`;
  });

  const renderSquadProfilesToFit = (availableChars: number): string => {
    const headerBase = `=== SQUAD PROFILES & SEASON STATS (${topSquad.length} OF ${players.length}) ===`;
    const fullBlock = `${headerBase}\n${squadLines.join('\n')}`;
    if (fullBlock.length <= availableChars) {
      return fullBlock;
    }
    const kept: string[] = [];
    // Reserve space for header + overflow note
    const reserve = headerBase.length + 64;
    let used = reserve;
    for (const line of squadLines) {
      const needed = line.length + (kept.length > 0 ? 1 : 0);
      if (used + needed <= availableChars) {
        kept.push(line);
        used += needed;
      } else {
        break;
      }
    }
    if (kept.length === 0 && squadLines.length > 0) {
      kept.push(squadLines[0]);
    }
    const omitted = Math.max(0, players.length - kept.length);
    const dynamicHeader = `=== SQUAD PROFILES & SEASON STATS (${kept.length} OF ${players.length}) ===`;
    return `${dynamicHeader}\n${kept.join('\n')}${
      omitted > 0 ? `\n(+${omitted} additional squad players omitted for context budget)` : ''
    }`;
  };

  blocks.push({
    id: 'squad_profiles',
    tier: 'P0',
    fullText: `=== SQUAD PROFILES & SEASON STATS (${topSquad.length} OF ${players.length}) ===\n${squadLines.join('\n')}`,
    renderToFit: renderSquadProfilesToFit,
  });

  const researchBlock = buildAiResearchContextBlock({
    clubName: clubName || 'Club',
    players: topSquad,
    includeMeta: true,
    includeDualPhase: true,
  });

  blocks.push({
    id: 'ai_research',
    tier: 'P3',
    fullText: researchBlock,
    renderToFit: (avail) =>
      avail > 180 ? researchBlock.slice(0, avail).trimEnd() : '',
  });

  return assemblePriorityBudgetedContext(blocks, MAX_LIVE_ANALYST_CONTEXT_CHARS);
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

  const normName = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

  // Resolve each update to at most ONE best-matching squad player so shared surnames never collide
  const updateByPlayerId = new Map<string, ExtendedPlayerAutoUpdate>();
  for (const u of updates) {
    if (!u.name) continue;
    const target = normName(u.name);
    if (!target) continue;

    // 1. Exact full-name match
    let matched = players.find((p) => normName(p.name) === target);

    // 2. Unique full-name containment match (only when target is >= 4 chars)
    if (!matched && target.length >= 4) {
      const containMatches = players.filter((p) => {
        const pNorm = normName(p.name);
        return pNorm.includes(target) || target.includes(pNorm);
      });
      if (containMatches.length === 1) {
        matched = containMatches[0];
      }
    }

    // 3. Unique exact surname match (surname >= 4 chars and only one player has that surname)
    if (!matched) {
      const targetParts = target.split(/\s+/).filter(Boolean);
      const targetLast = targetParts[targetParts.length - 1] || '';
      if (targetLast.length >= 4) {
        const surnameMatches = players.filter((p) => {
          const pParts = normName(p.name).split(/\s+/).filter(Boolean);
          const pLast = pParts[pParts.length - 1] || '';
          return pLast === targetLast;
        });
        if (surnameMatches.length === 1) {
          matched = surnameMatches[0];
        }
      }
    }

    if (matched) {
      updateByPlayerId.set(matched.id, u);
    }
  }

  const updatedPlayers = players.map((player) => {
    const match = updateByPlayerId.get(player.id);
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
      'Surplus',
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

/**
 * Mirrors server/config.ts MAX_CONTEXT_CHARS so client-side diagnostics catch
 * any payload that would be silently truncated by the server security guard.
 */
export const SERVER_MAX_CONTEXT_CHARS = 18_000;

export interface AnalystPayloadSectionMetric {
  header: string;
  chars: number;
  lines: number;
  pctOfLimit: number;
}

export interface AnalystRequiredFieldAudit {
  clubStanding: {
    ok: boolean;
    value: string | null;
    source: 'decoded_fm_save' | 'fallback_state' | 'missing';
    decodedExpected: string | null;
  };
  nextOpponent: {
    ok: boolean;
    value: string | null;
    competition: string | null;
    source: 'decoded_fm_save' | 'fallback_state' | 'missing';
    decodedExpected: string | null;
  };
  squadRoleFits: {
    ok: boolean;
    warRoomSectionPresent: boolean;
    warRoomFilledSlots: number;
    warRoomAvgFitPct: number | null;
    lastTacticSectionPresent: boolean;
    tacticStartersMapped: number;
    decodedIpRoles: number;
    decodedOopRoles: number;
    inferredFallbackRoles: number;
  };
  boardPromises: {
    ok: boolean;
    governanceSectionPresent: boolean;
    managerContractMapped: boolean;
    boardObjectivesCount: number;
    clubPromisesCount: number;
    playerPromiseAuditsCount: number;
    atRiskPromisesCount: number;
    boardObjectivesInPayload: boolean;
    clubPromisesInPayload: boolean;
    playingTimeAuditInPayload: boolean;
  };
}

export interface AnalystRequestDiagnosticsMeta {
  message?: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  images?: unknown[];
  importedFileContext?: string;
  reasoningMode?: AnalystReasoningMode | string;
  nextEventNumber?: number;
  currentSaveDate?: string;
  clubName?: string;
  /** Pass pre-built context string to avoid recomputing when already generated */
  liveAppContextOverride?: string;
}

export interface AnalystPayloadDiagnosticsReport {
  timestamp: string;
  clubName: string;
  saveDate: string;
  hasDecodedFmSave: boolean;
  limits: {
    liveContextChars: number;
    liveContextMaxChars: number;
    serverMaxChars: number;
    liveUtilizationPct: number;
    serverUtilizationPct: number;
    withinLiveLimit: boolean;
    withinServerLimit: boolean;
    wasTrimmed: boolean;
    importedFileContextChars: number;
    importedWithinServerLimit: boolean;
    historyTurns: number;
    historyChars: number;
    messageChars: number;
    imageCount: number;
    totalJsonPayloadChars: number;
  };
  sections: AnalystPayloadSectionMetric[];
  requiredData: AnalystRequiredFieldAudit;
  privacyAudit: {
    zeroRawCaPa: boolean;
    flaggedTokens: string[];
  };
  warnings: string[];
  passed: boolean;
  exactPayloadStructure: {
    endpoint: string;
    message: string;
    history: Array<{ role: 'user' | 'assistant'; chars: number }>;
    imageCount: number;
    importedFileContextChars: number;
    liveAppContextChars: number;
    reasoningMode?: string;
    nextEventNumber?: number;
    currentSaveDate?: string;
    clubName?: string;
    liveAppContext: string;
  };
}

export interface AnalystDiagnosticsLogger {
  groupCollapsed?: (...args: unknown[]) => void;
  groupEnd?: () => void;
  table?: (tabularData: unknown) => void;
  log?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

function parseContextSections(liveAppContext: string): AnalystPayloadSectionMetric[] {
  if (!liveAppContext.trim()) return [];
  const headerRegex = /^===\s*(.+?)\s*===$/gm;
  const matches: Array<{ header: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(liveAppContext)) !== null) {
    matches.push({ header: m[1].trim(), index: m.index });
  }
  if (matches.length === 0) {
    return [
      {
        header: 'UNSECTIONED',
        chars: liveAppContext.length,
        lines: liveAppContext.split('\n').length,
        pctOfLimit: Number(
          ((liveAppContext.length / MAX_LIVE_ANALYST_CONTEXT_CHARS) * 100).toFixed(1)
        ),
      },
    ];
  }

  return matches.map((entry, idx) => {
    const start = entry.index;
    const end = idx + 1 < matches.length ? matches[idx + 1].index : liveAppContext.length;
    const chunk = liveAppContext.slice(start, end).trim();
    return {
      header: entry.header,
      chars: chunk.length,
      lines: chunk.split('\n').length,
      pctOfLimit: Number(
        ((chunk.length / MAX_LIVE_ANALYST_CONTEXT_CHARS) * 100).toFixed(1)
      ),
    };
  });
}

/**
 * Inspects the exact payload structure sent to the AI Tactical Analyst:
 * - Verifies liveAppContext & importedFileContext stay within client & server char limits
 * - Breaks down every section's character budget
 * - Audits required .fm save mappings (club standing, next opponent, squad role fits, board promises)
 * - Verifies zero raw CA/PA integers leak into the prompt payload
 */
export function diagnoseTacticalAnalystPayload(
  state: LiveAnalystStateInput,
  requestMeta: AnalystRequestDiagnosticsMeta = {}
): AnalystPayloadDiagnosticsReport {
  const liveAppContext =
    requestMeta.liveAppContextOverride ?? buildLiveTacticalAnalystContext(state);
  const decoded = state.hydratedFmSave?.decodedPayload ?? null;
  const hasDecodedFmSave = Boolean(decoded);
  const effectiveClub =
    requestMeta.clubName ||
    decoded?.meta?.clubName ||
    (state.clubName && state.clubName !== '--' ? state.clubName : 'Unknown Club');
  const effectiveDate =
    requestMeta.currentSaveDate ||
    state.saveDate ||
    decoded?.meta?.gameDateDmy ||
    '--';

  const message = requestMeta.message ?? state.userQuery ?? '';
  const history = requestMeta.history ?? [];
  const images = requestMeta.images ?? [];
  const importedFileContext = requestMeta.importedFileContext ?? '';

  const liveContextChars = liveAppContext.length;
  const importedFileContextChars = importedFileContext.length;
  const historyChars = history.reduce((sum, h) => sum + (h.text?.length ?? 0), 0);
  const messageChars = message.length;
  const wasTrimmed = liveAppContext.includes('[Context trimmed]');
  const withinLiveLimit = liveContextChars <= MAX_LIVE_ANALYST_CONTEXT_CHARS;
  const withinServerLimit = liveContextChars <= SERVER_MAX_CONTEXT_CHARS;
  const importedWithinServerLimit = importedFileContextChars <= SERVER_MAX_CONTEXT_CHARS;

  const estimatedRequestJson = JSON.stringify({
    message,
    history,
    imageCount: images.length,
    importedFileContext: importedFileContext || undefined,
    liveAppContext,
    reasoningMode: requestMeta.reasoningMode,
    nextEventNumber: requestMeta.nextEventNumber,
    currentSaveDate: effectiveDate,
    clubName: effectiveClub,
  });

  const sections = parseContextSections(liveAppContext);
  const warnings: string[] = [];

  // 1. Character Limit Checks
  if (!withinLiveLimit) {
    warnings.push(
      `liveAppContext (${liveContextChars} chars) exceeds MAX_LIVE_ANALYST_CONTEXT_CHARS (${MAX_LIVE_ANALYST_CONTEXT_CHARS}).`
    );
  }
  if (!withinServerLimit) {
    warnings.push(
      `liveAppContext (${liveContextChars} chars) exceeds SERVER_MAX_CONTEXT_CHARS (${SERVER_MAX_CONTEXT_CHARS}) and will be truncated by the server guard.`
    );
  }
  if (wasTrimmed) {
    warnings.push(
      `liveAppContext hit the ${MAX_LIVE_ANALYST_CONTEXT_CHARS}-char ceiling and was trimmed — verify tail sections (Squad Profiles / Journey Report) were not cut.`
    );
  }
  if (!importedWithinServerLimit) {
    warnings.push(
      `importedFileContext (${importedFileContextChars} chars) exceeds SERVER_MAX_CONTEXT_CHARS (${SERVER_MAX_CONTEXT_CHARS}) and will be truncated server-side.`
    );
  }

  // 2. Club Standing Audit
  const standingMatch = liveAppContext.match(/^Standing:\s*(.+)$/m);
  const standingValue = standingMatch ? standingMatch[1].trim() : null;
  const decodedStanding = decoded?.leagueStanding ?? null;
  const decodedStandingExpected =
    decodedStanding && typeof decodedStanding.position === 'number'
      ? `#${decodedStanding.position} (${decodedStanding.points} pts, ${decodedStanding.played} GP)`
      : state.hydratedFmSave?.leagueRecordLabel || null;
  const standingMeaningful =
    Boolean(standingValue) &&
    standingValue !== '--' &&
    standingValue !== '-- · --' &&
    !standingValue!.startsWith('0GP (0W-0D-0L, 0Pts) · --');
  const standingMatchesDecoded =
    !decodedStanding ||
    !standingValue ||
    standingValue.includes(`#${decodedStanding.position}`) ||
    standingValue.includes(`${decodedStanding.points}pts`) ||
    standingValue.includes(`${decodedStanding.points}Pts`) ||
    standingValue.includes(`${decodedStanding.points} pts`);
  const standingOk =
    Boolean(standingValue) &&
    (standingMeaningful || !hasDecodedFmSave) &&
    standingMatchesDecoded;
  if (hasDecodedFmSave && !standingOk) {
    warnings.push(
      `Club standing mapping issue: emitted "${standingValue ?? 'MISSING'}" (expected from decoded save: ${decodedStandingExpected ?? 'standing data'}).`
    );
  }

  // 3. Next Opponent Audit
  const nextMatch = liveAppContext.match(/^Next:\s*(.+)$/m);
  const nextValue = nextMatch ? nextMatch[1].trim() : null;
  const decodedNextFixture = decoded?.upcomingFixtures?.[0] ?? null;
  const decodedNextOpponent = decodedNextFixture?.opponent ?? null;
  const nextCompetition = decodedNextFixture?.competition ?? null;
  const nextHasOpponent =
    Boolean(nextValue) &&
    nextValue !== '--' &&
    !/^awaiting/i.test(nextValue!) &&
    !/^tbd$/i.test(nextValue!);
  const nextMatchesDecoded =
    !decodedNextOpponent ||
    (Boolean(nextValue) &&
      nextValue!.toLowerCase().includes(decodedNextOpponent.toLowerCase()));
  const nextOk =
    (!decodedNextOpponent && nextHasOpponent) ||
    (Boolean(decodedNextOpponent) && nextMatchesDecoded) ||
    (!hasDecodedFmSave && state.players.length === 0);
  if (decodedNextOpponent && !nextMatchesDecoded) {
    warnings.push(
      `Next opponent "${decodedNextOpponent}" from decoded .fm save is missing from LIVE CLUB SNAPSHOT ("Next: ${nextValue ?? 'MISSING'}").`
    );
  } else if (hasDecodedFmSave && !nextHasOpponent && decoded?.upcomingFixtures && decoded.upcomingFixtures.length > 0) {
    warnings.push(
      `Next fixture was present in decoded save but not mapped into LIVE CLUB SNAPSHOT.`
    );
  }

  // 4. Squad Role Fits Audit (War Room XI + Last-Match Decoded IP/OOP Blueprint)
  const warRoomHeaderIdx = liveAppContext.search(
    /^=== (?:WAR ROOM COMPUTED .+? STARTING XI|ACTIVE PITCH BUILDER LINEUP OVERRIDE .+?) ===$/m
  );
  const warRoomSectionPresent = warRoomHeaderIdx >= 0;
  let warRoomBody = '';
  if (warRoomHeaderIdx >= 0) {
    const afterHeader = liveAppContext.slice(warRoomHeaderIdx);
    const firstNewline = afterHeader.indexOf('\n');
    if (firstNewline >= 0) {
      const rest = afterHeader.slice(firstNewline + 1);
      const nextSectionIdx = rest.search(/\n\n===/);
      warRoomBody = nextSectionIdx >= 0 ? rest.slice(0, nextSectionIdx) : rest;
    }
  }
  const avgFitMatch = warRoomBody.match(/AvgFit:\s*(\d+)%/);
  const warRoomAvgFitPct = avgFitMatch ? Number(avgFitMatch[1]) : null;
  const warRoomBodyLines = warRoomBody
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const warRoomXiLine =
    warRoomBodyLines.find((l) => !l.startsWith('AvgFit:') && l.includes(':')) ?? '';
  const warRoomSlots = warRoomXiLine
    ? warRoomXiLine.split(' | ').filter((s) => s.trim().length > 0)
    : [];
  const warRoomFilledSlots = warRoomSlots.filter((s) => !/:OPEN\(/.test(s)).length;

  const lastTacticSectionPresent = liveAppContext.includes(
    '=== LAST GAME / ACTIVE SAVE TACTIC BLUEPRINT'
  );
  const startersUsedLine =
    liveAppContext.match(/^Starters Used .+?:\s*(.+)$/m)?.[1] ?? '';
  const starterRoleTokens = Array.from(
    startersUsedLine.matchAll(/\(IP:([^/]+)\/OOP:([^)\s]+(?:\s+[^)\s]+)*?)(?:\s+\d+\.\d+rt|\s+PI\[|\))/g)
  );
  let decodedIpRoles = 0;
  let decodedOopRoles = 0;
  let inferredFallbackRoles = 0;
  for (const tok of starterRoleTokens) {
    const ipRaw = (tok[1] || '').trim();
    const oopRaw = (tok[2] || '').trim();
    if (ipRaw.startsWith('~')) inferredFallbackRoles += 1;
    else if (ipRaw && ipRaw !== 'Std') decodedIpRoles += 1;
    if (oopRaw.startsWith('~')) inferredFallbackRoles += 1;
    else if (oopRaw && oopRaw !== 'Std') decodedOopRoles += 1;
  }

  const expectedTacticInSave = Boolean(
    (decoded?.tactics && decoded.tactics.length > 0) ||
      state.hydratedFmSave?.lastMatchTactic ||
      state.liveLastMatchTactic
  );
  const squadRoleFitsOk =
    state.players.length === 0 ||
    (warRoomSectionPresent &&
      warRoomFilledSlots >= Math.min(11, state.players.length) &&
      (!expectedTacticInSave || lastTacticSectionPresent));
  if (state.players.length > 0 && !warRoomSectionPresent) {
    warnings.push('WAR ROOM COMPUTED DUAL-PHASE XI section is missing from liveAppContext.');
  }
  if (state.players.length >= 11 && warRoomFilledSlots < 11) {
    warnings.push(
      `Only ${warRoomFilledSlots}/11 War Room XI role-fit slots were filled despite ${state.players.length} squad players.`
    );
  }
  if (expectedTacticInSave && !lastTacticSectionPresent) {
    warnings.push(
      'Decoded .fm save contains a club tactic, but LAST GAME / ACTIVE SAVE TACTIC BLUEPRINT is missing from liveAppContext.'
    );
  }

  // 5. Board Promises & Governance Audit
  const liveDict = loadFm27BinaryDictionary();
  const gov =
    state.liveGovernance ??
    (decoded
      ? buildClubGovernanceState(decoded, state.players, liveDict)
      : state.hydratedFmSave?.governance ?? null);
  const governanceSectionPresent = liveAppContext.includes(
    '=== CLUB GOVERNANCE, MANAGER CONTRACT, BOARD TARGETS & PROMISES ==='
  );
  const managerContractMapped =
    /^Manager Contract:\s*(?!.*not exposed)/m.test(liveAppContext);
  const boardObjectivesCount = gov?.boardObjectives.length ?? 0;
  const clubPromisesCount = gov?.clubPromises.length ?? 0;
  const playerPromiseAuditsCount = gov?.playerPromiseAudits.length ?? 0;
  const expectedPromiseAuditsInPayloadCount =
    gov?.playerPromiseAudits.filter(
      (a) =>
        a.status === 'breached' ||
        a.status === 'at_risk' ||
        a.status === 'on_track'
    ).length ?? 0;
  const atRiskPromisesCount =
    gov?.playerPromiseAudits.filter(
      (a) => a.status === 'breached' || a.status === 'at_risk'
    ).length ?? 0;
  const boardObjectivesInPayload = /^Board Objectives:/m.test(liveAppContext);
  const clubPromisesInPayload = /^Active Club\/Manager Promises:/m.test(liveAppContext);
  const playingTimeAuditInPayload = /^Squad Playing-Time Promise Audit/m.test(liveAppContext);

  const boardPromisesOk =
    !gov ||
    (governanceSectionPresent &&
      (boardObjectivesCount === 0 || boardObjectivesInPayload) &&
      (clubPromisesCount === 0 || clubPromisesInPayload) &&
      (expectedPromiseAuditsInPayloadCount === 0 || playingTimeAuditInPayload));

  if (gov && !governanceSectionPresent) {
    warnings.push(
      'CLUB GOVERNANCE, MANAGER CONTRACT, BOARD TARGETS & PROMISES section is missing from liveAppContext.'
    );
  }
  if (boardObjectivesCount > 0 && !boardObjectivesInPayload) {
    warnings.push(
      `${boardObjectivesCount} decoded board objective(s) did not map into liveAppContext.`
    );
  }
  if (clubPromisesCount > 0 && !clubPromisesInPayload) {
    warnings.push(
      `${clubPromisesCount} decoded club/manager promise(s) did not map into liveAppContext.`
    );
  }
  if (expectedPromiseAuditsInPayloadCount > 0 && !playingTimeAuditInPayload) {
    warnings.push(
      `${expectedPromiseAuditsInPayloadCount} squad playing-time promise audit(s) did not map into liveAppContext.`
    );
  }

  // 6. Zero Raw CA/PA Leak Check
  const rawCaPaMatches = Array.from(
    liveAppContext.matchAll(/\b(?:CA|PA)\s*[:=]\s*\d+\b/gi)
  ).map((hit) => hit[0]);
  const zeroRawCaPa = rawCaPaMatches.length === 0;
  if (!zeroRawCaPa) {
    warnings.push(
      `Privacy policy breach: raw numeric CA/PA token(s) detected in liveAppContext: ${rawCaPaMatches.join(', ')}`
    );
  }

  return {
    timestamp: new Date().toISOString(),
    clubName: effectiveClub,
    saveDate: effectiveDate,
    hasDecodedFmSave,
    limits: {
      liveContextChars,
      liveContextMaxChars: MAX_LIVE_ANALYST_CONTEXT_CHARS,
      serverMaxChars: SERVER_MAX_CONTEXT_CHARS,
      liveUtilizationPct: Number(
        ((liveContextChars / MAX_LIVE_ANALYST_CONTEXT_CHARS) * 100).toFixed(1)
      ),
      serverUtilizationPct: Number(
        ((liveContextChars / SERVER_MAX_CONTEXT_CHARS) * 100).toFixed(1)
      ),
      withinLiveLimit,
      withinServerLimit,
      wasTrimmed,
      importedFileContextChars,
      importedWithinServerLimit,
      historyTurns: history.length,
      historyChars,
      messageChars,
      imageCount: images.length,
      totalJsonPayloadChars: estimatedRequestJson.length,
    },
    sections,
    requiredData: {
      clubStanding: {
        ok: standingOk,
        value: standingValue,
        source: decodedStanding
          ? 'decoded_fm_save'
          : standingMeaningful
            ? 'fallback_state'
            : 'missing',
        decodedExpected: decodedStandingExpected,
      },
      nextOpponent: {
        ok: nextOk,
        value: nextValue,
        competition: nextCompetition,
        source: decodedNextOpponent
          ? 'decoded_fm_save'
          : nextHasOpponent
            ? 'fallback_state'
            : 'missing',
        decodedExpected: decodedNextOpponent,
      },
      squadRoleFits: {
        ok: squadRoleFitsOk,
        warRoomSectionPresent,
        warRoomFilledSlots,
        warRoomAvgFitPct,
        lastTacticSectionPresent,
        tacticStartersMapped: starterRoleTokens.length,
        decodedIpRoles,
        decodedOopRoles,
        inferredFallbackRoles,
      },
      boardPromises: {
        ok: boardPromisesOk,
        governanceSectionPresent,
        managerContractMapped,
        boardObjectivesCount,
        clubPromisesCount,
        playerPromiseAuditsCount,
        atRiskPromisesCount,
        boardObjectivesInPayload,
        clubPromisesInPayload,
        playingTimeAuditInPayload,
      },
    },
    privacyAudit: {
      zeroRawCaPa,
      flaggedTokens: rawCaPaMatches,
    },
    warnings,
    passed: warnings.length === 0,
    exactPayloadStructure: {
      endpoint: '/api/fm27/tactical-chat',
      message,
      history: history.map((h) => ({
        role: h.role,
        chars: h.text?.length ?? 0,
      })),
      imageCount: images.length,
      importedFileContextChars,
      liveAppContextChars: liveContextChars,
      reasoningMode: requestMeta.reasoningMode,
      nextEventNumber: requestMeta.nextEventNumber,
      currentSaveDate: effectiveDate,
      clubName: effectiveClub,
      liveAppContext,
    },
  };
}

/**
 * Runs `diagnoseTacticalAnalystPayload` and logs a structured, collapsible
 * payload audit to the developer console (and saves the latest report to
 * `globalThis.__FM27_LAST_ANALYST_DIAGNOSTICS__` for inspection).
 */
export function logTacticalAnalystPayloadDiagnostics(
  state: LiveAnalystStateInput,
  requestMeta: AnalystRequestDiagnosticsMeta = {},
  logger: AnalystDiagnosticsLogger = console
): AnalystPayloadDiagnosticsReport {
  const report = diagnoseTacticalAnalystPayload(state, requestMeta);

  try {
    (globalThis as Record<string, unknown>).__FM27_LAST_ANALYST_DIAGNOSTICS__ =
      report;
  } catch {
    // Non-writable globalThis in strict sandboxes — safe to ignore
  }

  const badge = report.passed ? 'PASS' : `WARN (${report.warnings.length})`;
  const title = `[FM27 Analyst Payload Diagnostics] ${badge} | ${report.clubName} (${report.saveDate}) | ${report.limits.liveContextChars.toLocaleString()}/${report.limits.liveContextMaxChars.toLocaleString()} chars (${report.limits.liveUtilizationPct}%) | Server Cap ${report.limits.serverUtilizationPct}%`;

  logger.groupCollapsed?.(title);

  logger.table?.({
    liveAppContext: {
      chars: report.limits.liveContextChars,
      limit: report.limits.liveContextMaxChars,
      serverCap: report.limits.serverMaxChars,
      status:
        report.limits.withinLiveLimit &&
        report.limits.withinServerLimit &&
        !report.limits.wasTrimmed
          ? 'OK'
          : 'EXCEEDED / TRIMMED',
    },
    importedFileContext: {
      chars: report.limits.importedFileContextChars,
      limit: report.limits.serverMaxChars,
      serverCap: report.limits.serverMaxChars,
      status: report.limits.importedWithinServerLimit ? 'OK' : 'EXCEEDED',
    },
    chatMessageAndHistory: {
      chars: report.limits.messageChars + report.limits.historyChars,
      limit: `${report.limits.historyTurns} turns`,
      serverCap: `${report.limits.imageCount} img(s)`,
      status: `Total JSON ${report.limits.totalJsonPayloadChars.toLocaleString()} chars`,
    },
  });

  logger.table?.(
    report.sections.map((s) => ({
      section: s.header,
      chars: s.chars,
      lines: s.lines,
      pctOfLimit: `${s.pctOfLimit}%`,
    }))
  );

  logger.table?.({
    clubStanding: {
      ok: report.requiredData.clubStanding.ok,
      source: report.requiredData.clubStanding.source,
      mappedValue: report.requiredData.clubStanding.value ?? 'MISSING',
    },
    nextOpponent: {
      ok: report.requiredData.nextOpponent.ok,
      source: report.requiredData.nextOpponent.source,
      mappedValue: report.requiredData.nextOpponent.value ?? 'MISSING',
    },
    squadRoleFits: {
      ok: report.requiredData.squadRoleFits.ok,
      source: report.requiredData.squadRoleFits.lastTacticSectionPresent
        ? 'war_room + decoded_tactic'
        : 'war_room_only',
      mappedValue: `${report.requiredData.squadRoleFits.warRoomFilledSlots}/11 XI (Fit ${report.requiredData.squadRoleFits.warRoomAvgFitPct ?? '--'}/100) · Decoded IP:${report.requiredData.squadRoleFits.decodedIpRoles} OOP:${report.requiredData.squadRoleFits.decodedOopRoles} Inferred:${report.requiredData.squadRoleFits.inferredFallbackRoles}`,
    },
    boardPromises: {
      ok: report.requiredData.boardPromises.ok,
      source: report.requiredData.boardPromises.governanceSectionPresent
        ? 'decoded_governance'
        : 'not_loaded',
      mappedValue: `Obj:${report.requiredData.boardPromises.boardObjectivesCount} Promises:${report.requiredData.boardPromises.clubPromisesCount} PlayingTime:${report.requiredData.boardPromises.playerPromiseAuditsCount} (${report.requiredData.boardPromises.atRiskPromisesCount} at-risk)`,
    },
    zeroRawCaPa: {
      ok: report.privacyAudit.zeroRawCaPa,
      source: 'privacy_guard',
      mappedValue: report.privacyAudit.zeroRawCaPa
        ? 'Clean (0 raw CA/PA)'
        : report.privacyAudit.flaggedTokens.join(', '),
    },
  });

  if (report.warnings.length > 0) {
    for (const w of report.warnings) {
      logger.warn?.(`[FM27 Analyst Diagnostics Warning] ${w}`);
    }
  }

  const preFlight = validatePreFlightAnalystPayload(report);
  if (!preFlight.valid && preFlight.warningMessage) {
    logger.warn?.(`[FM27 Pre-Flight Payload Validator] ${preFlight.warningMessage}`);
  }

  logger.log?.('Exact AI Request Payload Structure:', report.exactPayloadStructure);
  logger.groupEnd?.();

  return report;
}

export type PreFlightRequiredFieldKey =
  | 'clubStanding'
  | 'nextOpponent'
  | 'squadRoleFits'
  | 'boardPromises';

export interface PreFlightAnalystPayload {
  clubStanding?: unknown;
  nextOpponent?: unknown;
  squadRoleFits?: unknown;
  boardPromises?: unknown;
}

export interface PreFlightFieldCheck {
  key: PreFlightRequiredFieldKey;
  label: string;
  present: boolean;
  detail: string;
  /** Informational fields are shown for context and never block the sync status. */
  informational?: boolean;
}

export interface PreFlightPayloadValidationResult {
  valid: boolean;
  checkedAt: string;
  missingFields: PreFlightRequiredFieldKey[];
  missingLabels: string[];
  fields: Record<PreFlightRequiredFieldKey, PreFlightFieldCheck>;
  warningTitle: string | null;
  warningMessage: string | null;
  needsReimport: boolean;
}

const PREFLIGHT_FIELD_LABELS: Record<PreFlightRequiredFieldKey, string> = {
  clubStanding: 'Club Standing',
  nextOpponent: 'Next Opponent',
  squadRoleFits: 'Squad Role Fits',
  boardPromises: 'Board Promises',
};

/**
 * Core fields whose genuine extraction failure requires a save re-import.
 * `boardPromises` is intentionally excluded: FM27 builds that do not expose
 * board/promise data are a normal, valid state, not a failed extraction.
 */
export const CORE_PREFLIGHT_REQUIRED_KEYS: PreFlightRequiredFieldKey[] = [
  'clubStanding',
  'nextOpponent',
  'squadRoleFits',
];

export const INFORMATIONAL_PREFLIGHT_KEYS: PreFlightRequiredFieldKey[] = [
  'boardPromises',
];

const PREFLIGHT_REQUIRED_KEYS: PreFlightRequiredFieldKey[] = [
  ...CORE_PREFLIGHT_REQUIRED_KEYS,
  ...INFORMATIONAL_PREFLIGHT_KEYS,
];

export const BOARD_PROMISES_NONE_LABEL =
  'None active / not exposed in this FM27 build';

function isDiagnosticsReport(
  input: PreFlightAnalystPayload | AnalystPayloadDiagnosticsReport
): input is AnalystPayloadDiagnosticsReport {
  return (
    typeof input === 'object' &&
    input !== null &&
    'requiredData' in input &&
    typeof (input as AnalystPayloadDiagnosticsReport).requiredData === 'object' &&
    (input as AnalystPayloadDiagnosticsReport).requiredData !== null &&
    'exactPayloadStructure' in input
  );
}

function isPlaceholderString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed === '--' || trimmed === '-- · --') return true;
  if (/^(?:missing|null|undefined|n\/a|tbd|unknown)$/i.test(trimmed)) return true;
  if (/^awaiting\b/i.test(trimmed)) return true;
  return false;
}

function isPresentPayloadValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return !isPlaceholderString(value);
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if ('ok' in rec && typeof rec.ok === 'boolean' && !rec.ok) return false;
    return Object.keys(rec).length > 0;
  }
  return false;
}

/**
 * Extracts the 4 pre-flight required fields (`clubStanding`, `nextOpponent`,
 * `squadRoleFits`, `boardPromises`) from a diagnostics report, returning `null`
 * for any field that failed extraction or is missing from the decoded save payload.
 */
export function extractPreFlightPayloadFields(
  report: AnalystPayloadDiagnosticsReport
): Record<PreFlightRequiredFieldKey, unknown> {
  const { clubStanding, nextOpponent, squadRoleFits, boardPromises } =
    report.requiredData;

  const standingPayload =
    clubStanding.ok &&
    clubStanding.value &&
    clubStanding.source !== 'missing' &&
    !isPlaceholderString(clubStanding.value)
      ? clubStanding.value
      : null;

  const nextOpponentPayload =
    nextOpponent.ok &&
    nextOpponent.value &&
    nextOpponent.source !== 'missing' &&
    !isPlaceholderString(nextOpponent.value)
      ? {
          opponent: nextOpponent.decodedExpected ?? nextOpponent.value,
          label: nextOpponent.value,
          competition: nextOpponent.competition,
          source: nextOpponent.source,
        }
      : null;

  const squadRoleFitsPayload =
    squadRoleFits.ok &&
    squadRoleFits.warRoomSectionPresent &&
    squadRoleFits.warRoomFilledSlots > 0
      ? {
          warRoomFilledSlots: squadRoleFits.warRoomFilledSlots,
          warRoomAvgFitPct: squadRoleFits.warRoomAvgFitPct,
          lastTacticSectionPresent: squadRoleFits.lastTacticSectionPresent,
          tacticStartersMapped: squadRoleFits.tacticStartersMapped,
          decodedIpRoles: squadRoleFits.decodedIpRoles,
          decodedOopRoles: squadRoleFits.decodedOopRoles,
        }
      : null;

  const hasExtractedBoardOrPromiseData =
    boardPromises.boardObjectivesCount > 0 ||
    boardPromises.clubPromisesCount > 0 ||
    boardPromises.playerPromiseAuditsCount > 0;

  const boardPromisesPayload =
    boardPromises.ok &&
    boardPromises.governanceSectionPresent &&
    hasExtractedBoardOrPromiseData
      ? {
          boardObjectivesCount: boardPromises.boardObjectivesCount,
          clubPromisesCount: boardPromises.clubPromisesCount,
          playerPromiseAuditsCount: boardPromises.playerPromiseAuditsCount,
          atRiskPromisesCount: boardPromises.atRiskPromisesCount,
        }
      : null;

  return {
    clubStanding: standingPayload,
    nextOpponent: nextOpponentPayload,
    squadRoleFits: squadRoleFitsPayload,
    boardPromises: boardPromisesPayload,
  };
}

function summarizePresentField(
  key: PreFlightRequiredFieldKey,
  value: unknown
): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (typeof value === 'object' && value !== null) {
    const rec = value as Record<string, unknown>;
    if (key === 'nextOpponent' && typeof rec.label === 'string') {
      return rec.label;
    }
    if (key === 'squadRoleFits' && typeof rec.warRoomFilledSlots === 'number') {
      const fitStr =
        typeof rec.warRoomAvgFitPct === 'number'
          ? ` · ${rec.warRoomAvgFitPct}% avg fit`
          : '';
      return `${rec.warRoomFilledSlots}/11 XI slots mapped${fitStr}`;
    }
    if (key === 'boardPromises') {
      const obj = Number(rec.boardObjectivesCount ?? 0);
      const prm = Number(rec.clubPromisesCount ?? 0);
      const aud = Number(rec.playerPromiseAuditsCount ?? 0);
      if (obj || prm || aud) {
        return `${obj} targets · ${prm} club promises · ${aud} playing-time audits`;
      }
      return BOARD_PROMISES_NONE_LABEL;
    }
  }
  return 'Extracted';
}

/**
 * Pre-flight payload validator that verifies the presence (non-missing, non-null)
 * of the core fields `clubStanding`, `nextOpponent`, and `squadRoleFits`.
 * `boardPromises` is reported for context only and never triggers a re-import.
 * Accepts either a direct pre-flight payload object or an `AnalystPayloadDiagnosticsReport`.
 * When a core field is missing or null, returns `valid: false`, `needsReimport: true`,
 * and a clear warning message for the UI's Sync status area.
 */
export function validatePreFlightAnalystPayload(
  payload: PreFlightAnalystPayload | AnalystPayloadDiagnosticsReport | null | undefined
): PreFlightPayloadValidationResult {
  const normalized: Record<PreFlightRequiredFieldKey, unknown> =
    !payload
      ? {
          clubStanding: null,
          nextOpponent: null,
          squadRoleFits: null,
          boardPromises: null,
        }
      : isDiagnosticsReport(payload)
        ? extractPreFlightPayloadFields(payload)
        : {
            clubStanding: payload.clubStanding ?? null,
            nextOpponent: payload.nextOpponent ?? null,
            squadRoleFits: payload.squadRoleFits ?? null,
            boardPromises: payload.boardPromises ?? null,
          };

  const fields = {} as Record<PreFlightRequiredFieldKey, PreFlightFieldCheck>;
  const missingFields: PreFlightRequiredFieldKey[] = [];
  const missingLabels: string[] = [];

  for (const key of PREFLIGHT_REQUIRED_KEYS) {
    const value = normalized[key];
    const present = isPresentPayloadValue(value);
    const label = PREFLIGHT_FIELD_LABELS[key];
    const informational = INFORMATIONAL_PREFLIGHT_KEYS.includes(key);
    fields[key] = {
      key,
      label,
      present,
      informational,
      detail: present
        ? summarizePresentField(key, value)
        : informational
          ? BOARD_PROMISES_NONE_LABEL
          : 'Missing or failed extraction',
    };
    if (!present && !informational) {
      missingFields.push(key);
      missingLabels.push(label);
    }
  }

  const valid = missingFields.length === 0;
  const warningTitle = valid
    ? null
    : 'Save Data Failed Extraction — Re-import Required';
  const warningMessage = valid
    ? null
    : `Pre-flight check found missing save data (${missingLabels.join(', ')}). Certain save data failed extraction from your .fm file and needs re-importing for accurate Tactical Analyst advice.`;

  return {
    valid,
    checkedAt: new Date().toISOString(),
    missingFields,
    missingLabels,
    fields,
    warningTitle,
    warningMessage,
    needsReimport: !valid,
  };
}

/**
 * Runs diagnostics and pre-flight validation in a single pass against live app state.
 */
export function runPreFlightAnalystValidation(
  state: LiveAnalystStateInput,
  requestMeta: AnalystRequestDiagnosticsMeta = {},
  options: {
    logToConsole?: boolean;
    logger?: AnalystDiagnosticsLogger;
  } = {}
): {
  diagnostics: AnalystPayloadDiagnosticsReport;
  payload: Record<PreFlightRequiredFieldKey, unknown>;
  validation: PreFlightPayloadValidationResult;
} {
  const diagnostics = options.logToConsole
    ? logTacticalAnalystPayloadDiagnostics(state, requestMeta, options.logger)
    : diagnoseTacticalAnalystPayload(state, requestMeta);
  const payload = extractPreFlightPayloadFields(diagnostics);
  const validation = validatePreFlightAnalystPayload(payload);
  return { diagnostics, payload, validation };
}


