/**
 * Resilient structured JSON extraction & chat history normalization helpers
 * for FM27 Command Hub AI endpoints.
 */

export type JsonObjectExtractResult =
  | {
      ok: true;
      value: Record<string, unknown>;
      strategy: 'direct' | 'fenced' | 'balanced_braces' | 'repaired';
    }
  | {
      ok: false;
      reason: string;
    };

export interface NormalizedGeminiTurn {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

function isPlainJsonObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function tryParseJsonObject(candidate: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(candidate);
    return isPlainJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Escapes raw unescaped control newlines/carriage returns/tabs that occasionally
 * appear inside LLM-emitted JSON string literals, and strips trailing commas
 * right before `}` or `]` outside string literals.
 */
function repairMinorJsonGlitches(input: string): string {
  // Pass 1: Escape raw control chars inside double-quoted JSON strings
  let escaped = '';
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (isEscaped) {
        escaped += ch;
        isEscaped = false;
      } else if (ch === '\\') {
        escaped += ch;
        isEscaped = true;
      } else if (ch === '"') {
        escaped += ch;
        inString = false;
      } else if (ch === '\n') {
        escaped += '\\n';
      } else if (ch === '\r') {
        escaped += '\\r';
      } else if (ch === '\t') {
        escaped += '\\t';
      } else {
        escaped += ch;
      }
    } else {
      if (ch === '"') {
        inString = true;
      }
      escaped += ch;
    }
  }

  // Pass 2: Strip trailing commas before `}` or `]` outside string literals
  let out = '';
  inString = false;
  isEscaped = false;

  for (let i = 0; i < escaped.length; i++) {
    const ch = escaped[i];
    if (inString) {
      out += ch;
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === '\\') {
        isEscaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === ',') {
      let j = i + 1;
      while (j < escaped.length && /\s/.test(escaped[j])) {
        j++;
      }
      if (j < escaped.length && (escaped[j] === '}' || escaped[j] === ']')) {
        // Skip trailing comma
        continue;
      }
    }

    out += ch;
  }

  return out;
}

/**
 * Finds all top-level balanced `{ ... }` slices in `text` while properly
 * skipping braces inside double-quoted JSON string literals.
 */
function findBalancedObjectCandidates(text: string): string[] {
  const candidates: string[] = [];
  let i = 0;

  while (i < text.length) {
    const start = text.indexOf('{', i);
    if (start === -1) break;

    let depth = 0;
    let inString = false;
    let isEscaped = false;
    let matchedEnd = -1;

    for (let j = start; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (ch === '\\') {
          isEscaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          matchedEnd = j;
          break;
        }
      }
    }

    if (matchedEnd !== -1) {
      candidates.push(text.slice(start, matchedEnd + 1));
      i = matchedEnd + 1;
    } else {
      // Unclosed brace starting at `start` — advance past it in case an inner object exists
      i = start + 1;
    }
  }

  return candidates;
}

/**
 * Extracts a structured JSON object from an LLM text reply, tolerating:
 * - UTF-8 BOM & leading/trailing whitespace
 * - Markdown fences (```json ... ``` or ``` ... ```) with optional prose
 * - Prose preambles / postambles wrapping a `{ ... }` object
 * - Minor LLM JSON glitches (trailing commas, unescaped newlines in strings)
 *
 * Strictly rejects arrays, primitives, null, empty strings, and malformed/truncated replies.
 */
