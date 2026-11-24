import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  extractStructuredJsonObject,
  normalizeTacticalChatHistory,
} from './jsonExtractor.ts';
import {
  AnalystTimeoutError,
  DEEP_MODEL_ID,
  FAST_MODEL_ID,
  GeminiService,
} from './geminiService.ts';
import { loadServerConfig } from './config.ts';
import { createFm27Router } from './routes/fm27Routes.ts';

async function startTestServer(app: express.Express) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  };
}

describe('Phase 5: Resilient structured JSON extraction & chat alternation', () => {
  it('unwraps clean JSON, BOM, markdown fences, prose wrappers, trailing commas, and raw string newlines', () => {
    // 1. Direct JSON + BOM
    const direct = extractStructuredJsonObject('\uFEFF {"analysisMarkdown":"Clean reply","ok":true}');
    assert.equal(direct.ok, true);
    if (direct.ok) {
      assert.equal(direct.strategy, 'direct');
      assert.equal(direct.value.analysisMarkdown, 'Clean reply');
    }

    // 2. Markdown ```json fence with prose wrapper
    const fenced = extractStructuredJsonObject(
      'Here is your FM27 tactical briefing:\n\n```json\n{"headlineVerdict":"Strong press","primaryTacticalFlaws":["Wide gap"]}\n```\n\nLet me know if you want another look.'
    );
    assert.equal(fenced.ok, true);
    if (fenced.ok) {
      assert.equal(fenced.strategy, 'fenced');
      assert.equal(fenced.value.headlineVerdict, 'Strong press');
    }

    // 3. Prose wrapper without fences + braces inside string + stray {note} in preamble
    const prose = extractStructuredJsonObject(
      'Note {summary}: below is the payload {"screenDetected":"Match Review","analysisMarkdown":"Use {4-3-3} with \\"Tracking Winger\\" OOP"} — end of transmission.'
    );
    assert.equal(prose.ok, true);
    if (prose.ok) {
      assert.equal(prose.strategy, 'balanced_braces');
      assert.equal(prose.value.screenDetected, 'Match Review');
      assert.match(String(prose.value.analysisMarkdown), /Tracking Winger/);
    }

    // 4. Trailing comma + unescaped raw newline inside string value
    const glitched = extractStructuredJsonObject(
      '```json\n{\n  "analysisMarkdown": "Line 1\nLine 2",\n  "immediateClicks": ["Switch AMR to Tracking Winger OOP",],\n}\n```'
    );
    assert.equal(glitched.ok, true);
    if (glitched.ok) {
      assert.equal(glitched.strategy, 'repaired');
      assert.equal(glitched.value.analysisMarkdown, 'Line 1\nLine 2');
      assert.deepEqual(glitched.value.immediateClicks, [
        'Switch AMR to Tracking Winger OOP',
      ]);
    }
  });

  it('rejects empty strings, arrays, primitives, HTML, and truncated/malformed JSON cleanly', () => {
    const badInputs = [
      '',
      '   ',
      '["array","not","object"]',
      '"just a json string"',
      '42',
      'null',
      '<!doctype html><html><body>502 Bad Gateway</body></html>',
      '{"analysisMarkdown": "truncated before closing brace"',
      'Plain prose with no JSON object at all.',
    ];
    for (const raw of badInputs) {
      const res = extractStructuredJsonObject(raw);
      assert.equal(res.ok, false, `Expected failure for input: ${raw}`);
    }
  });

  it('enforces strict user -> model alternation, maps assistant -> model, merges consecutive turns, and caps pairs cleanly', () => {
    const history = [
      { role: 'assistant', text: 'Stray leading assistant greeting' },
      { role: 'user', text: '   ' },
      { role: 'user', text: 'Turn 1A' },
      { role: 'user', text: 'Turn 1B' },
      { role: 'assistant', text: 'Reply 1A' },
      { role: 'model', text: 'Reply 1B' },
      { role: 'user', text: 'Turn 2' },
      { role: 'assistant', text: 'Reply 2' },
      { role: 'user', text: 'Turn 3' },
      { role: 'model', text: 'Reply 3' },
      { role: 'user', text: 'Turn 4' },
      { role: 'assistant', text: 'Reply 4' },
      { role: 'user', text: 'Trailing unanswered failed turn' },
    ];

    const normalized = normalizeTacticalChatHistory(history, 6);
    assert.equal(normalized.length, 6);
    assert.deepEqual(
      normalized.map((t) => t.role),
      ['user', 'model', 'user', 'model', 'user', 'model']
    );
    // Kept latest 3 completed pairs (Turns 2, 3, 4) and dropped Turn 1 & trailing unanswered Turn
    assert.equal(normalized[0].parts[0].text, 'Turn 2');
    assert.equal(normalized[5].parts[0].text, 'Reply 4');

    // Consecutive merging verified when within cap
    const merged = normalizeTacticalChatHistory(
      [
        { role: 'model', text: 'Leading model' },
        { role: 'user', text: 'Q1' },
        { role: 'user', text: 'Q1 extra' },
        { role: 'assistant', text: 'A1' },
        { role: 'model', text: 'A1 extra' },
        { role: 'user', text: 'Unanswered' },
      ],
      6
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[0].role, 'user');
    assert.equal(merged[0].parts[0].text, 'Q1\n\nQ1 extra');
    assert.equal(merged[1].role, 'model');
    assert.equal(merged[1].parts[0].text, 'A1\n\nA1 extra');
  });
});

