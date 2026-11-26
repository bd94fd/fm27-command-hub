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
const SMALL_JSON_STRICT_VALIDATE_BYTES = 2 * 1024 * 1024; // Strict JSON.parse up to 2 MB; streaming O(1)-RAM validator above
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
const TMP_OUTPUT_FILE_RE = /^fm27-out-[0-9a-f-]{36}\.json$/i;
const ORPHAN_SWEEP_MIN_AGE_MS = PENDING_UPLOAD_TTL_MS;

export interface ByteRange {
  offset: number;
  length: number;
}

/**
 * Pure helper: merges overlapping or adjacent [offset, offset + length) intervals
 * into sorted, disjoint ByteRange segments so retried/overlapping chunks are
 * strictly idempotent and never double-counted.
 */
export function mergeByteRanges(ranges: ReadonlyArray<ByteRange>): ByteRange[] {
  const valid = ranges
    .filter(
      (r) =>
        Number.isSafeInteger(r.offset) &&
        r.offset >= 0 &&
        Number.isSafeInteger(r.length) &&
        r.length > 0
    )
    .sort((a, b) => a.offset - b.offset || a.length - b.length);
  if (valid.length === 0) return [];

  const merged: ByteRange[] = [{ offset: valid[0].offset, length: valid[0].length }];
  for (let i = 1; i < valid.length; i++) {
    const curr = valid[i];
    const last = merged[merged.length - 1];
    const lastEnd = last.offset + last.length;
    const currEnd = curr.offset + curr.length;
    if (curr.offset <= lastEnd) {
      if (currEnd > lastEnd) {
        last.length = currEnd - last.offset;
      }
    } else {
      merged.push({ offset: curr.offset, length: curr.length });
    }
  }
  return merged;
}

export function computeCoveredBytes(mergedRanges: ReadonlyArray<ByteRange>): number {
  let total = 0;
  for (const r of mergedRanges) {
    total += r.length;
  }
  return total;
}

export function isContiguousRangeCovered(
  mergedRanges: ReadonlyArray<ByteRange>,
  expectedTotalBytes: number
): boolean {
  if (!Number.isSafeInteger(expectedTotalBytes) || expectedTotalBytes <= 0) {
    return false;
  }
  return (
    mergedRanges.length === 1 &&
    mergedRanges[0].offset === 0 &&
    mergedRanges[0].length === expectedTotalBytes
  );
}

interface PendingUploadEntry {
  filePath: string;
  fileHandle: fs.promises.FileHandle | null;
  fileHandleOpening: Promise<fs.promises.FileHandle> | null;
  inFlightWrites: number;
  closing: boolean;
  closePromise: Promise<void> | null;
  writeDrainResolvers: Array<() => void>;
  bytesReceived: number;
  expectedTotalBytes?: number;
  receivedChunks?: Map<number, number>;
  coveredRanges: ByteRange[];
  createdAt: number;
  lastActivityAt: number;
}

