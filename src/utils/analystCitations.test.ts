import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANALYST_CITATION_SECTIONS,
  buildAnalystCitationPromptRules,
  extractInlineCitations,
  mergeAnalystCitations,
  normalizeAnalystCitations,
} from './analystCitations';
import { sanitizePersistedTurn } from '../services/chatStorage';
import { buildOfflineTacticalBriefing } from './offlineBriefingEngine';
import { buildTacticalChatSystemPrompt } from '../../server/prompts.ts';

test('citation prompt rules list the exact UI sections and require a source', () => {
  const rules = buildAnalystCitationPromptRules();
  assert.match(rules, /CITATION & GROUNDING LAW/);
  assert.match(rules, /Every factual sentence/i);
  assert.match(rules, /must return at least one source citation/i);
  for (const section of ANALYST_CITATION_SECTIONS) {
    assert.ok(rules.includes(section), `citation rules are missing ${section}`);
  }

  const prompt = buildTacticalChatSystemPrompt({
    targetClub: 'KVV Zelzate',
    liveAppContext: '=== LIVE CLUB SNAPSHOT ===',
  });
  assert.ok(prompt.includes('CITATION & GROUNDING LAW'));
  assert.ok(prompt.includes('Hub · Finances'));
  assert.ok(prompt.includes('Squad · Player Detail'));
  assert.ok(prompt.includes('Knowledge Base'));
});

test('chat response schema exposes sourceCitations', () => {
  const schema = readFileSync(new URL('../../server/schemas.ts', import.meta.url), 'utf8');
  assert.match(schema, /sourceCitations/);
  assert.match(schema, /Exact UI card\/section labels/);
});

test('normalizeAnalystCitations removes brackets, duplicates and blanks', () => {
  assert.deepEqual(
    normalizeAnalystCitations([
      '[Hub · Finances]',
      'Hub · Finances',
      ' Squad · Roster ',
      '',
      null,
      'Staff · Directory',
    ]),
    ['Hub · Finances', 'Squad · Roster', 'Staff · Directory']
  );
  assert.deepEqual(normalizeAnalystCitations('Hub · Finances'), []);
});

test('inline citations are extracted and merged with the response citation list', () => {
  const markdown = [
    'The balance is -£749K [Hub · Finances].',
    'Wolf Ackx is the best press-resistant forward [Squad · Player Detail].',
    'This repeats the finance source [Hub · Finances].',
    'A normal [bracket] is not a citation.',
  ].join('\n');

  assert.deepEqual(extractInlineCitations(markdown), [
    'Hub · Finances',
    'Squad · Player Detail',
  ]);
  assert.deepEqual(
    mergeAnalystCitations(['Knowledge Base'], markdown),
    ['Knowledge Base', 'Hub · Finances', 'Squad · Player Detail']
  );
});

test('persisted chat turns keep source citations', () => {
  const turn = sanitizePersistedTurn({
    id: 'assistant-1',
    role: 'assistant',
    analysisMarkdown: 'The bank balance is -£749K [Hub · Finances].',
    sourceCitations: ['Hub · Finances', 'Hub · Finances', 'Squad · Roster'],
  });
  assert.deepEqual(turn?.sourceCitations, ['Hub · Finances', 'Squad · Roster']);
});

test('offline briefing includes a citation footer list', () => {
  const offline = buildOfflineTacticalBriefing({
    clubName: 'KVV Zelzate',
    saveDate: '--',
    nextFixture: '--',
    leagueStandingSub: '--',
    wageSpend: '--',
    balance: '--',
    players: [],
    matches: [],
  });
  assert.deepEqual(offline.sourceCitations, ['Hub · Auto-Sync']);
});

test('Analyst reply footer renders the grounded-in chips and copy text', () => {
  const source = readFileSync(
    new URL('../components/AutoSyncWorkspace.tsx', import.meta.url),
    'utf8'
  );
  assert.match(source, /mergeAnalystCitations/);
  assert.match(source, /Grounded in/);
  assert.match(source, /turnCitations\.map/);
  assert.match(source, /sourceCitations: mergeAnalystCitations\(/);
  assert.match(source, /parts\.push\(`Grounded in:/);
});
