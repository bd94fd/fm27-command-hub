import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('App shell imports display and summary helpers without the heavy squad engines', () => {
  assert.match(appSource, /from '\.\/utils\/displayValue'/);
  assert.match(appSource, /from '\.\/utils\/competitiveSummary'/);
  assert.doesNotMatch(appSource, /from '\.\/utils\/squadViewHelpers'/);
  assert.doesNotMatch(appSource, /from '\.\/utils\/fmSyncEngine'/);
});
