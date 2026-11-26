/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared redaction for error reports and structured logs. The rule is simple:
 * keep the failure shape, remove secrets, save files, player data and large
 * blobs before anything is logged or copied.
 */

const SENSITIVE_KEY_PATTERN =
  /(api[_-]?key|apikey|authorization|bearer|token|secret|password|passwd|cookie|credential|private[_-]?key|gemini|google[_-]?api|openai)/i;

const OMITTED_KEY_PATTERN =
  /^(body|payload|players?.*|staff.*|squad.*|history|images?|attachments?|liveappcontext|importedfilecontext|prompt|prompts|contents?|messages|file.*|save.*|base64|buffer|arraybuffer)$/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function shouldOmitKey(key: string): boolean {
  return OMITTED_KEY_PATTERN.test(key.replace(/[_-]/g, ''));
}

/**
 * Redacts secrets and identifying save data from free text. It is deliberately
 * conservative: it is better to lose a little diagnostic detail than to copy a
 * key, a save name, an email address or a player name into a report.
 */
export function redactSensitiveText(input: string, maxLength = 4000): string {
  if (typeof input !== 'string' || input.length === 0) return '';

  let text = input;

  text = text.replace(
    /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    '$1 [redacted]'
  );

  text = text.replace(
    /\b([A-Za-z0-9_.-]*(?:api[_-]?key|apikey|token|secret|password|passwd|authorization|credential|private[_-]?key)[A-Za-z0-9_.-]*)\s*[:=]\s*(["']?)([^\s"',;}]{4,})\2/gi,
    '$1=$2[redacted]$2'
  );

  text = text
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[redacted-key]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[redacted-key]')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[redacted-key]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[redacted-key]')
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      '[redacted-jwt]'
    );

  text = text.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    '[redacted-email]'
  );

  text = text.replace(
    /\b[\w.'()-]{1,120}\.fm\b/gi,
    '<save-file>'
  );

  text = text.replace(
    /\b(player|staff|person|manager|target)\s+["'][^"'\n]{2,80}["']/gi,
    '$1 "<redacted>"'
  );

  text = text.replace(
    /\/(?:home|Users)\/[^/\s"']+/g,
    '/<user>'
  );

  text = text.replace(/\b[A-Za-z0-9+/]{200,}={0,2}\b/g, '[redacted-blob]');

  return text.slice(0, maxLength);
}

/**
 * Recursively redacts a log payload. Payload-shaped keys are dropped entirely
 * so a caller cannot accidentally attach a save, squad list or prompt.
 */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactSensitiveText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 4) return '[redacted-depth]';
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactForLog(item, depth + 1));
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(
      0,
      40
    )) {
      if (shouldOmitKey(key)) {
        output[key] = '[omitted]';
      } else if (isSensitiveKey(key)) {
        output[key] = '[redacted]';
      } else {
        output[key] = redactForLog(entry, depth + 1);
      }
    }
    return output;
  }
  return String(value);
}
