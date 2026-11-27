/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The share summary is the only thing a read-only link carries, plus its encoder and
 * decoder. It lives apart from the CSV, PNG and print builders so the app can read a
 * shared link without loading them.
 */

export interface ShareSummary {
  v: 1;
  club: string;
  saveDate: string;
  squad: number;
  staff: number;
  wageBillPw: number | null;
  wageBudgetPw: number | null;
  balance: number | null;
  runway: string;
  top: Array<{ n: string; p: string; r: string }>;
  created: string;
}

const SHARE_VERSION = 1;
/** Highest rated players, newest save first. Shared by the report card and the link. */
export function topPlayersByRating(
  players: ReadonlyArray<{ name: string; position: string; rating: number | null }>,
  limit = 5
) {
  return players
    .filter((player) => typeof player.rating === 'number' && Number.isFinite(player.rating))
    .slice()
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, limit)
    .map((player) => ({
      name: player.name,
      position: player.position,
      rating: (player.rating as number).toFixed(2),
    }));
}

export const SHARE_TOKEN_MAX_LENGTH = 3000;

function safeText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export interface ShareSummarySources {
  clubName: string;
  saveDate: string;
  players: ReadonlyArray<{ name: string; position: string; rating: number | null }>;
  staff?: ReadonlyArray<unknown> | null;
  finances?:
    | {
        payroll: { wagePayrollWeekly: number | null; wageBudgetWeekly: number | null };
        cash: { balanceAmount: number | null; runwayLabel: string };
      }
    | null;
  generatedAt?: Date;
}

export function buildShareSummary(context: ShareSummarySources): ShareSummary {
  const finances = context.finances ?? null;
  const generated = context.generatedAt ?? new Date();
  return {
    v: SHARE_VERSION,
    club: safeText(context.clubName, 60) || 'FM27 save',
    saveDate: safeText(context.saveDate, 40),
    squad: context.players.length,
    staff: (context.staff ?? []).length,
    wageBillPw: safeNumber(finances?.payroll.wagePayrollWeekly ?? null),
    wageBudgetPw: safeNumber(finances?.payroll.wageBudgetWeekly ?? null),
    balance: safeNumber(finances?.cash.balanceAmount ?? null),
    runway: safeText(finances?.cash.runwayLabel ?? '', 40),
    top: topPlayersByRating(context.players).map((player) => ({
      n: safeText(player.name, 40),
      p: safeText(player.position, 6),
      r: player.rating,
    })),
    created: generated.toISOString().slice(0, 10),
  };
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): string | null {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeShareSummary(summary: ShareSummary): string | null {
  try {
    const token = toBase64Url(JSON.stringify(summary));
    return token.length > SHARE_TOKEN_MAX_LENGTH ? null : token;
  } catch {
    return null;
  }
}

/**
 * Decodes a shared summary and drops anything that does not match the shape.
 * Returns null rather than throwing so a mangled link can never break the app.
 */
export function decodeShareSummary(token: string | null | undefined): ShareSummary | null {
  if (!token || typeof token !== 'string') return null;
  if (token.length > SHARE_TOKEN_MAX_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const json = fromBase64Url(token);
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = parsed as Record<string, unknown>;
  if (raw.v !== SHARE_VERSION) return null;
  const club = safeText(raw.club, 60);
  if (!club) return null;
  const top = Array.isArray(raw.top)
    ? raw.top
        .slice(0, 10)
        .map((entry) => {
          const item = (entry ?? {}) as Record<string, unknown>;
          return {
            n: safeText(item.n, 40),
            p: safeText(item.p, 6),
            r: safeText(item.r, 6),
          };
        })
        .filter((item) => item.n)
    : [];
  return {
    v: SHARE_VERSION,
    club,
    saveDate: safeText(raw.saveDate, 40),
    squad: Math.max(0, Math.min(999, Math.round(safeNumber(raw.squad) ?? 0))),
    staff: Math.max(0, Math.min(999, Math.round(safeNumber(raw.staff) ?? 0))),
    wageBillPw: safeNumber(raw.wageBillPw),
    wageBudgetPw: safeNumber(raw.wageBudgetPw),
    balance: safeNumber(raw.balance),
    runway: safeText(raw.runway, 40),
    top,
    created: safeText(raw.created, 10),
  };
}

/** Plain-English list of what a shared link reveals, shown before it is copied. */
export function describeShareSummary(summary: ShareSummary): string[] {
  const lines = [
    `Club name and save date (${summary.club}${summary.saveDate ? `, ${summary.saveDate}` : ''})`,
    `Squad and staff counts (${summary.squad} players, ${summary.staff} staff)`,
    'Wage bill, wage budget, balance and runway',
  ];
  if (summary.top.length > 0) {
    lines.push(`Your ${summary.top.length} highest rated players and their ratings`);
  }
  lines.push('Nothing else: no player list, no wages per player, no contracts, no chat history');
  return lines;
}

