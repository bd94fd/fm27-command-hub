import type { SquadPlannerSlot } from '../types/fmSave';

export interface SquadPlannerPositionMeta {
  code: string;
  label: string;
  line: 'GK' | 'DEF' | 'MID' | 'FWD';
  sortOrder: number;
}

/**
 * Exact FM27 27-slot (0..26) Squad Planner pitch grid mapping.
 * Verified 1-to-1 against live FM27 27.1.0 saves:
 *  Row 0: 1=GK, 2=SW
 *  Row 1 (DEF): 3=DR, 4=DCR, 5=DC, 6=DCL, 7=DL
 *  Row 2 (WB/DM): 8=WBR, 9=DMR, 10=DM, 11=DML, 12=WBL
 *  Row 3 (MID): 13=MR, 14=MCR, 15=MC, 16=MCL, 17=ML
 *  Row 4 (AM): 18=AMR, 19=AMCR, 20=AMC, 21=AMCL, 22=AML
 *  Row 5 (ST): 23=STCR, 24=STC, 25=STCL
 */
export const FM27_SQUAD_PLANNER_SLOT_MAP: Record<number, SquadPlannerPositionMeta> = {
  1: { code: 'GK', label: 'Goalkeeper', line: 'GK', sortOrder: 1 },
  2: { code: 'SW', label: 'Sweeper', line: 'DEF', sortOrder: 2 },
  3: { code: 'DR', label: 'Right-Back', line: 'DEF', sortOrder: 3 },
  4: { code: 'DCR', label: 'Right Centre-Back', line: 'DEF', sortOrder: 4 },
  5: { code: 'DC', label: 'Centre-Back', line: 'DEF', sortOrder: 5 },
  6: { code: 'DCL', label: 'Left Centre-Back', line: 'DEF', sortOrder: 6 },
  7: { code: 'DL', label: 'Left-Back', line: 'DEF', sortOrder: 7 },
  8: { code: 'WBR', label: 'Right Wing-Back', line: 'DEF', sortOrder: 8 },
  9: { code: 'DMR', label: 'Right Defensive Mid', line: 'MID', sortOrder: 9 },
  10: { code: 'DM', label: 'Defensive Midfielder', line: 'MID', sortOrder: 10 },
  11: { code: 'DML', label: 'Left Defensive Mid', line: 'MID', sortOrder: 11 },
  12: { code: 'WBL', label: 'Left Wing-Back', line: 'DEF', sortOrder: 12 },
  13: { code: 'MR', label: 'Right Midfielder', line: 'MID', sortOrder: 13 },
  14: { code: 'MCR', label: 'Right Central Mid', line: 'MID', sortOrder: 14 },
  15: { code: 'MC', label: 'Central Midfielder', line: 'MID', sortOrder: 15 },
  16: { code: 'MCL', label: 'Left Central Mid', line: 'MID', sortOrder: 16 },
  17: { code: 'ML', label: 'Left Midfielder', line: 'MID', sortOrder: 17 },
  18: { code: 'AMR', label: 'Right Winger / IF', line: 'FWD', sortOrder: 18 },
  19: { code: 'AMCR', label: 'Right Attacking Mid', line: 'MID', sortOrder: 19 },
  20: { code: 'AMC', label: 'Attacking Midfielder', line: 'MID', sortOrder: 20 },
  21: { code: 'AMCL', label: 'Left Attacking Mid', line: 'MID', sortOrder: 21 },
  22: { code: 'AML', label: 'Left Winger / IF', line: 'FWD', sortOrder: 22 },
  23: { code: 'STCR', label: 'Right Striker', line: 'FWD', sortOrder: 23 },
  24: { code: 'STC', label: 'Centre Striker', line: 'FWD', sortOrder: 24 },
  25: { code: 'STCL', label: 'Left Striker', line: 'FWD', sortOrder: 25 },
};

const CODE_TO_META: Record<string, SquadPlannerPositionMeta> = Object.values(
  FM27_SQUAD_PLANNER_SLOT_MAP
).reduce<Record<string, SquadPlannerPositionMeta>>((acc, meta) => {
  acc[meta.code] = meta;
  return acc;
}, {});

