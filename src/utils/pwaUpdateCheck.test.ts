import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FOREGROUND_UPDATE_CHECK_INTERVAL_MS,
  isUpdateCheckDue,
  resolveForegroundUpdateIntervalMs,
} from './pwaUpdateCheck';

test('a check is not due right after the last one', () => {
  assert.equal(isUpdateCheckDue(1_000, 1_000), false);
  assert.equal(isUpdateCheckDue(1_000, 1_000 + 60_000), false);
});

test('a check is due once the interval has passed', () => {
  const interval = FOREGROUND_UPDATE_CHECK_INTERVAL_MS;
  assert.equal(isUpdateCheckDue(1_000, 1_000 + interval), true);
  assert.equal(isUpdateCheckDue(1_000, 1_000 + interval + 1), true);
});

test('the first foreground visit always checks', () => {
  assert.equal(isUpdateCheckDue(Number.POSITIVE_INFINITY, Date.now()), true);
  assert.equal(isUpdateCheckDue(Number.NaN, Date.now()), true);
});

test('a clock that jumps backwards does not suppress the check', () => {
  assert.equal(isUpdateCheckDue(10_000_000, 5_000), true);
});

test('the interval override only accepts a usable number', () => {
  assert.equal(resolveForegroundUpdateIntervalMs(0), 0);
  assert.equal(resolveForegroundUpdateIntervalMs(5_000), 5_000);
  assert.equal(
    resolveForegroundUpdateIntervalMs(undefined),
    FOREGROUND_UPDATE_CHECK_INTERVAL_MS
  );
  assert.equal(
    resolveForegroundUpdateIntervalMs(-1),
    FOREGROUND_UPDATE_CHECK_INTERVAL_MS
  );
  assert.equal(
    resolveForegroundUpdateIntervalMs(Number.NaN),
    FOREGROUND_UPDATE_CHECK_INTERVAL_MS
  );
  assert.equal(
    resolveForegroundUpdateIntervalMs('soon'),
    FOREGROUND_UPDATE_CHECK_INTERVAL_MS
  );
});
