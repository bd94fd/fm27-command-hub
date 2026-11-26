export const ANALYST_CITATION_SECTIONS = [
  'Hub · Live Club Snapshot',
  'Hub · Finances',
  'Hub · Data Quality',
  'Hub · Save Compatibility',
  'Hub · Journey',
  'Hub · Auto-Sync',
  'Squad · Roster',
  'Squad · Player Detail',
  'Squad · Best XI',
  'Squad · Tactical War Room',
  'Staff · Directory',
  'Staff · Staff Detail',
  'Transfers · Shortlist',
  'Transfers · Positional Depth',
  'Matches · Match Log',
  'Matches · Last Match Blueprint',
  'Tactics & Corners · Set Pieces',
  'Knowledge Base',
  'Analyst · Prior Conversation',
] as const;

export type AnalystCitationSection = (typeof ANALYST_CITATION_SECTIONS)[number];

const SECTION_PREFIX =
  'Hub|Squad|Staff|Transfers|Matches|Tactics & Corners|Knowledge Base|Analyst';

const INLINE_CITATION_PATTERN = new RegExp(
  `\\[((?:${SECTION_PREFIX})[^\\]]{0,80})\\]`,
  'g'
);

export function buildAnalystCitationPromptRules(): string {
  return `CITATION & GROUNDING LAW (MANDATORY):
- Every factual sentence — any number, player/staff name, role, fixture, wage, finance figure, date, table position, or decoded field — MUST end with an inline citation in square brackets naming the exact UI card/section it came from, e.g. [Hub · Finances] or [Squad · Player Detail].
- Use ONLY these exact UI section labels in citations:
${ANALYST_CITATION_SECTIONS.map((section) => `  - ${section}`).join('\n')}
- Return the same labels in sourceCitations[], de-duplicated. Do not return a citation that is not in the list above.
- A fact from a previous Analyst answer cites [Analyst · Prior Conversation]. Pure FM27 mechanics from the verified Knowledge Base cite [Knowledge Base].
- If a fact is not exposed in this save, write "not exposed in this save" and cite the UI section that would hold it. NEVER invent a number or name to fill the gap.
- Every answer MUST return at least one source citation. An answer with no citation is invalid.`;
}

export function normalizeAnalystCitations(raw: unknown, limit = 10): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const cleaned = item.replace(/^\[|\]$/g, '').trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}

export function extractInlineCitations(markdown?: string | null): string[] {
  if (!markdown) return [];
  const found: string[] = [];
  for (const match of markdown.matchAll(INLINE_CITATION_PATTERN)) {
    const label = match[1].trim();
    if (label) found.push(label);
  }
  return normalizeAnalystCitations(found);
}

export function mergeAnalystCitations(
  raw: unknown,
  markdown?: string | null
): string[] {
  return normalizeAnalystCitations([
    ...normalizeAnalystCitations(raw),
    ...extractInlineCitations(markdown),
  ]);
}
