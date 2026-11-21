/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FormationPresetKey, SolvedSlot } from './bestXiSolver';

export type TransitionRoleCategory =
  | 'GOALKEEPER'
  | 'BASE_ANCHOR'
  | 'TRANSITION_SHUTTLE'
  | 'ATTACKING_OUTLET';

export type PitchPhaseMode = 'ip' | 'oop' | 'rest-defense';

export interface RestDefenseSlotNode {
  slotId: string;
  label: string;
  flank: 'L' | 'C' | 'R';
  positionGroup: string;
  ipRole: string;
  oopRole: string;
  category: TransitionRoleCategory;
  categoryLabel: string;
  ipX: number;
  ipY: number;
  oopX: number;
  oopY: number;
  restX: number;
  restY: number;
}

export interface HorizontalLaneRisk {
  lane:
    | 'Left Flank'
    | 'Left Half-Space'
    | 'Central Zone 5'
    | 'Right Half-Space'
    | 'Right Flank';
  status: 'Secure' | 'Watch' | 'Exposed';
  coverageCount: number;
  detail: string;
  xStart: number;
  xEnd: number;
}

export interface RestDefenseAnalysis {
  structureLabel: string;
  baseDefenderCount: number;
  pivotScreenCount: number;
  shuttleCount: number;
  outletCount: number;
  stabilityScore: number;
  nodes: RestDefenseSlotNode[];
  basePolygonPoints: Array<{ x: number; y: number }>;
  lanes: HorizontalLaneRisk[];
  alerts: string[];
}

const HIGH_ATTACKING_FB_ROLES = new Set([
  'wing-back',
  'attacking wing-back',
  'overlapping full-back',
  'playmaking wing-back',
]);

const INVERTED_OR_HOLDING_FB_ROLES = new Set([
  'inverted full-back',
  'inverted wing-back',
  'inside wing-back',
  'holding full-back',
  'holding wing-back',
  'full-back',
]);

const HOLDING_MID_IP_ROLES = new Set([
  'defensive midfielder',
  'half-back',
  'deep-lying playmaker',
  'holding midfielder',
  'anchor',
]);

const HOLDING_MID_OOP_ROLES = new Set([
  'screening defensive midfielder',
  'dropping defensive midfielder',
  'screening central midfielder',
  'holding central midfielder',
]);

function clampCoord(val: number, min = 8, max = 92): number {
  return Math.max(min, Math.min(max, Math.round(val * 10) / 10));
}

export function classifySlotRestDefenseCategory(
  slot: SolvedSlot
): {
  category: TransitionRoleCategory;
  categoryLabel: string;
  isRearLineBase: boolean;
  isMidfieldScreenBase: boolean;
} {
  const grp = (slot.positionGroup || '').toLowerCase();
  const ip = (slot.ipRole || '').toLowerCase();
  const oop = (slot.oopRole || '').toLowerCase();

  if (grp.includes('goalkeeper')) {
    return {
      category: 'GOALKEEPER',
      categoryLabel: 'Sweeper / Line Keeper',
      isRearLineBase: false,
      isMidfieldScreenBase: false,
    };
  }

  if (grp.includes('centre-back')) {
    return {
      category: 'BASE_ANCHOR',
      categoryLabel: 'Rest-Defense CB',
      isRearLineBase: true,
      isMidfieldScreenBase: false,
    };
  }

  if (grp.includes('full-back') || grp.includes('wing-back')) {
    if (ip.includes('inverted full-back') || oop.includes('holding full-back') && !HIGH_ATTACKING_FB_ROLES.has(ip)) {
      if (ip.includes('inverted full-back')) {
        return {
          category: 'BASE_ANCHOR',
          categoryLabel: 'Auxiliary 3rd CB',
          isRearLineBase: true,
          isMidfieldScreenBase: false,
        };
      }
      if (INVERTED_OR_HOLDING_FB_ROLES.has(ip)) {
        return {
          category: 'BASE_ANCHOR',
          categoryLabel: 'Tucked Rest-Defense FB',
          isRearLineBase: false,
          isMidfieldScreenBase: true,
        };
      }
    }
    if (HIGH_ATTACKING_FB_ROLES.has(ip)) {
      return {
        category: 'ATTACKING_OUTLET',
        categoryLabel: 'High Flank Overlapper',
        isRearLineBase: false,
        isMidfieldScreenBase: false,
      };
    }
    return {
      category: 'TRANSITION_SHUTTLE',
      categoryLabel: 'Recovery Full-Back',
      isRearLineBase: false,
      isMidfieldScreenBase: false,
    };
  }

  if (grp.includes('defensive midfielder') || grp.includes('central midfielder')) {
    if (ip.includes('half-back') || oop.includes('dropping defensive midfielder')) {
      return {
        category: 'BASE_ANCHOR',
        categoryLabel: 'Dropping Half-Back Base',
        isRearLineBase: true,
        isMidfieldScreenBase: false,
      };
    }
    const isForwardRunnerIp =
      ip.includes('box-to-box') ||
      ip.includes('channel') ||
      ip.includes('attacking');
    if (
      HOLDING_MID_IP_ROLES.has(ip) ||
      (!isForwardRunnerIp && HOLDING_MID_OOP_ROLES.has(oop))
    ) {
      return {
        category: 'BASE_ANCHOR',
        categoryLabel: 'Zone 5 Pivot Screen',
        isRearLineBase: false,
        isMidfieldScreenBase: true,
      };
    }
    return {
      category: 'TRANSITION_SHUTTLE',
      categoryLabel: 'Box-to-Box Counter-Presser',
      isRearLineBase: false,
      isMidfieldScreenBase: false,
    };
  }

  if (grp.includes('wide midfielder') || grp.includes('winger')) {
    if (oop.includes('tracking')) {
      return {
        category: 'TRANSITION_SHUTTLE',
        categoryLabel: 'Tracking Wide Shuttle',
        isRearLineBase: false,
        isMidfieldScreenBase: false,
      };
    }
    return {
      category: 'ATTACKING_OUTLET',
      categoryLabel: 'Wide Counter Outlet',
      isRearLineBase: false,
      isMidfieldScreenBase: false,
    };
  }

  if (grp.includes('attacking midfielder')) {
    if (oop.includes('tracking')) {
      return {
        category: 'TRANSITION_SHUTTLE',
        categoryLabel: 'Half-Space Recovery AM',
        isRearLineBase: false,
        isMidfieldScreenBase: false,
      };
    }
    return {
      category: 'ATTACKING_OUTLET',
      categoryLabel: 'High Line Breaker',
      isRearLineBase: false,
      isMidfieldScreenBase: false,
    };
  }

  // Striker
  if (oop.includes('tracking') || ip.includes('deep-lying')) {
    return {
      category: 'TRANSITION_SHUTTLE',
      categoryLabel: 'Pressing Link Forward',
      isRearLineBase: false,
      isMidfieldScreenBase: false,
    };
  }
  return {
    category: 'ATTACKING_OUTLET',
    categoryLabel: 'Vertical Pin / Outlet',
    isRearLineBase: false,
    isMidfieldScreenBase: false,
  };
}

