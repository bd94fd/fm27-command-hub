/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlayerRecord } from '../types/fm27';
import type { ActiveSuspensionRecord } from '../types/fmSave';
import {
  computeDurabilityProfile,
  isSuspensionActiveForCompetition,
  type SolvedSlot,
} from './bestXiSolver';
import type { SquadColumnId, SquadViewPresetId } from './squadViewHelpers';

export interface MobilePitchCoord {
  slotId: string;
  x: number;
  y: number;
}

export interface MobilePitchLayoutOptions {
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  minDx?: number;
  minDy?: number;
  iterations?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Deterministic collision-avoidance solver for mobile pitch nodes (360px–639px).
 * Keeps every compact node comfortably inside the pitch bounds and ensures no
 * two player badges overlap horizontally or vertically in IP, OOP, or Rest Defence.
 */
export function resolveMobilePitchCoordinates(
  nodes: MobilePitchCoord[],
  options: MobilePitchLayoutOptions = {}
): Map<string, { x: number; y: number }> {
  const minX = options.minX ?? 12;
  const maxX = options.maxX ?? 88;
  const minY = options.minY ?? 9;
  const maxY = options.maxY ?? 91;
  const minDx = options.minDx ?? 20;
  const minDy = options.minDy ?? 13.5;
  const iterations = options.iterations ?? 20;

  const working = nodes.map((n, index) => ({
    slotId: n.slotId,
    index,
    x: clamp(n.x, minX, maxX),
    y: clamp(n.y, minY, maxY),
  }));

  for (let iter = 0; iter < iterations; iter += 1) {
    let moved = false;

    for (let i = 0; i < working.length; i += 1) {
      for (let j = i + 1; j < working.length; j += 1) {
        const a = working[i];
        const b = working[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (absDx < minDx && absDy < minDy) {
          moved = true;
          const overlapX = minDx - absDx;
          const overlapY = minDy - absDy;

          // Push along whichever axis resolves the box overlap with less distortion
          if (overlapX / minDx <= overlapY / minDy) {
            const dir = dx === 0 ? (a.index < b.index ? 1 : -1) : Math.sign(dx);
            const shift = overlapX / 2 + 0.35;
            a.x = clamp(a.x - dir * shift, minX, maxX);
            b.x = clamp(b.x + dir * shift, minX, maxX);
          } else {
            const dir = dy === 0 ? (a.index < b.index ? 1 : -1) : Math.sign(dy);
            const shift = overlapY / 2 + 0.35;
            a.y = clamp(a.y - dir * shift, minY, maxY);
            b.y = clamp(b.y + dir * shift, minY, maxY);
          }
        }
      }
    }

    if (!moved) break;
  }

  const resolved = new Map<string, { x: number; y: number }>();
  for (const item of working) {
    resolved.set(item.slotId, {
      x: round1(clamp(item.x, minX, maxX)),
      y: round1(clamp(item.y, minY, maxY)),
    });
  }
  return resolved;
}

const SURNAME_PARTICLES = new Set([
  'van',
  'von',
  'de',
  'del',
  'della',
  'di',
  'da',
  'dos',
  'das',
  'el',
  'al',
  'le',
  'la',
  'st',
  'st.',
  'san',
  'ter',
  'ten',
  'den',
]);

/**
 * Extracts a crisp, readable surname for compact mobile pitch badges.
 */
export function formatMobileSurname(fullName: string): string {
  const cleaned = (fullName || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Empty';
  const parts = cleaned.split(' ');
  if (parts.length === 1) return parts[0];

  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (prev && SURNAME_PARTICLES.has(prev.toLowerCase())) {
    const combined = `${prev} ${last}`;
    if (combined.length <= 12) return combined;
  }
  return last;
}

export interface BenchRailEntry {
  player: PlayerRecord;
  isGoalkeeper: boolean;
  isSurplus: boolean;
  stamina: number;
  durabilityLabel: 'Ironman' | 'Durable' | 'Manage Load' | 'Low Sharpness' | 'Injury-Prone';
  cupBanOnly: boolean;
}

function isPlayerSurplus(p: PlayerRecord): boolean {
  if (p.status === 'Surplus') return true;
  const promised = p.contractDetails?.promisedPlayingTime || '';
  return /surplus/i.test(promised);
}

function isGoalkeeperPlayer(p: PlayerRecord): boolean {
  const pos = (p.position || '').toUpperCase();
  return pos === 'GK' || pos.startsWith('GK ') || pos.startsWith('GK/');
}

/**
 * Selects a realistic, mobile-friendly matchday bench rail (up to `maxBench`
 * subs, reserving 1 GK slot first) from squad players not in `activeSlots`.
 * Enforces the Surplus Law and competition-specific suspension rules.
 */
export function buildBenchRailPlayers(
  players: PlayerRecord[],
  activeSlots: SolvedSlot[],
  activeSuspensions: ActiveSuspensionRecord[] = [],
  nextCompetitionName: string | null = null,
  maxBench = 9
): BenchRailEntry[] {
  const starterIds = new Set(
    activeSlots.map((s) => s.player?.id).filter((id): id is string => Boolean(id))
  );

  const suspensionByName = new Map<string, ActiveSuspensionRecord[]>();
  for (const ban of activeSuspensions) {
    const key = (ban.playerName || '').trim().toLowerCase();
    if (!key) continue;
    const list = suspensionByName.get(key) || [];
    list.push(ban);
    suspensionByName.set(key, list);
  }

  const eligible: BenchRailEntry[] = [];
  for (const p of players) {
    if (starterIds.has(p.id)) continue;
    if (p.status === 'Injured') continue;

    const combinedBans = [
      ...(p.activeSuspensions || []),
      ...(suspensionByName.get(p.name.trim().toLowerCase()) || []),
    ];
    const bannedNextMatch = combinedBans.some((b) =>
      isSuspensionActiveForCompetition(b, nextCompetitionName)
    );
    if (bannedNextMatch) continue;

    const cupBanOnly = combinedBans.length > 0 && !bannedNextMatch;
    const dur = computeDurabilityProfile(p);
    eligible.push({
      player: p,
      isGoalkeeper: isGoalkeeperPlayer(p),
      isSurplus: isPlayerSurplus(p),
      stamina: dur.stamina,
      durabilityLabel: dur.label,
      cupBanOnly,
    });
  }

  const compareBenchPriority = (a: BenchRailEntry, b: BenchRailEntry): number => {
    // Surplus Law: active cover always ahead of Surplus To Requirements
    if (a.isSurplus !== b.isSurplus) return a.isSurplus ? 1 : -1;
    // First-team squad (slot 0 / undefined) ahead of reserves/youth unless higher ability
    const aUnit = a.player.teamSlot === undefined || a.player.teamSlot === 0 ? 0 : 1;
    const bUnit = b.player.teamSlot === undefined || b.player.teamSlot === 0 ? 0 : 1;
    const scoreA = (a.player.ability || 0) * 18 + a.stamina * 0.45 - aUnit * 3;
    const scoreB = (b.player.ability || 0) * 18 + b.stamina * 0.45 - bUnit * 3;
    if (Math.abs(scoreB - scoreA) > 0.01) return scoreB - scoreA;
    return a.player.name.localeCompare(b.player.name);
  };

  const gks = eligible.filter((e) => e.isGoalkeeper).sort(compareBenchPriority);
  const outfield = eligible.filter((e) => !e.isGoalkeeper).sort(compareBenchPriority);

  const selected: BenchRailEntry[] = [];
  if (gks.length > 0 && maxBench > 0) {
    selected.push(gks[0]);
  }
  const remainingSlots = Math.max(0, maxBench - selected.length);
  selected.push(...outfield.slice(0, remainingSlots));

  // If fewer outfield players than bench spots, backfill with extra GKs if present
  if (selected.length < maxBench && gks.length > 1) {
    selected.push(...gks.slice(1, 1 + (maxBench - selected.length)));
  }

  return selected;
}

const COMPLEMENTARY_CARD_KPIS: Record<SquadViewPresetId, SquadColumnId[]> = {
  overview: ['durability', 'dna', 'rating', 'wage', 'value', 'expiry'],
  durability: ['durability', 'staminaFit', 'condSharp', 'availability', 'apps'],
  stats: ['apps', 'rating', 'goalsXg', 'assistsXa'],
  physical: ['engine', 'physCore', 'speedJump', 'durability'],
  attributes: ['mentalKey', 'techKey', 'physCore', 'durability'],
  contracts: ['wage', 'expiry', 'renewalRisk', 'value'],
};

/**
 * Guarantees every mobile Squad card displays a complete 4-KPI block
 * (2×2 on phones, 4-across on sm+) without duplicate metric tiles.
 */
export function resolveCompleteCardColumns(
  cardMetricColumns: SquadColumnId[],
  presetId: SquadViewPresetId = 'overview'
): SquadColumnId[] {
  const unique: SquadColumnId[] = [];
  for (const col of cardMetricColumns) {
    if (!unique.includes(col)) unique.push(col);
  }
  const fallbacks = COMPLEMENTARY_CARD_KPIS[presetId] || COMPLEMENTARY_CARD_KPIS.overview;
  for (const col of fallbacks) {
    if (unique.length >= 4) break;
    if (!unique.includes(col)) unique.push(col);
  }
  return unique.slice(0, 4);
}
