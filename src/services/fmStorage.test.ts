import test from 'node:test';
import assert from 'node:assert/strict';
import {
  savePersistedFmState,
  loadPersistedFmState,
  recordPreviousSnapshot,
  loadPreviousSnapshot,
  clearPersistedFmState,
  exportFmStateBackupJson,
  importFmStateBackupJson,
  loadTrackedScoutTargets,
  toggleTrackedScoutTarget,
  removeTrackedScoutTarget,
  isScoutTargetTracked,
} from './fmStorage';
import { PlayerRecord, MatchLogEntry } from '../types/fm27';
import { RecruitmentTarget } from '../types/fmSave';

// Mock localStorage for Node test runner
const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => storageMap.set(key, val),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

(globalThis as unknown as { window: { localStorage: typeof mockLocalStorage } }).window = {
  localStorage: mockLocalStorage,
};

const samplePlayer: PlayerRecord = {
  id: 'p1',
  number: 9,
  name: 'Mbey Epolo',
  position: 'ST (C)',
  apps: '5',
  minutes: 401,
  rating: 7.42,
  goals: 5,
  xG: 5.15,
  xGPer90: 1.16,
  assists: 1,
  xA: 0.25,
  xAPer90: 0.06,
  drbPer90: 0.45,
  prPassesPer90: 1.3,
  hdrPct: 48,
  intPer90: 0.3,
  tckPct: 0,
  personality: 'Fairly Determined',
  age: 26,
  ability: 3.5,
  potential: 4.0,
  expires: '30/06/2029',
  nation: 'Belgium',
  wagePw: 650,
  status: 'Starter',
  attributes: {
    pace: 13,
    acceleration: 12,
    stamina: 13,
    jumpingReach: 13,
    determination: 16,
    passing: 8,
    finishing: 14,
    tackling: 1,
    firstTouch: 14,
    decisions: 10,
    workRate: 8,
    offTheBall: 8,
  },
  ipRole: 'Poacher',
  oopRole: 'Central Outlet Centre Forward',
  notes: 'FM Save CA 92/PA 104',
};

const sampleMatch: MatchLogEntry = {
  id: 'm1',
  eventNumber: 34,
  date: '18/09/2027',
  competition: '1e Nationale VV',
  opponent: 'Jong Cercle',
  venue: 'A',
  result: 'W',
  score: '2 - 0',
  xGFor: 1.88,
  xGAgainst: 0.41,
  possession: 44,
  shotsFor: '13 (6)',
  shotsAgainst: '6 (1)',
  cccFor: 3,
  cccAgainst: 0,
  passCompletion: 85,
  goalTimeline: '22m Epolo, 58m Epolo',
  potm: 'Mbey Epolo (8.40)',
  defensiveWatchpoints: 'Clean sheet',
  tacticalAudit: 'Counter Positive win',
};

test('fmStorage saves, loads, and persists state across reloads', () => {
  mockLocalStorage.clear();

  const success = savePersistedFmState({
    saveDate: '18/09/2027',
    nextFixture: '02/10/2027 vs KFC Dessel Sport',
    leagueStandingSub: '#3 of 16 | 9 Pts',
    wageSpend: '£9,707 / £10,203 p/w',
    balance: '(£710K)',
    clubName: 'KVV Zelzate',
    players: [samplePlayer],
    matches: [sampleMatch],
    hydratedFmSave: null,
  });

  assert.equal(success, true);

  const loaded = loadPersistedFmState();
  assert.ok(loaded);
  assert.equal(loaded.saveDate, '18/09/2027');
  assert.equal(loaded.players.length, 1);
  assert.equal(loaded.players[0].name, 'Mbey Epolo');
  assert.equal(loaded.matches.length, 1);
  assert.equal(loaded.matches[0].opponent, 'Jong Cercle');
  assert.equal(loaded.version, 1);
  assert.ok(loaded.lastSyncedAt);
});

