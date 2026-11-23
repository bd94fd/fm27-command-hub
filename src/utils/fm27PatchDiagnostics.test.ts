import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import type { PatchCompatibilitySummary } from '../types/fmSave';
import {
  buildPatchDiagnosticReport,
  describePatchLayout,
  isNewFm27BuildDetected,
} from './fm27PatchDiagnostics';

function makeCompat(
  overrides: Partial<PatchCompatibilitySummary> = {}
): PatchCompatibilitySummary {
  return {
    detectedBuild: '27.2.0+2506012',
    isFm27: true,
    layoutStatus: 'dynamic',
    layoutBase: '27.1',
    isUntestedBuild: true,
    runtimePatchesApplied: true,
    dynamicBuildRegistered: true,
    sections: [
      {
        id: 'tactics_set_piece',
        label: 'Tactics & set-piece takers',
        status: 'fallback',
        fallbacks: 2,
      },
      { id: 'players', label: 'Squad & player attributes', status: 'clean', fallbacks: 0 },
      { id: 'selections', label: 'Selections', status: 'unavailable', fallbacks: 0 },
    ],
    summary: '27.2.0+2506012 · dynamic layout (27.1 base) · 1 clean, 1 fallback, 1 unavailable',
    advisory: 'New FM27 build detected. Layouts were inherited dynamically.',
    ...overrides,
  };
}

test('isNewFm27BuildDetected flags dynamic and untested builds only', () => {
  assert.equal(isNewFm27BuildDetected(null), false);
  assert.equal(isNewFm27BuildDetected(undefined), false);
  assert.equal(isNewFm27BuildDetected(makeCompat()), true);
  assert.equal(
    isNewFm27BuildDetected(
      makeCompat({
        detectedBuild: '27.1.0+2505117',
        layoutStatus: 'known',
        isUntestedBuild: false,
        dynamicBuildRegistered: false,
      })
    ),
    false
  );
  assert.equal(
    isNewFm27BuildDetected(
      makeCompat({ detectedBuild: '26.3.0', isFm27: false, layoutStatus: 'not-fm27', isUntestedBuild: false })
    ),
    false
  );
});

test('describePatchLayout explains known, dynamic and unverified layouts', () => {
  assert.equal(describePatchLayout(makeCompat()), 'dynamic layout (27.1 base)');
  assert.equal(describePatchLayout(makeCompat({ layoutStatus: 'known' })), 'known layout');
  assert.equal(
    describePatchLayout(makeCompat({ layoutStatus: 'unknown' })),
    'unverified layout'
  );
  assert.equal(
    describePatchLayout(makeCompat({ layoutStatus: 'not-fm27', isFm27: false })),
    'non-FM27 build'
  );
});

test('buildPatchDiagnosticReport produces a compact copyable summary', () => {
  const report = buildPatchDiagnosticReport({
    meta: {
      build: '27.2.0+2506012',
      saveName: 'Bobby Dean - Zelzate.fm',
      gameDateDmy: '14/03/2027',
      fmsaveVersion: '0.14.3',
      patchCompatibility: makeCompat(),
    },
    extractionManifest: {
      totalPlayers: 24,
      staff: 6,
      playedMatches: 8,
      upcomingFixtures: 5,
      tactics: 2,
      playerMatchStats: 24,
      playerSeasonHistory: 18,
      warningsCount: 2,
    },
    warnings: ['tactics: fallback'],
  });

  assert.match(report, /^FM27 PATCH DIAGNOSTIC · 27\.2\.0\+2506012/);
  assert.match(report, /Save: Bobby Dean - Zelzate\.fm · 14\/03\/2027 · fmsave 0\.14\.3/);
  assert.match(report, /Layout: dynamic layout \(27\.1 base\) · runtime patches applied/);
  assert.match(report, /Build: NEW\/UNTESTED/);
  assert.match(report, /- fallback: Tactics & set-piece takers \(2\)/);
  assert.match(report, /- clean: Squad & player attributes/);
  assert.match(report, /- unavailable: Selections/);
  assert.match(report, /Extracted: players 24 · staff 6 · results 8 · fixtures 5 · tactics 2 · stats 42/);
  assert.match(report, /Reader notes: 1/);
  assert.match(report, /Note: New FM27 build detected/);
  assert.ok(report.split('\n').length <= 20, 'report should stay compact');
});

test('buildPatchDiagnosticReport degrades calmly without a runtime summary', () => {
  const report = buildPatchDiagnosticReport({
    meta: { build: '27.3.0+2507001', saveName: 'future.fm', fmsaveVersion: '0.14.3' },
  });

  assert.match(report, /FM27 PATCH DIAGNOSTIC · 27\.3\.0\+2507001/);
  assert.match(report, /Patch compatibility: unavailable for this save/);
  assert.doesNotMatch(report, /error/i);
});

test('fm_layout_patcher classifies tested vs untested 27.x builds without fmsave', () => {
  const pyScript = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("fm_layout_patcher", "public/fm_layout_patcher.py")
patcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patcher)

known = patcher.build_patch_compatibility_summary(
    "27.1.0+2505117", {"players": True, "fixtures": False}
)
new = patcher.build_patch_compatibility_summary(
    "27.2.0+2506012", {"players": True, "fixtures": False}
)
print(json.dumps({
    "known": known,
    "new": new,
    "registered": patcher.register_dynamic_fm27_build("27.2.0+2506012"),
}))
`;
  const rawOut = execFileSync('python3', ['-c', pyScript], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 15_000,
  });
  const parsed = JSON.parse(rawOut.trim()) as {
    known: PatchCompatibilitySummary;
    new: PatchCompatibilitySummary;
    registered: boolean;
  };

  assert.equal(parsed.known.detectedBuild, '27.1.0+2505117');
  assert.equal(parsed.known.isFm27, true);
  assert.equal(parsed.known.isUntestedBuild, false);
  assert.equal(parsed.known.layoutStatus, 'known');

  assert.equal(parsed.new.detectedBuild, '27.2.0+2506012');
  assert.equal(parsed.new.isUntestedBuild, true);
  assert.equal(parsed.new.layoutBase, '27.1');
  assert.ok(parsed.new.advisory);
  assert.equal(parsed.registered, false);

  const players = parsed.new.sections.find((section) => section.id === 'players');
  const fixtures = parsed.new.sections.find((section) => section.id === 'fixtures');
  assert.equal(players?.status, 'clean');
  assert.equal(fixtures?.status, 'unavailable');
  assert.match(parsed.new.summary, /27\.2\.0\+2506012/);
});
