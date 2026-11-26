#!/usr/bin/env node
/**
 * Reports whether the Hub's pinned fmsave decoder is behind PyPI.
 *
 * The check is read-only. It reads the pins from Dockerfile, public/fm-save-worker.js
 * and the CI workflow, then compares them with the latest PyPI release.
 *
 * Usage:
 *   npm run check:fmsave
 *   node scripts/check-fmsave-upstream.mjs --strict
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');

function versionTuple(version) {
  return version
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(a, b) {
  const left = versionTuple(a);
  const right = versionTuple(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

async function readPins() {
  const files = {
    Dockerfile: /fmsave==(\d+\.\d+\.\d+)/,
    'public/fm-save-worker.js': /FMSAVE_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/,
    '.github/workflows/ci.yml': /fmsave==(\d+\.\d+\.\d+)/,
  };
  const pins = [];
  for (const [relativePath, pattern] of Object.entries(files)) {
    const source = await fs.readFile(path.join(repoRoot, relativePath), 'utf8');
    const match = source.match(pattern);
    if (match) pins.push({ relativePath, version: match[1] });
  }
  return pins;
}

async function latestFmsaveVersion() {
  const response = await fetch('https://pypi.org/pypi/fmsave/json', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`PyPI returned HTTP ${response.status}`);
  const data = await response.json();
  const version = data?.info?.version;
  if (typeof version !== 'string') throw new Error('PyPI response has no version');
  return version;
}

const pins = await readPins();
if (pins.length === 0) {
  console.error('No fmsave pins found.');
  process.exit(2);
}

const uniquePinned = [...new Set(pins.map((pin) => pin.version))];
console.log(`Pinned fmsave: ${uniquePinned.join(', ')}`);
for (const pin of pins) console.log(`  ${pin.relativePath}: ${pin.version}`);

let latest;
try {
  latest = await latestFmsaveVersion();
} catch (error) {
  console.warn(`Could not check PyPI: ${error.message}`);
  process.exit(strict ? 1 : 0);
}

console.log(`Latest fmsave on PyPI: ${latest}`);
const behind = uniquePinned.some((version) => compareVersions(version, latest) < 0);
if (!behind) {
  console.log('Up to date.');
  process.exit(0);
}

console.warn('A newer fmsave release is available. Review the release notes before bumping.');
if (strict) process.exit(1);
