import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSaveLoadStageProfile,
  summarizeDecodeSteps,
} from './decodeStageProfile';
import type { SaveLoadBenchmarkRecord } from './saveLoadBenchmark';

const record: SaveLoadBenchmarkRecord = {
  id: 'save-load-1',
  fileName: 'slow.fm',
  fileSizeBytes: 250 * 1024 * 1024,
  mode: 'full',
  cacheHit: false,
  startedAtIso: '2026-11-26T10:00:00.000Z',
  startedAtMs: 0,
  completedAtIso: '2026-11-26T10:01:00.000Z',
  marksMs: {
    upload_start: 0,
    upload_complete: 2500,
    decode_start: 2500,
    first_useful_screen: 15000,
    transfer_start: 50000,
    transfer_complete: 50010,
    decode_complete: 50010,
    hydrate_start: 50010,
    hydrate_complete: 50024,
    state_applied: 50031,
    full_tab_ready: 50180,
  },
  detailMs: {
    jobToSpawnMs: 30,
    spawnToFirstByteMs: 80,
    jobToChildCloseMs: 25000,
    childRunMs: 24920,
    jsonValidateMs: 40,
  },
};

const stepTimingsMs = {
  totalDecodeMs: 25000,
  step_1_open: 3840,
  step_2_players: 4890,
  step_5_fixtures: 4780,
  step_5_2_league_table: 7410,
  step_3_2_staff: 990,
};

test('decode steps are sorted and carry a share of measured decoder time', () => {
  const steps = summarizeDecodeSteps(stepTimingsMs);
  assert.deepEqual(
    steps.map((step) => step.key),
    [
      'step_5_2_league_table',
      'step_2_players',
      'step_5_fixtures',
      'step_1_open',
      'step_3_2_staff',
    ]
  );
  assert.equal(steps[0].label, 'League table');
  assert.equal(steps[0].sharePct, 33.8);
  assert.equal(
    steps.reduce((sum, step) => sum + step.ms, 0),
    21910
  );
});

test('stage profile separates upload, decode, transfer, hydrate and render', () => {
  const profile = buildSaveLoadStageProfile(record, stepTimingsMs);
  assert.equal(profile.fileSizeMb, 250);
  assert.equal(profile.cacheHit, false);
  assert.equal(profile.uploadMs, 2500);
  assert.equal(profile.decodeMs, 47510);
  assert.equal(profile.firstUsefulMs, 15000);
  assert.equal(profile.transferMs, 10);
  assert.equal(profile.hydrateMs, 14);
  assert.equal(profile.renderMs, 156);
  assert.equal(profile.decoderMeasuredMs, 25000);
  assert.equal(profile.unattributedDecodeMs, 22510);
  assert.deepEqual(profile.serverDetailMs, record.detailMs);
});

test('stage profile falls back to summed steps and handles missing marks', () => {
  const sparse: SaveLoadBenchmarkRecord = {
    ...record,
    marksMs: { upload_start: 0, decode_start: 0, decode_complete: 1000 },
  };
  const profile = buildSaveLoadStageProfile(sparse, {
    step_1_open: 400,
    step_2_players: 200,
  });
  assert.equal(profile.decoderMeasuredMs, 600);
  assert.equal(profile.unattributedDecodeMs, 400);
  assert.equal(profile.transferMs, 0);
  assert.equal(profile.hydrateMs, 0);
  assert.equal(profile.renderMs, 0);
});
