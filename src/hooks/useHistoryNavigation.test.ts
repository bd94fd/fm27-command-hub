import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const readSrc = (relPath: string) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('MobileSheetFrame and App both register history layers', () => {
  const frame = readSrc('src/components/MobileSheetFrame.tsx');
  const app = readSrc('src/App.tsx');
  const hook = readSrc('src/hooks/useHistoryNavigation.ts');

  assert.match(frame, /useSheetHistory\(isOpen, onClose\)/);
  assert.match(app, /useSectionHistory\(navSection/);
  assert.match(app, /useSheetHistory\(showMoreSheet/);
  assert.match(app, /useSheetHistory\(showKnowledgeBase/);
  assert.match(app, /useSheetHistory\(calibrationLabOpen/);
  assert.match(hook, /addEventListener\('popstate'/);
  assert.match(hook, /history\.pushState/);
  assert.match(hook, /history\.back\(\)/);
  assert.doesNotMatch(app, /cleanUrl/);
});

test('a panel change reaches history through App, not through the component', () => {
  const app = readSrc('src/App.tsx');
  const hub = readSrc('src/components/AutoSyncWorkspace.tsx');
  const tactics = readSrc('src/components/TacticalWarRoom.tsx');

  assert.match(app, /onPanelChange=\{handleHubPanelChange\}/);
  assert.match(app, /onSubTabChange=\{handleTacticsSubTabChange\}/);
  assert.match(app, /pushNavSection\(\{ tab: 'sync', panel \}\)/);
  assert.match(app, /pushNavSection\(\{ tab: 'tactics', panel \}\)/);
  assert.match(hub, /onPanelChange\?\.\(VIEW_TO_HUB_PANEL\[view\]\)/);
  assert.match(tactics, /onSubTabChange\?\.\(tab\.id\)/);
});

test('the section in the address bar is restored when the user presses Back', () => {
  const app = readSrc('src/App.tsx');
  assert.match(app, /useSectionHistory\(navSection, \(next\) => \{/);
  assert.match(app, /if \(tab === 'sync' && next\.panel\) setHubPanel/);
  assert.match(app, /if \(tab === 'tactics' && next\.panel\) setTacticsSubTab/);
});

test('a first load reads the tab and panel from the URL before rendering', () => {
  const app = readSrc('src/App.tsx');
  assert.match(app, /parseNavigationParams\(window\.location\.search\)/);
  assert.match(app, /useState<HubPanel>/);
  assert.match(app, /useState<TacticsPanel>/);
});
