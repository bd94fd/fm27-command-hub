import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

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

const ANALYST_TIMEOUT_MS = 25_000;

const RETIRED_MODEL_PATTERN = /^(?:models\/)?gemini-(?:1\.5|2\.0|2\.5|3\.8)-/i;

function isRetiredGeminiModel(model: string): boolean {
  const trimmed = model.trim();
  if (!trimmed) return true;
  return RETIRED_MODEL_PATTERN.test(trimmed);
}

function resolveActiveModel(envVal: string | undefined, fallback: string): string {
  const trimmed = (envVal || '').trim();
  if (!trimmed || isRetiredGeminiModel(trimmed)) return fallback;
  return trimmed;
}

const FAST_GEMINI_MODEL = resolveActiveModel(
  process.env.GEMINI_FAST_MODEL,
  'gemini-3.5-flash-lite'
);
const DEFAULT_GEMINI_MODEL = resolveActiveModel(
  process.env.GEMINI_MODEL,
  'gemini-3.5-flash'
);

const MODEL_FALLBACK_CHAIN = ['gemini-3.5-flash-lite'];

class AnalystTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `The Tactical Analyst timed out after ${Math.round(timeoutMs / 1000)}s. Please try again with a shorter prompt.`
    );
    this.name = 'AnalystTimeoutError';
  }
}

