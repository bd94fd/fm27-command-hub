import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECENT_VIEWS_KEY,
  RECENT_VIEW_LIMIT,
  VIEW_PREFS_KEY,
  parseRecentViews,
  parseViewPreferences,
  readRecentViews,
  readViewPreference,
  recordRecentView,
  writeRecentViews,
  writeViewPreference,
} from './viewPreferences';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  dump(key: string) {
    return this.map.get(key) ?? null;
  }
}

test('a remembered filter survives a round trip', () => {
  const storage = new MemoryStorage();
  writeViewPreference(storage, 'squadView', 'analytics');
  assert.equal(readViewPreference(storage, 'squadView'), 'analytics');
  writeViewPreference(storage, 'matchesSeason', '2026/27');
  assert.equal(readViewPreference(storage, 'matchesSeason'), '2026/27');
  assert.equal(readViewPreference(storage, 'squadView'), 'analytics');
});

test('view preferences never touch the save state key', () => {
  const storage = new MemoryStorage();
  writeViewPreference(storage, 'recruitmentView', 'contracts');
  assert.equal(VIEW_PREFS_KEY.includes('view_prefs'), true);
  assert.equal(storage.dump('fm27_command_hub_state_v1'), null);
  assert.equal(storage.dump('fm27_save_history_v1'), null);
});

test('corrupt or foreign values fall back instead of throwing', () => {
  assert.deepEqual(parseViewPreferences('{not json'), {});
  assert.deepEqual(parseViewPreferences('[]'), {});
  assert.deepEqual(parseViewPreferences('{"unknown":"x"}'), {});
  assert.deepEqual(parseViewPreferences('{"squadView":42}'), {});
  assert.deepEqual(parseViewPreferences('{"squadView":""}'), {});
  assert.deepEqual(parseViewPreferences(null), {});

  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
  assert.equal(readViewPreference(broken, 'squadView'), null);
});

test('an oversized or missing value is not written', () => {
  const storage = new MemoryStorage();
  writeViewPreference(storage, 'squadView', 'x'.repeat(41));
  assert.equal(readViewPreference(storage, 'squadView'), null);
  writeViewPreference(null, 'squadView', 'table');
});

test('recent views keep the newest first, one entry per location, capped', () => {
  let views = recordRecentView([], { href: '?tab=squad', label: 'Squad ratings', visitedAt: 1 });
  views = recordRecentView(views, { href: '?tab=matches', label: 'Matches', visitedAt: 2 });
  assert.deepEqual(
    views.map((v) => v.href),
    ['?tab=matches', '?tab=squad']
  );

  views = recordRecentView(views, { href: '?tab=squad', label: 'Squad ratings', visitedAt: 3 });
  assert.deepEqual(
    views.map((v) => v.href),
    ['?tab=squad', '?tab=matches'],
    'revisiting moves an entry up instead of duplicating it'
  );

  for (let i = 0; i < 10; i += 1) {
    views = recordRecentView(views, { href: `?tab=squad&panel=p${i}`, label: `View ${i}` });
  }
  assert.equal(views.length, RECENT_VIEW_LIMIT);
});

test('recent views are validated on the way back in', () => {
  const good = JSON.stringify([
    { href: '?tab=tactics&panel=prep', label: 'Tactics & Corners · Match prep', visitedAt: 10 },
    { href: 'https://evil.example/x', label: 'Bad', visitedAt: 11 },
    { href: '?tab=squad', label: '', visitedAt: 12 },
    { href: '?tab=staff', label: 'Staff', visitedAt: Number.NaN },
    { href: '?tab=matches', label: 'Matches', visitedAt: 13 },
    { href: '?tab=matches', label: 'Dupe', visitedAt: 14 },
  ]);
  assert.deepEqual(
    parseRecentViews(good).map((v) => v.href),
    ['?tab=tactics&panel=prep', '?tab=matches']
  );
  assert.deepEqual(parseRecentViews('nonsense'), []);
  assert.deepEqual(parseRecentViews('{}'), []);
});

test('reading and writing recent views goes through browser storage only', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(readRecentViews(storage), []);
  const views = [{ href: '?tab=staff', label: 'Staff', visitedAt: 5 }];
  writeRecentViews(storage, views);
  assert.deepEqual(readRecentViews(storage), views);
  assert.ok(storage.dump(RECENT_VIEWS_KEY)?.includes('?tab=staff'));
  assert.deepEqual(readRecentViews(null), []);
});
