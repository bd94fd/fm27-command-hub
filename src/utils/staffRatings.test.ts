import assert from 'node:assert/strict';
import test from 'node:test';
import { StaffRecord } from '../types/fm27';
import {
  calculateAllStaffRoleRatings,
  computeWeeklyStaffPayroll,
  evaluateBackroomDepartmentEfficiency,
  formatStaffJobRatings,
  formatStars,
  formatWeeklyStaffPayroll,
  getBestStaffRoleRating,
  isStaffContractExpiringSoon,
  STAFF_CONTRACT_EXPIRY_WINDOW_DAYS,
} from './staffRatings';

const sampleCoach: StaffRecord = {
  id: 'staff-1',
  name: 'Alex Van Der Berg',
  role: 'Assistant Manager',
  age: 41,
  nation: 'BEL',
  club: 'KVV Zelzate',
  wagePw: 450,
  expires: '30/06/2028',
  attributes: {
    attacking: 17,
    defending: 11,
    fitness: 9,
    goalkeeping: 4,
    mental: 14,
    possession: 15,
    set_pieces: 12,
    tactical: 16,
    technical: 16,
    working_with_youngsters: 15,
    adaptability: 12,
    authority: 15,
    determination: 16,
    judging_player_ability: 14,
    judging_player_potential: 14,
    judging_staff_ability: 12,
    man_management: 15,
    motivating: 16,
    negotiating: 10,
    physiotherapy: 3,
    sports_science: 5,
    tactical_knowledge: 16,
    analysing_data: 14,
  },
};

test('calculateAllStaffRoleRatings ranks highest coaching specialty first', () => {
  const ratings = calculateAllStaffRoleRatings(sampleCoach.attributes);
  assert.ok(ratings.length >= 10);
  const best = getBestStaffRoleRating(sampleCoach);
  assert.match(best.label, /Attacking/);
  assert.ok(best.stars >= 4.0);
  assert.equal(formatStars(best.stars), `${best.stars.toFixed(1)}★`);
});

test('evaluateBackroomDepartmentEfficiency evaluates all 8 departments and flags weak GK/Medical', () => {
  const depts = evaluateBackroomDepartmentEfficiency([sampleCoach]);
  assert.equal(depts.length, 8);
  const attacking = depts.find((d) => d.departmentId === 'attacking');
  const gk = depts.find((d) => d.departmentId === 'goalkeeping');
  assert.equal(attacking?.status, 'Elite');
  assert.equal(gk?.status, 'Weak / Upgrade Needed');
});

test('calculateAllStaffRoleRatings applies 2x DDM weighting to coaching stars', () => {
  const highDdm = calculateAllStaffRoleRatings({
    ...sampleCoach.attributes,
    attacking: 18,
    technical: 18,
    determination: 18,
    authority: 18,
    motivating: 18,
  }).find((r) => r.key === 'att_tech');

  const lowDdm = calculateAllStaffRoleRatings({
    ...sampleCoach.attributes,
    attacking: 18,
    technical: 18,
    determination: 5,
    authority: 5,
    motivating: 5,
  }).find((r) => r.key === 'att_tech');

  assert.equal(highDdm?.stars, 4.5);
  assert.equal(lowDdm?.stars, 3.0);
  assert.ok((highDdm?.score ?? 0) - (lowDdm?.score ?? 0) >= 25);
});

test('isStaffContractExpiringSoon parses UK DD/MM/YYYY and ISO YYYY-MM-DD dates accurately', () => {
  assert.equal(isStaffContractExpiringSoon('30/06/2028', '15/02/2028'), true);
  assert.equal(isStaffContractExpiringSoon('30/06/2029', '15/02/2028'), false);
  assert.equal(isStaffContractExpiringSoon('2028-06-30', '2028-02-15'), true);
  assert.equal(isStaffContractExpiringSoon('2029-06-30', '2028-02-15'), false);
});

test('staff expiry uses one shared 190-day window and never flags unreadable dates', () => {
  assert.equal(STAFF_CONTRACT_EXPIRY_WINDOW_DAYS, 190);
  // 189 days out is inside the window, 191 days out is not.
  assert.equal(isStaffContractExpiringSoon('23/09/2028', '18/03/2028'), true);
  assert.equal(isStaffContractExpiringSoon('25/09/2028', '18/03/2028'), false);
  for (const unreadable of [undefined, '', '--', 'Unknown', 'N/A', null as never]) {
    assert.equal(isStaffContractExpiringSoon(unreadable, '15/02/2028'), false);
  }
});

test('computeWeeklyStaffPayroll sums wages and refuses to fake a total when a wage is missing', () => {
  const complete = computeWeeklyStaffPayroll([
    { wagePw: 400 },
    { wagePw: 250 },
    { wagePw: 300 },
  ]);
  assert.equal(complete.totalWeekly, 950);
  assert.equal(complete.missingWageCount, 0);
  assert.equal(formatWeeklyStaffPayroll(complete), '£950/wk');

  const partial = computeWeeklyStaffPayroll([{ wagePw: 400 }, { wagePw: null }, {}]);
  assert.equal(partial.totalWeekly, null);
  assert.equal(partial.knownWeekly, 400);
  assert.equal(partial.missingWageCount, 2);
  assert.match(formatWeeklyStaffPayroll(partial), /^-- \(2 of 3 wages unreadable\)$/);

  assert.equal(formatWeeklyStaffPayroll(computeWeeklyStaffPayroll([])), '--');
  assert.equal(formatWeeklyStaffPayroll(computeWeeklyStaffPayroll(null)), '--');
});

test('formatStaffJobRatings prints the six Preferred Jobs and dashes unreadable ones', () => {
  assert.equal(
    formatStaffJobRatings({
      fitness_coach: 12,
      goalkeeping_coach: 4,
      set_piece_coach: 17,
      loan_manager: null,
      physio: 3,
      sports_scientist: 9,
    }),
    'Fit 12/GK 4/Set 17/Loan --/Phy 3/Sci 9'
  );
  assert.equal(formatStaffJobRatings(null), '--');
  assert.equal(formatStaffJobRatings(undefined), '--');
});