export function resolveSquadPlannerSlotMeta(
  slot: Pick<SquadPlannerSlot, 'slot' | 'positionCode'>
): SquadPlannerPositionMeta {
  const explicit = (slot.positionCode || '').trim().toUpperCase();
  if (explicit && CODE_TO_META[explicit]) {
    return CODE_TO_META[explicit];
  }
  if (explicit && !/^SLOT\s*\d+$/i.test(explicit)) {
    return {
      code: explicit,
      label: explicit,
      line: explicit.startsWith('GK')
        ? 'GK'
        : explicit.startsWith('D') || explicit.startsWith('WB')
          ? 'DEF'
          : explicit.startsWith('ST') || explicit.startsWith('AM')
            ? 'FWD'
            : 'MID',
      sortOrder: slot.slot || 99,
    };
  }
  const mapped = FM27_SQUAD_PLANNER_SLOT_MAP[slot.slot];
  if (mapped) return mapped;
  return {
    code: `Pos ${slot.slot}`,
    label: `Pitch Slot ${slot.slot}`,
    line: 'MID',
    sortOrder: slot.slot || 99,
  };
}

export function normalizeTacticPositionToPlannerCode(pos: string | null | undefined): string {
  const clean = (pos || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!clean) return '';
  if (clean === 'ST' || clean === 'CF') return 'STC';
  if (clean === 'RB') return 'DR';
  if (clean === 'LB') return 'DL';
  if (clean === 'RCB' || clean === 'CBR') return 'DCR';
  if (clean === 'LCB' || clean === 'CBL') return 'DCL';
  if (clean === 'CB') return 'DC';
  if (clean === 'RW') return 'AMR';
  if (clean === 'LW') return 'AML';
  if (clean === 'RCM') return 'MCR';
  if (clean === 'LCM') return 'MCL';
  if (clean === 'CM') return 'MC';
  if (clean === 'RWB') return 'WBR';
  if (clean === 'LWB') return 'WBL';
  return clean;
}

export function formatSquadPlannerSeasonLabel(seasonOffset: number): string {
  if (seasonOffset <= 0) return 'Current Season';
  if (seasonOffset === 1) return 'Next Season (+1)';
  return `In ${seasonOffset} Seasons (+${seasonOffset})`;
}

/**
 * Filters out opaque/unmapped binary placeholder labels like "Setting 1",
 * "Instruction #4", or bare numbers so UI cards & AI prompts only ever
 * display real human-readable FM27 tactical instructions.
 */