/**
 * Computes IP, OOP, and Rest-Defense coordinates and transition stability across all 5 pitch lanes.
 */
export function analyzeRestDefenseMatrix(
  slots: SolvedSlot[],
  shape: FormationPresetKey = '4-3-3 DM Wide'
): RestDefenseAnalysis {
  let rearLineCount = 0;
  let screenLineCount = 0;
  let shuttleCount = 0;
  let outletCount = 0;

  const nodes: RestDefenseSlotNode[] = slots.map((slot) => {
    const info = classifySlotRestDefenseCategory(slot);
    if (info.isRearLineBase) rearLineCount += 1;
    else if (info.isMidfieldScreenBase) screenLineCount += 1;
    else if (info.category === 'TRANSITION_SHUTTLE') shuttleCount += 1;
    else if (info.category === 'ATTACKING_OUTLET') outletCount += 1;

    const ipLower = (slot.ipRole || '').toLowerCase();
    const oopLower = (slot.oopRole || '').toLowerCase();

    // IP coordinates: reflect attacking progression
    let ipX = slot.x;
    let ipY = slot.y;
    if (HIGH_ATTACKING_FB_ROLES.has(ipLower)) {
      ipY = clampCoord(slot.y - 18, 24, 88);
    } else if (ipLower.includes('inverted') || ipLower.includes('inside')) {
      ipX = slot.flank === 'L' ? clampCoord(slot.x + 14) : slot.flank === 'R' ? clampCoord(slot.x - 14) : slot.x;
      ipY = clampCoord(slot.y - 10, 30, 88);
    } else if (ipLower.includes('inside forward')) {
      ipX = slot.flank === 'L' ? clampCoord(slot.x + 11) : slot.flank === 'R' ? clampCoord(slot.x - 11) : slot.x;
      ipY = clampCoord(slot.y - 6, 14, 88);
    }

    // OOP coordinates: compact defensive mid/low block
    let oopX = slot.x;
    let oopY = slot.y;
    if (slot.positionGroup.toLowerCase().includes('wide') && oopLower.includes('tracking')) {
      oopY = clampCoord(slot.y + 18, 22, 84);
    } else if (slot.positionGroup.toLowerCase().includes('attacking midfielder') && oopLower.includes('tracking')) {
      oopY = clampCoord(slot.y + 14, 22, 84);
    } else if (slot.positionGroup.toLowerCase().includes('full-back') || slot.positionGroup.toLowerCase().includes('wing-back')) {
      oopY = clampCoord(Math.max(slot.y, 72), 55, 84);
    }

    // Rest-defense coordinates: transition moment when ball is lost in attacking half
    let restX = ipX;
    let restY = ipY;
    if (info.isRearLineBase) {
      restY = clampCoord(Math.min(slot.y, 72), 62, 78);
    } else if (info.isMidfieldScreenBase) {
      restY = clampCoord(56, 50, 64);
      if (slot.flank === 'L') restX = clampCoord(24);
      if (slot.flank === 'R') restX = clampCoord(76);
    } else if (info.category === 'TRANSITION_SHUTTLE') {
      restY = clampCoord((ipY + oopY) / 2, 34, 68);
    }

    return {
      slotId: slot.slotId,
      label: slot.label,
      flank: slot.flank,
      positionGroup: slot.positionGroup,
      ipRole: slot.ipRole,
      oopRole: slot.oopRole,
      category: info.category,
      categoryLabel: info.categoryLabel,
      ipX,
      ipY,
      oopX,
      oopY,
      restX,
      restY,
    };
  });

  const baseNodes = nodes.filter((n) => n.category === 'BASE_ANCHOR');
  // Sort polygon clockwise around centroid
  const basePolygonPoints = (() => {
    if (baseNodes.length < 3) {
      return baseNodes.map((n) => ({ x: n.restX, y: n.restY }));
    }
    const cx = baseNodes.reduce((s, n) => s + n.restX, 0) / baseNodes.length;
    const cy = baseNodes.reduce((s, n) => s + n.restY, 0) / baseNodes.length;
    return [...baseNodes]
      .sort(
        (a, b) =>
          Math.atan2(a.restY - cy, a.restX - cx) -
          Math.atan2(b.restY - cy, b.restX - cx)
      )
      .map((n) => ({ x: n.restX, y: n.restY }));
  })();

  const laneDefs: Array<{
    lane: HorizontalLaneRisk['lane'];
    xStart: number;
    xEnd: number;
  }> = [
    { lane: 'Left Flank', xStart: 0, xEnd: 24 },
    { lane: 'Left Half-Space', xStart: 24, xEnd: 41 },
    { lane: 'Central Zone 5', xStart: 41, xEnd: 59 },
    { lane: 'Right Half-Space', xStart: 59, xEnd: 76 },
    { lane: 'Right Flank', xStart: 76, xEnd: 100 },
  ];

  const alerts: string[] = [];
  const lanes: HorizontalLaneRisk[] = laneDefs.map((def) => {
    const coveringNodes = nodes.filter(
      (n) =>
        (n.category === 'BASE_ANCHOR' || n.category === 'TRANSITION_SHUTTLE') &&
        n.restX >= def.xStart - 6 &&
        n.restX <= def.xEnd + 6
    );
    const anchorCount = coveringNodes.filter(
      (n) => n.category === 'BASE_ANCHOR'
    ).length;
    const totalCover = coveringNodes.length;

    let status: HorizontalLaneRisk['status'] = 'Secure';
    let detail = `${totalCover} transition player(s) protecting ${def.lane}.`;

    if (def.lane === 'Central Zone 5') {
      if (anchorCount === 0) {
        status = 'Exposed';
        detail = 'No central holding pivot or stopper anchoring Zone 5 counter-attacks.';
        alerts.push('Zone 5 Central Exposure: Assign at least one Screening/Holding DM or Half-Back.');
      } else if (totalCover === 1) {
        status = 'Watch';
        detail = 'Single central pivot screen; relies on half-space shuttles compressing fast.';
      }
    } else if (def.lane.includes('Flank')) {
      if (totalCover === 0) {
        status = 'Exposed';
        detail = `${def.lane} vacated in transition (high full-back + non-tracking winger).`;
        alerts.push(
          `${def.lane} Counter Corridor: Both wide players stay high; switch winger to Tracking Winger OOP or tuck full-back.`
        );
      } else if (anchorCount === 0 && totalCover === 1) {
        status = 'Watch';
        detail = `Covered by single recovery shuttle (${coveringNodes[0]?.label}).`;
      }
    } else {
      // Half-spaces
      if (totalCover === 0) {
        status = 'Exposed';
        detail = `Unmonitored ${def.lane} channel between flank and centre-backs.`;
        alerts.push(`${def.lane} Gap: Channel between wide defender and central pivot is unguarded.`);
      } else if (anchorCount === 0) {
        status = 'Watch';
        detail = `Protected by transition shuttle (${coveringNodes.map((c) => c.label).join('/')}).`;
      }
    }

    return {
      lane: def.lane,
      status,
      coverageCount: totalCover,
      detail,
      xStart: def.xStart,
      xEnd: def.xEnd,
    };
  });

  const exposedCount = lanes.filter((l) => l.status === 'Exposed').length;
  const watchCount = lanes.filter((l) => l.status === 'Watch').length;
  const baseTotal = rearLineCount + screenLineCount;
  const rawStability =
    78 +
    Math.min(14, Math.max(-20, (baseTotal - 4) * 7)) +
    Math.min(8, shuttleCount * 2) -
    exposedCount * 16 -
    watchCount * 5;
  const stabilityScore = Math.max(20, Math.min(99, Math.round(rawStability)));

  const structureLabel =
    rearLineCount > 0 || screenLineCount > 0
      ? `${rearLineCount}-${screenLineCount} Rest-Defense Base (${shape})`
      : `Unanchored Transition Shape (${shape})`;

  return {
    structureLabel,
    baseDefenderCount: rearLineCount,
    pivotScreenCount: screenLineCount,
    shuttleCount,
    outletCount,
    stabilityScore,
    nodes,
    basePolygonPoints,
    lanes,
    alerts,
  };
}
