/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PlayerRecord } from '../types/fm27';
import { ActiveSuspensionRecord } from '../types/fmSave';
import {
  doesPlayerMatchRolePositionGroup,
  Fm27RoleItem,
  getRolePositionFamiliarity,
  IN_POSSESSION_ROLES,
  OUT_OF_POSSESSION_ROLES,
  scorePlayerForFm27Role,
} from './fm27RoleMatcher';

export type FormationPresetKey =
  | '4-3-3 DM Wide'
  | '4-2-3-1 DM AM Wide'
  | '4-4-2'
  | '3-4-2-1';

export interface FormationSlotTemplate {
  slotId: string;
  label: string;
  positionGroup: string;
  defaultIpRole: string;
  defaultOopRole: string;
  flank: 'L' | 'C' | 'R';
  /** Pitch horizontal percentage (0 = left touchline, 100 = right touchline) */
  x: number;
  /** Pitch vertical percentage (0 = opposition goal, 100 = own goal) */
  y: number;
}

export const FORMATION_PRESETS: Record<FormationPresetKey, FormationSlotTemplate[]> = {
  '4-3-3 DM Wide': [
    { slotId: 'GK', label: 'GK', positionGroup: 'Goalkeeper', defaultIpRole: 'No-Nonsense Goalkeeper', defaultOopRole: 'Line-Holding Keeper', flank: 'C', x: 50, y: 90 },
    { slotId: 'DR', label: 'RB', positionGroup: 'Full-Back / Wing-Back', defaultIpRole: 'Full-Back', defaultOopRole: 'Holding Full-Back', flank: 'R', x: 84, y: 74 },
    { slotId: 'DCR', label: 'RCB', positionGroup: 'Centre-Back', defaultIpRole: 'Ball-Playing Centre-Back', defaultOopRole: 'Covering Centre-Back', flank: 'C', x: 63, y: 77 },
    { slotId: 'DCL', label: 'LCB', positionGroup: 'Centre-Back', defaultIpRole: 'Centre-Back', defaultOopRole: 'Stopping Centre-Back', flank: 'C', x: 37, y: 77 },
    { slotId: 'DL', label: 'LB', positionGroup: 'Full-Back / Wing-Back', defaultIpRole: 'Full-Back', defaultOopRole: 'Holding Full-Back', flank: 'L', x: 16, y: 74 },
    { slotId: 'DM', label: 'DM', positionGroup: 'Defensive Midfielder', defaultIpRole: 'Defensive Midfielder', defaultOopRole: 'Screening Defensive Midfielder', flank: 'C', x: 50, y: 60 },
    { slotId: 'MCR', label: 'RCM', positionGroup: 'Central Midfielder', defaultIpRole: 'Channel Midfielder', defaultOopRole: 'Pressing Central Midfielder', flank: 'R', x: 67, y: 46 },
    { slotId: 'MCL', label: 'LCM', positionGroup: 'Central Midfielder', defaultIpRole: 'Box-to-Box Midfielder', defaultOopRole: 'Screening Central Midfielder', flank: 'L', x: 33, y: 46 },
    { slotId: 'AMR', label: 'RW', positionGroup: 'Wide Midfielder / Winger', defaultIpRole: 'Winger', defaultOopRole: 'Tracking Winger', flank: 'R', x: 82, y: 27 },
    { slotId: 'AML', label: 'LW', positionGroup: 'Wide Midfielder / Winger', defaultIpRole: 'Inside Forward', defaultOopRole: 'Tracking Winger', flank: 'L', x: 18, y: 27 },
    { slotId: 'ST', label: 'ST', positionGroup: 'Striker', defaultIpRole: 'Channel Forward', defaultOopRole: 'Central Outlet Centre Forward', flank: 'C', x: 50, y: 14 },
  ],
  '4-2-3-1 DM AM Wide': [
    { slotId: 'GK', label: 'GK', positionGroup: 'Goalkeeper', defaultIpRole: 'No-Nonsense Goalkeeper', defaultOopRole: 'Line-Holding Keeper', flank: 'C', x: 50, y: 90 },
    { slotId: 'DR', label: 'RB', positionGroup: 'Full-Back / Wing-Back', defaultIpRole: 'Full-Back', defaultOopRole: 'Holding Full-Back', flank: 'R', x: 84, y: 74 },
    { slotId: 'DCR', label: 'RCB', positionGroup: 'Centre-Back', defaultIpRole: 'Ball-Playing Centre-Back', defaultOopRole: 'Covering Centre-Back', flank: 'C', x: 63, y: 77 },
    { slotId: 'DCL', label: 'LCB', positionGroup: 'Centre-Back', defaultIpRole: 'Centre-Back', defaultOopRole: 'Stopping Centre-Back', flank: 'C', x: 37, y: 77 },
    { slotId: 'DL', label: 'LB', positionGroup: 'Full-Back / Wing-Back', defaultIpRole: 'Full-Back', defaultOopRole: 'Holding Full-Back', flank: 'L', x: 16, y: 74 },
    { slotId: 'DMR', label: 'RDM', positionGroup: 'Defensive Midfielder', defaultIpRole: 'Defensive Midfielder', defaultOopRole: 'Screening Defensive Midfielder', flank: 'R', x: 63, y: 58 },
    { slotId: 'DML', label: 'LDM', positionGroup: 'Defensive Midfielder', defaultIpRole: 'Deep-Lying Playmaker', defaultOopRole: 'Dropping Defensive Midfielder', flank: 'L', x: 37, y: 58 },
    { slotId: 'AMR', label: 'RW', positionGroup: 'Wide Midfielder / Winger', defaultIpRole: 'Winger', defaultOopRole: 'Tracking Winger', flank: 'R', x: 82, y: 33 },
    { slotId: 'AMC', label: 'AM', positionGroup: 'Attacking Midfielder', defaultIpRole: 'Advanced Playmaker', defaultOopRole: 'Tracking Attacking Midfielder', flank: 'C', x: 50, y: 33 },
    { slotId: 'AML', label: 'LW', positionGroup: 'Wide Midfielder / Winger', defaultIpRole: 'Inside Forward', defaultOopRole: 'Tracking Winger', flank: 'L', x: 18, y: 33 },
    { slotId: 'ST', label: 'ST', positionGroup: 'Striker', defaultIpRole: 'Channel Forward', defaultOopRole: 'Central Outlet Centre Forward', flank: 'C', x: 50, y: 14 },
  ],
  '4-4-2': [
    { slotId: 'GK', label: 'GK', positionGroup: 'Goalkeeper', defaultIpRole: 'No-Nonsense Goalkeeper', defaultOopRole: 'Line-Holding Keeper', flank: 'C', x: 50, y: 90 },
    { slotId: 'DR', label: 'RB', positionGroup: 'Full-Back / Wing-Back', defaultIpRole: 'Full-Back', defaultOopRole: 'Holding Full-Back', flank: 'R', x: 84, y: 74 },
    { slotId: 'DCR', label: 'RCB', positionGroup: 'Centre-Back', defaultIpRole: 'Ball-Playing Centre-Back', defaultOopRole: 'Covering Centre-Back', flank: 'C', x: 63, y: 77 },
    { slotId: 'DCL', label: 'LCB', positionGroup: 'Centre-Back', defaultIpRole: 'Centre-Back', defaultOopRole: 'Stopping Centre-Back', flank: 'C', x: 37, y: 77 },
    { slotId: 'DL', label: 'LB', positionGroup: 'Full-Back / Wing-Back', defaultIpRole: 'Full-Back', defaultOopRole: 'Holding Full-Back', flank: 'L', x: 16, y: 74 },
    { slotId: 'MR', label: 'RM', positionGroup: 'Wide Midfielder / Winger', defaultIpRole: 'Winger', defaultOopRole: 'Tracking Wide Midfielder', flank: 'R', x: 84, y: 47 },
    { slotId: 'MCR', label: 'RCM', positionGroup: 'Central Midfielder', defaultIpRole: 'Deep-Lying Playmaker', defaultOopRole: 'Screening Central Midfielder', flank: 'C', x: 62, y: 50 },
    { slotId: 'MCL', label: 'LCM', positionGroup: 'Central Midfielder', defaultIpRole: 'Box-to-Box Midfielder', defaultOopRole: 'Pressing Central Midfielder', flank: 'C', x: 38, y: 50 },
    { slotId: 'ML', label: 'LM', positionGroup: 'Wide Midfielder / Winger', defaultIpRole: 'Wide Midfielder', defaultOopRole: 'Tracking Wide Midfielder', flank: 'L', x: 16, y: 47 },
    { slotId: 'STR', label: 'RST', positionGroup: 'Striker', defaultIpRole: 'Channel Forward', defaultOopRole: 'Central Outlet Centre Forward', flank: 'R', x: 62, y: 17 },
    { slotId: 'STL', label: 'LST', positionGroup: 'Striker', defaultIpRole: 'Deep-Lying Forward', defaultOopRole: 'Tracking Centre Forward', flank: 'L', x: 38, y: 17 },
  ],
  '3-4-2-1': [
    { slotId: 'GK', label: 'GK', positionGroup: 'Goalkeeper', defaultIpRole: 'Ball-Playing Goalkeeper', defaultOopRole: 'Sweeper Keeper', flank: 'C', x: 50, y: 90 },
    { slotId: 'DCR', label: 'RCB', positionGroup: 'Centre-Back', defaultIpRole: 'Wide Centre-Back', defaultOopRole: 'Wide Covering Centre-Back', flank: 'R', x: 75, y: 76 },
    { slotId: 'DC', label: 'CCB', positionGroup: 'Centre-Back', defaultIpRole: 'Ball-Playing Centre-Back', defaultOopRole: 'Stopping Centre-Back', flank: 'C', x: 50, y: 79 },
    { slotId: 'DCL', label: 'LCB', positionGroup: 'Centre-Back', defaultIpRole: 'Wide Centre-Back', defaultOopRole: 'Wide Covering Centre-Back', flank: 'L', x: 25, y: 76 },
    { slotId: 'WBR', label: 'RWB', positionGroup: 'Full-Back / Wing-Back', defaultIpRole: 'Wing-Back', defaultOopRole: 'Holding Wing-Back', flank: 'R', x: 86, y: 52 },
    { slotId: 'MCR', label: 'RCM', positionGroup: 'Central Midfielder', defaultIpRole: 'Deep-Lying Playmaker', defaultOopRole: 'Screening Central Midfielder', flank: 'C', x: 62, y: 55 },
    { slotId: 'MCL', label: 'LCM', positionGroup: 'Central Midfielder', defaultIpRole: 'Box-to-Box Midfielder', defaultOopRole: 'Pressing Central Midfielder', flank: 'C', x: 38, y: 55 },
    { slotId: 'WBL', label: 'LWB', positionGroup: 'Full-Back / Wing-Back', defaultIpRole: 'Wing-Back', defaultOopRole: 'Holding Wing-Back', flank: 'L', x: 14, y: 52 },
    { slotId: 'AMCR', label: 'RAM', positionGroup: 'Attacking Midfielder', defaultIpRole: 'Channel Attacking Midfielder', defaultOopRole: 'Tracking Attacking Midfielder', flank: 'R', x: 66, y: 31 },
    { slotId: 'AMCL', label: 'LAM', positionGroup: 'Attacking Midfielder', defaultIpRole: 'Attacking Midfielder', defaultOopRole: 'Tracking Attacking Midfielder', flank: 'L', x: 34, y: 31 },
    { slotId: 'ST', label: 'ST', positionGroup: 'Striker', defaultIpRole: 'Channel Forward', defaultOopRole: 'Central Outlet Centre Forward', flank: 'C', x: 50, y: 14 },
  ],
};

