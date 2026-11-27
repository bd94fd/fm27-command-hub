/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatNation } from './displayValue';
import type { PlayerRecord } from '../types/fm27';
import type { RecruitmentTarget } from '../types/fmSave';

/**
 * The scout target a squad player maps onto. A player already in the decoded
 * scout pool keeps that pool entry, so tracking a squad player and tracking the
 * same name from the Transfers tab agree on one row.
 */
export function buildScoutTargetFromPlayer(
  player: PlayerRecord,
  scoutPool: readonly RecruitmentTarget[]
): RecruitmentTarget {
  const matched = scoutPool.find(
    (target) =>
      (typeof player.uid === 'number' && target.uid === player.uid) ||
      target.name.trim().toLowerCase() === player.name.trim().toLowerCase()
  );
  if (matched) return matched;

  return {
    uid: player.uid || 0,
    name: player.name,
    age: player.age,
    nationality: formatNation(player.nation),
    primaryPosition: player.position,
    isFreeAgent:
      player.wagePw === 0 ||
      (player.expires || '').toLowerCase().includes('free'),
    contractExpiryMonths: player.contractExpiryMonths ?? 6,
    expires: player.expires,
    demandedWageEur: player.wagePw || 0,
    scoutBadges: player.scoutBadges,
    traits: player.traits,
    attributes: player.attributes,
  };
}
