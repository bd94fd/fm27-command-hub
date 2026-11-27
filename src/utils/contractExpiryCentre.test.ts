import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContractExpiryCentre,
  suggestedDecisionForVerdict,
  CONTRACT_CENTRE_PLAYER_WINDOW_MONTHS,
} from './contractExpiryCentre';
import type { PlayerTransferAdvice } from './transferAudit';
import type { PlayerRecord, StaffRecord } from '../types/fm27';

const player = (overrides: Partial<PlayerRecord> = {}): PlayerRecord =>
  ({
    id: 'p1',
    name: 'Test Player',
    position: 'ST',
    age: 27,
    wagePw: 4000,
    expires: '30/06/2027',
    marketValue: 500_000,
    marketValueCapped: false,
    ability: 3,
    potential: 3.5,
    ...overrides,
  }) as PlayerRecord;

const advice = (overrides: {
  monthsLeft?: number | null;
  verdict?: string;
  recommendedMove?: string;
  player?: Partial<PlayerRecord>;
} = {}): PlayerTransferAdvice =>
  ({
    player: player(overrides.player),
    squadTier: 'senior',
    primaryBucketCode: 'ST',
    abilityReadinessTier: 'starter_level',
    abilityReadinessLabel: 'Starter',
    clubWidePositionRank: 1,
    verdict: overrides.verdict ?? 'Renew Now',
    priority: 'High',
    monthsLeft: overrides.monthsLeft === undefined ? 5 : overrides.monthsLeft,
    annualWage: 208_000,
    tags: [],
    headline: 'Test',
    rationale: 'Test',
    recommendedMove: overrides.recommendedMove ?? 'Renew now, before a rival can talk to him.',
  }) as unknown as PlayerTransferAdvice;

const staff = (overrides: Partial<StaffRecord> = {}): StaffRecord =>
  ({
    id: 's1',
    name: 'Test Coach',
    role: 'Coach',
    age: 45,
    nation: 'Belgium',
    club: 'KVV Zelzate',
    wagePw: 900,
    expires: '30/06/2027',
    attributes: {},
    ...overrides,
  }) as StaffRecord;

test('keeps players inside the 12 month window and drops the rest', () => {
  const summary = buildContractExpiryCentre({
    players: [
      advice({ monthsLeft: 3, player: { id: 'a', name: 'Critical Man' } }),
      advice({ monthsLeft: 10, player: { id: 'b', name: 'Warning Man' } }),
      advice({ monthsLeft: 24, player: { id: 'c', name: 'Safe Man' } }),
      advice({ monthsLeft: null, player: { id: 'd', name: 'Unknown Man' } }),
    ],
    staff: [],
    saveDate: '01/07/2026',
  });

  assert.equal(summary.playerCount, 2);
  assert.deepEqual(
    summary.rows.map((row) => row.name),
    ['Critical Man', 'Warning Man']
  );
  assert.equal(summary.criticalCount, 1);
  assert.equal(CONTRACT_CENTRE_PLAYER_WINDOW_MONTHS, 12);
});

test('sorts by urgency, then by time left, then by wage', () => {
  const summary = buildContractExpiryCentre({
    players: [
      advice({ monthsLeft: 11, player: { id: 'a', name: 'Late Warning' } }),
      advice({ monthsLeft: 2, player: { id: 'b', name: 'Nearly Gone' } }),
      advice({ monthsLeft: 5, player: { id: 'c', name: 'Soon High Earner', wagePw: 9000 } }),
      advice({ monthsLeft: 5, player: { id: 'd', name: 'Soon Low Earner', wagePw: 500 } }),
    ],
    staff: [],
    saveDate: '01/07/2026',
  });

  assert.deepEqual(
    summary.rows.map((row) => row.name),
    ['Nearly Gone', 'Soon High Earner', 'Soon Low Earner', 'Late Warning']
  );
});

test('includes staff only inside the Staff tab window and labels their department', () => {
  const summary = buildContractExpiryCentre({
    players: [],
    staff: [
      staff({ id: 's1', name: 'Physio', role: 'Physio', expires: '30/07/2026' }),
      staff({ id: 's2', name: 'Scout', role: 'Chief Scout', expires: '30/09/2027' }),
      staff({ id: 's3', name: 'Coach', role: 'Coach', expires: '01/08/2026' }),
    ],
    saveDate: '01/07/2026',
  });

  assert.equal(summary.staffCount, 2);
  const names = summary.rows.map((row) => row.name).sort();
  assert.deepEqual(names, ['Coach', 'Physio']);
  const physio = summary.rows.find((row) => row.name === 'Physio');
  assert.equal(physio?.roleLabel, 'Medical — Physio');
  assert.equal(physio?.urgency, 'critical');
  const coach = summary.rows.find((row) => row.name === 'Coach');
  assert.equal(coach?.roleLabel, 'Coaching — Coach');
});

