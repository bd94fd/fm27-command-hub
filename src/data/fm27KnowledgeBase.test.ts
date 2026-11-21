import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFm27KnowledgeGroundingBlock,
  FM27_KNOWLEDGE_BASE,
  FM27_ROLE_CATALOG,
  RETIRED_FM24_DUTY_PATTERNS,
  RETIRED_FM24_ROLES,
  searchFm27KnowledgeBase,
  verifyFm27Accuracy,
} from './fm27KnowledgeBase';
import {
  FM27_ROLES,
  rankSquadForFm27Role,
  scorePlayerForFm27Role,
} from '../utils/fm27RoleMatcher';
import { PlayerRecord } from '../types/fm27';

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

test('Pass 1: FM27_ROLE_CATALOG exposes all 68 pure FM27 IP/OOP roles with zero legacy duties or retired FM24 roles', () => {
  assert.equal(FM27_ROLE_CATALOG.length, 68);
  assert.equal(FM27_ROLE_CATALOG.length, FM27_ROLES.length);

  const ipCount = FM27_ROLE_CATALOG.filter((r) => r.phase === 'IP').length;
  const oopCount = FM27_ROLE_CATALOG.filter((r) => r.phase === 'OOP').length;
  assert.ok(ipCount > 0 && oopCount > 0);
  assert.equal(ipCount + oopCount, 68);

  for (const role of FM27_ROLE_CATALOG) {
    assert.ok(role.phase === 'IP' || role.phase === 'OOP');
    for (const retired of RETIRED_FM24_ROLES) {
      assert.equal(
        new RegExp(`\\b${retired.replace(/[()]/g, '\\$&')}\\b`, 'i').test(role.name),
        false,
        `Found retired FM24 role name in FM27_ROLE_CATALOG: ${role.name}`
      );
    }
    for (const dutyRe of RETIRED_FM24_DUTY_PATTERNS) {
      assert.equal(
        dutyRe.test(role.name),
        false,
        `Found legacy FM24 duty syntax in FM27_ROLE_CATALOG: ${role.name}`
      );
    }
  }
});

test('Pass 1: scorePlayerForFm27Role & rankSquadForFm27Role rank natural position fits accurately', () => {
  const sweeperKeeper = FM27_ROLES.find(
    (r) => r.name === 'Sweeper Keeper' && r.positionGroup === 'Goalkeeper'
  );
  const poacher = FM27_ROLES.find(
    (r) => r.name === 'Poacher' && r.positionGroup === 'Striker'
  );
  assert.ok(sweeperKeeper);
  assert.ok(poacher);

  const makeMockPlayer = (
    id: string,
    name: string,
    position: string,
    attrs: Partial<PlayerRecord['attributes']>
  ): PlayerRecord => ({
    id,
    number: 1,
    name,
    position,
    apps: '5',
    minutes: 450,
    rating: 7.2,
    goals: 0,
    xG: 0,
    xGPer90: 0,
    assists: 0,
    xA: 0,
    xAPer90: 0,
    drbPer90: 0,
    prPassesPer90: 0,
    hdrPct: 50,
    intPer90: 1,
    tckPct: 75,
    personality: 'Professional',
    age: 24,
    ability: 3.5,
    potential: 4.0,
    expires: '30/06/2029',
    nation: 'BEL',
    wagePw: 400,
    status: 'Starter',
    attributes: {
      pace: 11,
      acceleration: 11,
      stamina: 12,
      jumpingReach: 12,
      determination: 14,
      passing: 11,
      finishing: 10,
      tackling: 10,
      firstTouch: 11,
      decisions: 12,
      workRate: 12,
      offTheBall: 10,
      ...attrs,
    },
    ipRole: 'Centre Forward',
    oopRole: 'Central Outlet Centre Forward',
    notes: '',
  });

  const gk = makeMockPlayer('gk1', 'Lars Verhaegen', 'GK', {
    reflexes: 15,
    handling: 14,
    rushingOut: 15,
    anticipation: 15,
    decisions: 14,
    finishing: 2,
  });
  const st = makeMockPlayer('st1', 'Mbey Epolo', 'ST (C)', {
    finishing: 16,
    offTheBall: 15,
    anticipation: 14,
    composure: 14,
    acceleration: 15,
    pace: 14,
    rushingOut: 2,
  });
  const cb = makeMockPlayer('cb1', 'Quinten Boudry', 'D (C)', {
    tackling: 15,
    marking: 14,
    jumpingReach: 15,
    finishing: 5,
    rushingOut: 2,
  });

  assert.ok(
    scorePlayerForFm27Role(gk, sweeperKeeper) > scorePlayerForFm27Role(st, sweeperKeeper),
    'Natural GK must outscore Striker for Sweeper Keeper'
  );
  assert.ok(
    scorePlayerForFm27Role(st, poacher) > scorePlayerForFm27Role(gk, poacher),
    'Natural Striker must outscore GK for Poacher'
  );

  const topStrikers = rankSquadForFm27Role([gk, cb, st], poacher, 3);
  assert.equal(topStrikers.length, 1);
  assert.equal(topStrikers[0].player.id, 'st1');
  assert.equal(topStrikers[0].matchedPosition, true);
});

test('KnowledgeBasePanel live squad rendering reflects live hydrated wages/stars and never shows Load a .fm save when players are loaded', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const kbSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/KnowledgeBasePanel.tsx'),
    'utf8'
  );
  assert.match(kbSource, /players\.length\s*>\s*0/);
  assert.match(kbSource, /No natural\/accomplished fits/);

  const channelForward = FM27_ROLES.find(
    (r) => r.name === 'Channel Forward' && r.positionGroup === 'Striker'
  );
  assert.ok(channelForward);
  const livePlayers: PlayerRecord[] = [
    {
      id: 'soren-coens',
      number: 9,
      name: 'Søren Coens',
      position: 'ST (C)',
      apps: '10',
      minutes: 850,
      rating: 7.3,
      goals: 7,
      xG: 5.5,
      xGPer90: 0.58,
      assists: 2,
      xA: 1.4,
      xAPer90: 0.15,
      drbPer90: 1.5,
      prPassesPer90: 1.1,
      hdrPct: 52,
      intPer90: 0.3,
      tckPct: 45,
      personality: 'Professional',
      age: 23,
      ability: 3.5,
      potential: 4.0,
      expires: '30/06/2029',
      nation: 'BEL',
      wagePw: 525,
      status: 'Starter',
      positionRatings: { ST: 20 },
      attributes: {
        pace: 14,
        acceleration: 14,
        stamina: 13,
        jumpingReach: 12,
        determination: 14,
        passing: 11,
        finishing: 14,
        tackling: 6,
        firstTouch: 13,
        decisions: 12,
        workRate: 13,
        offTheBall: 15,
      },
      ipRole: 'Channel Forward',
      oopRole: 'Central Outlet Centre Forward',
      notes: '',
    },
  ];
  const ranked = rankSquadForFm27Role(livePlayers, channelForward, 3);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].player.wagePw, 525);
  assert.equal(ranked[0].player.ability, 3.5);
});

