import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSaveLoadBenchmarks,
  finishSaveLoadBenchmark,
  getSaveLoadBenchmark,
  getSaveLoadBenchmarks,
  markSaveLoadStage,
  startSaveLoadBenchmark,
} from './saveLoadBenchmark';

describe('saveLoadBenchmark', () => {
  it('records ordered stage boundaries from upload to full tab ready', () => {
    clearSaveLoadBenchmarks();
    const id = startSaveLoadBenchmark({
      fileName: 'auto_save.fm',
      fileSizeBytes: 264.5 * 1024 * 1024,
      mode: 'full',
    });

    markSaveLoadStage(id, 'upload_complete');
    markSaveLoadStage(id, 'decode_start');
    markSaveLoadStage(id, 'decode_complete');
    markSaveLoadStage(id, 'hydrate_start');
    markSaveLoadStage(id, 'hydrate_complete');
    markSaveLoadStage(id, 'state_applied');
    markSaveLoadStage(id, 'first_useful_screen');
    finishSaveLoadBenchmark(id);

    const record = getSaveLoadBenchmark(id);
    assert.ok(record);
    assert.equal(record.fileName, 'auto_save.fm');
    assert.equal(record.mode, 'full');
    assert.equal(record.marksMs.upload_start, 0);
    assert.ok(typeof record.marksMs.full_tab_ready === 'number');
    assert.ok(record.completedAtIso);

    const orderedStages = [
      'upload_start',
      'upload_complete',
      'decode_start',
      'decode_complete',
      'hydrate_start',
      'hydrate_complete',
      'state_applied',
      'first_useful_screen',
      'full_tab_ready',
    ] as const;
    for (let index = 1; index < orderedStages.length; index += 1) {
      assert.ok(
        record.marksMs[orderedStages[index]]! >=
          record.marksMs[orderedStages[index - 1]]!,
        `${orderedStages[index]} must not precede ${orderedStages[index - 1]}`
      );
    }
  });

  it('keeps the first timestamp when a stage is marked twice', () => {
    clearSaveLoadBenchmarks();
    const id = startSaveLoadBenchmark({
      fileName: 'auto_save.fm',
      fileSizeBytes: 1,
      mode: 'fast',
    });

    markSaveLoadStage(id, 'upload_complete');
    const first = getSaveLoadBenchmark(id)?.marksMs.upload_complete;
    markSaveLoadStage(id, 'upload_complete');
    const second = getSaveLoadBenchmark(id)?.marksMs.upload_complete;

    assert.equal(second, first);
  });

  it('can overwrite repeating probe stages such as the final transfer', () => {
    clearSaveLoadBenchmarks();
    const id = startSaveLoadBenchmark({
      fileName: 'auto_save.fm',
      fileSizeBytes: 1,
      mode: 'full',
    });

    markSaveLoadStage(id, 'transfer_complete', { overwrite: true });
    const first = getSaveLoadBenchmark(id)?.marksMs.transfer_complete;
    markSaveLoadStage(id, 'transfer_complete', { overwrite: true });
    const second = getSaveLoadBenchmark(id)?.marksMs.transfer_complete;

    assert.ok(typeof first === 'number');
    assert.ok(typeof second === 'number');
    assert.ok(second >= first);
  });

  it('returns copies so callers cannot mutate the registry', () => {
    clearSaveLoadBenchmarks();
    const id = startSaveLoadBenchmark({
      fileName: 'auto_save.fm',
      fileSizeBytes: 1,
      mode: 'full',
    });
    const record = getSaveLoadBenchmark(id);
    assert.ok(record);
    record.marksMs.upload_complete = 999_999;

    assert.equal(getSaveLoadBenchmark(id)?.marksMs.upload_complete, undefined);
  });

  it('lists all records and clears them for the next run', () => {
    clearSaveLoadBenchmarks();
    const first = startSaveLoadBenchmark({
      fileName: 'a.fm',
      fileSizeBytes: 1,
      mode: 'full',
    });
    const second = startSaveLoadBenchmark({
      fileName: 'b.fm',
      fileSizeBytes: 2,
      mode: 'fast',
    });

    assert.equal(getSaveLoadBenchmarks().length, 2);
    clearSaveLoadBenchmarks();
    assert.equal(getSaveLoadBenchmarks().length, 0);
    assert.equal(getSaveLoadBenchmark(first), null);
    assert.equal(getSaveLoadBenchmark(second), null);
  });
});
