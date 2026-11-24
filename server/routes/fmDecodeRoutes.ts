import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface ServerPythonRuntime {
  available: boolean;
  pythonBin: string | null;
  pythonVersion: string | null;
  fmsaveVersion: string | null;
  checkedAtMs: number;
}

const PYTHON_PROBE_TTL_MS = 60_000;
const SERVER_DECODE_TIMEOUT_MS = 480_000; // 480s (8 min) for large multi-season saves
const SERVER_DECODE_MAX_STDOUT_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1024 MB (1 GB) total chunked save limit
const MAX_TOTAL_PENDING_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB total across all concurrent pending uploads
const PENDING_UPLOAD_TTL_MS = 15 * 60 * 1000; // 15 minutes of inactivity
const DECODE_JOB_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PENDING_UPLOADS = 24;
const MAX_TRACKED_JOBS = 40;
const STRICT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TMP_UPLOAD_FILE_RE = /^fm27-save-[0-9a-f-]{36}\.fm$/i;
const TMP_CHECKPOINT_FILE_RE = /^fm27-cp-[0-9a-f-]{36}(?:-[a-z0-9_-]+)?\.json(?:\.tmp)?$/i;
const ORPHAN_SWEEP_MIN_AGE_MS = PENDING_UPLOAD_TTL_MS;

interface PendingUploadEntry {
  filePath: string;
  bytesReceived: number;
  expectedTotalBytes?: number;
  receivedChunks?: Map<number, number>;
  createdAt: number;
  lastActivityAt: number;
}

interface DecodeJobEntry {
  status: 'running' | 'done' | 'error';
  progress: string;
  payload?: unknown;
  rawPayloadJson?: string;
  checkpointStage?: string;
  checkpointPayload?: unknown;
  checkpointDelivered?: boolean;
  checkpointSeq?: number;
  error?: string;
  errorCode?: string;
  httpStatus?: number;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}

const pendingUploads = new Map<string, PendingUploadEntry>();
const decodeJobs = new Map<string, DecodeJobEntry>();
const activeTempPaths = new Set<string>();
let cachedPythonRuntime: ServerPythonRuntime | null = null;

function getTotalPendingUploadBytes(excludeUploadId?: string): number {
  let total = 0;
  for (const [id, entry] of pendingUploads.entries()) {
    if (excludeUploadId && id === excludeUploadId) continue;
    total += Math.max(entry.bytesReceived, entry.expectedTotalBytes ?? 0);
  }
  return total;
}

function isValidUuid(val: unknown): val is string {
  return typeof val === 'string' && STRICT_UUID_RE.test(val.trim());
}

async function pruneExpiredUploadsAndJobs(): Promise<void> {
  const now = Date.now();
  const expiredUnlinks: Array<Promise<void>> = [];

  for (const [uploadId, entry] of pendingUploads.entries()) {
    // Prune strictly by inactivity (lastActivityAt), never createdAt, so slow mobile uploads never expire mid-transfer
    if (now - entry.lastActivityAt > PENDING_UPLOAD_TTL_MS) {
      pendingUploads.delete(uploadId);
      expiredUnlinks.push(
        fs.promises.unlink(entry.filePath).catch(() => {
          // ignore if already removed
        })
      );
    }
  }

  for (const [jobId, job] of decodeJobs.entries()) {
    const refTime = job.finishedAt ?? job.updatedAt;
    const ttl =
      job.status === 'running'
        ? SERVER_DECODE_TIMEOUT_MS + 60_000
        : DECODE_JOB_TTL_MS;
    if (now - refTime > ttl) {
      decodeJobs.delete(jobId);
    }
  }

  if (expiredUnlinks.length > 0) {
    await Promise.all(expiredUnlinks);
  }
}

export async function cleanupAllPendingUploadsAndJobs(): Promise<void> {
  const unlinks: Array<Promise<void>> = [];
  for (const [uploadId, entry] of pendingUploads.entries()) {
    pendingUploads.delete(uploadId);
    unlinks.push(
      fs.promises.unlink(entry.filePath).catch(() => {
        // ignore if already removed
      })
    );
  }
  decodeJobs.clear();
  if (unlinks.length > 0) {
    await Promise.all(unlinks);
  }
}

