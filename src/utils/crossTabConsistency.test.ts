import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaffDirectory } from '../components/StaffDirectory';
import { buildClubFinancesPanel, computeSquadWageSubtotal } from './clubFinances';
import {
  PREFERRED_JOB_AFFINITY_CAPTION,
  buildUnifiedStaffMatrix,
  classifyStaffDepartment,
  computeStaffKpiSummary,
  formatStars,
  getStaffHeadlineDisplay,
  isStaffContractExpiringSoon,
} from './staffRatings';
import {
  countSquadPool,
  describeSquadPool,
} from './squadViewHelpers';
import { buildLiveTacticalAnalystContext } from './tacticalAnalystContext';
import { createSaveHistoryPoint, diffSaveHistoryPoints } from '../services/saveCache';
import { PlayerRecord, StaffAttributes, StaffRecord } from '../types/fm27';

const SAVE_DATE = '15/02/2028';

const STAFF_ATTRIBUTES: StaffAttributes = {
  attacking: 15,
  defending: 13,
  fitness: 12,
  goalkeeping: 10,
  mental: 14,
  possession: 14,
  set_pieces: 13,
  tactical: 15,
  technical: 15,
  working_with_youngsters: 12,
  adaptability: 13,
  authority: 14,
  determination: 15,
  judging_player_ability: 14,
  judging_player_potential: 14,
  judging_staff_ability: 13,
  man_management: 14,
  motivating: 15,
  negotiating: 12,
  physiotherapy: 8,
  sports_science: 9,
  tactical_knowledge: 15,
  analysing_data: 14,
};

function staff(
  id: string,
  name: string,
  role: string,
  wagePw: number | null,
  expires: string,
  attributes: Partial<StaffAttributes> = {},
  jobRatings: StaffRecord['jobRatings'] = null
): StaffRecord {
  return {
    id,
    name,
    role,
    age: 44,
    nation: 'BEL',
    club: 'KVV Zelzate',
    wagePw,
    expires,
    attributes: { ...STAFF_ATTRIBUTES, ...attributes },
    secondaryJob: null,
    jobRatings,
  };
}

const staffList: StaffRecord[] = [
  staff('mgr', 'Alex Manager', 'Manager', 450, '30/06/2028', {
    attacking: 18,
    technical: 18,
    tactical: 18,
    determination: 18,
    authority: 18,
    motivating: 18,
  }, { fitness_coach: 12, goalkeeping_coach: 10, set_piece_coach: 11, loan_manager: 8, physio: 3, sports_scientist: 5 }),
  staff('scout', 'Sam Scout', 'Chief Scout', 500, '30/06/2031', {
    judging_player_ability: 19,
    judging_player_potential: 19,
    adaptability: 18,
  }, { fitness_coach: 2, goalkeeping_coach: 1, set_piece_coach: 1, loan_manager: 4, physio: 1, sports_scientist: 2 }),
  staff('physio', 'Pat Physio', 'Head Physio', 600, '30/06/2029', {
    physiotherapy: 19,
    sports_science: 18,
  }, { fitness_coach: 8, goalkeeping_coach: 1, set_piece_coach: 2, loan_manager: 1, physio: 19, sports_scientist: 18 }),
  staff('board', 'Elite Chair', 'Chairperson', null, '--', {
    authority: 19,
    man_management: 18,
  }),
];

const playerAttributes: PlayerRecord['attributes'] = {
  pace: 12,
  acceleration: 12,
  stamina: 13,
  jumpingReach: 12,
  determination: 15,
  passing: 12,
  finishing: 12,
  tackling: 10,
  firstTouch: 12,
  decisions: 13,
  workRate: 14,
  offTheBall: 12,
  heading: 10,
  technique: 11,
};

function player(
  id: string,
  name: string,
  position: string,
  wagePw: number,
  teamSlot: number
): PlayerRecord {
  return {
    id,
    uid: Number(id.replace(/\D/g, '')) || 1,
    number: teamSlot + 1,
    name,
    position,
    apps: '5',
    minutes: 450,
    rating: 7.1,
    goals: position === 'ST' ? 3 : 0,
    xG: position === 'ST' ? 2.4 : 0,
    xGPer90: position === 'ST' ? 0.48 : 0,
    assists: 0,
    xA: 0,
    xAPer90: 0,
    drbPer90: 0,
    prPassesPer90: 2,
    hdrPct: 50,
    intPer90: 1,
    tckPct: 70,
    personality: 'Professional',
    age: 24,
    ability: 3.5,
    potential: 4,
    condition: 95,
    sharpness: 95,
    preferredFoot: 'Right',
    expires: '30/06/2029',
    nation: 'BEL',
    wagePw,
    status: teamSlot === 0 ? 'Starter' : 'Youth',
    teamSlot,
    attributes: playerAttributes,
    ipRole: position === 'GK' ? 'Goalkeeper (GK)' : 'Winger (W)',
    oopRole: position === 'GK' ? 'Goalkeeper (GK)' : 'Tracking Winger (TW)',
    notes: '',
  };
}

