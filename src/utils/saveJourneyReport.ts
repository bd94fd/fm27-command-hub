/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Snapshot-to-snapshot diffing and the save-to-save journey report.
 * Moved out of src/services/saveCache.ts, which re-exports both so existing imports keep working.
 */
import { computeSquadWageSubtotal, formatSignedClubMoney } from './clubFinances';
import { formatAge } from './squadViewHelpers';
import {
  CompetitionBucketRecord,
  CompetitionScopeBreakdown,
  deriveFootballSeasonLabel,
  formatBucketCompactSummary,
  summarizeMatchesByScope,
} from './matchScopeHelpers';
import type { MatchLogEntry } from '../types/fm27';
import type { CompactPlayerSnapshot, SaveHistoryPoint } from '../services/saveCache';

export interface JourneyTimelinePoint {
  cacheKey: string;
  inGameDate: string;
  seasonLabel: string;
  leaguePosition: number | null;
  points: number | null;
  played: number | null;
  ppg: number | null;
  xgDiff: number | null;
  leagueXgDiff: number | null;
  cupPlayed: number;
  friendlyPlayed: number;
  balanceNum: number | null;
  totalWagePw: number;
  clubWagePayrollWeekly?: number | null;
  avgAbility: number;
  avgAge: number;
  squadCount: number;
}

export interface JourneyFindingItem {
  category: 'results' | 'analytics' | 'finances' | 'squad' | 'tactics' | 'governance';
  title: string;
  detail: string;
  deltaLabel?: string;
}

export interface DeepJourneyReport {
  fromDate: string;
  toDate: string;
  fromSeason: string;
  toSeason: string;
  sameSeason: boolean;
  clubName: string;
  baseDiff: SnapshotDiffSummary;
  timeline: JourneyTimelinePoint[];
  competitionComparison: {
    from: CompetitionScopeBreakdown | null;
    to: CompetitionScopeBreakdown | null;
    league: {
      from: CompetitionBucketRecord | null;
      to: CompetitionBucketRecord | null;
    };
    cup: {
      from: CompetitionBucketRecord | null;
      to: CompetitionBucketRecord | null;
    };
    friendly: {
      from: CompetitionBucketRecord | null;
      to: CompetitionBucketRecord | null;
    };
    competitive: {
      from: CompetitionBucketRecord | null;
      to: CompetitionBucketRecord | null;
    };
  };
  improved: JourneyFindingItem[];
  worsened: JourneyFindingItem[];
  thingsToNote: JourneyFindingItem[];
  playerStatDeltas: Array<{
    uid: number;
    name: string;
    position: string;
    goalsDelta: number;
    assistsDelta: number;
    minutesDelta: number;
    ratingFrom: number | null;
    ratingTo: number | null;
    ratingDelta: number | null;
  }>;
  aiPayload: Record<string, unknown>;
}

export interface PlayerGrowthDelta {
  uid: number;
  name: string;
  position: string;
  age: number;
  abilityDelta: number;
  potentialDelta: number;
  valueDelta: number | null;
  isNewgen: boolean;
}

export interface ContractChangeDelta {
  uid: number;
  name: string;
  position: string;
  previousExpires: string;
  currentExpires: string;
  previousWagePw: number;
  currentWagePw: number;
  wageDeltaPw: number;
}

export interface SnapshotKpiDeltas {
  squadCountDelta: number;
  fromSquadCount: number;
  toSquadCount: number;
  avgAbilityDelta: number;
  fromAvgAbility: number;
  toAvgAbility: number;
  totalWageDeltaPw: number;
  fromTotalWagePw: number;
  toTotalWagePw: number;
  /** Players whose weekly wage did not decode; the totals above are known-wage sums only. */
  fromWageMissingCount?: number;
  toWageMissingCount?: number;
  fromClubWagePayrollWeekly?: number | null;
  toClubWagePayrollWeekly?: number | null;
  clubWagePayrollDeltaPw?: number | null;
  toWageBudgetWeekly?: number | null;
  fromBalance?: string;
  toBalance?: string;
  fromLeaguePosition?: number | null;
  toLeaguePosition?: number | null;
}

export interface SnapshotDiffSummary {
  fromDate: string;
  toDate: string;
  totalTracked: number;
  risers: PlayerGrowthDelta[];
  fallers: PlayerGrowthDelta[];
  newgens: PlayerGrowthDelta[];
  departed: CompactPlayerSnapshot[];
  contractChanges: ContractChangeDelta[];
  kpiDeltas: SnapshotKpiDeltas;
}

/**
 * Compares two save history points to compute player growth deltas, contract/wage
 * changes, departed players, KPI deltas, and newly appeared players (Youth Intake Radar).
 */
