import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MISSING_VALUE,
  formatAge,
  formatContractExpiry,
  formatNation,
  formatShortContractExpiry,
  isPlaceholderValue,
} from './displayValue';

test('display values use one missing placeholder', () => {
  assert.equal(MISSING_VALUE, '--');
  assert.equal(formatNation('Belgium'), 'Belgium');
  assert.equal(formatNation('Unknown'), MISSING_VALUE);
  assert.equal(formatNation(undefined), MISSING_VALUE);
  assert.equal(formatAge(24.6), '25');
  assert.equal(formatAge(0), MISSING_VALUE);
  assert.equal(formatContractExpiry('30/06/2027'), '30/06/2027');
  assert.equal(formatContractExpiry('N/A'), MISSING_VALUE);
  assert.equal(formatShortContractExpiry('30/06/2027'), '06/27');
  assert.equal(isPlaceholderValue('–'), true);
  assert.equal(isPlaceholderValue('Zambia'), false);
});
