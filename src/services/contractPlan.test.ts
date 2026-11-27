import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_PLAN_STORAGE_KEY,
  parseContractPlan,
  readContractPlan,
  writeContractDecision,
} from './contractPlan';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  raw(): string | null {
    return this.map.get(CONTRACT_PLAN_STORAGE_KEY) ?? null;
  }
}

test('writes, reads and clears a decision for one club', () => {
  const storage = new MemoryStorage();
  const club = 'club:kvv-zelzate';

  const afterSet = writeContractDecision(storage, club, 'player:p1', 'renew');
  assert.deepEqual(afterSet, { 'player:p1': 'renew' });

  writeContractDecision(storage, club, 'staff:s1', 'release');
  assert.deepEqual(readContractPlan(storage, club), {
    'player:p1': 'renew',
    'staff:s1': 'release',
  });

  const afterClear = writeContractDecision(storage, club, 'player:p1', null);
  assert.deepEqual(afterClear, { 'staff:s1': 'release' });
  assert.deepEqual(readContractPlan(storage, club), { 'staff:s1': 'release' });
});

test('keeps each club plan separate', () => {
  const storage = new MemoryStorage();
  writeContractDecision(storage, 'club:alpha', 'player:a', 'sell');
  writeContractDecision(storage, 'club:beta', 'player:b', 'renew');

  assert.deepEqual(readContractPlan(storage, 'club:alpha'), { 'player:a': 'sell' });
  assert.deepEqual(readContractPlan(storage, 'club:beta'), { 'player:b': 'renew' });
});

test('drops malformed rows, unknown decisions and unsafe keys', () => {
  const raw = JSON.stringify({
    v: 1,
    clubs: {
      'club:alpha': {
        'player:ok': 'renew',
        'player:bad-decision': 'delete-everything',
        'not-a-row-key': 'sell',
        'staff:ok': 'release',
      },
      '': { 'player:x': 'sell' },
      'club:beta': 'not-an-object',
    },
  });
  const parsed = parseContractPlan(raw);
  assert.deepEqual(parsed.clubs['club:alpha'], { 'player:ok': 'renew', 'staff:ok': 'release' });
  assert.equal(parsed.clubs[''], undefined);
  assert.equal(parsed.clubs['club:beta'], undefined);
});

test('survives corrupt or empty storage without throwing', () => {
  const storage = new MemoryStorage();
  storage.setItem(CONTRACT_PLAN_STORAGE_KEY, '{not json');
  assert.deepEqual(readContractPlan(storage, 'club:alpha'), {});
  assert.deepEqual(readContractPlan(null, 'club:alpha'), {});
  assert.deepEqual(writeContractDecision(null, 'club:alpha', 'player:p1', 'renew'), {});
});

test('ignores a write whose row key is not a plan key', () => {
  const storage = new MemoryStorage();
  writeContractDecision(storage, 'club:alpha', 'player:good', 'renew');
  const unchanged = writeContractDecision(storage, 'club:alpha', 'rm -rf /', 'renew');
  assert.deepEqual(unchanged, { 'player:good': 'renew' });
  assert.deepEqual(readContractPlan(storage, 'club:alpha'), { 'player:good': 'renew' });
});

test('caps the number of rows stored per club', () => {
  const storage = new MemoryStorage();
  for (let index = 0; index < 300; index += 1) {
    writeContractDecision(storage, 'club:alpha', `player:p${index}`, 'renew');
  }
  const plan = readContractPlan(storage, 'club:alpha');
  assert.ok(Object.keys(plan).length <= 250, 'plan should stay capped');
  assert.ok(Object.keys(plan).length > 0);
});
