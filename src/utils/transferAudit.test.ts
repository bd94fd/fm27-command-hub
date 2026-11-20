import assert from 'node:assert/strict';
import test from 'node:test';
import { PlayerRecord } from '../types/fm27';
import {
  buildSquadTransferAudit,
  parseSignedMoneyString,
} from './transferAudit';

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

test('parseSignedMoneyString accurately parses negative balances in both minus and parentheses formats', () => {
  assert.equal(parseSignedMoneyString('(£749K)'), -749_000);
  assert.equal(parseSignedMoneyString('-£749K'), -749_000);
  assert.equal(parseSignedMoneyString('£1.50M'), 1_500_000);
  assert.equal(parseSignedMoneyString('-£2.25M'), -2_250_000);
});

test('buildSquadTransferAudit detects negative club balance, protects expiring U21 assets, and guards thin depth', () => {
  const squad: PlayerRecord[] = [
    makePlayer({
      id: 'u21-expiring',
      name: 'Wonderkid Prospect',
      age: 19,
      ability: 2.5,
      potential: 4.5,
      minutes: 0,
      rating: null,
      expires: '30/06/2028',
      wagePw: 90,
      status: 'Youth',
    }),
    makePlayer({
      id: 'star-expiring',
      name: 'Key Starter',
      ability: 4.0,
      minutes: 360,
      expires: '30/06/2028',
      wagePw: 300,
    }),
    makePlayer({
      id: 'thin-earner',
      name: 'Only GK Earner',
      position: 'GK',
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
      id: 'youth-loan',
      name: 'Loan Prospect',
      age: 18,
      ability: 2.0,
      potential: 4.0,
      minutes: 0,
      rating: null,
      expires: '30/06/2029',
      wagePw: 80,
      status: 'Youth',
    }),
  ];

  const audit = buildSquadTransferAudit(squad, '15/09/2027', {
    balanceLabel: '(£749K)',
    wagePayrollWeekly: 10257,
    wageBudgetWeekly: 10203,
  });

  assert.equal(audit.clubProfile.isInDebt, true);
  assert.equal(audit.clubProfile.balanceNum, -749_000);
  assert.equal(audit.clubProfile.isOverWageBudget, true);

  const byId = Object.fromEntries(audit.playerAdvice.map((a) => [a.player.id, a]));
  assert.equal(byId['u21-expiring'].verdict, 'Protect Youth Asset');
  assert.equal(byId['star-expiring'].verdict, 'Renew Now');
  assert.equal(byId['thin-earner'].verdict, 'Replace Before Selling');
  assert.equal(byId['youth-loan'].verdict, 'Loan Out');
});