export function diffSaveHistoryPoints(
  previous: SaveHistoryPoint,
  current: SaveHistoryPoint
): SnapshotDiffSummary {
  const prevByUid = new Map<number, CompactPlayerSnapshot>();
  for (const p of previous.players) {
    prevByUid.set(p.uid, p);
  }
  const currByUid = new Map<number, CompactPlayerSnapshot>();
  for (const p of current.players) {
    currByUid.set(p.uid, p);
  }

  const risers: PlayerGrowthDelta[] = [];
  const fallers: PlayerGrowthDelta[] = [];
  const newgens: PlayerGrowthDelta[] = [];
  const departed: CompactPlayerSnapshot[] = [];
  const contractChanges: ContractChangeDelta[] = [];

  for (const prev of previous.players) {
    if (!currByUid.has(prev.uid)) {
      departed.push(prev);
    }
  }

  for (const curr of current.players) {
    const prev = prevByUid.get(curr.uid);
    if (!prev) {
      newgens.push({
        uid: curr.uid,
        name: curr.name,
        position: curr.position,
        age: curr.age,
        abilityDelta: 0,
        potentialDelta: 0,
        valueDelta: curr.marketValue,
        isNewgen: true,
      });
      continue;
    }

    const abilityDelta = Number((curr.ability - prev.ability).toFixed(2));
    const potentialDelta = Number((curr.potential - prev.potential).toFixed(2));
    const valueDelta =
      curr.marketValue != null && prev.marketValue != null
        ? curr.marketValue - prev.marketValue
        : null;

    if (abilityDelta > 0) {
      risers.push({
        uid: curr.uid,
        name: curr.name,
        position: curr.position,
        age: curr.age,
        abilityDelta,
        potentialDelta,
        valueDelta,
        isNewgen: false,
      });
    } else if (abilityDelta < 0) {
      fallers.push({
        uid: curr.uid,
        name: curr.name,
        position: curr.position,
        age: curr.age,
        abilityDelta,
        potentialDelta,
        valueDelta,
        isNewgen: false,
      });
    }

    const prevExpires = (prev.expires || '--').trim();
    const currExpires = (curr.expires || '--').trim();
    const wageDeltaPw =
      Number.isFinite(curr.wagePw) && Number.isFinite(prev.wagePw)
        ? curr.wagePw - prev.wagePw
        : 0;
    if (prevExpires !== currExpires || wageDeltaPw !== 0) {
      contractChanges.push({
        uid: curr.uid,
        name: curr.name,
        position: curr.position,
        previousExpires: prevExpires,
        currentExpires: currExpires,
        previousWagePw: prev.wagePw,
        currentWagePw: curr.wagePw,
        wageDeltaPw,
      });
    }
  }

  risers.sort((a, b) => b.abilityDelta - a.abilityDelta);
  fallers.sort((a, b) => a.abilityDelta - b.abilityDelta);
  newgens.sort((a, b) => a.age - b.age || b.uid - a.uid);
  departed.sort((a, b) => b.ability - a.ability);
  contractChanges.sort((a, b) => Math.abs(b.wageDeltaPw) - Math.abs(a.wageDeltaPw));

  const fromAvgAbility =
    previous.players.length > 0
      ? Number(
          (
            previous.players.reduce((sum, p) => sum + p.ability, 0) /
            previous.players.length
          ).toFixed(2)
        )
      : 0;
  const toAvgAbility =
    current.players.length > 0
      ? Number(
          (
            current.players.reduce((sum, p) => sum + p.ability, 0) /
            current.players.length
          ).toFixed(2)
        )
      : 0;
  const fromWageSubtotal = computeSquadWageSubtotal(
    previous.players.map((p) => p.wagePw)
  );
  const toWageSubtotal = computeSquadWageSubtotal(
    current.players.map((p) => p.wagePw)
  );
  const fromTotalWagePw = fromWageSubtotal.knownWeekly;
  const toTotalWagePw = toWageSubtotal.knownWeekly;
  const fromClubWagePayrollWeekly =
    typeof previous.wagePayrollWeekly === 'number' && Number.isFinite(previous.wagePayrollWeekly)
      ? previous.wagePayrollWeekly
      : null;
  const toClubWagePayrollWeekly =
    typeof current.wagePayrollWeekly === 'number' && Number.isFinite(current.wagePayrollWeekly)
      ? current.wagePayrollWeekly
      : null;
  const clubWagePayrollDeltaPw =
    fromClubWagePayrollWeekly !== null && toClubWagePayrollWeekly !== null
      ? toClubWagePayrollWeekly - fromClubWagePayrollWeekly
      : null;

  return {
    fromDate: previous.inGameDate,
    toDate: current.inGameDate,
    totalTracked: current.players.length,
    risers,
    fallers,
    newgens,
    departed,
    contractChanges,
    kpiDeltas: {
      squadCountDelta: current.players.length - previous.players.length,
      fromSquadCount: previous.players.length,
      toSquadCount: current.players.length,
      avgAbilityDelta: Number((toAvgAbility - fromAvgAbility).toFixed(2)),
      fromAvgAbility,
      toAvgAbility,
      totalWageDeltaPw: toTotalWagePw - fromTotalWagePw,
      fromTotalWagePw,
      toTotalWagePw,
      fromWageMissingCount: fromWageSubtotal.missingWageCount,
      toWageMissingCount: toWageSubtotal.missingWageCount,
      fromClubWagePayrollWeekly,
      toClubWagePayrollWeekly,
      clubWagePayrollDeltaPw,
      toWageBudgetWeekly:
        typeof current.wageBudgetWeekly === 'number' && Number.isFinite(current.wageBudgetWeekly)
          ? current.wageBudgetWeekly
          : null,
      fromBalance: previous.balance,
      toBalance: current.balance,
      fromLeaguePosition: previous.leaguePosition ?? null,
      toLeaguePosition: current.leaguePosition ?? null,
    },
  };
}

