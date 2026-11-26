import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClientErrorEvent,
  buildServerErrorEvent,
} from './errorReporting.ts';

describe('server error reporting', () => {
  it('builds a structured server event without request bodies or save data', () => {
    const event = buildServerErrorEvent({
      requestId: 'req-server-1',
      method: 'POST',
      path: '/api/fm27/tactical-chat?apiKey=should-not-leak',
      status: 500,
      durationMs: 12.6,
      error: new Error(
        'GEMINI_API_KEY=AIzaSyDummyKeyThatShouldNeverAppear123456 failed for auto_save.fm'
      ),
      context: {
        body: { liveAppContext: 'player data' },
        players: [{ name: 'John Smith' }],
        stage: 'hydrate',
      },
    });

    assert.equal(event.type, 'server');
    assert.equal(event.requestId, 'req-server-1');
    assert.equal(event.path, '/api/fm27/tactical-chat');
    assert.equal(event.status, 500);
    assert.equal(event.durationMs, 13);
    assert.doesNotMatch(event.error.message, /AIzaSy/);
    assert.doesNotMatch(event.error.message, /auto_save\.fm/);
    assert.match(event.error.message, /\[redacted\]/);
    assert.equal(event.context?.body, '[omitted]');
    assert.equal(event.context?.players, '[omitted]');
    assert.equal(event.context?.stage, 'hydrate');
  });

  it('re-redacts client reports and keeps only safe context fields', () => {
    const event = buildClientErrorEvent(
      {
        reportVersion: 1,
        createdAtIso: '2026-11-25T10:00:00.000Z',
        app: { name: 'fm27-command-hub', version: '1.0.0' },
        scope: 'window.error',
        route: '/staff?player=John%20Smith',
        userAgent: 'UnitTest/1.0',
        error: {
          name: 'Error',
          message: 'token=super-secret-token player "John Smith" auto_save.fm',
        },
        context: {
          stage: 'hydrate',
          status: 500,
          players: [{ name: 'John Smith' }],
          payload: 'full save contents',
          apiKey: 'secret',
        },
      },
      { requestId: 'req-client-1', method: 'POST', path: '/api/fm27/client-error' }
    );

    assert.equal(event.type, 'client');
    assert.equal(event.requestId, 'req-client-1');
    assert.equal(event.appVersion, '1.0.0');
    assert.equal(event.scope, 'window.error');
    assert.equal(event.route, '/staff');
    assert.doesNotMatch(event.error.message, /super-secret-token/);
    assert.doesNotMatch(event.error.message, /John Smith/);
    assert.doesNotMatch(event.error.message, /auto_save\.fm/);
    assert.equal(event.context?.players, undefined);
    assert.equal(event.context?.payload, undefined);
    assert.equal(event.context?.apiKey, undefined);
    assert.equal(event.context?.stage, 'hydrate');
    assert.equal(event.context?.status, 500);
  });

  it('omits a non-object client report instead of echoing it', () => {
    const event = buildClientErrorEvent('GEMINI_API_KEY=secret', {
      requestId: 'req-client-2',
    });
    assert.equal(event.error.message, 'A non-Error value was thrown. Payload omitted.');
    assert.equal(JSON.stringify(event).includes('secret'), false);
  });
});
