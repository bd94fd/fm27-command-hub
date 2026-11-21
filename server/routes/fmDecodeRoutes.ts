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
const SERVER_DECODE_TIMEOUT_MS = 300_000; // 300s (5 min) for large multi-season saves
const SERVER_DECODE_MAX_STDOUT_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1024 MB (1 GB) total chunked save limit
const PENDING_UPLOAD_TTL_MS = 15 * 60 * 1000; // 15 minutes of inactivity
const DECODE_JOB_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PENDING_UPLOADS = 24;
const MAX_TRACKED_JOBS = 40;
const STRICT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PendingUploadEntry {
  filePath: string;
  bytesReceived: number;
  createdAt: number;
  lastActivityAt: number;
}

interface DecodeJobEntry {
  status: 'running' | 'done' | 'error';
  progress: string;
  payload?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}

const pendingUploads = new Map<string, PendingUploadEntry>();
const decodeJobs = new Map<string, DecodeJobEntry>();
let cachedPythonRuntime: ServerPythonRuntime | null = null;

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

const cleanupInterval = setInterval(() => {
  void pruneExpiredUploadsAndJobs();
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
  ];
  if (args.clubHint) {
    cliArgs.push('--club-hint', args.clubHint);
  }

  let cleanedUp = false;
  const cleanupTempFile = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    void fs.promises.unlink(tmpSavePath).catch(() => {
      // ignore if already removed
    });
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
  let settled = false;

  const killChild = () => {
    try {
      child.kill('SIGKILL');
    } catch {
      // ignore
    }
  };

  const finalizeError = (errMessage: string) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
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
      }
    }
  });

  child.on('error', (err) => {
    finalizeError(err.message);
  });

  child.on('close', (code) => {
    if (stderrLineBuf.trim()) {
      stderrHistory.push(stderrLineBuf.trim());
    }
    if (settled) {
      cleanupTempFile();
      return;
    }
    clearTimeout(timer);
    cleanupTempFile();
    settled = true;

    if (code === 0) {
      const rawJson = Buffer.concat(stdoutChunks).toString('utf8').trim();
      if (!rawJson) {
        job.status = 'error';
        job.error = 'Native Python decoder returned empty output.';
      } else {
        try {
          job.payload = JSON.parse(rawJson);
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

export function createFmDecodeRouter(): express.Router {
  const router = express.Router();

  router.get('/fm27/decode-status', async (_req, res) => {
    const runtime = await detectServerPythonFmsave();
    return res.json({
      serverDecodeAvailable: runtime.available,
      pythonVersion: runtime.pythonVersion,
      fmsaveVersion: runtime.fmsaveVersion,
    });
  });

  router.post('/fm27/decode-save/init', async (_req, res) => {
    await pruneExpiredUploadsAndJobs();
    const runtime = await detectServerPythonFmsave();
    if (!runtime.available || !runtime.pythonBin) {
      return res.status(503).json({
        error:
          'Native Python fmsave is not available on this server. Falling back to local browser Pyodide decoder.',
        serverDecodeAvailable: false,
      });
    }

    if (pendingUploads.size >= MAX_PENDING_UPLOADS) {
      return res.status(429).json({
        error: 'Too many concurrent save uploads in progress. Please try again in a moment.',
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
      pendingUploads.set(uploadId, {
        filePath,
        bytesReceived: 0,
        createdAt: now,
        lastActivityAt: now,
      });
      return res.json({ uploadId });
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

      const nextTotalBytes = entry.bytesReceived + req.body.length;
      if (nextTotalBytes > MAX_TOTAL_UPLOAD_BYTES) {
        const attemptedMb = (nextTotalBytes / (1024 * 1024)).toFixed(1);
        pendingUploads.delete(uploadId);
        await fs.promises.unlink(entry.filePath).catch(() => {});
        return res.status(413).json({
          error: `Total .fm save size (${attemptedMb} MB) exceeded the 1024 MB (1 GB) server upload limit.`,
        });
      }

      try {
        await fs.promises.appendFile(entry.filePath, req.body);
        entry.bytesReceived = nextTotalBytes;
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

  router.post('/fm27/decode-save/finish', async (req, res) => {
    await pruneExpiredUploadsAndJobs();
    const runtime = await detectServerPythonFmsave();
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
  });

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
      return res.json({
        status: 'done',
        progress: job.progress,
        payload: job.payload,
      });
    }

    if (job.status === 'error') {
      return res.json({
        status: 'error',
        progress: job.progress,
        error: job.error || 'Server .fm decode failed.',
      });
    }

    return res.json({
      status: 'running',
      progress: job.progress,
    });
  });

  return router;
}
