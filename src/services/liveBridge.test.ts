import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_LIVE_BRIDGE_URL, probeLiveBridge } from './liveBridge.ts';

test('probeLiveBridge parses fm-cli /state JSON even when Content-Type is text/plain', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.equal(url, `${DEFAULT_LIVE_BRIDGE_URL}/state`);
    return new Response(
      JSON.stringify({
        Date: '14/03/2027',
        NextMatch: 'vs RWDM',
        State: 'Inbox',
        DuringMatch: false,
      }),
      { status: 200, headers: { 'Content-Type': 'text/plain' } }
    );
  }) as typeof fetch;

  try {
    const status = await probeLiveBridge();
    assert.equal(status.connected, true);
    assert.equal(status.inGameDate, '14/03/2027');
    assert.equal(status.nextMatch, 'vs RWDM');
    assert.equal(status.gameState, 'Inbox');
    assert.equal(status.duringMatch, false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('probeLiveBridge falls back from /state 404 -> /status -> /health', async () => {
  const origFetch = globalThis.fetch;
  const visited: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    visited.push(url);
    if (url.endsWith('/state') || url.endsWith('/status')) {
      return new Response('Not Found', { status: 404 });
    }
    return new Response('ok', { status: 200 });
  }) as typeof fetch;

  try {
    const status = await probeLiveBridge('http://127.0.0.1:7778/');
    assert.equal(status.connected, true);
    assert.equal(status.endpoint, 'http://127.0.0.1:7778');
    assert.deepEqual(visited, [
      'http://127.0.0.1:7778/state',
      'http://127.0.0.1:7778/status',
      'http://127.0.0.1:7778/health',
    ]);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('probeLiveBridge fails gracefully on HTTP errors and unreachable endpoints', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('Forbidden', { status: 403 })) as typeof fetch;
  try {
    const forbidden = await probeLiveBridge();
    assert.equal(forbidden.connected, false);
    assert.equal(forbidden.error, 'HTTP 403');

    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const offline = await probeLiveBridge();
    assert.equal(offline.connected, false);
    assert.equal(offline.error, 'ECONNREFUSED');
  } finally {
    globalThis.fetch = origFetch;
  }
});
