import test from 'node:test';
import assert from 'node:assert/strict';
import type { PlayerRecord } from '../types/fm27';
import type { RecruitmentTarget } from '../types/fmSave';
import { buildSquadTransferAudit } from './transferAudit';
import { evaluateInGameShortlist } from './shortlistAdviceEngine';

function makeSquadPlayer(
  overrides: Omit<Partial<PlayerRecord>, 'attributes'> & {
    id: string;
    name: string;
    position: string;
    attributes?: Partial<PlayerRecord['attributes']>;
  }
): PlayerRecord {
  const baseAttrs = {
    pace: 11,
    acceleration: 11,
    stamina: 11,
    jumpingReach: 11,
    determination: 11,
    passing: 11,
    finishing: 11,
    tackling: 11,
    firstTouch: 11,
    decisions: 11,
    workRate: 11,
    offTheBall: 11,
    marking: 11,
    positioning: 11,
    anticipation: 11,
    composure: 11,
    concentration: 11,
    crossing: 10,
    dribbling: 10,
    technique: 11,
    vision: 10,
    strength: 11,
    agility: 11,
    balance: 11,
    naturalFitness: 12,
    heading: 11,
    teamwork: 11,
    leadership: 10,
    reflexes: 10,
    handling: 10,
    aerialReach: 10,
    commandOfArea: 10,
    oneOnOnes: 10,
  };
  return {
    number: 10,
    apps: '10',
    minutes: 850,
    rating: 6.85,
    goals: 2,
    xG: 1.8,
    xGPer90: 0.19,
    assists: 1,
    xA: 1.2,
    xAPer90: 0.13,
    drbPer90: 1.0,
    prPassesPer90: 4.0,
    hdrPct: 50,
    intPer90: 1.5,
    tckPct: 70,
    personality: 'Balanced',
    age: 26,
    ability: 3.0,
    potential: 3.0,
    expires: '30/06/2029',
    contractExpiryMonths: 21,
    nation: 'Belgium',
    wagePw: 450,
    status: 'Starter',
    teamSlot: 0,
    ipRole: 'Full-Back',
    oopRole: 'Full-Back',
    notes: '',
    ...overrides,
    attributes: {
      ...baseAttrs,
      ...(overrides.attributes || {}),
    },
  };
}

function makeShortlistTarget(
  overrides: Partial<RecruitmentTarget> & { uid: number; name: string; primaryPosition: string }
): RecruitmentTarget {
  return {
    age: 22,
    nationality: 'Belgium',
    currentClub: 'Free Agent',
    shortlistOrigin: 'in_game_shortlist',
    personality: 'Resolute',
    preferredFoot: 'Right',
    currentWagePw: 0,
    transferValue: 0,
    transferValueState: 'zero',
    isFreeAgent: true,
    isLoanCandidate: false,
    contractExpiryMonths: 0,
    expires: 'Free',
    demandedWageEur: 260,
    scoutBadges: ['Consistent Performer'],
    traits: ['Plays One-Twos'],
    ...overrides,
    attributes: {
      pace: 14,
      acceleration: 14,
      stamina: 14,
      jumpingReach: 12,
      determination: 16,
      passing: 14,
      finishing: 14,
      tackling: 14,
      firstTouch: 14,
      decisions: 14,
      workRate: 15,
      offTheBall: 14,
      marking: 13,
      positioning: 14,
      anticipation: 14,
      composure: 14,
      concentration: 14,
      crossing: 14,
      dribbling: 13,
      technique: 14,
      vision: 13,
      strength: 13,
      agility: 13,
      balance: 13,
      naturalFitness: 14,
      heading: 12,
      teamwork: 14,
      leadership: 12,
      ...(overrides.attributes || {}),
    },
  };
}

