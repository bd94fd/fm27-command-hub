import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerRecord } from '../types/fm27';
import {
  SQUAD_COLUMNS,
  SQUAD_VIEW_PRESETS,
  buildEnrichedSquadRows,
  cleanPlayerNote,
  computeSquadSummary,
  countActiveSecondaryFilters,
  filterAndSortSquadRows,
  formatCompactCurrency,
  formatWeeklyWage,
  getSquadPositionOrder,
  isSquadMissingMatchStats,
} from './squadViewHelpers';

function makePlayer(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id: overrides.id || 'p-1',
    number: overrides.number ?? 10,
    name: overrides.name || 'Test Player',
    position: overrides.position || 'MC',
    apps: overrides.apps ?? '0',
    minutes: overrides.minutes ?? 0,
    rating: overrides.rating ?? null,
    goals: overrides.goals ?? 0,
    xG: overrides.xG ?? 0,
    xGPer90: overrides.xGPer90 ?? 0,
    assists: overrides.assists ?? 0,
    xA: overrides.xA ?? 0,
    xAPer90: overrides.xAPer90 ?? 0,
    drbPer90: overrides.drbPer90 ?? 0,
    prPassesPer90: overrides.prPassesPer90 ?? 0,
    hdrPct: overrides.hdrPct ?? 0,
    intPer90: overrides.intPer90 ?? 0,
    tckPct: overrides.tckPct ?? 0,
    personality: overrides.personality || 'Balanced',
    age: overrides.age ?? 22,
    ability: overrides.ability ?? 3.5,
    potential: overrides.potential ?? 4.5,
    expires: overrides.expires || '30/06/2029',
    contractExpiryMonths: overrides.contractExpiryMonths ?? 22,
    nation: overrides.nation || 'Belgium',
    wagePw: overrides.wagePw ?? 600,
    marketValue: overrides.marketValue ?? 250000,
    status: overrides.status || 'Starter',
    teamSlot: overrides.teamSlot ?? 0,
    ipRole: overrides.ipRole || 'Central Midfielder',
    oopRole: overrides.oopRole || 'Central Midfielder',
    notes: overrides.notes ?? 'Synced directly from .fm save',
    attributes: {
      pace: 12,
      acceleration: 13,
      stamina: 14,
      jumpingReach: 10,
      naturalFitness: 14,
      determination: 13,
      passing: 12,
      finishing: 10,
      tackling: 11,
      firstTouch: 12,
      decisions: 12,
      workRate: 13,
      offTheBall: 11,
      ...(overrides.attributes || {}),
    },
    activeSuspensions: overrides.activeSuspensions,
    scoutBadges: overrides.scoutBadges,
    onLoan: overrides.onLoan,
  };
}

test('SQUAD_VIEW_PRESETS all reference valid column IDs and non-empty defaults', () => {
  assert.equal(SQUAD_VIEW_PRESETS.length, 6);
  for (const preset of SQUAD_VIEW_PRESETS) {
    assert.ok(preset.defaultColumns.length >= 4, `${preset.id} has default columns`);
    assert.ok(preset.cardMetrics.length >= 3, `${preset.id} has card metrics`);
    for (const col of [...preset.defaultColumns, ...preset.cardMetrics]) {
      assert.ok(col in SQUAD_COLUMNS, `${col} exists in SQUAD_COLUMNS`);
    }
  }
});

test('cleanPlayerNote strips .fm save boilerplate but preserves real manager notes', () => {
  assert.equal(cleanPlayerNote('Synced directly from .fm save'), null);
  assert.equal(cleanPlayerNote('  Synced directly from .fm save. '), null);
  assert.equal(cleanPlayerNote(''), null);
  assert.equal(cleanPlayerNote('Captaincy candidate'), 'Captaincy candidate');
});

test('isSquadMissingMatchStats detects Fast Sync snapshots vs populated match stats', () => {
  const fastSyncSquad = [makePlayer({ id: '1' }), makePlayer({ id: '2' })];
  assert.equal(isSquadMissingMatchStats(fastSyncSquad), true);

  const fullSyncSquad = [
    makePlayer({ id: '1' }),
    makePlayer({ id: '2', apps: '4', minutes: 340, rating: 7.21 }),
  ];
  assert.equal(isSquadMissingMatchStats(fullSyncSquad), false);
});

test('getSquadPositionOrder sorts GK -> DEF -> DM -> MID -> AM -> ST', () => {
  const order = ['ST', 'AMR', 'MC', 'DM', 'DR', 'DC', 'DL', 'GK'].sort(
    (a, b) => getSquadPositionOrder(a) - getSquadPositionOrder(b)
  );
  assert.deepEqual(order, ['GK', 'DL', 'DC', 'DR', 'DM', 'MC', 'AMR', 'ST']);
});

