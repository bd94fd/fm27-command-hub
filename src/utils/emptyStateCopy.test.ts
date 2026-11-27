import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NAV_TABS } from './navigationUrl';
import {
  EMPTY_STATE_ACTION,
  EMPTY_STATE_ACTION_HINT,
  EMPTY_STATES,
  type EmptyStateId,
} from './emptyStateCopy';

const readSrc = (relPath: string) =>
  fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');

const entries = Object.entries(EMPTY_STATES) as [EmptyStateId, { title: string; detail: string }][];

test('every tab that can be empty has copy, and each one is short enough to read', () => {
  assert.equal(entries.length, 7);
  for (const [id, copy] of entries) {
    assert.ok(copy.title.length > 0 && copy.title.length <= 45, id);
    assert.ok(copy.detail.length > 40 && copy.detail.length <= 190, `${id} ${copy.detail.length}`);
    assert.match(copy.title, /^No /, `${id} should say what is missing`);
  }
});

test('each empty state says what will appear, and that nothing is invented', () => {
  for (const [id, copy] of entries) {
    assert.match(copy.detail, /Import your save/, id);
  }
  const all = entries.map(([, copy]) => copy.detail).join(' ');
  assert.match(all, /Nothing is invented/);
});

test('the empty states speak the same language as the first-run screen', () => {
  const all = [...entries.flatMap(([, copy]) => [copy.title, copy.detail]), EMPTY_STATE_ACTION, EMPTY_STATE_ACTION_HINT].join(' ');
  for (const jargon of ['IP/OOP', 'Club DNA', 'Playbook v2.0', 'Periodisation', 'matrix', 'JR + Hdr', 'Inswinging', 'Rest-Defense']) {
    assert.ok(!new RegExp(jargon.replace(/[/+-]/g, '\\$&'), 'i').test(all), jargon);
  }
  assert.doesNotMatch(all, /`/);
  assert.doesNotMatch(all, /<strong>/);
});

test('the empty state offers one honest action that leads to the import screen', () => {
  assert.match(EMPTY_STATE_ACTION, /Hub/);
  assert.match(EMPTY_STATE_ACTION_HINT, /Import \.fm Save File/);
});

test('every tab renders the shared panel instead of its own wording', () => {
  const components: [string, RegExp][] = [
    ['src/components/SquadAnalyticsTable.tsx', /EMPTY_STATES\.squad/],
    ['src/components/TacticalWarRoom.tsx', /EMPTY_STATES\.tactics/],
    ['src/components/SetPiecesAndTraining.tsx', /EMPTY_STATES\.setpieces/],
    ['src/components/RecruitmentWorkspace.tsx', /EMPTY_STATES\.recruitment/],
    ['src/components/MatchLogArchive.tsx', /EMPTY_STATES\.matches/],
    ['src/components/MatchPrepCard.tsx', /EMPTY_STATES\.matchPrep/],
    ['src/components/StaffDirectory.tsx', /EMPTY_STATES\.staff/],
  ];
  for (const [file, pattern] of components) {
    const src = readSrc(file);
    assert.match(src, pattern, file);
    assert.match(src, /EmptyStatePanel/, file);
    assert.match(src, /onRequestImport/, file);
    assert.doesNotMatch(src, /Awaiting \.fm Save —/, `${file} still has an old empty-state heading`);
  }
});

test('the tabs reach the Hub through the shared navigation, not a hardcoded link', () => {
  const app = readSrc('src/components/shell/AppMainContent.tsx');
  const hubPasses = app.match(/onRequestImport=\{\(\) => onSelectTab\('sync'\)\}/g) ?? [];
  assert.equal(hubPasses.length, 5, 'squad, tactics, recruitment, staff, matches');
  const tactics = readSrc('src/components/TacticalWarRoom.tsx');
  assert.match(tactics, /onRequestImport=\{onRequestImport\}/);
  const navTabs = NAV_TABS.join(' ');
  assert.match(navTabs, /sync/);
});
