import {
  MatchLogEntry,
  ChronicleEvent,
  DoubleGwTrackerRow,
  SyncBlockOutput,
  PlayerRecord,
  SetPieceRoutine,
  TrainingSessionDay,
} from '../types/fm27';
export { computeCompetitiveSummary } from './competitiveSummary';

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
 * Generates deterministic, guardrail-enforced copy-paste prompts for
 * Gemini in Google Docs and Gemini in Google Sheets, plus raw TSV rows.
 */
export function buildDocAndSheetSyncPrompts(
  match: MatchLogEntry,
  chronicle: ChronicleEvent,
  topBannerDate: string,
  clubName = 'Managed Club'
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
    `${match.competition}: ${clubName} vs ${match.opponent} (${match.venue}) (${match.date})`,
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
1. DO NOT delete, overwrite, summarize, or alter any existing text.
2. Insert this entry directly ABOVE the anchor tag "[INSERT NEXT CHRONOLOGICAL EVENT HERE]" (after Event #${chronicle.eventNumber - 1}).
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
- Fixture & Date: ${match.competition}: ${clubName} vs ${match.opponent} (${match.venue}) (${match.date})
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

export interface DynamicStarterSlot {
  slotCode:
    | 'GK'
    | 'RB'
    | 'RCB'
    | 'LCB'
    | 'LB'
    | 'DM'
    | 'LCM'
    | 'RCM'
    | 'RW'
    | 'LW'
    | 'ST';
  player: PlayerRecord;
  ipRole: string;
  oopRole: string;
  plannedMinutes: number;
  subOffFor: string | null;
  rationale: string;
}

export interface DynamicSubInstruction {
  windowLabel: string;
  minute: number;
  slotCode: string;
  playerOff: string;
  playerOn: string;
  reason: string;
}

export interface DynamicLoadAuditRow {
  playerId: string;
  playerName: string;
  slotLabel: string;
  stamina: number;
  condition: number | null;
  sharpness: number | null;
  seasonMinutes: number;
  plannedNextMatchMinutes: number;
  projectedDoubleGwMinutes: number;
  capLimit: number;
  passedCap: boolean;
  rolePlan: string;
}

export interface DynamicTacticalPlan {
  startingXI: DynamicStarterSlot[];
  bench: PlayerRecord[];
  subPlan: DynamicSubInstruction[];
  loadRows: DynamicLoadAuditRow[];
  cbPairNames: string;
}

function getPosRating(
  pr: Record<string, number>,
  ...keys: string[]
): number {
  const lowerMap: Record<string, number> = {};
  for (const [k, v] of Object.entries(pr)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      lowerMap[k.toLowerCase()] = v;
    }
  }
  let best = 0;
  for (const key of keys) {
    const val = lowerMap[key.toLowerCase()];
    if (typeof val === 'number' && val > best) {
      best = val;
    }
  }
  return best;
}

function getSlotSuitability(
  p: PlayerRecord,
  slot: DynamicStarterSlot['slotCode']
): number {
  const pr = p.positionRatings;
  const pos = (p.position || '').toUpperCase();

  if (pr && Object.values(pr).some((v) => typeof v === 'number' && v > 1)) {
    switch (slot) {
      case 'GK':
        return getPosRating(pr, 'gk') || 1;
      case 'RB':
        return Math.max(getPosRating(pr, 'dr', 'rb'), getPosRating(pr, 'wbr')) || 1;
      case 'RCB':
      case 'LCB':
        return getPosRating(pr, 'dc', 'cb') || 1;
      case 'LB':
        return Math.max(getPosRating(pr, 'dl', 'lb'), getPosRating(pr, 'wbl')) || 1;
      case 'DM':
        return Math.max(
          getPosRating(pr, 'dm'),
          Math.max(1, getPosRating(pr, 'mc', 'cm') - 3)
        );
      case 'LCM':
        return Math.max(
          getPosRating(pr, 'mc', 'cm'),
          Math.max(1, getPosRating(pr, 'dm') - 2),
          Math.max(1, getPosRating(pr, 'amc', 'am') - 2)
        );
      case 'RCM':
        return Math.max(
          getPosRating(pr, 'mc', 'cm'),
          Math.max(1, getPosRating(pr, 'amc', 'am') - 6)
        ) || 1;
      case 'RW':
        return Math.max(
          getPosRating(pr, 'amr', 'rw'),
          getPosRating(pr, 'mr'),
          Math.max(1, getPosRating(pr, 'st', 'stc') - 4)
        );
      case 'LW':
        return Math.max(
          getPosRating(pr, 'aml', 'lw'),
          getPosRating(pr, 'ml'),
          Math.max(1, getPosRating(pr, 'st', 'stc') - 4)
        );
      case 'ST': {
        const stRating = getPosRating(pr, 'st', 'stc', 'cf');
        if (stRating > 0) return stRating;
        if (pos.includes('ST') || pos.includes('CF')) return 19;
        return Math.max(
          1,
          getPosRating(pr, 'amr', 'rw') - 4,
          getPosRating(pr, 'aml', 'lw') - 4
        );
      }
    }
  }

  // Fallback string parsing when positionRatings object is absent
  const isGk = pos.includes('GK');
  if (slot === 'GK') return isGk ? 20 : 1;
  if (isGk) return 1;

  switch (slot) {
    case 'RB':
      return /\b(D|WB)\s*\([RLC]*R[RLC]*\)|DR|WBR/.test(pos)
        ? 19
        : pos.includes('D')
          ? 11
          : 4;
    case 'RCB':
    case 'LCB':
      return /\bD\s*\([RLC]*C[RLC]*\)|DC|CB/.test(pos)
        ? 19
        : pos.includes('DM')
          ? 12
          : 4;
    case 'LB':
      return /\b(D|WB)\s*\([RLC]*L[RLC]*\)|DL|WBL/.test(pos)
        ? 19
        : pos.includes('D')
          ? 11
          : 4;
    case 'DM':
      return pos.includes('DM') ? 19 : /\bM\s*\([RLC]*C/.test(pos) ? 14 : 4;
    case 'LCM':
      return /\bM\s*\([RLC]*C|MC/.test(pos)
        ? 19
        : pos.includes('DM') || pos.includes('AM')
          ? 14
          : 4;
    case 'RCM':
      return /\b(M|AM)\s*\([RLC]*C|MC|AMC/.test(pos) ? 19 : 5;
    case 'RW':
      return /\b(M|AM)\s*\([RLC]*R|AMR|MR|RW/.test(pos)
        ? 19
        : pos.includes('ST') || pos.includes('AM')
          ? 13
          : 4;
    case 'LW':
      return /\b(M|AM|WB)\s*\([RLC]*L|AML|ML|LW/.test(pos)
        ? 19
        : pos.includes('ST') || pos.includes('AM')
          ? 13
          : 4;
    case 'ST':
      return pos.includes('ST')
        ? 19
        : pos.includes('AM')
          ? 13
          : 4;
  }
}

function scorePlayerForSlot(
  p: PlayerRecord,
  slot: DynamicStarterSlot['slotCode']
): number {
  const suit = getSlotSuitability(p, slot);
  if (slot === 'GK' && suit < 12) return -999;
  if (slot !== 'GK' && getSlotSuitability(p, 'GK') >= 18 && suit < 12) {
    return -999;
  }

  const a = p.attributes;
  const starScore = (p.ability * 25 || 60) * 0.45;
  const minsBonus = Math.min(12, (p.minutes || 0) / 45);
  const condPenalty =
    typeof p.condition === 'number' && p.condition < 75
      ? (75 - p.condition) * 0.8
      : 0;
  const injuryPenalty = p.status === 'Injured' ? 60 : 0;

  let attrScore = 0;
  switch (slot) {
    case 'GK':
      attrScore =
        (a.decisions || 10) * 1.5 +
        (a.jumpingReach || 10) * 1.3 +
        (a.passing || 10) * 0.8;
      break;
    case 'RB':
    case 'LB':
      attrScore =
        (a.pace || 10) * 1.5 +
        (a.acceleration || 10) * 1.5 +
        (a.tackling || 10) * 1.3 +
        (a.stamina || 10) * 1.1 +
        (a.workRate || 10) * 1.0;
      break;
    case 'RCB':
      attrScore =
        (a.jumpingReach || 10) * 1.5 +
        (a.tackling || 10) * 1.4 +
        (a.passing || 10) * 1.2 +
        (a.pace || 10) * 1.1 +
        (a.positioning || a.decisions || 10) * 1.1;
      break;
    case 'LCB':
      attrScore =
        (a.jumpingReach || 10) * 1.7 +
        (a.heading || a.tackling || 10) * 1.4 +
        (a.tackling || 10) * 1.4 +
        (a.pace || 10) * 1.1;
      break;
    case 'DM':
      attrScore =
        (a.tackling || 10) * 1.6 +
        (a.decisions || 10) * 1.4 +
        (a.firstTouch || 10) * 1.2 +
        (a.workRate || 10) * 1.2 +
        (a.passing || 10) * 1.1;
      break;
    case 'LCM':
      attrScore =
        (a.passing || 10) * 1.5 +
        (a.firstTouch || 10) * 1.4 +
        (a.decisions || 10) * 1.3 +
        (a.workRate || 10) * 1.2 +
        (a.stamina || 10) * 1.1;
      break;
    case 'RCM':
      attrScore =
        (a.passing || 10) * 1.4 +
        (a.firstTouch || 10) * 1.5 +
        (a.offTheBall || 10) * 1.3 +
        (a.decisions || 10) * 1.2 +
        (a.finishing || 10) * 1.0;
      break;
    case 'RW':
    case 'LW':
      attrScore =
        (a.pace || 10) * 1.6 +
        (a.acceleration || 10) * 1.6 +
        (a.offTheBall || 10) * 1.3 +
        (a.firstTouch || 10) * 1.2 +
        (a.finishing || 10) * 1.1;
      break;
    case 'ST':
      attrScore =
        (a.finishing || 10) * 1.7 +
        (a.offTheBall || 10) * 1.4 +
        (a.pace || 10) * 1.4 +
        (a.acceleration || 10) * 1.3 +
        (a.jumpingReach || 10) * 1.2;
      break;
  }

  const familiarityTierBonus =
    suit >= 18
      ? 160
      : suit >= 15
        ? 110
        : suit >= 12
          ? 45
          : -140;

  return (
    familiarityTierBonus +
    suit * 6.5 +
    starScore +
    attrScore +
    minsBonus -
    condPenalty -
    injuryPenalty
  );
}

/**
 * Dynamically builds the recommended Dual-Phase 4-3-3 Starting XI, IP/OOP roles,
 * Bench replacements, 62m/75m substitution plan, and 180-minute Double-GW load tracker
 * strictly from the imported squad's actual positions and attributes.
 */
export function buildDynamicTacticalPlan(
  players: PlayerRecord[]
): DynamicTacticalPlan {
  if (!players || players.length === 0) {
    return {
      startingXI: [],
      bench: [],
      subPlan: [],
      loadRows: [],
      cbPairNames: '--',
    };
  }

  const slotsOrder: Array<{
    code: DynamicStarterSlot['slotCode'];
    ipRole: string;
    oopRole: string;
  }> = [
    {
      code: 'GK',
      ipRole: 'No-Nonsense GK (NGK)',
      oopRole: 'Goalkeeper (GK)',
    },
    {
      code: 'LCB',
      ipRole: 'Centre-Back (CB)',
      oopRole: 'Centre-Back (CB)',
    },
    {
      code: 'RCB',
      ipRole: 'Ball-Playing CB (BCB)',
      oopRole: 'Centre-Back (CB)',
    },
    {
      code: 'RB',
      ipRole: 'Full-Back (FB)',
      oopRole: 'Full-Back (FB)',
    },
    {
      code: 'LB',
      ipRole: 'Full-Back (FB)',
      oopRole: 'Full-Back (FB)',
    },
    {
      code: 'DM',
      ipRole: 'Defensive Midfielder (DM)',
      oopRole: 'Defensive Midfielder (DM)',
    },
    {
      code: 'LCM',
      ipRole: 'Central Midfielder (CM)',
      oopRole: 'Central Midfielder (CM)',
    },
    {
      code: 'RCM',
      ipRole: 'Attacking Midfielder (AM)',
      oopRole: 'Wide Central Midfielder (WCM)',
    },
    {
      code: 'RW',
      ipRole: 'Winger (W)',
      oopRole: 'Tracking Winger (TW)',
    },
    {
      code: 'LW',
      ipRole: 'Inside Forward (IF)',
      oopRole: 'Tracking Winger (TW)',
    },
    {
      code: 'ST',
      ipRole: 'Channel Forward',
      oopRole: 'Central Outlet Centre Forward',
    },
  ];

  const pickedIds = new Set<string>();
  const pickedBySlot = new Map<
    DynamicStarterSlot['slotCode'],
    DynamicStarterSlot
  >();

  for (const s of slotsOrder) {
    const candidates = players
      .filter((p) => !pickedIds.has(p.id))
      .sort(
        (a, b) => scorePlayerForSlot(b, s.code) - scorePlayerForSlot(a, s.code)
      );

    const best = candidates[0];
    if (!best) continue;
    const runnerUp = candidates[1];
    pickedIds.add(best.id);

    const a = best.attributes;
    const bestSuit = getSlotSuitability(best, s.code);
    const famLabel =
      bestSuit >= 18
        ? 'Natural'
        : bestSuit >= 15
          ? 'Accomplished'
          : bestSuit >= 12
            ? 'Competent'
            : 'Cover';
    const starLabel = `${best.ability.toFixed(1)}★`;
    const statLabel =
      best.minutes > 0
        ? `${best.minutes}m (${best.apps} apps${best.rating ? `, ${best.rating.toFixed(2)} rat` : ''})`
        : 'Fresh legs';

    let specificAttrNote = `Pac ${a.pace}, Acc ${a.acceleration}, Sta ${a.stamina}`;
    if (s.code === 'LCB' || s.code === 'RCB') {
      specificAttrNote = `JR ${a.jumpingReach}, Tck ${a.tackling}, Pas ${a.passing} · Full 90m Dual-CB Lock`;
    } else if (s.code === 'RW' || s.code === 'LW') {
      specificAttrNote = `Pac ${a.pace}, Acc ${a.acceleration}, Sta ${a.stamina} · Tracking Winger OOP flank lock`;
    } else if (s.code === 'DM' || s.code === 'LCM' || s.code === 'RCM') {
      specificAttrNote = `Pas ${a.passing}, Fir ${a.firstTouch}, Dec ${a.decisions}, Tck ${a.tackling}, Sta ${a.stamina}`;
    } else if (s.code === 'ST') {
      specificAttrNote = `Fin ${a.finishing}, OtB ${a.offTheBall}, Pac ${a.pace}, JR ${a.jumpingReach}`;
    }

    const whyParts: string[] = [`${famLabel} (${bestSuit}/20) at ${s.code}`];
    if (runnerUp) {
      const rSuit = getSlotSuitability(runnerUp, s.code);
      const bestCond = typeof best.condition === 'number' ? best.condition : null;
      const runCond =
        typeof runnerUp.condition === 'number' ? runnerUp.condition : null;
      if (bestSuit - rSuit >= 3) {
        whyParts.push(`ahead of ${runnerUp.name} (${rSuit}/20 fit)`);
      } else if (bestCond !== null && runCond !== null && bestCond - runCond >= 8) {
        whyParts.push(`fresher than ${runnerUp.name} (${bestCond}% vs ${runCond}%)`);
      } else {
        whyParts.push(`edges ${runnerUp.name} on role attributes & form`);
      }
    }

    pickedBySlot.set(s.code, {
      slotCode: s.code,
      player: best,
      ipRole: s.ipRole,
      oopRole: s.oopRole,
      plannedMinutes: 90,
      subOffFor: null,
      rationale: `Why: ${whyParts.join(', ')} · ${starLabel} · ${specificAttrNote} · ${statLabel}`,
    });
  }

  const displayOrder: DynamicStarterSlot['slotCode'][] = [
    'GK',
    'RB',
    'RCB',
    'LCB',
    'LB',
    'DM',
    'LCM',
    'RCM',
    'RW',
    'LW',
    'ST',
  ];

  const startingXI: DynamicStarterSlot[] = displayOrder
    .map((code) => pickedBySlot.get(code))
    .filter((item): item is DynamicStarterSlot => Boolean(item));

  const remainingBenchPool = players.filter(
    (p) => !pickedIds.has(p.id) && p.status !== 'Injured'
  );

  // Build 2-window substitution plan strictly from actual Stamina & Condition
  // Rule #1: Never sub off GK, LCB, or RCB (Dual CB Continuity Rule)
  const subEligibleStarters = startingXI
    .filter((s) => !['GK', 'LCB', 'RCB'].includes(s.slotCode))
    .sort((a, b) => {
      const staDiff =
        (a.player.attributes.stamina || 10) -
        (b.player.attributes.stamina || 10);
      if (staDiff !== 0) return staDiff;
      return (a.player.condition ?? 100) - (b.player.condition ?? 100);
    });

  const usedSubIds = new Set<string>();
  const subPlan: DynamicSubInstruction[] = [];

  // Window 1 (62m): Top 3 lowest-stamina outfield starters (excluding CBs)
  const window1Targets = subEligibleStarters.slice(0, 3);
  for (const target of window1Targets) {
    const bestSub = [...remainingBenchPool]
      .filter((p) => !usedSubIds.has(p.id))
      .sort(
        (a, b) =>
          scorePlayerForSlot(b, target.slotCode) -
          scorePlayerForSlot(a, target.slotCode)
      )[0];
    if (!bestSub) continue;
    usedSubIds.add(bestSub.id);
    target.plannedMinutes = 62;
    target.subOffFor = bestSub.name;
    subPlan.push({
      windowLabel: "Window 1 (62' — 3 Fatigue Subs)",
      minute: 62,
      slotCode: target.slotCode,
      playerOff: target.player.name,
      playerOn: bestSub.name,
      reason: `Protect ${target.player.name} (Stamina ${target.player.attributes.stamina}${target.player.condition ? `, Cond ${target.player.condition}%` : ''}) -> bring on fresh ${bestSub.name} (Pac ${bestSub.attributes.pace}, Acc ${bestSub.attributes.acceleration}) for final 28m.`,
    });
  }

  // Window 2 (75m): Next 2 outfield starters (usually ST / CM closer) while keeping 3-man midfield intact
  const window2Targets = subEligibleStarters.slice(3, 5);
  for (const target of window2Targets) {
    const bestSub = [...remainingBenchPool]
      .filter((p) => !usedSubIds.has(p.id))
      .sort(
        (a, b) =>
          scorePlayerForSlot(b, target.slotCode) -
          scorePlayerForSlot(a, target.slotCode)
      )[0];
    if (!bestSub) continue;
    usedSubIds.add(bestSub.id);
    target.plannedMinutes = 75;
    target.subOffFor = bestSub.name;
    subPlan.push({
      windowLabel: "Window 2 (75' — 2 Closer Subs)",
      minute: 75,
      slotCode: target.slotCode,
      playerOff: target.player.name,
      playerOn: bestSub.name,
      reason: `Fresh late-game closer at ${target.slotCode} (3-man midfield stays intact per Playbook v2.0 Section 5).`,
    });
  }

  const bench = [
    ...remainingBenchPool.filter((p) => usedSubIds.has(p.id)),
    ...remainingBenchPool.filter((p) => !usedSubIds.has(p.id)),
  ].slice(0, 9);

  // Build Double-GW Load Tracker rows for the 8 rotated outfield starters + their 5 planned subs
  const loadRows: DynamicLoadAuditRow[] = [];
  for (const starter of startingXI) {
    if (starter.slotCode === 'GK') continue;
    const sta = starter.player.attributes.stamina || 10;
    const isAnchorOrHighStamina =
      starter.slotCode === 'LCB' ||
      starter.slotCode === 'RCB' ||
      sta >= 13;
    const capLimit = isAnchorOrHighStamina ? 180 : 125;
    const nextMatchMins = starter.plannedMinutes;
    const match2Mins =
      starter.plannedMinutes === 62
        ? 62
        : starter.plannedMinutes === 75
          ? 45
          : isAnchorOrHighStamina
            ? 90
            : 30;
    const projectedDoubleGwMinutes = nextMatchMins + match2Mins;

    loadRows.push({
      playerId: starter.player.id,
      playerName: `${starter.player.name} (${starter.slotCode})`,
      slotLabel: starter.slotCode,
      stamina: sta,
      condition: starter.player.condition ?? null,
      sharpness: starter.player.sharpness ?? null,
      seasonMinutes: starter.player.minutes,
      plannedNextMatchMinutes: nextMatchMins,
      projectedDoubleGwMinutes,
      capLimit,
      passedCap: projectedDoubleGwMinutes <= capLimit,
      rolePlan: starter.subOffFor
        ? `Start ${starter.plannedMinutes}m -> sub off for ${starter.subOffFor}`
        : 'Full 90m Anchor (Dual-CB Continuity)',
    });
  }

  const lcbName = pickedBySlot.get('LCB')?.player.name;
  const rcbName = pickedBySlot.get('RCB')?.player.name;
  const cbPairNames =
    lcbName && rcbName
      ? `${lcbName} & ${rcbName}`
      : lcbName || rcbName || '--';

  return {
    startingXI,
    bench,
    subPlan,
    loadRows,
    cbPairNames,
  };
}

export interface DynamicSetPieceSummary {
  routines: SetPieceRoutine[];
  aerialThreats: Array<{
    rank: number;
    name: string;
    position: string;
    jumpingReach: number;
    heading: number;
    aerialScore: number;
  }>;
  leftFootTakers: Array<{
    name: string;
    foot: string;
    corners: number;
    crossing: number;
    technique: number;
  }>;
  rightFootTakers: Array<{
    name: string;
    foot: string;
    corners: number;
    crossing: number;
    technique: number;
  }>;
  recoveryDefenders: Array<{
    name: string;
    pace: number;
    acceleration: number;
    tackling: number;
  }>;
}

/**
 * Dynamically ranks Set-Piece Aerial Threats (Jumping Reach + Heading),
 * Left/Right-footed Corner Takers, and Recovery Defenders strictly from the imported squad.
 */
export function buildDynamicSetPieceRoutines(
  players: PlayerRecord[]
): DynamicSetPieceSummary {
  if (!players || players.length === 0) {
    return {
      routines: [],
      aerialThreats: [],
      leftFootTakers: [],
      rightFootTakers: [],
      recoveryDefenders: [],
    };
  }

  const isSurplusPlayer = (p: PlayerRecord) =>
    p.status === 'Surplus' ||
    /surplus/i.test(p.contractDetails?.promisedPlayingTime || '');

  const nonSurplusOutfield = players.filter(
    (p) =>
      getSlotSuitability(p, 'GK') < 15 &&
      p.status !== 'Injured' &&
      !isSurplusPlayer(p)
  );
  const firstTeamActiveOutfield = nonSurplusOutfield.filter(
    (p) => p.teamSlot === undefined || p.teamSlot === 0
  );
  const allOutfield = players.filter(
    (p) => getSlotSuitability(p, 'GK') < 15 && p.status !== 'Injured'
  );
  const pool =
    firstTeamActiveOutfield.length >= 6
      ? firstTeamActiveOutfield
      : nonSurplusOutfield.length >= 6
        ? nonSurplusOutfield
        : allOutfield.length >= 6
          ? allOutfield
          : players;

  // 1. Aerial Threats ranked by Jumping Reach + Heading
  const sortedAerial = [...pool].sort((a, b) => {
    const scoreB =
      (b.attributes.jumpingReach || 10) * 1.6 +
      (b.attributes.heading || 10) * 1.2 +
      (b.minutes > 0 ? 2 : 0);
    const scoreA =
      (a.attributes.jumpingReach || 10) * 1.6 +
      (a.attributes.heading || 10) * 1.2 +
      (a.minutes > 0 ? 2 : 0);
    return scoreB - scoreA;
  });

  const aerialThreats = sortedAerial.slice(0, 6).map((p, idx) => ({
    rank: idx + 1,
    name: p.name,
    position: p.position,
    jumpingReach: p.attributes.jumpingReach || 10,
    heading: p.attributes.heading || 10,
    aerialScore:
      (p.attributes.jumpingReach || 10) + (p.attributes.heading || 10),
  }));

  // 2. Corner Takers split by Left vs Right foot
  const takerScore = (p: PlayerRecord) =>
    (p.attributes.corners || 10) * 1.5 +
    (p.attributes.crossing || 10) * 1.3 +
    (p.attributes.technique || 10) * 1.1 +
    (p.attributes.passing || 10) * 0.9;

  const isLeftFoot = (p: PlayerRecord) => {
    const pf = (p.preferredFoot || '').toLowerCase();
    return (
      pf.includes('left') ||
      pf === 'either' ||
      (typeof p.leftFoot === 'number' &&
        p.leftFoot >= 15 &&
        p.leftFoot >= (p.rightFoot || 0)) ||
      (!pf && /\([RLC]*L[RLC]*\)|DL|WBL|ML|AML/.test(p.position))
    );
  };

  const leftCandidates = [...pool]
    .filter((p) => isLeftFoot(p))
    .sort((a, b) => takerScore(b) - takerScore(a));

  const rightCandidates = [...pool]
    .filter(
      (p) =>
        !(p.preferredFoot || '').toLowerCase().startsWith('left') ||
        (typeof p.rightFoot === 'number' && p.rightFoot >= 15)
    )
    .sort((a, b) => takerScore(b) - takerScore(a));

  const allTakersSorted = [...pool].sort(
    (a, b) => takerScore(b) - takerScore(a)
  );

  const leftFootTakers = (
    leftCandidates.length > 0 ? leftCandidates : allTakersSorted
  )
    .slice(0, 3)
    .map((p) => ({
      name: p.name,
      foot: p.preferredFoot || 'Left/Either',
      corners: p.attributes.corners || 10,
      crossing: p.attributes.crossing || 10,
      technique: p.attributes.technique || 10,
    }));

  const rightFootTakers = (
    rightCandidates.length > 0 ? rightCandidates : allTakersSorted
  )
    .slice(0, 3)
    .map((p) => ({
      name: p.name,
      foot: p.preferredFoot || 'Right',
      corners: p.attributes.corners || 10,
      crossing: p.attributes.crossing || 10,
      technique: p.attributes.technique || 10,
    }));

  // 3. Recovery Defenders (exclude top 3 aerial threats so A1-A3 stay in the box)
  const top3AerialIds = new Set(sortedAerial.slice(0, 3).map((p) => p.id));
  const sortedRecovery = [...pool]
    .filter((p) => !top3AerialIds.has(p.id))
    .sort((a, b) => {
      const scoreB =
        (b.attributes.pace || 10) * 1.5 +
        (b.attributes.acceleration || 10) * 1.5 +
        (b.attributes.tackling || 10) * 1.2 +
        (b.attributes.decisions || 10) * 1.0;
      const scoreA =
        (a.attributes.pace || 10) * 1.5 +
        (a.attributes.acceleration || 10) * 1.5 +
        (a.attributes.tackling || 10) * 1.2 +
        (a.attributes.decisions || 10) * 1.0;
      return scoreB - scoreA;
    });

  const recoveryDefenders = sortedRecovery.slice(0, 4).map((p) => ({
    name: p.name,
    pace: p.attributes.pace || 10,
    acceleration: p.attributes.acceleration || 10,
    tackling: p.attributes.tackling || 10,
  }));

  // 4. Creators / Box Threats from remaining players
  const recIds = new Set(sortedRecovery.slice(0, 2).map((p) => p.id));
  const creators = [...pool]
    .filter((p) => !top3AerialIds.has(p.id) && !recIds.has(p.id))
    .sort((a, b) => {
      const scoreB =
        (b.attributes.firstTouch || 10) +
        (b.attributes.passing || 10) +
        (b.attributes.finishing || 10) +
        (b.attributes.offTheBall || 10);
      const scoreA =
        (a.attributes.firstTouch || 10) +
        (a.attributes.passing || 10) +
        (a.attributes.finishing || 10) +
        (a.attributes.offTheBall || 10);
      return scoreB - scoreA;
    });

  const a1 = sortedAerial[0] || pool[0];
  const a2 = sortedAerial[1] || a1;
  const a3 = sortedAerial[2] || a2;
  const d1 = sortedRecovery[0] || pool[0];
  const d2 = sortedRecovery[1] || d1;
  const d3 = sortedRecovery[2] || creators[2] || d2;
  const c1 = creators[0] || pool[0];
  const c2 = creators[1] || c1;
  const b1 = creators[2] || c1;

  const rTaker = rightFootTakers[0];
  const lTaker = leftFootTakers[0];

  const leftSideTakerStr = rTaker
    ? `${rTaker.name} (R-Foot: Cor ${rTaker.corners}, Cro ${rTaker.crossing}, Tec ${rTaker.technique})`
    : 'Best Right-Footed Taker';
  const rightSideTakerStr = lTaker
    ? `${lTaker.name} (L-Foot: Cor ${lTaker.corners}, Cro ${lTaker.crossing}, Tec ${lTaker.technique})`
    : 'Best Left-Footed Taker';

  const routines: SetPieceRoutine[] = [
    {
      id: 'routine-2-centre',
      name: 'Attacking Corners — Routine 2 (Primary Active)',
      delivery: 'Inswinger · Aim For Centre',
      leftTaker: leftSideTakerStr,
      rightTaker: rightSideTakerStr,
      assignments: [
        {
          code: 'A1',
          role: 'Aerial Threat 1',
          player: `${a1.name} (JR ${a1.attributes.jumpingReach}, Hdr ${a1.attributes.heading ?? 10})`,
          instruction: 'Attack Near Post',
        },
        {
          code: 'A2',
          role: 'Aerial Threat 2',
          player: `${a2.name} (JR ${a2.attributes.jumpingReach}, Hdr ${a2.attributes.heading ?? 10})`,
          instruction: 'Mark Keeper',
        },
        {
          code: 'A3',
          role: 'Aerial Threat 3',
          player: `${a3.name} (JR ${a3.attributes.jumpingReach}, Hdr ${a3.attributes.heading ?? 10})`,
          instruction: 'Attack Far Post',
        },
        {
          code: 'B1',
          role: 'Box Threat 1',
          player: `${b1.name} (Fin ${b1.attributes.finishing}, OtB ${b1.attributes.offTheBall})`,
          instruction: 'Attack Ball from Edge of Area',
        },
        {
          code: 'C1',
          role: 'Creator 1',
          player: `${c1.name} (Fir ${c1.attributes.firstTouch}, Pas ${c1.attributes.passing})`,
          instruction: 'Lurk Outside Area (Near Side)',
        },
        {
          code: 'C2',
          role: 'Creator 2',
          player: `${c2.name} (Fin ${c2.attributes.finishing}, Pas ${c2.attributes.passing})`,
          instruction: 'Lurk Outside Area (Far Side)',
        },
        {
          code: 'D1',
          role: 'Recovery Def 1',
          player: `${d1.name} (Pac ${d1.attributes.pace}, Acc ${d1.attributes.acceleration})`,
          instruction: 'Stay Back',
        },
        {
          code: 'D2',
          role: 'Recovery Def 2',
          player: `${d2.name} (Pac ${d2.attributes.pace}, Acc ${d2.attributes.acceleration})`,
          instruction: 'Stay Back',
        },
        {
          code: 'D3',
          role: 'Recovery Def 3',
          player: `${d3.name} (Dec ${d3.attributes.decisions}, Tck ${d3.attributes.tackling})`,
          instruction: 'Lurk Outside Area (Centre)',
        },
      ],
      auditNote: `Auto-built from imported squad: separates top 3 aerial threats (${a1.name}, ${a2.name}, ${a3.name}) across Near Post, Mark Keeper, and Far Post, backed by a 3-man counter-press wall on the 18-yard arc.`,
    },
    {
      id: 'routine-1-far',
      name: 'Attacking Corners — Routine 1 (Back-Post Isolation)',
      delivery: 'Inswinger · Aim For Far Post',
      leftTaker: leftSideTakerStr,
      rightTaker: rightSideTakerStr,
      assignments: [
        {
          code: 'A1',
          role: 'Aerial Threat 1',
          player: `${a1.name} (JR ${a1.attributes.jumpingReach})`,
          instruction: 'Attack Far Post (1v1 Isolation)',
        },
        {
          code: 'A2',
          role: 'Aerial Threat 2',
          player: `${a2.name} (JR ${a2.attributes.jumpingReach})`,
          instruction: 'Attack Near Post',
        },
        {
          code: 'A3',
          role: 'Aerial Threat 3',
          player: `${a3.name} (JR ${a3.attributes.jumpingReach})`,
          instruction: 'Mark Keeper',
        },
        {
          code: 'B1',
          role: 'Box Threat 1',
          player: b1.name,
          instruction: 'Attack Ball from Edge of Area',
        },
        {
          code: 'C1',
          role: 'Creator 1',
          player: c1.name,
          instruction: 'Lurk Outside Area (Near Side)',
        },
        {
          code: 'C2',
          role: 'Creator 2',
          player: c2.name,
          instruction: 'Lurk Outside Area (Far Side)',
        },
        {
          code: 'D1/D2',
          role: 'Recovery Pair',
          player: `${d1.name} & ${d2.name}`,
          instruction: 'Stay Back',
        },
      ],
      auditNote: `Isolates #1 aerial target ${a1.name} (JR ${a1.attributes.jumpingReach}) at the Far Post while ${a2.name} pins the near-post zone.`,
    },
    {
      id: 'defending-corners',
      name: 'Defending Corners — Routine 1 (Zonal Wall + Edge Hub)',
      delivery: 'Zonal 6-Yard Wall + Edge Second-Ball Hub',
      leftTaker: 'Opposition Left Corner',
      rightTaker: 'Opposition Right Corner',
      assignments: [
        {
          code: 'A1',
          role: '6-Yard Centre',
          player: `${a1.name} (JR ${a1.attributes.jumpingReach})`,
          instruction: 'Zonal Mark 6-Yd Centre',
        },
        {
          code: 'A2',
          role: '6-Yard Near Centre',
          player: `${a2.name} (JR ${a2.attributes.jumpingReach})`,
          instruction: 'Zonal Mark 6-Yd Near Centre',
        },
        {
          code: 'A3',
          role: '6-Yard Far Centre',
          player: `${a3.name} (JR ${a3.attributes.jumpingReach})`,
          instruction: 'Zonal Mark 6-Yd Far Centre',
        },
        {
          code: 'B1',
          role: 'Tracker 1',
          player: `${d1.name} (Tck ${d1.attributes.tackling})`,
          instruction: 'Player Mark Secondary Runner',
        },
        {
          code: 'B2',
          role: 'Second-Ball Hub',
          player: `${c1.name} (Fir ${c1.attributes.firstTouch}, Pas ${c1.attributes.passing})`,
          instruction: 'Edge of Area (Win 2nd Balls & Launch Counter)',
        },
        {
          code: 'C1',
          role: 'Counter Outlet',
          player: `${d2.name} (Pac ${d2.attributes.pace}, Acc ${d2.attributes.acceleration})`,
          instruction: 'Stay Forward (Centre)',
        },
      ],
      auditNote: `Stations top 3 aerial headers (${a1.name}, ${a2.name}, ${a3.name}) across the 6-yard line and places ${c1.name} at Edge of Area to clear second balls.`,
    },
  ];

  return {
    routines,
    aerialThreats,
    leftFootTakers,
    rightFootTakers,
    recoveryDefenders,
  };
}

/**
 * Dynamically builds the upcoming Training & Recovery Periodisation schedule
 * from the imported .fm save's in-game date and upcoming fixtures.
 */
export function buildDynamicTrainingSchedule(
  saveDateLabel: string,
  upcomingFixtures: Array<{
    dateIso: string | null;
    dateDmy: string | null;
    competition: string;
    opponent: string;
    venue: 'H' | 'A';
  }>
): TrainingSessionDay[] {
  if (!saveDateLabel || saveDateLabel === '--') {
    return [];
  }

  if (!upcomingFixtures || upcomingFixtures.length === 0) {
    return [
      {
        week: 'Current Save Checkpoint',
        date: saveDateLabel,
        fixtureContext: 'Open Schedule / Pre-Fixture Block',
        slot1: 'Build Up',
        slot2: 'Chance Creation',
        slot3: 'Individual Development',
        directive:
          'Target FM27 Tactical Effectiveness 51+ threshold in Build Up & Chance Creation while monitoring squad condition.',
      },
    ];
  }

  const schedule: TrainingSessionDay[] = [];
  let prevIso: string | null = null;

  upcomingFixtures.slice(0, 6).forEach((fix, idx) => {
    const fixDate = fix.dateDmy || fix.dateIso || `Fixture #${idx + 1}`;
    const venueStr = fix.venue === 'H' ? 'Home' : 'Away';
    let daysBetween = 7;
    if (prevIso && fix.dateIso) {
      const diffMs =
        new Date(fix.dateIso).getTime() - new Date(prevIso).getTime();
      if (Number.isFinite(diffMs) && diffMs > 0) {
        daysBetween = Math.round(diffMs / (1000 * 60 * 60 * 24));
      }
    }
    prevIso = fix.dateIso;

    const isCongested = daysBetween <= 4;

    if (idx === 0) {
      schedule.push({
        week: `Next Fixture Prep (#1)`,
        date: `Now (${saveDateLabel}) → ${fixDate}`,
        fixtureContext: `vs ${fix.opponent} (${venueStr} · ${fix.competition})`,
        slot1: 'In Possession Shape',
        slot2: 'Defensive Positioning',
        slot3: 'Attacking & Defending Corners',
        directive: `Active pre-match block for ${fix.opponent} (${venueStr}): lock Tracking Wingers OOP, Standard Passing, and Centre-delivery corners.`,
      });
    } else if (isCongested) {
      schedule.push({
        week: `Double-GW Buffer (${daysBetween}d turnaround)`,
        date: `Before ${fixDate}`,
        fixtureContext: `CONGESTED GW — vs ${fix.opponent} (${venueStr})`,
        slot1: 'Recovery',
        slot2: 'Defensive Positioning',
        slot3: 'Rest (Stamina Buffer — 13.8% → 4.0% Injury Roll)',
        directive: `CRITICAL DOUBLE-GW BUFFER (${daysBetween} days after previous match): Mandatory Recovery + full Rest slot and <=125m outfield rotation cap.`,
      });
    } else {
      schedule.push({
        week: `Fixture Block #${idx + 1} (${daysBetween}d window)`,
        date: `Week of ${fixDate}`,
        fixtureContext: `vs ${fix.opponent} (${venueStr} · ${fix.competition})`,
        slot1: 'Build Up',
        slot2: 'Chance Creation',
        slot3: 'Pressing Trap & Individual Dev',
        directive: `Full ${daysBetween}-day training cycle: push Build Up & Chance Creation familiarity above 51+ before ${fix.opponent} (${venueStr}).`,
      });
    }
  });

  return schedule;
}
