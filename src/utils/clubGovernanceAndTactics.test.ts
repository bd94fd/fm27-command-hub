import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlayerRecord } from '../types/fm27.ts';
import type { DecodedFmSavePayload } from './fmSaveHydrator.ts';
import { createSeedFm27BinaryDictionary } from './fm27BinaryDictionary.ts';
import {
  buildClubGovernanceState,
  buildLastMatchTacticBlueprint,
} from './clubGovernanceAndTactics.ts';

function makePlayer(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id: 'p1',
    uid: 2001,
    number: 8,
    name: 'Bram Verhaegen',
    age: 24,
    position: 'MC',
    ability: 3.5,
    potential: 4.0,
    wagePw: 750,
    expires: '30/06/2028',
    nation: 'Belgium',
    personality: 'Balanced',
    status: 'Starter',
    contractDetails: {
      promisedPlayingTime: 'Star Player',
      releaseClauses: [],
      optionalExtensionYears: 0,
      bonuses: {},
      loanWageContributionPct: null,
    },
    ipRole: 'Box-to-Box Midfielder',
    oopRole: 'Pressing Central Midfielder',
    condition: 95,
    morale: 'Good',
    apps: '1',
    minutes: 90,
    goals: 0,
    xG: 0.1,
    xGPer90: 0.1,
    assists: 0,
    xA: 0.2,
    xAPer90: 0.2,
    drbPer90: 1.0,
    prPassesPer90: 4.0,
    hdrPct: 45,
    intPer90: 1.2,
    tckPct: 70,
    rating: 6.9,
    notes: '',
    attributes: {
      pace: 14,
      acceleration: 14,
      stamina: 15,
      jumpingReach: 12,
      determination: 14,
      passing: 14,
      finishing: 10,
      tackling: 13,
      firstTouch: 14,
      decisions: 14,
      workRate: 14,
      offTheBall: 13,
    },
    ...overrides,
  };
}

test('buildClubGovernanceState never fabricates board/supporter grades and derives league rule objectives + competitive promise audits', () => {
  const decoded = {
    meta: {
      clubName: 'KVV Zelzate',
      managerName: 'Bobby Dean',
      gameDateDmy: '15/11/2027',
    },
    staff: [
      {
        uid: 99,
        name: 'Bobby Dean',
        role: 'Manager',
        wagePw: 1200,
        expires: '30/06/2029',
        age: 34,
        nation: 'England',
      },
    ],
    leagueStanding: {
      competitionName: 'Challenger Pro League',
      position: 2,
      totalTeams: 16,
      played: 10,
      won: 7,
      drawn: 2,
      lost: 1,
      points: 23,
    },
    competitionRules: {
      promotionPlaces: 2,
      playoffPlaces: 4,
      relegationPlaces: 2,
    },
    playedMatches: [
      // Pre-season friendlies must NOT inflate playing-time promise denominator
      { dateDmy: '10/07/2027', competition: 'Friendly', opponent: 'Test FC', score: '3-0' },
      { dateDmy: '17/07/2027', competition: 'Friendly', opponent: 'Test 2', score: '2-0' },
      // 10 current-season competitive matches
      ...Array.from({ length: 10 }, (_, idx) => ({
        dateDmy: `${String(idx + 1).padStart(2, '0')}/09/2027`,
        competition: 'Challenger Pro League',
        opponent: `Club ${idx + 1}`,
        score: '2-1',
      })),
    ],
  } as unknown as DecodedFmSavePayload;

  // Player promised Star Player (>=68% minutes) has only played 90 mins out of 10*90=900 (10%) -> breached!
  const underplayedStar = makePlayer({
    uid: 2001,
    apps: '1',
    minutes: 90,
  });

  const gov = buildClubGovernanceState(decoded, [underplayedStar], createSeedFm27BinaryDictionary());

  assert.equal(gov.managerContract.available, true);
  assert.equal(gov.managerContract.wagePw, 1200);
  assert.equal(gov.boardConfidence.available, false);
  assert.equal(gov.boardConfidence.grade, null);
  assert.equal(gov.supporterConfidence.available, false);
  assert.equal(gov.supporterConfidence.grade, null);

  assert.equal(gov.boardObjectives.length, 2);
  assert.equal(gov.boardObjectives[0].source, 'league_rule_context');
  assert.equal(gov.boardObjectives[0].status, 'on_track');

  assert.ok(gov.promisesAtRiskCount >= 1);
  assert.equal(gov.playerPromiseAudits[0].status, 'breached');
});

