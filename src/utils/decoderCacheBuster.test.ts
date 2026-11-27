import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { WORKER_CACHE_BUSTER } from './fmSaveHydrator';

/**
 * The decoder lives outside the precache, so a phone can only be stopped from running an
 * old decoder by the `?v=` cache buster. Nothing in the build ties that buster to the
 * decoder files, so this guard does: if a decoder file changes and the buster does not,
 * the hashes below stop matching and this test fails.
 *
 * When it fails on purpose (a real decoder change), bump WORKER_CACHE_BUSTER here and
 * MAPPER_CACHE_BUSTER in public/fm-save-mapper.py, then paste the new hashes.
 */
const EXPECTED = {
  'public/fm-save-worker.js':
    '8573b0ca8555c1602b4734cbefdc474e74aa90becd92926c87757e8038714247',
  'public/fm-save-mapper.py':
    '7aa5e3ca08a5f3f93e99516a0e88e016a7278ec8b369f34d7c682149e86d46e3',
  'public/fm_layout_patcher.py':
    'f9b5c9adb74b18e982852132463489e7516da503780924808949a5223b7b1a34',
};

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function hashOf(relativePath: string): string {
  return createHash('sha256')
    .update(readFileSync(`${repoRoot}${relativePath}`))
    .digest('hex');
}

test('decoder files match the recorded hashes, so the cache buster is current', () => {
  for (const [file, expected] of Object.entries(EXPECTED)) {
    assert.equal(
      hashOf(file),
      expected,
      `${file} changed. Bump WORKER_CACHE_BUSTER and MAPPER_CACHE_BUSTER, then update the hash for ${file}.`
    );
  }
});

test('the worker and mapper cache busters agree', () => {
  const mapperSrc = readFileSync(`${repoRoot}public/fm-save-mapper.py`, 'utf8');
  const mapperMatch = mapperSrc.match(/MAPPER_CACHE_BUSTER\s*=\s*"(\?v=\d+)"/);
  assert.ok(mapperMatch, 'MAPPER_CACHE_BUSTER must be declared in public/fm-save-mapper.py');
  assert.equal(
    mapperMatch[1],
    WORKER_CACHE_BUSTER,
    'public/fm-save-mapper.py and WORKER_CACHE_BUSTER must use the same version'
  );
});
