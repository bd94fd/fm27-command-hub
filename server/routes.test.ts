import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.ts';
import { loadServerConfig } from './config.ts';
import { AnalystTimeoutError, GeminiService } from './geminiService.ts';

async function startTestServer(app: Awaited<ReturnType<typeof createApp>>) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe('server routes & JSON 404', () => {
  let activeClose: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (activeClose) {
      await activeClose();
      activeClose = null;
    }
  });

  it('serves /api/health and strict JSON 404 for unmatched /api/* routes', async () => {
    const config = loadServerConfig({ GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv);
    const app = await createApp({ config, serveFrontend: false });
    const srv = await startTestServer(app);
    activeClose = srv.close;

    const healthRes = await fetch(`${srv.baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as Record<string, unknown>;
    assert.equal(healthJson.status, 'ok');
    assert.equal(healthJson.hasGeminiKey, true);
    assert.equal(healthJson.fallbackModel, 'gemini-3.5-flash-lite');

    const notFoundRes = await fetch(`${srv.baseUrl}/api/non-existent-endpoint`);
    assert.equal(notFoundRes.status, 404);
    assert.match(notFoundRes.headers.get('content-type') || '', /application\/json/i);
    const notFoundJson = (await notFoundRes.json()) as Record<string, unknown>;
    assert.match(String(notFoundJson.error), /API endpoint not found/i);
  });

  it('supports optional persona, Fast/Deep model selection, and returns JSON 504 on timeout', async () => {
    let capturedSystemInstruction = '';
    let capturedModel = '';
    let shouldTimeout = false;

    const config = loadServerConfig({ GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv);
    const geminiService = new GeminiService({
      config,
      clientFactory: () => ({
        models: {
          list: async () => ({
            models: [
              { name: 'models/gemini-3.5-flash-lite' },
              { name: 'models/gemini-3.5-flash' },
            ],
          }),
          generateContent: (async (req: {
            model: string;
            config?: { systemInstruction?: string };
          }) => {
            capturedModel = req.model;
            capturedSystemInstruction = req.config?.systemInstruction || '';
            if (shouldTimeout) {
              throw new AnalystTimeoutError(25_000);
            }
            return {
              get text() {
                return JSON.stringify({
                  screenDetected: 'Tactical Chat',
                  inGameDate: '12/08/2026',
                  analysisMarkdown: 'OK',
                  immediateClicks: ['Click 1'],
                  followUpQuestions: ['Q1'],
                  targetSheetTable: 'GENERAL_CHRONICLE',
                  chronicleTitle: 'Title',
                  chronicleOutcomeMetric: 'Metric',
                  docEventBulletBlock: '● Event',
                  sheetRowValues: ['1'],
                  isMatchResult: false,
                });
              },
            };
          }) as never,
        },
      }),
    });

    const app = await createApp({ config, geminiService, serveFrontend: false });
    const srv = await startTestServer(app);
    activeClose = srv.close;

    const okRes = await fetch(`${srv.baseUrl}/api/fm27/tactical-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Evaluate wage structure',
        persona: 'sporting_director',
        reasoningMode: 'fast_lite',
        clubName: 'KVV Zelzate',
      }),
    });
    assert.equal(okRes.status, 200);
    assert.equal(capturedModel, 'gemini-3.5-flash-lite');
    assert.match(capturedSystemInstruction, /Sporting Director/i);

    shouldTimeout = true;
    const timeoutRes = await fetch(`${srv.baseUrl}/api/fm27/tactical-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Slow prompt' }),
    });
    assert.equal(timeoutRes.status, 504);
    const timeoutJson = (await timeoutRes.json()) as Record<string, unknown>;
    assert.match(String(timeoutJson.error), /timed out/i);
  });

  it('enforces optional HUB_ACCESS_TOKEN when configured', async () => {
    const config = loadServerConfig({
      GEMINI_API_KEY: 'test-key',
      HUB_ACCESS_TOKEN: 'secret-token-123',
    } as NodeJS.ProcessEnv);
    const app = await createApp({ config, serveFrontend: false });
    const srv = await startTestServer(app);
    activeClose = srv.close;

    const unauthRes = await fetch(`${srv.baseUrl}/api/fm27/tactical-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello' }),
    });
    assert.equal(unauthRes.status, 401);
  });

  it('serves POST /api/fm27/match-debrief with structured tactical debrief schema', async () => {
    const config = loadServerConfig({ GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv);
    const geminiService = new GeminiService({
      config,
      clientFactory: () => ({
        models: {
          list: async () => ({
            models: [{ name: 'models/gemini-3.5-flash-lite' }],
          }),
          generateContent: (async () => ({
            get text() {
              return JSON.stringify({
                headlineVerdict: 'Clinical 2-0 home win outperforming xG.',
                xgAndExecutionAudit: 'xG 1.84 vs 0.62 with 56% possession.',
                primaryTacticalFlaws: ['Left half-space transition gap after 65m.'],
                subOptimalRoleCombinations: ['Switch AML to Tracking Winger OOP.'],
                inGameAdjustmentRecommendations: ['Trigger 62m stamina double-sub.'],
              });
            },
          })) as never,
        },
      }),
    });

    const app = await createApp({ config, geminiService, serveFrontend: false });
    const srv = await startTestServer(app);
    activeClose = srv.close;

    const res = await fetch(`${srv.baseUrl}/api/fm27/match-debrief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clubName: 'KVV Zelzate',
        activeShape: '4-3-3 DM Wide',
        matchSummary: {
          opponent: 'KVK Ninove',
          result: 'W',
          score: '2 - 0',
          xGFor: 1.84,
          xGAgainst: 0.62,
        },
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.headlineVerdict, 'Clinical 2-0 home win outperforming xG.');
    assert.ok(Array.isArray(body.primaryTacticalFlaws));
  });

  it('compresses large JSON API payloads with gzip and configures smart static Cache-Control rules', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const zlib = await import('node:zlib');

    const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
    assert.match(serverSrc, /app\.use\(compression\(\)\)/);
    assert.match(serverSrc, /maxAge:\s*'1y'/);
    assert.match(serverSrc, /immutable:\s*true/);
    assert.match(serverSrc, /no-cache,\s*no-store,\s*must-revalidate/);

    const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    assert.match(appSrc, /const TacticalWarRoom = lazy\(/);
    assert.match(appSrc, /const StaffDirectory = lazy\(/);
    assert.match(appSrc, /const MatchLogArchive = lazy\(/);
    assert.match(appSrc, /const PlayerDetailModal = lazy\(/);
    assert.match(appSrc, /const StaffDetailModal = lazy\(/);

    const squadSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/SquadAnalyticsTable.tsx'),
      'utf8'
    );
    const recSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/RecruitmentWorkspace.tsx'),
      'utf8'
    );
    assert.match(squadSrc, /useDeferredValue\(search\)/);
    assert.match(recSrc, /useDeferredValue\(search\)/);

    const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    assert.doesNotMatch(indexHtml, /fonts\.googleapis\.com/);

    // Verify live HTTP gzip response compression on large JSON payload
    const config = loadServerConfig({ GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv);
    const largeText = 'Tactical analysis block. '.repeat(200);
    const geminiService = new GeminiService({
      config,
      clientFactory: () => ({
        models: {
          list: async () => ({
            models: [{ name: 'models/gemini-3.5-flash-lite' }],
          }),
          generateContent: (async () => ({
            get text() {
              return JSON.stringify({
                headlineVerdict: largeText,
                xgAndExecutionAudit: largeText,
                primaryTacticalFlaws: [largeText],
                subOptimalRoleCombinations: [largeText],
                inGameAdjustmentRecommendations: [largeText],
              });
            },
          })) as never,
        },
      }),
    });

    const app = await createApp({ config, geminiService, serveFrontend: false });
    const srv = await startTestServer(app);
    activeClose = srv.close;

    const url = new URL(`${srv.baseUrl}/api/fm27/match-debrief`);
    const compressedEncoding = await new Promise<string | undefined>((resolve, reject) => {
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip',
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            try {
              const raw = Buffer.concat(chunks);
              if (res.headers['content-encoding'] === 'gzip') {
                const unzipped = zlib.gunzipSync(raw).toString('utf8');
                const parsed = JSON.parse(unzipped) as { headlineVerdict?: string };
                assert.equal(parsed.headlineVerdict, largeText);
              }
              resolve(res.headers['content-encoding']);
            } catch (err) {
              reject(err);
            }
          });
        }
      );
      req.on('error', reject);
      req.write(
        JSON.stringify({
          clubName: 'KVV Zelzate',
          activeShape: '4-3-3 DM Wide',
          matchSummary: {
            opponent: 'KVK Ninove',
            result: 'W',
            score: '2 - 0',
          },
        })
      );
      req.end();
    });

    assert.equal(compressedEncoding, 'gzip');
  });

  it('configures Pack 2 (Offline PWA, Screen Wake Lock, Command Palette, Virtua 500-target scroller) and Pack 3 (Multi-Stage Docker, Helmet, Graceful Shutdown, Error Boundary, Rate-Limiter Pruning)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    // Pack 2 checks
    const viteConfigSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'vite.config.ts'),
      'utf8'
    );
    assert.match(viteConfigSrc, /VitePWA\(/);
    assert.match(viteConfigSrc, /navigateFallbackDenylist:\s*\[\s*\/\^\\\/api\\\/\/\s*\]/);

    const companionSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/MatchdayCompanionView.tsx'),
      'utf8'
    );
    assert.match(companionSrc, /wakeLock\.request\('screen'\)/);
    assert.match(companionSrc, /Keep Screen Awake/);

    const cmdPaletteSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/CommandPaletteModal.tsx'),
      'utf8'
    );
    assert.match(cmdPaletteSrc, /Quick-Jump Command Palette/);
    assert.match(cmdPaletteSrc, /Shortcut: ⌘K \/ Ctrl\+K/);

    const recSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/RecruitmentWorkspace.tsx'),
      'utf8'
    );
    assert.match(recSrc, /import \{ VList \} from 'virtua'/);
    assert.match(recSrc, /<VList/);

    // Pack 3 checks
    const dockerfileSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'Dockerfile'),
      'utf8'
    );
    assert.match(dockerfileSrc, /AS builder/);
    assert.match(dockerfileSrc, /AS runtime/);
    assert.match(dockerfileSrc, /USER node/);

    const dockerignoreSrc = fs.readFileSync(
      path.resolve(process.cwd(), '.dockerignore'),
      'utf8'
    );
    assert.match(dockerignoreSrc, /src\/\*\*\/\*\.test\.ts/);
    assert.match(dockerignoreSrc, /\.github/);

    const errorBoundarySrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/AppErrorBoundary.tsx'),
      'utf8'
    );
    assert.match(errorBoundarySrc, /getDerivedStateFromError/);
    assert.match(errorBoundarySrc, /Reset Local Cache/);

    const guardSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'server/middleware/securityGuard.ts'),
      'utf8'
    );
    assert.match(guardSrc, /pruneStaleIps/);

    const serverSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'server.ts'),
      'utf8'
    );
    assert.match(serverSrc, /app\.set\('trust proxy',\s*1\)/);
    assert.match(serverSrc, /helmet\(/);
    assert.match(serverSrc, /process\.on\('SIGTERM'/);

    // Live HTTP verification of Helmet security headers
    const config = loadServerConfig({ GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv);
    const app = await createApp({ config, serveFrontend: false });
    const srv = await startTestServer(app);
    activeClose = srv.close;

    const healthRes = await fetch(`${srv.baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthRes.headers.get('x-powered-by'), null);
  });

  it('supports parallel out-of-order chunk uploads on /api/fm27/decode-save when totalBytes is provided and preserves legacy sequential 409 enforcement', async () => {
    const expressMod = await import('express');
    const { createFmDecodeRouter } = await import('./routes/fmDecodeRoutes.ts');
    const app = expressMod.default();
    app.use(expressMod.default.json());
    app.use(
      '/api',
      createFmDecodeRouter({
        detectRuntime: async () => ({
          available: true,
          pythonBin: 'python3',
          pythonVersion: '3.14.0',
          fmsaveVersion: '0.14.3',
          checkedAtMs: Date.now(),
        }),
      })
    );
    const srv = await startTestServer(app as Awaited<ReturnType<typeof createApp>>);
    activeClose = srv.close;

    // 1. Parallel session: init with totalBytes -> accepts out-of-order concurrent chunks & duplicate retry
    const initParallel = await fetch(`${srv.baseUrl}/api/fm27/decode-save/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalBytes: 12 }),
    });
    assert.equal(initParallel.status, 200);
    const parallelBody = (await initParallel.json()) as {
      uploadId: string;
      supportsParallelChunks: boolean;
    };
    assert.ok(parallelBody.uploadId);
    assert.equal(parallelBody.supportsParallelChunks, true);

    // Send chunk 2 (offset 8) BEFORE chunk 0 (offset 0) and chunk 1 (offset 4) concurrently
    const [r2, r0, r1] = await Promise.all([
      fetch(`${srv.baseUrl}/api/fm27/decode-save/chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-fm-upload-id': parallelBody.uploadId,
          'x-fm-chunk-offset': '8',
        },
        body: Buffer.from('IJKL'),
      }),
      fetch(`${srv.baseUrl}/api/fm27/decode-save/chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-fm-upload-id': parallelBody.uploadId,
          'x-fm-chunk-offset': '0',
        },
        body: Buffer.from('ABCD'),
      }),
      fetch(`${srv.baseUrl}/api/fm27/decode-save/chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-fm-upload-id': parallelBody.uploadId,
          'x-fm-chunk-offset': '4',
        },
        body: Buffer.from('EFGH'),
      }),
    ]);
    assert.equal(r0.status, 200);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);

    // Duplicate idempotent retry at offset 4 must keep bytesReceived === 12
    const rDup = await fetch(`${srv.baseUrl}/api/fm27/decode-save/chunk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-fm-upload-id': parallelBody.uploadId,
        'x-fm-chunk-offset': '4',
      },
      body: Buffer.from('EFGH'),
    });
    assert.equal(rDup.status, 200);
    const dupBody = (await rDup.json()) as { bytesReceived: number };
    assert.equal(dupBody.bytesReceived, 12);

    // Clean up parallel upload temp file
    const delParallel = await fetch(
      `${srv.baseUrl}/api/fm27/decode-save/upload/${parallelBody.uploadId}`,
      { method: 'DELETE' }
    );
    assert.equal(delParallel.status, 200);

    // 2. Legacy sequential session: init without totalBytes -> enforces 409 on out-of-order chunk
    const initSeq = await fetch(`${srv.baseUrl}/api/fm27/decode-save/init`, {
      method: 'POST',
    });
    assert.equal(initSeq.status, 200);
    const seqBody = (await initSeq.json()) as {
      uploadId: string;
      supportsParallelChunks: boolean;
    };
    assert.equal(seqBody.supportsParallelChunks, false);

    const outOfOrderRes = await fetch(`${srv.baseUrl}/api/fm27/decode-save/chunk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-fm-upload-id': seqBody.uploadId,
        'x-fm-chunk-offset': '4',
      },
      body: Buffer.from('EFGH'),
    });
    assert.equal(outOfOrderRes.status, 409);

    await fetch(`${srv.baseUrl}/api/fm27/decode-save/upload/${seqBody.uploadId}`, {
      method: 'DELETE',
    });
  });
});


