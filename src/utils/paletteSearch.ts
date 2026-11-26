/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ranking for the command palette. Kept pure so the behaviour a person feels when
 * they type a name can be tested without a browser.
 */

export interface RankableItem {
  title: string;
  subtitle?: string;
  category: string;
}

export interface RankOptions {
  /** Items shown when nothing is typed. */
  emptyLimit?: number;
  /** Items shown once a query is typed. */
  totalLimit?: number;
  /** Cap per category, so one long list cannot hide the others. */
  perCategoryLimit?: number;
}

const DEFAULTS = {
  emptyLimit: 28,
  totalLimit: 30,
  perCategoryLimit: 6,
};

const normalise = (value: string) => value.toLowerCase().trim();

/**
 * Higher is better. A name that starts with the query outranks a command whose
 * description happens to contain it.
 */
export function scorePaletteItem(item: RankableItem, query: string): number {
  const q = normalise(query);
  if (!q) return 0;
  const title = normalise(item.title);
  const subtitle = normalise(item.subtitle ?? '');
  const category = normalise(item.category);

  if (title === q) return 120;
  if (title.startsWith(q)) return 100;
  if (title.split(/[\s'’.-]+/).some((word) => word.startsWith(q))) return 80;
  if (title.includes(q)) return 60;
  if (subtitle.includes(q)) return 30;
  if (category.includes(q)) return 15;
  return 0;
}

export function rankPaletteItems<T extends RankableItem>(
  items: T[],
  query: string,
  options: RankOptions = {}
): T[] {
  const { emptyLimit, totalLimit, perCategoryLimit } = { ...DEFAULTS, ...options };
  const q = normalise(query);
  if (!q) return items.slice(0, emptyLimit);

  const scored = items
    .map((item) => ({ item, score: scorePaletteItem(item, q) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.item.title.length - b.item.title.length ||
        a.item.title.localeCompare(b.item.title)
    );

  const perCategory = new Map<string, number>();
  const out: T[] = [];
  for (const { item } of scored) {
    const used = perCategory.get(item.category) ?? 0;
    if (used >= perCategoryLimit) continue;
    perCategory.set(item.category, used + 1);
    out.push(item);
    if (out.length >= totalLimit) break;
  }
  return out;
}
