import test from 'node:test';
import assert from 'node:assert/strict';
import { StaffRecord } from '../types/fm27';
import { buildStaffOrgChart, STAFF_ORG_CHART_RULE } from './staffOrgChart';

const attributes: StaffRecord['attributes'] = {
  attacking: 8,
  defending: 8,
  fitness: 8,
  goalkeeping: 8,
  mental: 8,
  possession: 8,
  set_pieces: 8,
  tactical: 8,
  technical: 8,
  working_with_youngsters: 8,
  adaptability: 8,
  authority: 8,
  determination: 8,
  judging_player_ability: 8,
  judging_player_potential: 8,
  judging_staff_ability: 8,
  man_management: 8,
  motivating: 8,
  negotiating: 8,
  physiotherapy: 8,
  sports_science: 8,
  tactical_knowledge: 8,
  analysing_data: 8,
};

const make = (over: Partial<StaffRecord> & { id: string; name: string; role: string }): StaffRecord => ({
  age: 40,
  nation: 'Belgium',
  club: 'KVV Zelzate',
  wagePw: 300,
  expires: '30/06/2030',
  attributes,
  ...over,
});

const saveDate = '11/08/2027';

test('the chart states that the hierarchy is inferred from job titles', () => {
  const chart = buildStaffOrgChart([], saveDate);
  assert.equal(chart.rule, STAFF_ORG_CHART_RULE);
  assert.match(chart.rule, /not a reporting line/i);
});

test('each department is headed by its most senior job title', () => {
  const chart = buildStaffOrgChart(
    [
      make({ id: 's1', name: 'Aaron De Witte', role: 'Manager' }),
      make({ id: 's2', name: 'Rik Temmerman', role: 'Assistant Manager' }),
      make({ id: 's3', name: 'Axel Kalou', role: 'Coach' }),
      make({ id: 's4', name: 'Kris De Wree', role: 'Chief Scout' }),
      make({ id: 's5', name: 'David Sannen', role: 'Scout' }),
      make({ id: 's6', name: 'Mauro Schoors', role: 'Head Physio' }),
      make({ id: 's7', name: 'Marius Turon', role: 'Physio' }),
    ],
    saveDate
  );

  const byId = Object.fromEntries(chart.departments.map((d) => [d.id, d]));
  assert.equal(byId.coaching.lead?.name, 'Aaron De Witte');
  assert.equal(byId.coaching.leadSource, 'title');
  assert.equal(byId.scouting.lead?.name, 'Kris De Wree');
  assert.equal(byId.medical.lead?.name, 'Mauro Schoors');
  assert.equal(byId.board.headcount, 0);
  assert.equal(byId.board.lead, null);
  assert.equal(byId.board.leadSource, 'none');
});

test('a plain Coach is never mistaken for the Manager', () => {
  const chart = buildStaffOrgChart(
    [
      make({ id: 's1', name: 'Assistant', role: 'Assistant Manager' }),
      make({ id: 's2', name: 'Coach', role: 'Coach' }),
    ],
    saveDate
  );
  const coaching = chart.departments.find((d) => d.id === 'coaching')!;
  assert.equal(coaching.lead?.name, 'Assistant');
});

test('members report to the head, and the head reports to nobody', () => {
  const chart = buildStaffOrgChart(
    [
      make({ id: 's1', name: 'Aaron', role: 'Manager' }),
      make({ id: 's2', name: 'Axel', role: 'Coach' }),
      make({ id: 's3', name: 'Mustafa', role: 'Coach' }),
    ],
    saveDate
  );
  const coaching = chart.departments.find((d) => d.id === 'coaching')!;
  assert.equal(coaching.lead?.reportsTo, null);
  assert.equal(coaching.members.length, 2);
  assert.deepEqual(
    coaching.members.map((m) => m.reportsTo),
    ['Aaron', 'Aaron']
  );
  assert.equal(coaching.headcount, 3);
});

test('a department with people but no head job gets an acting head by rating', () => {
  const strong = make({
    id: 's1',
    name: 'Strong',
    role: 'Performance Analyst',
    attributes: { ...attributes, mental: 20, tactical: 20, technical: 20, judging_player_ability: 20, judging_player_potential: 20, judging_staff_ability: 20 },
  });
  const weak = make({ id: 's2', name: 'Weak', role: 'Scout' });
  const chart = buildStaffOrgChart([strong, weak], saveDate);
  const scouting = chart.departments.find((d) => d.id === 'scouting')!;
  assert.equal(scouting.leadSource, 'rating');
  assert.equal(scouting.lead?.name, 'Strong');
  assert.ok(scouting.risks.some((r) => r.id === 'no-head'));
  assert.match(scouting.risks.find((r) => r.id === 'no-head')!.text, /acting head on rating/);
});

test('an empty department is a gap and says so', () => {
  const chart = buildStaffOrgChart([make({ id: 's1', name: 'Aaron', role: 'Manager' })], saveDate);
  const medical = chart.departments.find((d) => d.id === 'medical')!;
  assert.equal(medical.headcount, 0);
  assert.ok(medical.risks.some((r) => r.id === 'empty-department'));
  assert.deepEqual(medical.missingRoles.sort(), ['Doctor', 'Head Physio', 'Physio', 'Sports Scientist'].sort());
  assert.ok(chart.gapCount > 0);
});

