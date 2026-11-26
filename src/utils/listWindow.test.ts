import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextWindowLimit, takeLeadingWindow, takeTrailingWindow } from './listWindow';

const items = Array.from({ length: 120 }, (_, i) => i + 1);

test('leading window trims to the limit and keeps order', () => {
  assert.deepEqual(takeLeadingWindow(items, 30), items.slice(0, 30));
});

test('leading window returns the same array once everything fits', () => {
  assert.equal(takeLeadingWindow(items, 120), items);
  assert.equal(takeLeadingWindow(items, 500), items);
});

test('leading window never returns a negative page', () => {
  assert.deepEqual(takeLeadingWindow(items, -5), []);
});

test('trailing window keeps the newest items for the chart', () => {
  assert.deepEqual(takeTrailingWindow(items, 60), items.slice(-60));
  assert.equal(takeTrailingWindow(items, 60)[59], 120);
});

test('trailing window returns the same array when the limit covers everything', () => {
  assert.equal(takeTrailingWindow(items, 60).length, 60);
  assert.equal(takeTrailingWindow(items, 200), items);
});

test('next window limit grows by one page and stops at the total', () => {
  assert.equal(nextWindowLimit(30, 30, 120), 60);
  assert.equal(nextWindowLimit(90, 30, 120), 120);
  assert.equal(nextWindowLimit(120, 30, 120), 120);
});
