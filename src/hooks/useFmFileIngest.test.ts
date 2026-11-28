import assert from 'node:assert/strict';
import test from 'node:test';
import { useFmFileIngest } from './useFmFileIngest.ts';
import type { FmFileIngestOptions } from './useFmFileIngest.ts';

/**
 * The intake reacts to what the user drops before it decodes anything, so the
 * guard rails can be checked without a real save.
 */
function makeOptions(
  captured: { errors: Array<string | null>; offline: Array<File | null> },
  overrides: Partial<FmFileIngestOptions> = {}
): FmFileIngestOptions {
  return {
    cancelDecodeRef: { current: null },
    decodeTarget: 'server',
    dispatchToAnalyst: async () => {},
    fastSync: false,
    importScope: 'club_and_division',
    isDeviceOnline: true,
    messageInput: '',
    setAttachedFmFiles: () => {},
    setCacheHitNotice: () => {},
    setChatError: (value) => {
      captured.errors.push(typeof value === 'function' ? null : value);
    },
    setChatFallbackNotice: () => {},
    setClubCoreReadyDuringDecode: () => {},
    setExtractionWarnings: () => {},
    setFmDecodeStage: () => {},
    setLastStepTimingsMs: () => {},
    setOfflineServerRouteFile: (value) => {
      captured.offline.push(typeof value === 'function' ? null : value);
    },
    setUploadedImages: () => {},
    uploadControlRef: { current: null },
    ...overrides,
  };
}

function makeFile(name: string, type = 'application/octet-stream'): File {
  return new File(['not-a-real-file'], name, { type });
}

test('a save chosen for the server while offline is kept, not uploaded, and said out loud', async () => {
  const captured = { errors: [] as Array<string | null>, offline: [] as Array<File | null> };
  const ingest = useFmFileIngest(makeOptions(captured, { isDeviceOnline: false }));
  const save = makeFile('auto_save_v03_.fm');

  await ingest([save]);

  const message = captured.errors.filter((entry) => entry !== null).at(-1);
  assert.match(message ?? '', /You're offline/);
  assert.match(message ?? '', /auto_save_v03_\.fm/);
  assert.equal(captured.offline.at(-1), save);
});

test('a file the app cannot read is named in the message instead of being ignored', async () => {
  const captured = { errors: [] as Array<string | null>, offline: [] as Array<File | null> };
  const ingest = useFmFileIngest(makeOptions(captured));

  await ingest([makeFile('notes.pdf', 'application/pdf')]);

  assert.equal(
    captured.errors.filter((entry) => entry !== null).at(-1),
    'Unsupported file "notes.pdf". Drop a .fm save file or screenshot image.'
  );
  assert.equal(captured.offline.at(-1), null);
});

test('an empty drop changes nothing', async () => {
  const captured = { errors: [] as Array<string | null>, offline: [] as Array<File | null> };
  const ingest = useFmFileIngest(makeOptions(captured));

  await ingest([]);

  assert.deepEqual(captured.errors, []);
  assert.deepEqual(captured.offline, []);
});
