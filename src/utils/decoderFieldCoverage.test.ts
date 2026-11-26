import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DECODER_FIELD_EXPECTATIONS,
  auditDecoderFieldCoverage,
  formatDecoderCoverageMarkdown,
  mergeDecoderFieldCoverage,
  summarizeDecoderFieldCoverage,
} from './decoderFieldCoverage.ts';
import type {
  DecoderFieldCoverageRow,
  DecoderFieldExpectation,
} from './decoderFieldCoverage.ts';

function rowFor(rows: DecoderFieldCoverageRow[], path: string) {
  const row = rows.find((item) => item.path === path);
  assert.ok(row, `missing audit row for ${path}`);
  return row;
}

test('decoder field coverage reads nested arrays and reports partial coverage', () => {
  const payload = {
    players: [
      { uid: 1, attributes: { pace: 12, passing: 14 } },
      { uid: 2, attributes: { pace: 10 } },
      { uid: 3, attributes: { passing: 11 } },
    ],
  };
  const expectations: DecoderFieldExpectation[] = [
    {
      group: 'Squad',
      path: 'players[].uid',
      label: 'UID',
      required: true,
      origin: 'decoder',
    },
    {
      group: 'Squad',
      path: 'players[].attributes.pace',
      label: 'Pace',
      required: true,
      origin: 'decoder',
    },
    {
      group: 'Squad',
      path: 'players[].attributes.passing',
      label: 'Passing',
      required: true,
      origin: 'decoder',
    },
    {
      group: 'Squad',
      path: 'players[].attributes.tackling',
      label: 'Tackling',
      required: true,
      origin: 'decoder',
    },
  ];

  const rows = auditDecoderFieldCoverage(payload, expectations);

  assert.equal(rowFor(rows, 'players[].uid').status, 'supplied');
  assert.equal(rowFor(rows, 'players[].uid').present, 3);
  assert.equal(rowFor(rows, 'players[].attributes.pace').status, 'partial');
  assert.equal(rowFor(rows, 'players[].attributes.pace').present, 2);
  assert.equal(rowFor(rows, 'players[].attributes.passing').status, 'partial');
  assert.equal(rowFor(rows, 'players[].attributes.tackling').status, 'missing');
});

test('decoder field coverage treats null, empty strings, and empty arrays as gaps', () => {
  const payload = {
    meta: { game: 'FM27', saveName: '' },
    warnings: [],
    leagueStanding: null,
  };
  const expectations: DecoderFieldExpectation[] = [
    { group: 'Meta', path: 'meta.game', label: 'Game', required: true, origin: 'decoder' },
    { group: 'Meta', path: 'meta.saveName', label: 'Save', required: true, origin: 'decoder' },
    { group: 'Meta', path: 'warnings', label: 'Warnings', required: false, origin: 'decoder-optional' },
    { group: 'Meta', path: 'leagueStanding', label: 'League', required: false, origin: 'decoder-optional' },
  ];

  const rows = auditDecoderFieldCoverage(payload, expectations);
  assert.equal(rowFor(rows, 'meta.game').status, 'supplied');
  assert.equal(rowFor(rows, 'meta.saveName').status, 'empty');
  assert.equal(rowFor(rows, 'warnings').status, 'empty');
  assert.equal(rowFor(rows, 'leagueStanding').status, 'missing');
});

test('decoder field coverage merges saves without losing partial data', () => {
  const first = auditDecoderFieldCoverage(
    { players: [{ uid: 1, rating: 7.2 }] },
    [{ group: 'Squad', path: 'players[].rating', label: 'Rating', required: false, origin: 'decoder-optional' }]
  );
  const second = auditDecoderFieldCoverage(
    { players: [{ uid: 2, rating: null }] },
    [{ group: 'Squad', path: 'players[].rating', label: 'Rating', required: false, origin: 'decoder-optional' }]
  );
  const merged = mergeDecoderFieldCoverage([
    { label: 'first', rows: first },
    { label: 'second', rows: second },
  ]);
  assert.equal(merged[0].present, 1);
  assert.equal(merged[0].values, 2);
  assert.equal(merged[0].status, 'partial');
  assert.match(merged[0].saves, /first, second/);
});

test('decoder field coverage markdown names every expectation and status', () => {
  const payload = {
    meta: { game: 'FM27', build: '27.1.0' },
    players: [{ uid: 1 }],
    staff: [{ uid: 2, name: 'Coach' }],
  };
  const rows = auditDecoderFieldCoverage(payload);
  const markdown = formatDecoderCoverageMarkdown(rows, {
    date: '2026-11-26',
    saves: 1,
    source: 'synthetic',
  });
  assert.match(markdown, /# Decoder field coverage audit/);
  assert.match(markdown, /`players\[\]\.uid`/);
  assert.match(markdown, /`staff\[\]\.jobRatings`/);
  assert.match(markdown, /Supplied \|/);
  const summary = summarizeDecoderFieldCoverage(rows);
  assert.equal(summary.rows, DECODER_FIELD_EXPECTATIONS.length);
  assert.equal(
    summary.supplied +
      summary.partial +
      summary.missing +
      summary.empty +
      summary.derived +
      summary.guessed +
      summary.unused +
      summary.stale,
    summary.rows
  );
});

test('decoder field coverage manifest stays unique and covers every UI-critical group', () => {
  const paths = DECODER_FIELD_EXPECTATIONS.map((row) => row.path);
  assert.equal(new Set(paths).size, paths.length);
  const groups = new Set(DECODER_FIELD_EXPECTATIONS.map((row) => row.group));
  for (const group of [
    'Save meta',
    'Squad profile',
    'Squad contract',
    'Squad stats',
    'Staff',
    'Staff attributes',
    'Matches',
    'League',
    'Finances',
    'Tactics',
    'Recruitment',
    'Governance',
    'Diagnostics',
  ]) {
    assert.ok(groups.has(group), `missing group ${group}`);
  }
});

test('decoder field coverage document lists every manifest path and the roadmap item', () => {
  const doc = readFileSync(new URL('../../docs/decoder-field-coverage.md', import.meta.url), 'utf8');
  assert.match(doc, /Roadmap: R07/);
  for (const expectation of DECODER_FIELD_EXPECTATIONS) {
    assert.ok(doc.includes(`\`${expectation.path}\``), `document is missing ${expectation.path}`);
  }
});
