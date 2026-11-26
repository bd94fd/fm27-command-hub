import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HUB_PANEL_TO_VIEW,
  HUB_PANELS,
  TACTICS_PANELS,
  VIEW_TO_HUB_PANEL,
  buildSectionHistoryState,
  buildSectionUrl,
  defaultPanelForTab,
  isValidPanel,
  panelsForTab,
  parseNavigationParams,
} from './navigationUrl';

const KEYS = { tab: '__t', panel: '__p', sheet: '__s' };

test('parseNavigationParams reads a panel it recognises', () => {
  assert.deepEqual(parseNavigationParams('?tab=tactics&panel=setpieces'), {
    tab: 'tactics',
    panel: 'setpieces',
  });
  assert.deepEqual(parseNavigationParams('?tab=sync&panel=finances'), {
    tab: 'sync',
    panel: 'finances',
  });
});

test('?tab=setpieces keeps working as a link to the Set Pieces panel', () => {
  assert.deepEqual(parseNavigationParams('?tab=setpieces'), {
    tab: 'tactics',
    panel: 'setpieces',
  });
});

test('a panel that does not belong to the tab is dropped, not trusted', () => {
  assert.deepEqual(parseNavigationParams('?tab=staff&panel=finances'), {
    tab: 'staff',
    panel: null,
  });
  assert.deepEqual(parseNavigationParams('?tab=sync&panel=nonsense'), {
    tab: 'sync',
    panel: null,
  });
});

test('an unknown or absent tab leaves the app on its default', () => {
  assert.deepEqual(parseNavigationParams('?tab=nope'), { tab: null, panel: null });
  assert.deepEqual(parseNavigationParams(''), { tab: null, panel: null });
});

test('buildSectionUrl keeps the path, the hash and other parameters', () => {
  assert.equal(
    buildSectionUrl('https://example.test/app?action=sync#top', 'squad'),
    '/app?action=sync&tab=squad#top'
  );
  assert.equal(
    buildSectionUrl('https://example.test/app?tab=squad&panel=nonsense', 'tactics', 'prep'),
    '/app?tab=tactics&panel=prep'
  );
});

test('buildSectionUrl removes a panel when the next tab has none', () => {
  assert.equal(
    buildSectionUrl('https://example.test/?tab=tactics&panel=playbook', 'matches'),
    '/?tab=matches'
  );
});

test('buildSectionUrl refuses a panel that belongs to another tab', () => {
  assert.equal(
    buildSectionUrl('https://example.test/', 'staff', 'finances'),
    '/?tab=staff'
  );
});

test('panels and defaults describe what each tab can show', () => {
  assert.deepEqual(panelsForTab('sync'), HUB_PANELS);
  assert.deepEqual(panelsForTab('tactics'), TACTICS_PANELS);
  assert.deepEqual(panelsForTab('squad'), []);
  assert.equal(defaultPanelForTab('sync'), 'analyst');
  assert.equal(defaultPanelForTab('tactics'), 'pitch');
  assert.equal(defaultPanelForTab('matches'), null);
  assert.equal(isValidPanel('tactics', 'setpieces'), true);
  assert.equal(isValidPanel('sync', 'setpieces'), false);
});

test('the Hub panel ids used in URLs map to the ones the Hub renders', () => {
  for (const panel of HUB_PANELS) {
    assert.equal(VIEW_TO_HUB_PANEL[HUB_PANEL_TO_VIEW[panel]], panel);
  }
});

test('a panel entry never inherits a closed overlay state', () => {
  assert.deepEqual(
    buildSectionHistoryState('tactics', 'setpieces', { __t: 'sync', __p: 'finances', __s: 'x' }, KEYS),
    { __t: 'tactics', __p: 'setpieces' }
  );
  assert.deepEqual(
    buildSectionHistoryState('squad', null, { __t: 'tactics', __p: 'prep' }, KEYS),
    { __t: 'squad' }
  );
});
