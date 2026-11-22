import fm27RolesData from '../data/fm27Roles.json';
import { PlayerRecord } from '../types/fm27';

export interface Fm27RoleItem {
  positionGroup: string;
  name: string;
  phase: 'In Possession' | 'Out of Possession';
  priorities: Record<string, string>;
}

export const FM27_ROLES: Fm27RoleItem[] = fm27RolesData as unknown as Fm27RoleItem[];

export const IN_POSSESSION_ROLES = FM27_ROLES.filter(
  (r) => r.phase === 'In Possession'
);

export const OUT_OF_POSSESSION_ROLES = FM27_ROLES.filter(
  (r) => r.phase === 'Out of Possession'
);

export const IP_ROLE_NAMES = new Set(IN_POSSESSION_ROLES.map((r) => r.name));
export const OOP_ROLE_NAMES = new Set(OUT_OF_POSSESSION_ROLES.map((r) => r.name));

/**
 * Infer authentic FM27 Dual-Phase roles (separate In-Possession and Out-of-Possession)
 * from a player's natural position and attributes.
 * Guarantee ZERO retired FM24 duties (Defend/Support/Attack) and ZERO retired roles
 * (Mezzala/Enganche/Trequartista).
 */
export function inferFm27Roles(
  position: string,
  attributes?: Partial<PlayerRecord['attributes']> | null,
  positionRatings?: Record<string, number> | null
): { ipRole: string; oopRole: string } {
  let effectivePos = (position || '').toUpperCase();
  if (positionRatings) {
    const entries = Object.entries(positionRatings).filter(
      ([, v]) => typeof v === 'number' && Number.isFinite(v)
    );
    if (entries.length > 0) {
      entries.sort((a, b) => b[1] - a[1]);
      if (entries[0][1] >= 15) {
        effectivePos = entries[0][0].toUpperCase();
      }
    }
  }
  const p = effectivePos;
  const attrs = attributes || {
    pace: 10,
    acceleration: 10,
    stamina: 10,
    jumpingReach: 10,
    determination: 10,
    passing: 10,
    finishing: 10,
    tackling: 10,
    firstTouch: 10,
    decisions: 10,
    workRate: 10,
    offTheBall: 10,
  };

  // 1. Goalkeeper
  if (p.includes('GK')) {
    const isPassingGk = (attrs.passing || 0) >= 11 && (attrs.decisions || 0) >= 12;
    return {
      ipRole: isPassingGk ? 'Ball-Playing Goalkeeper' : 'No-Nonsense Goalkeeper',
      oopRole: isPassingGk ? 'Sweeper Keeper' : 'Line-Holding Keeper',
    };
  }

  // 2. Centre-Back
  if (p.includes('DC') || p.includes('D (C)') || p.includes('CB')) {
    const isBallPlayer = (attrs.passing || 0) >= 11 && (attrs.firstTouch || 0) >= 10;
    const isCovering = (attrs.pace || 0) >= 12 && (attrs.decisions || 0) >= 11;
    return {
      ipRole: isBallPlayer ? 'Ball-Playing Centre-Back' : 'Centre-Back',
      oopRole: isCovering ? 'Covering Centre-Back' : 'Stopping Centre-Back',
    };
  }

  // 3. Full-Back / Wing-Back
  if (
    p.includes('D/WB') ||
    p.includes('WB') ||
    p.includes('DR') ||
    p.includes('DL') ||
    p.includes('D (R') ||
    p.includes('D (L')
  ) {
    const isAttackingWb = (attrs.pace || 0) >= 13 && (attrs.stamina || 0) >= 11;
    return {
      ipRole: isAttackingWb ? 'Wing-Back' : 'Full-Back',
      oopRole: isAttackingWb ? 'Holding Wing-Back' : 'Holding Full-Back',
    };
  }

  // 4. Defensive Midfielder
  if (p.includes('DM') && !p.includes('AM')) {
    const isHalfBack = (attrs.passing || 0) >= 12 && (attrs.decisions || 0) >= 12;
    const isScreening = (attrs.tackling || 0) >= 11 && (attrs.decisions || 10) >= 11;
    return {
      ipRole: isHalfBack ? 'Half-Back' : 'Defensive Midfielder',
      oopRole: isScreening ? 'Screening Defensive Midfielder' : 'Dropping Defensive Midfielder',
    };
  }

  // 5. Attacking Midfielder (C) — check BEFORE MC so 'AMC' never matches 'MC'
  if (p.includes('AMC') || p.includes('AM (C)')) {
    const isPlaymaker = (attrs.passing || 0) >= 13 && (attrs.decisions || 0) >= 12;
    return {
      ipRole: isPlaymaker ? 'Advanced Playmaker' : 'Attacking Midfielder',
      oopRole: 'Tracking Attacking Midfielder',
    };
  }

  // 6. Central Midfielder
  if (/\bMC\b|M\s*\(C\)/.test(p)) {
    if ((attrs.passing || 0) >= 13 && (attrs.firstTouch || 0) >= 11) {
      return {
        ipRole: 'Deep-Lying Playmaker',
        oopRole: 'Screening Central Midfielder',
      };
    }
    if ((attrs.workRate || 0) >= 13 && (attrs.stamina || 0) >= 12) {
      return {
        ipRole: 'Box-to-Box Midfielder',
        oopRole: 'Pressing Central Midfielder',
      };
    }
    return {
      ipRole: 'Central Midfielder',
      oopRole: 'Pressing Central Midfielder',
    };
  }

  // 7. Wide Midfielder / Winger
  if (
    p.includes('AM (R') ||
    p.includes('AM (L') ||
    p.includes('AML') ||
    p.includes('AMR') ||
    p.includes('ML') ||
    p.includes('MR') ||
    p.includes('M/AM')
  ) {
    const isInsideForward = (attrs.finishing || 0) >= 11;
    return {
      ipRole: isInsideForward ? 'Inside Forward' : 'Winger',
      oopRole: 'Tracking Winger',
    };
  }

  // 8. Striker / Centre-Forward
  if (p.includes('ST') || p.includes('CF')) {
    if ((attrs.jumpingReach || 0) >= 14 && (attrs.finishing || 0) >= 11) {
      return {
        ipRole: 'Target Forward',
        oopRole: 'Central Outlet Centre Forward',
      };
    }
    if ((attrs.pace || 0) >= 12 && (attrs.offTheBall || 0) >= 12) {
      return {
        ipRole: 'Channel Forward',
        oopRole: 'Central Outlet Centre Forward',
      };
    }
    if ((attrs.finishing || 0) >= 12) {
      return {
        ipRole: 'Poacher',
        oopRole: 'Central Outlet Centre Forward',
      };
    }
    return {
      ipRole: 'Centre Forward',
      oopRole: 'Central Outlet Centre Forward',
    };
  }

  // Default fallback
  return {
    ipRole: 'Central Midfielder',
    oopRole: 'Pressing Central Midfielder',
  };
}