const players: PlayerRecord[] = [
  player('p1', 'Keeper One', 'GK', 420, 0),
  player('p2', 'Striker Two', 'ST', 510, 0),
  player('p3', 'Youth Three', 'CB', 210, 1),
];

function analystContext() {
  const payroll = buildClubFinancesPanel({
    financesBalance: -749_000,
    metaBalance: -802_000,
    monthlyFinances: [
      { month: 'January', balance: -760_000, wageSpend: 10_000, netCashflow: -25_000 },
    ],
    balanceLabel: '-£802K',
    wagePayrollWeekly: 10_257,
    wageBudgetWeekly: 10_203,
    transferBudgetRemaining: 0,
    financialRunway: {
      currentBalance: -749_000,
      monthlyBurnRate: -25_000,
      runwayMonths: 8,
      status: 'Warning',
    },
    staff: staffList,
    playerWages: players.map((p) => p.wagePw),
    sponsorships: [
      { name: 'Kit Deal', type: 'Main', annualValue: 1_500_000, expires: '30/06/2028' },
    ],
  });

  const context = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: SAVE_DATE,
    nextFixture: '18/02/2028 vs Opponent (H)',
    leagueStandingSub: '#3 of 16 (23 Pts)',
    wageSpend: payroll.payroll.wageComplianceLabel,
    balance: payroll.cash.balanceLabel,
    players,
    matches: [],
    staff: staffList,
    hydratedFmSave: {
      wageComplianceLabel: payroll.payroll.wageComplianceLabel,
      balanceLabel: payroll.cash.balanceLabel,
      canonicalBalanceNum: -749_000,
      updatedStaff: staffList,
      decodedPayload: {
        sponsorships: [
          { name: 'Kit Deal', type: 'Main', annualValue: 1_500_000, expires: '30/06/2028' },
        ],
      },
    } as never,
  });

  return { context, payroll };
}

test('Staff tab ratings, payroll and expiry match the Analyst context', () => {
  const { context } = analystContext();
  const kpi = computeStaffKpiSummary(staffList, SAVE_DATE);

  assert.equal(kpi.totalStaff, staffList.length);
  assert.equal(kpi.weeklyPayrollLabel, '£1,550/wk');
  assert.equal(kpi.expiringSoonCount, 1);
  assert.ok(context.includes(`=== BACKROOM STAFF (${staffList.length}) ===`));
  assert.ok(context.includes(`Weekly Staff Payroll: ${kpi.weeklyPayrollLabel}`));
  assert.ok(context.includes('Expiring Soon: Alex Manager'));

  for (const member of staffList) {
    const headline = getStaffHeadlineDisplay(member);
    const headlineText =
      headline.stars === null
        ? headline.label
        : `${headline.label} ${formatStars(headline.stars)}`;
    assert.ok(
      context.includes(
        `${member.name}(${classifyStaffDepartment(member)} — ${headlineText})`
      ),
      `Analyst rating for ${member.name} does not match the Staff tab`
    );
  }

  for (const row of buildUnifiedStaffMatrix(staffList)) {
    const overload =
      row.leadUnitCount >= 3 ? `, ${row.leadUnitCount} units overloaded` : '';
    assert.ok(
      context.includes(
        `${row.label}: ${row.leadStaffName} (${formatStars(row.stars)}${overload})`
      ),
      `Analyst matrix lead for ${row.label} does not match the Staff tab`
    );
  }

  assert.ok(context.includes(PREFERRED_JOB_AFFINITY_CAPTION));
});

test('Staff tab server render carries the same KPI numbers and headlines', () => {
  const html = renderToStaticMarkup(
    React.createElement(StaffDirectory, {
      staff: staffList,
      saveDate: SAVE_DATE,
      clubName: 'KVV Zelzate',
      onSelectStaff: () => {},
    })
  );

  assert.ok(html.includes('£1,550/wk'));
  assert.ok(html.includes('Expiring Soon (1)'));
  for (const member of staffList) {
    const headline = getStaffHeadlineDisplay(member);
    assert.ok(
      html.includes(headline.label.replace(/&/g, '&amp;')),
      `Staff card is missing the headline label for ${member.name}`
    );
  }
});