export interface CustomSlotOverride {
  slotId: string;
  ipRole?: string;
  oopRole?: string;
  playerId?: string | null;
}

export interface BestXiSolverOptions {
  shape?: FormationPresetKey;
  customSlots?: CustomSlotOverride[];
  excludeInjured?: boolean;
  excludeSuspended?: boolean;
  activeSuspensions?: ActiveSuspensionRecord[];
  /** Optional next fixture competition name (e.g. "Eerste Nationale VV") so cup-only bans do not exclude players from league matches */
  nextCompetitionName?: string | null;
  minCondition?: number;
  excludePlayerIds?: string[];
}

export interface SolvedSlot {
  slotId: string;
  label: string;
  positionGroup: string;
  flank: 'L' | 'C' | 'R';
  x: number;
  y: number;
  ipRole: string;
  oopRole: string;
  player: PlayerRecord | null;
  ipFitPct: number;
  oopFitPct: number;
  combinedFitPct: number;
  isNaturalPosition: boolean;
  warnings: string[];
}

export interface ExcludedPlayerInfo {
  player: PlayerRecord;
  reasons: string[];
}

export interface BestXiResult {
  shape: FormationPresetKey;
  startingXI: SolvedSlot[];
  rotatedBTeam: SolvedSlot[];
  excludedPlayers: ExcludedPlayerInfo[];
  averageFitPct: number;
}

