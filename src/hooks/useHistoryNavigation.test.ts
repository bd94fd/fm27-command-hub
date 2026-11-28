import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const readSrc = (relPath: string) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('MobileSheetFrame and App both register history layers', () => {
  const frame = readSrc('src/components/MobileSheetFrame.tsx');
  const overlays = readSrc('src/hooks/useOverlayState.ts');
  const app = readSrc('src/App.tsx');
  const nav = readSrc('src/hooks/useAppNavigation.ts');
  const hook = readSrc('src/hooks/useHistoryNavigation.ts');

  assert.match(frame, /useSheetHistory\(isOpen, onClose\)/);
  assert.match(nav, /useSectionHistory\(navSection/);
  // The overlays that are not sheet-frame based keep their Back entries in the
  // overlay hook, which the shell calls.
  assert.match(overlays, /useSheetHistory\(showMoreSheet/);
  assert.match(overlays, /useSheetHistory\(showKnowledgeBase/);
  assert.match(overlays, /useSheetHistory\(calibrationLabOpen/);
  assert.match(app, /useOverlayState\(\)/);
  assert.match(hook, /addEventListener\('popstate'/);
  assert.match(hook, /history\.pushState/);
  assert.match(hook, /history\.back\(\)/);
  assert.doesNotMatch(app, /cleanUrl/);
});

test('a panel change reaches history through the navigation hook, not through the component', () => {
  const app = readSrc('src/App.tsx');
  const nav = readSrc('src/hooks/useAppNavigation.ts');
  const hub = readSrc('src/components/AutoSyncWorkspace.tsx');
  const tactics = readSrc('src/components/TacticalWarRoom.tsx');

  assert.match(app, /onPanelChange=\{handleHubPanelChange\}/);
  assert.match(app, /onSubTabChange=\{handleTacticsSubTabChange\}/);
  assert.match(nav, /pushSection\(\{ tab: 'sync', panel \}\)/);
  assert.match(nav, /pushSection\(\{ tab: 'tactics', panel \}\)/);
  assert.match(hub, /onPanelChange\?\.\(VIEW_TO_HUB_PANEL\[view\]\)/);
  assert.match(tactics, /onSubTabChange\?\.\(tab\.id\)/);
});

test('the section in the address bar is restored when the user presses Back', () => {
  const nav = readSrc('src/hooks/useAppNavigation.ts');
  assert.match(nav, /useSectionHistory\(navSection, \(next\) =>/);
  assert.match(nav, /if \(tab === 'sync' && panel\) setHubPanelState/);
  assert.match(nav, /if \(tab === 'tactics' && panel\) setTacticsSubTabState/);
});

test('a first load reads the tab and panel from the URL before rendering', () => {
  const nav = readSrc('src/hooks/useAppNavigation.ts');
  assert.match(nav, /parseNavigationParams\(search\)/);
  assert.match(nav, /parsePwaLaunchParams\(search\)\.initialTab/);
  assert.match(nav, /useState<HubPanel>/);
  assert.match(nav, /useState<TacticsPanel>/);
});
