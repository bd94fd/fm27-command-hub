import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyWageCompliance,
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