export function extractStructuredJsonObject(
  rawText: string
): JsonObjectExtractResult {
  if (typeof rawText !== 'string') {
    return { ok: false, reason: 'Empty or non-string AI response' };
  }

  const cleaned = rawText.replace(/^\uFEFF/, '').trim();
  if (!cleaned) {
    return { ok: false, reason: 'Empty AI response' };
  }

  // 1. Direct fast path
  const direct = tryParseJsonObject(cleaned);
  if (direct) {
    return { ok: true, value: direct, strategy: 'direct' };
  }

  // 2. Markdown fenced blocks (```json ... ``` or ``` ... ```)
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  const fencedCandidates: string[] = [];
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fenceRegex.exec(cleaned)) !== null) {
    const inner = (fenceMatch[1] || '').trim();
    if (inner) fencedCandidates.push(inner);
  }

  for (const block of fencedCandidates) {
    const parsed = tryParseJsonObject(block);
    if (parsed) {
      return { ok: true, value: parsed, strategy: 'fenced' };
    }
  }

  // 3. String-aware balanced `{ ... }` scan across full text (largest objects first)
  const braceCandidates = findBalancedObjectCandidates(cleaned).sort(
    (a, b) => b.length - a.length
  );
  for (const slice of braceCandidates) {
    const parsed = tryParseJsonObject(slice);
    if (parsed) {
      return { ok: true, value: parsed, strategy: 'balanced_braces' };
    }
  }

  // 4. Safe minor-repair pass (trailing commas / raw newlines in strings) on fenced & brace candidates
  const repairTargets = [
    ...fencedCandidates,
    ...braceCandidates,
    ...(cleaned.startsWith('{') && cleaned.endsWith('}') ? [cleaned] : []),
  ];
  for (const target of repairTargets) {
    const repaired = repairMinorJsonGlitches(target);
    const parsed = tryParseJsonObject(repaired);
    if (parsed) {
      return { ok: true, value: parsed, strategy: 'repaired' };
    }
  }

  return {
    ok: false,
    reason: 'AI response did not contain a valid structured JSON object',
  };
}

/**
 * Normalizes multi-turn chat history into strict alternating `user -> model`
 * turns suitable for Gemini `generateContent`:
 * - Maps `'assistant'` to `'model'`, drops invalid/empty turns
 * - Merges consecutive same-role turns with `\n\n`
 * - Strips leading `'model'` turns
 * - Strips trailing unanswered `'user'` turns so appending the current user
 *   turn ALWAYS yields strict `user -> model -> ... -> user` alternation
 * - Caps output to at most `maxTurns` (preserving even-length completed pairs)
 */
export function normalizeTacticalChatHistory(
  history: unknown,
  maxTurns = 6
): NormalizedGeminiTurn[] {
  if (!Array.isArray(history) || history.length === 0 || maxTurns < 2) {
    return [];
  }

  const normalized: NormalizedGeminiTurn[] = [];

  for (const item of history) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as { role?: unknown; text?: unknown };
    if (typeof rec.text !== 'string') continue;
    const text = rec.text.trim();
    if (!text) continue;

    const rawRole = typeof rec.role === 'string' ? rec.role.trim().toLowerCase() : '';
    let role: 'user' | 'model';
    if (rawRole === 'user') {
      role = 'user';
    } else if (rawRole === 'model' || rawRole === 'assistant') {
      role = 'model';
    } else {
      continue;
    }

    const prev = normalized[normalized.length - 1];
    if (prev && prev.role === role) {
      prev.parts[0].text = `${prev.parts[0].text}\n\n${text}`;
    } else {
      normalized.push({ role, parts: [{ text }] });
    }
  }

  // Gemini conversations must begin with a user turn
  while (normalized.length > 0 && normalized[0].role !== 'user') {
    normalized.shift();
  }

  // Must end on a model turn so appending the new user turn alternates strictly
  while (normalized.length > 0 && normalized[normalized.length - 1].role === 'user') {
    normalized.pop();
  }

  // Cap to an even number of turns (<= maxTurns) so user->model pairing stays intact
  const maxPairsTurns = maxTurns - (maxTurns % 2);
  if (normalized.length > maxPairsTurns) {
    const sliced = normalized.slice(-maxPairsTurns);
    while (sliced.length > 0 && sliced[0].role !== 'user') {
      sliced.shift();
    }
    while (sliced.length > 0 && sliced[sliced.length - 1].role === 'user') {
      sliced.pop();
    }
    return sliced;
  }

  return normalized;
}
