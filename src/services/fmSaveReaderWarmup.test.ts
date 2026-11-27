import assert from 'node:assert/strict';
import test from 'node:test';
import { warmBrowserDecoder } from './fmSaveReader.ts';

test('the decoder warmup waits for the service worker to take control', () => {
  const posted: Array<{ type?: string }> = [];
  const listeners: Array<() => void> = [];

  class FakeWorker {
    postMessage(message: { type?: string }) {
      posted.push(message);
    }
  }

  const globals = globalThis as unknown as {
    Worker?: typeof Worker;
    window?: unknown;
    navigator?: unknown;
  };
  const originalWorker = globals.Worker;
  const originalWindow = globals.window;
  const originalNavigator = globals.navigator;

  globals.Worker = FakeWorker as unknown as typeof Worker;
  globals.window = { location: { origin: 'https://hub.example' } };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: {
      serviceWorker: {
        controller: null,
        addEventListener: (type: string, listener: () => void) => {
          if (type === 'controllerchange') listeners.push(listener);
        },
      },
    },
  });

  try {
    warmBrowserDecoder();
    assert.equal(posted.length, 0, 'the worker must not start before the page is controlled');
    assert.equal(listeners.length, 1, 'the warmup waits for controllerchange');

    listeners[0]?.();
    assert.equal(posted.length, 1, 'the warmup starts once the page is controlled');
    assert.equal(posted[0]?.type, 'warmup');
  } finally {
    globals.Worker = originalWorker;
    globals.window = originalWindow;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: originalNavigator,
    });
  }
});
