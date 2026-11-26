import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('fmsave pins agree across native, browser and CI paths', () => {
  const dockerfile = read('../../Dockerfile').match(/fmsave==(\d+\.\d+\.\d+)/)?.[1];
  const worker = read('../../public/fm-save-worker.js').match(
    /FMSAVE_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/
  )?.[1];
  const ci = read('../../.github/workflows/ci.yml').match(
    /fmsave==(\d+\.\d+\.\d+)/
  )?.[1];

  assert.ok(dockerfile, 'Dockerfile must pin fmsave');
  assert.equal(worker, dockerfile);
  assert.equal(ci, dockerfile);
});

test('upstream check script is wired into npm and CI', () => {
  const packageJson = JSON.parse(read('../../package.json')) as {
    scripts?: Record<string, string>;
  };
  assert.ok(packageJson.scripts?.['check:fmsave']?.includes('check-fmsave-upstream'));

  const ci = read('../../.github/workflows/ci.yml');
  assert.match(ci, /npm run check:fmsave/);
  assert.match(ci, /continue-on-error: true/);
});