test('Hub finances, squad wage subtotal and Analyst quote the same totals', () => {
  const { context, payroll } = analystContext();

  assert.equal(payroll.cash.balanceLabel, '-£749K');
  assert.equal(payroll.cash.monthlyNetLabel, '-£25K/mo');
  assert.equal(payroll.cash.runwayLabel, 'Warning · 8 months');
  assert.equal(payroll.payroll.clubPayrollLabel, '£10,257/wk');
  assert.equal(payroll.payroll.wageBudgetLabel, '£10,203/wk');
  assert.equal(
    payroll.payroll.wageComplianceLabel,
    '£10,257 / £10,203 p/w (-£54 p/w)'
  );
  assert.equal(payroll.payroll.staffPayrollLabel, '£1,550/wk');
  assert.equal(payroll.payroll.squadWageSubtotalLabel, '£1,140/wk');
  assert.equal(payroll.sponsorships[0].annualValueLabel, '£1.50M');

  const subtotal = computeSquadWageSubtotal(players.map((p) => p.wagePw));
  assert.equal(subtotal.knownWeekly, 420 + 510 + 210);
  assert.equal(subtotal.label, payroll.payroll.squadWageSubtotalLabel);

  assert.ok(
    context.includes(
      `Finances: Bal ${payroll.cash.balanceLabel} | Player Wage Bill ${payroll.payroll.wageComplianceLabel}`
    )
  );
  assert.ok(context.includes(`Weekly Staff Payroll: ${payroll.payroll.staffPayrollLabel}`));
  assert.ok(context.includes('£1.50M/yr'));
  assert.match(context, /Staff wages are separate/);
  assert.doesNotMatch(
    context,
    /£1,140\/wk/,
    'Analyst must not present the squad wage subtotal as club payroll'
  );
});

test('squad pool counts agree between Hub/Squad helpers and the Analyst', () => {
  const { context } = analystContext();
  const counts = countSquadPool(players);

  assert.deepEqual(counts, { firstTeam: 2, youthReserves: 1, fullPool: 3 });
  assert.ok(context.includes(`Squad Pool: ${describeSquadPool(counts)}`));
  assert.ok(context.includes('OF 3 FULL POOL · 2 FIRST TEAM'));
});

test('staff expiry window is shared by the Staff tab, filter count and Analyst', () => {
  assert.equal(isStaffContractExpiringSoon('30/06/2028', SAVE_DATE), true);
  assert.equal(isStaffContractExpiringSoon('30/06/2029', SAVE_DATE), false);

  const expiring = staffList.filter((member) =>
    isStaffContractExpiringSoon(member.expires, SAVE_DATE)
  );
  assert.equal(computeStaffKpiSummary(staffList, SAVE_DATE).expiringSoonCount, expiring.length);

  const { context } = analystContext();
  for (const member of expiring) {
    assert.ok(context.includes(member.name), `Analyst is missing expiring ${member.name}`);
  }
});

test('Hub, Squad, Staff and Analyst call the same count and staff selectors', () => {
  const read = (relPath: string) =>
    readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8');

  assert.match(
    read('components/AutoSyncWorkspace.tsx'),
    /describeSquadPool\(countSquadPool\(players\)\)/
  );
  assert.match(
    read('components/SquadAnalyticsTable.tsx'),
    /countSquadPool\(players\)/
  );
  assert.match(
    read('components/StaffDirectory.tsx'),
    /computeStaffKpiSummary\(staff, saveDate\)/
  );

  const analyst = read('utils/tacticalAnalystContext.ts');
  assert.match(analyst, /countSquadPool\(players\)/);
  assert.match(analyst, /computeWeeklyStaffPayroll\(effectiveStaff\)/);
  assert.match(analyst, /getStaffHeadlineDisplay\(st\)/);
  assert.match(analyst, /buildUnifiedStaffMatrix\(ratedStaff\)/);
  assert.match(analyst, /isStaffContractExpiringSoon\(st\.expires/);
});

test('Journey wage total uses the shared squad subtotal and names missing wages', () => {
  const paid = player('p10', 'Paid Player', 'ST', 420, 0);
  const missing = { ...player('p11', 'Unpaid Player', 'CB', 0, 1), wagePw: 0 };
  const added = player('p12', 'Added Player', 'CM', 510, 0);
  const previous = createSaveHistoryPoint({
    saveName: 'journey.fm',
    inGameDate: '01/01/2028',
    clubName: 'KVV Zelzate',
    players: [paid, missing],
  });
  const current = createSaveHistoryPoint({
    saveName: 'journey.fm',
    inGameDate: '15/02/2028',
    clubName: 'KVV Zelzate',
    players: [paid, missing, added],
  });
  const diff = diffSaveHistoryPoints(previous, current);
  const subtotal = computeSquadWageSubtotal(current.players.map((p) => p.wagePw));

  assert.equal(diff.kpiDeltas.toTotalWagePw, subtotal.knownWeekly);
  assert.equal(diff.kpiDeltas.toTotalWagePw, 420 + 510);
  assert.equal(diff.kpiDeltas.toWageMissingCount, 1);
});
