/**
 * Safe JSON API response parser and FM27 reader-note sanitizer.
 * Guarantees that HTML error pages (e.g. proxy 504/502/404 `<!doctype html>`)
 * never surface raw `Unexpected token '<'` parse exceptions in the UI.
 */

export type ApiFailureKind = 'http' | 'non-json' | 'network';

export interface ApiResponseErrorOptions {
  status: number;
  kind: ApiFailureKind;
  retryable: boolean;
  isHtml?: boolean;
  reason?: string;
}

/** Typed API failure carrying the exact HTTP status so the UI can explain it. */
export class ApiResponseError extends Error {
  readonly status: number;
  readonly kind: ApiFailureKind;
  readonly retryable: boolean;
  readonly isHtml: boolean;
  readonly reason: string;

  constructor(message: string, options: ApiResponseErrorOptions) {
    super(message);
    this.name = 'ApiResponseError';
    this.status = options.status;
    this.kind = options.kind;
    this.retryable = options.retryable;
    this.isHtml = options.isHtml ?? false;
    this.reason = options.reason || message;
  }
}

function shortenReason(text: string, max = 180): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (!oneLine) return '';
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** What the user is told when a request fails because the device has no signal. */
export const OFFLINE_FAILURE_REASON = 'no connection on this device';

function isDeviceOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Builds a short, human-readable "HTTP <status>: <reason>" description.
 * Pass `isOffline` to override the browser probe, for tests.
 */
export function describeApiFailure(
  err: unknown,
  options: { isOffline?: boolean } = {}
): string {
  const offline = options.isOffline ?? isDeviceOffline();
  if (err instanceof ApiResponseError) {
    if (err.kind === 'network' || err.status <= 0) {
      // "Network error: Failed to fetch" is meaningless to someone in a tunnel.
      return offline ? OFFLINE_FAILURE_REASON : `Network error: ${shortenReason(err.reason)}`;
    }
    return `HTTP ${err.status}: ${shortenReason(err.reason)}`;
  }
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (offline && /failed to fetch|networkerror|load failed/i.test(message)) {
    return OFFLINE_FAILURE_REASON;
  }
  return shortenReason(message) || 'Unknown network error';
}

/** True when retrying (Fast Analyst / offline fallback) can plausibly succeed. */
export function isRecoverableAnalystFailure(err: unknown): boolean {
  if (err instanceof ApiResponseError) {
    return (
      err.retryable ||
      err.isHtml ||
      err.kind === 'non-json' ||
      isRetryableStatus(err.status)
    );
  }
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /failed to fetch|networkerror|load failed|unexpected non-json|timed out|timeout|aborted|\b(?:429|500|502|503|504)\b/i.test(
    message
  );
}

/** Normalizes a rejected fetch / thrown value into an ApiResponseError. */
export function toApiResponseError(err: unknown): ApiResponseError {
  if (err instanceof ApiResponseError) return err;
  const message = err instanceof Error ? err.message : String(err ?? '');
  const reason = shortenReason(message) || 'The request could not reach the server.';
  return new ApiResponseError(`Network error: ${reason}`, {
    status: 0,
    kind: 'network',
    retryable: true,
    reason,
  });
}

export async function parseJsonApiResponse<T = Record<string, unknown>>(
  res: Response,
  fallbackError = 'Request failed. Please try again.'
): Promise<T> {
  const rawText = await res.text();
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const looksLikeHtml =
    contentType.includes('text/html') ||
    /^\s*<(?:!doctype|html|head|body)\b/i.test(rawText);
  const isJsonContentType = contentType.includes('application/json');

  let parsed: unknown = null;
  if (!looksLikeHtml && rawText.trim().length > 0) {
    if (isJsonContentType || rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }
    }
  }

  if (!res.ok) {
    const status = res.status;
    const retryable = isRetryableStatus(status);
    const serverErr =
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof (parsed as { error?: unknown }).error === 'string'
        ? shortenReason((parsed as { error: string }).error)
        : '';

    if (serverErr) {
      throw new ApiResponseError(`HTTP ${status}: ${serverErr}`, {
        status,
        kind: 'http',
        retryable,
        reason: serverErr,
      });
    }

    if (status === 504) {
      const reason =
        'The Tactical Analyst timed out waiting for a response. Please try again with a shorter prompt.';
      throw new ApiResponseError(`HTTP 504: ${reason}`, {
        status,
        kind: 'http',
        retryable: true,
        reason,
      });
    }
    if (status === 404) {
      const reason =
        'The requested API endpoint could not be reached. Please refresh and try again.';
      throw new ApiResponseError(`HTTP 404: ${reason}`, {
        status,
        kind: 'http',
        retryable: false,
        reason,
      });
    }
    if (status === 413) {
      const reason =
        'The request payload was too large. Try removing large attachments and sending again.';
      throw new ApiResponseError(`HTTP 413: ${reason}`, {
        status,
        kind: 'http',
        retryable: false,
        reason,
      });
    }
    if (looksLikeHtml) {
      const reason =
        'The server returned an HTML error page instead of JSON. Please retry in a moment.';
      throw new ApiResponseError(`HTTP ${status}: ${reason}`, {
        status,
        kind: 'http',
        retryable: true,
        isHtml: true,
        reason,
      });
    }
    throw new ApiResponseError(`HTTP ${status}: ${fallbackError}`, {
      status,
      kind: 'http',
      retryable,
      reason: fallbackError,
    });
  }

  if (looksLikeHtml || !isJsonContentType || parsed === null) {
    const reason = looksLikeHtml
      ? 'The server returned an HTML page instead of JSON.'
      : 'The server response was not valid JSON.';
    throw new ApiResponseError(
      `Received an unexpected non-JSON response from the server (HTTP ${res.status}). Please retry in a moment.`,
      {
        status: res.status,
        kind: 'non-json',
        retryable: true,
        isHtml: looksLikeHtml,
        reason,
      }
    );
  }

  return parsed as T;
}

/**
 * Strips verbose external GitHub issue URLs and fmsave boilerplate from reader
 * warnings so the workspace displays concise, human-readable FM27 reader notes.
 */
export function sanitizeReaderNote(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw
    // Remove "Please report it at https://github.com/... with the output of fmsave validate."
    .replace(
      /\s*Please report (?:it|this) at https?:\/\/\S+(?:\s+with the output of[^.]*)?\.?/gi,
      ''
    )
    // Remove any remaining raw GitHub or http(s) URLs
    .replace(/\s*\(?https?:\/\/[^\s)]+\)?/gi, '')
    // Collapse whitespace & stray trailing punctuation
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();

  if (text.length > 220) {
    text = `${text.slice(0, 217).trimEnd()}…`;
  }
  return text;
}

export function sanitizeReaderNotes(notes: string[] | undefined | null): string[] {
  if (!Array.isArray(notes) || notes.length === 0) return [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of notes) {
    const clean = sanitizeReaderNote(item);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      cleaned.push(clean);
    }
  }
  return cleaned;
}
