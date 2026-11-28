/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { FmHubPersistedState } from '../services/fmStorage';
import type { MatchLogEntry, PlayerRecord, StaffRecord } from '../types/fm27';
import type { HydratedSaveState } from './fmSaveHydrator';
import {
  campaignFromBackup,
  restorePersistedCampaign,
  type CampaignState,
} from './campaignState';

/**
 * The two write rules as they were written inline in App.tsx before the
 * campaign owner existed, kept here as the reference. Every field rule is
 * compared against these, so a later tidy-up cannot quietly change which
 * fields a stored snapshot or a backup file is allowed to blank.
 */

function referenceRestore(current: CampaignState, saved: FmHubPersistedState): CampaignState {
  const next = { ...current };
  if (Array.isArray(saved.players)) next.players = saved.players;
  if (Array.isArray(saved.matches)) next.matches = saved.matches;
  if (saved.staff) next.staff = saved.staff;
  if (saved.recruitmentCases) next.recruitmentCases = saved.recruitmentCases;
  if (saved.shortlists) next.shortlists = saved.shortlists;
  if (saved.saveDate) next.saveDate = saved.saveDate;
  if (saved.nextFixture) next.nextFixture = saved.nextFixture;
  if (saved.leagueStandingSub) next.leagueStandingSub = saved.leagueStandingSub;
  if (saved.wageSpend) next.wageSpend = saved.wageSpend;
  if (saved.balance) next.balance = saved.balance;
  if (saved.hydratedFmSave) next.hydratedFmSave = saved.hydratedFmSave;
  if (saved.activeShape) next.activeShape = saved.activeShape;
  if (saved.customSlots) next.customSlots = saved.customSlots;
  if (typeof saved.applyToAnalystOnly === 'boolean') {
    next.applyToAnalystOnly = saved.applyToAnalystOnly;
  }
  return next;
}

function referenceBackup(current: CampaignState, imported: FmHubPersistedState): CampaignState {
  const next = { ...current };
  next.players = imported.players;
  next.matches = imported.matches;
  next.staff = imported.staff || [];
  next.recruitmentCases = imported.recruitmentCases || [];
  next.shortlists = imported.shortlists || [];
  next.saveDate = imported.saveDate;
  next.nextFixture = imported.nextFixture;
  next.leagueStandingSub = imported.leagueStandingSub;
  next.wageSpend = imported.wageSpend;
  next.balance = imported.balance;
  next.hydratedFmSave = imported.hydratedFmSave;
  if (imported.activeShape) next.activeShape = imported.activeShape;
  next.customSlots = imported.customSlots ?? [];
  next.applyToAnalystOnly = Boolean(imported.applyToAnalystOnly);
  return next;
}

const player = (uid: string) => ({ uid, name: uid }) as unknown as PlayerRecord;
const staffRow = (uid: string) => ({ uid, name: uid }) as unknown as StaffRecord;
const match = (id: string) => ({ id, opponent: id }) as unknown as MatchLogEntry;
const save = (clubName: string) =>
  ({ decodedPayload: { meta: { clubName } } }) as unknown as HydratedSaveState;

const current: CampaignState = {
  players: [player('cur-1')],
  matches: [match('cur-match')],
  staff: [staffRow('cur-staff')],
  recruitmentCases: [{ id: 'cur-case' }] as unknown as CampaignState['recruitmentCases'],
  shortlists: [{ id: 'cur-list' }] as unknown as CampaignState['shortlists'],
  trackedTargets: [{ uid: 'cur-target' }] as unknown as CampaignState['trackedTargets'],
  saveDate: '11/08/2027',
  nextFixture: 'vs Current (H)',
  leagueStandingSub: '4th',
  wageSpend: '£10K',
  balance: '£900K',
  hydratedFmSave: save('Current FC'),
  activeShape: '4-3-3 DM Wide',
  customSlots: [{ slot: 'ST' }] as unknown as CampaignState['customSlots'],
  applyToAnalystOnly: true,
};

const fullSnapshot = {
  version: 2,
  lastSyncedAt: '2027-09-01T09:00:00.000Z',
  saveDate: '01/09/2027',
  nextFixture: 'vs Saved (A)',
  leagueStandingSub: '2nd',
  wageSpend: '£30K',
  balance: '£3.1M',
  clubName: 'Saved FC',
  players: [player('new-1'), player('new-2')],
  matches: [match('new-match')],
  staff: [staffRow('new-staff')],
  recruitmentCases: [{ id: 'new-case' }],
  shortlists: [{ id: 'new-list' }],
  hydratedFmSave: save('Saved FC'),
  activeShape: '4-2-3-1 DM AM Wide',
  customSlots: [],
  applyToAnalystOnly: false,
} as unknown as FmHubPersistedState;

const fieldCases: Array<[string, FmHubPersistedState]> = [
  ['every field present', fullSnapshot],
  ['no players', { ...fullSnapshot, players: undefined } as unknown as FmHubPersistedState],
  ['no matches', { ...fullSnapshot, matches: undefined } as unknown as FmHubPersistedState],
  ['no staff', { ...fullSnapshot, staff: undefined } as unknown as FmHubPersistedState],
  [
    'no recruitment cases',
    { ...fullSnapshot, recruitmentCases: undefined } as unknown as FmHubPersistedState,
  ],
  ['no shortlists', { ...fullSnapshot, shortlists: undefined } as unknown as FmHubPersistedState],
  ['no save date', { ...fullSnapshot, saveDate: '' } as unknown as FmHubPersistedState],
  ['no next fixture', { ...fullSnapshot, nextFixture: '' } as unknown as FmHubPersistedState],
  [
    'no league standing',
    { ...fullSnapshot, leagueStandingSub: '' } as unknown as FmHubPersistedState,
  ],
  ['no wage spend', { ...fullSnapshot, wageSpend: '' } as unknown as FmHubPersistedState],
  ['no balance', { ...fullSnapshot, balance: '' } as unknown as FmHubPersistedState],
  ['no save', { ...fullSnapshot, hydratedFmSave: null } as unknown as FmHubPersistedState],
  ['no active shape', { ...fullSnapshot, activeShape: undefined } as unknown as FmHubPersistedState],
  ['no custom slots', { ...fullSnapshot, customSlots: undefined } as unknown as FmHubPersistedState],
  [
    'no analyst-only flag',
    { ...fullSnapshot, applyToAnalystOnly: undefined } as unknown as FmHubPersistedState,
  ],
  [
    'players that are not a list',
    { ...fullSnapshot, players: 'oops' } as unknown as FmHubPersistedState,
  ],
  [
    'matches that are not a list',
    { ...fullSnapshot, matches: { length: 2 } } as unknown as FmHubPersistedState,
  ],
  [
    'analyst-only flag that is not a boolean',
    { ...fullSnapshot, applyToAnalystOnly: 'yes' } as unknown as FmHubPersistedState,
  ],
];

for (const [label, saved] of fieldCases) {
  test(`a stored snapshot matches the old inline restore: ${label}`, () => {
    assert.deepEqual(restorePersistedCampaign(current, saved), referenceRestore(current, saved));
  });

  test(`a backup matches the old inline import: ${label}`, () => {
    assert.deepEqual(campaignFromBackup(saved, current), referenceBackup(current, saved));
  });
}

test('the reference and the helper agree on a snapshot with nothing but players', () => {
  const sparse = {
    version: 2,
    lastSyncedAt: '2027-09-01T09:00:00.000Z',
    players: [player('only-1')],
  } as unknown as FmHubPersistedState;
  assert.deepEqual(restorePersistedCampaign(current, sparse), referenceRestore(current, sparse));
});
