import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSaveFileFingerprint } from './saveFileFingerprint';

test('save file fingerprint is stable for identical bytes and changes with content', async () => {
  const first = new Blob([new Uint8Array(4 * 1024 * 1024 + 123).fill(7)]);
  const second = new Blob([new Uint8Array(4 * 1024 * 1024 + 123).fill(7)]);
  const changed = new Blob([new Uint8Array(4 * 1024 * 1024 + 123).fill(7)]);
  const changedBytes = new Uint8Array(await changed.arrayBuffer());
  changedBytes[changedBytes.length - 1] = 8;
  const changedBlob = new Blob([changedBytes]);

  const firstFingerprint = await computeSaveFileFingerprint(first);
  const secondFingerprint = await computeSaveFileFingerprint(second);
  const changedFingerprint = await computeSaveFileFingerprint(changedBlob);

  assert.ok(firstFingerprint);
  assert.match(firstFingerprint ?? '', /^r15:\d+:[a-f0-9]{64}$/);
  assert.equal(firstFingerprint, secondFingerprint);
  assert.notEqual(firstFingerprint, changedFingerprint);
});

test('save file fingerprint includes size and skips empty files', async () => {
  const small = new Blob([new Uint8Array([1, 2, 3])]);
  const smallFingerprint = await computeSaveFileFingerprint(small);
  assert.ok(smallFingerprint?.startsWith('r15:3:'));
  assert.equal(await computeSaveFileFingerprint(new Blob([])), null);
});
