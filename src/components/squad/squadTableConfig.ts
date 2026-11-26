import type { PlayerRecord } from '../../types/fm27';
import type { SquadSortKey } from '../../utils/squadViewHelpers';

export type SquadViewMode = 'table' | 'analytics' | 'compare' | 'progression';

export const SQUAD_VIEW_MODES: readonly SquadViewMode[] = [
  'table',
  'analytics',
  'compare',
  'progression',
];

/** Falls back to the default view for anything that is not a known mode. */
export function coerceSquadViewMode(value: string | null): SquadViewMode {
  return value && (SQUAD_VIEW_MODES as readonly string[]).includes(value)
    ? (value as SquadViewMode)
    : 'table';
}
export type ListDisplayMode = 'cards' | 'table';

export const COMPARE_ROWS: Array<{
  label: string;
  key: keyof PlayerRecord['attributes'];
}> = [
  { label: 'Pace', key: 'pace' },
  { label: 'Acceleration', key: 'acceleration' },
  { label: 'Stamina', key: 'stamina' },
  { label: 'Jumping Reach', key: 'jumpingReach' },
  { label: 'Passing', key: 'passing' },
  { label: 'First Touch', key: 'firstTouch' },
  { label: 'Finishing', key: 'finishing' },
  { label: 'Tackling', key: 'tackling' },
  { label: 'Decisions', key: 'decisions' },
  { label: 'Determination', key: 'determination' },
  { label: 'Work Rate', key: 'workRate' },
  { label: 'Off The Ball', key: 'offTheBall' },
];

export const SORT_OPTIONS: Array<{ value: SquadSortKey; label: string }> = [
  { value: 'position', label: 'Position (GK → FWD)' },
  { value: 'stars', label: 'Ability Stars' },
  { value: 'potential', label: 'Potential Stars' },
  { value: 'age', label: 'Age' },
  { value: 'dna', label: 'Club DNA Fit %' },
  { value: 'durability', label: 'Durability' },
  { value: 'engine', label: 'Physical Score' },
  { value: 'rating', label: 'Match Rating' },
  { value: 'apps', label: 'Minutes Played' },
  { value: 'goals', label: 'Goals' },
  { value: 'assists', label: 'Assists' },
  { value: 'xGI', label: 'xG + xA' },
  { value: 'wage', label: 'Weekly Wage' },
  { value: 'value', label: 'Market Value' },
  { value: 'expiry', label: 'Contract Expiry' },
  { value: 'name', label: 'Name (A–Z)' },
];

export const STATS_SORT_KEYS: ReadonlySet<SquadSortKey> = new Set([
  'rating',
  'apps',
  'goals',
  'assists',
  'xGI',
]);