/**
 * Removes temp .fm uploads and checkpoint files left behind by a crash or an
 * interrupted mobile upload. Only files older than ORPHAN_SWEEP_MIN_AGE_MS are
 * touched so a concurrent process's in-flight upload is never deleted.
 */
export async function sweepOrphanedTempUploads(
  maxAgeMs: number = ORPHAN_SWEEP_MIN_AGE_MS
): Promise<number> {
  const tmpDir = path.resolve(os.tmpdir());
  const activePaths = new Set<string>();
  for (const entry of pendingUploads.values()) {
    activePaths.add(path.resolve(entry.filePath));
  }

  let names: string[];
  try {
    names = await fs.promises.readdir(tmpDir);
  } catch {
    return 0;
  }

  const now = Date.now();
  let removed = 0;
  await Promise.all(
    names.map(async (name) => {
      if (!TMP_UPLOAD_FILE_RE.test(name) && !TMP_CHECKPOINT_FILE_RE.test(name)) {
        return;
      }
      const fullPath = path.resolve(tmpDir, name);
      if (activePaths.has(fullPath) || activeTempPaths.has(fullPath)) return;
      try {
        const stat = await fs.promises.stat(fullPath);
        if (!stat.isFile() || now - stat.mtimeMs < maxAgeMs) return;
        await fs.promises.unlink(fullPath);
        removed += 1;
      } catch {
        // Already removed or inaccessible; ignore
      }
    })
  );
  return removed;
}

void sweepOrphanedTempUploads().catch(() => {
  // Startup sweep is best-effort
});

const cleanupInterval = setInterval(() => {
  void pruneExpiredUploadsAndJobs();
  void sweepOrphanedTempUploads().catch(() => {
    // Orphan sweep is best-effort
  });
}, 60_000);
cleanupInterval.unref();

async function detectServerPythonFmsave(
  forceRefresh = false
): Promise<ServerPythonRuntime> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedPythonRuntime &&
    now - cachedPythonRuntime.checkedAtMs < PYTHON_PROBE_TTL_MS
  ) {
    return cachedPythonRuntime;
  }

  const candidates = Array.from(
    new Set(
      [
        process.env.FMSAVE_PYTHON,
        '/opt/fmsave-venv/bin/python3',
        '/opt/fmsave-venv/bin/python',
        path.join(process.cwd(), '.venv-fmsave', 'bin', 'python3'),
        'python3',
      ].filter((v): v is string => Boolean(v && v.trim()))
    )
  );

  for (const bin of candidates) {
    try {
      const { stdout } = await execFileAsync(
        bin,
        [
          '-c',
          'import sys, json, fmsave; print(json.dumps({"py": sys.version.split()[0], "fm": getattr(fmsave, "__version__", "installed")}))',
        ],
        { timeout: 5_000, maxBuffer: 64 * 1024 }
      );
      const parsed = JSON.parse((stdout || '').trim()) as {
        py?: string;
        fm?: string;
      };
      cachedPythonRuntime = {
        available: true,
        pythonBin: bin,
        pythonVersion: parsed.py || null,
        fmsaveVersion: parsed.fm || null,
        checkedAtMs: now,
      };
      return cachedPythonRuntime;
    } catch {
      // Try next Python binary candidate
    }
  }

  cachedPythonRuntime = {
    available: false,
    pythonBin: null,
    pythonVersion: null,
    fmsaveVersion: null,
    checkedAtMs: now,
  };
  return cachedPythonRuntime;
}

function normalizeServerScope(raw: unknown): 'club_only' | 'club_and_division' {
  const val = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return val === 'club_and_division' ? 'club_and_division' : 'club_only';
}

function normalizeServerFastSync(raw: unknown): '0' | '1' {
  if (typeof raw === 'boolean') return raw ? '1' : '0';
  const val = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return val === '1' || val === 'true' ? '1' : '0';
}

