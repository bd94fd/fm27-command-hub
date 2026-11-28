#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Builds release notes from the commits since the previous v* tag.
 *
 *   npm run release:notes
 *   npm run release:notes -- --version=v1.2.3 --output=RELEASE_NOTES.md
 *
 * The note builder is pure and tested in `src/utils/releaseNotes.ts`. This
 * script only reads git and the package version.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildReleaseNotes } from '../src/utils/releaseNotes.ts';

const argv = process.argv.slice(2);

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function readPackageVersion() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
}

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function previousTag(to) {
  try {
    return runGit(['describe', '--tags', '--abbrev=0', '--match', 'v*', `${to}^`]);
  } catch {
    return null;
  }
}

function normalizeRepoUrl(raw) {
  const trimmed = raw.trim().replace(/\.git$/, '');
  const ssh = /^git@([^:]+):(.+)$/.exec(trimmed);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  if (trimmed.startsWith('https://')) return trimmed;
  return null;
}

function originUrl() {
  try {
    return normalizeRepoUrl(runGit(['remote', 'get-url', 'origin']));
  } catch {
    return null;
  }
}

function readCommits(range) {
  const format = '%H%x1f%s%x1f%an';
  const args = ['log', '--no-merges', `--format=${format}`];
  if (range) args.push(range);
  const output = execFileSync('git', args, { encoding: 'utf8' }).trim();
  if (!output) return [];
  return output.split('\n').map((line) => {
    const [hash, subject, author] = line.split('\x1f');
    return { hash, subject, author };
  });
}

const version =
  argValue('version') ||
  (process.env.GITHUB_REF_NAME?.startsWith('v') ? process.env.GITHUB_REF_NAME : null) ||
  `v${readPackageVersion()}`;
const to = argValue('to') || 'HEAD';
const explicitFrom = argValue('from');
const from = explicitFrom === null ? previousTag(to) : explicitFrom || null;
const range = from ? `${from}..${to}` : to;
const date = argValue('date') || new Date().toISOString().slice(0, 10);
const output = argValue('output') || 'RELEASE_NOTES.md';
const repoUrl = argValue('repo-url') || originUrl();

const notes = buildReleaseNotes({
  version,
  date,
  previousTag: from,
  repoUrl,
  commits: readCommits(range),
});

writeFileSync(output, notes.markdown);
console.log(`Wrote ${output}: ${notes.totalCommits} commits, ${notes.sections.length} sections.`);
