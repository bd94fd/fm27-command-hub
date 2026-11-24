import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkServerDecodeStatus,
  decodeFmSaveViaServer,
  decodeFmSaveWithServerFirst,
  ServerDecodeUnavailableError,
} from './fmSaveReader.ts';
import type { DecodedFmSavePayload } from '../utils/fmSaveHydrator.ts';

function makeDecodedPayload(clubName = 'KVV Zelzate'): DecodedFmSavePayload {
  return {
    meta: {
      clubName,
      gameDateDmy: '14/03/2027',
      filename: 'zelzate.fm',
    },
    players: [{ uid: 1, name: 'Player One', position: 'MC', age: 22 }],
    staff: [],
    playedMatches: [],
    upcomingFixtures: [],
    warnings: [],
  } as unknown as DecodedFmSavePayload;
}

test('checkServerDecodeStatus returns runtime metadata when available and false on HTTP or network errors', async () => {
  const ok = await checkServerDecodeStatus(async () =>
    new Response(
      JSON.stringify({
        serverDecodeAvailable: true,
        pythonVersion: '3.11.9',
        fmsaveVersion: '0.14.3',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  );
  assert.deepEqual(ok, {
    serverDecodeAvailable: true,
    pythonVersion: '3.11.9',
    fmsaveVersion: '0.14.3',
  });

  const down = await checkServerDecodeStatus(async () => new Response('err', { status: 503 }));
  assert.equal(down.serverDecodeAvailable, false);

  const networkFail = await checkServerDecodeStatus(async () => {
    throw new Error('offline');
  });
  assert.equal(networkFail.serverDecodeAvailable, false);
});

test('decodeFmSaveViaServer throws ServerDecodeUnavailableError(507) immediately on Render OOM kill', async () => {
  const blob = new Blob([new Uint8Array(16)]);
  const mockFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/decode-save/init')) {
      return new Response(
        JSON.stringify({ uploadId: '11111111-2222-4333-8444-555555555555', supportsParallelChunks: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.endsWith('/decode-save/chunk')) {
      return new Response(JSON.stringify({ ok: true, bytesReceived: 16 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/decode-save/finish')) {
      return new Response(
        JSON.stringify({ jobId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/decode-save/job/')) {
      return new Response(
        JSON.stringify({ status: 'error', errorCode: 'SERVER_OOM', error: '512 MB limit hit' }),
        { status: 507, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  await assert.rejects(
    () =>
      decodeFmSaveViaServer(
        blob,
        {
          fileName: 'big.fm',
          chunkSizeBytes: 16,
          pollIntervalMs: 10,
          retryBaseDelayMs: 10,
          enableOfflineAutoPause: false,
        },
        undefined,
        mockFetch
      ),
    (err: unknown) => {
      assert.ok(err instanceof ServerDecodeUnavailableError);
      assert.equal(err.statusCode, 507);
      return true;
    }
  );
});

test('decodeFmSaveViaServer emits Stage 2 progressive checkpoint once and completes on done payload', async () => {
  const blob = new Blob([new Uint8Array(16)]);
  const checkpointStages: string[] = [];
  let pollCount = 0;

  const mockFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/decode-save/init')) {
      return new Response(
        JSON.stringify({ uploadId: '11111111-2222-4333-8444-555555555555', supportsParallelChunks: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.endsWith('/decode-save/chunk')) {
      return new Response(JSON.stringify({ ok: true, bytesReceived: 16 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/decode-save/finish')) {
      return new Response(
        JSON.stringify({ jobId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/decode-save/job/')) {
      pollCount += 1;
      if (pollCount <= 2) {
        return new Response(
          JSON.stringify({
            status: 'running',
            progress: 'Stage 2 complete',
            checkpointStage: 'stage_2_club_core',
            checkpointPayload: makeDecodedPayload('Checkpoint Club'),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          status: 'done',
          progress: 'Complete',
          payload: makeDecodedPayload('Final Club'),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  const result = await decodeFmSaveViaServer(
    blob,
    {
      fileName: 'zelzate.fm',
      chunkSizeBytes: 16,
      pollIntervalMs: 10,
      retryBaseDelayMs: 10,
      enableOfflineAutoPause: false,
      onCheckpoint: ({ stage }) => checkpointStages.push(stage),
    },
    undefined,
    mockFetch
  );

  assert.equal(result.meta.clubName, 'Final Club');
  assert.deepEqual(checkpointStages, ['stage_2_club_core']);
});

test('decodeFmSaveWithServerFirst falls back automatically to browser decoder when server hits 507 OOM', async () => {
  let browserFallbackCalled = false;
  const mockFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/decode-status')) {
      return new Response(JSON.stringify({ serverDecodeAvailable: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/decode-save/init')) {
      return new Response(
        JSON.stringify({ uploadId: '11111111-2222-4333-8444-555555555555', supportsParallelChunks: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.endsWith('/decode-save/chunk')) {
      return new Response(JSON.stringify({ ok: true, bytesReceived: 10 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/decode-save/finish')) {
      return new Response(
        JSON.stringify({ jobId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/decode-save/job/')) {
      return new Response(
        JSON.stringify({ status: 'error', errorCode: 'SERVER_OOM', error: '512 MB limit hit' }),
        { status: 507, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  const result = await decodeFmSaveWithServerFirst(
    new Blob([new Uint8Array(10)]),
    undefined,
    {
      fileName: 'zelzate.fm',
      chunkSizeBytes: 10,
      pollIntervalMs: 10,
      retryBaseDelayMs: 10,
      enableOfflineAutoPause: false,
    },
    {
      fetchImpl: mockFetch,
      browserFallback: async () => {
        browserFallbackCalled = true;
        return makeDecodedPayload('Browser Decoded Club');
      },
    }
  );

  assert.equal(browserFallbackCalled, true);
  assert.equal(result.meta.clubName, 'Browser Decoded Club');
});