function sanitizeDisplayFilename(raw: unknown): string {
  const str = typeof raw === 'string' ? raw : '';
  let decoded = str;
  try {
    decoded = decodeURIComponent(str);
  } catch {
    decoded = str;
  }
  const base = path.basename(decoded).replace(/[\r\n\0]/g, '').trim();
  return base.slice(0, 180) || 'uploaded.fm';
}

function sanitizeClubHint(raw: unknown): string {
  const str = typeof raw === 'string' ? raw : '';
  let decoded = str;
  try {
    decoded = decodeURIComponent(str);
  } catch {
    decoded = str;
  }
  return decoded.replace(/[\r\n\0]/g, '').trim().slice(0, 100);
}

function mapNativeDecoderError(rawMsg: string): string {
  if (/NotAFmSaveError/i.test(rawMsg)) {
    return 'This file is not a valid Football Manager (.fm) save file.';
  }
  if (/UnsupportedGameError/i.test(rawMsg)) {
    return 'This .fm save comes from an unsupported Football Manager version/build. fmsave supports FM26 and FM27 saves.';
  }
  if (/CorruptSaveError/i.test(rawMsg)) {
    return 'The .fm save appears incomplete or still being written by Football Manager. Save again or copy the file first.';
  }
  return `Server .fm decode failed: ${rawMsg.slice(0, 400)}`;
}

