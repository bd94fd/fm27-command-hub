import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SaveCompatibilityPanel } from '../components/SaveCompatibilityPanel';
import {
  FM27_SAVE_COMPATIBILITY_MATRIX,
  formatSaveCompatibilityForAnalyst,
  resolveSaveCompatibility,
} from './fm27SaveCompatibility';
import { buildLiveTacticalAnalystContext } from './tacticalAnalystContext';
import type { PatchCompatibilitySummary } from '../types/fmSave';

function compat(
  detectedBuild: string,
  overrides: Partial<PatchCompatibilitySummary> = {}
): PatchCompatibilitySummary {
  return {
    detectedBuild,
    isFm27: true,
    layoutStatus: 'known',
    layoutBase: null,
    isUntestedBuild: false,
    runtimePatchesApplied: false,
    dynamicBuildRegistered: false,
    sections: [],
    summary: detectedBuild,
    ...overrides,
  };
}

test('compatibility matrix records supported FM27 patches and changed fields', () => {
  assert.deepEqual(
    FM27_SAVE_COMPATIBILITY_MATRIX.map((row) => row.id),
    ['27.1', '27.0', '27.2']
  );
  const verified = FM27_SAVE_COMPATIBILITY_MATRIX[0];
  assert.equal(verified.level, 'verified');
  assert.ok(verified.fieldsChanged.includes('Staff Preferred Jobs (job_ratings)'));
  assert.ok(verified.fieldsChanged.includes('Sponsorship dates_reordered warning'));
});

test('resolveSaveCompatibility verifies 27.1 and supports 27.0', () => {
  const current = resolveSaveCompatibility({
    build: '27.1.0+2505117',
    game: 'FM27',
    knownBuild: true,
    fmsaveVersion: '0.14.4',
    patchCompatibility: compat('27.1.0+2505117', { layoutBase: '27.1' }),
  });
  assert.equal(current.level, 'verified');
  assert.equal(current.layoutBase, '27.1');
  assert.equal(current.needsAttention, false);
  assert.match(current.message, /Verified/i);

  const older = resolveSaveCompatibility({
    build: '27.0.1',
    game: 'FM27',
    knownBuild: true,
    fmsaveVersion: '0.14.0',
    patchCompatibility: compat('27.0.1', { layoutBase: '27.0' }),
  });
  assert.equal(older.level, 'supported');
  assert.equal(older.layoutBase, '27.0');
});

test('later 27.x builds are untested and keep the inherited layout', () => {
  const next = resolveSaveCompatibility({
    build: '27.2.0+2506012',
    game: 'FM27',
    fmsaveVersion: '0.14.4',
    patchCompatibility: compat('27.2.0+2506012', {
      layoutStatus: 'dynamic',
      layoutBase: '27.1',
      isUntestedBuild: true,
      dynamicBuildRegistered: true,
    }),
  });
  assert.equal(next.level, 'untested');
  assert.equal(next.layoutBase, '27.1');
  assert.equal(next.needsAttention, true);
  assert.match(next.message, /Import continues/i);

  const unknown = resolveSaveCompatibility({
    build: '27.3.0+2507001',
    game: 'FM27',
    knownBuild: false,
    fmsaveVersion: '0.14.5',
  });
  assert.equal(unknown.level, 'untested');
  assert.match(unknown.message, /could not confirm/i);
});

test('unsupported saves say FM27 fields are not trusted', () => {
  const notFm27 = resolveSaveCompatibility({
    build: '26.3.0',
    game: 'FM26',
    knownBuild: false,
    fmsaveVersion: '0.13.0',
    patchCompatibility: compat('26.3.0', {
      isFm27: false,
      layoutStatus: 'not-fm27',
    }),
  });
  assert.equal(notFm27.level, 'unsupported');
  assert.equal(notFm27.rowId, 'unsupported');
  assert.match(notFm27.message, /does not trust any FM27 field/i);
  assert.match(notFm27.message, /Import a save from a supported FM27 27\.0 or 27\.1 build/);

  const unknownBuild = resolveSaveCompatibility({
    build: 'garbage',
    game: 'FM27',
    fmsaveVersion: '0.14.4',
  });
  assert.equal(unknownBuild.level, 'unsupported');
  assert.equal(unknownBuild.label, 'Build not recognised');
});

test('the compatibility panel renders the current state and known-build matrix', () => {
  const resolution = resolveSaveCompatibility({
    build: '27.1.0+2505117',
    game: 'FM27',
    fmsaveVersion: '0.14.4',
    patchCompatibility: compat('27.1.0+2505117', { layoutBase: '27.1' }),
  });
  const html = renderToStaticMarkup(
    React.createElement(SaveCompatibilityPanel, { compatibility: resolution })
  );

  for (const label of [
    'Save Compatibility',
    'Verified',
    'Detected Build',
    '27.1.0+2505117',
    'Staff Preferred Jobs (job_ratings)',
    'Known builds and changed fields',
    'FM27 27.0.x',
    'Unsupported',
  ]) {
    assert.ok(html.includes(label), `compatibility panel is missing ${label}`);
  }
});

test('Analyst context carries the same compatibility answer', () => {
  const context = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '15/02/2028',
    nextFixture: '18/02/2028 vs Opponent (H)',
    leagueStandingSub: '#3 of 16 (23 Pts)',
    wageSpend: '£10,257 / £10,203 p/w',
    balance: '-£749K',
    players: [],
    matches: [],
    hydratedFmSave: {
      decodedPayload: {
        meta: {
          build: '27.2.0+2506012',
          game: 'FM27',
          fmsaveVersion: '0.14.4',
          knownBuild: false,
          patchCompatibility: compat('27.2.0+2506012', {
            layoutStatus: 'dynamic',
            layoutBase: '27.1',
            isUntestedBuild: true,
          }),
        },
      },
    } as never,
  });

  assert.ok(context.includes('=== SAVE COMPATIBILITY ==='));
  assert.match(context, /Level: untested · layout 27\.1/);
  assert.match(context, /Import continues with the inherited layout/);
});

test('Data tab shows the compatibility panel without adding a seventh nav tab', () => {
  const source = readFileSync(
    new URL('../components/AutoSyncWorkspace.tsx', import.meta.url),
    'utf8'
  );
  assert.match(source, /resolveSaveCompatibility\(hydratedFmSave\?\.decodedPayload\?\.meta\)/);
  assert.match(source, /<SaveCompatibilityPanel compatibility=\{saveCompatibility\} \/>/);
  assert.ok(source.includes('Data Quality'));
  assert.doesNotMatch(source, /id: 'compatibility' as const, label:/);
});

test('formatSaveCompatibilityForAnalyst states level, fields and behavior', () => {
  const text = formatSaveCompatibilityForAnalyst(
    resolveSaveCompatibility({
      build: '27.1.0+2505117',
      game: 'FM27',
      fmsaveVersion: '0.14.4',
      patchCompatibility: compat('27.1.0+2505117', { layoutBase: '27.1' }),
    })
  );
  assert.match(text, /Save compatibility: FM27 27\.1\.x/);
  assert.match(text, /Level: verified · layout 27\.1/);
  assert.match(text, /Fields changed: .*Staff Preferred Jobs/);
  assert.match(text, /Behavior: Verified\./);
});