interface DecodeJobEntry {
  status: 'running' | 'done' | 'error';
  progress: string;
  payload?: unknown;
  rawPayloadJson?: string;
  rawPayloadPath?: string;
  checkpointStage?: string;
  checkpointPayloadJson?: string;
  checkpointDelivered?: boolean;
  checkpointSeq?: number;
  serverStageTimingsMs?: Record<string, number>;
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
const activeDecodeChildren = new Set<ReturnType<typeof spawn>>();
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

async function acquireUploadFileHandle(
  entry: PendingUploadEntry
): Promise<fs.promises.FileHandle | null> {
  if (entry.closing) return null;
  if (entry.fileHandle) return entry.fileHandle;
  if (!entry.fileHandleOpening) {
    entry.fileHandleOpening = fs.promises
      .open(entry.filePath, 'r+')
      .then((fh) => {
        entry.fileHandleOpening = null;
        if (entry.closing) {
          void fh.close().catch(() => {});
          return fh;
        }
        entry.fileHandle = fh;
        return fh;
      })
      .catch((err) => {
        entry.fileHandleOpening = null;
        throw err;
      });
  }
  const fh = await entry.fileHandleOpening;
  if (entry.closing) return null;
  return fh;
}

function closeUploadHandle(entry: PendingUploadEntry): Promise<void> {
  if (entry.closePromise) return entry.closePromise;
  entry.closing = true;
  entry.closePromise = (async () => {
    if (entry.fileHandleOpening) {
      await entry.fileHandleOpening.catch(() => {});
    }
    if (entry.inFlightWrites > 0) {
      await new Promise<void>((resolve) => {
        entry.writeDrainResolvers.push(resolve);
      });
    }
    const fh = entry.fileHandle;
    entry.fileHandle = null;
    if (fh) {
      await fh.close().catch(() => {});
    }
  })();
  return entry.closePromise;
}

async function disposePendingUpload(
  uploadId: string,
  entry: PendingUploadEntry,
  unlinkFile = true
): Promise<void> {
  pendingUploads.delete(uploadId);
  await closeUploadHandle(entry);
  if (unlinkFile) {
    await fs.promises.unlink(entry.filePath).catch(() => {
      // ignore if already removed
    });
  }
}

async function cleanupJobOutputFile(job: DecodeJobEntry): Promise<void> {
  const outPath = job.rawPayloadPath;
  job.rawPayloadPath = undefined;
  job.rawPayloadJson = undefined;
  job.checkpointPayloadJson = undefined;
  if (!outPath) return;
  activeTempPaths.delete(outPath);
  await fs.promises.unlink(outPath).catch(() => {
    // ignore if already removed
  });
}

/**
 * Validates that a large JSON output file is a well-formed JSON object
 * in constant O(1) memory (~64 KB read chunks), avoiding a V8 JSON.parse()
 * heap spike on Render's 512 MB tier.
 */
async function validateJsonObjectFileStreaming(filePath: string): Promise<void> {
  const stat = await fs.promises.stat(filePath);
  if (stat.size === 0) {
    throw new Error('Empty JSON output');
  }
  if (stat.size <= SMALL_JSON_STRICT_VALIDATE_BYTES) {
    const raw = (await fs.promises.readFile(filePath, 'utf8')).trim();
    if (!raw) {
      throw new Error('Empty JSON output');
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Decoded payload must be a JSON object');
    }
    return;
  }

  // Constant-memory streaming structural validator for payloads > 2 MB
  const stack: number[] = []; // 1 = '{', 2 = '['
  let started = false;
  let finishedRoot = false;
  let inString = false;
  let escaped = false;

  const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
  for await (const chunk of stream) {
    const buf = chunk as Buffer;
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (b === 0x5c) {
          // '\'
          escaped = true;
          continue;
        }
        if (b === 0x22) {
          // '"'
          inString = false;
          continue;
        }
        if (b < 0x20) {
          throw new Error('Unescaped control character in JSON string');
        }
        continue;
      }

      // Skip JSON whitespace
      if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) {
        continue;
      }

      if (finishedRoot) {
        throw new Error('Unexpected trailing content after JSON object');
      }

      if (!started) {
        if (b !== 0x7b) {
          throw new Error('Decoded payload must be a JSON object');
        }
        started = true;
        stack.push(1);
        continue;
      }

      if (b === 0x22) {
        inString = true;
      } else if (b === 0x7b) {
        stack.push(1);
      } else if (b === 0x5b) {
        stack.push(2);
      } else if (b === 0x7d) {
        if (stack.pop() !== 1) {
          throw new Error('Mismatched closing brace in JSON');
        }
        if (stack.length === 0) {
          finishedRoot = true;
        }
      } else if (b === 0x5d) {
        if (stack.pop() !== 2) {
          throw new Error('Mismatched closing bracket in JSON');
        }
      }
    }
  }

  if (!started || !finishedRoot || inString || stack.length !== 0) {
    throw new Error('Truncated or unbalanced JSON object output');
  }
}

