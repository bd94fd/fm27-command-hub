import assert from 'node:assert/strict';
import test from 'node:test';
import { PlayerRecord } from '../types/fm27';
import { buildSquadTransferAudit } from './transferAudit';

function makePlayer(overrides: Partial<PlayerRecord>): PlayerRecord {
  return {
    id: 'p1',
    number: 10,
    name: 'Test Player',
    position: 'M (C)',
    apps: '4',
    minutes: 360,
    rating: 7.2,
    goals: 1,
    xG: 0.8,
    xGPer90: 0.2,
    assists: 1,
    xA: 0.7,
    xAPer90: 0.18,
    drbPer90: 1.0,
    prPassesPer90: 4.0,
    hdrPct: 50,
    intPer90: 1.5,
    tckPct: 75,
    personality: 'Professional',
    age: 24,
    ability: 3.5,
    potential: 4.0,
    expires: '30/06/2028',
    nation: 'BEL',
    wagePw: 250,
    status: 'Starter',
    attributes: {
      pace: 13,
      acceleration: 13,
      stamina: 13,
      jumpingReach: 12,
      determination: 14,
      passing: 13,
      finishing: 11,
      tackling: 12,
      firstTouch: 13,
      decisions: 13,
      workRate: 13,
      offTheBall: 12,
    },
    ipRole: 'Central Midfielder (CM)',
    oopRole: 'Central Midfielder (CM)',
    notes: '',
    ...overrides,
  };
}

test('buildSquadTransferAudit generates tailored Renew, Sell, Loan Out, and Let Expire verdicts', () => {
  const squad: PlayerRecord[] = [
    makePlayer({
      id: 'star-expiring',
      name: 'Key Starter',
      ability: 4.0,
      minutes: 360,
      expires: '30/06/2028',
      wagePw: 300,
    }),
    makePlayer({
      id: 'deadwood',
      name: 'Unused High Earner',
      age: 27,
      ability: 2.5,
      potential: 2.5,
      minutes: 0,
      rating: null,
      expires: '30/06/2029',
      wagePw: 500,
      status: 'Rotation',
    }),
    makePlayer({
      id: 'youth',
      name: 'Teen Prospect',
      age: 18,
      ability: 2.0,
      potential: 4.0,
      minutes: 0,
      rating: null,
      expires: '30/06/2029',
      wagePw: 80,
      status: 'Youth',
    }),
    makePlayer({
      id: 'free-exit',
      name: 'Expiring Surplus',
      age: 28,
      ability: 2.0,
      potential: 2.0,
      minutes: 15,
      rating: 6.4,
      expires: '30/06/2028',
      wagePw: 220,
      status: 'Surplus',
    }),
  ];

  const audit = buildSquadTransferAudit(squad, '15/09/2027');
  const byId = Object.fromEntries(audit.playerAdvice.map((a) => [a.player.id, a]));

  assert.equal(byId['star-expiring'].verdict, 'Renew Now');
  assert.equal(byId['deadwood'].verdict, 'Sell / Transfer List');
  assert.equal(byId['youth'].verdict, 'Loan Out');
  assert.equal(byId['free-exit'].verdict, 'Let Expire');
  assert.equal(audit.potentialWeeklySavings, 800);
});