describe('Phase 5: Live route JSON unwrapping & Deep -> Fast timeout failover', () => {
  let activeClose: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (activeClose) {
      await activeClose();
      activeClose = null;
    }
  });

  it('unwraps markdown-fenced and prose-wrapped replies across all 4 AI endpoints and returns JSON 502 on malformed replies', async () => {
    let nextReply = '';
    const config = loadServerConfig({ GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv);
    const geminiService = new GeminiService({
      config,
      clientFactory: () => ({
        models: {
          list: async () => ({
            models: [
              { name: `models/${FAST_MODEL_ID}` },
              { name: `models/${DEEP_MODEL_ID}` },
            ],
          }),
          generateContent: (async () => ({
            get text() {
              return nextReply;
            },
          })) as never,
        },
      }),
    });

    const app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use('/api', createFm27Router({ geminiService }));
    const srv = await startTestServer(app);
    activeClose = srv.close;

    // 1. /tactical-chat with markdown-fenced + trailing-comma JSON -> HTTP 200
    nextReply =
      'Sure, here is your analysis:\n```json\n{"analysisMarkdown":"Tracking Winger OOP fixed the flank.","immediateClicks":["Keep 4-3-3",],}\n```';
    const chatOk = await fetch(`${srv.baseUrl}/api/fm27/tactical-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Review my flanks' }),
    });
    assert.equal(chatOk.status, 200);
    const chatBody = (await chatOk.json()) as { analysisMarkdown: string };
    assert.match(chatBody.analysisMarkdown, /Tracking Winger OOP/);

    // 2. /match-debrief with prose wrapper -> HTTP 200
    nextReply =
      'Debrief ready: {"headlineVerdict":"Solid 2-0 win","xgAndExecutionAudit":"1.90 vs 0.45 xG"} Hope that helps!';
    const debriefOk = await fetch(`${srv.baseUrl}/api/fm27/match-debrief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clubName: 'KVV Zelzate', matchSummary: { score: '2 - 0' } }),
    });
    assert.equal(debriefOk.status, 200);
    const debriefBody = (await debriefOk.json()) as { headlineVerdict: string };
    assert.equal(debriefBody.headlineVerdict, 'Solid 2-0 win');

    // 3. /journey-report with fenced JSON -> HTTP 200
    nextReply = '```json\n{"headline":"Upward trajectory","journeyArc":"Improved xG"}\n```';
    const journeyOk = await fetch(`${srv.baseUrl}/api/fm27/journey-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clubName: 'KVV Zelzate', journeySummary: { from: 'Sep', to: 'Nov' } }),
    });
    assert.equal(journeyOk.status, 200);
    const journeyBody = (await journeyOk.json()) as { headline: string; briefing: { headline: string } };
    assert.equal(journeyBody.headline, 'Upward trajectory');
    assert.equal(journeyBody.briefing.headline, 'Upward trajectory');

    // 4. /analyze-screenshot with fenced JSON -> HTTP 200
    nextReply = '```\n{"screenDetected":"Data Hub","headlineTitle":"Shot Map"}\n```';
    const screenOk = await fetch(`${srv.baseUrl}/api/fm27/analyze-screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Inspect Data Hub' }),
    });
    assert.equal(screenOk.status, 200);
    const screenBody = (await screenOk.json()) as { headlineTitle: string };
    assert.equal(screenBody.headlineTitle, 'Shot Map');

    // 5. Truncated / malformed replies return HTTP 502 JSON cleanly on all 4 endpoints
    nextReply = '{"broken": true, "truncated":';
    const badEndpoints: Array<[string, Record<string, unknown>]> = [
      ['/api/fm27/tactical-chat', { message: 'Test malformed' }],
      ['/api/fm27/match-debrief', { matchSummary: { score: '1 - 1' } }],
      ['/api/fm27/journey-report', { journeySummary: { from: 'A', to: 'B' } }],
      ['/api/fm27/analyze-screenshot', { notes: 'Malformed test' }],
    ];
    for (const [endpoint, payload] of badEndpoints) {
      const badRes = await fetch(`${srv.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(badRes.status, 502, `Expected 502 on ${endpoint}`);
      assert.match(badRes.headers.get('content-type') || '', /application\/json/i);
      const errJson = (await badRes.json()) as { error?: string };
      assert.match(errJson.error || '', /malformed/i);
    }
  });

  it('automatically fails over from Deep (gemini-3.6-flash) to Fast (gemini-3.5-flash-lite) on timeout and preserves pinned model IDs', async () => {
    assert.equal(FAST_MODEL_ID, 'gemini-3.5-flash-lite');
    assert.equal(DEEP_MODEL_ID, 'gemini-3.6-flash');

    const attemptedModels: string[] = [];
    let fakeNow = 1_000_000;
    const config = loadServerConfig({ GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv);

    // Case A: Deep model times out -> automatic failover to Fast model succeeds
    const failoverService = new GeminiService({
      config,
      now: () => fakeNow,
      sleep: async (ms) => {
        fakeNow += ms;
      },
      clientFactory: () => ({
        models: {
          list: async () => ({
            models: [
              { name: `models/${FAST_MODEL_ID}` },
              { name: `models/${DEEP_MODEL_ID}` },
            ],
          }),
          generateContent: (async (req: { model: string }) => {
            attemptedModels.push(req.model);
            if (req.model === DEEP_MODEL_ID) {
              // Simulate Deep model exhausting its 67% slice (40.2s of 60s)
              fakeNow += 40_200;
              throw new AnalystTimeoutError(60_000);
            }
            return {
              get text() {
                return JSON.stringify({ analysisMarkdown: 'Failover Fast reply OK' });
              },
            };
          }) as never,
        },
      }),
    });

    const okRes = await failoverService.generateContent(
      { contents: [{ role: 'user', parts: [{ text: 'Deep audit' }] }] },
      { reasoningMode: 'deep_high', timeoutMs: 60_000 }
    );
    assert.deepEqual(attemptedModels, ['gemini-3.6-flash', 'gemini-3.5-flash-lite']);
    assert.match(okRes.text ?? '', /Failover Fast reply OK/);

    // Case B: Both Deep and Fast models time out -> throws AnalystTimeoutError (HTTP 504 on route)
    const doubleAttempts: string[] = [];
    let fakeNow2 = 2_000_000;
    const doubleTimeoutService = new GeminiService({
      config,
      now: () => fakeNow2,
      clientFactory: () => ({
        models: {
          list: async () => ({
            models: [
              { name: `models/${FAST_MODEL_ID}` },
              { name: `models/${DEEP_MODEL_ID}` },
            ],
          }),
          generateContent: (async (req: { model: string }) => {
            doubleAttempts.push(req.model);
            fakeNow2 += 40_200;
            throw new AnalystTimeoutError(60_000);
          }) as never,
        },
      }),
    });

    await assert.rejects(
      () =>
        doubleTimeoutService.generateContent(
          { contents: [{ role: 'user', parts: [{ text: 'Double timeout' }] }] },
          { reasoningMode: 'deep_high', timeoutMs: 60_000 }
        ),
      AnalystTimeoutError
    );
    assert.deepEqual(doubleAttempts, ['gemini-3.6-flash', 'gemini-3.5-flash-lite']);
  });
});