test('a staff deal ten months out still appears, as a warning rather than critical', () => {
  // Real save: date 11/08/2027, staff all expire 30/06/2028.
  const summary = buildContractExpiryCentre({
    players: [],
    staff: [staff({ id: 's1', name: 'Chief Scout', role: 'Chief Scout', expires: '30/06/2028' })],
    saveDate: '11/08/2027',
  });
  assert.equal(summary.staffCount, 1);
  assert.equal(summary.rows[0].urgency, 'warning');
  assert.equal(summary.rows[0].monthsLeft, 11);
  assert.equal(summary.rows[0].roleLabel, 'Recruitment — Chief Scout');
});

test('staff with an unreadable expiry date are left out rather than guessed', () => {
  const summary = buildContractExpiryCentre({
    players: [],
    staff: [staff({ id: 's1', expires: '--' })],
    saveDate: '11/08/2027',
  });
  assert.equal(summary.staffCount, 0);
  assert.equal(summary.rows.length, 0);
});

test('carries the existing verdict as the suggested plan instead of inventing one', () => {
  assert.equal(suggestedDecisionForVerdict('Renew Now'), 'renew');
  assert.equal(suggestedDecisionForVerdict('Protect Youth Asset'), 'renew');
  assert.equal(suggestedDecisionForVerdict('Replace Before Selling'), 'renew');
  assert.equal(suggestedDecisionForVerdict('Sell / Transfer List'), 'sell');
  assert.equal(suggestedDecisionForVerdict('Let Expire'), 'release');
  assert.equal(suggestedDecisionForVerdict('Loan Out'), null);
  assert.equal(suggestedDecisionForVerdict('Hold'), null);

  const summary = buildContractExpiryCentre({
    players: [advice({ monthsLeft: 4, verdict: 'Sell / Transfer List' })],
    staff: [],
    saveDate: '01/07/2026',
  });
  assert.equal(summary.rows[0].suggestedDecision, 'sell');
  assert.equal(summary.rows[0].decision, null);
});

test('totals the money per decision and keeps unknown wages out of the sums', () => {
  const summary = buildContractExpiryCentre({
    players: [
      advice({ monthsLeft: 3, verdict: 'Renew Now', player: { id: 'a', wagePw: 2000 } }),
      advice({
        monthsLeft: 4,
        verdict: 'Sell / Transfer List',
        player: { id: 'b', wagePw: 3000, marketValue: 750_000 },
      }),
      advice({
        monthsLeft: 8,
        verdict: 'Let Expire',
        player: { id: 'c', wagePw: 1000, marketValue: 0 },
      }),
      advice({ monthsLeft: 9, verdict: 'Hold', player: { id: 'd', wagePw: 0 } }),
    ],
    staff: [],
    saveDate: '01/07/2026',
    decisions: { 'player:a': 'renew', 'player:b': 'sell', 'player:c': 'release' },
  });

  assert.equal(summary.weeklyWageAtRisk, 6000);
  assert.equal(summary.wageUnknownCount, 1);
  assert.equal(summary.renewedCount, 1);
  assert.equal(summary.renewedWeeklyWage, 2000);
  assert.equal(summary.soldCount, 1);
  assert.equal(summary.soldWeeklyWage, 3000);
  assert.equal(summary.soldValue, 750_000);
  assert.equal(summary.releasedCount, 1);
  assert.equal(summary.releasedWeeklyWage, 1000);
  assert.equal(summary.undecidedCount, 1);
  assert.equal(summary.undecidedWeeklyWage, 0);
});

test('flags a capped market value so the fee total is not read as exact', () => {
  const summary = buildContractExpiryCentre({
    players: [
      advice({
        monthsLeft: 6,
        verdict: 'Sell / Transfer List',
        player: { id: 'a', marketValue: 300_000_000, marketValueCapped: true },
      }),
    ],
    staff: [],
    saveDate: '01/07/2026',
    decisions: { 'player:a': 'sell' },
  });
  assert.equal(summary.soldValue, 300_000_000);
  assert.equal(summary.cappedValueCount, 1);
});

test('an empty save produces an empty centre rather than a placeholder row', () => {
  const summary = buildContractExpiryCentre({ players: [], staff: [], saveDate: '--' });
  assert.equal(summary.rows.length, 0);
  assert.equal(summary.weeklyWageAtRisk, 0);
  assert.equal(summary.undecidedCount, 0);
});
