import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildClubFinancesPanel,
  classifyWageCompliance,
  computeSquadWageSubtotal,
  formatClubMoney,
  formatWageComplianceSummary,
  parseSignedMoneyValue,
  parseWageSpendTriple,
  resolveCanonicalBalanceNum,
  resolveCanonicalClubFinances,
} from './clubFinances.ts';
import { formatWeeklyWage } from './squadViewHelpers.ts';

test('parseSignedMoneyValue parses positive, negative, bracketed, and scaled money strings', () => {
  assert.equal(parseSignedMoneyValue('-£749K'), -749_000);
  assert.equal(parseSignedMoneyValue('(£749K)'), -749_000);
  assert.equal(parseSignedMoneyValue('£1.50M'), 1_500_000);
  assert.equal(parseSignedMoneyValue('-€802K'), -802_000);
  assert.equal(parseSignedMoneyValue('£12,400'), 12_400);
  assert.equal(parseSignedMoneyValue('--'), null);
  assert.equal(parseSignedMoneyValue(null), null);
});

test('parseWageSpendTriple extracts payroll/budget pairs and single values', () => {
  assert.deepEqual(parseWageSpendTriple('£10,257 / £10,203 p/w (-£54 p/w)'), {
    payroll: 10_257,
    budget: 10_203,
  });
  assert.deepEqual(parseWageSpendTriple('£8,500 p/w'), {
    payroll: 8_500,
    budget: null,
  });
  assert.deepEqual(parseWageSpendTriple('--'), {
    payroll: null,
    budget: null,
  });
});

test('formatClubMoney stays exact and formatWeeklyWage is the single shared wage formatter', () => {
  assert.equal(formatClubMoney(1_550_000), '£1.55M');
  assert.equal(formatClubMoney(-749_400), '-£749K');
  assert.equal(formatClubMoney(450), '£450');
  assert.equal(formatClubMoney(null), '--');

  // Imported from squadViewHelpers: clubFinances no longer exports a competing formatter.
  assert.equal(formatWeeklyWage(10_257), '£10.3k/wk');
  assert.equal(formatWeeklyWage(450), '£450/wk');
  assert.equal(formatWeeklyWage(0), '--');
  assert.equal(formatWeeklyWage(undefined), '--');
});

test('resolveCanonicalBalanceNum obeys strict priority order (finances > monthly > meta > label)', () => {
  assert.equal(
    resolveCanonicalBalanceNum({
      financesBalance: -749_000,
      monthlyFinances: [
        { month: '2027-03', balance: -760_000, wageSpend: 40_000, netCashflow: -10_000 },
      ],
      metaBalance: -802_000,
      balanceLabel: '-£900K',
    }),
    -749_000
  );

  assert.equal(
    resolveCanonicalBalanceNum({
      monthlyFinances: [
        { month: '2027-02', balance: -710_000, wageSpend: 40_000, netCashflow: -15_000 },
        { month: '2027-03', balance: -760_000, wageSpend: 40_000, netCashflow: -10_000 },
      ],
      metaBalance: -802_000,
    }),
    -760_000
  );

  assert.equal(
    resolveCanonicalBalanceNum({ metaBalance: -802_000, balanceLabel: '-£900K' }),
    -802_000
  );

  assert.equal(resolveCanonicalBalanceNum({ balanceLabel: '-£900K' }), -900_000);
});

test('classifyWageCompliance separates under-budget, minor near-cap variance, and material breach', () => {
  const under = classifyWageCompliance(9_500, 10_000);
  assert.equal(under.severity, 'under');
  assert.equal(under.isOverWageBudget, false);
  assert.equal(under.wageHeadroomWeekly, 500);

  // £54 over £10,203 is 0.5% (within max(£150, 3%) minor tolerance)
  const minor = classifyWageCompliance(10_257, 10_203);
  assert.equal(minor.severity, 'minor_over');
  assert.equal(minor.isOverWageBudget, true);
  assert.equal(minor.isMateriallyOverWageBudget, false);

  // £1,200 over £10,000 is 12% -> genuine material breach
  const material = classifyWageCompliance(11_200, 10_000);
  assert.equal(material.severity, 'over');
  assert.equal(material.isMateriallyOverWageBudget, true);

  assert.equal(classifyWageCompliance(null, 10_000).severity, 'unknown');
});