async function pruneExpiredUploadsAndJobs(): Promise<void> {
  const now = Date.now();
  const cleanupTasks: Array<Promise<void>> = [];

  for (const [uploadId, entry] of pendingUploads.entries()) {
    // Prune strictly by inactivity (lastActivityAt), never createdAt, so slow mobile uploads never expire mid-transfer
    if (now - entry.lastActivityAt > PENDING_UPLOAD_TTL_MS) {
      cleanupTasks.push(disposePendingUpload(uploadId, entry, true));
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
      cleanupTasks.push(cleanupJobOutputFile(job));
    }
  }

  if (cleanupTasks.length > 0) {
    await Promise.all(cleanupTasks);
  }
}

export async function cleanupAllPendingUploadsAndJobs(): Promise<void> {
  for (const child of activeDecodeChildren) {
    try {
      child.kill('SIGKILL');
    } catch {
      // ignore
    }
  }
  activeDecodeChildren.clear();

  const tasks: Array<Promise<void>> = [];
  for (const [uploadId, entry] of pendingUploads.entries()) {
    tasks.push(disposePendingUpload(uploadId, entry, true));
  }
  for (const [jobId, job] of decodeJobs.entries()) {
    decodeJobs.delete(jobId);
    tasks.push(cleanupJobOutputFile(job));
  }
  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}

/**
 * Removes temp .fm uploads, checkpoint files, and decoded output files left behind
 * by a crash or an interrupted mobile upload. Only files older than
 * ORPHAN_SWEEP_MIN_AGE_MS are touched so a concurrent process's in-flight upload
 * is never deleted.
 */