/**
 * Maps snake_case attribute priority keys in src/data/fm27Roles.json
 * to canonical camelCase keys on PlayerRecord['attributes'].
 */
export const FM27_ROLE_ATTR_MAP: Record<string, keyof PlayerRecord['attributes']> = {
  aerial_ability: 'aerialReach',
  command_of_area: 'commandOfArea',
  communication: 'communication',
  eccentricity: 'eccentricity',
  handling: 'handling',
  kicking: 'kicking',
  one_on_ones: 'oneOnOnes',
  reflexes: 'reflexes',
  rushing_out: 'rushingOut',
  tendency_to_punch: 'punching',
  throwing: 'throwing',
  corners: 'corners',
  crossing: 'crossing',
  dribbling: 'dribbling',
  finishing: 'finishing',
  first_touch: 'firstTouch',
  free_kicks: 'freeKicks',
  heading: 'heading',
  long_shots: 'longShots',
  long_throws: 'longThrows',
  marking: 'marking',
  passing: 'passing',
  penalty_taking: 'penalties',
  tackling: 'tackling',
  technique: 'technique',
  aggression: 'aggression',
  anticipation: 'anticipation',
  bravery: 'bravery',
  composure: 'composure',
  concentration: 'concentration',
  decisions: 'decisions',
  determination: 'determination',
  flair: 'flair',
  leadership: 'leadership',
  off_the_ball: 'offTheBall',
  positioning: 'positioning',
  team_work: 'teamwork',
  vision: 'vision',
  work_rate: 'workRate',
  acceleration: 'acceleration',
  agility: 'agility',
  balance: 'balance',
  jumping: 'jumpingReach',
  jumping_reach: 'jumpingReach',
  natural_fitness: 'naturalFitness',
  pace: 'pace',
  stamina: 'stamina',
  strength: 'strength',
};

