import { PlayerRecord } from '../types/fm27';
import {
  MISSING_VALUE,
  isPlaceholderValue,
} from './displayValue';
import { formatClubMoney } from './clubFinances';

import { isSuspensionActiveForCompetition } from './bestXiSolver';
import {
  ClubDnaPillarWeights,
  DEFAULT_CLUB_DNA_WEIGHTS,
  evaluatePlayerClubDna,
  loadPersistedClubDnaWeights,
} from './clubDnaEngine';
import {
  ContractStandingInsight,
  DevelopmentAdvice,
  DurabilityAssessment,
  PhysicalVerdictCard,
  evaluateContractStanding,
  evaluateDevelopmentAdvice,
  evaluateDurability,
  evaluatePhysicalVerdict,
  getRealShirtNumber,
} from './playerCardAnalysis';

export {
  MISSING_VALUE,
  formatAge,
  formatContractExpiry,
  formatNation,
  formatShortContractExpiry,
  isPlaceholderValue,
} from './displayValue';

export type SquadViewPresetId =
  | 'overview'
  | 'durability'
  | 'stats'
  | 'physical'
  | 'attributes'
  | 'contracts';

export type PositionGroupFilter = 'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD';
export type SquadUnitFilter = 'FIRST_TEAM' | 'YOUTH_RESERVES' | 'ALL';
export type AvailabilityFilter = 'ALL' | 'AVAILABLE' | 'UNAVAILABLE' | 'EXPIRING';

export type SquadSortKey =
  | 'position'
  | 'name'
  | 'age'
  | 'stars'
  | 'potential'
  | 'dna'
  | 'durability'
  | 'engine'
  | 'rating'
  | 'apps'
  | 'goals'
  | 'assists'
  | 'xGI'
  | 'wage'
  | 'value'
  | 'expiry';

export type SquadColumnId =
  | 'pos'
  | 'age'
  | 'stars'
  | 'roles'
  | 'durability'
  | 'dna'
  | 'availability'
  | 'staminaFit'
  | 'badges'
  | 'foot'
  | 'condSharp'
  | 'morale'
  | 'apps'
  | 'rating'
  | 'goalsXg'
  | 'assistsXa'
  | 'prPasses'
  | 'duels'
  | 'last5'
  | 'engine'
  | 'physCore'
  | 'speedJump'
  | 'heightFoot'
  | 'mentalKey'
  | 'techKey'
  | 'wage'
  | 'expiry'
  | 'renewalRisk'
  | 'value'
  | 'status'
  | 'devStage';

export interface SquadColumnMeta {
  id: SquadColumnId;
  label: string;
  shortLabel: string;
  align: 'left' | 'right';
  sortKey?: SquadSortKey;
  group: SquadViewPresetId;
}

export interface SquadViewPreset {
  id: SquadViewPresetId;
  label: string;
  shortLabel: string;
  description: string;
  defaultColumns: SquadColumnId[];
  cardMetrics: SquadColumnId[];
}