export function filterMeaningfulInstructions(
  rawList?: string[] | null
): string[] {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const item of rawList) {
    const txt = String(item || '').trim();
    if (!txt) continue;
    if (/^setting[\s_#-]*\d+(?:\s*:\s*[\d.\w-]+)?$/i.test(txt)) continue;
    if (/^instruction[\s_#-]*\d+(?:\s*:\s*[\d.\w-]+)?$/i.test(txt)) continue;
    if (/^\d+(?:\.\d+)?$/.test(txt)) continue;
    if (!seen.has(txt)) {
      seen.add(txt);
      clean.push(txt);
    }
  }
  return clean;
}

const FM27_ROLE_DESCRIPTIONS: Array<[RegExp, string]> = [
  // Goalkeepers
  [/ball-playing goalkeeper/i, 'Steps out with the ball at feet to act as an extra build-up option and launch progressive passes.'],
  [/sweeper keeper/i, 'Sweeps high behind the defensive line to clear through-balls and initiate quick counter-attacks.'],
  [/no-nonsense goalkeeper/i, 'Prioritises shot-stopping and safe direct clearances over risky short build-up passes.'],
  [/goalkeeper/i, 'Holds a conservative penalty-area position focused on shot-stopping and simple distribution.'],
  // Centre-Backs
  [/ball-playing centre-back/i, 'Steps into midfield lanes in possession to break opponent lines with vertical passes.'],
  [/overlapping centre-back|wide centre-back/i, 'Pushes wide in build-up to stretch the first press and support flank overloads.'],
  [/stopping centre-back|stopper/i, 'Steps aggressively out of the back line to engage receivers before they can turn.'],
  [/covering centre-back/i, 'Drops slightly deeper to sweep balls played in behind the defensive line.'],
  [/centre-back/i, 'Holds central rest-defence shape, clearing danger and recycling possession cleanly.'],
  // Full-Backs / Wing-Backs
  [/holding full-back/i, 'Tucks narrow to form a 3-man rest-defence base in possession; presses aggressively on the flank in Patch 27.1.0.'],
  [/inverted wing-back|inside wing-back|inside full-back/i, 'Moves into central midfield/half-spaces in possession to create central overloads and protect transitions.'],
  [/attacking wing-back|wing-back/i, 'Bombs down the touchline to hold maximum width, deliver crosses, and stretch the opposition block.'],
  [/pressing full-back/i, 'Steps high out of possession to jump onto opposition wide outlets early.'],
  [/full-back/i, 'Balances flank support in possession with disciplined wide defensive coverage out of possession.'],
  // Defensive Midfielders
  [/screening defensive midfielder/i, 'Protects central Zone 14 passing lanes out of possession, blocking vertical feeds into the opposition striker.'],
  [/pressing defensive midfielder/i, 'Steps forward out of possession to hunt the ball carrier in the middle third.'],
  [/deep-lying playmaker/i, 'Dictates tempo from deep with line-breaking passes while anchoring transition cover.'],
  [/half-back/i, 'Drops between the centre-backs during build-up to create a back three and free the full-backs.'],
  [/defensive midfielder/i, 'Anchors the base of midfield, breaking up counters and recycling possession to advanced runners.'],
  // Central Midfielders
  [/channel midfielder/i, 'Drives diagonally into the half-space channels between opposition full-back and centre-back in possession.'],
  [/box-to-box/i, 'Covers both penalty boxes with relentless vertical shuttling, supporting build-up and arriving late to finish.'],
  [/pressing central midfielder/i, 'Triggers aggressive midfield pressing out of possession to squeeze time on the ball.'],
  [/screening central midfielder/i, 'Holds compact central spacing out of possession to funnel opponents wide.'],
  [/playmaking midfielder|advanced playmaker/i, 'Finds pockets between the lines to thread final-third through-balls and control tempo.'],
  [/central midfielder/i, 'Provides balanced midfield link-up, ball progression, and structured central cover.'],
  // Wide Attackers / Wingers
  [/inside forward/i, 'Cuts inside off the flank onto their stronger foot to attack the half-space and shoot on goal.'],
  [/tracking winger/i, 'Tracks back diligently out of possession to double up against overlapping full-backs and protect the flank.'],
  [/wide outlet winger/i, 'Holds high on the touchline out of possession to stay poised for immediate counter-attack switches.'],
  [/inverted winger/i, 'Drives inside with the ball to open overlapping lanes for the full-back and thread diagonals.'],
  [/winger/i, 'Holds touchline width to beat the full-back 1v1 and deliver early or byline crosses.'],
  // Attacking Midfielders
  [/shadow striker/i, 'Surges beyond the centre-forward into the box as a primary goalscoring runner from deep.'],
  [/tracking attacking midfielder/i, 'Drops into the midfield block out of possession to screen the opposition pivot.'],
  [/attacking midfielder/i, 'Operates in the pocket behind the striker to combine, turn, and create final-third chances.'],
  // Strikers
  [/central outlet centre forward|outlet centre forward/i, 'Stays high centrally out of possession to pin opposing centre-backs and provide a direct counter-attack outlet.'],
  [/pressing centre forward|pressing forward/i, 'Leads the first line of press out of possession, hurrying centre-backs and forcing errors.'],
  [/channel forward/i, 'Pulls into the channels behind the full-backs to stretch the back line and run onto vertical balls.'],
  [/poacher/i, 'Plays on the shoulder of the last defender, prioritising box movement and clinical first-time finishes over link-up play.'],
  [/deep-lying forward|false nine/i, 'Drops between the lines to link midfield build-up and drag centre-backs out of shape.'],
  [/target forward/i, 'Uses aerial strength and hold-up play to bring runners into the attack.'],
  [/centre forward/i, 'Leads the line centrally, combining box presence with direct runs behind the defence.'],
];

export function describeFm27RoleBrief(roleName: string | null | undefined): string | null {
  const clean = (roleName || '').trim();
  if (!clean) return null;
  for (const [pattern, summary] of FM27_ROLE_DESCRIPTIONS) {
    if (pattern.test(clean)) return summary;
  }
  return null;
}
