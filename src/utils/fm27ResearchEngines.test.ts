import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSaveCacheKey,
  createSaveHistoryPoint,
  diffSaveHistoryPoints,
} from '../services/saveCache';
import { PlayerRecord } from '../types/fm27';
import {
  evaluateDualPhaseRoles,
  FM27_TOUCHLINE_ROLES,
  recommendTrainingFromEffectiveness,
} from './dualPhaseRoleEngine';
import {
  buildAiResearchContextBlock,
  exportShortlistToCsv,
  exportShortlistUidManifest,
} from './fmfShortlistExporter';
import {
  computeClubBenchmark,
  computeStarterGain,
  evaluateClubReputationFit,
  evaluatePlayerMetaScore,
} from './metaScoreEngine';

function makePlayer(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id: 'p-1',
    uid: 1001,
    number: 9,
    name: 'Test Striker',
    position: 'STC',
    apps: '10',
    minutes: 900,
    rating: 7.2,
    goals: 6,
    xG: 5.1,
    xGPer90: 0.51,
    assists: 2,
    xA: 1.8,
    xAPer90: 0.18,
    drbPer90: 2.1,
    prPassesPer90: 3.0,
    hdrPct: 45,
    intPer90: 0.5,
    tckPct: 60,
    personality: 'Professional',
    age: 20,
    ability: 3.0,
    potential: 4.5,
    expires: '2028-06-30',
    nation: 'BEL',
    wagePw: 850,
    marketValue: 250000,
    status: 'Starter',
    positionRatings: { STC: 20, AMR: 16 },
    attributes: {
      pace: 16,
      acceleration: 16,
      stamina: 14,
      jumpingReach: 13,
      determination: 15,
      passing: 12,
      finishing: 15,
      tackling: 7,
      firstTouch: 14,
      decisions: 13,
      workRate: 14,
      offTheBall: 15,
      dribbling: 14,
      balance: 13,
      concentration: 12,
      anticipation: 14,
      agility: 14,
      strength: 12,
      composure: 13,
      flair: 13,
      longShots: 11,
      aggression: 11,
      heading: 12,
      technique: 14,
      vision: 12,
      teamwork: 13,
      positioning: 8,
    },
    ipRole: 'Channel Forward',
    oopRole: 'Centre Forward',
    notes: '',
    ...overrides,
  };
}

test('Plan 1: saveCache builds deterministic keys and detects growth + newgens', () => {
  assert.equal(buildSaveCacheKey('Auto Save.fm', '2026-11-22'), 'auto_save.fm::2026-11-22');

  const prev = createSaveHistoryPoint({
    saveName: 'auto save.fm',
    inGameDate: '2026-08-01',
    clubName: 'KVV Zelzate',
    players: [
      makePlayer({ uid: 1001, name: 'Riser', ability: 2.5, marketValue: 100000 }),
      makePlayer({ uid: 1002, name: 'Faller', ability: 3.5, marketValue: 200000 }),
    ],
  });

  const curr = createSaveHistoryPoint({
    saveName: 'auto save.fm',
    inGameDate: '2026-11-22',
    clubName: 'KVV Zelzate',
    players: [
      makePlayer({ uid: 1001, name: 'Riser', ability: 3.25, marketValue: 180000 }),
      makePlayer({ uid: 1002, name: 'Faller', ability: 3.0, marketValue: 150000 }),
      makePlayer({ uid: 9999, name: 'Intake Wonderkid', age: 16, ability: 2.0, potential: 5.0 }),
    ],
  });

  const diff = diffSaveHistoryPoints(prev, curr);
  assert.equal(diff.risers.length, 1);
  assert.equal(diff.risers[0].uid, 1001);
  assert.equal(diff.risers[0].abilityDelta, 0.75);
  assert.equal(diff.fallers.length, 1);
  assert.equal(diff.fallers[0].uid, 1002);
  assert.equal(diff.newgens.length, 1);
  assert.equal(diff.newgens[0].name, 'Intake Wonderkid');
});

