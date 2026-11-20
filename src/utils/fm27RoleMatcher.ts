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
  attributes?: Partial<PlayerRecord['attributes']> | null
): { ipRole: string; oopRole: string } {
  const p = (position || '').toUpperCase();
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

  // 5. Central Midfielder
  if (p.includes('MC') || p.includes('M (C)')) {
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

  // 6. Attacking Midfielder (C)
  if (p.includes('AMC') || p.includes('AM (C)')) {
    const isPlaymaker = (attrs.passing || 0) >= 13 && (attrs.decisions || 0) >= 12;
    return {
      ipRole: isPlaymaker ? 'Advanced Playmaker' : 'Attacking Midfielder',
      oopRole: 'Tracking Attacking Midfielder',
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
