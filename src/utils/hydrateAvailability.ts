/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalizePlayerName } from './fmFileImporter';
import type { ActiveSuspensionRecord } from '../types/fmSave';

export interface AvailabilityIndex {
  /** Every ban in the save, deduplicated, including the per-player copies. */
  suspensions: ActiveSuspensionRecord[];
  bansByUid: Map<number, ActiveSuspensionRecord[]>;
  injuredCount: number;
  isInjured: (uid?: number, name?: string) => boolean;
}

export interface AvailabilitySource {
  activeSuspensions?: ActiveSuspensionRecord[] | null;
  activeInjuries?: Array<{ playerUid?: number | null; playerName?: string | null }> | null;
  players: Array<{ activeSuspensions?: ActiveSuspensionRecord[] | null }>;
}

/**
 * A ban can appear both at the save root and on the player record, so the same
 * ban arrives twice. Deduplicate on the fields that describe the ban itself.
 */
export function buildAvailabilityIndex(decoded: AvailabilitySource): AvailabilityIndex {
  const suspensions: ActiveSuspensionRecord[] = [];
  const seen = new Set<string>();
  const pushBan = (ban: ActiveSuspensionRecord | null | undefined) => {
    if (!ban || typeof ban.matchesRemaining !== 'number' || ban.matchesRemaining <= 0) return;
    const key = `${ban.playerUid}|${ban.competitionName}|${ban.matchesRemaining}`;
    if (seen.has(key)) return;
    seen.add(key);
    suspensions.push(ban);
  };

  for (const ban of decoded.activeSuspensions || []) pushBan(ban);
  for (const player of decoded.players || []) {
    for (const ban of player.activeSuspensions || []) pushBan(ban);
  }

  const bansByUid = new Map<number, ActiveSuspensionRecord[]>();
  for (const ban of suspensions) {
    const existing = bansByUid.get(ban.playerUid) || [];
    existing.push(ban);
    bansByUid.set(ban.playerUid, existing);
  }

  const injuredUids = new Set<number>();
  const injuredNames = new Set<string>();
  for (const injury of decoded.activeInjuries || []) {
    if (!injury) continue;
    if (typeof injury.playerUid === 'number' && injury.playerUid > 0) {
      injuredUids.add(injury.playerUid);
    }
    if (typeof injury.playerName === 'string' && injury.playerName.trim()) {
      injuredNames.add(normalizePlayerName(injury.playerName));
    }
  }

  return {
    suspensions,
    bansByUid,
    injuredCount: injuredUids.size + injuredNames.size,
    isInjured: (uid, name) => {
      if (typeof uid === 'number' && uid > 0 && injuredUids.has(uid)) return true;
      if (name && injuredNames.has(normalizePlayerName(name))) return true;
      return false;
    },
  };
}
