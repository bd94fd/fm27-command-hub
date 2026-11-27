import assert from 'node:assert/strict';
import test from 'node:test';
import { hasPersistableContent, type PersistableSnapshot } from './useSavePersistence.ts';

const empty = (): PersistableSnapshot => ({
  saveDate: '--',
  nextFixture: '--',
  leagueStandingSub: '--',
  wageSpend: '--',
  balance: '--',
  players: [],
  matches: [],
  staff: [],
  recruitmentCases: [],
  shortlists: [],
  hydratedFmSave: null,
});

test('an empty hub is not written to storage', () => {
  assert.equal(hasPersistableContent(empty()), false);
});

test('any user-owned list makes the snapshot worth writing', () => {
  const withPlayer = { ...empty(), players: [{ name: 'Keeper' }] } as PersistableSnapshot;
  assert.equal(hasPersistableContent(withPlayer), true);

  const withMatch = { ...empty(), matches: [{ id: 'm1' }] } as PersistableSnapshot;
  assert.equal(hasPersistableContent(withMatch), true);

  const withStaff = { ...empty(), staff: [{ name: 'Coach' }] } as PersistableSnapshot;
  assert.equal(hasPersistableContent(withStaff), true);

  const withCase = {
    ...empty(),
    recruitmentCases: [{ id: 'c1' }],
  } as PersistableSnapshot;
  assert.equal(hasPersistableContent(withCase), true);

  const withShortlist = {
    ...empty(),
    shortlists: [{ id: 's1' }],
  } as PersistableSnapshot;
  assert.equal(hasPersistableContent(withShortlist), true);
});

test('a decoded save alone does not trigger the list-based autosave', () => {
  const decodedOnly = {
    ...empty(),
    hydratedFmSave: { decodedPayload: { meta: { clubName: 'KVV Zelzate' } } },
  } as unknown as PersistableSnapshot;
  assert.equal(hasPersistableContent(decodedOnly), false);
});
