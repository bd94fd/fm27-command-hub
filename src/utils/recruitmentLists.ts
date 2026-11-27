/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure list edits for recruitment cases and shortlists. The hook owns the React
 * state; these functions own the array maths so it can be tested directly.
 */

import type { RecruitmentCase, ShortlistRecord } from '../types/fm27';

export function appendRecruitmentCase(
  cases: readonly RecruitmentCase[],
  entry: Omit<RecruitmentCase, 'id' | 'updatedAt'>,
  id: string,
  updatedAt: string
): RecruitmentCase[] {
  return [{ ...entry, id, updatedAt }, ...cases];
}

export function patchRecruitmentCase(
  cases: readonly RecruitmentCase[],
  id: string,
  patch: Partial<RecruitmentCase>,
  updatedAt: string
): RecruitmentCase[] {
  return cases.map((entry) =>
    entry.id === id ? { ...entry, ...patch, updatedAt } : entry
  );
}

export function removeRecruitmentCase(
  cases: readonly RecruitmentCase[],
  id: string
): RecruitmentCase[] {
  return cases.filter((entry) => entry.id !== id);
}

export function appendShortlist(
  shortlists: readonly ShortlistRecord[],
  name: string,
  description: string,
  id: string,
  createdAt: string
): ShortlistRecord[] {
  return [{ id, name, description, playerIds: [], createdAt }, ...shortlists];
}

export function removeShortlist(
  shortlists: readonly ShortlistRecord[],
  id: string
): ShortlistRecord[] {
  return shortlists.filter((list) => list.id !== id);
}

export function addPlayerToShortlist(
  shortlists: readonly ShortlistRecord[],
  shortlistId: string,
  playerId: string
): ShortlistRecord[] {
  return shortlists.map((list) =>
    list.id === shortlistId && !list.playerIds.includes(playerId)
      ? { ...list, playerIds: [...list.playerIds, playerId] }
      : list
  );
}

export function removePlayerFromShortlist(
  shortlists: readonly ShortlistRecord[],
  shortlistId: string,
  playerId: string
): ShortlistRecord[] {
  return shortlists.map((list) =>
    list.id === shortlistId
      ? { ...list, playerIds: list.playerIds.filter((id) => id !== playerId) }
      : list
  );
}
