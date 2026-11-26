import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFmSaveViaServer } from './fmSaveReader.ts';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class TrackingBlob extends Blob {
  activeReads = 0;
  maxActiveReads = 0;

  slice(start?: number, end?: number, contentType?: string): Blob {
    const real = super.slice(start, end, contentType);
    return {
      size: real.size,
      arrayBuffer: async () => {
        this.activeReads += 1;
        this.maxActiveReads = Math.max(this.maxActiveReads, this.activeReads);
        await delay(5);
        try {
          return await real.arrayBuffer();
        } finally {
          this.activeReads -= 1;
        }
      },
    } as unknown as Blob;
  }
}

test('mobile upload uses 4 parallel chunk writes but only one file read at a time', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 10 Pro XL)' },
    configurable: true,
  });

  const file = new TrackingBlob([new Uint8Array(80)]);
  let activeUploads = 0;
  let maxActiveUploads = 0;

  const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/fm27/decode-save/init')) {
      return new Response(
        JSON.stringify({
          uploadId: '11111111-2222-4333-8444-555555555555',
          supportsParallelChunks: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.endsWith('/api/fm27/decode-save/chunk')) {
      activeUploads += 1;
      maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
      await delay(20);
      activeUploads -= 1;
      return new Response('{}', { status: 200 });
    }
    if (url.endsWith('/api/fm27/decode-save/finish')) {
      return new Response(JSON.stringify({ jobId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/fm27/decode-save/job/')) {
      return new Response(
        JSON.stringify({
          status: 'done',
          payload: {
            meta: { clubName: 'KVV Zelzate', gameDateDmy: '14/03/2027', filename: 'test.fm' },
            players: [],
            staff: [],
            playedMatches: [],
            upcomingFixtures: [],
            warnings: [],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  try {
    const result = await decodeFmSaveViaServer(
      file,
      { chunkSizeBytes: 10, pollIntervalMs: 5, enableOfflineAutoPause: false },
      () => {},
      mockFetch
    );
    assert.equal(result.meta.clubName, 'KVV Zelzate');
    assert.equal(file.maxActiveReads, 1, 'cloud-provider reads must never overlap');
    assert.ok(maxActiveUploads >= 2, `expected parallel uploads, saw ${maxActiveUploads}`);
    assert.ok(maxActiveUploads <= 4, `expected at most 4 uploads, saw ${maxActiveUploads}`);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete (globalThis as { navigator?: Navigator }).navigator;
  }
});