const IP_ROLE_MAP = new Map<string, Fm27RoleItem>(
  IN_POSSESSION_ROLES.map((r) => [r.name.toLowerCase(), r])
);

const OOP_ROLE_MAP = new Map<string, Fm27RoleItem>(
  OUT_OF_POSSESSION_ROLES.map((r) => [r.name.toLowerCase(), r])
);

export function findIpRole(name: string, fallbackPositionGroup?: string): Fm27RoleItem {
  const found = IP_ROLE_MAP.get((name || '').trim().toLowerCase());
  if (found) return found;
  if (fallbackPositionGroup) {
    const byGroup = IN_POSSESSION_ROLES.find(
      (r) => r.positionGroup.toLowerCase() === fallbackPositionGroup.toLowerCase()
    );
    if (byGroup) return byGroup;
  }
  return IN_POSSESSION_ROLES[0];
}

export function findOopRole(name: string, fallbackPositionGroup?: string): Fm27RoleItem {
  const found = OOP_ROLE_MAP.get((name || '').trim().toLowerCase());
  if (found) return found;
  if (fallbackPositionGroup) {
    const byGroup = OUT_OF_POSSESSION_ROLES.find(
      (r) => r.positionGroup.toLowerCase() === fallbackPositionGroup.toLowerCase()
    );
    if (byGroup) return byGroup;
  }
  return OUT_OF_POSSESSION_ROLES[0];
}

