/**
 * Safe JSON API response parser and FM27 reader-note sanitizer.
 * Guarantees that HTML error pages (e.g. proxy 504/502/404 `<!doctype html>`)
 * never surface raw `Unexpected token '<'` parse exceptions in the UI.
 */

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
    const serverErr =
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error.trim()
        : '';

    if (serverErr) {
      throw new Error(serverErr);
    }

    if (res.status === 504) {
      throw new Error(
        'The Tactical Analyst timed out waiting for a response. Please try again with a shorter prompt.'
      );
    }
    if (res.status === 404) {
      throw new Error(
        'The requested API endpoint could not be reached (HTTP 404). Please refresh and try again.'
      );
    }
    if (res.status === 413) {
      throw new Error(
        'The request payload was too large. Try removing large attachments and sending again.'
      );
    }
    if (looksLikeHtml) {
      throw new Error(
        `Server temporarily unavailable (HTTP ${res.status}). Please retry in a moment.`
      );
    }
    throw new Error(`${fallbackError} (HTTP ${res.status})`);
  }

  if (looksLikeHtml || !isJsonContentType || parsed === null) {
    throw new Error(
      'Received an unexpected non-JSON response from the server. Please retry in a moment.'
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
    text = `${text.slice(0, 217).trimEnd()}...`;
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