test('buildLastMatchTacticBlueprint returns null without tactics and never fabricates last-match ratings from older fixtures', () => {
  assert.equal(buildLastMatchTacticBlueprint(null, []), null);

  const p1 = makePlayer({ uid: 2001, name: 'Bram Verhaegen' });
  const p2 = makePlayer({ uid: 2002, name: 'No Recent App', position: 'AML' });

  const decoded = {
    meta: { clubName: 'KVV Zelzate', gameDateDmy: '15/11/2027' },
    playedMatches: [
      {
        dateIso: '2027-11-12',
        dateDmy: '12/11/2027',
        opponent: 'RWDM',
        competition: 'Challenger Pro League',
        score: '2-1',
      },
    ],
    playerMatchStats: {
      '2001': [
        { date: '2027-10-01', opponent: 'Older FC', rating: 6.1, goals: 0, assists: 0, minutes: 90 },
        { date: '2027-11-12', opponent: 'RWDM', rating: 7.8, goals: 1, assists: 1, minutes: 90 },
      ],
      '2002': [
        { date: '2027-09-15', opponent: 'Ancient FC', rating: 8.4, goals: 2, assists: 0, minutes: 90 },
      ],
    },
    tactics: [
      {
        index: 0,
        name: '4-3-3 Counter Positive',
        mentality: 'Positive',
        inPossessionFormation: '4-3-3 DM Wide',
        outOfPossessionFormation: '4-5-1',
        teamInstructions: {
          inPossession: ['Setting 1', 'Play Out of Defence'],
          inTransition: ['Counter-Press'],
          outOfPossession: ['High Press'],
        },
        slots: [
          {
            slotIndex: 0,
            position: 'MC',
            outOfPossessionPosition: 'MC',
            playerUid: 2001,
            inPossessionRole: 'Box-to-Box Midfielder',
            outOfPossessionRole: 'Pressing Central Midfielder',
          },
          {
            slotIndex: 1,
            position: 'AML',
            outOfPossessionPosition: 'AML',
            playerUid: 2002,
            inPossessionRole: 'Inside Forward',
            outOfPossessionRole: 'Tracking Winger',
          },
        ],
      },
    ],
  } as unknown as DecodedFmSavePayload;

  const bp = buildLastMatchTacticBlueprint(
    decoded,
    [p1, p2],
    0,
    { bySlot: {}, byFingerprint: {} },
    createSeedFm27BinaryDictionary()
  );

  assert.ok(bp !== null);
  assert.equal(bp.tacticName, '4-3-3 Counter Positive');
  assert.equal(bp.starters.length, 2);
  assert.equal(bp.starters[0].inPossessionRole, 'Box-to-Box Midfielder');
  assert.equal(bp.starters[0].lastMatchRating, 7.8);
  // Player 2 did not play in the latest match -> must NOT fabricate 8.4 from September!
  assert.equal(bp.starters[1].lastMatchRating ?? null, null);
  assert.deepEqual(bp.teamInstructions.inPossession, ['Play Out of Defence']);
});

test('a staff row with no name cannot crash the manager contract lookup', () => {
  const decoded = {
    meta: { clubName: 'KVV Zelzate', managerName: 'Bobby Dean', gameDateDmy: '15/11/2027' },
    staff: [
      { uid: 98, role: 'Scout', wagePw: 400, expires: '30/06/2028', age: 51, nation: 'Belgium' },
      { uid: 99, role: 'Manager', wagePw: 1200, expires: '30/06/2029', age: 34, nation: 'England' },
    ],
  } as unknown as DecodedFmSavePayload;

  const gov = buildClubGovernanceState(decoded, [makePlayer()], createSeedFm27BinaryDictionary());

  assert.equal(gov.managerContract.available, true);
  assert.equal(gov.managerContract.wagePw, 1200);
});

test('an unnamed staff row does not stop a named manager from being matched', () => {
  const decoded = {
    meta: { clubName: 'KVV Zelzate', managerName: 'Bobby Dean', gameDateDmy: '15/11/2027' },
    staff: [
      { uid: 98, role: 'Scout', wagePw: 400 },
      { uid: 99, name: 'Bobby Dean', role: 'Manager', wagePw: 1200, expires: '30/06/2029' },
    ],
  } as unknown as DecodedFmSavePayload;

  const gov = buildClubGovernanceState(decoded, [makePlayer()], createSeedFm27BinaryDictionary());

  assert.equal(gov.managerContract.available, true);
  assert.equal(gov.managerContract.wagePw, 1200);
  assert.equal(gov.managerContract.expires, '30/06/2029');
});
