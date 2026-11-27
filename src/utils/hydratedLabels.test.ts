import assert from 'node:assert/strict';
import test from 'node:test';
import { selectHydratedHeaderLabels } from './hydratedLabels.ts';
import type { HydratedSaveState } from './fmSaveHydrator';

const hydrated = (overrides: Partial<HydratedSaveState> = {}) =>
  ({
    saveDateLabel: '11/08/2027',
    nextFixtureLabel: '15/08/2027 vs KVC Wilrijk (Home)',
    leagueStandingLabel: '#3 · 12 GP',
    wageComplianceLabel: '£10,604 / £10,203 p/w',
    balanceLabel: '-£631K',
    ...overrides,
  }) as HydratedSaveState;

test('the final pass writes every label the save carries', () => {
  assert.deepEqual(selectHydratedHeaderLabels(hydrated(), false), {
    saveDate: '11/08/2027',
    nextFixture: '15/08/2027 vs KVC Wilrijk (Home)',
    leagueStanding: '#3 · 12 GP',
    wageSpend: '£10,604 / £10,203 p/w',
    balance: '-£631K',
  });
});

test('an interim checkpoint never blanks a real fixture or standing with --', () => {
  const interim = hydrated({ nextFixtureLabel: '--', leagueStandingLabel: '--' });
  const labels = selectHydratedHeaderLabels(interim, true);
  assert.equal(labels.nextFixture, undefined);
  assert.equal(labels.leagueStanding, undefined);
  assert.equal(labels.saveDate, '11/08/2027');
});

test('an interim checkpoint still writes a real value when it has one', () => {
  const labels = selectHydratedHeaderLabels(hydrated(), true);
  assert.equal(labels.nextFixture, '15/08/2027 vs KVC Wilrijk (Home)');
  assert.equal(labels.leagueStanding, '#3 · 12 GP');
});

test('a missing label is left alone rather than written as empty', () => {
  const sparse = hydrated({
    nextFixtureLabel: null,
    leagueStandingLabel: null,
    wageComplianceLabel: null,
    balanceLabel: null,
  });
  const labels = selectHydratedHeaderLabels(sparse, false);
  assert.equal(labels.nextFixture, undefined);
  assert.equal(labels.leagueStanding, undefined);
  assert.equal(labels.wageSpend, undefined);
  assert.equal(labels.balance, undefined);
  assert.equal(labels.saveDate, '11/08/2027');
});

test('the final pass writes -- when the save really has no fixture yet', () => {
  const labels = selectHydratedHeaderLabels(hydrated({ nextFixtureLabel: '--' }), false);
  assert.equal(labels.nextFixture, '--');
});
