import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HUB_TOKEN_STORAGE_KEY,
  hubAuthFetch,
  readStoredHubToken,
  resetHubAuthPromptStateForTests,
  storeHubToken,
} from './hubAuth.ts';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

async function withStorage<T>(fn: () => Promise<T> | T): Promise<T> {
  const globalObject = globalThis as { localStorage?: unknown };
  const previous = globalObject.localStorage;
  globalObject.localStorage = fakeStorage();
  try {
    return await fn();
  } finally {
    globalObject.localStorage = previous;
  }
}

test('hubAuthFetch sends no token when none is stored, and keeps other headers', async () => {
  await withStorage(async () => {
    const seen: RequestInit[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init: RequestInit = {}) => {
      seen.push(init);
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    await hubAuthFetch('/api/health', { headers: { 'content-type': 'application/json' } }, { fetchImpl });

    const headers = new Headers(seen[0].headers);
    assert.equal(headers.get('x-hub-access-token'), null);
    assert.equal(headers.get('content-type'), 'application/json');
  });
});

test('hubAuthFetch sends the stored token', async () => {
  await withStorage(async () => {
    storeHubToken('  secret-token  ');
    assert.equal(readStoredHubToken(), 'secret-token');
    assert.equal(globalThis.localStorage?.getItem(HUB_TOKEN_STORAGE_KEY), 'secret-token');

    const seen: string[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init: RequestInit = {}) => {
      seen.push(new Headers(init.headers).get('x-hub-access-token') ?? '');
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    await hubAuthFetch('/api/health', {}, { fetchImpl });
    assert.deepEqual(seen, ['secret-token']);
  });
});

test('a 401 asks once, stores the answer and retries with it', async () => {
  await withStorage(async () => {
    resetHubAuthPromptStateForTests();
    const tokensSent: string[] = [];
    let prompts = 0;
    const fetchImpl = (async (_input: RequestInfo | URL, init: RequestInit = {}) => {
      const token = new Headers(init.headers).get('x-hub-access-token');
      tokensSent.push(token ?? '');
      return new Response('{}', { status: token === 'typed-token' ? 200 : 401 });
    }) as typeof fetch;

    const response = await hubAuthFetch('/api/fm27/tactical-chat', { method: 'POST', body: '{}' }, {
      fetchImpl,
      promptForToken: () => {
        prompts += 1;
        return 'typed-token';
      },
    });

    assert.equal(response.status, 200);
    assert.equal(prompts, 1);
    assert.deepEqual(tokensSent, ['', 'typed-token']);
    assert.equal(readStoredHubToken(), 'typed-token');
  });
});

test('declining the prompt returns the 401 instead of looping', async () => {
  await withStorage(async () => {
    resetHubAuthPromptStateForTests();
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response('{}', { status: 401 });
    }) as typeof fetch;

    const response = await hubAuthFetch('/api/health', {}, { fetchImpl, promptForToken: () => null });

    assert.equal(response.status, 401);
    assert.equal(calls, 1);
    assert.equal(readStoredHubToken(), null);
  });
});

test('background reports never open a token dialog', async () => {
  await withStorage(async () => {
    resetHubAuthPromptStateForTests();
    let prompts = 0;
    const fetchImpl = (async () => new Response('{}', { status: 401 })) as typeof fetch;

    const response = await hubAuthFetch(
      '/api/fm27/client-error',
      { method: 'POST', body: '{}' },
      {
        fetchImpl,
        promptOnUnauthorized: false,
        promptForToken: () => {
          prompts += 1;
          return 'typed-token';
        },
      }
    );

    assert.equal(response.status, 401);
    assert.equal(prompts, 0);
  });
});

test('a streaming body is not replayed after a 401', async () => {
  await withStorage(async () => {
    resetHubAuthPromptStateForTests();
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response('{}', { status: 401 });
    }) as typeof fetch;
    const stream = new ReadableStream();

    const response = await hubAuthFetch('/api/fm27/decode-save/chunk', { method: 'POST', body: stream }, {
      fetchImpl,
      promptForToken: () => 'typed-token',
    });

    assert.equal(response.status, 401);
    assert.equal(calls, 1);
  });
});