test('Shortlist Engine: flags budget-compliant Direct XI Upgrade on a First-Team starter and maps inline by squad player ID', () => {
  const starterRb = makeSquadPlayer({
    id: 'rb-1',
    name: 'Current RB Starter',
    position: 'DR',
    age: 28,
    wagePw: 500,
    ability: 3.5,
    potential: 3.5,
    attributes: { pace: 11, stamina: 10, tackling: 11, positioning: 11, passing: 10, crossing: 9, determination: 10 },
  });
  const backupRb = makeSquadPlayer({
    id: 'rb-2',
    name: 'Backup RB',
    position: 'DR',
    age: 25,
    wagePw: 250,
    ability: 2.5,
    potential: 2.5,
    status: 'Rotation',
  });
  const squad = [starterRb, backupRb];
  const audit = buildSquadTransferAudit(squad, '15/09/2027', {
    balanceNum: -400000,
    wagePayrollWeekly: 3500,
    wageBudgetWeekly: 3600,
  });

  const upgradeRb = makeShortlistTarget({
    uid: 101,
    name: 'Arne De Schepper',
    primaryPosition: 'DR',
    age: 23,
    isFreeAgent: true,
    demandedWageEur: 260,
    personality: 'Model Professional',
    scoutBadges: ['Consistent Performer'],
    traits: ['Gets Forward Whenever Possible'],
  });

  const result = evaluateInGameShortlist({
    shortlistTargets: [upgradeRb],
    squadPlayers: squad,
    audit,
  });

  assert.equal(result.directUpgrades.length, 1);
  assert.equal(result.actionableCount, 1);
  const advice = result.directUpgrades[0];
  assert.equal(advice.tier, 'direct_xi_upgrade');
  assert.equal(advice.targetIncumbent?.id, 'rb-1');
  assert.equal(advice.budget.passesBudgetGate, true);
  assert.ok((advice.budget.netWeeklyWageDelta ?? 0) < 0, 'Expected cheaper weekly wage than incumbent');
  assert.ok(advice.howFitsNow.includes('Current RB Starter'));
  assert.equal(result.bySquadPlayerId['rb-1']?.[0]?.target.uid, 101);
});

test('Shortlist Engine: Strict Club Budget Gate blocks cash-fee upgrade while club is in debt and explains when viable', () => {
  const starterSt = makeSquadPlayer({
    id: 'st-1',
    name: 'Aging Striker',
    position: 'STC',
    age: 30,
    wagePw: 420,
    ability: 3.5,
    potential: 3.5,
    attributes: { finishing: 11, offTheBall: 11, pace: 10, composure: 10 },
  });
  const squad = [starterSt];
  const audit = buildSquadTransferAudit(squad, '15/09/2027', {
    balanceNum: -802198,
    wagePayrollWeekly: 4200,
    wageBudgetWeekly: 4000,
  });

  const expensiveFeeTarget = makeShortlistTarget({
    uid: 202,
    name: 'Expensive Pro League ST',
    primaryPosition: 'STC',
    age: 25,
    currentClub: 'OH Leuven',
    isFreeAgent: false,
    isLoanCandidate: false,
    contractExpiryMonths: 22,
    expires: '30/06/2029',
    currentWagePw: 700,
    demandedWageEur: 700,
    transferValue: 250000,
    transferValueState: 'ok',
    personality: 'Professional',
  });

  const result = evaluateInGameShortlist({
    shortlistTargets: [expensiveFeeTarget],
    squadPlayers: squad,
    audit,
  });

  assert.equal(result.directUpgrades.length, 0);
  assert.equal(result.budgetBlocked.length, 1);
  assert.equal(result.budgetBlocked[0].tier, 'monitor_budget_blocked');
  assert.equal(result.budgetBlocked[0].budget.passesBudgetGate, false);
  assert.match(result.budgetBlocked[0].budget.budgetSummary, /debt/i);
  assert.ok(result.budgetBlocked[0].budget.whenViableNote, 'Expected timing advice when blocked');
});

