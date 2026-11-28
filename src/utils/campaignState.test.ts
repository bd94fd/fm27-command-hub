/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPETITIVE_MATCH_LOGS } from '../data/matchAndTacticsData';
import { EMPTY_CLUB_META, SQUAD_PLAYERS } from '../data/squadData';
import type { FmHubPersistedState } from '../services/fmStorage';
import type { MatchLogEntry, PlayerRecord, StaffRecord } from '../types/fm27';
import type { HydratedSaveState } from './fmSaveHydrator';
import {
  campaignFromBackup,
  campaignPersistSnapshot,
  clearedCampaignState,
  initialCampaignState,
  restorePersistedCampaign,
  type CampaignState,
} from './campaignState';

const player = (uid: string, name: string): PlayerRecord =>
  ({ uid, name, position: 'MC' }) as unknown as PlayerRecord;

const match = (opponent: string): MatchLogEntry =>
  ({ id: `m-${opponent}`, opponent }) as unknown as MatchLogEntry;

const staffRow = (uid: string): StaffRecord => ({ uid, name: 'Alex Example' }) as unknown as StaffRecord;

const save = (clubName: string): HydratedSaveState =>
  ({ decodedPayload: { meta: { clubName } } }) as unknown as HydratedSaveState;

function campaign(patch: Partial<CampaignState> = {}): CampaignState {
  return {
    ...initialCampaignState(),
    players: [player('1', 'One')],
    matches: [match('Alpha')],
    staff: [staffRow('s1')],
    recruitmentCases: [],
    shortlists: [],
    trackedTargets: [],
    saveDate: '11/08/2027',
    nextFixture: 'vs Beta (H)',
    leagueStandingSub: '3rd',
    wageSpend: '£12K',
    balance: '£1.2M',
    hydratedFmSave: save('Northbridge FC'),
    activeShape: '4-2-3-1 DM AM Wide',
    customSlots: [],
    applyToAnalystOnly: true,
    ...patch,
  };
}

function snapshot(patch: Partial<FmHubPersistedState> = {}): FmHubPersistedState {
  return {
    version: 2,
    lastSyncedAt: '2027-08-11T10:00:00.000Z',
    saveDate: '01/09/2027',
    nextFixture: 'vs Gamma (A)',
    leagueStandingSub: '1st',
    wageSpend: '£20K',
    balance: '£2.4M',
    players: [player('2', 'Two'), player('3', 'Three')],
    matches: [match('Delta')],
    staff: [staffRow('s2')],
    recruitmentCases: [],
    shortlists: [],
    hydratedFmSave: save('Riverside FC'),
    activeShape: '4-4-2',
    customSlots: [],
    applyToAnalystOnly: false,
    ...patch,
  } as FmHubPersistedState;
}

test('the opening state is the demo data, with no save attached', () => {
  const opening = initialCampaignState();
  assert.deepEqual(opening.players, SQUAD_PLAYERS);
  assert.deepEqual(opening.matches, COMPETITIVE_MATCH_LOGS);
  assert.deepEqual(opening.staff, []);
  assert.equal(opening.hydratedFmSave, null);
  assert.equal(opening.saveDate, EMPTY_CLUB_META.saveDate);
  assert.equal(opening.leagueStandingSub, '--');
  assert.equal(opening.activeShape, '4-3-3 DM Wide');
});

test('a cleared campaign keeps no squad, no matches and no save', () => {
  const cleared = clearedCampaignState();
  assert.deepEqual(cleared.players, []);
  assert.deepEqual(cleared.matches, []);
  assert.deepEqual(cleared.staff, []);
  assert.equal(cleared.hydratedFmSave, null);
  assert.equal(cleared.applyToAnalystOnly, false);
  assert.deepEqual(cleared.customSlots, []);
});

test('a stored snapshot replaces every field it carries', () => {
  const restored = restorePersistedCampaign(campaign(), snapshot());
  assert.deepEqual(restored.players.map((p) => p.uid), ['2', '3']);
  assert.deepEqual(restored.matches.map((m) => m.opponent), ['Delta']);
  assert.equal(restored.staff.length, 1);
  assert.equal(restored.saveDate, '01/09/2027');
  assert.equal(restored.nextFixture, 'vs Gamma (A)');
  assert.equal(restored.leagueStandingSub, '1st');
  assert.equal(restored.wageSpend, '£20K');
  assert.equal(restored.balance, '£2.4M');
  assert.equal(restored.activeShape, '4-4-2');
  assert.equal(restored.applyToAnalystOnly, false);
});

