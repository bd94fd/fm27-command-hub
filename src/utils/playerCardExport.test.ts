import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLAYER_CARD_HEIGHT,
  PLAYER_CARD_WIDTH,
  buildPlayerCardModel,
  exportPlayerCardPng,
  slugifyPlayerName,
} from './playerCardExport.ts';
import type { PlayerRecord } from '../types/fm27';

const basePlayer = (overrides: Partial<PlayerRecord> = {}): PlayerRecord =>
  ({
    id: 'p1',
    uid: 101,
    name: 'René Vanden Borre',
    position: 'GK',
    age: 23,
    ability: 4.0,
    potential: 4.5,
    preferredFoot: 'Right',
    personality: 'Balanced',
    nation: 'Belgium',
    wagePw: 432,
    expires: '30 Jun 2029',
    ipRole: 'Goalkeeper',
    oopRole: 'Goalkeeper',
    attributes: {
      reflexes: 15,
      handling: 14,
      commandOfArea: 12,
      aerialReach: 16,
      oneOnOnes: 13,
      kicking: 11,
      decisions: 12,
      positioning: 13,
      determination: 14,
      agility: 15,
      pace: 8,
      passing: 9,
      acceleration: 8,
      stamina: 12,
      jumpingReach: 16,
      firstTouch: 7,
      finishing: 2,
      tackling: 5,
      workRate: 12,
      offTheBall: 4,
    },
    ...overrides,
  }) as unknown as PlayerRecord;

const analysis = {
  physical: {
    score: 78,
    tier: 'Elite',
    topSpeedKmh: 31.4,
    durability: { tier: 'Reliable' },
  },
} as unknown as Parameters<typeof buildPlayerCardModel>[0]['analysis'];

test('the card is 760 by 500 and named after the player', () => {
  assert.equal(PLAYER_CARD_WIDTH, 760);
  assert.equal(PLAYER_CARD_HEIGHT, 500);
  const model = buildPlayerCardModel({
    player: basePlayer(),
    analysis,
    effectiveIpRole: 'Goalkeeper',
    effectiveOopRole: 'Goalkeeper',
    isGoalkeeper: true,
    scoutBadges: [],
  });
  assert.equal(model.name, 'René Vanden Borre');
  assert.equal(model.slug, 'ren-vanden-borre');
  assert.equal(model.starLine, '4.0★ / 4.5★ Pot  ·  GK');
});

test('goalkeepers get keeper attributes, outfield players get outfield ones', () => {
  const gk = buildPlayerCardModel({
    player: basePlayer(),
    analysis,
    effectiveIpRole: 'Goalkeeper',
    effectiveOopRole: 'Goalkeeper',
    isGoalkeeper: true,
    scoutBadges: [],
  });
  assert.deepEqual(
    gk.keyGrid.map((t) => t.label),
    [
      'Reflexes',
      'Handling',
      'Command Area',
      'Aerial Reach',
      'One on Ones',
      'Kicking',
      'Decisions',
      'Positioning',
      'Determination',
      'Agility',
      'Pace',
      'Passing',
    ]
  );
  assert.equal(gk.keyGrid[0].value, 15);

  const outfield = buildPlayerCardModel({
    player: basePlayer({ position: 'ST' }),
    analysis,
    effectiveIpRole: 'Advanced Forward',
    effectiveOopRole: 'Pressing Forward',
    isGoalkeeper: false,
    scoutBadges: [],
  });
  assert.equal(outfield.keyGrid.length, 12);
  assert.equal(outfield.keyGrid[0].label, 'Pace');
  assert.ok(!outfield.keyGrid.some((t) => t.label === 'Reflexes'));
});

test('missing keeper attributes fall back to 10 rather than blank', () => {
  const model = buildPlayerCardModel({
    player: basePlayer({ attributes: { pace: 9 } as PlayerRecord['attributes'] }),
    analysis,
    effectiveIpRole: 'Goalkeeper',
    effectiveOopRole: 'Goalkeeper',
    isGoalkeeper: true,
    scoutBadges: [],
  });
  assert.equal(model.keyGrid[0].value, 10);
});