function startAsyncNativeFmDecodeJob(
  jobId: string,
  pythonBin: string,
  mapperPath: string,
  tmpSavePath: string,
  args: {
    scope: 'club_only' | 'club_and_division';
    fastSync: '0' | '1';
    clubHint: string;
    displayFilename: string;
  }
): void {
  const job: DecodeJobEntry = {
    status: 'running',
    progress: 'Opening .fm save...',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  decodeJobs.set(jobId, job);

  const tmpCheckpointPath = path.resolve(
    os.tmpdir(),
    `fm27-cp-${jobId}.json`
  );
  const buildStageCheckpointPath = (stageName: string): string => {
    const safeStage =
      stageName.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') ||
      'stage';
    const base = tmpCheckpointPath.toLowerCase().endsWith('.json')
      ? tmpCheckpointPath.slice(0, -5)
      : tmpCheckpointPath;
    return `${base}-${safeStage}.json`;
  };
  const cliArgs = [
    mapperPath,
    '--file',
    tmpSavePath,
    '--scope',
    args.scope,
    '--fast-sync',
    args.fastSync,
    '--filename',
    args.displayFilename,
    '--checkpoint-file',
    tmpCheckpointPath,
  ];
  if (args.clubHint) {
    cliArgs.push('--club-hint', args.clubHint);
  }

  const jobTempPaths = new Set<string>([
    tmpSavePath,
    tmpCheckpointPath,
    `${tmpCheckpointPath}.tmp`,
  ]);
  for (const p of jobTempPaths) {
    activeTempPaths.add(p);
  }

  let cleanedUp = false;
  const cleanupTempFile = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    for (const p of jobTempPaths) {
      activeTempPaths.delete(p);
      void fs.promises.unlink(p).catch(() => {
        // ignore if already removed
      });
    }
    jobTempPaths.clear();
  };

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(pythonBin, cliArgs, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
    });
  } catch (err: unknown) {
    cleanupTempFile();
    job.status = 'error';
    job.error = mapNativeDecoderError(
      err instanceof Error ? err.message : String(err)
    );
    job.finishedAt = Date.now();
    job.updatedAt = job.finishedAt;
    return;
  }

  const stdoutChunks: Buffer[] = [];
  const stderrHistory: string[] = [];
  let stderrLineBuf = '';
  let stdoutBytes = 0;
  let nextCheckpointSeq = 0;
  let settled = false;

  const killChild = () => {
    try {
      child.kill('SIGKILL');
    } catch {
      // ignore
    }
  };

  const releaseJobBuffers = () => {
    stdoutChunks.length = 0;
    job.checkpointPayload = undefined;
    job.checkpointDelivered = true;
  };

  const finalizeError = (errMessage: string) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    releaseJobBuffers();
    cleanupTempFile();
    job.status = 'error';
    job.error = mapNativeDecoderError(errMessage);
    job.finishedAt = Date.now();
    job.updatedAt = job.finishedAt;
  };

  const timer = setTimeout(() => {
    killChild();
    finalizeError(
      `Native server decode exceeded ${Math.round(SERVER_DECODE_TIMEOUT_MS / 1000)}s timeout.`
    );
  }, SERVER_DECODE_TIMEOUT_MS);

  child.stdout?.on('data', (chunk: Buffer) => {
    if (settled) return;
    stdoutBytes += chunk.length;
    if (stdoutBytes > SERVER_DECODE_MAX_STDOUT_BYTES) {
      killChild();
      finalizeError('Decoded JSON output exceeded maximum allowed size.');
      return;
    }
    stdoutChunks.push(chunk);
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    if (settled) return;
    const text = chunk.toString('utf8');
    stderrLineBuf += text;
    const lines = stderrLineBuf.split(/\r?\n/);
    stderrLineBuf = lines.pop() ?? '';
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (stderrHistory.length < 120) {
        stderrHistory.push(line);
      }
      // Update live human-readable progress text strictly from explicit PROGRESS: lines
      if (/^PROGRESS:\s*/i.test(line)) {
        const displayProgress = line.replace(/^PROGRESS:\s*/i, '').trim();
        if (displayProgress) {
          job.progress = displayProgress.slice(0, 220);
          job.updatedAt = Date.now();
        }
      } else if (/^CHECKPOINT:\s*/i.test(line)) {
        const stageName = line.replace(/^CHECKPOINT:\s*/i, '').trim() || 'stage_2_club_core';
        const cpSeq = ++nextCheckpointSeq;
        const stageCpPath = buildStageCheckpointPath(stageName);
        jobTempPaths.add(stageCpPath);
        jobTempPaths.add(`${stageCpPath}.tmp`);
        activeTempPaths.add(stageCpPath);
        activeTempPaths.add(`${stageCpPath}.tmp`);

        let readTargetPath = stageCpPath;
        void fs.promises
          .readFile(stageCpPath, 'utf8')
          .catch((err: NodeJS.ErrnoException) => {
            if (err && err.code === 'ENOENT') {
              readTargetPath = tmpCheckpointPath;
              return fs.promises.readFile(tmpCheckpointPath, 'utf8');
            }
            throw err;
          })
          .then((rawCp) => {
            if (settled || job.status !== 'running') return;
            if ((job.checkpointSeq ?? 0) > cpSeq) return;
            const parsedCp = JSON.parse(rawCp) as unknown;
            job.checkpointSeq = cpSeq;
            job.checkpointStage = stageName;
            job.checkpointPayload = parsedCp;
            job.checkpointDelivered = false;
            job.updatedAt = Date.now();
          })
          .catch(() => {
            // Non-fatal: final payload will still arrive
          })
          .finally(() => {
            activeTempPaths.delete(stageCpPath);
            activeTempPaths.delete(`${stageCpPath}.tmp`);
            activeTempPaths.delete(readTargetPath);
            activeTempPaths.delete(`${readTargetPath}.tmp`);
            jobTempPaths.delete(stageCpPath);
            jobTempPaths.delete(`${stageCpPath}.tmp`);
            jobTempPaths.delete(readTargetPath);
            jobTempPaths.delete(`${readTargetPath}.tmp`);
            void fs.promises.unlink(readTargetPath).catch(() => {});
          });
      }
    }
  });

  child.on('error', (err) => {
    finalizeError(err.message);
  });

  child.on('close', (code, signal) => {
    if (stderrLineBuf.trim()) {
      stderrHistory.push(stderrLineBuf.trim());
    }
    if (settled) {
      releaseJobBuffers();
      cleanupTempFile();
      return;
    }
    clearTimeout(timer);
    cleanupTempFile();
    settled = true;
    job.checkpointPayload = undefined;
    job.checkpointDelivered = true;

    // Render free tier is capped at 512 MB. The kernel SIGKILLs the Python child
    // when the cgroup limit is hit; surface that as a 507 so the client falls
    // back to Pyodide/Fast Sync immediately instead of polling to the timeout.
    const wasOomKilled = code === 137 || signal === 'SIGKILL';
    if (wasOomKilled) {
      stdoutChunks.length = 0;
      job.status = 'error';
      job.progress = 'Server memory limit reached';
      job.errorCode = 'SERVER_OOM';
      job.httpStatus = 507;
      job.error =
        'The server ran out of memory (512 MB Render free tier) while decoding this .fm save. Switching automatically to the local browser decoder — enable "Fast Sync" for very large saves.';
    } else if (code === 0) {
      let concatBuf: Buffer | null = Buffer.concat(stdoutChunks, stdoutBytes);
      stdoutChunks.length = 0;
      const rawJson = concatBuf.toString('utf8').trim();
      concatBuf = null;
      if (!rawJson) {
        job.status = 'error';
        job.error = 'Native Python decoder returned empty output.';
      } else {
        try {
          // Validate JSON integrity transiently without pinning a duplicate V8 object tree in RAM
          const validated = JSON.parse(rawJson) as unknown;
          if (!validated || typeof validated !== 'object' || Array.isArray(validated)) {
            throw new Error('Decoded payload must be a JSON object');
          }
          job.rawPayloadJson = rawJson;
          job.status = 'done';
          job.progress = 'Server Full Sync complete';
        } catch (parseErr: unknown) {
          job.status = 'error';
          job.error = `Failed to parse decoded save JSON: ${
            parseErr instanceof Error ? parseErr.message : String(parseErr)
          }`;
        }
      }
    } else {
      stdoutChunks.length = 0;
      const combinedStderr = stderrHistory.join('\n').trim();
      job.status = 'error';
      job.error = mapNativeDecoderError(
        combinedStderr || `Native fm-save-mapper exited with code ${code}`
      );
    }

    job.finishedAt = Date.now();
    job.updatedAt = job.finishedAt;
  });
}

