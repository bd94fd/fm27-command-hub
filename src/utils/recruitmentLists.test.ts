import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addPlayerToShortlist,
  appendRecruitmentCase,
  appendShortlist,
  patchRecruitmentCase,
  removePlayerFromShortlist,
  removeRecruitmentCase,
  removeShortlist,
} from './recruitmentLists';
import type { RecruitmentCase, ShortlistRecord } from '../types/fm27';

const caseEntry = (id: string, overrides: Partial<RecruitmentCase> = {}): RecruitmentCase => ({
  id,
  updatedAt: '2026-01-01T00:00:00.000Z',
  playerId: `p-${id}`,
  playerName: `Player ${id}`,
  position: 'ST',
  age: 24,
  currentClub: 'Other',
  targetIpRole: 'Poacher',
  targetOopRole: 'Press',
  interest: 'Interested',
  stage: 'Shortlisted',
  estimatedFee: '£1M',
  estimatedWagePw: 1000,
  expiresOn: '2027-06-30',
  notes: '',
  ...overrides,
});

const shortlist = (id: string, playerIds: string[] = []): ShortlistRecord => ({
  id,
  name: `List ${id}`,
  description: '',
  playerIds,
  createdAt: '2026-01-01T00:00:00.000Z',
});

test('a new recruitment case goes to the front and keeps its fields', () => {
  const existing = [caseEntry('a')];
  const { id: _id, updatedAt: _updatedAt, ...entry } = caseEntry('new');

  const next = appendRecruitmentCase(existing, entry, 'rec-1', '2026-02-02T00:00:00.000Z');

  assert.equal(next.length, 2);
  assert.equal(next[0].id, 'rec-1');
  assert.equal(next[0].updatedAt, '2026-02-02T00:00:00.000Z');
  assert.equal(next[0].playerName, 'Player new');
  assert.equal(next[1].id, 'a');
  assert.equal(existing.length, 1, 'the input array is not mutated');
});

test('patching a case touches only that case and stamps updatedAt', () => {
  const cases = [caseEntry('a'), caseEntry('b')];
  const next = patchRecruitmentCase(cases, 'b', { stage: 'Bid Submitted' }, '2026-03-03T00:00:00.000Z');

  assert.equal(next[1].stage, 'Bid Submitted');
  assert.equal(next[1].updatedAt, '2026-03-03T00:00:00.000Z');
  assert.equal(next[0].updatedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(cases[1].stage, 'Shortlisted', 'the input array is not mutated');
});

test('patching an unknown case changes nothing', () => {
  const cases = [caseEntry('a')];
  const next = patchRecruitmentCase(cases, 'missing', { stage: 'Bid Submitted' }, '2026-03-03T00:00:00.000Z');

  assert.deepEqual(next, cases);
  assert.notEqual(next, cases, 'a new array is returned so React sees the change');
});

test('removing a case drops only that row', () => {
  const next = removeRecruitmentCase([caseEntry('a'), caseEntry('b')], 'a');
  assert.deepEqual(next.map((entry) => entry.id), ['b']);
});

test('a new shortlist starts empty and goes to the front', () => {
  const next = appendShortlist([shortlist('a', ['p1'])], 'Youth', 'Under 21s', 'sl-1', '2026-04-04T00:00:00.000Z');

  assert.equal(next[0].id, 'sl-1');
  assert.deepEqual(next[0].playerIds, []);
  assert.equal(next[0].createdAt, '2026-04-04T00:00:00.000Z');
  assert.deepEqual(next[1].playerIds, ['p1']);
});

test('removing a shortlist drops only that list', () => {
  const next = removeShortlist([shortlist('a'), shortlist('b')], 'b');
  assert.deepEqual(next.map((list) => list.id), ['a']);
});

test('adding a player twice to one shortlist keeps a single entry', () => {
  const once = addPlayerToShortlist([shortlist('a')], 'a', 'p1');
  const twice = addPlayerToShortlist(once, 'a', 'p1');

  assert.deepEqual(twice[0].playerIds, ['p1']);
});

test('adding a player leaves the other shortlists alone', () => {
  const next = addPlayerToShortlist([shortlist('a'), shortlist('b', ['p9'])], 'a', 'p1');
  assert.deepEqual(next[1].playerIds, ['p9']);
});

test('removing a player keeps the rest of the list in order', () => {
  const next = removePlayerFromShortlist([shortlist('a', ['p1', 'p2', 'p3'])], 'a', 'p2');
  assert.deepEqual(next[0].playerIds, ['p1', 'p3']);
});

test('removing a player from an unknown shortlist changes nothing', () => {
  const lists = [shortlist('a', ['p1'])];
  assert.deepEqual(removePlayerFromShortlist(lists, 'missing', 'p1'), lists);
});