test('a one-person board is not treated as a risk', () => {
  const chart = buildStaffOrgChart(
    [make({ id: 's1', name: 'Marcel Stevens', role: 'Chairperson', wagePw: null })],
    saveDate
  );
  const board = chart.departments.find((d) => d.id === 'board')!;
  assert.ok(!board.risks.some((r) => r.id === 'single-person'));
  assert.equal(board.headcount, 1);
});

test('board coverage never counts towards the headline gap count', () => {
  const chart = buildStaffOrgChart([make({ id: 's1', name: 'Marcel Stevens', role: 'Chairperson' })], saveDate);
  const board = chart.departments.find((d) => d.id === 'board')!;
  assert.deepEqual(board.missingRoles.sort(), ['Director', 'Managing Director'].sort());
  const withoutBoard = chart.departments.filter((d) => d.id !== 'board');
  const expected = withoutBoard.reduce(
    (sum, department) => sum + department.missingRoles.length + (department.headcount === 0 ? 1 : 0),
    0
  );
  assert.equal(chart.gapCount, expected);
});

test('a single-person department is flagged', () => {
  const chart = buildStaffOrgChart([make({ id: 's1', name: 'Solo', role: 'Head Physio' })], saveDate);
  const medical = chart.departments.find((d) => d.id === 'medical')!;
  assert.ok(medical.risks.some((r) => r.id === 'single-person'));
});

test('a head inside the contract window is a critical risk', () => {
  const chart = buildStaffOrgChart(
    [make({ id: 's1', name: 'Aaron', role: 'Manager', expires: '01/01/2028' })],
    saveDate
  );
  const coaching = chart.departments.find((d) => d.id === 'coaching')!;
  const risk = coaching.risks.find((r) => r.id === 'head-expiring');
  assert.ok(risk);
  assert.equal(risk?.severity, 'critical');
  assert.match(risk!.text, /Aaron/);
});

test('duplicate head titles are reported as a save limitation, not a fault', () => {
  const chart = buildStaffOrgChart(
    [
      make({ id: 's1', name: 'Aaron', role: 'Manager' }),
      make({ id: 's2', name: 'Ali', role: 'Manager' }),
      make({ id: 's3', name: 'Bobby', role: 'Manager' }),
    ],
    saveDate
  );
  const coaching = chart.departments.find((d) => d.id === 'coaching')!;
  const risk = coaching.risks.find((r) => r.id === 'duplicate-head-title');
  assert.ok(risk);
  assert.equal(risk?.severity, 'info');
  assert.match(risk!.text, /3 people hold the Manager job/);
  assert.equal(coaching.lead?.name, 'Aaron');
});

test('coverage lists who fills each standard job and which jobs are missing', () => {
  const chart = buildStaffOrgChart(
    [
      make({ id: 's1', name: 'Aaron', role: 'Manager' }),
      make({ id: 's2', name: 'Dylan', role: 'Goalkeeping Coach' }),
      make({ id: 's3', name: 'Ilyass', role: 'Goalkeeping Coach' }),
    ],
    saveDate
  );
  const coaching = chart.departments.find((d) => d.id === 'coaching')!;
  const keeper = coaching.coverage.find((slot) => slot.role === 'Goalkeeping Coach')!;
  assert.deepEqual(keeper.filledBy, ['Dylan', 'Ilyass']);
  assert.ok(coaching.missingRoles.includes('Assistant Manager'));
  assert.ok(!coaching.missingRoles.includes('Manager'));
  // A plain "Coach" must not satisfy "Goalkeeping Coach" or vice versa.
  assert.ok(coaching.missingRoles.includes('Coach'));
});

test('wages add up and undecoded wages are left out and counted', () => {
  const chart = buildStaffOrgChart(
    [
      make({ id: 's1', name: 'Aaron', role: 'Manager', wagePw: 250 }),
      make({ id: 's2', name: 'Ali', role: 'Coach', wagePw: null }),
      make({ id: 's3', name: 'Bobby', role: 'Coach', wagePw: 500 }),
    ],
    saveDate
  );
  const coaching = chart.departments.find((d) => d.id === 'coaching')!;
  assert.equal(coaching.wageWeekly, 750);
  assert.equal(coaching.unpricedCount, 1);
  assert.ok(coaching.risks.some((r) => r.id === 'unpriced-wage'));
  assert.equal(chart.wageWeekly, 750);
  assert.equal(chart.unpricedCount, 1);
});

test('board staff keep a null rating rather than an invented score', () => {
  const chart = buildStaffOrgChart(
    [make({ id: 's1', name: 'Marcel Stevens', role: 'Chairperson', wagePw: null })],
    saveDate
  );
  const board = chart.departments.find((d) => d.id === 'board')!;
  assert.equal(board.lead?.stars, null);
  assert.match(board.lead!.ratingLabel, /no coaching rating/i);
});

test('an unreadable expiry leaves days remaining null instead of guessing', () => {
  const chart = buildStaffOrgChart(
    [make({ id: 's1', name: 'Aaron', role: 'Manager', expires: '--' })],
    saveDate
  );
  const coaching = chart.departments.find((d) => d.id === 'coaching')!;
  assert.equal(coaching.lead?.daysRemaining, null);
  assert.ok(!coaching.risks.some((r) => r.id === 'head-expiring'));
});

test('departments keep a stable order for the UI', () => {
  const chart = buildStaffOrgChart([make({ id: 's1', name: 'Aaron', role: 'Manager' })], saveDate);
  assert.deepEqual(
    chart.departments.map((d) => d.id),
    ['coaching', 'scouting', 'medical', 'board']
  );
  assert.equal(chart.headcount, 1);
});