test('a stored snapshot missing a field keeps what is on screen', () => {
  const current = campaign();
  const sparse = {
    version: 2,
    lastSyncedAt: '2027-08-11T10:00:00.000Z',
    players: [player('9', 'Nine')],
  } as unknown as FmHubPersistedState;
  const restored = restorePersistedCampaign(current, sparse);
  assert.deepEqual(restored.players.map((p) => p.uid), ['9']);
  assert.equal(restored.matches, current.matches);
  assert.equal(restored.staff, current.staff);
  assert.equal(restored.saveDate, current.saveDate);
  assert.equal(restored.nextFixture, current.nextFixture);
  assert.equal(restored.leagueStandingSub, current.leagueStandingSub);
  assert.equal(restored.wageSpend, current.wageSpend);
  assert.equal(restored.balance, current.balance);
  assert.equal(restored.hydratedFmSave, current.hydratedFmSave);
  assert.equal(restored.activeShape, current.activeShape);
  assert.equal(restored.applyToAnalystOnly, current.applyToAnalystOnly);
});

test('a stored snapshot with no save does not blank the save on screen', () => {
  const current = campaign();
  const restored = restorePersistedCampaign(current, snapshot({ hydratedFmSave: null }));
  assert.equal(restored.hydratedFmSave, current.hydratedFmSave);
});

test('players and matches that are not arrays keep what is on screen', () => {
  const current = campaign();
  const broken = {
    version: 2,
    lastSyncedAt: '2027-08-11T10:00:00.000Z',
    players: 'nope',
    matches: { length: 3 },
  } as unknown as FmHubPersistedState;
  const restored = restorePersistedCampaign(current, broken);
  assert.equal(restored.players, current.players);
  assert.equal(restored.matches, current.matches);
});

test('a boolean false survives the restore', () => {
  const restored = restorePersistedCampaign(campaign({ applyToAnalystOnly: true }), snapshot({ applyToAnalystOnly: false }));
  assert.equal(restored.applyToAnalystOnly, false);
});

test('a non-boolean applyToAnalystOnly keeps what is on screen', () => {
  const current = campaign({ applyToAnalystOnly: true });
  const restored = restorePersistedCampaign(current, {
    ...snapshot(),
    applyToAnalystOnly: 'yes',
  } as unknown as FmHubPersistedState);
  assert.equal(restored.applyToAnalystOnly, true);
});

test('fields the snapshot leaves alone keep their identity, so React can bail out', () => {
  const current = campaign();
  const restored = restorePersistedCampaign(current, {
    version: 2,
    lastSyncedAt: '2027-08-11T10:00:00.000Z',
    players: [player('9', 'Nine')],
  } as unknown as FmHubPersistedState);
  assert.equal(restored.staff, current.staff);
  assert.equal(restored.customSlots, current.customSlots);
});

test('the tracked targets are not part of a stored snapshot', () => {
  const tracked = [{ uid: 't1', name: 'Target' }] as unknown as CampaignState['trackedTargets'];
  const current = campaign({ trackedTargets: tracked });
  assert.equal(restorePersistedCampaign(current, snapshot()).trackedTargets, tracked);
  assert.equal(campaignFromBackup(snapshot(), current).trackedTargets, tracked);
});

test('a backup file replaces the squad, the matches and the save outright', () => {
  const imported = campaignFromBackup(snapshot(), campaign());
  assert.deepEqual(imported.players.map((p) => p.uid), ['2', '3']);
  assert.deepEqual(imported.matches.map((m) => m.opponent), ['Delta']);
  assert.equal(imported.saveDate, '01/09/2027');
  assert.equal(imported.hydratedFmSave?.decodedPayload?.meta?.clubName, 'Riverside FC');
});

test('a backup with no staff or recruitment lists clears them instead of keeping the old ones', () => {
  const current = campaign({ staff: [staffRow('old')] });
  const imported = campaignFromBackup(
    snapshot({ staff: undefined, recruitmentCases: undefined, shortlists: undefined }),
    current
  );
  assert.deepEqual(imported.staff, []);
  assert.deepEqual(imported.recruitmentCases, []);
  assert.deepEqual(imported.shortlists, []);
});

test('a backup with no plan fields keeps the plan on screen', () => {
  const current = campaign({ activeShape: '3-4-2-1', customSlots: [] });
  const imported = campaignFromBackup(
    snapshot({ activeShape: undefined, customSlots: undefined, applyToAnalystOnly: undefined }),
    current
  );
  assert.equal(imported.activeShape, '3-4-2-1');
  assert.deepEqual(imported.customSlots, []);
  assert.equal(imported.applyToAnalystOnly, false);
});

test('the persisted snapshot carries the club name from the save and no tracked targets', () => {
  const written = campaignPersistSnapshot(campaign());
  assert.equal(written.clubName, 'Northbridge FC');
  assert.equal(written.saveDate, '11/08/2027');
  assert.equal(written.players.length, 1);
  assert.equal('trackedTargets' in written, false);
});

test('a campaign with no save writes no club name', () => {
  const written = campaignPersistSnapshot(campaign({ hydratedFmSave: null }));
  assert.equal(written.clubName, undefined);
});
