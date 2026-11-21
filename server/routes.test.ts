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
});
