import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinanceSnapshot, calculateFinancialRunway } from './hydrateFinances.ts';
import type { DecodedFmSavePayload } from './fmSaveHydrator';
import type { MonthlyFinance } from '../types/fmSave';

const decodedWith = (extra: Record<string, unknown>) =>
  ({ meta: {}, ...extra }) as unknown as DecodedFmSavePayload;

const ledger = (netCashflows: number[], closingBalance = 500000): MonthlyFinance[] =>
  netCashflows.map((netCashflow, index) => ({
    month: `2027-0${index + 1}`,
    balance: closingBalance,
    wageSpend: 24000,
    netCashflow,
  }));

test('the save balance wins over the meta balance', () => {
  const snapshot = buildFinanceSnapshot(
    decodedWith({ finances: { balance: 980000 }, meta: { balance: 1250000 } })
  );
  assert.equal(snapshot.canonicalBalanceNum, 980000);
  assert.match(snapshot.balanceLabel ?? '', /£980K/);
});

test('with no save balance the meta balance is used', () => {
  const snapshot = buildFinanceSnapshot(
    decodedWith({ finances: null, meta: { balance: 1250000 } })
  );
  assert.equal(snapshot.canonicalBalanceNum, 1250000);
});

test('with no balance anywhere the monthly ledger closes the gap', () => {
  const snapshot = buildFinanceSnapshot(
    decodedWith({ finances: null, meta: {}, monthlyFinances: ledger([-1000, -2000], 640000) })
  );
  assert.equal(snapshot.canonicalBalanceNum, 640000);
});

test('with no money data at all the balance is unknown rather than zero', () => {
  const snapshot = buildFinanceSnapshot(decodedWith({ finances: null, meta: {} }));
  assert.equal(snapshot.canonicalBalanceNum, null);
  assert.equal(snapshot.balanceLabel, null);
  assert.equal(snapshot.financialRunway, null);
  assert.equal(snapshot.wageComplianceLabel, null);
});

test('the wage summary appears only when both payroll and budget are known', () => {
  const both = buildFinanceSnapshot(
    decodedWith({ finances: { balance: 1, wagePayrollWeekly: 24500, wageBudgetWeekly: 30000 } })
  );
  assert.ok(both.wageComplianceLabel);
  assert.match(both.wageComplianceLabel ?? '', /24,500|24500/);

  const onlyPayroll = buildFinanceSnapshot(
    decodedWith({ finances: { balance: 1, wagePayrollWeekly: 24500, wageBudgetWeekly: null } })
  );
  assert.equal(onlyPayroll.wageComplianceLabel, null);
});

test('the runway is only reported when there is a monthly ledger', () => {
  assert.equal(
    buildFinanceSnapshot(decodedWith({ finances: { balance: 900000 } })).financialRunway,
    null
  );
  const withLedger = buildFinanceSnapshot(
    decodedWith({ finances: { balance: 900000 }, monthlyFinances: ledger([-50000, -60000]) })
  );
  assert.ok(withLedger.financialRunway);
  assert.equal(withLedger.financialRunway?.currentBalance, 900000);
});

test('runway averages only the losing months and rounds to one decimal', () => {
  const runway = calculateFinancialRunway(ledger([-50000, 20000, -60000]), 1100000);
  assert.equal(runway.monthlyBurnRate, 55000);
  assert.equal(runway.runwayMonths, 20);
  assert.equal(runway.status, 'Healthy');
});

test('runway statuses follow cash and time: critical, warning, healthy', () => {
  assert.equal(calculateFinancialRunway(ledger([-100000]), 250000).status, 'Critical');
  assert.equal(calculateFinancialRunway(ledger([-100000]), 450000).status, 'Warning');
  assert.equal(calculateFinancialRunway(ledger([-100000]), 900000).status, 'Healthy');
  assert.equal(calculateFinancialRunway(ledger([-100000]), 0).status, 'Critical');
});

test('a ledger with no losing month means no burn and no limit on the runway', () => {
  const runway = calculateFinancialRunway(ledger([50000, 30000]), 700000);
  assert.equal(runway.monthlyBurnRate, 0);
  assert.equal(runway.runwayMonths, 999);
  assert.equal(runway.status, 'Healthy');
});

test('an empty ledger reports a critical runway against the known balance', () => {
  assert.deepEqual(calculateFinancialRunway([], 250000), {
    currentBalance: 250000,
    monthlyBurnRate: 0,
    runwayMonths: 0,
    status: 'Critical',
  });
  assert.deepEqual(calculateFinancialRunway([], null), {
    currentBalance: 0,
    monthlyBurnRate: 0,
    runwayMonths: 0,
    status: 'Critical',
  });
});
