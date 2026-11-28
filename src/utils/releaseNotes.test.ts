import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReleaseNotes, parseReleaseCommit } from './releaseNotes.ts';

test('parseReleaseCommit reads type, scope, breaking mark and PR number', () => {
  const parsed = parseReleaseCommit({
    hash: 'abcdef1234567890',
    subject: 'feat(squad): add wage column (#142)',
  });
  assert.equal(parsed.type, 'feat');
  assert.equal(parsed.scope, 'squad');
  assert.equal(parsed.breaking, false);
  assert.equal(parsed.summary, 'add wage column');
  assert.equal(parsed.prNumber, 142);
  assert.equal(parsed.shortHash, 'abcdef1');

  const breaking = parseReleaseCommit({
    hash: '1234567890abcdef',
    subject: 'refactor(api)!: drop the old route',
  });
  assert.equal(breaking.breaking, true);
  assert.equal(breaking.type, 'refactor');
  assert.equal(breaking.summary, 'drop the old route');

  const note = parseReleaseCommit({
    hash: 'fedcba9876543210',
    subject: 'chore: BREAKING CHANGE in the tooling',
  });
  assert.equal(note.breaking, true);
});

test('parseReleaseCommit keeps a non-conventional subject and leaves the type unset', () => {
  const parsed = parseReleaseCommit({
    hash: '0123456789abcdef',
    subject: 'Tidy the shortlist grid',
  });
  assert.equal(parsed.type, null);
  assert.equal(parsed.scope, null);
  assert.equal(parsed.breaking, false);
  assert.equal(parsed.summary, 'Tidy the shortlist grid');
  assert.equal(parsed.prNumber, null);
});

test('buildReleaseNotes groups commits into the agreed sections in order', () => {
  const notes = buildReleaseNotes({
    version: 'v2.0.0',
    date: '2026-11-28',
    previousTag: 'v1.9.0',
    commits: [
      { hash: 'a'.repeat(40), subject: 'feat: add a striker filter (#150)' },
      { hash: 'b'.repeat(40), subject: 'fix: stop the wage label wrapping (#151)' },
      { hash: 'c'.repeat(40), subject: 'perf: memoise the radar axes' },
      { hash: 'd'.repeat(40), subject: 'docs: explain the release gate' },
      { hash: 'e'.repeat(40), subject: 'refactor!: remove the legacy route' },
      { hash: 'f'.repeat(40), subject: 'Tidy the shortlist grid' },
    ],
  });

  assert.deepEqual(
    notes.sections.map((section) => section.key),
    ['breaking', 'added', 'fixed', 'changed', 'maintenance'],
  );
  assert.equal(notes.sections[0].items[0].summary, 'remove the legacy route');
  assert.equal(notes.sections[1].items[0].summary, 'add a striker filter');
  assert.equal(notes.sections[2].items[0].summary, 'stop the wage label wrapping');
  assert.deepEqual(
    notes.sections[3].items.map((item) => item.summary),
    ['memoise the radar axes', 'Tidy the shortlist grid'],
  );
  assert.equal(notes.sections[4].items[0].summary, 'explain the release gate');
  assert.equal(notes.totalCommits, 6);
});

test('buildReleaseNotes links the PR and commit when a repository URL is known', () => {
  const notes = buildReleaseNotes({
    version: 'v2.0.0',
    date: '2026-11-28',
    previousTag: 'v1.9.0',
    repoUrl: 'https://github.com/example/club/',
    commits: [{ hash: 'abcdef1234567890', subject: 'feat: add a striker filter (#150)' }],
  });

  assert.match(notes.markdown, /^# v2\.0\.0$/m);
  assert.match(notes.markdown, /Released 2026-11-28\./);
  assert.match(notes.markdown, /Changes since v1\.9\.0\./);
  assert.match(notes.markdown, /## Added/);
  assert.match(
    notes.markdown,
    /- add a striker filter \(\[#150\]\(https:\/\/github\.com\/example\/club\/pull\/150\), \[abcdef1\]\(https:\/\/github\.com\/example\/club\/commit\/abcdef1234567890\)\)/,
  );
});

test('buildReleaseNotes stays readable with no commits or no previous tag', () => {
  const empty = buildReleaseNotes({
    version: 'v0.1.0',
    date: '2026-11-28',
    commits: [],
  });
  assert.equal(empty.sections.length, 0);
  assert.match(empty.markdown, /Changes since the start of the recorded history\./);
  assert.match(empty.markdown, /No changes recorded\./);

  const noLinks = buildReleaseNotes({
    version: 'v0.1.1',
    date: '2026-11-28',
    commits: [{ hash: 'abcdef1234567890', subject: 'fix: keep the old bundle (#7)' }],
  });
  assert.match(noLinks.markdown, /- keep the old bundle \(#7, abcdef1\)/);
});
