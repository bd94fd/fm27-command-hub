import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rankPaletteItems, scorePaletteItem } from './paletteSearch';

const item = (title: string, category: string, subtitle = '') => ({ title, category, subtitle });

test('a name that starts with the query beats a command that mentions it', () => {
  const results = rankPaletteItems(
    [
      item('Match Log Archive', 'Navigation', 'Review fixtures and xG trends'),
      item('Kane, Harry', 'Squad Player', 'ST · Age 33'),
      item('Kane Smith', 'Staff', 'Scout'),
    ],
    'kane'
  );
  assert.deepEqual(
    results.map((r) => r.title),
    ['Kane Smith', 'Kane, Harry'],
    'both start with the query; the shorter name is easier to hit'
  );
});

test('an exact name wins over a longer name', () => {
  const results = rankPaletteItems(
    [item('Harry Kane Jr', 'Squad Player'), item('Harry Kane', 'Squad Player')],
    'Harry Kane'
  );
  assert.equal(results[0].title, 'Harry Kane');
});

test('searching ignores case and surrounding spaces', () => {
  assert.equal(scorePaletteItem(item('Declan Rice', 'Squad Player'), '  RICE '), 80);
  assert.equal(scorePaletteItem(item('Declan Rice', 'Squad Player'), 'DEC'), 100);
});

test('one long category cannot push the others out of the list', () => {
  const players = Array.from({ length: 20 }, (_, i) => item(`Player ${i}`, 'Squad Player'));
  const staff = [item('Player Coach', 'Staff')];
  const results = rankPaletteItems([...players, ...staff], 'player', {
    perCategoryLimit: 3,
    totalLimit: 10,
  });
  assert.equal(results.filter((r) => r.category === 'Squad Player').length, 3);
  assert.equal(results.filter((r) => r.category === 'Staff').length, 1);
});

test('the total limit is respected', () => {
  const items = Array.from({ length: 50 }, (_, i) => item(`Keeper ${i}`, 'Squad Player'));
  assert.equal(
    rankPaletteItems(items, 'keeper', { totalLimit: 7, perCategoryLimit: 50 }).length,
    7
  );
});

test('nothing typed shows a short list of what is there', () => {
  const items = Array.from({ length: 50 }, (_, i) => item(`Item ${i}`, 'Navigation'));
  assert.equal(rankPaletteItems(items, '').length, 28);
  assert.equal(rankPaletteItems(items, '   ').length, 28);
  assert.equal(rankPaletteItems(items, '', { emptyLimit: 5 }).length, 5);
});

test('a query that matches nothing returns nothing', () => {
  assert.deepEqual(rankPaletteItems([item('Squad', 'Navigation')], 'zzzz'), []);
});

test('a match on the second word still counts', () => {
  const results = rankPaletteItems(
    [item('Tactical War Room', 'Navigation'), item('Squad Ratings', 'Navigation')],
    'war'
  );
  assert.deepEqual(results.map((r) => r.title), ['Tactical War Room']);
});

test('the palette keeps recent shortcuts out of typed results', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/components/CommandPaletteModal.tsx'),
    'utf8'
  );
  assert.match(src, /query\.trim\(\)\s*\?\s*\/\/[^\n]*\n\s*rankPaletteItems\(allItems, query/);
  assert.match(src, /rankPaletteItems\(searchableItems, '', \{ emptyLimit: 28 \}\)/);
  assert.match(src, /onOpenRecentView\?\.\(view\.href\)/);
  assert.match(src, /recentViews\?: RecentView\[\]/);
});
