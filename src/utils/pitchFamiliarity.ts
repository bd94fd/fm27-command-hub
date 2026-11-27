/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlayerRecord } from '../types/fm27';

export const PITCH_ROWS: Array<Array<{ code: string; label: string }>> = [
  [{ code: 'ST', label: 'ST' }],
  [
    { code: 'AML', label: 'AML' },
    { code: 'AMC', label: 'AMC' },
    { code: 'AMR', label: 'AMR' },
  ],
  [
    { code: 'ML', label: 'ML' },
    { code: 'MC', label: 'MC' },
    { code: 'MR', label: 'MR' },
  ],
  [
    { code: 'WBL', label: 'WBL' },
    { code: 'DM', label: 'DM' },
    { code: 'WBR', label: 'WBR' },
  ],
  [
    { code: 'DL', label: 'DL' },
    { code: 'DC', label: 'DC' },
    { code: 'DR', label: 'DR' },
  ],
  [{ code: 'GK', label: 'GK' }],
];

/**
 * Familiarity for one pitch slot, 1–20. Explicit position ratings win; when the
 * save carries none, the player's listed positions are used as a fallback.
 */
export function getPositionScore(
  player: Pick<PlayerRecord, 'position' | 'positionRatings'>,
  code: string
): number {
  if (player.positionRatings) {
    if (typeof player.positionRatings[code] === 'number') {
      return player.positionRatings[code];
    }
    const upper = code.toUpperCase();
    if (upper === 'ST' && typeof player.positionRatings['STC'] === 'number') {
      return player.positionRatings['STC'];
    }
    if (upper === 'STC' && typeof player.positionRatings['ST'] === 'number') {
      return player.positionRatings['ST'];
    }
    const matchedKey = Object.keys(player.positionRatings).find(
      (k) => k.toUpperCase() === upper
    );
    if (matchedKey && typeof player.positionRatings[matchedKey] === 'number') {
      return player.positionRatings[matchedKey];
    }
  }
  const posUpper = player.position.toUpperCase();
  if (posUpper.includes(code)) return 19;
  if (code === 'DC' && /\bD\s*\([^)]*C/.test(posUpper)) return 19;
  if (code === 'DL' && /\bD\s*\([^)]*L/.test(posUpper)) return 18;
  if (code === 'DR' && /\bD\s*\([^)]*R/.test(posUpper)) return 18;
  if (code === 'AML' && /AM\s*\([^)]*L/.test(posUpper)) return 18;
  if (code === 'AMR' && /AM\s*\([^)]*R/.test(posUpper)) return 18;
  if (code === 'AMC' && /AM\s*\([^)]*C/.test(posUpper)) return 18;
  if (code === 'MC' && /\bM\s*\([^)]*C/.test(posUpper)) return 18;
  return 1;
}