test('resolveCanonicalClubFinances produces unified balance, wage compliance, and runway fields', () => {
  const resolved = resolveCanonicalClubFinances({
    financesBalance: -240_000,
    wageSpendLabel: '£10,257 / £10,203 p/w',
    transferBudgetRemaining: 25_000,
    financialRunway: {
      currentBalance: -240_000,
      monthlyBurnRate: 30_000,
      runwayMonths: 8,
      status: 'Warning',
    },
  });

  assert.equal(resolved.balanceNum, -240_000);
  assert.equal(resolved.balanceLabel, '-£240K');
  assert.equal(resolved.isInDebt, true);
  assert.equal(resolved.wageComplianceSeverity, 'minor_over');
  assert.equal(
    resolved.wageComplianceLabel,
    formatWageComplianceSummary(10_257, 10_203)
  );
  assert.equal(resolved.monthlyBurnRate, 30_000);
  assert.equal(resolved.monthlyBurnLabel, '£30,000/mo');
  assert.equal(resolved.runwayStatus, 'Warning');
});

test('computeSquadWageSubtotal labels a partial sum and never claims club payroll', () => {
  const complete = computeSquadWageSubtotal([1200, 800, 500]);
  assert.equal(complete.count, 3);
  assert.equal(complete.knownWeekly, 2500);
  assert.equal(complete.missingWageCount, 0);
  assert.equal(complete.label, '£2,500/wk');

  const partial = computeSquadWageSubtotal([1200, null, undefined]);
  assert.equal(partial.knownWeekly, 1200);
  assert.equal(partial.missingWageCount, 2);
  assert.equal(partial.label, '£1,200/wk known (2 of 3 unreadable)');

  assert.equal(computeSquadWageSubtotal([]).label, '--');
  assert.equal(computeSquadWageSubtotal(null).label, '--');
});

test('buildClubFinancesPanel assembles cash, payroll, and sponsorship rows', () => {
  const panel = buildClubFinancesPanel({
    financesBalance: -749_000,
    monthlyFinances: [
      { month: '2027-08', balance: 300_000, wageSpend: 42_000, netCashflow: -100_000 },
      { month: '2027-09', balance: 200_000, wageSpend: 42_000, netCashflow: -100_000 },
    ],
    wagePayrollWeekly: 10_257,
    wageBudgetWeekly: 10_203,
    transferBudgetRemaining: 250_000,
    financialRunway: {
      currentBalance: -749_000,
      monthlyBurnRate: 100_000,
      runwayMonths: 1,
      status: 'Critical',
    },
    staff: [{ wagePw: 400 }, { wagePw: null }],
    playerWages: [1_200, 800, null],
    sponsorships: [
      {
        name: 'Kit Deal',
        type: 'Main',
        annualValue: 1_500_000,
        expires: '30/06/2028',
      },
      {
        name: 'Ended Deal',
        type: 'Secondary',
        annualValue: null,
        expires: '--',
        dates_reordered: true,
      },
    ],
  });

  assert.equal(panel.cash.balanceLabel, '-£749K');
  assert.equal(panel.cash.isInDebt, true);
  assert.equal(panel.cash.monthlyNetAmount, -100_000);
  assert.equal(panel.cash.monthlyNetLabel, '-£100K/mo');
  assert.equal(panel.cash.runwayStatus, 'Critical');
  assert.match(panel.cash.runwayWarning ?? '', /Critical runway/);

  assert.equal(panel.payroll.clubPayrollLabel, '£10,257/wk');
  assert.equal(panel.payroll.wageBudgetLabel, '£10,203/wk');
  assert.equal(panel.payroll.wageSeverity, 'minor_over');
  assert.equal(panel.payroll.staffPayrollLabel, '£400/wk known (1 of 2 without wage)');
  assert.equal(panel.payroll.staffMissingWageCount, 1);
  assert.equal(
    panel.payroll.squadWageSubtotalLabel,
    '£2,000/wk known (1 of 3 unreadable)'
  );
  assert.equal(panel.payroll.squadWageMissingCount, 1);

  assert.equal(panel.sponsorships.length, 2);
  assert.equal(panel.sponsorships[0].name, 'Kit Deal');
  assert.equal(panel.sponsorships[0].annualValueLabel, '£1.50M');
  assert.equal(panel.sponsorships[1].datesReordered, true);
  assert.equal(panel.sponsorships[1].annualValueLabel, '--');
});

test('buildClubFinancesPanel degrades to explicit gaps when the save has no finances', () => {
  const panel = buildClubFinancesPanel({});
  assert.equal(panel.cash.balanceLabel, '--');
  assert.equal(panel.cash.monthlyNetLabel, '--');
  assert.equal(panel.cash.runwayStatus, null);
  assert.equal(panel.cash.runwayWarning, null);
  assert.equal(panel.payroll.clubPayrollLabel, '--');
  assert.equal(panel.payroll.staffPayrollLabel, '--');
  assert.equal(panel.payroll.squadWageSubtotalLabel, '--');
  assert.deepEqual(panel.sponsorships, []);
});
