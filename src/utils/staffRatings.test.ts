import assert from 'node:assert/strict';
import test from 'node:test';
import { StaffRecord } from '../types/fm27';
import {
  calculateAllStaffRoleRatings,
  evaluateBackroomDepartmentEfficiency,
  formatStars,
  getBestStaffRoleRating,
  getPreferredJobRatings,
  isStaffContractExpiringSoon,
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

test('getPreferredJobRatings returns known FM27 Preferred Jobs highest-first and skips unknowns', () => {
  const ratings = getPreferredJobRatings({
    fitness_coach: 14,
    goalkeeping_coach: null,
    set_piece_coach: 19,
    loan_manager: 8,
    physio: undefined,
    sports_scientist: 11,
  });

  assert.deepEqual(
    ratings.map((entry) => [entry.key, entry.label, entry.value]),
    [
      ['set_piece_coach', 'Set Piece Coach', 19],
      ['fitness_coach', 'Fitness Coach', 14],
      ['sports_scientist', 'Sports Scientist', 11],
      ['loan_manager', 'Loan Manager', 8],
    ]
  );
  assert.deepEqual(getPreferredJobRatings(null), []);
  assert.deepEqual(getPreferredJobRatings(undefined), []);
});


