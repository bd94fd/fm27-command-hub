import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApiResponseError,
  describeApiFailure,
  isRecoverableAnalystFailure,
  parseJsonApiResponse,
  sanitizeReaderNote,
  sanitizeReaderNotes,
  toApiResponseError,
} from './apiResponse.ts';

test('parseJsonApiResponse parses valid JSON payloads cleanly', async () => {
  const res = new Response(JSON.stringify({ ok: true, count: 3 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
  const data = await parseJsonApiResponse<{ ok: boolean; count: number }>(res);
  assert.deepEqual(data, { ok: true, count: 3 });
});

test('parseJsonApiResponse rejects HTML proxy error pages cleanly without raw JSON parse errors', async () => {
  const res = new Response('<!doctype html><html><body>502 Bad Gateway</body></html>', {
    status: 502,
    headers: { 'Content-Type': 'text/html' },
  });
  await assert.rejects(
    () => parseJsonApiResponse(res),
    (err: unknown) => {
      assert.ok(err instanceof ApiResponseError);
      assert.equal(err.status, 502);
      assert.equal(err.isHtml, true);
      assert.equal(err.retryable, true);
      assert.match(err.message, /HTML error page/i);
      return true;
    }
  );
});

test('parseJsonApiResponse surfaces server JSON error messages and status-specific fallbacks', async () => {
  const jsonErrRes = new Response(JSON.stringify({ error: 'Rate limit hit' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json' },
  });
  await assert.rejects(
    () => parseJsonApiResponse(jsonErrRes),
    (err: unknown) => {
      assert.ok(err instanceof ApiResponseError);
      assert.equal(err.status, 429);
      assert.equal(err.retryable, true);
      assert.equal(err.reason, 'Rate limit hit');
      return true;
    }
  );

  const timeoutRes = new Response('', { status: 504 });
  await assert.rejects(
    () => parseJsonApiResponse(timeoutRes),
    (err: unknown) => err instanceof ApiResponseError && err.status === 504 && err.retryable
  );

  const notFoundRes = new Response('', { status: 404 });
  await assert.rejects(
    () => parseJsonApiResponse(notFoundRes),
    (err: unknown) => err instanceof ApiResponseError && err.status === 404 && !err.retryable
  );

  const tooLargeRes = new Response('', { status: 413 });
  await assert.rejects(
    () => parseJsonApiResponse(tooLargeRes),
    (err: unknown) => err instanceof ApiResponseError && err.status === 413 && !err.retryable
  );
});

test('parseJsonApiResponse rejects HTTP 200 HTML shell fallback as non-json retryable error', async () => {
  const res = new Response('<!doctype html><html><body>SPA Shell</body></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
  await assert.rejects(
    () => parseJsonApiResponse(res),
    (err: unknown) => {
      assert.ok(err instanceof ApiResponseError);
      assert.equal(err.kind, 'non-json');
      assert.equal(err.isHtml, true);
      assert.equal(err.retryable, true);
      return true;
    }
  );
});

test('describeApiFailure, toApiResponseError, and isRecoverableAnalystFailure handle network and HTTP failures', () => {
  const netErr = toApiResponseError(new TypeError('Failed to fetch'));
  assert.equal(netErr.kind, 'network');
  assert.equal(netErr.status, 0);
  assert.equal(netErr.retryable, true);
  assert.match(describeApiFailure(netErr), /^Network error:/);
  assert.equal(isRecoverableAnalystFailure(netErr), true);

  const badReq = new ApiResponseError('HTTP 400: Invalid input', {
    status: 400,
    kind: 'http',
    retryable: false,
    reason: 'Invalid input',
  });
  assert.equal(describeApiFailure(badReq), 'HTTP 400: Invalid input');
  assert.equal(isRecoverableAnalystFailure(badReq), false);
  assert.equal(isRecoverableAnalystFailure(new Error('HTTP 503 Service Unavailable')), true);
});

test('sanitizeReaderNote and sanitizeReaderNotes strip GitHub issue URLs and deduplicate', () => {
  const noisy =
    'Partial tactic schema mismatch. Please report it at https://github.com/example/fmsave/issues with the output of fmsave validate.';
  const clean = sanitizeReaderNote(noisy);
  assert.equal(clean, 'Partial tactic schema mismatch.');
  assert.ok(!clean.includes('https://'));

  const deduped = sanitizeReaderNotes([
    noisy,
    'Partial tactic schema mismatch.',
    '   ',
    'See https://example.com/docs for details.',
  ]);
  assert.deepEqual(deduped, ['Partial tactic schema mismatch.', 'See for details.']);
  assert.deepEqual(sanitizeReaderNotes(null), []);
});