export const SQUAD_COLUMNS: Record<SquadColumnId, SquadColumnMeta> = {
  pos: { id: 'pos', label: 'Position', shortLabel: 'Pos', align: 'left', sortKey: 'position', group: 'overview' },
  age: { id: 'age', label: 'Age', shortLabel: 'Age', align: 'right', sortKey: 'age', group: 'overview' },
  stars: { id: 'stars', label: 'Ability / Pot', shortLabel: 'Stars', align: 'right', sortKey: 'stars', group: 'overview' },
  roles: { id: 'roles', label: 'IP / OOP Role', shortLabel: 'Role', align: 'left', group: 'overview' },
  durability: { id: 'durability', label: 'Durability', shortLabel: 'Durability', align: 'left', sortKey: 'durability', group: 'durability' },
  dna: { id: 'dna', label: 'Club DNA Fit', shortLabel: 'DNA Fit', align: 'right', sortKey: 'dna', group: 'overview' },
  availability: { id: 'availability', label: 'Availability', shortLabel: 'Avail.', align: 'left', group: 'durability' },
  staminaFit: { id: 'staminaFit', label: 'Stamina / Nat Fit', shortLabel: 'Sta / Fit', align: 'right', group: 'durability' },
  badges: { id: 'badges', label: 'Scout Badges', shortLabel: 'Badges', align: 'left', group: 'durability' },
  foot: { id: 'foot', label: 'Preferred Foot', shortLabel: 'Foot', align: 'left', group: 'durability' },
  condSharp: { id: 'condSharp', label: 'Condition / Sharpness', shortLabel: 'Cond / Sharp', align: 'right', group: 'durability' },
  morale: { id: 'morale', label: 'Morale', shortLabel: 'Morale', align: 'left', group: 'durability' },
  apps: { id: 'apps', label: 'Apps (Mins)', shortLabel: 'Apps', align: 'right', sortKey: 'apps', group: 'stats' },
  rating: { id: 'rating', label: 'Avg Rating', shortLabel: 'Rating', align: 'right', sortKey: 'rating', group: 'stats' },
  goalsXg: { id: 'goalsXg', label: 'Goals (xG)', shortLabel: 'Gls (xG)', align: 'right', sortKey: 'goals', group: 'stats' },
  assistsXa: { id: 'assistsXa', label: 'Assists (xA)', shortLabel: 'Ast (xA)', align: 'right', sortKey: 'assists', group: 'stats' },
  prPasses: { id: 'prPasses', label: 'Prog. Passes /90', shortLabel: 'PrP/90', align: 'right', group: 'stats' },
  duels: { id: 'duels', label: 'Header / Tackle %', shortLabel: 'Hdr / Tck', align: 'right', group: 'stats' },
  last5: { id: 'last5', label: 'Last 5 Form', shortLabel: 'Last 5', align: 'right', group: 'stats' },
  engine: { id: 'engine', label: 'Physical Verdict', shortLabel: 'Engine', align: 'right', sortKey: 'engine', group: 'physical' },
  physCore: { id: 'physCore', label: 'Pac / Acc / Sta / JR', shortLabel: 'P/A/S/J', align: 'right', sortKey: 'engine', group: 'physical' },
  speedJump: { id: 'speedJump', label: 'Top Speed / Jump', shortLabel: 'Speed / Jump', align: 'right', group: 'physical' },
  heightFoot: { id: 'heightFoot', label: 'Height / Foot', shortLabel: 'Ht / Foot', align: 'right', group: 'physical' },
  mentalKey: { id: 'mentalKey', label: 'Det / WR / Dec / OtB', shortLabel: 'Mental', align: 'right', group: 'attributes' },
  techKey: { id: 'techKey', label: 'Pas / FT / Fin / Tck', shortLabel: 'Technical / GK', align: 'right', group: 'attributes' },
  wage: { id: 'wage', label: 'Weekly Wage', shortLabel: 'Wage', align: 'right', sortKey: 'wage', group: 'contracts' },
  expiry: { id: 'expiry', label: 'Contract Expiry', shortLabel: 'Expires', align: 'right', sortKey: 'expiry', group: 'contracts' },
  renewalRisk: { id: 'renewalRisk', label: 'Renewal Risk', shortLabel: 'Risk', align: 'left', sortKey: 'expiry', group: 'contracts' },
  value: { id: 'value', label: 'Market Value', shortLabel: 'Value', align: 'right', sortKey: 'value', group: 'contracts' },
  status: { id: 'status', label: 'Squad Status', shortLabel: 'Status', align: 'left', group: 'contracts' },
  devStage: { id: 'devStage', label: 'Dev Stage', shortLabel: 'Stage', align: 'left', group: 'contracts' },
};

