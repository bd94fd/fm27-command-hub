#!/usr/bin/env node
// Fails the build when the service worker precaches nothing or almost nothing.
//
// This exists because a dependency override that looked harmless (minimatch
// forced past the version glob 11 expects) silently produced a service worker
// with an empty precache list: the app still built, still served, and lost
// offline support. See docs/dependency-security.md.
import { readFileSync } from 'node:fs';

const SW = 'dist/sw.js';
const MIN_ENTRIES = 20;

let source;
try {
  source = readFileSync(SW, 'utf8');
} catch {
  console.error(`FAIL: ${SW} not found. Run npm run build first.`);
  process.exit(1);
}

const urls = [...source.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
const problems = [];

if (urls.length === 0) problems.push('the precache list is empty, so the installed app would have no offline shell');
if (urls.length > 0 && urls.length < MIN_ENTRIES) {
  problems.push(`only ${urls.length} files are precached; expected at least ${MIN_ENTRIES}`);
}
if (!urls.includes('index.html')) problems.push('index.html is not precached, so the offline shell would 404');
if (!urls.some((u) => u.startsWith('assets/') && u.endsWith('.js'))) {
  problems.push('no JavaScript bundles are precached');
}

if (problems.length > 0) {
  console.error(`FAIL: service worker precache looks wrong (${urls.length} entries):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const bytes = Buffer.byteLength(source);
console.log(`ok: ${urls.length} files precached, sw.js is ${(bytes / 1024).toFixed(1)} KiB`);
