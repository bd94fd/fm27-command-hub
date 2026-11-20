import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFm27KnowledgeGroundingBlock,
  FM27_KNOWLEDGE_BASE,
  searchFm27KnowledgeBase,
  verifyFm27Accuracy,
} from './fm27KnowledgeBase';

test('FM27 Knowledge Base contains verified Patch 27.1.0 entries across core categories', () => {
  assert.ok(FM27_KNOWLEDGE_BASE.length >= 8);
  const results = searchFm27KnowledgeBase('tracking winger OOP pressing', 3);
  assert.ok(results.length >= 1);
  assert.equal(results[0].id, 'dual-phase-ip-oop');
});

test('buildFm27KnowledgeGroundingBlock produces grounded context for set piece queries', () => {
  const block = buildFm27KnowledgeGroundingBlock('corner kick set pieces near post');
  assert.match(block, /VERIFIED FM27 KNOWLEDGE BASE/);
  assert.match(block, /Inswinging|Near Post|Set Pieces/i);
});

test('verifyFm27Accuracy flags retired FM24 roles, legacy duties, and raw CA/PA leaks', () => {
  const bad = verifyFm27Accuracy(
    'Play him as a Mezzala (Attack) with CA 132 / PA 155.'
  );
  assert.equal(bad.passed, false);
  assert.ok(bad.warnings.some((w) => w.includes('Mezzala')));
  assert.ok(bad.warnings.some((w) => w.includes('legacy FM24 duty')));
  assert.ok(bad.warnings.some((w) => w.includes('raw numeric CA/PA')));

  const good = verifyFm27Accuracy(
    'Deploy Inside Forward IP paired with Tracking Winger OOP. Player is 4.0★ with Speed Index 84.'
  );
  assert.equal(good.passed, true);
  assert.equal(good.warnings.length, 0);
});
