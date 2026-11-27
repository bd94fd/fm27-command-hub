import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARE_TOKEN_MAX_LENGTH,
  buildShareSummary,
  decodeShareSummary,
  describeShareSummary,
  encodeShareSummary,
  topPlayersByRating,
  type ShareSummarySources,
} from './shareSummary';

const players = [
  { name: 'Mario Gega', position: 'AML', rating: 8.1 },
  { name: 'Shawn Golike', position: 'STC', rating: 7.7 },
  { name: 'No Rating', position: 'MC', rating: null },
  { name: 'Nathan Kaninda', position: 'AMR', rating: 7.0 },
];

const sources: ShareSummarySources = {
  clubName: 'KVV Zelzate',
  saveDate: '11/08/2027',
  players,
  staff: [{ name: 'a' }, { name: 'b' }],
  finances: {
    payroll: { wagePayrollWeekly: 10_604, wageBudgetWeekly: 10_203 },
    cash: { balanceAmount: -631_197, runwayLabel: 'Critical · 0 months' },
  },
  generatedAt: new Date('2026-11-26T09:30:00Z'),
};

test('the top players helper sorts by rating and drops unrated players', () => {
  const top = topPlayersByRating(players);
  assert.deepEqual(
    top.map((player) => player.name),
    ['Mario Gega', 'Shawn Golike', 'Nathan Kaninda']
  );
  assert.equal(top[0].rating, '8.10');
  assert.equal(topPlayersByRating(players, 2).length, 2);
});

test('a summary carries counts, money and the rating list only', () => {
  const summary = buildShareSummary(sources);
  assert.equal(summary.v, 1);
  assert.equal(summary.club, 'KVV Zelzate');
  assert.equal(summary.squad, 4);
  assert.equal(summary.staff, 2);
  assert.equal(summary.wageBillPw, 10_604);
  assert.equal(summary.balance, -631_197);
  assert.equal(summary.runway, 'Critical · 0 months');
  assert.equal(summary.created, '2026-11-26');
  assert.equal(summary.top.length, 3);
});

test('a missing finance panel leaves the money fields null, not zero', () => {
  const summary = buildShareSummary({ clubName: 'X', saveDate: '', players: [] });
  assert.equal(summary.wageBillPw, null);
  assert.equal(summary.balance, null);
  assert.equal(summary.runway, '');
  assert.deepEqual(summary.top, []);
});

test('a long club name is trimmed so the link stays short', () => {
  const summary = buildShareSummary({ ...sources, clubName: 'A'.repeat(200) });
  assert.equal(summary.club.length, 60);
});

test('a summary round-trips through the token', () => {
  const summary = buildShareSummary(sources);
  const token = encodeShareSummary(summary);
  assert.ok(token);
  assert.match(token!, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeShareSummary(token), summary);
});

test('hostile or broken tokens return null instead of throwing', () => {
  assert.equal(decodeShareSummary(null), null);
  assert.equal(decodeShareSummary(undefined), null);
  assert.equal(decodeShareSummary(''), null);
  assert.equal(decodeShareSummary('bad token!'), null);
  assert.equal(decodeShareSummary('a'.repeat(SHARE_TOKEN_MAX_LENGTH + 1)), null);
  assert.equal(decodeShareSummary('eyJ2IjoyfQ'), null);
  assert.equal(decodeShareSummary('bm90IGpzb24'), null);
});

test('decoded values are clamped and trimmed', () => {
  const token = encodeShareSummary({
    ...buildShareSummary(sources),
    squad: 5000,
    staff: -3,
    club: 'x'.repeat(120),
    top: Array.from({ length: 12 }, () => ({ n: 'p'.repeat(80), p: 'GK', r: '9' })),
  })!;
  const decoded = decodeShareSummary(token)!;
  assert.equal(decoded.squad, 999);
  assert.equal(decoded.staff, 0);
  assert.equal(decoded.club.length, 60);
  assert.equal(decoded.top.length, 10);
  assert.equal(decoded.top[0].n.length, 40);
});

test('a summary with no club name is rejected', () => {
  const token = encodeShareSummary({ ...buildShareSummary(sources), club: '' })!;
  assert.equal(decodeShareSummary(token), null);
});

test('the description states what is shared and what is left out', () => {
  const text = describeShareSummary(buildShareSummary(sources)).join(' | ');
  assert.match(text, /KVV Zelzate, 11\/08\/2027/);
  assert.match(text, /4 players, 2 staff/);
  assert.match(text, /no player list/);
});
