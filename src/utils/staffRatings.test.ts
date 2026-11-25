import assert from 'node:assert/strict';
import test from 'node:test';
import { StaffAttributes, StaffRecord } from '../types/fm27';
import {
  buildCoachingCategoryMatrix,
  buildUnifiedStaffMatrix,
  calculateAllStaffRoleRatings,
  classifyStaffDepartment,
  computeStaffKpiSummary,
  computeWeeklyStaffPayroll,
  evaluateBackroomDepartmentEfficiency,
  formatStaffJobRatings,
  formatStars,
  formatWeeklyStaffPayroll,
  getBestStaffRoleRating,
  getHeadlineStaffRoleRating,
  getStaffHeadlineDisplay,
  isStaffContractExpiringSoon,
  PREFERRED_JOB_AFFINITY_CAPTION,
  resolveStaffJobEligibility,
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
  assert.equal(
    formatWeeklyStaffPayroll(partial),
    '£400/wk known (2 of 3 without wage)'
  );

  const allMissing = computeWeeklyStaffPayroll([{ wagePw: null }, {}]);
  assert.equal(formatWeeklyStaffPayroll(allMissing), '--');

  assert.equal(formatWeeklyStaffPayroll(computeWeeklyStaffPayroll([])), '--');
  assert.equal(formatWeeklyStaffPayroll(computeWeeklyStaffPayroll(null)), '--');
});

