/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Orders the save history of one club so the Journey report compares the newest
 * save with the one before it. Both the cold-start restore and the live import
 * path use this, so the two can never disagree about which save is "latest".
 */

export interface SaveHistoryLike {
  clubName?: string;
  inGameDate?: string;
  capturedAt: string;
}

export interface JourneyPair<T extends SaveHistoryLike> {
  latest: T;
  previous: T;
  sameClub: T[];
}

/** Reads the in-game date written as `DD/MM/YYYY`, falling back to any parseable date. */
export function parseSaveDateMs(raw: string | undefined): number {
  if (!raw) return 0;
  const dmy = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
  if (dmy) {
    return Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Picks the two newest saves for one club: the named club when given, otherwise the
 * club that owns the newest history point.
 * Returns null when the club has fewer than two saves, because a Journey needs a
 * before and an after.
 */
export function selectJourneyPair<T extends SaveHistoryLike>(
  items: readonly T[],
  clubName?: string
): JourneyPair<T> | null {
  if (items.length < 2) return null;
  const latestClub = (clubName ?? items[0].clubName ?? '').trim().toLowerCase();
  const sameClub = latestClub
    ? items.filter((i) => (i.clubName || '').trim().toLowerCase() === latestClub)
    : [...items];
  if (sameClub.length < 2) return null;

  const chronological = [...sameClub].sort((a, b) => {
    const da = parseSaveDateMs(a.inGameDate);
    const db = parseSaveDateMs(b.inGameDate);
    if (da !== db) return db - da;
    return b.capturedAt.localeCompare(a.capturedAt);
  });

  return { latest: chronological[0], previous: chronological[1], sameClub };
}