function createGeminiClient(apiKey: string) {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateContentWithFallback(
  ai: GoogleGenAI,
  preferredModel: string,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>,
  timeoutMs = ANALYST_TIMEOUT_MS
) {
  const activePreferred = resolveActiveModel(preferredModel, FAST_GEMINI_MODEL);
  const candidates = Array.from(
    new Set([activePreferred, ...MODEL_FALLBACK_CHAIN])
  ).filter((m) => !isRetiredGeminiModel(m));
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  const isTransientOrMissing = (msg: string) =>
    /404|NOT_FOUND|no longer available|not found|503|UNAVAILABLE|high demand|overloaded|429|RESOURCE_EXHAUSTED/i.test(
      msg
    );

  const isTimeoutLike = (err: unknown) => {
    if (err instanceof AnalystTimeoutError) return true;
    if (err && typeof err === 'object') {
      const name = (err as { name?: string }).name || '';
      const msg = (err as { message?: string }).message || '';
      if (name === 'TimeoutError' || name === 'AbortError') return true;
      if (/aborted|timed out|timeout/i.test(msg)) return true;
    }
    return false;
  };

  for (const model of candidates) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 500) {
      throw new AnalystTimeoutError(timeoutMs);
    }

    const abortSignal = AbortSignal.timeout(remainingMs);
    let timerHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timerHandle = setTimeout(() => {
          reject(new AnalystTimeoutError(timeoutMs));
        }, remainingMs);
      });

      const baseConfig = (params.config || {}) as Record<string, unknown>;
      const callPromise = ai.models.generateContent({
        ...params,
        model,
        config: {
          ...baseConfig,
          abortSignal,
        },
      });

      return await Promise.race([callPromise, timeoutPromise]);
    } catch (err: unknown) {
      if (isTimeoutLike(err)) {
        throw new AnalystTimeoutError(timeoutMs);
      }
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!isTransientOrMissing(msg)) {
        throw err;
      }
    } finally {
      if (timerHandle) clearTimeout(timerHandle);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('No available Gemini model could complete the request.');
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: 'fm27-command-hub',
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      model: DEFAULT_GEMINI_MODEL,
      fastModel: FAST_GEMINI_MODEL,
      analystTimeoutMs: ANALYST_TIMEOUT_MS,
    });
  });

  app.get('/api/fm27/decode-status', async (_req, res) => {
    const runtime = await detectServerPythonFmsave();
    return res.json({
      serverDecodeAvailable: runtime.available,
      pythonVersion: runtime.pythonVersion,
      fmsaveVersion: runtime.fmsaveVersion,
    });
  });

  app.post('/api/fm27/decode-save/init', async (_req, res) => {
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

  app.post(
    '/api/fm27/decode-save/chunk',
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

  app.post('/api/fm27/decode-save/finish', async (req, res) => {
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

  app.get('/api/fm27/decode-save/job/:jobId', async (req, res) => {
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

  app.post('/api/fm27/analyze-screenshot', async (req, res) => {
    try {
      const { imageBase64, mimeType, notes, nextEventNumber, clubName } =
        req.body as {
          imageBase64?: string;
          mimeType?: string;
          notes?: string;
          nextEventNumber?: number;
          clubName?: string;
        };

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error:
            'GEMINI_API_KEY is missing. Set GEMINI_API_KEY in your .env file or cloud environment variables.',
        });
      }

      const ai = createGeminiClient(process.env.GEMINI_API_KEY);

      const eventNum = nextEventNumber || 1;
      const targetClub = clubName || 'the managed club';

      const systemPrompt = `You are Bobby Dean's Football Manager 27 Chief Tactical Analyst for ${targetClub} (Patch 27.1.0 Playbook v2.0).
Key Playbook v2.0 Rules:
- Primary System: Dual-Phase 4-3-3 Counter Positive (Balanced Ground Build-Up, Short/Mixed GK Distribution, Standard Passing, Tracking Wingers OOP on both flanks to prevent 2v1 full-back overlaps).
- Non-Negotiable Guardrails:
  1) Never sub off both starting CBs simultaneously when protecting a lead.
  2) Batch all 5 substitutions into at most 2 second-half windows (62m and 75m+, plus optional HT free stoppage) so 3 stoppages are never burned early.
  3) Keep 3 midfielders on the pitch late (never pull DM for a 4-2-4; use Play With More Urgency + Swap Wings instead).
  4) NEVER invent, fabricate, or guess any player stats, match xG, scores, wages, or dates not visible in the screenshot or user notes.
  5) NEVER cite or mention raw numeric CA/PA values—use relative star ratings and FM27 engine metrics only. Never use retired FM24 roles (Mezzala, Enganche, Trequartista, etc.) or legacy Defend/Support/Attack duties.
- Analyze the uploaded FM27 screenshot or match notes and output structured JSON ready for Event #${eventNum}.`;

      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (imageBase64 && mimeType) {
        parts.push({
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        });
      }

      parts.push({
        text: `Analyze this FM27 screen / match update for ${targetClub} (Event #${eventNum}). User notes: "${notes || 'Extract match statistics, xG, ratings, tactical audit, and generate ready-to-paste Google Docs & Google Sheets sync blocks.'}"`,
      });

      const response = await generateContentWithFallback(ai, DEFAULT_GEMINI_MODEL, {
        contents: { parts },
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              screenDetected: {
                type: Type.STRING,
                description: 'Detected FM27 screen type and in-game date',
              },
              inGameDate: {
                type: Type.STRING,
                description: 'In-game date in DD/MM/YYYY format',
              },
              competition: {
                type: Type.STRING,
                description: 'Competition and matchday',
              },
              opponent: {
                type: Type.STRING,
                description: 'Opponent club name',
              },
              venue: {
                type: Type.STRING,
                description: 'H for Home or A for Away',
              },
              result: {
                type: Type.STRING,
                description: 'W, D, or L from managed club perspective',
              },
              score: {
                type: Type.STRING,
                description: 'Scoreline from managed club perspective (e.g. 2 - 0)',
              },
              xGFor: {
                type: Type.NUMBER,
                description: 'Managed club expected goals if explicitly visible',
              },
              xGAgainst: {
                type: Type.NUMBER,
                description: 'Opponent expected goals if explicitly visible',
              },
              possession: {
                type: Type.NUMBER,
                description: 'Managed club possession percentage integer if visible',
              },
              passCompletion: {
                type: Type.NUMBER,
                description: 'Managed club pass completion percentage integer if visible',
              },
              shotsFor: {
                type: Type.STRING,
                description: 'Managed club shots (on target) string if visible',
              },
              shotsAgainst: {
                type: Type.STRING,
                description: 'Opponent shots (on target) string if visible',
              },
              cccFor: {
                type: Type.NUMBER,
                description: 'Managed club clear cut chances integer if visible',
              },
              cccAgainst: {
                type: Type.NUMBER,
                description: 'Opponent clear cut chances integer if visible',
              },
              goalTimeline: {
                type: Type.STRING,
                description: 'Minute-by-minute goal scorers and assists',
              },
              potm: {
                type: Type.STRING,
                description: 'Player of the Match name, rating, and key stats',
              },
              defensiveWatchpoints: {
                type: Type.STRING,
                description: 'Defensive unit ratings and tactical watchpoints',
              },
              headlineTitle: {
                type: Type.STRING,
                description: 'Match fixture or event title',
              },
              outcomeMetric: {
                type: Type.STRING,
                description: 'Result, scoreline, and xG summary',
              },
              executiveBullets: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3-4 sharp tactical & Data Hub insights',
              },
              recommendedClicks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 immediate in-game clicks before hitting Continue',
              },
              tacticalAuditSummary: {
                type: Type.STRING,
                description: '1-paragraph synthesis for Table 1G & Chronicles',
              },
            },
            required: [
              'screenDetected',
              'inGameDate',
              'headlineTitle',
              'outcomeMetric',
              'executiveBullets',
              'recommendedClicks',
              'tacticalAuditSummary',
            ],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return res.status(502).json({
          error: 'The Tactical Analyst returned malformed JSON. Please retry.',
        });
      }
      return res.json(parsed);
    } catch (error: unknown) {
      if (error instanceof AnalystTimeoutError) {
        return res.status(504).json({ error: error.message });
      }
      const errMessage =
        error instanceof Error ? error.message : 'Failed to analyze FM27 screen';
      return res.status(500).json({ error: errMessage });
    }
  });

  app.post('/api/fm27/tactical-chat', async (req, res) => {
    try {
      const {
        message,
        history,
        images,
        importedFileContext,
        liveAppContext,
        reasoningMode,
        nextEventNumber,
        currentSaveDate,
        clubName,
      } = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'assistant'; text: string }>;
        images?: Array<{ base64: string; mimeType: string; name?: string }>;
        importedFileContext?: string;
        liveAppContext?: string;
        reasoningMode?: 'deep_high' | 'max_xhigh' | 'fast_lite';
        nextEventNumber?: number;
        currentSaveDate?: string;
        clubName?: string;
      };

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error:
            'GEMINI_API_KEY is missing. Please verify your API key in Settings > Secrets.',
        });
      }

      const ai = createGeminiClient(process.env.GEMINI_API_KEY);

      const eventNum = nextEventNumber || 1;
      const targetClub =
        clubName && clubName !== '--' ? clubName : 'the manager’s club';

      const selectedModel =
        reasoningMode === 'fast_lite'
          ? FAST_GEMINI_MODEL
          : DEFAULT_GEMINI_MODEL;

      const systemPrompt = `You are Bobby Dean's interactive Football Manager 27 Chief Tactical Analyst, Match Engine Physicist & Master Sheet Co-Pilot for ${targetClub}.

STRICT FM27 ACCURACY & RATING POLICY:
- Always cross-check tactical, match-engine, training, set-piece, and SCR mechanics against the VERIFIED FM27 KNOWLEDGE BASE block included in the context.
- NEVER mention, reveal, or guess raw numeric CA or PA values (e.g. "CA 120 / PA 140"). Always use relative Star Ratings (e.g. 3.5★/4.5★), visible attributes, and FM27 Engine Metrics (Sprint Speed m/s, Aerial Jump Height, Physical Score /100).
- NEVER recommend retired FM24 roles (Mezzala, Enganche, Trequartista, Carrilero, Raumdeuter, Segundo Volante) or legacy Defend/Support/Attack duties. Always pair authentic FM27 In-Possession (IP) and Out-of-Possession (OOP) roles.
- **ALWAYS EXPLAIN "WHY" FOR EVERY RECOMMENDATION**: Whenever you recommend a Starting XI pick, lineup change, bench drop, IP/OOP role tweak, or substitution window, explicitly state **WHY** in plain, actionable terms—citing exact positional familiarity, key attributes (Pace, Stamina, Jumping Reach, Passing, Decisions), condition/fatigue, or the opponent's tactical weakness so the manager understands the reasoning behind every click.

YOUR CORE IDENTITY & CONVERSATIONAL INTELLIGENCE:
You are having an ongoing, multi-turn back-and-forth tactical working session with the manager.
1. **Deep FM27 Match Engine Mastery (Patch 27.1.0 & Playbook v2.0)**:
   - You understand how FM27's Dual-Phase In-Possession (IP) and Out-of-Possession (OOP) role pairs interact in every phase of play (build-up, progression, final-third creation, counter-press, high/mid block, and defensive transitions).
   - You know why **Tracking Winger (TW) OOP** on both AML and AMR stops 2v1 full-back overlaps (whereas Wide Outlet Winger OOP leaves flanks exposed), why **Balanced Ground Build-Up + Short/Mixed GK Distribution + Standard Passing Directness** prevents cheap turnover cascades, and how Patch 27.1.0 weights **Pace, Acceleration, Jumping Reach, Stamina, Anticipation, Decisions, Work Rate, and First Touch**.
   - You enforce Playbook v2.0's 5 Non-Negotiable Touchline & Periodisation Laws:
     * **The Golden Rule**: Change 1 structural variable at a time and observe 20–25 in-game minutes.
     * **Dual-CB 90m Continuity Lock**: Never substitute both starting Centre-Backs simultaneously when protecting a lead or parity.
     * **2-Window Substitution Script**: Batch all 5 subs into at most 2 second-half stoppages — Window 1 (60'–63') for your 2–3 lowest-Stamina non-CB starters, Window 2 (75'+) for 1–2 fresh closers (plus optional HT 45' free window).
     * **3-Man Midfield Zone 5 Guardrail**: Never pull the holding DM for a 4-2-4 when chasing late; keep 3 midfielders on the pitch and use Touchline Tweaks ("Play With More Urgency" + "Swap Wings") + Shout "Up Your Game".
     * **180-Minute Double-GW Stamina Cap & Post-Match Rest Law**: Keep standard outfielders <= 125 combined minutes across Wed/Sat double gameweeks and schedule a full Post-Match Rest day (cuts training injury roll from 13.8% to 4.0%).

2. **Context-Aware Multi-Turn Conversation & Memory**:
   - Always pay close attention to the **multi-turn conversation history** and the **LIVE IN-APP COMMAND HUB CONTEXT** provided below.
   - If the manager asks a follow-up question ("Why him over X?", "What if we face a 3-5-2 next?", "Who takes corners if he's benched?", "Switch him to Inside Forward IP and mark him as Starter", "How should we adjust at half-time if we're 0-1 down?"), directly answer their specific question first, referencing what you and the manager discussed in previous turns AND the live squad/fixture data in the app.
   - Do NOT repeat a generic boilerplate essay if the manager asked a targeted question—tailor your markdown headings, tactical reasoning, player comparisons, and 3 Immediate In-Game Clicks directly to the manager's message and the current context.
   - Whenever the manager asks to change a player's IP role, OOP role, starter/rotation status, rating, stats, or tactical note (or when a screenshot/message reveals new player ratings, goals, assists, minutes, or roles), populate \`playerUpdates\` so the in-app Squad Database and War Room update automatically!

3. **Strict Anti-Fabrication Rule (Zero Made-Up Data)**:
   - NEVER invent, guess, or fabricate any player names, player stats, match xG, possession percentages, scores, wages, or dates that are not present in the live in-app context, newly imported file, screenshot, or conversation history.
   - If no .fm save has been imported yet (0 players in the live context), answer the manager's FM27 tactical or match-engine question thoroughly using Playbook v2.0 & Patch 27.1.0 principles without inventing fake squad members.

${liveAppContext ? `\n${liveAppContext}\n` : ''}`;

      const contents: Array<{
        role: 'user' | 'model';
        parts: Array<
          | { text: string }
          | { inlineData: { mimeType: string; data: string } }
        >;
      }> = [];

      if (Array.isArray(history) && history.length > 0) {
        for (const h of history.slice(-14)) {
          if (!h.text || !h.text.trim()) continue;
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }],
          });
        }
      }

      const currentTurnParts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (importedFileContext && importedFileContext.trim().length > 0) {
        currentTurnParts.push({
          text: `NEWLY ATTACHED / IMPORTED FM27 SAVE OR EXPORT PAYLOAD ON THIS TURN:\n${importedFileContext}`,
        });
      }

      if (Array.isArray(images)) {
        for (const img of images) {
          if (img.base64 && img.mimeType) {
            currentTurnParts.push({
              inlineData: {
                mimeType: img.mimeType,
                data: img.base64,
              },
            });
          }
        }
      }

      currentTurnParts.push({
        text: `Manager's Current Message / Tactical Question / Submission (Current In-Game Date: ${currentSaveDate || '--'} | Next Chronicle Event #${eventNum}):\n${
          message ||
          'Analyze the attached FM27 save / file(s) / screenshot(s) against Bobby Dean Playbook v2.0, update everything possible, and produce a complete tactical & squad plan from the current in-game date.'
        }`,
      });

      contents.push({
        role: 'user',
        parts: currentTurnParts,
      });

      const response = await generateContentWithFallback(
        ai,
        selectedModel,
        {
          contents,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              screenDetected: {
                type: Type.STRING,
                description:
                  'Concise label of what you analyzed on this turn (e.g. "Tactical Follow-Up: Flank Overload & Role Pairing", "Live .fm Save Full Club Audit", "Data Hub Match Report", etc.)',
              },
              inGameDate: {
                type: Type.STRING,
                description: 'In-game date in DD/MM/YYYY format (or "--" if not yet loaded)',
              },
              analysisMarkdown: {
                type: Type.STRING,
                description:
                  'Clever, context-aware Markdown response directly answering the manager’s question or auditing the save/screenshot using FM27 Patch 27.1.0 physics, Dual-Phase IP/OOP mechanics, Playbook v2.0 rules, and the live squad/fixture data without fabricating any missing numbers.',
              },
              immediateClicks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '3 concrete, numbered in-game clicks/actions tailored to this exact turn',
              },
              followUpQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '3 smart, context-aware follow-up questions or tactical scenarios the manager can click next to continue this conversation',
              },
              targetSheetTable: {
                type: Type.STRING,
                description:
                  'Which Master Sheet table this update belongs to: TABLE_1G_MATCH_LOG, TABLE_1H_SCOUTING, TABLE_1I_TACTICAL_AUDIT, or GENERAL_CHRONICLE',
              },
              chronicleTitle: {
                type: Type.STRING,
                description: 'Title for Event # in Master Doc & Tab 10 Chronicles',
              },
              chronicleOutcomeMetric: {
                type: Type.STRING,
                description: 'Headline result, metric, or tactical decision summary for Chronicles',
              },
              docEventBulletBlock: {
                type: Type.STRING,
                description:
                  'Ready-to-insert flat bullet block (using ● and -) for Event # in Section 5 of the Master Google Doc above [INSERT NEXT CHRONOLOGICAL EVENT HERE]',
              },
              sheetRowValues: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '6 or 7 column values matching the detected Master Sheet table row ready to append directly to Google Sheets',
              },
              isMatchResult: {
                type: Type.BOOLEAN,
                description:
                  'True ONLY if this submission reports a newly completed match result not already in the Match Log',
              },
              matchFields: {
                type: Type.OBJECT,
                properties: {
                  competition: { type: Type.STRING },
                  opponent: { type: Type.STRING },
                  venue: { type: Type.STRING },
                  result: { type: Type.STRING },
                  score: { type: Type.STRING },
                  xGFor: { type: Type.NUMBER },
                  xGAgainst: { type: Type.NUMBER },
                  possession: { type: Type.NUMBER },
                  passCompletion: { type: Type.NUMBER },
                  shotsFor: { type: Type.STRING },
                  shotsAgainst: { type: Type.STRING },
                  cccFor: { type: Type.NUMBER },
                  cccAgainst: { type: Type.NUMBER },
                  goalTimeline: { type: Type.STRING },
                  potm: { type: Type.STRING },
                  defensiveWatchpoints: { type: Type.STRING },
                  tacticalAudit: { type: Type.STRING },
                },
              },
              playerUpdates: {
                type: Type.ARRAY,
                description:
                  'Any squad player IP/OOP role changes, status changes (Starter/Rotation/Youth/Injured), rating, goals, assists, minutes, condition, or tactical note updates agreed upon in this chat turn or extracted from a screenshot',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: {
                      type: Type.STRING,
                      description: 'Exact player name from the squad',
                    },
                    ipRole: {
                      type: Type.STRING,
                      description: 'Updated In-Possession (IP) role if changed or recommended',
                    },
                    oopRole: {
                      type: Type.STRING,
                      description: 'Updated Out-of-Possession (OOP) role if changed or recommended',
                    },
                    status: {
                      type: Type.STRING,
                      description: 'Updated squad status if changed: Starter, Rotation, Youth, or Injured',
                    },
                    condition: {
                      type: Type.NUMBER,
                      description: 'Updated condition percentage (1-100) if explicitly reported',
                    },
                    rating: {
                      type: Type.NUMBER,
                      description: 'Updated or latest match rating if explicitly shown',
                    },
                    goalsAdded: {
                      type: Type.NUMBER,
                      description: 'Goals scored in a new match to add to total',
                    },
                    assistsAdded: {
                      type: Type.NUMBER,
                      description: 'Assists in a new match to add to total',
                    },
                    minutesAdded: {
                      type: Type.NUMBER,
                      description: 'Minutes played in a new match to add to total',
                    },
                    notes: {
                      type: Type.STRING,
                      description: 'Updated tactical, role, scouting, mentoring, or medical report note for this player',
                    },
                  },
                  required: ['name', 'notes'],
                },
              },
            },
            required: [
              'screenDetected',
              'inGameDate',
              'analysisMarkdown',
              'immediateClicks',
              'followUpQuestions',
              'targetSheetTable',
              'chronicleTitle',
              'chronicleOutcomeMetric',
              'docEventBulletBlock',
              'sheetRowValues',
              'isMatchResult',
            ],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return res.status(502).json({
          error: 'The Tactical Analyst returned malformed JSON. Please retry.',
        });
      }
      return res.json(parsed);
    } catch (error: unknown) {
      if (error instanceof AnalystTimeoutError) {
        return res.status(504).json({ error: error.message });
      }
      const errMessage =
        error instanceof Error
          ? error.message
          : 'Failed to run FM27 Tactical Analyst chat';
      return res.status(500).json({ error: errMessage });
    }
  });

  // Strict JSON 404 handler for any unmatched /api/* route BEFORE Vite/SPA HTML fallback
  app.all('/api/*', (req, res) => {
    return res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.path}`,
    });
  });

  app.use(
    (
      err: { type?: string; status?: number; name?: string; message?: string },
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (
        err &&
        (err.type === 'entity.too.large' ||
          err.status === 413 ||
          err.name === 'PayloadTooLargeError')
      ) {
        return res.status(413).json({
          error:
            'Request payload was too large (upload chunks are limited to 8 MB each; total .fm save limit is 1024 MB / 1 GB; attached screenshots are automatically compressed).',
        });
      }
      if (req.path.startsWith('/api/')) {
        const status =
          typeof err?.status === 'number' && err.status >= 400 && err.status < 600
            ? err.status
            : 500;
        return res.status(status).json({
          error: err?.message || 'Unexpected server API error.',
        });
      }
      return next(err);
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FM27 Command Hub running on http://localhost:${PORT}`);
  });
}

startServer();