function isGoalkeeperPlayer(player: PlayerRecord): boolean {
  const fam = getRolePositionFamiliarity(player, 'Goalkeeper');
  if (fam !== null) return fam >= 15;
  return (player.position || '').toUpperCase().includes('GK');
}

function getFlankAwareFamiliarity(
  player: PlayerRecord,
  positionGroup: string,
  flank?: 'L' | 'C' | 'R'
): number | null {
  const ratings = player.positionRatings;
  const grp = (positionGroup || '').toUpperCase();

  if (ratings && Object.values(ratings).some((v) => typeof v === 'number' && Number.isFinite(v))) {
    const upper = new Map<string, number>();
    for (const [k, v] of Object.entries(ratings)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        upper.set(k.toUpperCase(), v);
      }
    }
    const maxOf = (keys: string[]) =>
      Math.max(0, ...keys.map((k) => upper.get(k) ?? 0));

    if (grp.includes('FULL-BACK') || grp.includes('WING-BACK')) {
      if (flank === 'L') return maxOf(['DL', 'WBL']);
      if (flank === 'R') return maxOf(['DR', 'WBR']);
    }
    if (grp.includes('WIDE MIDFIELDER') || grp.includes('WINGER')) {
      if (flank === 'L') return maxOf(['AML', 'ML']);
      if (flank === 'R') return maxOf(['AMR', 'MR']);
    }
  }

  return getRolePositionFamiliarity(player, positionGroup);
}