export function createFmDecodeRouter(options?: {
  detectRuntime?: () => Promise<ServerPythonRuntime>;
}): express.Router {
  const router = express.Router();
  const resolveRuntime = options?.detectRuntime ?? detectServerPythonFmsave;

  router.get('/fm27/decode-status', async (_req, res) => {
    const runtime = await resolveRuntime();
    return res.json({
      serverDecodeAvailable: runtime.available,
      pythonVersion: runtime.pythonVersion,
      fmsaveVersion: runtime.fmsaveVersion,
    });
  });

  router.post(
    '/fm27/decode-save/init',
    express.json({ limit: '1mb' }),
    async (req, res) => {
      await pruneExpiredUploadsAndJobs();
      const runtime = await resolveRuntime();
      if (!runtime.available || !runtime.pythonBin) {
        return res.status(503).json({
          error:
            'Native Python fmsave is not available on this server. Falling back to local browser Pyodide decoder.',
          serverDecodeAvailable: false,
        });
      }

      const hasRunningJob = Array.from(decodeJobs.values()).some(
        (j) => j.status === 'running'
      );
      if (hasRunningJob) {
        return res.status(503).json({
          error:
            'Another .fm save decode is currently in progress on the server. Falling back to local browser decoder.',
        });
      }

      if (pendingUploads.size >= MAX_PENDING_UPLOADS) {
        return res.status(429).json({
          error: 'Too many concurrent save uploads in progress. Please try again in a moment.',
        });
      }

    const rawTotalBytes = (req.body as { totalBytes?: unknown } | undefined)?.totalBytes;
    let expectedTotalBytes: number | undefined;
    if (rawTotalBytes !== undefined && rawTotalBytes !== null) {
      const parsedTotal = Number(rawTotalBytes);
      if (!Number.isSafeInteger(parsedTotal) || parsedTotal <= 0) {
        return res.status(400).json({ error: 'Invalid totalBytes value.' });
      }
      if (parsedTotal > MAX_TOTAL_UPLOAD_BYTES) {
        const attemptedMb = (parsedTotal / (1024 * 1024)).toFixed(1);
        return res.status(413).json({
          error: `Total .fm save size (${attemptedMb} MB) exceeded the 1024 MB (1 GB) server upload limit.`,
        });
      }
      expectedTotalBytes = parsedTotal;
    }

    const currentPendingBytes = getTotalPendingUploadBytes();
    const projectedPendingBytes = currentPendingBytes + (expectedTotalBytes ?? 0);
    if (projectedPendingBytes > MAX_TOTAL_PENDING_UPLOAD_BYTES) {
      return res.status(429).json({
        error:
          'Temporary upload storage limit reached on the server. Please wait a moment and try again.',
      });
    }

    const uploadId = crypto.randomUUID();
    const tmpBaseDir = path.resolve(os.tmpdir());
    const filePath = path.resolve(tmpBaseDir, `fm27-save-${uploadId}.fm`);
    if (!filePath.startsWith(tmpBaseDir + path.sep)) {
      return res.status(500).json({ error: 'Invalid server temporary storage path.' });
    }

    try {
      await fs.promises.writeFile(filePath, Buffer.alloc(0), { mode: 0o600 });
      const now = Date.now();
      const supportsParallelChunks = expectedTotalBytes !== undefined;
      pendingUploads.set(uploadId, {
        filePath,
        bytesReceived: 0,
        expectedTotalBytes,
        receivedChunks: supportsParallelChunks ? new Map<number, number>() : undefined,
        createdAt: now,
        lastActivityAt: now,
      });
      return res.json({ uploadId, supportsParallelChunks });
    } catch (err: unknown) {
      return res.status(500).json({
        error: `Failed to initialize save upload: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  });

  router.post(
    '/fm27/decode-save/chunk',
    express.raw({ type: 'application/octet-stream', limit: '8mb' }),
    async (req, res) => {
      const rawUploadId = req.headers['x-fm-upload-id'];
      const uploadId = typeof rawUploadId === 'string' ? rawUploadId.trim() : '';
      if (!isValidUuid(uploadId)) {
        return res.status(400).json({ error: 'Missing or invalid x-fm-upload-id header.' });
      }

      const entry = pendingUploads.get(uploadId);
      if (!entry) {
        return res.status(404).json({
          error: 'Upload session not found or expired. Please start the upload again.',
        });
      }

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({
          error:
            'Empty chunk payload. Send binary bytes with Content-Type: application/octet-stream.',
        });
      }

      entry.lastActivityAt = Date.now();

      const rawOffsetHeader = req.headers['x-fm-chunk-offset'];
      const isParallelSession =
        entry.expectedTotalBytes !== undefined && entry.receivedChunks !== undefined;
      let writeOffset = entry.bytesReceived;
      if (rawOffsetHeader !== undefined) {
        const offsetStr = Array.isArray(rawOffsetHeader)
          ? rawOffsetHeader[0]
          : String(rawOffsetHeader);
        if (!/^\d+$/.test(offsetStr.trim())) {
          return res.status(400).json({
            error: 'Invalid x-fm-chunk-offset header. Must be a non-negative integer.',
          });
        }
        const parsedOffset = Number(offsetStr.trim());
        if (!Number.isSafeInteger(parsedOffset) || parsedOffset < 0) {
          return res.status(400).json({
            error: 'Invalid x-fm-chunk-offset header.',
          });
        }
        if (!isParallelSession && parsedOffset > entry.bytesReceived) {
          return res.status(409).json({
            error: `Out-of-order chunk offset (${parsedOffset} > ${entry.bytesReceived}).`,
          });
        }
        writeOffset = parsedOffset;
      }

      const chunkEnd = writeOffset + req.body.length;
      if (isParallelSession && chunkEnd > entry.expectedTotalBytes!) {
        return res.status(413).json({
          error: 'Chunk write exceeds declared totalBytes for upload session.',
        });
      }

      const nextTotalBytes = Math.max(entry.bytesReceived, chunkEnd);
      if (nextTotalBytes > MAX_TOTAL_UPLOAD_BYTES) {
        const attemptedMb = (nextTotalBytes / (1024 * 1024)).toFixed(1);
        pendingUploads.delete(uploadId);
        await fs.promises.unlink(entry.filePath).catch(() => {});
        return res.status(413).json({
          error: `Total .fm save size (${attemptedMb} MB) exceeded the 1024 MB (1 GB) server upload limit.`,
        });
      }

      const otherPendingBytes = getTotalPendingUploadBytes(uploadId);
      if (otherPendingBytes + nextTotalBytes > MAX_TOTAL_PENDING_UPLOAD_BYTES) {
        pendingUploads.delete(uploadId);
        await fs.promises.unlink(entry.filePath).catch(() => {});
        return res.status(429).json({
          error:
            'Temporary upload storage limit reached on the server. Partial upload cleared — please try again in a moment.',
        });
      }

      try {
        const fh = await fs.promises.open(entry.filePath, 'r+');
        try {
          await fh.write(req.body, 0, req.body.length, writeOffset);
        } finally {
          await fh.close();
        }
        if (isParallelSession && entry.receivedChunks) {
          entry.receivedChunks.set(writeOffset, req.body.length);
          let uniqueBytes = 0;
          for (const len of entry.receivedChunks.values()) {
            uniqueBytes += len;
          }
          entry.bytesReceived = uniqueBytes;
        } else {
          entry.bytesReceived = nextTotalBytes;
        }
        entry.lastActivityAt = Date.now();
        return res.json({ ok: true, bytesReceived: entry.bytesReceived });
      } catch (err: unknown) {
        return res.status(500).json({
          error: `Failed to write save chunk: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    }
  );

  router.delete('/fm27/decode-save/upload/:uploadId', async (req, res) => {
    const uploadId =
      typeof req.params.uploadId === 'string' ? req.params.uploadId.trim() : '';
    if (!isValidUuid(uploadId)) {
      return res.status(400).json({ error: 'Invalid uploadId.' });
    }
    const entry = pendingUploads.get(uploadId);
    if (entry) {
      pendingUploads.delete(uploadId);
      await fs.promises.unlink(entry.filePath).catch(() => {
        // ignore if already deleted
      });
    }
    return res.json({ ok: true });
  });

  router.post(
    '/fm27/decode-save/finish',
    express.json({ limit: '1mb' }),
    async (req, res) => {
      await pruneExpiredUploadsAndJobs();
      const runtime = await resolveRuntime();
      if (!runtime.available || !runtime.pythonBin) {
        return res.status(503).json({
          error:
            'Native Python fmsave is not available on this server. Falling back to local browser Pyodide decoder.',
          serverDecodeAvailable: false,
        });
      }

      const body = (req.body || {}) as {
        uploadId?: unknown;
        filename?: unknown;
        scope?: unknown;
        fastSync?: unknown;
        clubHint?: unknown;
      };

      const uploadId = typeof body.uploadId === 'string' ? body.uploadId.trim() : '';
      if (!isValidUuid(uploadId)) {
        return res.status(400).json({ error: 'Missing or invalid uploadId.' });
      }

      const entry = pendingUploads.get(uploadId);
      if (!entry) {
        return res.status(404).json({
          error: 'Upload session not found, already finalized, or expired.',
        });
      }
      // Atomically claim the upload so duplicate /finish calls cannot spawn duplicate jobs
      pendingUploads.delete(uploadId);

      if (entry.bytesReceived <= 0) {
        await fs.promises.unlink(entry.filePath).catch(() => {});
        return res.status(400).json({
          error: 'Uploaded .fm save is empty (0 bytes received).',
        });
      }
      if (
        entry.expectedTotalBytes !== undefined &&
        entry.bytesReceived < entry.expectedTotalBytes
      ) {
        await fs.promises.unlink(entry.filePath).catch(() => {});
        return res.status(400).json({
          error: `Uploaded .fm save is incomplete (${entry.bytesReceived} of ${entry.expectedTotalBytes} bytes received).`,
        });
      }

      // Prevent concurrent Python decodes from exceeding Render Free tier 512 MB RAM
      const hasRunningJob = Array.from(decodeJobs.values()).some(
        (j) => j.status === 'running'
      );
      if (hasRunningJob) {
        await fs.promises.unlink(entry.filePath).catch(() => {});
        return res.status(503).json({
          error:
            'Another .fm save decode is currently in progress on the server. Falling back to local browser decoder.',
        });
      }

      if (decodeJobs.size >= MAX_TRACKED_JOBS) {
        // Evict oldest completed job if at capacity
        for (const [oldId, oldJob] of decodeJobs.entries()) {
          if (oldJob.status !== 'running') {
            decodeJobs.delete(oldId);
            break;
          }
        }
      }

      const displayFilename = sanitizeDisplayFilename(body.filename);
      const scope = normalizeServerScope(body.scope);
      const fastSync = normalizeServerFastSync(body.fastSync);
      const clubHint = sanitizeClubHint(body.clubHint);
      const mapperPath = path.resolve(process.cwd(), 'public', 'fm-save-mapper.py');
      const jobId = crypto.randomUUID();

      startAsyncNativeFmDecodeJob(jobId, runtime.pythonBin, mapperPath, entry.filePath, {
        scope,
        fastSync,
        clubHint,
        displayFilename,
      });

      return res.json({ jobId });
    }
  );

  router.get('/fm27/decode-save/job/:jobId', async (req, res) => {
    await pruneExpiredUploadsAndJobs();
    const jobId = typeof req.params.jobId === 'string' ? req.params.jobId.trim() : '';
    if (!isValidUuid(jobId)) {
      return res.status(400).json({ status: 'error', error: 'Invalid jobId.' });
    }

    const job = decodeJobs.get(jobId);
    if (!job) {
      return res.status(404).json({
        status: 'error',
        error: 'Decode job not found or expired.',
      });
    }

    if (job.status === 'done') {
      const rawPayloadJson = job.rawPayloadJson;
      const payload = job.payload;
      const progress = job.progress;
      // Release potentially large decoded payload from server RAM immediately upon delivery
      decodeJobs.delete(jobId);
      if (typeof rawPayloadJson === 'string') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.send(
          `{"status":"done","progress":${JSON.stringify(progress)},"payload":${rawPayloadJson}}`
        );
      }
      return res.json({
        status: 'done',
        progress,
        payload,
      });
    }

    if (job.status === 'error') {
      return res.status(job.httpStatus ?? 200).json({
        status: 'error',
        progress: job.progress,
        error: job.error || 'Server .fm decode failed.',
        ...(job.errorCode ? { errorCode: job.errorCode } : {}),
        ...(job.errorCode === 'SERVER_OOM'
          ? { serverDecodeAvailable: false }
          : {}),
      });
    }

    if (job.checkpointPayload && !job.checkpointDelivered) {
      const cpStage = job.checkpointStage || 'stage_2_club_core';
      const cpPayload = job.checkpointPayload;
      job.checkpointDelivered = true;
      job.checkpointPayload = undefined;
      return res.json({
        status: 'running',
        progress: job.progress,
        checkpointStage: cpStage,
        checkpointPayload: cpPayload,
      });
    }

    return res.json({
      status: 'running',
      progress: job.progress,
    });
  });

  // Router-level JSON formatter for body-parser 413 / 400 errors (covers standalone mounts too)
  router.use(
    (
      err: {
        type?: string;
        status?: number;
        statusCode?: number;
        name?: string;
      },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) {
        return next(err);
      }
      if (
        err &&
        (err.type === 'entity.too.large' ||
          err.status === 413 ||
          err.statusCode === 413 ||
          err.name === 'PayloadTooLargeError')
      ) {
        return res.status(413).json({
          error:
            'Upload chunk exceeded the 8 MB per-chunk server limit (total .fm save limit is 1024 MB / 1 GB).',
        });
      }
      if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({
          error: 'Malformed JSON request body. Please retry the request.',
        });
      }
      return next(err);
    }
  );

  return router;
}
