import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildTabHistoryState, buildTabUrl } from './useHistoryNavigation';

const ROOT = process.cwd();
const readSrc = (relPath: string) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('buildTabUrl keeps the current path and hash while setting ?tab=', () => {
  assert.equal(
    buildTabUrl('squad', 'https://example.test/app?action=sync#top'),
    '/app?action=sync&tab=squad#top'
  );
});

test('buildTabHistoryState removes a closed overlay entry so its cleanup cannot pop the tab', () => {
  const state = buildTabHistoryState('staff', {
    __fm27Tab: 'sync',
    __fm27Sheet: 'fm27-sheet-3',
  });
  assert.deepEqual(state, { __fm27Tab: 'staff' });
});

test('MobileSheetFrame and App both register history layers', () => {
  const frame = readSrc('src/components/MobileSheetFrame.tsx');
  const app = readSrc('src/App.tsx');
  const hook = readSrc('src/hooks/useHistoryNavigation.ts');

  assert.match(frame, /useSheetHistory\(isOpen, onClose\)/);
  assert.match(app, /useTabHistory<ActiveTab>/);
  assert.match(app, /useSheetHistory\(showMoreSheet/);
  assert.match(app, /useSheetHistory\(showKnowledgeBase/);
  assert.match(app, /useSheetHistory\(calibrationLabOpen/);
  assert.match(hook, /addEventListener\('popstate'/);
  assert.match(hook, /history\.pushState/);
  assert.match(hook, /history\.back\(\)/);
  assert.doesNotMatch(app, /cleanUrl/);
});