function doesPlayerMatchFlankText(
  player: PlayerRecord,
  positionGroup: string,
  flank?: 'L' | 'C' | 'R'
): boolean {
  const grp = (positionGroup || '').toUpperCase();
  const combined = [player.position || '', ...(player.secondaryPositions || [])]
    .join(' ')
    .toUpperCase();

  if (grp.includes('FULL-BACK') || grp.includes('WING-BACK')) {
    if (flank === 'L') {
      return /\b(DL|WBL|LB)\b|(?:D|WB)\s*\([RLC]*L/.test(combined);
    }
    if (flank === 'R') {
      return /\b(DR|WBR|RB)\b|(?:D|WB)\s*\([RLC]*R/.test(combined);
    }
  }
  if (grp.includes('WIDE MIDFIELDER') || grp.includes('WINGER')) {
    if (flank === 'L') {
      return /\b(AML|ML|LW)\b|(?:M|AM)\s*\([RLC]*L/.test(combined);
    }
    if (flank === 'R') {
      return /\b(AMR|MR|RW)\b|(?:M|AM)\s*\([RLC]*R/.test(combined);
    }
  }
  return doesPlayerMatchRolePositionGroup(
    player.position,
    player.secondaryPositions,
    positionGroup
  );
}

function isNaturalForPositionGroup(
  player: PlayerRecord,
  positionGroup: string,
  flank?: 'L' | 'C' | 'R'
): boolean {
  const fam = getFlankAwareFamiliarity(player, positionGroup, flank);
  if (fam !== null) return fam >= 15;
  return doesPlayerMatchFlankText(player, positionGroup, flank);
}

export function classifyCompetitionKind(
  competitionName?: string | null
): 'cup' | 'continental' | 'league' | 'unknown' {
  const txt = (competitionName || '').trim().toLowerCase();
  if (!txt || txt === '--' || txt === 'league / cup') return 'unknown';
  if (/(champions|europa|conference|continental|uefa)/.test(txt)) {
    return 'continental';
  }
  if (/(cup|beker|trophy|shield|\bfa\b|pokal|coupe|copa|coppa)/.test(txt)) {
    return 'cup';
  }
  return 'league';
}

/**
 * Returns true if a disciplinary ban applies to the given next fixture competition.
 * When nextCompetitionName is omitted/unknown, preserves conservative exclusion for tests.
 */
export function isSuspensionActiveForCompetition(
  ban: ActiveSuspensionRecord,
  nextCompetitionName?: string | null
): boolean {
  if (ban.matchesRemaining !== undefined && ban.matchesRemaining <= 0) {
    return false;
  }
  const scope = (ban.scope || 'league').toLowerCase();
  if (scope === 'all') return true;
  if (!nextCompetitionName) return true;

  const nextNorm = nextCompetitionName.trim().toLowerCase();
  const banCompNorm = (ban.competitionName || '').trim().toLowerCase();
  if (banCompNorm && nextNorm && (nextNorm.includes(banCompNorm) || banCompNorm.includes(nextNorm))) {
    return true;
  }

  const nextKind = classifyCompetitionKind(nextCompetitionName);
  if (nextKind === 'unknown') return true;
  if (scope === 'cup') return nextKind === 'cup';
  if (scope === 'continental') return nextKind === 'continental';
  if (scope === 'league') return nextKind === 'league';
  return true;
}

export function buildSuspensionLookup(
  players: PlayerRecord[],
  activeSuspensions: ActiveSuspensionRecord[] = [],
  nextCompetitionName?: string | null
): {
  byUid: Map<number, ActiveSuspensionRecord>;
  byNameLower: Map<string, ActiveSuspensionRecord>;
  nextCompetitionName?: string | null;
} {
  const byUid = new Map<number, ActiveSuspensionRecord>();
  const byNameLower = new Map<string, ActiveSuspensionRecord>();

  const combined = [
    ...activeSuspensions,
    ...players.flatMap((p) => p.activeSuspensions || []),
  ];

  for (const ban of combined) {
    if (!isSuspensionActiveForCompetition(ban, nextCompetitionName)) continue;
    if (ban.playerUid && ban.playerUid > 0) {
      byUid.set(ban.playerUid, ban);
    }
    if (ban.playerName) {
      byNameLower.set(ban.playerName.trim().toLowerCase(), ban);
    }
  }

  return { byUid, byNameLower, nextCompetitionName };
}

export function getPlayerSuspension(
  player: PlayerRecord,
  lookup: {
    byUid: Map<number, ActiveSuspensionRecord>;
    byNameLower: Map<string, ActiveSuspensionRecord>;
    nextCompetitionName?: string | null;
  }
): ActiveSuspensionRecord | undefined {
  if (player.uid && lookup.byUid.has(player.uid)) {
    return lookup.byUid.get(player.uid);
  }
  const byName = lookup.byNameLower.get(player.name.trim().toLowerCase());
  if (byName) return byName;
  return player.activeSuspensions?.find((b) =>
    isSuspensionActiveForCompetition(b, lookup.nextCompetitionName)
  );
}

interface SlotScore {
  ipFitPct: number;
  oopFitPct: number;
  combinedFitPct: number;
  selectionScore: number;
  isNaturalPosition: boolean;
}

export function evaluatePlayerForSlot(
  player: PlayerRecord,
  positionGroup: string,
  ipRoleName: string,
  oopRoleName: string,
  flank?: 'L' | 'C' | 'R'
): SlotScore {
  const ipRole = findIpRole(ipRoleName, positionGroup);
  const oopRole = findOopRole(oopRoleName, positionGroup);
  const slotContext = { positionGroup, flank };
  const ipFitPct = scorePlayerForFm27Role(player, ipRole, slotContext);
  const oopFitPct = scorePlayerForFm27Role(player, oopRole, slotContext);
  const fam = getFlankAwareFamiliarity(player, positionGroup, flank);
  const isNaturalPosition = isNaturalForPositionGroup(player, positionGroup, flank);
  const rawCombined = Math.round(ipFitPct * 0.55 + oopFitPct * 0.45);
  const combinedFitPct = isNaturalPosition
    ? rawCombined
    : Math.max(1, Math.round(rawCombined * 0.72));

  // Weighted selection score blends role attribute fit (58%), star ability (42%),
  // and an exact-natural familiarity bonus (18-20/20 on exact flank edges accomplished 15-17/20).
  const abilityNorm = Math.min(100, Math.max(0, ((player.ability || 2.5) / 5) * 100));
  const exactNaturalBonus =
    fam !== null
      ? fam >= 18
        ? 6
        : fam >= 15
          ? 0
          : -20
      : isNaturalPosition
        ? 4
        : -20;
  const selectionScore = Math.round(
    combinedFitPct * 0.58 + abilityNorm * 0.42 + exactNaturalBonus
  );

  return { ipFitPct, oopFitPct, combinedFitPct, selectionScore, isNaturalPosition };
}

function solveSingleLineup(
  eligiblePlayers: PlayerRecord[],
  templates: Array<FormationSlotTemplate & { ipRole: string; oopRole: string }>,
  suspensionLookup: {
    byUid: Map<number, ActiveSuspensionRecord>;
    byNameLower: Map<string, ActiveSuspensionRecord>;
    nextCompetitionName?: string | null;
  }
): SolvedSlot[] {
  const usedIds = new Set<string>();
  const assigned = new Map<string, PlayerRecord | null>();

  const gkPool = eligiblePlayers.filter(isGoalkeeperPlayer);
  const outfieldPool = eligiblePlayers.filter((p) => !isGoalkeeperPlayer(p));

  // Order slots by scarcity: GK first, then slots with fewest natural candidates
  const orderedTemplates = [...templates].sort((a, b) => {
    const aIsGk = a.positionGroup === 'Goalkeeper';
    const bIsGk = b.positionGroup === 'Goalkeeper';
    if (aIsGk !== bIsGk) return aIsGk ? -1 : 1;

    const aNatCount = outfieldPool.filter((p) =>
      isNaturalForPositionGroup(p, a.positionGroup, a.flank)
    ).length;
    const bNatCount = outfieldPool.filter((p) =>
      isNaturalForPositionGroup(p, b.positionGroup, b.flank)
    ).length;
    if (aNatCount !== bNatCount) return aNatCount - bNatCount;
    return a.slotId.localeCompare(b.slotId);
  });

  for (const slot of orderedTemplates) {
    const isGkSlot = slot.positionGroup === 'Goalkeeper';
    let candidates: PlayerRecord[];

    if (isGkSlot) {
      // Never place an outfielder in GK unless zero GKs are available
      const availableGks = gkPool.filter((p) => !usedIds.has(p.id));
      candidates =
        availableGks.length > 0
          ? availableGks
          : outfieldPool.filter((p) => !usedIds.has(p.id));
    } else {
      // Never place a GK in an outfield slot unless zero outfielders remain.
      // Enforce strict flank-aware positional familiarity (>= 15/20) first, falling back only if zero natural/accomplished candidates exist.
      const availableOutfield = outfieldPool.filter((p) => !usedIds.has(p.id));
      const naturalOutfield = availableOutfield.filter((p) =>
        isNaturalForPositionGroup(p, slot.positionGroup, slot.flank)
      );
      if (naturalOutfield.length > 0) {
        candidates = naturalOutfield;
      } else {
        candidates =
          availableOutfield.length > 0
            ? availableOutfield
            : gkPool.filter((p) => !usedIds.has(p.id));
      }
    }

    if (candidates.length === 0) {
      assigned.set(slot.slotId, null);
      continue;
    }

    const ranked = candidates
      .map((player) => ({
        player,
        score: evaluatePlayerForSlot(
          player,
          slot.positionGroup,
          slot.ipRole,
          slot.oopRole,
          slot.flank
        ),
      }))
      .sort((a, b) => {
        if (a.score.isNaturalPosition !== b.score.isNaturalPosition) {
          return a.score.isNaturalPosition ? -1 : 1;
        }
        if (b.score.selectionScore !== a.score.selectionScore) {
          return b.score.selectionScore - a.score.selectionScore;
        }
        if (b.score.combinedFitPct !== a.score.combinedFitPct) {
          return b.score.combinedFitPct - a.score.combinedFitPct;
        }
        if (b.player.ability !== a.player.ability) {
          return b.player.ability - a.player.ability;
        }
        const aCond = a.player.condition ?? 85;
        const bCond = b.player.condition ?? 85;
        if (bCond !== aCond) return bCond - aCond;
        return a.player.id.localeCompare(b.player.id);
      });

    const winner = ranked[0].player;
    usedIds.add(winner.id);
    assigned.set(slot.slotId, winner);
  }

  // Pairwise swap improvement pass for outfield slots (never degrading natural-position count)
  const outfieldTemplates = templates.filter((t) => t.positionGroup !== 'Goalkeeper');
  let improved = true;
  let guard = 0;
  while (improved && guard < 20) {
    improved = false;
    guard++;
    for (let i = 0; i < outfieldTemplates.length; i++) {
      for (let j = i + 1; j < outfieldTemplates.length; j++) {
        const sA = outfieldTemplates[i];
        const sB = outfieldTemplates[j];
        const pA = assigned.get(sA.slotId);
        const pB = assigned.get(sB.slotId);
        if (!pA || !pB) continue;

        const curA = evaluatePlayerForSlot(pA, sA.positionGroup, sA.ipRole, sA.oopRole, sA.flank);
        const curB = evaluatePlayerForSlot(pB, sB.positionGroup, sB.ipRole, sB.oopRole, sB.flank);
        const swpA = evaluatePlayerForSlot(pB, sA.positionGroup, sA.ipRole, sA.oopRole, sA.flank);
        const swpB = evaluatePlayerForSlot(pA, sB.positionGroup, sB.ipRole, sB.oopRole, sB.flank);

        const currentNaturalCount =
          (curA.isNaturalPosition ? 1 : 0) + (curB.isNaturalPosition ? 1 : 0);
        const swappedNaturalCount =
          (swpA.isNaturalPosition ? 1 : 0) + (swpB.isNaturalPosition ? 1 : 0);

        if (swappedNaturalCount < currentNaturalCount) {
          continue;
        }

        const currentSum = curA.selectionScore + curB.selectionScore;
        const swappedSum = swpA.selectionScore + swpB.selectionScore;

        if (
          swappedNaturalCount > currentNaturalCount ||
          swappedSum > currentSum
        ) {
          assigned.set(sA.slotId, pB);
          assigned.set(sB.slotId, pA);
          improved = true;
        }
      }
    }
  }

  return templates.map((slot) => {
    const player = assigned.get(slot.slotId) ?? null;
    if (!player) {
      return {
        slotId: slot.slotId,
        label: slot.label,
        positionGroup: slot.positionGroup,
        flank: slot.flank,
        x: slot.x,
        y: slot.y,
        ipRole: slot.ipRole,
        oopRole: slot.oopRole,
        player: null,
        ipFitPct: 0,
        oopFitPct: 0,
        combinedFitPct: 0,
        isNaturalPosition: false,
        warnings: ['No eligible player available for this slot'],
      };
    }

    const score = evaluatePlayerForSlot(
      player,
      slot.positionGroup,
      slot.ipRole,
      slot.oopRole,
      slot.flank
    );
    const warnings: string[] = [];
    if (!score.isNaturalPosition) {
      warnings.push(`Out of natural position (${player.position} in ${slot.label})`);
    }
    if (player.status === 'Injured') {
      warnings.push('Player is currently injured');
    }
    const ban = getPlayerSuspension(player, suspensionLookup);
    if (ban) {
      warnings.push(`Suspended (${ban.matchesRemaining}m · ${ban.competitionName})`);
    }
    if (typeof player.condition === 'number' && player.condition < 85) {
      warnings.push(`Low match condition (${player.condition}% < 85%)`);
    }

    return {
      slotId: slot.slotId,
      label: slot.label,
      positionGroup: slot.positionGroup,
      flank: slot.flank,
      x: slot.x,
      y: slot.y,
      ipRole: slot.ipRole,
      oopRole: slot.oopRole,
      player,
      ipFitPct: score.ipFitPct,
      oopFitPct: score.oopFitPct,
      combinedFitPct: score.combinedFitPct,
      isNaturalPosition: score.isNaturalPosition,
      warnings,
    };
  });
}

/**
 * Deterministic positional role-fit Starting XI + rotated B-Team solver
 * using the gated scores in fm27RoleMatcher.ts.
 */
export function solveBestXi(
  players: PlayerRecord[],
  options: BestXiSolverOptions = {}
): BestXiResult {
  const shape: FormationPresetKey = options.shape || '4-3-3 DM Wide';
  const excludeInjured = options.excludeInjured ?? true;
  const excludeSuspended = options.excludeSuspended ?? true;
  const minCondition = options.minCondition;
  const excludeIds = new Set(options.excludePlayerIds || []);
  const suspensionLookup = buildSuspensionLookup(
    players,
    options.activeSuspensions || [],
    options.nextCompetitionName
  );

  const baseTemplates = FORMATION_PRESETS[shape] || FORMATION_PRESETS['4-3-3 DM Wide'];
  const customMap = new Map(
    (options.customSlots || []).map((c) => [c.slotId, c])
  );

  const templates = baseTemplates.map((tpl) => {
    const custom = customMap.get(tpl.slotId);
    return {
      ...tpl,
      ipRole: custom?.ipRole || tpl.defaultIpRole,
      oopRole: custom?.oopRole || tpl.defaultOopRole,
    };
  });

  const eligible: PlayerRecord[] = [];
  const excludedPlayers: ExcludedPlayerInfo[] = [];

  for (const player of players) {
    const reasons: string[] = [];
    if (excludeIds.has(player.id)) {
      reasons.push('Manually excluded');
    }
    if (excludeInjured && player.status === 'Injured') {
      reasons.push('Injured');
    }
    if (excludeSuspended && getPlayerSuspension(player, suspensionLookup)) {
      reasons.push('Suspended');
    }
    if (
      typeof minCondition === 'number' &&
      typeof player.condition === 'number' &&
      player.condition < minCondition
    ) {
      reasons.push(`Condition ${player.condition}% < ${minCondition}%`);
    }

    if (reasons.length > 0) {
      excludedPlayers.push({ player, reasons });
    } else {
      eligible.push(player);
    }
  }

  const startingXI = solveSingleLineup(eligible, templates, suspensionLookup);
  const xiIds = new Set(
    startingXI.map((s) => s.player?.id).filter((id): id is string => Boolean(id))
  );

  const remainingForBTeam = eligible.filter((p) => !xiIds.has(p.id));
  const rotatedBTeam = solveSingleLineup(remainingForBTeam, templates, suspensionLookup);

  const filledSlots = startingXI.filter((s) => s.player !== null);
  const averageFitPct =
    filledSlots.length > 0
      ? Math.round(
          filledSlots.reduce((sum, s) => sum + s.combinedFitPct, 0) / filledSlots.length
        )
      : 0;

  return {
    shape,
    startingXI,
    rotatedBTeam,
    excludedPlayers,
    averageFitPct,
  };
}
