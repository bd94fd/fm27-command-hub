import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldActivateRowFromKey } from './keyboardRowActivation.ts';

const row = { tag: 'row' } as unknown as EventTarget;
const toggle = { tag: 'toggle' } as unknown as EventTarget;

const base = { target: row, currentTarget: row } as const;

test('Enter and Space open a row', () => {
  assert.equal(shouldActivateRowFromKey({ ...base, key: 'Enter' }), true);
  assert.equal(shouldActivateRowFromKey({ ...base, key: ' ' }), true);
});

test('other keys leave the row alone', () => {
  for (const key of ['Tab', 'a', 'ArrowDown', 'Escape']) {
    assert.equal(shouldActivateRowFromKey({ ...base, key }), false, key);
  }
});

test('a nested control keeps its own keys', () => {
  assert.equal(
    shouldActivateRowFromKey({ key: 'Enter', target: toggle, currentTarget: row }),
    false
  );
  assert.equal(
    shouldActivateRowFromKey({ key: ' ', target: toggle, currentTarget: row }),
    false
  );
});

test('a modified Enter is not a row activation', () => {
  assert.equal(shouldActivateRowFromKey({ ...base, key: 'Enter', shiftKey: true }), false);
  assert.equal(shouldActivateRowFromKey({ ...base, key: 'Enter', ctrlKey: true }), false);
  assert.equal(shouldActivateRowFromKey({ ...base, key: 'Enter', metaKey: true }), false);
  assert.equal(shouldActivateRowFromKey({ ...base, key: ' ', altKey: true }), false);
});

test('a held key does not open the row repeatedly', () => {
  assert.equal(shouldActivateRowFromKey({ ...base, key: 'Enter', repeat: true }), false);
});

test('a row without an opener is not activated by a bubble from elsewhere', () => {
  assert.equal(
    shouldActivateRowFromKey({ key: 'Enter', target: null, currentTarget: row }),
    false
  );
});
