import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NAV_TABS } from './navigationUrl';
import {
  DECODE_HELP,
  FAST_SYNC_HELP,
  FIRST_TASKS,
  ONBOARDING_INTRO,
  ONBOARDING_STEPS,
  SAVE_FILE_FALLBACK,
  SAVE_FILE_LOCATIONS,
} from './onboardingCopy';

const readSrc = (relPath: string) =>
  fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');

test('the first-run steps read in the order a new user needs them', () => {
  assert.deepEqual(
    ONBOARDING_STEPS.map((step) => step.id),
    ['find', 'import', 'wait']
  );
  for (const step of ONBOARDING_STEPS) {
    assert.ok(step.title.length > 0 && step.title.length <= 40, step.id);
    assert.ok(step.body.length > 0 && step.body.length <= 200, step.id);
  }
});

test('the save file locations name the folder a user has to open', () => {
  assert.deepEqual(
    SAVE_FILE_LOCATIONS.map((location) => location.platform),
    ['Windows', 'Mac']
  );
  for (const location of SAVE_FILE_LOCATIONS) {
    assert.match(location.path, /Football Manager 27/);
    assert.match(location.path, /games$/);
  }
  assert.match(SAVE_FILE_FALLBACK, /\.fm/);
});

test('the first-run copy explains the file, the privacy choice and the next tap', () => {
  const copy = [
    ONBOARDING_INTRO,
    ...ONBOARDING_STEPS.flatMap((step) => [step.title, step.body]),
    ...Object.values(DECODE_HELP),
    FAST_SYNC_HELP,
    ...FIRST_TASKS.flatMap((task) => [task.label, task.hint]),
  ].join(' ');
  assert.match(copy, /save/);
  assert.match(copy, /device|browser/);
  assert.match(copy, /nothing is uploaded|never uploaded/);
  assert.match(copy, /deleted afterwards/);
});

test('the first-run copy drops the shorthand that only existing users understood', () => {
  const copy = [
    ONBOARDING_INTRO,
    ...ONBOARDING_STEPS.flatMap((step) => [step.title, step.body]),
    ...Object.values(DECODE_HELP),
    FAST_SYNC_HELP,
    ...FIRST_TASKS.flatMap((task) => [task.label, task.hint]),
  ].join(' ');
  for (const jargon of [
    'IP/OOP',
    'Club DNA',
    'Playbook v2.0',
    'Render',
    'dual-phase',
    'utilise',
    'leverage',
    'facilitate',
    'in order to',
  ]) {
    assert.doesNotMatch(copy, new RegExp(jargon.replace(/[/.]/g, '\\$&'), 'i'), jargon);
  }
});

test('every first task points at a tab that exists', () => {
  const seen = new Set<string>();
  for (const task of FIRST_TASKS) {
    assert.ok((NAV_TABS as readonly string[]).includes(task.tab), task.tab);
    assert.ok(!seen.has(task.tab), `duplicate tab ${task.tab}`);
    seen.add(task.tab);
    assert.ok(task.label.length > 0 && task.label.length <= 40);
  }
  assert.deepEqual([...seen], ['squad', 'tactics', 'recruitment']);
});

test('the Hub renders the first-run copy instead of its own hardcoded pitch', () => {
  const hub = readSrc('src/components/AutoSyncWorkspace.tsx');
  const app = readSrc('src/components/shell/AppMainContent.tsx');

  assert.match(hub, /ONBOARDING_TITLE/);
  assert.match(hub, /ONBOARDING_STEPS\.map/);
  assert.match(hub, /SAVE_FILE_LOCATIONS\.map/);
  assert.match(hub, /FIRST_TASKS\.map/);
  assert.match(hub, /onNavigate\?\.\(task\.tab\)/);
  assert.match(hub, /<summary[\s\S]{0,200}Where is my save file\?/);
  assert.match(app, /onNavigate=\{onSelectTab\}/);
  assert.doesNotMatch(hub, /500-target Club DNA scouting/);
  assert.doesNotMatch(hub, /dual-phase IP\/OOP pitch/);
});