test('fmStorage records and retrieves previous snapshot for delta tracking', () => {
  mockLocalStorage.clear();

  recordPreviousSnapshot('15/09/2027', [samplePlayer], [sampleMatch]);
  const snap = loadPreviousSnapshot();

  assert.ok(snap);
  assert.equal(snap.saveDate, '15/09/2027');
  assert.equal(snap.playersCount, 1);
  assert.equal(snap.playersSnapshot[0].name, 'Mbey Epolo');
  assert.equal(snap.playersSnapshot[0].goals, 5);
});

test('fmStorage clears persisted state completely', () => {
  savePersistedFmState({
    saveDate: '18/09/2027',
    nextFixture: '',
    leagueStandingSub: '',
    wageSpend: '',
    balance: '',
    players: [samplePlayer],
    matches: [],
    hydratedFmSave: null,
  });

  assert.ok(loadPersistedFmState());
  clearPersistedFmState();
  assert.equal(loadPersistedFmState(), null);
  assert.equal(loadPreviousSnapshot(), null);
});

test('fmStorage exports and imports JSON backups cleanly', () => {
  mockLocalStorage.clear();

  savePersistedFmState({
    saveDate: '18/09/2027',
    nextFixture: 'Dessel Sport',
    leagueStandingSub: '#3',
    wageSpend: '£9.7K',
    balance: '£-710K',
    players: [samplePlayer],
    matches: [sampleMatch],
    hydratedFmSave: null,
  });

  const exported = exportFmStateBackupJson();
  assert.ok(exported);
  assert.ok(exported.includes('Mbey Epolo'));

  mockLocalStorage.clear();
  assert.equal(loadPersistedFmState(), null);

  const imported = importFmStateBackupJson(exported);
  assert.ok(imported);
  assert.equal(imported.players[0].name, 'Mbey Epolo');

  // Corrupted JSON returns null without crashing
  const badImport = importFmStateBackupJson('invalid json string');
  assert.equal(badImport, null);
});

test('fmStorage persists Shortlist tracked targets with add/remove toggling', () => {
  mockLocalStorage.clear();

  const targetA: RecruitmentTarget = {
    uid: 9001,
    name: 'Lucas Janssens',
    age: 21,
    nationality: 'Belgium',
    primaryPosition: 'AMR',
    isFreeAgent: true,
    contractExpiryMonths: 0,
    demandedWageEur: 350,
    attributes: { pace: 15, acceleration: 15 },
  };
  const targetB: RecruitmentTarget = {
    uid: 9002,
    name: 'Tomasz Kowalski',
    age: 24,
    nationality: 'Poland',
    primaryPosition: 'DC',
    isFreeAgent: false,
    contractExpiryMonths: 5,
    demandedWageEur: 600,
    attributes: { positioning: 14, jumpingReach: 15 },
  };

  assert.equal(loadTrackedScoutTargets().length, 0);

  // Add targetA
  const addA = toggleTrackedScoutTarget(targetA);
  assert.equal(addA.tracked, true);
  assert.equal(addA.targets.length, 1);
  assert.equal(isScoutTargetTracked(addA.targets, targetA), true);

  // Add targetB
  const addB = toggleTrackedScoutTarget(targetB);
  assert.equal(addB.tracked, true);
  assert.equal(addB.targets.length, 2);

  // Reload from localStorage
  const reloaded = loadTrackedScoutTargets();
  assert.equal(reloaded.length, 2);
  assert.equal(isScoutTargetTracked(reloaded, targetA), true);
  assert.equal(isScoutTargetTracked(reloaded, targetB), true);

  // Toggle targetA again -> untracks
  const untrackA = toggleTrackedScoutTarget(targetA);
  assert.equal(untrackA.tracked, false);
  assert.equal(untrackA.targets.length, 1);
  assert.equal(isScoutTargetTracked(untrackA.targets, targetA), false);

  // Remove targetB explicitly
  const afterRemove = removeTrackedScoutTarget(targetB.uid);
  assert.equal(afterRemove.length, 0);
  assert.equal(loadTrackedScoutTargets().length, 0);
});