export const SQUAD_VIEW_PRESETS: SquadViewPreset[] = [
  {
    id: 'overview',
    label: 'Overview',
    shortLabel: 'Overview',
    description: 'Core squad snapshot: position, age, stars, durability, Club DNA fit and roles.',
    defaultColumns: ['pos', 'age', 'stars', 'durability', 'dna', 'roles', 'wage'],
    cardMetrics: ['durability', 'dna', 'wage'],
  },
  {
    id: 'durability',
    label: 'Durability & Selection',
    shortLabel: 'Durability',
    description: 'Stamina, natural fitness, condition/sharpness, injury risk, bans, scout badges and preferred foot.',
    defaultColumns: ['pos', 'durability', 'staminaFit', 'condSharp', 'availability', 'badges', 'foot'],
    cardMetrics: ['durability', 'staminaFit', 'condSharp'],
  },
  {
    id: 'stats',
    label: 'Season Stats & Form',
    shortLabel: 'Stats',
    description: 'Appearances, minutes, average match rating, goals/xG, assists/xA and recent form.',
    defaultColumns: ['pos', 'apps', 'rating', 'goalsXg', 'assistsXa', 'prPasses', 'duels', 'last5'],
    cardMetrics: ['apps', 'rating', 'goalsXg', 'assistsXa'],
  },
  {
    id: 'physical',
    label: 'Physical & Engine',
    shortLabel: 'Physical',
    description: 'FM27 physical engine score, pace/acceleration/stamina/jumping reach, top speed and height.',
    defaultColumns: ['pos', 'engine', 'physCore', 'speedJump', 'heightFoot', 'durability'],
    cardMetrics: ['engine', 'physCore', 'speedJump'],
  },
  {
    id: 'attributes',
    label: 'Key Attributes',
    shortLabel: 'Attributes',
    description: 'Core mental and technical attributes (automatically shows GK attributes for goalkeepers).',
    defaultColumns: ['pos', 'age', 'stars', 'mentalKey', 'techKey', 'physCore'],
    cardMetrics: ['mentalKey', 'techKey', 'physCore'],
  },
  {
    id: 'contracts',
    label: 'Contracts & Value',
    shortLabel: 'Contracts',
    description: 'Weekly wages, contract expiry, renewal risk, market value, squad status and development stage.',
    defaultColumns: ['pos', 'age', 'wage', 'expiry', 'renewalRisk', 'value', 'status', 'devStage'],
    cardMetrics: ['wage', 'expiry', 'renewalRisk', 'value'],
  },
];

export const ALL_CUSTOMISABLE_COLUMNS: SquadColumnId[] = [
  'pos',
  'age',
  'stars',
  'roles',
  'durability',
  'dna',
  'availability',
  'staminaFit',
  'condSharp',
  'badges',
  'foot',
  'morale',
  'apps',
  'rating',
  'goalsXg',
  'assistsXa',
  'prPasses',
  'duels',
  'last5',
  'engine',
  'physCore',
  'speedJump',
  'heightFoot',
  'mentalKey',
  'techKey',
  'wage',
  'expiry',
  'renewalRisk',
  'value',
  'status',
  'devStage',
];

const COLUMN_PREFS_STORAGE_KEY = 'fm27_squad_custom_columns_v1';

export type PersistedColumnMap = Partial<Record<SquadViewPresetId, SquadColumnId[]>>;

