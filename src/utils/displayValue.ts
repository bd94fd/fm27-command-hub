/**
 * Display primitives shared by startup code, squad views and staff views.
 * Kept separate from squadViewHelpers so the App shell does not pull the
 * player-card, recruitment and club-DNA engines into first load.
 */

/**
 * The ONE missing-value placeholder for every squad/staff surface (UI and Analyst), so an empty
 * value never renders as `undefined`, `N/A`, `-` or an em dash in one place and `--` in another.
 */
export const MISSING_VALUE = '--';

const PLACEHOLDER_STRINGS = new Set([
  '',
  '-',
  '--',
  '---',
  '—',
  '–',
  'n/a',
  'na',
  'null',
  'undefined',
  'unknown',
  'fm',
  'none',
  'tbd',
]);

/** True when a string carries no data (all empty markers the app emits). */
export function isPlaceholderValue(raw?: string | null): boolean {
  if (raw === null || raw === undefined) return true;
  return PLACEHOLDER_STRINGS.has(String(raw).trim().toLowerCase());
}

/** Age as a display string, or MISSING_VALUE — never a plausible invented age. */
export function formatAge(age?: number | null): string {
  return typeof age === 'number' && Number.isFinite(age) && age > 0
    ? String(Math.round(age))
    : MISSING_VALUE;
}

/** Nationality as a display string, or MISSING_VALUE — never "FM"/"Unknown"/"N/A". */
export function formatNation(nation?: string | null): string {
  return isPlaceholderValue(nation) ? MISSING_VALUE : String(nation).trim();
}

/** Raw contract expiry string, or MISSING_VALUE — never `undefined`/`N/A` leaking through. */
export function formatContractExpiry(expires?: string | null): string {
  return isPlaceholderValue(expires) ? MISSING_VALUE : String(expires).trim();
}

/** Context-budget-friendly contract expiry (MM/YY), or MISSING_VALUE. */
export function formatShortContractExpiry(expires?: string | null): string {
  const raw = formatContractExpiry(expires);
  if (raw === MISSING_VALUE) return MISSING_VALUE;
  const dmy = raw.match(/(\d{1,2})\/(\d{1,2})\/20(\d{2})/);
  if (dmy) return `${dmy[2].padStart(2, '0')}/${dmy[3]}`;
  const iso = raw.match(/20(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[1]}`;
  return raw;
}
