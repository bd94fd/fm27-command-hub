import assert from 'node:assert/strict';
import test from 'node:test';
import { parseShareToken, stripShareParam } from './useShareSummary.ts';

test('parseShareToken keeps a trimmed token and ignores an empty one', () => {
  assert.equal(parseShareToken(''), null);
  assert.equal(parseShareToken('?tab=squad'), null);
  assert.equal(parseShareToken('?share='), null);
  assert.equal(parseShareToken('?share=%20%20'), null);
  assert.equal(parseShareToken('?share=abc123'), 'abc123');
  assert.equal(parseShareToken('?share=%20abc123%20'), 'abc123');
});

test('stripShareParam returns the owner view of the same page', () => {
  assert.equal(stripShareParam('https://hub.test/?share=abc&tab=squad'), '/?tab=squad');
  assert.equal(stripShareParam('https://hub.test/tactics?share=abc#pitch'), '/tactics#pitch');
  assert.equal(stripShareParam('https://hub.test/'), '/');
});
