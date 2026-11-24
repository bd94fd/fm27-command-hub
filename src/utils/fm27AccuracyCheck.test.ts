import assert from 'node:assert/strict';
import test from 'node:test';
import { checkFm27ResponseWarnings } from './fm27AccuracyCheck.ts';
import { formatStepTimingLabel, shouldDefaultFastSync } from './fmSaveUiHelpers.ts';

test('checkFm27ResponseWarnings flags retired FM24 roles, legacy duties, and raw CA/PA leaks', () => {
  const clean = checkFm27ResponseWarnings(
    'Use a Channel Midfielder IP paired with a Tracking Winger OOP and an Outlet Centre Forward.'
  );
  assert.equal(clean.passed, true);
  assert.deepEqual(clean.warnings, []);

  const bad = checkFm27ResponseWarnings(
    'Play him as a Mezzala (Attack) with CA 145 / PA 162.'
  );
  assert.equal(bad.passed, false);
  assert.ok(bad.warnings.some((w) => w.includes('Mezzala')));
  assert.ok(bad.warnings.some((w) => w.includes('legacy FM24 duty')));
  assert.ok(bad.warnings.some((w) => w.includes('raw numeric CA/PA')));
});

test('fmSaveUiHelpers defaults to Full Sync across mobile/desktop and formats step timing labels', () => {
  assert.equal(shouldDefaultFastSync(390), false);
  assert.equal(shouldDefaultFastSync(1440), false);
  assert.equal(formatStepTimingLabel('step_2_players'), 'Squad (52 Attrs)');
  assert.equal(formatStepTimingLabel('totalDecodeMs'), 'Total');
  assert.equal(formatStepTimingLabel('custom_step_name'), 'custom step name');
});