export function loadPersistedSquadColumns(): PersistedColumnMap {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(COLUMN_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: PersistedColumnMap = {};
    for (const preset of SQUAD_VIEW_PRESETS) {
      const list = (parsed as Record<string, unknown>)[preset.id];
      if (Array.isArray(list)) {
        const valid = list.filter(
          (id): id is SquadColumnId => typeof id === 'string' && id in SQUAD_COLUMNS
        );
        if (valid.length > 0) out[preset.id] = valid;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function savePersistedSquadColumns(map: PersistedColumnMap): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(COLUMN_PREFS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota / private mode failures
  }
}

export function getPositionGroup(pos: string): Exclude<PositionGroupFilter, 'ALL'> {
  const p = (pos || '').toUpperCase();
  if (p.includes('GK')) return 'GK';
  if (p.includes('ST') || p.includes('CF')) return 'FWD';
  if (/\b(DC|DL|DR|CB|WB|WBL|WBR)\b|D\s*\(/.test(p)) return 'DEF';
  return 'MID';
}

export function getSquadPositionOrder(pos: string): number {
  const p = (pos || '').toUpperCase().trim();
  if (p.includes('GK')) return 0;
  if (/\b(DL|LB|WBL)\b/.test(p)) return 1;
  if (/\b(DC|CB)\b|^D\s*\(C\)/.test(p)) return 2;
  if (/\b(DR|RB|WBR)\b/.test(p)) return 3;
  if (/^D\s*\(/.test(p)) return 2;
  if (/\bDM\b/.test(p)) return 4;
  if (/\b(MC|CM|ML|MR|M\s*\()/.test(p)) return 5;
  if (/\b(AMC|AM|AML|AMR|LW|RW)\b/.test(p)) return 6;
  if (/\b(ST|CF|SC)\b/.test(p)) return 7;
  return 8;
}

export function extractExpiryYear(expires?: string): string | null {
  if (!expires || isPlaceholderValue(expires)) return null;
  const m = expires.match(/\b(20\d{2})\b/);
  return m ? m[1] : null;
}

export function cleanPlayerNote(notes?: string): string | null {
  if (!notes) return null;
  const trimmed = notes.trim();
  if (!trimmed) return null;
  if (/^synced directly from \.fm save\.?$/i.test(trimmed)) return null;
  if (/^imported from (csv|html|save)\.?$/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * The ONE "has played" predicate. The Squad table and the Analyst squad profile both use it,
 * so a player with 0 recorded minutes can never look "played" in one place and blank in the other.
 */
export function hasPlayerMatchStats(player: PlayerRecord): boolean {
  return (
    (player.minutes || 0) > 0 ||
    (Boolean(player.apps) && player.apps !== '0') ||
    (player.goals || 0) > 0 ||
    (player.assists || 0) > 0 ||
    (typeof player.rating === 'number' && player.rating > 0)
  );
}

/** First team = the senior pool the War Room and pitch builder use (`teamSlot` 0/undefined). */
export function isFirstTeamPlayer(player: PlayerRecord): boolean {
  return player.teamSlot === undefined || player.teamSlot === 0;
}

export interface SquadPoolCounts {
  firstTeam: number;
  youthReserves: number;
  fullPool: number;
}

export function countSquadPool(
  players: ReadonlyArray<PlayerRecord> | null | undefined
): SquadPoolCounts {
  const list = players ?? [];
  const firstTeam = list.filter(isFirstTeamPlayer).length;
  return {
    firstTeam,
    youthReserves: list.length - firstTeam,
    fullPool: list.length,
  };
}

/**
 * One label for Hub header, Squad header and the Analyst prompt: First Team vs Full Pool.
 * Example: `24 First Team · 31 Full Pool (7 Youth/Reserves)`.
 */
export function describeSquadPool(counts: SquadPoolCounts): string {
  const base = `${counts.firstTeam} First Team · ${counts.fullPool} Full Pool`;
  return counts.youthReserves > 0
    ? `${base} (${counts.youthReserves} Youth/Reserves)`
    : base;
}

export function isSquadMissingMatchStats(players: PlayerRecord[]): boolean {
  return players.length > 0 && players.every((p) => !hasPlayerMatchStats(p));
}

export function resolveDefaultSortKey(players: PlayerRecord[]): SquadSortKey {
  if (players.length === 0) return 'position';
  return 'position';
}

export function formatCompactCurrency(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return MISSING_VALUE;
  }
  return formatClubMoney(value);
}

/**
 * The ONE weekly wage formatter (squad cards, detail modals, compare views and the Analyst).
 * `clubFinances.formatWeeklyWage` was deleted so this cannot drift again.
 */
export function formatWeeklyWage(wagePw?: number | null): string {
  if (typeof wagePw !== 'number' || !Number.isFinite(wagePw) || wagePw <= 0) {
    return MISSING_VALUE;
  }
  if (wagePw >= 1000) {
    return `£${(wagePw / 1000).toFixed(wagePw >= 10_000 ? 1 : 2)}K/wk`;
  }
  return `£${Math.round(wagePw)}/wk`;
}

export function parseAppsCount(apps?: string): number {
  if (!apps) return 0;
  const m = String(apps).match(/\d+/);
  return m ? Number(m[0]) : 0;
}

const DURABILITY_RANK: Record<DurabilityAssessment['tier'], number> = {
  Ironman: 4,
  Reliable: 3,
  'Manage Load': 2,
  Fragile: 1,
};

export interface EnrichedSquadRow {
  player: PlayerRecord;
  shirtNumber: number | null;
  posGroup: Exclude<PositionGroupFilter, 'ALL'>;
  posOrder: number;
  isGoalkeeper: boolean;
  durability: DurabilityAssessment;
  durabilityRank: number;
  physical: PhysicalVerdictCard;
  dnaFitPct: number;
  dnaArchetype: string;
  contract: ContractStandingInsight;
  development: DevelopmentAdvice;
  hasPlayed: boolean;
  isBanned: boolean;
  hasOtherCompBan: boolean;
  otherCompBanLabel: string | null;
  activeBanMatches: number;
  activeBanTooltip: string | null;
  isInjured: boolean;
  isExpiringSoon: boolean;
  expiryYear: string | null;
  optYears: number;
  cleanNote: string | null;
}

export function buildEnrichedSquadRows(
  players: PlayerRecord[],
  dnaWeights?: ClubDnaPillarWeights,
  nextCompetitionName?: string | null,
  divisionBenchmarks?: Parameters<typeof evaluatePlayerClubDna>[3]
): EnrichedSquadRow[] {
  const weights = dnaWeights || loadPersistedClubDnaWeights() || DEFAULT_CLUB_DNA_WEIGHTS;
  return players.map((player) => {
    const posGroup = getPositionGroup(player.position);
    const durability = evaluateDurability(player);
    const physical = evaluatePhysicalVerdict(player);
    const dna = evaluatePlayerClubDna(
      player.position,
      player.attributes,
      weights,
      divisionBenchmarks ?? null
    );
    const contract = evaluateContractStanding(player);
    const development = evaluateDevelopmentAdvice(player, null);
    const bans = Array.isArray(player.activeSuspensions)
      ? player.activeSuspensions
      : [];
    const activeNextBan =
      bans.find((b) => isSuspensionActiveForCompetition(b, nextCompetitionName)) ||
      null;
    const otherCompBan = !activeNextBan && bans.length > 0 ? bans[0] : null;
    const displayBan = activeNextBan || otherCompBan;
    const expiryYear = extractExpiryYear(player.expires);
    const isExpiringSoon = contract.renewalRisk === 'Expiring Soon';

    return {
      player,
      shirtNumber: getRealShirtNumber(player),
      posGroup,
      posOrder: getSquadPositionOrder(player.position),
      isGoalkeeper: posGroup === 'GK',
      durability,
      durabilityRank: DURABILITY_RANK[durability.tier],
      physical,
      dnaFitPct: dna.overallDnaScore,
      dnaArchetype: dna.bestArchetypeShortLabel,
      contract,
      development,
      hasPlayed: hasPlayerMatchStats(player),
      isBanned: Boolean(activeNextBan),
      hasOtherCompBan: Boolean(otherCompBan),
      otherCompBanLabel: otherCompBan
        ? otherCompBan.scope === 'cup'
          ? 'Cup Ban Only'
          : otherCompBan.scope === 'league'
            ? 'League Ban Only'
            : 'Other-Comp Ban'
        : null,
      activeBanMatches: displayBan?.matchesRemaining ?? 0,
      activeBanTooltip: activeNextBan
        ? `${activeNextBan.competitionName}: ${activeNextBan.reason}`
        : otherCompBan
          ? `${otherCompBan.competitionName} (${otherCompBan.reason}) — Eligible for next match`
          : null,
      isInjured: player.status === 'Injured',
      isExpiringSoon,
      expiryYear,
      optYears: player.contractDetails?.optionalExtensionYears ?? 0,
      cleanNote: cleanPlayerNote(player.notes),
    };
  });
}

export interface SquadFilterOptions {
  unit: SquadUnitFilter;
  search: string;
  posGroup: PositionGroupFilter;
  status: string;
  expiryYear: string;
  availability: AvailabilityFilter;
  sortKey: SquadSortKey;
  sortDir: 'asc' | 'desc';
}

export function countActiveSecondaryFilters(opts: {
  posGroup: PositionGroupFilter;
  status: string;
  expiryYear: string;
  availability: AvailabilityFilter;
}): number {
  let n = 0;
  if (opts.posGroup !== 'ALL') n += 1;
  if (opts.status !== 'ALL') n += 1;
  if (opts.expiryYear !== 'ALL') n += 1;
  if (opts.availability !== 'ALL') n += 1;
  return n;
}

export function filterAndSortSquadRows(
  rows: EnrichedSquadRow[],
  opts: SquadFilterOptions
): EnrichedSquadRow[] {
  const query = opts.search.trim().toLowerCase();

  const filtered = rows.filter((row) => {
    const p = row.player;
    const isFirstTeam = p.teamSlot === undefined || p.teamSlot === 0;
    const matchesUnit =
      opts.unit === 'ALL' || (opts.unit === 'FIRST_TEAM' ? isFirstTeam : !isFirstTeam);
    if (!matchesUnit) return false;

    if (opts.posGroup !== 'ALL' && row.posGroup !== opts.posGroup) return false;
    if (opts.status !== 'ALL' && p.status !== opts.status) return false;
    if (opts.expiryYear !== 'ALL' && row.expiryYear !== opts.expiryYear) return false;

    if (opts.availability === 'AVAILABLE' && (row.isBanned || row.isInjured)) {
      return false;
    }
    if (opts.availability === 'UNAVAILABLE' && !row.isBanned && !row.isInjured) {
      return false;
    }
    if (opts.availability === 'EXPIRING' && !row.isExpiringSoon) {
      return false;
    }

    if (query) {
      const hay = [
        p.name,
        p.position,
        p.ipRole,
        p.oopRole,
        p.nation,
        row.durability.tier,
        ...(p.scoutBadges || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(query)) return false;
    }

    return true;
  });

  const dir = opts.sortDir === 'asc' ? 1 : -1;

  return filtered.sort((a, b) => {
    let cmp = 0;
    switch (opts.sortKey) {
      case 'position':
        cmp = a.posOrder - b.posOrder;
        if (cmp === 0) {
          // Best players first within each position
          return (b.player.ability || 0) - (a.player.ability || 0);
        }
        return cmp * dir;
      case 'name':
        cmp = (a.player.name || '').localeCompare(b.player.name || '');
        return cmp * dir;
      case 'age':
        cmp = (a.player.age || 0) - (b.player.age || 0);
        return cmp * dir;
      case 'stars':
        cmp = (a.player.ability || 0) - (b.player.ability || 0);
        if (cmp === 0) cmp = (a.player.potential || 0) - (b.player.potential || 0);
        return cmp * dir;
      case 'potential':
        cmp = (a.player.potential || 0) - (b.player.potential || 0);
        return cmp * dir;
      case 'dna':
        cmp = a.dnaFitPct - b.dnaFitPct;
        return cmp * dir;
      case 'durability':
        cmp = a.durabilityRank - b.durabilityRank;
        if (cmp === 0) cmp = a.durability.stamina - b.durability.stamina;
        return cmp * dir;
      case 'engine':
        cmp = a.physical.score - b.physical.score;
        return cmp * dir;
      case 'rating': {
        const av = a.player.rating;
        const bv = b.player.rating;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * dir;
      }
      case 'apps':
        cmp = (a.player.minutes || 0) - (b.player.minutes || 0);
        if (cmp === 0) cmp = parseAppsCount(a.player.apps) - parseAppsCount(b.player.apps);
        return cmp * dir;
      case 'goals':
        cmp = (a.player.goals || 0) - (b.player.goals || 0);
        if (cmp === 0) cmp = (a.player.xG || 0) - (b.player.xG || 0);
        return cmp * dir;
      case 'assists':
        cmp = (a.player.assists || 0) - (b.player.assists || 0);
        if (cmp === 0) cmp = (a.player.xA || 0) - (b.player.xA || 0);
        return cmp * dir;
      case 'xGI':
        cmp =
          (a.player.xG || 0) +
          (a.player.xA || 0) -
          ((b.player.xG || 0) + (b.player.xA || 0));
        return cmp * dir;
      case 'wage': {
        const av = a.player.wagePw;
        const bv = b.player.wagePw;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * dir;
      }
      case 'value': {
        const av = a.player.marketValue;
        const bv = b.player.marketValue;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * dir;
      }
      case 'expiry': {
        if (!a.expiryYear && !b.expiryYear) return 0;
        if (!a.expiryYear) return 1;
        if (!b.expiryYear) return -1;
        cmp = Number(a.expiryYear) - Number(b.expiryYear);
        return cmp * dir;
      }
      default:
        return 0;
    }
  });
}

export interface SquadSummaryStats {
  count: number;
  avgAge: number | null;
  totalWagePw: number;
  bannedCount: number;
  injuredCount: number;
  expiringSoonCount: number;
}

export function computeSquadSummary(rows: EnrichedSquadRow[]): SquadSummaryStats {
  if (rows.length === 0) {
    return {
      count: 0,
      avgAge: null,
      totalWagePw: 0,
      bannedCount: 0,
      injuredCount: 0,
      expiringSoonCount: 0,
    };
  }
  let ageSum = 0;
  let ageCount = 0;
  let totalWagePw = 0;
  let bannedCount = 0;
  let injuredCount = 0;
  let expiringSoonCount = 0;

  for (const r of rows) {
    if (typeof r.player.age === 'number' && r.player.age > 0) {
      ageSum += r.player.age;
      ageCount += 1;
    }
    totalWagePw += r.player.wagePw || 0;
    if (r.isBanned) bannedCount += 1;
    if (r.isInjured) injuredCount += 1;
    if (r.isExpiringSoon) expiringSoonCount += 1;
  }

  return {
    count: rows.length,
    avgAge: ageCount > 0 ? Number((ageSum / ageCount).toFixed(1)) : null,
    totalWagePw,
    bannedCount,
    injuredCount,
    expiringSoonCount,
  };
}

export function getDefaultSortDirForKey(key: SquadSortKey): 'asc' | 'desc' {
  if (key === 'position' || key === 'name' || key === 'age' || key === 'expiry') {
    return 'asc';
  }
  return 'desc';
}
