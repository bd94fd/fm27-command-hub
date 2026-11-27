import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInitialSection, resolveTabTarget } from './useAppNavigation.ts';

test('resolveInitialSection reads ?tab= and ?panel= before the first render', () => {
  assert.deepEqual(resolveInitialSection(''), {
    tab: 'sync',
    hubPanel: 'analyst',
    tacticsSubTab: 'pitch',
  });

  assert.deepEqual(resolveInitialSection('?tab=squad'), {
    tab: 'squad',
    hubPanel: 'analyst',
    tacticsSubTab: 'pitch',
  });

  assert.deepEqual(resolveInitialSection('?tab=sync&panel=finances'), {
    tab: 'sync',
    hubPanel: 'finances',
    tacticsSubTab: 'pitch',
  });

  assert.deepEqual(resolveInitialSection('?tab=tactics&panel=setpieces'), {
    tab: 'tactics',
    hubPanel: 'analyst',
    tacticsSubTab: 'setpieces',
  });
});

test('resolveInitialSection keeps old setpieces links and PWA shortcuts working', () => {
  assert.deepEqual(resolveInitialSection('?tab=setpieces'), {
    tab: 'tactics',
    hubPanel: 'analyst',
    tacticsSubTab: 'setpieces',
  });

  assert.deepEqual(resolveInitialSection('?action=sync'), {
    tab: 'sync',
    hubPanel: 'analyst',
    tacticsSubTab: 'pitch',
  });

  assert.equal(resolveInitialSection('?tab=nowhere').tab, 'sync');
});

test('a panel from the other tab never leaks into the hub or tactics state', () => {
  const sync = resolveInitialSection('?tab=sync&panel=pitch');
  assert.equal(sync.hubPanel, 'analyst');
  assert.equal(sync.tacticsSubTab, 'pitch');

  const tactics = resolveInitialSection('?tab=tactics&panel=finances');
  assert.equal(tactics.tacticsSubTab, 'pitch');
  assert.equal(tactics.hubPanel, 'analyst');
});

test('resolveTabTarget maps a tab to the section the address bar should show', () => {
  assert.deepEqual(resolveTabTarget('setpieces', 'analyst'), {
    tab: 'tactics',
    panel: 'setpieces',
  });
  assert.deepEqual(resolveTabTarget('tactics', 'analyst'), { tab: 'tactics', panel: 'pitch' });
  assert.deepEqual(resolveTabTarget('sync', 'journey'), { tab: 'sync', panel: 'journey' });
  assert.deepEqual(resolveTabTarget('squad', 'journey'), { tab: 'squad', panel: null });
  assert.deepEqual(resolveTabTarget('staff', 'journey'), { tab: 'staff', panel: null });
});
