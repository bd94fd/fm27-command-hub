import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildErrorReport,
  clearLastErrorReport,
  formatErrorReport,
  getLastErrorReport,
  rememberLastErrorReport,
} from './errorReport.ts';
import { redactForLog, redactSensitiveText } from './errorRedaction.ts';

describe('error report redaction', () => {
  beforeEach(() => {
    clearLastErrorReport();
  });

  it('removes API keys, bearer tokens, emails, save names and blobs', () => {
    const raw = [
      'GEMINI_API_KEY=AIzaSyDummyKeyThatShouldNeverAppear123456',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789',
      'contact manager@example.com',
      'failed while reading auto_save.fm',
      'player "John Smith" was missing',
      `/home/alice/saves/last_save.fm`,
      'payload ' + 'A'.repeat(240),
    ].join(' ');

    const redacted = redactSensitiveText(raw);

    assert.doesNotMatch(redacted, /AIzaSy/);
    assert.doesNotMatch(redacted, /abcdefghijklmnopqrstuvwxyz/);
    assert.doesNotMatch(redacted, /manager@example\.com/);
    assert.doesNotMatch(redacted, /auto_save\.fm/);
    assert.doesNotMatch(redacted, /John Smith/);
    assert.doesNotMatch(redacted, /\/home\/alice/);
    assert.match(redacted, /\[redacted/);
    assert.match(redacted, /<save-file>/);
  });

  it('keeps only safe context fields and never copies player or staff payloads', () => {
    const report = buildErrorReport({
      error: new Error('GEMINI_API_KEY=secret-value failed for auto_save.fm'),
      scope: 'Staff',
      route: '/?tab=staff&player=John%20Smith',
      userAgent: 'UnitTest/1.0',
      context: {
        tab: 'Staff',
        stage: 'hydrate',
        status: 500,
        players: [{ name: 'John Smith', uid: 1 }],
        staff: [{ name: 'Jane Coach' }],
        playerName: 'John Smith',
        apiKey: 'secret-value',
        saveFileName: 'auto_save.fm',
        nested: { secret: 'nope' },
      },
    });

    assert.deepEqual(Object.keys(report.context).sort(), ['stage', 'status', 'tab']);
    assert.equal(report.route, '/');
    assert.equal(report.error.message.includes('secret-value'), false);
    assert.equal(report.error.message.includes('auto_save.fm'), false);
    assert.equal(JSON.stringify(report).includes('John Smith'), false);
    assert.equal(JSON.stringify(report).includes('secret-value'), false);
  });

  it('formats a report that states what was excluded', () => {
    const report = buildErrorReport({
      error: new Error('boom'),
      scope: 'Hub',
      context: { tab: 'Hub' },
    });
    const text = formatErrorReport(report);

    assert.match(text, /FM27 Command Hub error report/);
    assert.match(text, /tab: Hub/);
    assert.match(text, /excludes save files, player\/staff records/i);
  });

  it('remembers and clears the last report for the error boundary', () => {
    const report = buildErrorReport({ error: new Error('boom'), scope: 'Hub' });
    rememberLastErrorReport(report);
    assert.equal(getLastErrorReport()?.scope, 'Hub');
    clearLastErrorReport();
    assert.equal(getLastErrorReport(), null);
  });

  it('redacts structured log payloads and omits save-shaped keys', () => {
    const redacted = redactForLog({
      requestId: 'req-1',
      message: 'token=super-secret-token',
      body: { player: 'John Smith' },
      players: [{ name: 'John Smith' }],
      nested: { apiKey: 'secret', status: 500 },
    }) as Record<string, unknown>;

    assert.equal(redacted.requestId, 'req-1');
    assert.equal(redacted.body, '[omitted]');
    assert.equal(redacted.players, '[omitted]');
    assert.match(String(redacted.message), /\[redacted\]/);
    assert.equal(
      (redacted.nested as Record<string, unknown>).apiKey,
      '[redacted]'
    );
  });
});