test('board/executive staff without contracts do not inflate the missing-wage count', () => {
  const withUnpaidBoard = computeWeeklyStaffPayroll([
    { wagePw: 450, role: 'Manager' },
    { wagePw: null, role: 'Chairperson' },
  ]);
  assert.equal(withUnpaidBoard.staffCount, 1);
  assert.equal(withUnpaidBoard.missingWageCount, 0);
  assert.equal(withUnpaidBoard.excludedWithoutContractCount, 1);
  assert.equal(formatWeeklyStaffPayroll(withUnpaidBoard), '£450/wk');

  const paidBoard = computeWeeklyStaffPayroll([
    { wagePw: 450, role: 'Manager' },
    { wagePw: 200, role: 'Chairman' },
  ]);
  assert.equal(paidBoard.staffCount, 2);
  assert.equal(formatWeeklyStaffPayroll(paidBoard), '£650/wk');

  const partialWithBoard = computeWeeklyStaffPayroll([
    { wagePw: 450, role: 'Manager' },
    { wagePw: null, role: 'Coach' },
    { wagePw: null, role: 'Owner' },
  ]);
  assert.equal(partialWithBoard.staffCount, 2);
  assert.equal(partialWithBoard.missingWageCount, 1);
  assert.equal(
    formatWeeklyStaffPayroll(partialWithBoard),
    '£450/wk known (1 of 2 without wage)'
  );
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



function makeStaff(
  role: string,
  overrides: Omit<Partial<StaffRecord>, 'attributes'> & {
    attributes?: Partial<StaffAttributes>;
  } = {}
): StaffRecord {
  return {
    id: overrides.id ?? `staff-${role}`,
    name: overrides.name ?? role,
    role,
    age: overrides.age ?? 40,
    nation: overrides.nation ?? 'BEL',
    club: overrides.club ?? 'KVV Zelzate',
    wagePw: overrides.wagePw ?? 500,
    expires: overrides.expires ?? '30/06/2028',
    attributes: {
      ...sampleCoach.attributes,
      ...(overrides.attributes ?? {}),
    },
    secondaryJob: overrides.secondaryJob ?? null,
    jobRatings: overrides.jobRatings ?? null,
  };
}

test('FM job eligibility separates coaching, recruitment, medical, and board roles', () => {
  const cases: Array<
    [string, 'coaching' | 'recruitment' | 'medical' | 'board']
  > = [
    ['Manager', 'coaching'],
    ['Assistant Manager', 'coaching'],
    ['First Team Coach', 'coaching'],
    ['Goalkeeping Coach', 'coaching'],
    ['Fitness Coach', 'coaching'],
    ['Set Piece Coach', 'coaching'],
    ['Head of Youth Development', 'coaching'],
    ['Scout', 'recruitment'],
    ['Chief Scout', 'recruitment'],
    ['Recruitment Analyst', 'recruitment'],
    ['Director of Football', 'recruitment'],
    ['Technical Director', 'recruitment'],
    ['Head Physio', 'medical'],
    ['Club Doctor', 'medical'],
    ['Sports Scientist', 'medical'],
    ['Chairperson', 'board'],
    ['Chairman', 'board'],
    ['Owner', 'board'],
    ['President', 'board'],
    ['Managing Director', 'board'],
    ['Board Director', 'board'],
  ];
  for (const [role, expected] of cases) {
    assert.equal(
      resolveStaffJobEligibility(makeStaff(role)),
      expected,
      `${role} should be ${expected}`
    );
  }
});

test('board and executive roles are labelled BOARD and never lead a training unit', () => {
  const boardRoles = [
    'Chairperson',
    'Chairman',
    'Owner',
    'President',
    'Managing Director',
    'Board Director',
  ];
  for (const role of boardRoles) {
    const member = makeStaff(role);
    assert.equal(resolveStaffJobEligibility(member), 'board', `${role} must be board`);
    assert.equal(classifyStaffDepartment(member), 'board', `${role} must render BOARD`);
  }
  // Technical Director / DoF stay in recruitment.
  assert.equal(resolveStaffJobEligibility(makeStaff('Technical Director')), 'recruitment');
  assert.equal(resolveStaffJobEligibility(makeStaff('Director of Football')), 'recruitment');

  const chair = makeStaff('Chairperson', {
    name: 'Elite Chair',
    attributes: {
      attacking: 20,
      technical: 20,
      tactical: 20,
      possession: 20,
      defending: 20,
      set_pieces: 20,
      fitness: 20,
      goalkeeping: 20,
      determination: 20,
      authority: 20,
      motivating: 20,
    },
  });
  const manager = makeStaff('Manager', { name: 'Real Manager' });

  for (const row of buildCoachingCategoryMatrix([chair, manager])) {
    assert.notEqual(row.leadCoachName, 'Elite Chair', `${row.label} must not be led by a chairperson`);
  }
  const attacking = buildUnifiedStaffMatrix([chair, manager]).find(
    (row) => row.key === 'att_tech'
  );
  assert.equal(attacking?.leadStaffName, 'Real Manager');
  const depts = evaluateBackroomDepartmentEfficiency([chair, manager]);
  assert.equal(depts.find((d) => d.departmentId === 'attacking')?.leadStaffName, 'Real Manager');
});

test('board staff headline is explicitly not a coaching rating', () => {
  const chair = getStaffHeadlineDisplay(makeStaff('Chairperson'));
  assert.equal(chair.stars, null);
  assert.match(chair.label, /Board \/ Executive/);
  assert.match(chair.label, /no coaching rating/);

  const coach = getStaffHeadlineDisplay(makeStaff('Manager'));
  assert.ok(coach.stars !== null);
  assert.doesNotMatch(coach.label, /Board \/ Executive/);
});

test('Avg Staff Rating excludes board/executive members from the average', () => {
  const coach = makeStaff('Manager', { name: 'Real Manager' });
  const chair = makeStaff('Chairperson', {
    name: 'Elite Chair',
    attributes: {
      ...sampleCoach.attributes,
      attacking: 1,
      technical: 1,
      tactical: 1,
      possession: 1,
      defending: 1,
      set_pieces: 1,
      fitness: 1,
      goalkeeping: 1,
    },
  });
  const withBoard = computeStaffKpiSummary([coach, chair], '15/02/2028');
  const coachOnly = computeStaffKpiSummary([coach], '15/02/2028');
  assert.equal(withBoard.totalStaff, 2);
  assert.equal(withBoard.averageHeadlineLabel, coachOnly.averageHeadlineLabel);
});

test('coaching matrix excludes scouts and medical staff from every training unit', () => {
  const chiefScout = makeStaff('Chief Scout', {
    name: 'Elite Scout',
    attributes: {
      attacking: 20,
      technical: 20,
      tactical: 20,
      possession: 20,
      defending: 20,
      set_pieces: 20,
      fitness: 20,
      goalkeeping: 20,
      determination: 20,
      authority: 20,
      motivating: 20,
    },
  });
  const headPhysio = makeStaff('Head Physio', {
    name: 'Elite Physio',
    attributes: {
      physiotherapy: 20,
      sports_science: 20,
      determination: 20,
      man_management: 20,
    },
  });

  const matrix = buildCoachingCategoryMatrix([chiefScout, headPhysio]);
  assert.equal(matrix.length, 9);
  for (const row of matrix) {
    assert.equal(row.leadCoachName, 'Unassigned', `${row.label} must not be led by a non-coach`);
    assert.equal(row.workload, 'Heavy / Overloaded');
  }
});

test('a Manager with better attributes leads Goalkeeping ahead of the GK Coach', () => {
  const manager = makeStaff('Manager', {
    name: 'Better Manager',
    attributes: {
      goalkeeping: 18,
      attacking: 18,
      technical: 18,
      tactical: 18,
      determination: 18,
      authority: 18,
      motivating: 18,
    },
  });
  const gkCoach = makeStaff('Goalkeeping Coach', {
    name: 'Specialist GK',
    attributes: {
      goalkeeping: 12,
      attacking: 4,
      technical: 4,
      tactical: 4,
      determination: 10,
      authority: 10,
      motivating: 10,
    },
  });

  const matrix = buildCoachingCategoryMatrix([manager, gkCoach]);
  const gk = matrix.find((row) => row.key === 'goalkeeping');
  assert.equal(gk?.leadCoachName, 'Better Manager');
});

test('department efficiency only considers eligible leads per department', () => {
  const chiefScout = makeStaff('Chief Scout', {
    name: 'Chief Scout',
    attributes: {
      judging_player_ability: 19,
      judging_player_potential: 19,
      adaptability: 18,
      attacking: 20,
      technical: 20,
    },
  });
  const headPhysio = makeStaff('Head Physio', {
    name: 'Head Physio',
    attributes: { physiotherapy: 20, sports_science: 19, determination: 18, man_management: 16 },
  });
  const manager = makeStaff('Manager', {
    name: 'Manager',
    attributes: {
      attacking: 17,
      technical: 17,
      tactical: 16,
      determination: 17,
      authority: 16,
      motivating: 17,
    },
  });

  const depts = evaluateBackroomDepartmentEfficiency([chiefScout, headPhysio, manager]);
  assert.equal(depts.find((d) => d.departmentId === 'scouting')?.leadStaffName, 'Chief Scout');
  assert.equal(depts.find((d) => d.departmentId === 'medical')?.leadStaffName, 'Head Physio');
  assert.equal(depts.find((d) => d.departmentId === 'attacking')?.leadStaffName, 'Manager');
});

test('headline rating scores each person on their actual department first', () => {
  const scout = makeStaff('Chief Scout', {
    attributes: {
      judging_player_ability: 19,
      judging_player_potential: 19,
      adaptability: 18,
      attacking: 20,
      technical: 20,
      tactical: 20,
    },
  });
  assert.match(getHeadlineStaffRoleRating(scout).label, /Scouting|Analysis/);

  const physio = makeStaff('Head Physio', {
    attributes: { physiotherapy: 19, sports_science: 18, attacking: 20, technical: 20 },
  });
  assert.match(getHeadlineStaffRoleRating(physio).label, /Medical/);

  const manager = makeStaff('Manager', {
    attributes: {
      physiotherapy: 20,
      sports_science: 20,
      attacking: 15,
      technical: 15,
      tactical: 15,
      determination: 15,
      authority: 15,
      motivating: 15,
    },
  });
  assert.doesNotMatch(getHeadlineStaffRoleRating(manager).label, /Medical/);
  assert.match(getHeadlineStaffRoleRating(manager).label, /Attacking|Defending|Possession|Set Pieces|Fitness|Goalkeeping/);
});

test('unified matrix merges pitch, scouting, and medical onto one star scale', () => {
  const manager = makeStaff('Manager', {
    name: 'Manager',
    attributes: { attacking: 18, technical: 18, tactical: 18, determination: 18, authority: 18, motivating: 18 },
  });
  const scout = makeStaff('Chief Scout', {
    name: 'Chief Scout',
    attributes: { judging_player_ability: 18, judging_player_potential: 18, adaptability: 17 },
  });
  const physio = makeStaff('Head Physio', {
    name: 'Head Physio',
    attributes: { physiotherapy: 19, sports_science: 18, determination: 17, man_management: 16 },
  });

  const rows = buildUnifiedStaffMatrix([manager, scout, physio]);
  assert.equal(rows.length, 11);
  assert.equal(rows.filter((r) => r.group === 'Pitch Training').length, 9);
  assert.equal(rows.find((r) => r.key === 'scouting')?.leadStaffName, 'Chief Scout');
  assert.equal(rows.find((r) => r.key === 'medical')?.leadStaffName, 'Head Physio');
  assert.equal(rows.find((r) => r.key === 'scouting')?.workload, 'n/a');
});

test('Staff KPI summary reuses payroll, expiry, and department selectors', () => {
  const expiring = makeStaff('Coach', { name: 'Expiring Coach', expires: '30/06/2028', wagePw: 400 });
  const longDeal = makeStaff('Physio', { name: 'Long Physio', expires: '30/06/2031', wagePw: 300 });

  const kpi = computeStaffKpiSummary([expiring, longDeal], '15/02/2028');
  assert.equal(kpi.totalStaff, 2);
  assert.equal(kpi.weeklyPayrollLabel, '£700/wk');
  assert.equal(kpi.expiringSoonCount, 1);
  assert.ok(kpi.averageHeadlineStars !== null);
  assert.match(kpi.averageHeadlineLabel, /★$/);
  assert.equal(typeof kpi.weakDepartmentCount, 'number');

  const empty = computeStaffKpiSummary([], '15/02/2028');
  assert.equal(empty.totalStaff, 0);
  assert.equal(empty.weeklyPayrollLabel, '--');
  assert.equal(empty.averageHeadlineStars, null);
  assert.equal(empty.averageHeadlineLabel, '--');
});

test('Preferred Job Affinity caption never reads as a skill score', () => {
  assert.match(PREFERRED_JOB_AFFINITY_CAPTION, /^Preferred Job Affinity \(0–20, NOT coaching\/scouting ability/);
  assert.match(PREFERRED_JOB_AFFINITY_CAPTION, /do NOT treat 20\/20 as elite skill/);
  assert.match(PREFERRED_JOB_AFFINITY_CAPTION, /1\/20 on a Scout\/Manager as poor performance/);
});