test('the engine summary and role lines carry the numbers a manager reads', () => {
  const model = buildPlayerCardModel({
    player: basePlayer(),
    analysis,
    effectiveIpRole: 'Goalkeeper',
    effectiveOopRole: 'Goalkeeper',
    isGoalkeeper: true,
    scoutBadges: [],
  });
  assert.equal(
    model.engineSummary,
    'Physical 78/100 (Elite) · 31.4 km/h · Durability: Reliable'
  );
  assert.match(model.ipLine, /^IN POSSESSION \(IP\): Goalkeeper \(\d+% Fit\)$/);
  assert.match(model.oopLine, /^OUT OF POSSESSION \(OOP\): Goalkeeper \(\d+% Fit\)$/);
});

test('the footer shows scout badges, or the hub fallback when there are none', () => {
  const withBadges = buildPlayerCardModel({
    player: basePlayer(),
    analysis,
    effectiveIpRole: 'Goalkeeper',
    effectiveOopRole: 'Goalkeeper',
    isGoalkeeper: true,
    scoutBadges: ['Elite Shot Stopper', 'Set-Piece Wall'],
  });
  assert.equal(withBadges.badgeLine, 'Scout Badges: Elite Shot Stopper · Set-Piece Wall');

  const without = buildPlayerCardModel({
    player: basePlayer(),
    analysis,
    effectiveIpRole: 'Goalkeeper',
    effectiveOopRole: 'Goalkeeper',
    isGoalkeeper: true,
    scoutBadges: [],
  });
  assert.match(without.badgeLine, /Relative Squad Stars/);
});

test('the footer never runs past the card edge', () => {
  const model = buildPlayerCardModel({
    player: basePlayer(),
    analysis,
    effectiveIpRole: 'Goalkeeper',
    effectiveOopRole: 'Goalkeeper',
    isGoalkeeper: true,
    scoutBadges: Array.from({ length: 12 }, (_, i) => `Badge ${i}`),
  });
  assert.ok(model.badgeLine.length <= 88);
});

test('names with accents and punctuation still make a safe file name', () => {
  assert.equal(slugifyPlayerName('René Vanden Borre'), 'ren-vanden-borre');
  assert.equal(slugifyPlayerName("Jean-Luc O'Neill"), 'jean-luc-o-neill');
  assert.equal(slugifyPlayerName('  '), 'fm27-player');
  assert.equal(slugifyPlayerName('★★★'), 'fm27-player');
});

test('export reports failure instead of throwing when there is no browser document', () => {
  const model = buildPlayerCardModel({
    player: basePlayer(),
    analysis,
    effectiveIpRole: 'Goalkeeper',
    effectiveOopRole: 'Goalkeeper',
    isGoalkeeper: true,
    scoutBadges: [],
  });
  assert.equal(exportPlayerCardPng(model, undefined), false);
});

test('export draws the card and clicks a download link when a document exists', () => {
  const calls: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'createLinearGradient') {
          return () => ({ addColorStop: () => undefined });
        }
        return () => {
          calls.push(prop);
          return undefined;
        };
      },
      set(_t, prop: string) {
        calls.push(`set:${prop}`);
        return true;
      },
    }
  ) as unknown as CanvasRenderingContext2D;

  const link = { download: '', href: '', click: () => calls.push('click') };
  const doc = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return { width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,xx' };
      }
      return link;
    },
  } as unknown as Document;

  const model = buildPlayerCardModel({
    player: basePlayer(),
    analysis,
    effectiveIpRole: 'Goalkeeper',
    effectiveOopRole: 'Goalkeeper',
    isGoalkeeper: true,
    scoutBadges: [],
  });

  assert.equal(exportPlayerCardPng(model, doc), true);
  assert.equal(link.download, 'ren-vanden-borre-card.png');
  assert.equal(link.href, 'data:image/png;base64,xx');
  assert.ok(calls.includes('click'));
  assert.ok(calls.includes('fillText'));
  assert.ok(calls.includes('fillRect'));
  assert.ok(calls.includes('strokeRect'));
});
