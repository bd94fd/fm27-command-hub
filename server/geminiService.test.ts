import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadServerConfig } from './config.ts';
import {
  AnalystTimeoutError,
  DEEP_MODEL_ID,
  FAST_MODEL_ID,
  GeminiService,
  MODEL_DISCOVERY_TTL_MS,
  isRetiredGeminiModel,
} from './geminiService.ts';

describe('server/config', () => {
  it('reads GEMINI_API_KEY strictly with zero VITE_GEMINI_API_KEY fallback', () => {
    const cfg = loadServerConfig({
      VITE_GEMINI_API_KEY: 'should-never-be-used',
    } as NodeJS.ProcessEnv);

    assert.equal(cfg.geminiApiKey, '');
    assert.equal(cfg.fallbackModel, 'gemini-3.5-flash-lite');
    assert.deepEqual(cfg.preferredModels, [
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
    ]);
    assert.equal(cfg.aiTimeoutMs, 45_000);
    assert.equal(cfg.deepAiTimeoutMs, 60_000);
  });

  it('respects GEMINI_API_KEY and optional GEMINI_MODEL override', () => {
    const cfg = loadServerConfig({
      GEMINI_API_KEY: 'server-secret-key',
      GEMINI_MODEL: 'gemini-3.5-flash',
    } as NodeJS.ProcessEnv);

    assert.equal(cfg.geminiApiKey, 'server-secret-key');
    assert.equal(cfg.geminiModelOverride, 'gemini-3.5-flash');
  });
});

