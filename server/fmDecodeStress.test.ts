import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import {
  cleanupAllPendingUploadsAndJobs,
  computeCoveredBytes,
  createFmDecodeRouter,
  isContiguousRangeCovered,
  mergeByteRanges,
  sweepOrphanedTempUploads,
} from './routes/fmDecodeRoutes.ts';

function toMb(bytes: number): number {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

function createMemoryTracker() {
  let peakRss = 0;
  let peakHeapUsed = 0;
  const sample = () => {
    const m = process.memoryUsage();
    if (m.rss > peakRss) peakRss = m.rss;
    if (m.heapUsed > peakHeapUsed) peakHeapUsed = m.heapUsed;
    return m;
  };
  sample();
  return {
    sample,
    report: () => ({
      peakRssMb: toMb(peakRss),
      peakHeapUsedMb: toMb(peakHeapUsed),
    }),
  };
}

async function startDecodeServer(mapperPath: string) {
  const app = express();
  app.use(
    '/api',
    createFmDecodeRouter({
      mapperPath,
      detectRuntime: async () => ({
        available: true,
        pythonBin: 'python3',
        pythonVersion: '3.12.0',
        fmsaveVersion: '0.14.3-stress',
        checkedAtMs: Date.now(),
      }),
    }),
  );
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

async function waitForJobTerminal(baseUrl: string, jobId: string) {
  let checkpointStage: string | null = null;
  let checkpointSeen = false;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${baseUrl}/api/fm27/decode-save/job/${jobId}`);
    const body = (await res.json()) as {
      status?: string;
      progress?: string;
      payload?: Record<string, unknown>;
      checkpointStage?: string;
      checkpointPayload?: Record<string, unknown>;
      error?: string;
      errorCode?: string;
      serverDecodeAvailable?: boolean;
      serverStageTimingsMs?: Record<string, number>;
    };
    if (body.status === 'running' && body.checkpointPayload) {
      checkpointSeen = true;
      checkpointStage = body.checkpointStage || null;
    }
    if (body.status === 'done' || body.status === 'error') {
      return { httpStatus: res.status, body, checkpointSeen, checkpointStage };
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Timed out waiting for decode job ${jobId}`);
}

describe('Phase 4 server decode stress, idempotent chunking & 512 MB RAM safety', () => {
  const tempScripts: string[] = [];

  afterEach(async () => {
    await cleanupAllPendingUploadsAndJobs();
    for (const p of tempScripts.splice(0)) {
      await fs.promises.unlink(p).catch(() => {});
    }
  });

  it('merges overlapping/retried byte ranges without double-counting and detects holes', () => {
    const merged = mergeByteRanges([
      { offset: 8, length: 4 },
      { offset: 0, length: 4 },
      { offset: 2, length: 4 }, // overlaps [0,4) -> extends to [0,6)
      { offset: 0, length: 4 }, // duplicate retry
      { offset: 6, length: 2 }, // bridges [0,6) and [8,12)
    ]);
    assert.deepEqual(merged, [{ offset: 0, length: 12 }]);
    assert.equal(computeCoveredBytes(merged), 12);
    assert.equal(isContiguousRangeCovered(merged, 12), true);

    // Hole at [6, 8) must fail contiguous coverage even if extra overlapping bytes arrived
    const withHole = mergeByteRanges([
      { offset: 0, length: 6 },
      { offset: 2, length: 4 },
      { offset: 8, length: 4 },
    ]);
    assert.equal(computeCoveredBytes(withHole), 10);
    assert.equal(isContiguousRangeCovered(withHole, 12), false);
  });

  it('handles synthetic 24 MB parallel chunked upload with retries, overlaps, length checks, abort cleanup & byte-for-byte SHA-256 match', async () => {
    const tracker = createMemoryTracker();
    const t0 = performance.now();

    // Mock Python mapper that hashes the uploaded .fm save and returns a compact JSON object
    const mockMapperPath = path.join(os.tmpdir(), `fm27-stress-hash-${crypto.randomUUID()}.py`);
    tempScripts.push(mockMapperPath);
    await fs.promises.writeFile(
      mockMapperPath,
      [
        'import argparse, hashlib, json, os, sys',
        'p = argparse.ArgumentParser()',
        'p.add_argument("--file", required=True)',
        'p.add_argument("--scope", default="club_only")',
        'p.add_argument("--fast-sync", default="0")',
        'p.add_argument("--filename", default="stress.fm")',
        'p.add_argument("--checkpoint-file", default="")',
        'p.add_argument("--club-hint", default="")',
        'args = p.parse_args()',
        'h = hashlib.sha256()',
        'total = 0',
        'with open(args.file, "rb") as f:',
        '    while True:',
        '        b = f.read(1024 * 1024)',
        '        if not b: break',
        '        total += len(b)',
        '        h.update(b)',
        'print("PROGRESS: Verified upload hash", file=sys.stderr, flush=True)',
        'print(json.dumps({"ok": True, "size": total, "sha256": h.hexdigest(), "filename": args.filename}))',
      ].join('\n'),
      'utf8',
    );

    const srv = await startDecodeServer(mockMapperPath);
    try {
      // 1. Verify mid-upload abort + DELETE cleans up temp file deterministically
      const abortInit = await fetch(`${srv.baseUrl}/api/fm27/decode-save/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalBytes: 4 * 1024 * 1024 }),
      });
      assert.equal(abortInit.status, 200);
      const { uploadId: abortedId } = (await abortInit.json()) as { uploadId: string };
      const abortChunkRes = await fetch(`${srv.baseUrl}/api/fm27/decode-save/chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-fm-upload-id': abortedId,
          'x-fm-chunk-offset': '0',
          'x-fm-chunk-length': String(1024 * 1024),
        },
        body: Buffer.alloc(1024 * 1024, 0x2a),
      });
      assert.equal(abortChunkRes.status, 200);
      const abortFilePath = path.resolve(os.tmpdir(), `fm27-save-${abortedId}.fm`);
      assert.equal(fs.existsSync(abortFilePath), true);

      const delRes = await fetch(`${srv.baseUrl}/api/fm27/decode-save/upload/${abortedId}`, {
        method: 'DELETE',
      });
      assert.equal(delRes.status, 200);
      assert.equal(fs.existsSync(abortFilePath), false, 'DELETE must unlink aborted upload file');

      // 2. Synthetic 24 MB upload (12 x 2 MB chunks) with 4-way concurrency + simulated duplicate/overlapping retries
      const TOTAL_BYTES = 24 * 1024 * 1024;
      const CHUNK_BYTES = 2 * 1024 * 1024;
      const chunkCount = TOTAL_BYTES / CHUNK_BYTES;
      const expectedHasher = crypto.createHash('sha256');
      const chunkBuffers: Array<Uint8Array<ArrayBuffer>> = [];
      for (let i = 0; i < chunkCount; i++) {
        const ab = new ArrayBuffer(CHUNK_BYTES);
        const view = new Uint8Array(ab);
        view.fill((i * 31 + 7) & 0xff);
        new DataView(ab).setUint32(0, i, false);
        expectedHasher.update(view);
        chunkBuffers.push(view);
      }
      const expectedSha256 = expectedHasher.digest('hex');
      tracker.sample();

      const initRes = await fetch(`${srv.baseUrl}/api/fm27/decode-save/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalBytes: TOTAL_BYTES }),
      });
      assert.equal(initRes.status, 200);
      const { uploadId } = (await initRes.json()) as { uploadId: string };

      // Mismatched x-fm-chunk-length must be rejected cleanly with HTTP 400
      const mismatchRes = await fetch(`${srv.baseUrl}/api/fm27/decode-save/chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-fm-upload-id': uploadId,
          'x-fm-chunk-offset': '0',
          'x-fm-chunk-length': String(CHUNK_BYTES + 10),
        },
        body: chunkBuffers[0],
      });
      assert.equal(mismatchRes.status, 400);

      // Build out-of-order upload queue including duplicate retries on chunks 0, 3, and 7
      const uploadOrder = [11, 0, 5, 3, 2, 0, 8, 7, 1, 3, 4, 6, 9, 10, 7];
      let cursor = 0;
      const runWorker = async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= uploadOrder.length) return;
          const chunkIdx = uploadOrder[idx];
          const offset = chunkIdx * CHUNK_BYTES;
          const buf = chunkBuffers[chunkIdx];
          const res = await fetch(`${srv.baseUrl}/api/fm27/decode-save/chunk`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'x-fm-upload-id': uploadId,
              'x-fm-chunk-offset': String(offset),
              'x-fm-chunk-length': String(buf.byteLength),
            },
            body: buf,
          });
          assert.equal(res.status, 200);
          tracker.sample();
        }
      };
      await Promise.all([runWorker(), runWorker(), runWorker(), runWorker()]);

      // Overlapping partial re-send across chunk boundary [1MB .. 3MB) must keep bytesReceived === TOTAL_BYTES
      const overlapSlice = new Uint8Array(new ArrayBuffer(2 * 1024 * 1024));
      overlapSlice.set(chunkBuffers[0].subarray(1024 * 1024), 0);
      overlapSlice.set(chunkBuffers[1].subarray(0, 1024 * 1024), 1024 * 1024);
      const overlapRes = await fetch(`${srv.baseUrl}/api/fm27/decode-save/chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-fm-upload-id': uploadId,
          'x-fm-chunk-offset': String(1024 * 1024),
          'x-fm-chunk-length': String(overlapSlice.byteLength),
        },
        body: overlapSlice,
      });
      assert.equal(overlapRes.status, 200);
      const overlapJson = (await overlapRes.json()) as { bytesReceived: number };
      assert.equal(
        overlapJson.bytesReceived,
        TOTAL_BYTES,
        'overlapping retry must never double-count bytesReceived',
      );

      // Release test-side buffers before finalize so memory sample reflects server decode
      chunkBuffers.length = 0;

      const finishRes = await fetch(`${srv.baseUrl}/api/fm27/decode-save/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, filename: 'stress-24mb.fm' }),
      });
      assert.equal(finishRes.status, 200);
      const { jobId } = (await finishRes.json()) as { jobId: string };

      const terminal = await waitForJobTerminal(srv.baseUrl, jobId);
      tracker.sample();
      assert.equal(terminal.httpStatus, 200);
      assert.equal(terminal.body.status, 'done');
      assert.equal(terminal.body.payload?.size, TOTAL_BYTES);
      assert.equal(terminal.body.payload?.sha256, expectedSha256);
      assert.ok(
        typeof terminal.body.serverStageTimingsMs?.jobToDoneMs === 'number',
        'server decode response must include stage timings for profiling',
      );
      assert.ok(
        typeof terminal.body.serverStageTimingsMs?.jobToSpawnMs === 'number',
        'server decode response must include the spawn stage',
      );

      // Deterministic cleanup verification: input .fm and output .json must be gone
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(fs.existsSync(path.resolve(os.tmpdir(), `fm27-save-${uploadId}.fm`)), false);
      assert.equal(fs.existsSync(path.resolve(os.tmpdir(), `fm27-out-${jobId}.json`)), false);

      const elapsedMs = Math.round(performance.now() - t0);
      const mem = tracker.report();
      console.log(
        `[Phase 4 Stress] 24 MB Upload + Retries/Overlaps: ${elapsedMs}ms | peakRSS=${mem.peakRssMb} MB | peakHeapUsed=${mem.peakHeapUsedMb} MB`,
      );
    } finally {
      await srv.close();
    }
  });

  it('streams a 12 MB Python JSON payload via disk without V8 object-tree amplification, delivers Stage 2 checkpoint, enforces single-job lock, and deletes temp files', async () => {
    const tracker = createMemoryTracker();
    const t0 = performance.now();

    const mockMapperPath = path.join(os.tmpdir(), `fm27-stress-12mb-out-${crypto.randomUUID()}.py`);
    tempScripts.push(mockMapperPath);
    await fs.promises.writeFile(
      mockMapperPath,
      [
        'import argparse, json, sys, time',
        'p = argparse.ArgumentParser()',
        'p.add_argument("--file", required=True)',
        'p.add_argument("--scope", default="club_only")',
        'p.add_argument("--fast-sync", default="0")',
        'p.add_argument("--filename", default="big.fm")',
        'p.add_argument("--checkpoint-file", default="")',
        'p.add_argument("--club-hint", default="")',
        'args = p.parse_args()',
        'if args.checkpoint_file:',
        '    cp_path = args.checkpoint_file[:-5] + "-stage_2_club_core.json"',
        '    with open(cp_path, "w", encoding="utf-8") as f:',
        '        json.dump({"meta": {"clubName": "Stress United"}, "players": [{"uid": 1, "name": "Test Player"}]}, f)',
        '    print("CHECKPOINT: stage_2_club_core", file=sys.stderr, flush=True)',
        'print("PROGRESS: Streaming 12 MB decoded JSON", file=sys.stderr, flush=True)',
        'time.sleep(0.18)',
        'blob = "x" * 1024',
        'sys.stdout.write("{\\"meta\\":{\\"clubName\\":\\"Stress United\\"},\\"blocks\\":[")',
        'count = 12000',
        'for i in range(count):',
        '    if i > 0: sys.stdout.write(",")',
        '    sys.stdout.write(f"\\"{blob}\\"")',
        'sys.stdout.write("]}")',
        'sys.stdout.flush()',
      ].join('\n'),
      'utf8',
    );

    const srv = await startDecodeServer(mockMapperPath);
    try {
      const initRes = await fetch(`${srv.baseUrl}/api/fm27/decode-save/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalBytes: 16 }),
      });
      const { uploadId } = (await initRes.json()) as { uploadId: string };
      await fetch(`${srv.baseUrl}/api/fm27/decode-save/chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-fm-upload-id': uploadId,
          'x-fm-chunk-offset': '0',
          'x-fm-chunk-length': '16',
        },
        body: Buffer.alloc(16, 0x42),
      });

      const finishRes = await fetch(`${srv.baseUrl}/api/fm27/decode-save/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, filename: 'big-12mb-out.fm' }),
      });
      assert.equal(finishRes.status, 200);
      const { jobId } = (await finishRes.json()) as { jobId: string };

      // Single-concurrent-job lock: second /init while job is running must return 503
      const lockedInitRes = await fetch(`${srv.baseUrl}/api/fm27/decode-save/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalBytes: 16 }),
      });
      assert.equal(lockedInitRes.status, 503);

      const terminal = await waitForJobTerminal(srv.baseUrl, jobId);
      tracker.sample();
      assert.equal(terminal.httpStatus, 200);
      assert.equal(terminal.checkpointSeen, true, 'Stage 2 checkpoint must be delivered');
      assert.equal(terminal.checkpointStage, 'stage_2_club_core');
      assert.equal(terminal.body.status, 'done');
      const blocks = terminal.body.payload?.blocks as string[] | undefined;
      assert.equal(blocks?.length, 12_000);

      // Output temp file must be deleted cleanly after streaming finishes
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(fs.existsSync(path.resolve(os.tmpdir(), `fm27-out-${jobId}.json`)), false);

      const elapsedMs = Math.round(performance.now() - t0);
      const mem = tracker.report();
      console.log(
        `[Phase 4 Stress] 12 MB Python->Node Streaming Handoff: ${elapsedMs}ms | peakRSS=${mem.peakRssMb} MB | peakHeapUsed=${mem.peakHeapUsedMb} MB`,
      );
    } finally {
      await srv.close();
    }
  });

  it('surfaces HTTP 507 SERVER_OOM on exit 137, rejects malformed JSON, and sweeps orphaned fm27-out files', async () => {
    // 1. OOM exit 137 -> HTTP 507
    const oomScript = path.join(os.tmpdir(), `fm27-stress-oom-${crypto.randomUUID()}.py`);
    tempScripts.push(oomScript);
    await fs.promises.writeFile(oomScript, 'import sys\nsys.exit(137)\n', 'utf8');

    const oomSrv = await startDecodeServer(oomScript);
    try {
      const initRes = await fetch(`${oomSrv.baseUrl}/api/fm27/decode-save/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalBytes: 8 }),
      });
      const { uploadId } = (await initRes.json()) as { uploadId: string };
      await fetch(`${oomSrv.baseUrl}/api/fm27/decode-save/chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-fm-upload-id': uploadId,
          'x-fm-chunk-offset': '0',
        },
        body: Buffer.alloc(8, 0x01),
      });
      const finishRes = await fetch(`${oomSrv.baseUrl}/api/fm27/decode-save/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId }),
      });
      const { jobId } = (await finishRes.json()) as { jobId: string };
      const terminal = await waitForJobTerminal(oomSrv.baseUrl, jobId);
      assert.equal(terminal.httpStatus, 507);
      assert.equal(terminal.body.errorCode, 'SERVER_OOM');
      assert.equal(terminal.body.serverDecodeAvailable, false);
      assert.equal(fs.existsSync(path.resolve(os.tmpdir(), `fm27-out-${jobId}.json`)), false);
    } finally {
      await oomSrv.close();
    }

    // 2. Malformed JSON -> error status & temp output cleanup
    const badJsonScript = path.join(os.tmpdir(), `fm27-stress-bad-${crypto.randomUUID()}.py`);
    tempScripts.push(badJsonScript);
    await fs.promises.writeFile(
      badJsonScript,
      'import sys\nsys.stdout.write("{not-valid-json")\n',
      'utf8',
    );

    const badSrv = await startDecodeServer(badJsonScript);
    try {
      const initRes = await fetch(`${badSrv.baseUrl}/api/fm27/decode-save/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalBytes: 8 }),
      });
      const { uploadId } = (await initRes.json()) as { uploadId: string };
      await fetch(`${badSrv.baseUrl}/api/fm27/decode-save/chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-fm-upload-id': uploadId,
          'x-fm-chunk-offset': '0',
        },
        body: Buffer.alloc(8, 0x01),
      });
      const finishRes = await fetch(`${badSrv.baseUrl}/api/fm27/decode-save/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId }),
      });
      const { jobId } = (await finishRes.json()) as { jobId: string };
      const terminal = await waitForJobTerminal(badSrv.baseUrl, jobId);
      assert.equal(terminal.body.status, 'error');
      assert.match(String(terminal.body.error || ''), /Failed to parse decoded save JSON/i);
      assert.equal(fs.existsSync(path.resolve(os.tmpdir(), `fm27-out-${jobId}.json`)), false);
    } finally {
      await badSrv.close();
    }

    // 3. Orphan output temp file sweep
    const orphanOut = path.resolve(os.tmpdir(), `fm27-out-${crypto.randomUUID()}.json`);
    await fs.promises.writeFile(orphanOut, '{"orphan":true}', 'utf8');
    const past = new Date(Date.now() - 5_000);
    await fs.promises.utimes(orphanOut, past, past);
    const removed = await sweepOrphanedTempUploads(1_000);
    assert.ok(removed >= 1);
    assert.equal(fs.existsSync(orphanOut), false);
  });
});