test('filterAndSortSquadRows filters by unit, position, availability and sorts by position then stars', () => {
  const players = [
    makePlayer({
      id: 'st-1',
      name: 'Striker Ace',
      position: 'ST',
      ability: 4.5,
      age: 24,
      wagePw: 1200,
      contractExpiryMonths: 4,
      expires: '30/06/2028',
    }),
    makePlayer({
      id: 'gk-1',
      name: 'Keeper One',
      position: 'GK',
      ability: 4.0,
      age: 27,
      wagePw: 900,
      activeSuspensions: [
        {
          playerUid: 101,
          competitionName: 'League',
          matchesRemaining: 1,
          reason: 'Red Card',
          scope: 'league',
        },
      ],
    }),
    makePlayer({
      id: 'dc-1',
      name: 'Defender Rock',
      position: 'DC',
      ability: 3.5,
      age: 21,
      wagePw: 500,
      status: 'Injured',
    }),
    makePlayer({
      id: 'youth-1',
      name: 'Youth Prospect',
      position: 'MC',
      ability: 2.0,
      age: 17,
      wagePw: 100,
      teamSlot: 2,
      status: 'Youth',
    }),
  ];

  const rows = buildEnrichedSquadRows(players);

  // First Team sorted by position asc -> GK, DC, ST
  const firstTeam = filterAndSortSquadRows(rows, {
    unit: 'FIRST_TEAM',
    search: '',
    posGroup: 'ALL',
    status: 'ALL',
    expiryYear: 'ALL',
    availability: 'ALL',
    sortKey: 'position',
    sortDir: 'asc',
  });
  assert.deepEqual(
    firstTeam.map((r) => r.player.id),
    ['gk-1', 'dc-1', 'st-1']
  );

  // Expiring soon filter -> only st-1 (4 months remaining)
  const expiring = filterAndSortSquadRows(rows, {
    unit: 'ALL',
    search: '',
    posGroup: 'ALL',
    status: 'ALL',
    expiryYear: 'ALL',
    availability: 'EXPIRING',
    sortKey: 'stars',
    sortDir: 'desc',
  });
  assert.deepEqual(
    expiring.map((r) => r.player.id),
    ['st-1']
  );

  // Unavailable filter -> banned GK + injured DC
  const unavailable = filterAndSortSquadRows(rows, {
    unit: 'FIRST_TEAM',
    search: '',
    posGroup: 'ALL',
    status: 'ALL',
    expiryYear: 'ALL',
    availability: 'UNAVAILABLE',
    sortKey: 'wage',
    sortDir: 'desc',
  });
  assert.deepEqual(
    unavailable.map((r) => r.player.id),
    ['gk-1', 'dc-1']
  );

  // Live summary counts
  const summary = computeSquadSummary(firstTeam);
  assert.equal(summary.count, 3);
  assert.equal(summary.avgAge, 24);
  assert.equal(summary.totalWagePw, 2600);
  assert.equal(summary.bannedCount, 1);
  assert.equal(summary.injuredCount, 1);
  assert.equal(summary.expiringSoonCount, 1);
});

test('countActiveSecondaryFilters and currency formatters work cleanly', () => {
  assert.equal(
    countActiveSecondaryFilters({
      posGroup: 'ALL',
      status: 'ALL',
      expiryYear: 'ALL',
      availability: 'ALL',
    }),
    0
  );
  assert.equal(
    countActiveSecondaryFilters({
      posGroup: 'DEF',
      status: 'Starter',
      expiryYear: '2028',
      availability: 'EXPIRING',
    }),
    4
  );

  assert.equal(formatCompactCurrency(null), '—');
  assert.equal(formatCompactCurrency(0), '£0');
  assert.equal(formatCompactCurrency(850), '£850');
  assert.equal(formatCompactCurrency(125000), '£125k');
  assert.equal(formatCompactCurrency(1450000), '£1.45m');
  assert.equal(formatWeeklyWage(625), '£625/wk');
  assert.equal(formatWeeklyWage(14250), '£14.3k/wk');

  const durabilityPreset = SQUAD_VIEW_PRESETS.find((p) => p.id === 'durability');
  assert.ok(durabilityPreset?.defaultColumns.includes('condSharp'));
  assert.ok(!durabilityPreset?.defaultColumns.includes('morale'));
});

test('Phase 3: cup-only ban stays Available for league fixtures with amber Cup Ban Only flag', () => {
  const cupBannedPlayer = makePlayer({
    id: 'cup-ban-1',
    name: 'Cup Banned Winger',
    position: 'AML',
    activeSuspensions: [
      {
        playerUid: 501,
        playerName: 'Cup Banned Winger',
        matchesRemaining: 1,
        competitionName: 'Croky Cup',
        scope: 'cup',
        reason: 'Red card',
      },
    ],
  });

  const leagueRows = buildEnrichedSquadRows(
    [cupBannedPlayer],
    undefined,
    'Belgian National Division 1'
  );
  assert.equal(leagueRows[0].isBanned, false);
  assert.equal(leagueRows[0].hasOtherCompBan, true);
  assert.equal(leagueRows[0].otherCompBanLabel, 'Cup Ban Only');

  const available = filterAndSortSquadRows(leagueRows, {
    unit: 'ALL',
    search: '',
    posGroup: 'ALL',
    status: 'ALL',
    expiryYear: 'ALL',
    availability: 'AVAILABLE',
    sortKey: 'stars',
    sortDir: 'desc',
  });
  assert.equal(available.length, 1);

  const cupRows = buildEnrichedSquadRows(
    [cupBannedPlayer],
    undefined,
    'Croky Cup'
  );
  assert.equal(cupRows[0].isBanned, true);
  assert.equal(cupRows[0].hasOtherCompBan, false);
});