describe('server/geminiService', () => {
  it('filters out retired gemini-1.*, gemini-2.0, and gemini-2.5 prefixes', () => {
    assert.equal(isRetiredGeminiModel('gemini-1.0-pro'), true);
    assert.equal(isRetiredGeminiModel('gemini-1.5-pro'), true);
    assert.equal(isRetiredGeminiModel('models/gemini-2.0-flash'), true);
    assert.equal(isRetiredGeminiModel('gemini-2.5-flash'), true);
    assert.equal(isRetiredGeminiModel('gemini-2.5-pro'), true);
    assert.equal(isRetiredGeminiModel('gemini-3.5-flash-lite'), false);
    assert.equal(isRetiredGeminiModel('gemini-3.5-flash'), false);
  });

  it('caches discovered models for 5 minutes and refreshes after TTL expires', async () => {
    let currentTime = 1_000_000;
    let listCallCount = 0;

    const service = new GeminiService({
      config: loadServerConfig({ GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv),
      now: () => currentTime,
      clientFactory: () => ({
        models: {
          list: async () => {
            listCallCount += 1;
            return {
              models: [
                { name: 'models/gemini-1.5-flash' },
                { name: 'models/gemini-2.0-flash' },
                { name: 'models/gemini-2.5-pro' },
                { name: 'models/gemini-3.5-flash-lite' },
                { name: 'models/gemini-3.5-flash' },
              ],
            };
          },
          generateContent: (async () => ({ text: '{}' })) as never,
        },
      }),
    });

    const first = await service.discoverModels();
    assert.deepEqual(first, ['gemini-3.5-flash-lite', 'gemini-3.5-flash']);
    assert.equal(listCallCount, 1);

    // Within 5-minute TTL -> served from cache
    currentTime += MODEL_DISCOVERY_TTL_MS - 1_000;
    const cached = await service.discoverModels();
    assert.deepEqual(cached, ['gemini-3.5-flash-lite', 'gemini-3.5-flash']);
    assert.equal(listCallCount, 1);

    // Past 5-minute TTL -> re-fetched
    currentTime += 2_000;
    await service.discoverModels();
    assert.equal(listCallCount, 2);
  });

  it('respects Fast (gemini-3.5-flash-lite) vs. Deep (gemini-3.5-flash) client preference', async () => {
    const service = new GeminiService({
      config: loadServerConfig({ GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv),
      clientFactory: () => ({
        models: {
          list: async () => ({
            models: [
              { name: 'models/gemini-3.5-flash-lite' },
              { name: 'models/gemini-3.5-flash' },
            ],
          }),
          generateContent: (async () => ({ text: '{}' })) as never,
        },
      }),
    });

    const fastModel = await service.resolveModel({ reasoningMode: 'fast_lite' });
    const deepModel = await service.resolveModel({ reasoningMode: 'deep_high' });
    const maxModel = await service.resolveModel({ reasoningMode: 'max_xhigh' });

    assert.equal(fastModel, FAST_MODEL_ID);
    assert.equal(deepModel, DEEP_MODEL_ID);
    assert.equal(maxModel, DEEP_MODEL_ID);
  });

  it('performs a single automatic 404 retry fallback to gemini-3.5-flash-lite', async () => {
    const calledModels: string[] = [];

    const service = new GeminiService({
      config: loadServerConfig({ GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv),
      clientFactory: () => ({
        models: {
          list: async () => ({
            models: [{ name: 'models/gemini-3.5-flash' }],
          }),
          generateContent: (async (req: { model: string }) => {
            calledModels.push(req.model);
            if (req.model === 'gemini-3.5-flash') {
              const err = new Error('404 NOT_FOUND: model not found');
              (err as { status?: number }).status = 404;
              throw err;
            }
            return { text: '{"ok":true}' };
          }) as never,
        },
      }),
    });

    const res = await service.generateContent(
      { contents: 'Hello' },
      { reasoningMode: 'deep_high' }
    );
    assert.equal(res.text, '{"ok":true}');
    assert.deepEqual(calledModels, ['gemini-3.5-flash', 'gemini-3.5-flash-lite']);
  });

  it('throws AnalystTimeoutError when request exceeds timeoutMs', async () => {
    const service = new GeminiService({
      config: loadServerConfig({ GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv),
      clientFactory: () => ({
        models: {
          list: async () => ({ models: [{ name: 'models/gemini-3.5-flash-lite' }] }),
          generateContent: (async () => {
            await new Promise((resolve) => setTimeout(resolve, 2_000));
            return { text: '{}' };
          }) as never,
        },
      }),
    });

    await assert.rejects(
      () =>
        service.generateContent(
          { contents: 'Slow call' },
          { reasoningMode: 'fast_lite', timeoutMs: 600 }
        ),
      AnalystTimeoutError
    );
  });

  it('retries 503/429 up to 2 times with 1.5s/3s backoff and fails over between gemini-3.5-flash and gemini-3.5-flash-lite', async () => {
    const calledModels: string[] = [];
    const sleepDelays: number[] = [];
    const service = new GeminiService({
      config: loadServerConfig({ GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv),
      sleep: async (ms: number) => {
        sleepDelays.push(ms);
      },
      clientFactory: () => ({
        models: {
          list: async () => ({
            models: [
              { name: 'models/gemini-3.5-flash' },
              { name: 'models/gemini-3.5-flash-lite' },
            ],
          }),
          generateContent: (async (params: { model: string }) => {
            calledModels.push(params.model);
            if (params.model === 'gemini-3.5-flash') {
              const err = new Error(
                '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}'
              ) as Error & { status?: number };
              err.status = 503;
              throw err;
            }
            return { text: '{"ok":true,"failover":true}' };
          }) as never,
        },
      }),
    });

    const res = await service.generateContent(
      { contents: 'Tactical check' },
      { reasoningMode: 'deep_high' }
    );
    assert.equal(res.text, '{"ok":true,"failover":true}');
    assert.deepEqual(calledModels, [
      'gemini-3.5-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
    ]);
    assert.deepEqual(sleepDelays, [1500, 3000]);
  });

  it('automatically fails over to gemini-3.5-flash-lite when Deep Analyst times out with remaining budget', async () => {
    const calledModels: string[] = [];
    let fakeNow = 10_000;

    const service = new GeminiService({
      config: loadServerConfig({ GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv),
      now: () => fakeNow,
      clientFactory: () => ({
        models: {
          list: async () => ({
            models: [
              { name: 'models/gemini-3.5-flash' },
              { name: 'models/gemini-3.5-flash-lite' },
            ],
          }),
          generateContent: (async (params: { model: string }) => {
            calledModels.push(params.model);
            if (params.model === 'gemini-3.5-flash') {
              fakeNow += 40_000;
              const err = new Error('The operation was aborted due to timeout');
              err.name = 'TimeoutError';
              throw err;
            }
            return { text: '{"ok":true,"timeoutFailover":true}' };
          }) as never,
        },
      }),
    });

    const res = await service.generateContent(
      { contents: 'Squad & Wage Audit' },
      { reasoningMode: 'deep_high' }
    );
    assert.equal(res.text, '{"ok":true,"timeoutFailover":true}');
    assert.deepEqual(calledModels, [
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
    ]);
  });
});
