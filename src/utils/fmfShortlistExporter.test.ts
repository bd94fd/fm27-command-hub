import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlayerRecord } from '../types/fm27.ts';
import {
  buildAiResearchContextBlock,
  buildShortlistExportEntries,
  exportShortlistToCsv,
  exportShortlistUidManifest,
} from './fmfShortlistExporter.ts';

function makePlayer(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id: 'p1',
    uid: 77701,
    number: 10,
    name: 'De Bruyne, Kevin "Jr"',
    age: 20,
    position: 'MC',
    positionRatings: { MC: 20 },
    ability: 3.5,
    potential: 4.5,
    wagePw: 1200,
    expires: '30/06/2029',
    marketValue: 450_000,
    nation: 'Belgium',
    personality: 'Model Citizen',
    status: 'Starter',
    ipRole: 'Playmaking Midfielder',
    oopRole: 'Pressing Central Midfielder',
    condition: 95,
    morale: 'Good',
    apps: '10',
    minutes: 900,
    goals: 2,
    xG: 1.8,
    xGPer90: 0.18,
    assists: 5,
    xA: 4.4,
    xAPer90: 0.44,
    drbPer90: 2.2,
    prPassesPer90: 6.5,
    hdrPct: 40,
    intPer90: 1.4,
    tckPct: 72,
    rating: 7.4,
    notes: '',
    attributes: {
      pace: 15,
      acceleration: 15,
      jumpingReach: 12,
      dribbling: 15,
      passing: 16,
      vision: 16,
      firstTouch: 15,
      decisions: 15,
      determination: 15,
      finishing: 13,
      tackling: 12,
      offTheBall: 14,
      workRate: 14,
      stamina: 15,
    },
    ...overrides,
  };
}

test('buildShortlistExportEntries and exportShortlistToCsv produce valid RFC 4180 CSV with escaped quotes/commas', () => {
  const players = [makePlayer()];
  const entries = buildShortlistExportEntries(players);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].uid, 77701);
  assert.ok(entries[0].metaScore !== null);

  const csv = exportShortlistToCsv(players);
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^UID,Name,Position,Age,WagePW,MarketValue,MetaScore,PAMetaScore,BestIPRole,BestOOPRole$/);
  assert.ok(lines[1].includes('"De Bruyne, Kevin ""Jr"""'));
});

test('exportShortlistUidManifest outputs valid JSON manifest filtering non-finite UIDs', () => {
  const manifest = JSON.parse(
    exportShortlistUidManifest('  Summer Targets  ', [
      makePlayer({ uid: 101 }),
      makePlayer({ uid: undefined }),
      makePlayer({ uid: 202 }),
    ])
  );
  assert.equal(manifest.format, 'fm27-command-hub-shortlist-v1');
  assert.equal(manifest.name, 'Summer Targets');
  assert.equal(manifest.count, 2);
  assert.deepEqual(manifest.playerUids, [101, 202]);
});

test('buildAiResearchContextBlock respects empty-state rule and never leaks raw CA/PA', () => {
  const emptyBlock = buildAiResearchContextBlock({ clubName: 'KVV Zelzate', players: [] });
  assert.match(emptyBlock, /Awaiting \.fm Save/);

  const populated = buildAiResearchContextBlock({
    clubName: 'KVV Zelzate',
    players: [makePlayer()],
    effectivenessFactors: [
      {
        id: 't1',
        area: 'Tactical Understanding',
        label: 'Transition Structure',
        score: 45,
        recommendedSession: 'Transition Press',
      },
    ],
  });
  assert.match(populated, /Top Squad Meta Scores/);
  assert.match(populated, /Tactical Effectiveness Priority Training/);
  assert.match(populated, /\[High\] Tactical Understanding/);
  assert.equal(/\bCA\s*\d+|\bPA\s*\d+/i.test(populated), false);
});
