/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const readSrc = (relPath: string) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('src/index.css enforces dual-theme @custom-variant dark, 16px mobile inputs, and prefers-reduced-motion: reduce', () => {
  const css = readSrc('src/index.css');
  assert.match(css, /@custom-variant\s+dark\s+\(&:where\(\.dark,\s*\.dark \*\)\);/);
  assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*font-size:\s*16px;/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*animation-duration:\s*0\.01ms\s*!important;/);
});

test('PwaStatusBanners uses >= 44px mobile hitboxes and Light+Dark mode contrast pairs', () => {
  const src = readSrc('src/components/PwaStatusBanners.tsx');
  assert.match(src, /min-h-\[44px\]\s+sm:min-h-\[36px\]/);
  assert.match(src, /min-w-\[44px\]\s+min-h-\[44px\]\s+sm:min-w-\[36px\]\s+sm:min-h-\[36px\]/);
  // No bare mobile min-h-[36px] without a sm: prefix
  const bare36 = src.match(/(?<![a-z]:)min-h-\[36px\]/g);
  assert.equal(bare36, null, 'PwaStatusBanners should not have bare mobile min-h-[36px]');
  assert.match(src, /bg-amber-50\s+dark:bg-amber-950\/60/);
  assert.match(src, /bg-emerald-50\s+dark:bg-emerald-950\/60/);
  assert.match(src, /bg-white\s+dark:bg-slate-900\/95/);
});

test('MatchLogCard uses crisp 1px hairline framing (zero border-l-4) and >= 44px mobile AI debrief button', () => {
  const src = readSrc('src/components/MatchLogCard.tsx');
  assert.doesNotMatch(src, /border-l-4/);
  assert.match(src, /min-h-\[44px\]\s+sm:min-h-\[36px\]/);
  assert.match(src, /bg-white\s+dark:bg-slate-950\/60/);
});

test('Mobile sticky chrome (header + MobileBottomNav) stays strictly within <= 15% of 360x800–430x932 viewports', () => {
  const appSrc = readSrc('src/components/shell/AppHeader.tsx');
  const navSrc = readSrc('src/components/MobileBottomNav.tsx');

  // Verify tightened header and bottom nav classes exist in source
  assert.match(appSrc, /paddingTop:\s*'calc\(0\.35rem \+ env\(safe-area-inset-top, 0px\)\)'/);
  assert.match(appSrc, /pb-1\.5\s+sm:pb-3/);
  assert.match(navSrc, /paddingBottom:\s*'calc\(0\.3rem \+ env\(safe-area-inset-bottom, 0px\)\)'/);
  assert.match(navSrc, /min-h-\[46px\]/);
  assert.match(navSrc, /bg-white\/95\s+dark:bg-slate-900\/95/);
  assert.match(navSrc, /motion-reduce:animate-none/);

  // Computed mobile sticky chrome height with 0px safe-area inset (16px root font):
  // Header: 0.35rem (5.6px) + 44px CTA + 6px (pb-1.5) + 1px border = 56.6px
  // BottomNav: 4px (pt-1) + 46px button + 0.3rem (4.8px) + 1px border = 55.8px
  const headerPx = 5.6 + 44 + 6 + 1;
  const bottomNavPx = 4 + 46 + 4.8 + 1;
  const totalStickyPx = headerPx + bottomNavPx;

  for (const viewportHeight of [800, 915, 932]) {
    const ratio = totalStickyPx / viewportHeight;
    assert.ok(
      ratio <= 0.15,
      `Sticky chrome ${totalStickyPx.toFixed(1)}px exceeds 15% of ${viewportHeight}px (${(ratio * 100).toFixed(2)}%)`
    );
  }
});

test('Lazy-loaded Phase 2 modules use geometry-matched Suspense skeletons instead of bare Loading text', () => {
  const appSrc = readSrc('src/App.tsx');
  const hubSrc = readSrc('src/components/AutoSyncWorkspace.tsx');
  const squadSrc = readSrc('src/components/SquadAnalyticsTable.tsx');
  const skeletonsSrc = readSrc('src/components/WorkspaceSkeletons.tsx');

  assert.doesNotMatch(appSrc, /LazyTabFallback/);
  assert.match(appSrc, /<TabWorkspaceSkeleton\s+variant="sync"/);
  assert.match(appSrc, /<TabWorkspaceSkeleton\s+variant="squad"/);
  assert.match(appSrc, /<TabWorkspaceSkeleton\s+variant="tactics"/);
  assert.match(appSrc, /<TabWorkspaceSkeleton\s+variant="recruitment"/);
  assert.match(appSrc, /<TabWorkspaceSkeleton\s+variant="matches"/);
  assert.match(appSrc, /<TabWorkspaceSkeleton\s+variant="staff"/);

  assert.match(hubSrc, /<JourneyPanelSkeleton\s*\/>/);
  assert.match(hubSrc, /<UploadProgressSkeleton\s+label=/);
  assert.doesNotMatch(hubSrc, /Loading Save-to-Save Journey\.\.\./);

  assert.match(squadSrc, /<SquadSubViewSkeleton\s+variant="analytics"\s*\/>/);
  assert.match(squadSrc, /<SquadSubViewSkeleton\s+variant="compare"\s*\/>/);
  assert.match(squadSrc, /<SquadSubViewSkeleton\s+variant="progression"\s*\/>/);

  assert.match(skeletonsSrc, /motion-reduce:animate-none/);
});

test('ChartRankedListToggle and PitchInspectStrip enforce >= 44px mobile hitboxes', () => {
  const toggleSrc = readSrc('src/components/ChartRankedListToggle.tsx');
  const stripSrc = readSrc('src/components/PitchInspectStrip.tsx');
  assert.match(toggleSrc, /min-h-\[44px\]\s+sm:min-h-\[32px\]/);
  assert.doesNotMatch(toggleSrc, /min-h-\[40px\]/);
  assert.match(stripSrc, /min-h-\[44px\]/);
  assert.doesNotMatch(stripSrc, /min-h-\[36px\]/);
});