export async function sweepOrphanedTempUploads(
  maxAgeMs: number = ORPHAN_SWEEP_MIN_AGE_MS
): Promise<number> {
  const tmpDir = path.resolve(os.tmpdir());
  const activePaths = new Set<string>();
  for (const entry of pendingUploads.values()) {
    activePaths.add(path.resolve(entry.filePath));
  }
  for (const job of decodeJobs.values()) {
    if (job.rawPayloadPath) {
      activePaths.add(path.resolve(job.rawPayloadPath));
    }
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
      if (
        !TMP_UPLOAD_FILE_RE.test(name) &&
        !TMP_CHECKPOINT_FILE_RE.test(name) &&
        !TMP_OUTPUT_FILE_RE.test(name)
      ) {
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
    autoTryLayout: boolean;
  }
): void {
  const job: DecodeJobEntry = {
    status: 'running',
    progress: 'Opening .fm save...',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    serverStageTimingsMs: {},
  };
  const jobStartedAt = job.createdAt;
  decodeJobs.set(jobId, job);

  const tmpBaseDir = path.resolve(os.tmpdir());
  const tmpCheckpointPath = path.resolve(tmpBaseDir, `fm27-cp-${jobId}.json`);
  const tmpOutputPath = path.resolve(tmpBaseDir, `fm27-out-${jobId}.json`);

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
  if (args.autoTryLayout) {
    cliArgs.push('--auto-try-layout');
  }

  const jobTempPaths = new Set<string>([
    tmpSavePath,
    tmpCheckpointPath,
    `${tmpCheckpointPath}.tmp`,
  ]);
  for (const p of jobTempPaths) {
    activeTempPaths.add(p);
  }
  activeTempPaths.add(tmpOutputPath);

  let cleanedUp = false;
  const cleanupTempInputs = () => {
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

  let outStream: fs.WriteStream | null = null;
  let outStreamClosed = false;
  let outStreamError: Error | null = null;
  let outStreamFinishPromise: Promise<void> = Promise.resolve();

  const cleanupOutputFile = () => {
    activeTempPaths.delete(tmpOutputPath);
    if (outStream && !outStreamClosed) {
      outStreamClosed = true;
      try {
        outStream.destroy();
      } catch {
        // ignore
      }
    }
    void fs.promises.unlink(tmpOutputPath).catch(() => {
      // ignore if already removed
    });
  };

  try {
    outStream = fs.createWriteStream(tmpOutputPath, { flags: 'w', mode: 0o600 });
    outStreamFinishPromise = new Promise<void>((resolve) => {
      outStream!.once('finish', () => {
        outStreamClosed = true;
        resolve();
      });
      outStream!.once('close', () => {
        outStreamClosed = true;
        resolve();
      });
      outStream!.once('error', (streamErr) => {
        outStreamError = streamErr;
        outStreamClosed = true;
        resolve();
      });
    });
  } catch (err: unknown) {
    cleanupTempInputs();
    cleanupOutputFile();
    job.status = 'error';
    job.error = mapNativeDecoderError(
      err instanceof Error ? err.message : String(err)
    );
    job.finishedAt = Date.now();
    job.updatedAt = job.finishedAt;
    return;
  }

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
    cleanupTempInputs();
    cleanupOutputFile();
    job.status = 'error';
    job.error = mapNativeDecoderError(
      err instanceof Error ? err.message : String(err)
    );
    job.finishedAt = Date.now();
    job.updatedAt = job.finishedAt;
    return;
  }

  activeDecodeChildren.add(child);
  job.serverStageTimingsMs = {
    ...job.serverStageTimingsMs,
    jobToSpawnMs: Date.now() - jobStartedAt,
  };

  let firstStdoutAt: number | null = null;
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
    job.checkpointPayloadJson = undefined;
    job.checkpointDelivered = true;
  };

  const finalizeError = (errMessage: string) => {
    if (settled) return;
    settled = true;
    activeDecodeChildren.delete(child);
    clearTimeout(timer);
    releaseJobBuffers();
    cleanupTempInputs();
    cleanupOutputFile();
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
    if (firstStdoutAt === null) {
      firstStdoutAt = Date.now();
      job.serverStageTimingsMs = {
        ...job.serverStageTimingsMs,
        spawnToFirstStdoutMs: firstStdoutAt - jobStartedAt,
      };
    }
    stdoutBytes += chunk.length;
    if (stdoutBytes > SERVER_DECODE_MAX_STDOUT_BYTES) {
      killChild();
      finalizeError('Decoded JSON output exceeded maximum allowed size.');
      return;
    }
    if (outStream && !outStreamClosed && !outStreamError) {
      const ok = outStream.write(chunk);
      if (!ok) {
        child.stdout?.pause();
        outStream.once('drain', () => {
          if (!settled) {
            child.stdout?.resume();
          }
        });
      }
    }
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
            const trimmedCp = rawCp.trim();
            if (!trimmedCp) return;
            // Validate JSON integrity transiently without pinning a parsed V8 object tree in RAM
            const validated = JSON.parse(trimmedCp) as unknown;
            if (!validated || typeof validated !== 'object' || Array.isArray(validated)) {
              return;
            }
            job.checkpointSeq = cpSeq;
            job.checkpointStage = stageName;
            job.checkpointPayloadJson = trimmedCp;
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
    activeDecodeChildren.delete(child);
    job.serverStageTimingsMs = {
      ...job.serverStageTimingsMs,
      jobToChildCloseMs: Date.now() - jobStartedAt,
      ...(firstStdoutAt !== null
        ? { trailingStdoutMs: Date.now() - firstStdoutAt }
        : {}),
    };
    if (stderrLineBuf.trim()) {
      stderrHistory.push(stderrLineBuf.trim());
    }
    if (settled) {
      releaseJobBuffers();
      cleanupTempInputs();
      cleanupOutputFile();
      return;
    }
    clearTimeout(timer);
    cleanupTempInputs();
    settled = true;
    job.checkpointPayloadJson = undefined;
    job.checkpointDelivered = true;

    // The hosting memory cgroup SIGKILLs the Python child when its limit is hit.
    // Surface that as a 507 so the client falls back to Pyodide/Fast Sync
    // immediately instead of polling to the timeout.
    const wasOomKilled = code === 137 || signal === 'SIGKILL';
    if (wasOomKilled) {
      cleanupOutputFile();
      job.status = 'error';
      job.progress = 'Server memory limit reached';
      job.errorCode = 'SERVER_OOM';
      job.httpStatus = 507;
      job.error =
        'The server ran out of memory while decoding this .fm save. Switching automatically to the local browser decoder; large saves use Fast Sync there to protect device memory.';
      job.finishedAt = Date.now();
      job.updatedAt = job.finishedAt;
      return;
    }

    if (code !== 0) {
      cleanupOutputFile();
      const combinedStderr = stderrHistory.join('\n').trim();
      job.status = 'error';
      job.error = mapNativeDecoderError(
        combinedStderr || `Native fm-save-mapper exited with code ${code}`
      );
      job.finishedAt = Date.now();
      job.updatedAt = job.finishedAt;
      return;
    }

    if (outStream && !outStreamClosed) {
      outStream.end();
    }

    void outStreamFinishPromise
      .then(async () => {
        if (outStreamError) {
          throw outStreamError;
        }
        if (stdoutBytes === 0) {
          cleanupOutputFile();
          job.status = 'error';
          job.error = 'Native Python decoder returned empty output.';
          return;
        }
        try {
          const validationStartedAt = Date.now();
          await validateJsonObjectFileStreaming(tmpOutputPath);
          job.serverStageTimingsMs = {
            ...job.serverStageTimingsMs,
            jsonValidateMs: Date.now() - validationStartedAt,
            jobToDoneMs: Date.now() - jobStartedAt,
          };
          // Guard against shutdown/eviction while validation was running
          if (!decodeJobs.has(jobId)) {
            cleanupOutputFile();
            return;
          }
          job.rawPayloadPath = tmpOutputPath;
          job.status = 'done';
          job.progress = 'Server Full Sync complete';
        } catch (parseErr: unknown) {
          cleanupOutputFile();
          job.status = 'error';
          job.error = `Failed to parse decoded save JSON: ${
            parseErr instanceof Error ? parseErr.message : String(parseErr)
          }`;
        }
      })
      .catch((streamErr: unknown) => {
        cleanupOutputFile();
        job.status = 'error';
        job.error = `Failed to finalize decoded save output: ${
          streamErr instanceof Error ? streamErr.message : String(streamErr)
        }`;
      })
      .finally(() => {
        job.finishedAt = Date.now();
        job.updatedAt = job.finishedAt;
      });
  });
}