test('Plan 2: dualPhaseRoleEngine scores IP & OOP roles independently and recommends training', () => {
  assert.ok(FM27_TOUCHLINE_ROLES.length > 20, 'Touchline catalog should be loaded');
  const striker = makePlayer();
  const profile = evaluateDualPhaseRoles(striker, 3);

  assert.ok(profile.bestInPossession !== null, 'Should find best IP role');
  assert.ok(profile.bestOutOfPossession !== null, 'Should find best OOP role');
  assert.equal(profile.bestInPossession?.phase, 'in');
  assert.equal(profile.bestOutOfPossession?.phase, 'out');
  assert.ok((profile.bestInPossession?.overall ?? 0) > 50);

  const recs = recommendTrainingFromEffectiveness(
    [
      {
        id: 'tu-1',
        area: 'Tactical Understanding',
        label: 'Out of Possession Shape',
        score: 42,
        recommendedSession: 'Defensive Shape',
      },
      {
        id: 'pa-1',
        area: 'Player Ability',
        label: 'Finishing Sharpness',
        score: 78,
        recommendedSession: 'Chance Conversion',
      },
      {
        id: 'nm-1',
        area: 'Next Match Info',
        label: 'Opposition Set Pieces',
        score: 55,
        recommendedSession: 'Match Preview + Set Pieces',
      },
    ],
    2
  );

  assert.equal(recs.length, 2);
  assert.equal(recs[0].priority, 'High');
  assert.equal(recs[0].recommendedSession, 'Defensive Shape');
  assert.equal(recs[1].priority, 'Medium');
});

test('Plan 3: metaScoreEngine calculates FM-Arena outfield/GK Meta, starter gain, rep fit & benchmarks', () => {
  const fastStriker = makePlayer();
  const evalOutfield = evaluatePlayerMetaScore(fastStriker);
  assert.equal(evalOutfield.isGoalkeeper, false);
  assert.ok((evalOutfield.metaScore ?? 0) >= 14.0);
  assert.ok((evalOutfield.paMetaScore ?? 0) > (evalOutfield.metaScore ?? 0));

  const gk = makePlayer({
    uid: 2001,
    name: 'Test GK',
    position: 'GK',
    positionRatings: { GK: 20 },
    attributes: {
      ...makePlayer().attributes,
      reflexes: 16,
      agility: 15,
      acceleration: 13,
      pace: 12,
      aerialReach: 15,
    },
  });
  const evalGk = evaluatePlayerMetaScore(gk);
  assert.equal(evalGk.isGoalkeeper, true);
  assert.ok((evalGk.metaScore ?? 0) >= 14.0);

  const slowerStarter = makePlayer({
    uid: 1002,
    attributes: { ...makePlayer().attributes, pace: 10, acceleration: 10 },
  });
  const gain = computeStarterGain(fastStriker, slowerStarter);
  assert.equal(gain.isUpgrade, true);
  assert.ok((gain.metaGain ?? 0) > 2.0);

  assert.equal(evaluateClubReputationFit(3200, 3000).likelihood, 'Likely Interested');
  assert.equal(evaluateClubReputationFit(7000, 3000).likelihood, 'Out of Reach');

  const bench = computeClubBenchmark('KVV Zelzate', [fastStriker, slowerStarter, gk]);
  assert.equal(bench.squadCount, 3);
  assert.equal(bench.medianValue, 250000);
  assert.ok((bench.top11AverageMeta ?? 0) > 12);
});

test('Plan 4: fmfShortlistExporter builds CSV, UID manifest, and awaiting-save AI context', () => {
  const emptyCtx = buildAiResearchContextBlock({ clubName: 'KVV Zelzate', players: [] });
  assert.match(emptyCtx, /Awaiting \.fm Save/);

  const players = [makePlayer({ uid: 424242, name: 'Zelzate Target' })];
  const csv = exportShortlistToCsv(players);
  assert.match(csv, /UID,Name,Position/);
  assert.match(csv, /424242,Zelzate Target,STC/);

  const manifest = JSON.parse(exportShortlistUidManifest('Summer Targets', players));
  assert.equal(manifest.count, 1);
  assert.deepEqual(manifest.playerUids, [424242]);

  const ctx = buildAiResearchContextBlock({ clubName: 'KVV Zelzate', players });
  assert.match(ctx, /Zelzate Target/);
  assert.match(ctx, /Meta /);
});