test('Shortlist Engine: Injury-Prone / Unambitious red flags block false Direct XI Upgrade calls', () => {
  const starterMc = makeSquadPlayer({
    id: 'mc-1',
    name: 'Reliable CM',
    position: 'MC',
    age: 25,
    wagePw: 320,
    ability: 3.5,
    potential: 3.5,
    personality: 'Professional',
  });
  const backupMc1 = makeSquadPlayer({ id: 'mc-2', name: 'CM 2', position: 'MC', age: 24, wagePw: 220, ability: 3.0, potential: 3.0 });
  const backupMc2 = makeSquadPlayer({ id: 'mc-3', name: 'CM 3', position: 'MC', age: 22, wagePw: 180, ability: 2.8, potential: 3.2 });
  const backupMc3 = makeSquadPlayer({ id: 'mc-4', name: 'CM 4', position: 'MC', age: 21, wagePw: 150, ability: 2.5, potential: 3.0 });
  const squad = [starterMc, backupMc1, backupMc2, backupMc3];
  const audit = buildSquadTransferAudit(squad, '15/09/2027', {
    balanceNum: 50000,
    wagePayrollWeekly: 2000,
    wageBudgetWeekly: 3000,
  });

  const redFlagMid = makeShortlistTarget({
    uid: 303,
    name: 'Fragile Casual Midfielder',
    primaryPosition: 'MC',
    age: 24,
    isFreeAgent: true,
    demandedWageEur: 280,
    personality: 'Unambitious',
    scoutBadges: ['Injury-Prone'],
    traits: ['Dwells On Ball'],
  });

  const result = evaluateInGameShortlist({
    shortlistTargets: [redFlagMid],
    squadPlayers: squad,
    audit,
  });

  assert.equal(result.directUpgrades.length, 0);
  assert.equal(result.items[0].character.hasSeriousRedFlag, true);
  assert.equal(result.items[0].tier, 'below_squad_level');
});

test('Shortlist Engine: classifies Future U23 Successor for 28+ Succession Gap and handles empty shortlist cleanly', () => {
  const vetDc1 = makeSquadPlayer({ id: 'dc-1', name: 'Vet CB 1', position: 'DC', age: 31, wagePw: 400, ability: 3.5, potential: 3.5, attributes: { tackling: 14, marking: 14, positioning: 14, jumpingReach: 14, pace: 12, concentration: 14 } });
  const vetDc2 = makeSquadPlayer({ id: 'dc-2', name: 'Vet CB 2', position: 'DC', age: 30, wagePw: 380, ability: 3.4, potential: 3.4, attributes: { tackling: 14, marking: 14, positioning: 14, jumpingReach: 14, pace: 12, concentration: 14 } });
  const vetDc3 = makeSquadPlayer({ id: 'dc-3', name: 'Vet CB 3', position: 'DC', age: 29, wagePw: 200, ability: 3.1, potential: 3.1, attributes: { tackling: 13, marking: 13, positioning: 13, jumpingReach: 13, pace: 11, concentration: 13 } });
  const vetDc4 = makeSquadPlayer({ id: 'dc-4', name: 'Vet CB 4', position: 'DC', age: 29, wagePw: 200, ability: 2.9, potential: 2.9, status: 'Rotation', attributes: { tackling: 13, marking: 13, positioning: 13, jumpingReach: 13, pace: 11, concentration: 13 } });
  const squad = [vetDc1, vetDc2, vetDc3, vetDc4];
  const audit = buildSquadTransferAudit(squad, '15/09/2027', {
    balanceNum: 25000,
    wagePayrollWeekly: 2000,
    wageBudgetWeekly: 3000,
  });

  const u23Cb = makeShortlistTarget({
    uid: 404,
    name: 'Lucas Curto',
    primaryPosition: 'DC',
    age: 20,
    isFreeAgent: true,
    demandedWageEur: 200,
    personality: 'Driven',
    scoutBadges: [],
    traits: [],
    attributes: {
      tackling: 11,
      marking: 11,
      positioning: 11,
      jumpingReach: 12,
      pace: 12,
      acceleration: 12,
      concentration: 11,
      anticipation: 11,
      decisions: 11,
      composure: 10,
      strength: 11,
      passing: 10,
      firstTouch: 10,
      stamina: 12,
      workRate: 12,
      determination: 16,
    },
  });

  const result = evaluateInGameShortlist({
    shortlistTargets: [u23Cb],
    squadPlayers: squad,
    audit,
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].tier, 'future_succession');
  assert.match(result.items[0].howFitsFuture, /Succession Gap/i);

  // Empty shortlist -> zero fake/mock players
  const empty = evaluateInGameShortlist({
    shortlistTargets: [],
    squadPlayers: squad,
    audit,
  });
  assert.equal(empty.items.length, 0);
  assert.equal(empty.actionableCount, 0);
});
