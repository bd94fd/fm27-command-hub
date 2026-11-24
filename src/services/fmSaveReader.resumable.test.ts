import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createUploadController,
  decodeFmSaveViaServer,
  decodeFmSaveWithServerFirst,
  type FmSaveProgressStage,
} from './fmSaveReader.ts';
import type { DecodedFmSavePayload } from '../utils/fmSaveHydrator.ts';

function makeDecodedStub(clubName = 'KVV Zelzate'): DecodedFmSavePayload {
  return {
    meta: {
      clubName,
      gameDateDmy: '14/03/2027',
      filename: 'auto save.fm',
    },
    players: [],
    staff: [],
    playedMatches: [],
    upcomingFixtures: [],
    warnings: [],
  } as unknown as DecodedFmSavePayload;
}

function makeFakePayloadBlob(sizeBytes: number): Blob {
  const buf = new Uint8Array(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) buf[i] = i % 251;
  return new Blob([buf]);
}

test('Resumable upload: manual Pause -> Resume queries GET /upload/:id/status and skips already-received chunks', async () => {
  const ctrl = createUploadController();
  const blob = makeFakePayloadBlob(30); // 3 chunks of 10 bytes
  const receivedOffsets = new Set<number>();
  const uploadedOffsetsLog: number[] = [];
  let statusChecks = 0;
  let deleteCalls = 0;
  const stages: FmSaveProgressStage[] = [];

  const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || 'GET').toUpperCase();

    if (url.endsWith('/api/fm27/decode-save/init')) {
      return new Response(
        JSON.stringify({
          uploadId: '11111111-2222-4333-8444-555555555555',
          supportsParallelChunks: true,
          holdTtlMs: 900_000,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.endsWith('/api/fm27/decode-save/chunk')) {
      const headers = new Headers(init?.headers);
      const offset = Number(headers.get('x-fm-chunk-offset') || '0');
      uploadedOffsetsLog.push(offset);
      receivedOffsets.add(offset);

      // Pause right after the first chunk lands
      if (offset === 0) {
        ctrl.pause('manual');
        setTimeout(() => ctrl.resume(), 25);
      }
      return new Response(
        JSON.stringify({ ok: true, bytesReceived: receivedOffsets.size * 10 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/api/fm27/decode-save/upload/') && url.endsWith('/status')) {
      statusChecks += 1;
      return new Response(
        JSON.stringify({
          uploadId: '11111111-2222-4333-8444-555555555555',
          bytesReceived: receivedOffsets.size * 10,
          expectedTotalBytes: 30,
          supportsParallelChunks: true,
          receivedOffsets: Array.from(receivedOffsets).sort((a, b) => a - b),
          holdRemainingMs: 899_000,
          holdTtlMs: 900_000,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/api/fm27/decode-save/upload/') && method === 'DELETE') {
      deleteCalls += 1;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (url.endsWith('/api/fm27/decode-save/finish')) {
      return new Response(
        JSON.stringify({ jobId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/api/fm27/decode-save/job/')) {
      return new Response(
        JSON.stringify({ status: 'done', payload: makeDecodedStub() }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  const result = await decodeFmSaveViaServer(
    blob,
    {
      chunkSizeBytes: 10,
      uploadConcurrency: 1,
      pollIntervalMs: 10,
      uploadControl: ctrl,
      enableOfflineAutoPause: false,
    },
    (p) => stages.push(p),
    mockFetch
  );

  assert.equal(result.meta.clubName, 'KVV Zelzate');
  assert.equal(statusChecks, 1, 'should reconcile upload status once on resume');
  assert.equal(deleteCalls, 0, 'pausing must NOT delete the server upload');
  assert.deepEqual(
    uploadedOffsetsLog,
    [0, 10, 20],
    'offset 0 must NOT be re-uploaded after pause/resume'
  );
  assert.ok(
    stages.some((s) => s.paused === true && s.pauseReason === 'manual'),
    'should emit manual paused UI state'
  );
  assert.ok(
    stages.some((s) => s.progressPct === 100 && s.transport === 'server_upload'),
    'should emit 100% upload progress telemetry'
  );
});

test('Resumable upload: offline signal drop auto-pauses and auto-resumes on online event without losing uploaded chunks', async () => {
  const ctrl = createUploadController();
  const networkEvents = new EventTarget();
  let offline = false;
  const blob = makeFakePayloadBlob(20); // 2 chunks of 10 bytes
  const receivedOffsets = new Set<number>();
  let chunk1Failures = 0;
  let statusChecks = 0;
  const stages: FmSaveProgressStage[] = [];

  const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/fm27/decode-save/init')) {
      return new Response(
        JSON.stringify({
          uploadId: '22222222-2222-4333-8444-555555555555',
          supportsParallelChunks: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.endsWith('/api/fm27/decode-save/chunk')) {
      const headers = new Headers(init?.headers);
      const offset = Number(headers.get('x-fm-chunk-offset') || '0');
      if (offset === 10 && chunk1Failures === 0) {
        chunk1Failures += 1;
        offline = true;
        // Restore signal shortly after offline auto-pause kicks in
        setTimeout(() => {
          offline = false;
          networkEvents.dispatchEvent(new Event('online'));
        }, 30);
        throw new TypeError('Failed to fetch');
      }
      receivedOffsets.add(offset);
      return new Response(
        JSON.stringify({ ok: true, bytesReceived: receivedOffsets.size * 10 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/api/fm27/decode-save/upload/') && url.endsWith('/status')) {
      statusChecks += 1;
      return new Response(
        JSON.stringify({
          uploadId: '22222222-2222-4333-8444-555555555555',
          bytesReceived: receivedOffsets.size * 10,
          receivedOffsets: Array.from(receivedOffsets),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.endsWith('/api/fm27/decode-save/finish')) {
      return new Response(
        JSON.stringify({ jobId: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/api/fm27/decode-save/job/')) {
      return new Response(
        JSON.stringify({ status: 'done', payload: makeDecodedStub('Offline Recovered FC') }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  const result = await decodeFmSaveViaServer(
    blob,
    {
      chunkSizeBytes: 10,
      uploadConcurrency: 1,
      pollIntervalMs: 10,
      uploadControl: ctrl,
      enableOfflineAutoPause: true,
      isOffline: () => offline,
      networkEvents,
    },
    (p) => stages.push(p),
    mockFetch
  );

  assert.equal(result.meta.clubName, 'Offline Recovered FC');
  assert.equal(statusChecks, 1);
  assert.ok(
    stages.some((s) => s.paused === true && s.pauseReason === 'offline'),
    'should auto-pause with reason offline when signal drops'
  );
});

test('Resumable upload: if 15-minute server hold expired (404 on /status), restarts upload cleanly from 0%', async () => {
  const ctrl = createUploadController();
  const blob = makeFakePayloadBlob(20);
  let initCount = 0;
  let currentUploadId = '';
  const uploadedForSession = new Map<string, number[]>();

  const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/fm27/decode-save/init')) {
      initCount += 1;
      currentUploadId = `33333333-2222-4333-8444-55555555555${initCount}`;
      uploadedForSession.set(currentUploadId, []);
      return new Response(
        JSON.stringify({ uploadId: currentUploadId, supportsParallelChunks: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.endsWith('/api/fm27/decode-save/chunk')) {
      const headers = new Headers(init?.headers);
      const id = headers.get('x-fm-upload-id') || '';
      const offset = Number(headers.get('x-fm-chunk-offset') || '0');
      uploadedForSession.get(id)?.push(offset);
      if (initCount === 1 && offset === 0) {
        ctrl.pause('manual');
        setTimeout(() => ctrl.resume(), 20);
      }
      return new Response(JSON.stringify({ ok: true, bytesReceived: offset + 10 }), {
        status: 200,
      });
    }
    if (url.includes('/api/fm27/decode-save/upload/') && url.endsWith('/status')) {
      // Simulate 15-min hold expiry on server
      return new Response(JSON.stringify({ error: 'Upload session expired' }), {
        status: 404,
      });
    }
    if (url.endsWith('/api/fm27/decode-save/finish')) {
      return new Response(
        JSON.stringify({ jobId: 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee' }),
        { status: 200 }
      );
    }
    if (url.includes('/api/fm27/decode-save/job/')) {
      return new Response(
        JSON.stringify({ status: 'done', payload: makeDecodedStub('Fresh Session FC') }),
        { status: 200 }
      );
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  const result = await decodeFmSaveViaServer(
    blob,
    {
      chunkSizeBytes: 10,
      uploadConcurrency: 1,
      pollIntervalMs: 10,
      uploadControl: ctrl,
      enableOfflineAutoPause: false,
    },
    undefined,
    mockFetch
  );

  assert.equal(result.meta.clubName, 'Fresh Session FC');
  assert.equal(initCount, 2, 'should re-initialize upload session after 404 expiry');
  assert.deepEqual(
    uploadedForSession.get('33333333-2222-4333-8444-555555555552'),
    [0, 10],
    'second session must upload full file cleanly from offset 0'
  );
});

test('Manual "Decode on phone instead" aborts server upload, cleans up partial upload, and runs local browser fallback', async () => {
  const ctrl = createUploadController();
  const blob = makeFakePayloadBlob(30);
  let deleteCalled = false;
  let fallbackCalled = false;
  const stages: FmSaveProgressStage[] = [];

  const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || 'GET').toUpperCase();

    if (url.endsWith('/api/fm27/decode-status')) {
      return new Response(
        JSON.stringify({ serverDecodeAvailable: true }),
        { status: 200 }
      );
    }
    if (url.endsWith('/api/fm27/decode-save/init')) {
      return new Response(
        JSON.stringify({
          uploadId: '44444444-2222-4333-8444-555555555555',
          supportsParallelChunks: true,
        }),
        { status: 200 }
      );
    }
    if (url.endsWith('/api/fm27/decode-save/chunk')) {
      // Trigger manual switch to phone decoder mid-upload
      ctrl.requestLocalFallback();
      return new Response(JSON.stringify({ ok: true, bytesReceived: 10 }), {
        status: 200,
      });
    }
    if (url.includes('/api/fm27/decode-save/upload/') && method === 'DELETE') {
      deleteCalled = true;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  const result = await decodeFmSaveWithServerFirst(
    blob,
    (p) => stages.push(p),
    {
      chunkSizeBytes: 10,
      uploadConcurrency: 1,
      uploadControl: ctrl,
      enableOfflineAutoPause: false,
    },
    {
      fetchImpl: mockFetch,
      browserFallback: async () => {
        fallbackCalled = true;
        return makeDecodedStub('Local Phone Decode FC');
      },
    }
  );

  assert.equal(fallbackCalled, true);
  assert.equal(deleteCalled, true);
  assert.equal(result.meta.clubName, 'Local Phone Decode FC');
  assert.ok(
    stages.some((s) => s.step === 'On-Device Decode'),
    'should announce manual on-device decoder switch'
  );
});

test('Google Drive read stall tip surfaces when reading a chunk exceeds stallTipThresholdMs', async () => {
  const slowBlob = {
    size: 10,
    slice: () => ({
      arrayBuffer: async () => {
        await new Promise((r) => setTimeout(r, 45));
        return new ArrayBuffer(10);
      },
    }),
  } as unknown as Blob;

  const stages: FmSaveProgressStage[] = [];
  const mockFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/fm27/decode-save/init')) {
      return new Response(
        JSON.stringify({
          uploadId: '55555555-2222-4333-8444-555555555555',
          supportsParallelChunks: true,
        }),
        { status: 200 }
      );
    }
    if (url.endsWith('/api/fm27/decode-save/chunk')) {
      return new Response(JSON.stringify({ ok: true, bytesReceived: 10 }), {
        status: 200,
      });
    }
    if (url.endsWith('/api/fm27/decode-save/finish')) {
      return new Response(
        JSON.stringify({ jobId: 'dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee' }),
        { status: 200 }
      );
    }
    if (url.includes('/api/fm27/decode-save/job/')) {
      return new Response(
        JSON.stringify({ status: 'done', payload: makeDecodedStub('Slow Drive FC') }),
        { status: 200 }
      );
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  const result = await decodeFmSaveViaServer(
    slowBlob,
    {
      chunkSizeBytes: 10,
      uploadConcurrency: 1,
      pollIntervalMs: 10,
      stallTipThresholdMs: 15,
      enableOfflineAutoPause: false,
    },
    (p) => stages.push(p),
    mockFetch
  );

  assert.equal(result.meta.clubName, 'Slow Drive FC');
  assert.ok(
    stages.some((s) => s.stallTipVisible === true),
    'should set stallTipVisible=true when file read exceeds stall threshold'
  );
});