export function createFmDecodeRouter(options?: {
  detectRuntime?: () => Promise<ServerPythonRuntime>;
  mapperPath?: string;
  autoTryLayout?: boolean;
}): express.Router {
  const router = express.Router();
  const autoTryLayout = options?.autoTryLayout === true;
  const resolveRuntime = options?.detectRuntime ?? detectServerPythonFmsave;
  const resolvedMapperPath =
    options?.mapperPath ?? path.resolve(process.cwd(), 'public', 'fm-save-mapper.py');

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
        const fh = await fs.promises.open(filePath, 'w+', 0o600);
        const now = Date.now();
        const supportsParallelChunks = expectedTotalBytes !== undefined;
        pendingUploads.set(uploadId, {
          filePath,
          fileHandle: fh,
          fileHandleOpening: null,
          inFlightWrites: 0,
          closing: false,
          closePromise: null,
          writeDrainResolvers: [],
          bytesReceived: 0,
          expectedTotalBytes,
          receivedChunks: supportsParallelChunks ? new Map<number, number>() : undefined,
          coveredRanges: [],
          createdAt: now,
          lastActivityAt: now,
        });
        return res.json({
          uploadId,
          supportsParallelChunks,
          holdTtlMs: PENDING_UPLOAD_TTL_MS,
        });
      } catch (err: unknown) {
        return res.status(500).json({
          error: `Failed to initialize save upload: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    }
  );

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
      if (!entry || entry.closing) {
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

      const rawLengthHeader = req.headers['x-fm-chunk-length'];
      if (rawLengthHeader !== undefined) {
        const lenStr = Array.isArray(rawLengthHeader)
          ? rawLengthHeader[0]
          : String(rawLengthHeader);
        if (!/^\d+$/.test(lenStr.trim())) {
          return res.status(400).json({
            error: 'Invalid x-fm-chunk-length header. Must be a positive integer.',
          });
        }
        const declaredLength = Number(lenStr.trim());
        if (declaredLength !== req.body.length) {
          return res.status(400).json({
            error: `Chunk byte length mismatch (declared ${declaredLength}, received ${req.body.length}). Please retry chunk.`,
          });
        }
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
        await disposePendingUpload(uploadId, entry, true);
        return res.status(413).json({
          error: `Total .fm save size (${attemptedMb} MB) exceeded the 1024 MB (1 GB) server upload limit.`,
        });
      }

      const otherPendingBytes = getTotalPendingUploadBytes(uploadId);
      if (otherPendingBytes + nextTotalBytes > MAX_TOTAL_PENDING_UPLOAD_BYTES) {
        await disposePendingUpload(uploadId, entry, true);
        return res.status(429).json({
          error:
            'Temporary upload storage limit reached on the server. Partial upload cleared — please try again in a moment.',
        });
      }

      try {
        const fh = await acquireUploadFileHandle(entry);
        if (!fh || entry.closing) {
          return res.status(404).json({
            error: 'Upload session was closed or expired before chunk write completed.',
          });
        }
        entry.inFlightWrites += 1;
        try {
          let bytesWritten = 0;
          while (bytesWritten < req.body.length) {
            const { bytesWritten: n } = await fh.write(
              req.body,
              bytesWritten,
              req.body.length - bytesWritten,
              writeOffset + bytesWritten
            );
            if (n <= 0) {
              throw new Error('Short write while persisting save chunk');
            }
            bytesWritten += n;
          }
        } finally {
          entry.inFlightWrites -= 1;
          if (entry.inFlightWrites === 0 && entry.writeDrainResolvers.length > 0) {
            const resolvers = entry.writeDrainResolvers.splice(0);
            for (const resolve of resolvers) resolve();
          }
        }

        if (entry.closing) {
          return res.status(404).json({
            error: 'Upload session was closed while chunk was in flight.',
          });
        }

        entry.coveredRanges = mergeByteRanges([
          ...entry.coveredRanges,
          { offset: writeOffset, length: req.body.length },
        ]);
        if (isParallelSession && entry.receivedChunks) {
          const prevLen = entry.receivedChunks.get(writeOffset) ?? 0;
          entry.receivedChunks.set(writeOffset, Math.max(prevLen, req.body.length));
          entry.bytesReceived = computeCoveredBytes(entry.coveredRanges);
        } else {
          entry.bytesReceived = computeCoveredBytes(entry.coveredRanges);
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

  router.get('/fm27/decode-save/upload/:uploadId/status', async (req, res) => {
    await pruneExpiredUploadsAndJobs();
    const uploadId =
      typeof req.params.uploadId === 'string' ? req.params.uploadId.trim() : '';
    if (!isValidUuid(uploadId)) {
      return res.status(400).json({ error: 'Invalid uploadId.' });
    }
    const entry = pendingUploads.get(uploadId);
    if (!entry || entry.closing) {
      return res.status(404).json({
        error: 'Upload session not found or expired.',
      });
    }
    const now = Date.now();
    // Refresh inactivity TTL when client checks status to resume
    entry.lastActivityAt = now;
    const supportsParallelChunks =
      entry.expectedTotalBytes !== undefined && entry.receivedChunks !== undefined;
    const receivedOffsets = entry.receivedChunks
      ? Array.from(entry.receivedChunks.keys()).sort((a, b) => a - b)
      : [];
    const receivedRanges =
      entry.coveredRanges.length > 0
        ? entry.coveredRanges.map((r) => ({ offset: r.offset, length: r.length }))
        : entry.bytesReceived > 0
          ? [{ offset: 0, length: entry.bytesReceived }]
          : [];
    return res.json({
      uploadId,
      bytesReceived: entry.bytesReceived,
      expectedTotalBytes: entry.expectedTotalBytes ?? null,
      supportsParallelChunks,
      receivedOffsets,
      receivedRanges,
      holdRemainingMs: Math.max(0, PENDING_UPLOAD_TTL_MS - (now - entry.lastActivityAt)),
      holdTtlMs: PENDING_UPLOAD_TTL_MS,
    });
  });

  router.delete('/fm27/decode-save/upload/:uploadId', async (req, res) => {
    const uploadId =
      typeof req.params.uploadId === 'string' ? req.params.uploadId.trim() : '';
    if (!isValidUuid(uploadId)) {
      return res.status(400).json({ error: 'Invalid uploadId.' });
    }
    const entry = pendingUploads.get(uploadId);
    if (entry) {
      await disposePendingUpload(uploadId, entry, true);
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
      if (!entry || entry.closing) {
        return res.status(404).json({
          error: 'Upload session not found, already finalized, or expired.',
        });
      }
      // Atomically claim the upload and wait for any in-flight chunk writes to drain & close FD
      pendingUploads.delete(uploadId);
      await closeUploadHandle(entry);

      if (entry.bytesReceived <= 0) {
        await fs.promises.unlink(entry.filePath).catch(() => {});
        return res.status(400).json({
          error: 'Uploaded .fm save is empty (0 bytes received).',
        });
      }
      if (
        entry.expectedTotalBytes !== undefined &&
        (entry.bytesReceived < entry.expectedTotalBytes ||
          !isContiguousRangeCovered(entry.coveredRanges, entry.expectedTotalBytes))
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
        // Evict oldest completed job if at capacity and unlink its output file if still on disk
        for (const [oldId, oldJob] of decodeJobs.entries()) {
          if (oldJob.status !== 'running') {
            decodeJobs.delete(oldId);
            await cleanupJobOutputFile(oldJob);
            break;
          }
        }
      }

      const displayFilename = sanitizeDisplayFilename(body.filename);
      const scope = normalizeServerScope(body.scope);
      const fastSync = normalizeServerFastSync(body.fastSync);
      const clubHint = sanitizeClubHint(body.clubHint);
      const jobId = crypto.randomUUID();

      startAsyncNativeFmDecodeJob(jobId, runtime.pythonBin, resolvedMapperPath, entry.filePath, {
        scope,
        fastSync,
        clubHint,
        displayFilename,
        autoTryLayout,
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
      const rawPayloadPath = job.rawPayloadPath;
      const rawPayloadJson = job.rawPayloadJson;
      const payload = job.payload;
      const progress = job.progress;
      const serverStageTimingsMs = job.serverStageTimingsMs ?? {};
      // Release job entry immediately upon delivery
      decodeJobs.delete(jobId);

      if (typeof rawPayloadPath === 'string') {
        let unlinked = false;
        const unlinkOut = () => {
          if (unlinked) return;
          unlinked = true;
          activeTempPaths.delete(rawPayloadPath);
          void fs.promises.unlink(rawPayloadPath).catch(() => {});
        };

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.write(`{"status":"done","progress":${JSON.stringify(progress)},"serverStageTimingsMs":${JSON.stringify(serverStageTimingsMs)},"payload":`);

        const readStream = fs.createReadStream(rawPayloadPath, {
          highWaterMark: 64 * 1024,
        });
        res.on('close', () => {
          readStream.destroy();
          unlinkOut();
        });
        readStream.on('error', () => {
          unlinkOut();
          if (!res.writableEnded) {
            res.destroy();
          }
        });
        readStream.on('end', () => {
          unlinkOut();
          if (!res.writableEnded) {
            res.end('}');
          }
        });
        readStream.pipe(res, { end: false });
        return;
      }

      if (typeof rawPayloadJson === 'string') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.send(
          `{"status":"done","progress":${JSON.stringify(progress)},"serverStageTimingsMs":${JSON.stringify(serverStageTimingsMs)},"payload":${rawPayloadJson}}`
        );
      }
      return res.json({
        status: 'done',
        progress,
        serverStageTimingsMs,
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

    if (job.checkpointPayloadJson && !job.checkpointDelivered) {
      const cpStage = job.checkpointStage || 'stage_2_club_core';
      const cpJson = job.checkpointPayloadJson;
      job.checkpointDelivered = true;
      job.checkpointPayloadJson = undefined;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.send(
        `{"status":"running","progress":${JSON.stringify(job.progress)},"checkpointStage":${JSON.stringify(cpStage)},"checkpointPayload":${cpJson}}`
      );
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
