#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Compares two snapshots written by `npm run parity:snapshot`, and prints the
 * first places they differ with a path you can trace back to the tree.
 *
 *   npm run parity:compare -- /tmp/before.json /tmp/after.json
 *
 * Exits non-zero on any difference, so a refactor cannot pass by ignoring one.
 */

import { readFileSync } from 'node:fs';

const [beforePath, afterPath] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 20;

if (!beforePath || !afterPath) {
  console.log('Usage: npm run parity:compare -- before.json after.json [--limit=20]');
  process.exit(2);
}

const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));

const differences = [];

function describe(value) {
  if (value === undefined) return 'missing';
  const text = JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

function compare(path, left, right) {
  if (differences.length >= limit && limit > 0) return;

  if (left === right) return;

  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    differences.push(`${path}: ${describe(left)} -> ${describe(right)}`);
    return;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      differences.push(`${path}: ${describe(left)} -> ${describe(right)}`);
      return;
    }
    if (left.length !== right.length) {
      differences.push(`${path}: length ${left.length} -> ${right.length}`);
    }
    const count = Math.max(left.length, right.length);
    for (let i = 0; i < count; i += 1) compare(`${path}[${i}]`, left[i], right[i]);
    return;
  }

  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) compare(`${path}.${key}`, left[key], right[key]);
}

compare('$', before, after);

if (differences.length === 0) {
  console.log('identical: every captured section and overlay matches');
  process.exit(0);
}

console.log(`${differences.length}${limit > 0 ? '+' : ''} difference(s):`);
for (const difference of differences) console.log(`  ${difference}`);
process.exit(1);
