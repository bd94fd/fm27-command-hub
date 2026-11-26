import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNavigationParams } from './navigationUrl';
import { sectionHref, sectionLabel } from './sectionLabels';

test('every tab has a readable name', () => {
  for (const tab of ['sync', 'squad', 'tactics', 'recruitment', 'matches', 'staff']) {
    const label = sectionLabel(tab);
    assert.ok(label.length > 0, tab);
    assert.doesNotMatch(label, /[._-]/, `${tab} should not leak an id`);
  }
});

test('a named panel is appended, the default one is not', () => {
  assert.equal(sectionLabel('tactics', 'pitch'), 'Tactics & Corners');
  assert.equal(sectionLabel('tactics', 'prep'), 'Tactics & Corners · Match prep');
  assert.equal(sectionLabel('sync', 'analyst'), 'Hub & Analyst');
  assert.equal(sectionLabel('sync', 'finances'), 'Hub & Analyst · Finances');
});

test('an in-app href round trips back to the same section', () => {
  assert.deepEqual(parseNavigationParams(sectionHref('tactics', 'setpieces')), {
    tab: 'tactics',
    panel: 'setpieces',
  });
  assert.deepEqual(parseNavigationParams(sectionHref('squad', 'pitch')), {
    tab: 'squad',
    panel: null,
  });
  // The Hub's analyst view is the default, so it is restored without a panel id.
  assert.deepEqual(parseNavigationParams(sectionHref('sync', 'analyst')), {
    tab: 'sync',
    panel: null,
  });
  assert.deepEqual(parseNavigationParams(sectionHref('sync', 'finances')), {
    tab: 'sync',
    panel: 'finances',
  });
});

test('an href always starts with a query marker so storage can validate it', () => {
  assert.match(sectionHref('matches'), /^\?tab=matches$/);
});
