import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBinaryDiffSnapshot,
  buildSaveHistoryPointDraft,
  countPromisesAtRisk,
  parseLeaguePosition,
} from './saveHistoryPoint.ts';
import type { ClubGovernanceState } from '../types/fmSave';
import type { DecodedFmSavePayload, HydratedSaveState } from './fmSaveHydrator';

const governance = (statuses: string[]) =>
  ({
    playerPromiseAudits: statuses.map((status) => ({ status })),
  }) as unknown as ClubGovernanceState;

test('a league position is read from the label when the save has no table', () => {
  assert.equal(parseLeaguePosition('#3 · 12 GP'), 3);
  assert.equal(parseLeaguePosition('3'), 3);
  assert.equal(parseLeaguePosition('--'), null);
  assert.equal(parseLeaguePosition(''), null);
  assert.equal(parseLeaguePosition(null), null);
  assert.equal(parseLeaguePosition('#0'), null);
});

test('promises at risk count breaches and at-risk promises only', () => {
  assert.equal(countPromisesAtRisk(governance(['breached', 'at_risk', 'on_track'])), 2);
  assert.equal(countPromisesAtRisk(governance(['on_track'])), 0);
  assert.equal(countPromisesAtRisk(null), null);
  assert.equal(countPromisesAtRisk(undefined), null);
});

test('a save with no tactics and no binary forensics carries no binary diff', () => {
  const hydrated = { saveDateLabel: '11/08/2027' } as HydratedSaveState;
  assert.equal(
    buildBinaryDiffSnapshot(hydrated, { meta: {}, tactics: [] } as unknown as DecodedFmSavePayload),
    null
  );
});

test('a binary diff names the save and the in-game date', () => {
  const hydrated = { saveDateLabel: '11/08/2027' } as HydratedSaveState;
  const decoded = {
    meta: { fileName: 'auto_save_v03_.fm', clubName: 'KVV Zelzate' },
    tactics: [{ name: '433 Counter' }],
  } as unknown as DecodedFmSavePayload;
  const diff = buildBinaryDiffSnapshot(hydrated, decoded);
  assert.equal(diff?.label, '11/08/2027 · auto_save_v03_.fm');
  assert.equal(diff?.inGameDate, '11/08/2027');
  assert.equal(diff?.tactics.length, 1);
});

test('the history point prefers the decoded table over the printed label', () => {
  const hydrated = {
    saveDateLabel: '11/08/2027',
    leagueStandingLabel: '#9 · 12 GP',
    updatedSquad: [{ name: 'Keeper' }],
    updatedMatches: [],
    balanceLabel: '-£631K',
    canonicalBalanceNum: -631000,
    activeSuspensions: [],
    lastMatchTactic: null,
    financialRunway: null,
    governance: null,
  } as unknown as HydratedSaveState;
  const decoded = {
    meta: { clubName: 'KVV Zelzate' },
    leagueStanding: { position: 3, played: 12, points: 20 },
    finances: { balance: -600000, wagePayrollWeekly: 10604 },
    activeInjuries: [{ id: 'i1' }],
  } as unknown as DecodedFmSavePayload;

  const draft = buildSaveHistoryPointDraft(hydrated, decoded);
  assert.equal(draft.clubName, 'KVV Zelzate');
  assert.equal(draft.leaguePosition, 3);
  assert.equal(draft.played, 12);
  assert.equal(draft.points, 20);
  assert.equal(draft.balanceNum, -631000);
  assert.equal(draft.wagePayrollWeekly, 10604);
  assert.equal(draft.activeInjuriesCount, 1);
  assert.equal(draft.activeSuspensionsCount, 0);
  assert.equal(draft.promisesAtRiskCount, null);
});

test('the label position is the fallback when the save has no table', () => {
  const hydrated = {
    saveDateLabel: '11/08/2027',
    leagueStandingLabel: '#9 · 12 GP',
    updatedSquad: [],
    updatedMatches: [],
    activeSuspensions: [],
  } as unknown as HydratedSaveState;
  const decoded = { meta: {} } as unknown as DecodedFmSavePayload;
  assert.equal(buildSaveHistoryPointDraft(hydrated, decoded).leaguePosition, 9);
});