export function doesPlayerMatchRolePositionGroup(
  position: string,
  secondaryPositions: string[] | undefined,
  positionGroup: string
): boolean {
  const combined = [position || '', ...(secondaryPositions || [])]
    .join(' ')
    .toUpperCase();
  const grp = (positionGroup || '').toUpperCase();
  if (grp === 'GK' || grp.includes('GOALKEEPER')) return combined.includes('GK');
  if (grp === 'DC' || grp.includes('CENTRE-BACK') || grp.includes('CENTER-BACK')) {
    return /\b(DC|CB|D\s*\(C)\b/.test(combined) || combined.includes('DC') || combined.includes('D (C');
  }
  if (
    grp === 'DL/DR' ||
    grp === 'WBL/WBR' ||
    grp.includes('FULL-BACK') ||
    grp.includes('WING-BACK')
  ) {
    return (
      combined.includes('DL') ||
      combined.includes('DR') ||
      combined.includes('WB') ||
      combined.includes('D (L') ||
      combined.includes('D (R')
    );
  }
  if (grp === 'DM' || grp.includes('DEFENSIVE MIDFIELDER')) {
    return combined.includes('DM');
  }
  if (grp === 'MC' || grp.includes('CENTRAL MIDFIELDER')) {
    return /\bMC\b|\bCM\b|(?<!A)M\s*\(C/.test(combined);
  }
  if (grp === 'ML/MR' || grp.includes('WIDE MIDFIELDER') || grp.includes('WINGER')) {
    return (
      combined.includes('ML') ||
      combined.includes('MR') ||
      combined.includes('M (L') ||
      combined.includes('M (R') ||
      combined.includes('AML') ||
      combined.includes('AMR') ||
      combined.includes('AM (L') ||
      combined.includes('AM (R') ||
      combined.includes('M/AM')
    );
  }
  if (grp === 'AMC' || grp.includes('ATTACKING MIDFIELDER')) {
    return combined.includes('AMC') || combined.includes('AM (C');
  }
  if (grp === 'AML/AMR') {
    return (
      combined.includes('AML') ||
      combined.includes('AMR') ||
      combined.includes('AM (L') ||
      combined.includes('AM (R') ||
      combined.includes('ML') ||
      combined.includes('MR')
    );
  }
  if (grp === 'ST' || grp.includes('STRIKER') || grp.includes('FORWARD')) {
    return combined.includes('ST') || combined.includes('CF');
  }
  return false;
}

export function getRolePositionFamiliarity(
  player: Pick<PlayerRecord, 'position' | 'secondaryPositions' | 'positionRatings'>,
  positionGroup: string,
  flank?: 'L' | 'C' | 'R'
): number | null {
  const ratings = player.positionRatings;
  if (!ratings) return null;
  const numericEntries = Object.entries(ratings).filter(
    ([, v]) => typeof v === 'number' && Number.isFinite(v)
  );
  if (numericEntries.length === 0) return null;

  const upperMap = new Map<string, number>();
  for (const [k, v] of numericEntries) {
    upperMap.set(k.toUpperCase(), v);
  }

  const maxOf = (keys: string[]): number | null => {
    let best: number | null = null;
    for (const k of keys) {
      const val = upperMap.get(k);
      if (typeof val === 'number' && (best === null || val > best)) {
        best = val;
      }
    }
    return best;
  };

  const grp = (positionGroup || '').toUpperCase();
  let val: number | null = null;
  if (grp === 'GK' || grp.includes('GOALKEEPER')) {
    val = maxOf(['GK']);
  } else if (grp === 'DC' || grp.includes('CENTRE-BACK') || grp.includes('CENTER-BACK')) {
    val = maxOf(['DC', 'CB']);
  } else if (grp === 'DL/DR' || (grp.includes('FULL-BACK') && !grp.includes('WING-BACK'))) {
    if (flank === 'L') val = maxOf(['DL', 'WBL']);
    else if (flank === 'R') val = maxOf(['DR', 'WBR']);
    else val = maxOf(['DL', 'DR']);
  } else if (grp === 'WBL/WBR' || grp.includes('WING-BACK')) {
    if (flank === 'L') val = maxOf(['DL', 'WBL']);
    else if (flank === 'R') val = maxOf(['DR', 'WBR']);
    else val = maxOf(['DL', 'DR', 'WBL', 'WBR']);
  } else if (grp === 'DM' || grp.includes('DEFENSIVE MIDFIELDER')) {
    val = maxOf(['DM']);
  } else if (grp === 'MC' || grp.includes('CENTRAL MIDFIELDER')) {
    val = maxOf(['MC']);
  } else if (grp === 'ML/MR' || (grp.includes('WIDE MIDFIELDER') && !grp.includes('WINGER'))) {
    if (flank === 'L') val = maxOf(['ML', 'AML']);
    else if (flank === 'R') val = maxOf(['MR', 'AMR']);
    else val = maxOf(['ML', 'MR']);
  } else if (grp === 'AMC' || grp.includes('ATTACKING MIDFIELDER')) {
    val = maxOf(['AMC']);
  } else if (grp === 'AML/AMR' || grp.includes('WINGER')) {
    if (flank === 'L') val = maxOf(['AML', 'ML']);
    else if (flank === 'R') val = maxOf(['AMR', 'MR']);
    else val = maxOf(['AML', 'AMR', 'ML', 'MR']);
  } else if (grp === 'ST' || grp === 'STC' || grp.includes('STRIKER') || grp.includes('FORWARD')) {
    val = maxOf(['ST', 'STC', 'CF']);
    // If an older cached save omitted ST/STC from positionRatings altogether, fall back
    // to the player's position text instead of erroneously scoring strikers as 1/20.
    if (val === null) return null;
  }

  return val ?? 1;
}

/**
 * Computes a 0–100 role-fit percentage for a PlayerRecord against any pure FM27 IP/OOP role
 * from src/data/fm27Roles.json using weighted primary (2x) and secondary (1x) attributes
 * plus a strong positional-familiarity gate/multiplier.
 */
export function scorePlayerForFm27Role(
  player: PlayerRecord,
  role: Fm27RoleItem,
  slotContext?: { positionGroup?: string; flank?: 'L' | 'C' | 'R' }
): number {
  const attrs = player.attributes;
  const entries = Object.entries(role.priorities || {});
  if (entries.length === 0) return 50;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [snakeKey, tier] of entries) {
    const camelKey = FM27_ROLE_ATTR_MAP[snakeKey];
    const rawVal = camelKey ? attrs[camelKey] : undefined;
    const val = typeof rawVal === 'number' && rawVal > 0 ? Math.min(20, Math.max(1, rawVal)) : 9;
    const w = tier === 'primary' ? 2.0 : 1.0;
    weightedSum += (val / 20) * 100 * w;
    totalWeight += w;
  }

  let baseScore = totalWeight > 0 ? weightedSum / totalWeight : 50;
  const isGkPlayer = (player.position || '').toUpperCase().includes('GK');
  const effectivePosGroup = slotContext?.positionGroup || role.positionGroup;
  const effectiveFlank = slotContext?.flank;
  const roleGrpUpper = effectivePosGroup.toUpperCase();
  const isGkRole = roleGrpUpper === 'GK' || roleGrpUpper.includes('GOALKEEPER');
  const familiarity = getRolePositionFamiliarity(
    player,
    effectivePosGroup,
    effectiveFlank
  );

  if (isGkRole !== isGkPlayer) {
    baseScore *= 0.25;
  } else if (familiarity !== null) {
    if (familiarity >= 18) {
      baseScore = Math.min(99, baseScore + 8);
    } else if (familiarity >= 15) {
      baseScore = Math.min(99, baseScore + 3);
    } else if (familiarity >= 12) {
      baseScore *= 0.75;
    } else if (familiarity >= 9) {
      baseScore *= 0.5;
    } else {
      baseScore *= 0.25;
    }
  } else if (
    doesPlayerMatchRolePositionGroup(
      player.position,
      player.secondaryPositions,
      effectivePosGroup
    )
  ) {
    baseScore = Math.min(99, baseScore + 8);
  } else {
    baseScore *= 0.4;
  }

  return Math.round(Math.min(99, Math.max(1, baseScore)));
}

export interface RankedRoleCandidate {
  player: PlayerRecord;
  fitPct: number;
  matchedPosition: boolean;
}

export function rankSquadForFm27Role(
  players: PlayerRecord[],
  role: Fm27RoleItem,
  limit = 5
): RankedRoleCandidate[] {
  return players
    .map((player) => {
      const familiarity = getRolePositionFamiliarity(player, role.positionGroup);
      const matchedPosition =
        familiarity !== null
          ? familiarity >= 15
          : doesPlayerMatchRolePositionGroup(
              player.position,
              player.secondaryPositions,
              role.positionGroup
            );
      return {
        player,
        fitPct: scorePlayerForFm27Role(player, role),
        matchedPosition,
      };
    })
    .filter((candidate) => candidate.matchedPosition)
    .sort((a, b) => {
      if (b.fitPct !== a.fitPct) return b.fitPct - a.fitPct;
      return b.player.ability - a.player.ability;
    })
    .slice(0, limit);
}

/**
 * Returns the subset of FM27 IP or OOP roles compatible with the player's
 * natural/accomplished position group (>= 15/20 familiarity when positionRatings
 * is present, or primary/secondary position fallback).
 */
export function getNaturalRolesForPlayer(
  player: Pick<PlayerRecord, 'position' | 'secondaryPositions' | 'positionRatings'>,
  phase: 'In Possession' | 'Out of Possession'
): Fm27RoleItem[] {
  const catalog =
    phase === 'In Possession' ? IN_POSSESSION_ROLES : OUT_OF_POSSESSION_ROLES;
  const naturalPool = catalog.filter((role) => {
    const fam = getRolePositionFamiliarity(player, role.positionGroup);
    if (fam !== null) return fam >= 15;
    return doesPlayerMatchRolePositionGroup(
      player.position,
      player.secondaryPositions,
      role.positionGroup
    );
  });
  return naturalPool.length > 0 ? naturalPool : catalog;
}

/**
 * Resolves default IP/OOP roles for a player restricted to positions where the player
 * has natural/accomplished familiarity (>= 15/20 when positionRatings is present).
 */
export function resolveNaturalDefaultRoles(
  player: PlayerRecord
): { ipRole: string; oopRole: string } {
  const pickRole = (
    currentName: string | undefined,
    phase: 'In Possession' | 'Out of Possession',
    fallback: string
  ): string => {
    const naturalPool = getNaturalRolesForPlayer(player, phase);
    const existing = currentName
      ? naturalPool.find((r) => r.name.toLowerCase() === currentName.toLowerCase())
      : undefined;
    if (existing) {
      return existing.name;
    }

    let bestName = fallback;
    let bestScore = -1;
    for (const role of naturalPool) {
      const score = scorePlayerForFm27Role(player, role);
      if (score > bestScore) {
        bestScore = score;
        bestName = role.name;
      }
    }
    return bestName;
  };

  const inferred = inferFm27Roles(
    player.position,
    player.attributes,
    player.positionRatings
  );

  return {
    ipRole: pickRole(player.ipRole, 'In Possession', inferred.ipRole),
    oopRole: pickRole(player.oopRole, 'Out of Possession', inferred.oopRole),
  };
}