function parseDmyOrder(dmy: string): number {
  const m = (dmy || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const iso = Date.parse(dmy || '');
  return Number.isFinite(iso) ? iso : 0;
}

/**
 * Generates an instant deterministic Deep Save-to-Save Journey Report across
 * two snapshots (plus chronological timeline across all stored save points).
 * Strictly ZERO raw CA/PA values.
 */
export function buildDeepJourneyReport(
  previous: SaveHistoryPoint,
  current: SaveHistoryPoint,
  allSnapshots: SaveHistoryPoint[] = [previous, current],
  liveMatches?: MatchLogEntry[]
): DeepJourneyReport {
  const baseDiff = diffSaveHistoryPoints(previous, current);

  const fromSeason =
    previous.seasonLabel || deriveFootballSeasonLabel(previous.inGameDate);
  const toSeason =
    current.seasonLabel || deriveFootballSeasonLabel(current.inGameDate);
  const sameSeason =
    fromSeason === toSeason ||
    fromSeason === 'Unknown Season' ||
    toSeason === 'Unknown Season';

  // Sanitize legacy cached snapshots where pre-season friendlies ("League / Cup") were dumped into Cup
  // (e.g. 8 Cup GP with 5 losses — impossible in a single-elimination domestic cup).
  const sanitizeCachedBreakdown = (
    bd: CompetitionScopeBreakdown | null | undefined
  ): CompetitionScopeBreakdown | null => {
    if (!bd) return null;
    if (bd.cup.lost >= 2 && bd.cup.played >= 3) {
      const mergedFriendlyPlayed = bd.friendly.played + bd.cup.played;
      const mergedFriendlyWon = bd.friendly.won + bd.cup.won;
      const mergedFriendlyDrawn = bd.friendly.drawn + bd.cup.drawn;
      const mergedFriendlyLost = bd.friendly.lost + bd.cup.lost;
      const mergedFriendlyGf = bd.friendly.goalsFor + bd.cup.goalsFor;
      const mergedFriendlyGa = bd.friendly.goalsAgainst + bd.cup.goalsAgainst;
      const mergedFriendlyXgCount = bd.friendly.xgMatchesCount + bd.cup.xgMatchesCount;
      const mergedFriendlyXgFor =
        mergedFriendlyXgCount > 0
          ? Number(((bd.friendly.xgFor ?? 0) + (bd.cup.xgFor ?? 0)).toFixed(2))
          : null;
      const mergedFriendlyXgAgainst =
        mergedFriendlyXgCount > 0
          ? Number(((bd.friendly.xgAgainst ?? 0) + (bd.cup.xgAgainst ?? 0)).toFixed(2))
          : null;
      const mergedFriendlyXgDiff =
        mergedFriendlyXgFor !== null && mergedFriendlyXgAgainst !== null
          ? Number((mergedFriendlyXgFor - mergedFriendlyXgAgainst).toFixed(2))
          : null;
      return {
        ...bd,
        competitive: { ...bd.league },
        cup: {
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          points: 0,
          xgMatchesCount: 0,
          xgFor: null,
          xgAgainst: null,
          xgDiff: null,
        },
        friendly: {
          played: mergedFriendlyPlayed,
          won: mergedFriendlyWon,
          drawn: mergedFriendlyDrawn,
          lost: mergedFriendlyLost,
          goalsFor: mergedFriendlyGf,
          goalsAgainst: mergedFriendlyGa,
          points: mergedFriendlyWon * 3 + mergedFriendlyDrawn,
          xgMatchesCount: mergedFriendlyXgCount,
          xgFor: mergedFriendlyXgFor,
          xgAgainst: mergedFriendlyXgAgainst,
          xgDiff: mergedFriendlyXgDiff,
        },
      };
    }
    return bd;
  };

  // Resolve competition breakdowns: always prefer freshly classified liveMatches for active save so stale cache fixes automatically
  const fromBreakdown: CompetitionScopeBreakdown | null = sanitizeCachedBreakdown(
    previous.competitionBreakdown
  );
  const liveToBreakdown: CompetitionScopeBreakdown | null =
    Array.isArray(liveMatches) && liveMatches.length > 0
      ? summarizeMatchesByScope(
          liveMatches,
          toSeason !== 'Unknown Season' ? toSeason : undefined
        )
      : null;
  const toBreakdown: CompetitionScopeBreakdown | null =
    liveToBreakdown && liveToBreakdown.all.played > 0
      ? liveToBreakdown
      : sanitizeCachedBreakdown(current.competitionBreakdown);

  // Build chronological timeline across all unique saves for this club
  const clubSnaps = allSnapshots
    .filter((s) => !current.clubName || s.clubName === current.clubName)
    .sort((a, b) => {
      const da = parseDmyOrder(a.inGameDate);
      const db = parseDmyOrder(b.inGameDate);
      return da !== db ? da - db : a.capturedAt.localeCompare(b.capturedAt);
    });

  const timeline: JourneyTimelinePoint[] = clubSnaps.map((s) => {
    const snapSeason = s.seasonLabel || deriveFootballSeasonLabel(s.inGameDate);
    const snapBreakdown =
      s.cacheKey === current.cacheKey && toBreakdown
        ? toBreakdown
        : sanitizeCachedBreakdown(s.competitionBreakdown);
    const squadCount = s.players.length;
    const avgAbility =
      squadCount > 0
        ? Number((s.players.reduce((sum, p) => sum + p.ability, 0) / squadCount).toFixed(2))
        : 0;
    const avgAge =
      squadCount > 0
        ? Number((s.players.reduce((sum, p) => sum + p.age, 0) / squadCount).toFixed(1))
        : 0;
    const totalWagePw = computeSquadWageSubtotal(
      s.players.map((p) => p.wagePw)
    ).knownWeekly;
    const ppg =
      typeof s.played === 'number' && s.played > 0 && typeof s.points === 'number'
        ? Number((s.points / s.played).toFixed(2))
        : null;
    // Prefer competitive (League + Cup) xG diff when available so friendlies don't distort trajectory
    const xgDiff =
      snapBreakdown && snapBreakdown.competitive.xgDiff !== null
        ? snapBreakdown.competitive.xgDiff
        : typeof s.xgFor === 'number' && typeof s.xgAgainst === 'number'
          ? Number((s.xgFor - s.xgAgainst).toFixed(2))
          : null;
    const leagueXgDiff = snapBreakdown?.league.xgDiff ?? null;
    return {
      cacheKey: s.cacheKey,
      inGameDate: s.inGameDate,
      seasonLabel: snapSeason,
      leaguePosition: s.leaguePosition ?? null,
      points: s.points ?? null,
      played: s.played ?? null,
      ppg,
      xgDiff,
      leagueXgDiff,
      cupPlayed: snapBreakdown?.cup.played ?? 0,
      friendlyPlayed: snapBreakdown?.friendly.played ?? 0,
      balanceNum: s.balanceNum ?? null,
      totalWagePw,
      clubWagePayrollWeekly:
        typeof s.wagePayrollWeekly === 'number' && Number.isFinite(s.wagePayrollWeekly)
          ? s.wagePayrollWeekly
          : null,
      avgAbility,
      avgAge,
      squadCount,
    };
  });

  // Player match-stat deltas between saves (only subtract within the same football season!)
  const prevByUid = new Map(previous.players.map((p) => [p.uid, p]));
  const playerStatDeltas: DeepJourneyReport['playerStatDeltas'] = [];
  if (sameSeason) {
    for (const curr of current.players) {
      const prev = prevByUid.get(curr.uid);
      if (!prev) continue;
      const goalsDelta = (curr.goals ?? 0) - (prev.goals ?? 0);
      const assistsDelta = (curr.assists ?? 0) - (prev.assists ?? 0);
      const minutesDelta = (curr.minutes ?? 0) - (prev.minutes ?? 0);
      const ratingFrom = prev.rating ?? null;
      const ratingTo = curr.rating ?? null;
      const ratingDelta =
        ratingFrom !== null && ratingTo !== null
          ? Number((ratingTo - ratingFrom).toFixed(2))
          : null;
      if (
        goalsDelta !== 0 ||
        assistsDelta !== 0 ||
        minutesDelta >= 90 ||
        (ratingDelta !== null && Math.abs(ratingDelta) >= 0.15)
      ) {
        playerStatDeltas.push({
          uid: curr.uid,
          name: curr.name,
          position: curr.position,
          goalsDelta,
          assistsDelta,
          minutesDelta,
          ratingFrom,
          ratingTo,
          ratingDelta,
        });
      }
    }
    playerStatDeltas.sort(
      (a, b) =>
        b.goalsDelta * 3 +
        b.assistsDelta * 2 +
        (b.ratingDelta ?? 0) * 4 -
        (a.goalsDelta * 3 + a.assistsDelta * 2 + (a.ratingDelta ?? 0) * 4)
    );
  }

  const improved: JourneyFindingItem[] = [];
  const worsened: JourneyFindingItem[] = [];
  const thingsToNote: JourneyFindingItem[] = [];

  if (!sameSeason) {
    thingsToNote.push({
      category: 'results',
      title: `Cross-season comparison (${fromSeason} → ${toSeason})`,
      detail: `Comparing checkpoints across two different football seasons. League table, competitive xG, and player season match totals reset between seasons.`,
      deltaLabel: `${fromSeason} → ${toSeason}`,
    });
  }

  // 1. League standing & PPG (only compare league position & PPG directly when same season)
  if (sameSeason && previous.leaguePosition != null && current.leaguePosition != null) {
    const posChange = previous.leaguePosition - current.leaguePosition; // positive = climbed
    if (posChange > 0) {
      improved.push({
        category: 'results',
        title: `Climbed ${posChange} league place${posChange === 1 ? '' : 's'} (${toSeason})`,
        detail: `Moved from #${previous.leaguePosition} to #${current.leaguePosition} in league standings${
          current.points != null ? ` (${current.points} pts in ${current.played ?? '?'} league GP)` : ''
        }.`,
        deltaLabel: `+${posChange} pos`,
      });
    } else if (posChange < 0) {
      worsened.push({
        category: 'results',
        title: `Dropped ${Math.abs(posChange)} league place${Math.abs(posChange) === 1 ? '' : 's'} (${toSeason})`,
        detail: `Slipped from #${previous.leaguePosition} to #${current.leaguePosition} in league standings${
          current.points != null ? ` (${current.points} pts in ${current.played ?? '?'} league GP)` : ''
        }.`,
        deltaLabel: `${posChange} pos`,
      });
    }
  }

  const prevPpg =
    previous.played && previous.played > 0 && previous.points != null
      ? previous.points / previous.played
      : null;
  const currPpg =
    current.played && current.played > 0 && current.points != null
      ? current.points / current.played
      : null;
  if (sameSeason && prevPpg !== null && currPpg !== null && Math.abs(currPpg - prevPpg) >= 0.1) {
    const delta = Number((currPpg - prevPpg).toFixed(2));
    const item: JourneyFindingItem = {
      category: 'results',
      title: delta > 0 ? 'League PPG pace accelerated' : 'League PPG pace slowed',
      detail: `League PPG shifted from ${prevPpg.toFixed(2)} to ${currPpg.toFixed(2)} across ${current.played} league matches (${toSeason}).`,
      deltaLabel: `${delta > 0 ? '+' : ''}${delta.toFixed(2)} PPG`,
    };
    (delta > 0 ? improved : worsened).push(item);
  }

  // 2. Competitive xG Differential (League + Cup ONLY, never polluted by friendlies)
  const prevCompXgDiff =
    fromBreakdown && fromBreakdown.competitive.xgDiff !== null
      ? fromBreakdown.competitive.xgDiff
      : previous.xgFor != null && previous.xgAgainst != null
        ? Number((previous.xgFor - previous.xgAgainst).toFixed(2))
        : null;
  const currCompXgDiff =
    toBreakdown && toBreakdown.competitive.xgDiff !== null
      ? toBreakdown.competitive.xgDiff
      : current.xgFor != null && current.xgAgainst != null
        ? Number((current.xgFor - current.xgAgainst).toFixed(2))
        : null;
  if (sameSeason && prevCompXgDiff !== null && currCompXgDiff !== null) {
    const xgDelta = Number((currCompXgDiff - prevCompXgDiff).toFixed(2));
    if (Math.abs(xgDelta) >= 0.4) {
      const scopeTag =
        toBreakdown && toBreakdown.competitive.xgMatchesCount > 0
          ? 'Competitive (League + Cup)'
          : 'Tracked matches';
      const item: JourneyFindingItem = {
        category: 'analytics',
        title: xgDelta > 0 ? 'Competitive xG balance strengthened' : 'Competitive xG margin softened',
        detail: `${scopeTag} xG diff moved from ${prevCompXgDiff >= 0 ? '+' : ''}${prevCompXgDiff.toFixed(2)} to ${currCompXgDiff >= 0 ? '+' : ''}${currCompXgDiff.toFixed(2)} (${toSeason}).`,
        deltaLabel: `${xgDelta > 0 ? '+' : ''}${xgDelta.toFixed(2)} xGD`,
      };
      (xgDelta > 0 ? improved : worsened).push(item);
    }
  }

  // 2b. Competition Scope Breakdown Note (League vs Cup vs Friendlies)
  if (toBreakdown && (toBreakdown.league.played > 0 || toBreakdown.cup.played > 0 || toBreakdown.friendly.played > 0)) {
    const parts: string[] = [];
    if (toBreakdown.league.played > 0) parts.push(`League: ${formatBucketCompactSummary(toBreakdown.league)}`);
    if (toBreakdown.cup.played > 0) parts.push(`Cup: ${formatBucketCompactSummary(toBreakdown.cup)}`);
    if (toBreakdown.friendly.played > 0) parts.push(`Friendlies: ${formatBucketCompactSummary(toBreakdown.friendly)}`);
    thingsToNote.push({
      category: 'analytics',
      title: `${toSeason} Competition Split (League · Cup · Friendlies)`,
      detail: parts.join(' | '),
      deltaLabel: `${toBreakdown.competitive.played} Comp · ${toBreakdown.friendly.played} Frd`,
    });
  }

  // 3. Bank balance & weekly wage bill
  if (previous.balanceNum != null && current.balanceNum != null) {
    const balDelta = current.balanceNum - previous.balanceNum;
    if (Math.abs(balDelta) >= 15_000) {
      const item: JourneyFindingItem = {
        category: 'finances',
        title: balDelta > 0 ? 'Club bank balance improved' : 'Cash balance declined',
        detail: `Balance shifted from ${previous.balance || 'N/A'} to ${current.balance || 'N/A'}.`,
        deltaLabel: formatSignedClubMoney(balDelta),
      };
      (balDelta > 0 ? improved : worsened).push(item);
    }
  }
  const wageDelta = baseDiff.kpiDeltas.totalWageDeltaPw;
  if (Math.abs(wageDelta) >= 150) {
    if (wageDelta < 0) {
      improved.push({
        category: 'finances',
        title: 'Playing squad wage bill trimmed',
        detail: `Weekly squad wages reduced from £${baseDiff.kpiDeltas.fromTotalWagePw.toLocaleString()}/wk to £${baseDiff.kpiDeltas.toTotalWagePw.toLocaleString()}/wk.`,
        deltaLabel: `-£${Math.abs(wageDelta).toLocaleString()}/wk`,
      });
    } else {
      worsened.push({
        category: 'finances',
        title: 'Playing squad wage bill increased',
        detail: `Weekly squad wages rose from £${baseDiff.kpiDeltas.fromTotalWagePw.toLocaleString()}/wk to £${baseDiff.kpiDeltas.toTotalWagePw.toLocaleString()}/wk.`,
        deltaLabel: `+£${wageDelta.toLocaleString()}/wk`,
      });
    }
  }

  // 4. Squad rating progression (relative star rating, zero CA/PA)
  if (baseDiff.kpiDeltas.avgAbilityDelta >= 0.05) {
    improved.push({
      category: 'squad',
      title: 'Average squad star rating climbed',
      detail: `Squad rating moved from ${baseDiff.kpiDeltas.fromAvgAbility.toFixed(2)}★ to ${baseDiff.kpiDeltas.toAvgAbility.toFixed(2)}★ (${baseDiff.risers.length} risers).`,
      deltaLabel: `+${baseDiff.kpiDeltas.avgAbilityDelta.toFixed(2)}★`,
    });
  } else if (baseDiff.kpiDeltas.avgAbilityDelta <= -0.05) {
    worsened.push({
      category: 'squad',
      title: 'Average squad star rating dipped',
      detail: `Squad rating slipped from ${baseDiff.kpiDeltas.fromAvgAbility.toFixed(2)}★ to ${baseDiff.kpiDeltas.toAvgAbility.toFixed(2)}★ (${baseDiff.fallers.length} fallers).`,
      deltaLabel: `${baseDiff.kpiDeltas.avgAbilityDelta.toFixed(2)}★`,
    });
  }

  if (baseDiff.risers.length > 0) {
    const topRisers = baseDiff.risers
      .slice(0, 3)
      .map((r) => `${r.name} (+${r.abilityDelta.toFixed(1)}★)`)
      .join(', ');
    improved.push({
      category: 'squad',
      title: 'Top squad developers',
      detail: topRisers,
      deltaLabel: `${baseDiff.risers.length} rising`,
    });
  }
  if (baseDiff.fallers.length > 0) {
    const topFallers = baseDiff.fallers
      .slice(0, 3)
      .map((f) => `${f.name} (${f.abilityDelta.toFixed(1)}★)`)
      .join(', ');
    worsened.push({
      category: 'squad',
      title: 'Players showing rating decline',
      detail: topFallers,
      deltaLabel: `${baseDiff.fallers.length} dipping`,
    });
  }

  // 5. Breakout production between saves
  const topProd = playerStatDeltas.filter((p) => p.goalsDelta + p.assistsDelta >= 2).slice(0, 3);
  if (topProd.length > 0) {
    improved.push({
      category: 'analytics',
      title: 'Standout goal-involvement surge',
      detail: topProd
        .map((p) => `${p.name} (+${p.goalsDelta}G/+${p.assistsDelta}A${p.ratingTo ? `, ${p.ratingTo.toFixed(2)}rt` : ''})`)
        .join(', '),
    });
  }

  // 6. Governance & Promises delta
  if (previous.promisesAtRiskCount != null && current.promisesAtRiskCount != null) {
    const pDelta = current.promisesAtRiskCount - previous.promisesAtRiskCount;
    if (pDelta > 0) {
      worsened.push({
        category: 'governance',
        title: 'Playing-time promise pressure increased',
        detail: `At-risk/breached squad promises rose from ${previous.promisesAtRiskCount} to ${current.promisesAtRiskCount}.`,
        deltaLabel: `+${pDelta} at risk`,
      });
    } else if (pDelta < 0) {
      improved.push({
        category: 'governance',
        title: 'Squad promise pressure eased',
        detail: `At-risk promises fell from ${previous.promisesAtRiskCount} to ${current.promisesAtRiskCount}.`,
        deltaLabel: `${pDelta} at risk`,
      });
    }
  }

  // 7. Things to note (tactical shift, roster turnover, contracts, manager tenure)
  if (
    previous.tacticFormation &&
    current.tacticFormation &&
    (previous.tacticFormation !== current.tacticFormation ||
      previous.tacticMentality !== current.tacticMentality)
  ) {
    thingsToNote.push({
      category: 'tactics',
      title: 'Tactical blueprint changed between saves',
      detail: `Shifted from ${previous.tacticFormation} (${previous.tacticMentality || 'Balanced'}) to ${current.tacticFormation} (${current.tacticMentality || 'Balanced'}).`,
    });
  }
  if (baseDiff.newgens.length > 0 || baseDiff.departed.length > 0) {
    thingsToNote.push({
      category: 'squad',
      title: 'Squad roster turnover',
      detail: `${baseDiff.newgens.length} arrival(s)/intake (${baseDiff.newgens.slice(0, 3).map((n) => n.name).join(', ') || 'None'}) and ${baseDiff.departed.length} departure(s) (${baseDiff.departed.slice(0, 3).map((d) => d.name).join(', ') || 'None'}).`,
    });
  }
  if (baseDiff.contractChanges.length > 0) {
    thingsToNote.push({
      category: 'finances',
      title: `${baseDiff.contractChanges.length} contract/wage adjustment(s)`,
      detail: baseDiff.contractChanges
        .slice(0, 3)
        .map(
          (c) =>
            `${c.name} (${c.wageDeltaPw >= 0 ? '+' : '-'}£${Math.abs(c.wageDeltaPw)}/wk, exp ${c.currentExpires})`
        )
        .join(' · '),
    });
  }
  if (current.managerExpires || current.boardGrade || current.supporterGrade) {
    thingsToNote.push({
      category: 'governance',
      title: 'Manager & Club Standing checkpoint',
      detail: [
        current.managerExpires ? `Manager deal expires ${current.managerExpires}` : null,
        current.boardGrade ? `Board: ${current.boardGrade}` : null,
        current.supporterGrade ? `Supporters: ${current.supporterGrade}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  const competitionComparison: DeepJourneyReport['competitionComparison'] = {
    from: fromBreakdown,
    to: toBreakdown,
    league: {
      from: fromBreakdown?.league ?? null,
      to: toBreakdown?.league ?? null,
    },
    cup: {
      from: fromBreakdown?.cup ?? null,
      to: toBreakdown?.cup ?? null,
    },
    friendly: {
      from: fromBreakdown?.friendly ?? null,
      to: toBreakdown?.friendly ?? null,
    },
    competitive: {
      from: fromBreakdown?.competitive ?? null,
      to: toBreakdown?.competitive ?? null,
    },
  };

  // Strip league-style points from non-league buckets (Cup knockout ties, Friendlies, and combined
  // Competitive totals) so AI narratives NEVER cite fake combined points (e.g. "8 pts from 6 matches"
  // when 2 of those matches were Cup knockout draws worth 0 league points).
  const stripNonLeaguePoints = (rec: CompetitionBucketRecord) => {
    const { points: _omittedNonLeaguePoints, ...rest } = rec;
    return rest;
  };
  const sanitizeBreakdownForAi = (bd: CompetitionScopeBreakdown | null) =>
    bd
      ? {
          seasonLabel: bd.seasonLabel,
          league: bd.league,
          cup: stripNonLeaguePoints(bd.cup),
          friendly: stripNonLeaguePoints(bd.friendly),
          competitive: stripNonLeaguePoints(bd.competitive),
        }
      : null;

  const aiPayload = {
    clubName: current.clubName,
    fromDate: previous.inGameDate,
    toDate: current.inGameDate,
    fromSeason,
    toSeason,
    sameSeason,
    totalSavesTracked: timeline.length,
    leagueTableSnapshot: {
      previous: {
        position: previous.leaguePosition ?? null,
        played: previous.played ?? fromBreakdown?.league.played ?? null,
        won: previous.won ?? fromBreakdown?.league.won ?? null,
        drawn: previous.drawn ?? fromBreakdown?.league.drawn ?? null,
        lost: previous.lost ?? fromBreakdown?.league.lost ?? null,
        points: previous.points ?? fromBreakdown?.league.points ?? null,
        goalsFor: previous.goalsFor ?? fromBreakdown?.league.goalsFor ?? null,
        goalsAgainst: previous.goalsAgainst ?? fromBreakdown?.league.goalsAgainst ?? null,
      },
      current: {
        position: current.leaguePosition ?? null,
        played: current.played ?? toBreakdown?.league.played ?? null,
        won: current.won ?? toBreakdown?.league.won ?? null,
        drawn: current.drawn ?? toBreakdown?.league.drawn ?? null,
        lost: current.lost ?? toBreakdown?.league.lost ?? null,
        points: current.points ?? toBreakdown?.league.points ?? null,
        goalsFor: current.goalsFor ?? toBreakdown?.league.goalsFor ?? null,
        goalsAgainst: current.goalsAgainst ?? toBreakdown?.league.goalsAgainst ?? null,
      },
      strictRule:
        'ONLY league matches award league points. Cup knockout ties award ZERO league points — NEVER quote combined League+Cup points or claim Cup draws contribute to league points.',
    },
    competitionBreakdown: {
      previousSave: sanitizeBreakdownForAi(fromBreakdown),
      currentSave: sanitizeBreakdownForAi(toBreakdown),
      strictRule:
        'competitive = league + cup ONLY (for total competitive match counts and competitive xG). NEVER add friendly totals into competitive xG, and NEVER sum Cup results into League points.',
      currentCompetitiveOnly: toBreakdown ? stripNonLeaguePoints(toBreakdown.competitive) : null,
      currentFriendlyOnly: toBreakdown ? stripNonLeaguePoints(toBreakdown.friendly) : null,
    },
    wageBreakdown: {
      clubPayrollWeeklyFrom: baseDiff.kpiDeltas.fromClubWagePayrollWeekly ?? null,
      clubPayrollWeeklyTo: baseDiff.kpiDeltas.toClubWagePayrollWeekly ?? null,
      clubPayrollDeltaPw: baseDiff.kpiDeltas.clubWagePayrollDeltaPw ?? null,
      clubWageBudgetWeeklyTo: baseDiff.kpiDeltas.toWageBudgetWeekly ?? null,
      playerBasicWagesWeeklyFrom: baseDiff.kpiDeltas.fromTotalWagePw,
      playerBasicWagesWeeklyTo: baseDiff.kpiDeltas.toTotalWagePw,
      playerBasicWagesDeltaPw: baseDiff.kpiDeltas.totalWageDeltaPw,
      playerBasicWagesMissingFrom: baseDiff.kpiDeltas.fromWageMissingCount ?? 0,
      playerBasicWagesMissingTo: baseDiff.kpiDeltas.toWageMissingCount ?? 0,
      strictRule:
        'clubPayrollWeekly is FM27\'s player wage bill from the finance table, measured against clubWageBudgetWeekly. It does NOT include staff wages, which are separate and can exceed it. playerBasicWagesWeekly is the sum of basic weekly contracts for tracked playing squad members ONLY. Always distinguish them and NEVER call either total club weekly wages.',
    },
    kpiDeltas: baseDiff.kpiDeltas,
    timeline: timeline.slice(-8),
    tacticalShift: {
      from: {
        name: previous.tacticName ?? null,
        formation: previous.tacticFormation ?? null,
        mentality: previous.tacticMentality ?? null,
      },
      to: {
        name: current.tacticName ?? null,
        formation: current.tacticFormation ?? null,
        mentality: current.tacticMentality ?? null,
      },
    },
    governanceCheckpoint: {
      managerExpires: current.managerExpires ?? null,
      boardGrade: current.boardGrade ?? 'Not exposed in save binary',
      supporterGrade: current.supporterGrade ?? 'Not exposed in save binary',
      promisesAtRiskFrom: previous.promisesAtRiskCount ?? null,
      promisesAtRiskTo: current.promisesAtRiskCount ?? null,
    },
    improved: improved.map((i) => `${i.title}: ${i.detail}`),
    worsened: worsened.map((w) => `${w.title}: ${w.detail}`),
    thingsToNote: thingsToNote.map((n) => `${n.title}: ${n.detail}`),
    topRisers: baseDiff.risers.slice(0, 6).map((r) => ({
      name: r.name,
      pos: r.position,
      age: r.age,
      starDelta: r.abilityDelta,
    })),
    topFallers: baseDiff.fallers.slice(0, 6).map((f) => ({
      name: f.name,
      pos: f.position,
      age: f.age,
      starDelta: f.abilityDelta,
    })),
    topProductionDeltas: playerStatDeltas.slice(0, 8),
    arrivals: baseDiff.newgens.slice(0, 6).map((n) => `${n.name} (${n.position}, ${formatAge(n.age)}y)`),
    departures: baseDiff.departed.slice(0, 6).map((d) => `${d.name} (${d.position}, ${formatAge(d.age)}y)`),
    contractChanges: baseDiff.contractChanges.slice(0, 6),
  };

  return {
    fromDate: previous.inGameDate,
    toDate: current.inGameDate,
    fromSeason,
    toSeason,
    sameSeason,
    clubName: current.clubName,
    baseDiff,
    timeline,
    competitionComparison,
    improved,
    worsened,
    thingsToNote,
    playerStatDeltas,
    aiPayload,
  };
}
