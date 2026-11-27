import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_FINANCE_SCENARIO,
  WEEKS_PER_MONTH,
  projectFinanceScenario,
} from './financeScenarios.ts';

const baseInput = {
  balance: 2_000_000,
  monthlyNet: -100_000,
  monthlyBurnRate: 100_000,
  wagePayrollWeekly: 10_000,
  wageBudgetWeekly: 12_000,
  currencySymbol: '£',
  deltas: { ...EMPTY_FINANCE_SCENARIO },
};

test('a week converts to 52/12 of a month, not four weeks', () => {
  assert.equal(Number(WEEKS_PER_MONTH.toFixed(4)), 4.3333);
});

test('no change leaves every number where the save left it', () => {
  const projection = projectFinanceScenario(baseInput);
  assert.equal(projection.available, true);
  assert.equal(projection.changed, false);
  assert.equal(projection.balanceAfter, 2_000_000);
  assert.equal(projection.monthlyNetAfter, -100_000);
  assert.equal(projection.runwayMonthsBefore, 20);
  assert.equal(projection.runwayMonthsAfter, 20);
  assert.match(projection.verdict, /Nothing changed yet/);
});

test('selling wages and banking a fee lengthens runway with the same arithmetic the panel shows', () => {
  const projection = projectFinanceScenario({
    ...baseInput,
    balance: 500_000,
    monthlyNet: -120_000,
    deltas: {
      wageDeltaWeekly: -8_000,
      transferFeeIn: 2_000_000,
      transferFeeOut: 0,
      sponsorshipDeltaAnnual: 0,
    },
  });

  // -120,000 + (8,000 × 52/12) = -85,333.33 → rounded once, at the end.
  assert.equal(projection.monthlyNetAfter, -85_333);
  assert.equal(projection.balanceAfter, 2_500_000);
  assert.equal(projection.runwayMonthsBefore, 4.2);
  assert.equal(projection.runwayMonthsAfter, 29.3);
  assert.equal(projection.statusAfter, 'Healthy');
  assert.match(projection.verdict, /Saving £8,000\/wk of wages/);
  assert.match(projection.verdict, /banking £2\.00M in fees/);
  assert.match(projection.verdict, /from 4\.2 months to 29\.3 months/);
});

test('signing wages and paying a fee shortens runway and flags the wage cap', () => {
  const projection = projectFinanceScenario({
    ...baseInput,
    balance: 400_000,
    monthlyNet: -50_000,
    deltas: {
      wageDeltaWeekly: 3_000,
      transferFeeOut: 250_000,
      transferFeeIn: 0,
      sponsorshipDeltaAnnual: 0,
    },
  });

  // -50,000 - (3,000 × 52/12) = -63,000.
  assert.equal(projection.monthlyNetAfter, -63_000);
  assert.equal(projection.balanceAfter, 150_000);
  assert.equal(projection.runwayMonthsAfter, 2.4);
  assert.equal(projection.statusAfter, 'Critical');
  assert.equal(projection.wageHeadroomAfterWeekly, -1_000);
  assert.match(projection.verdict, /£1,000\/wk over the cap/);
});

test('a sponsorship change moves monthly cash flow by a twelfth of the annual figure', () => {
  const projection = projectFinanceScenario({
    ...baseInput,
    deltas: { ...EMPTY_FINANCE_SCENARIO, sponsorshipDeltaAnnual: 1_200_000 },
  });
  assert.equal(projection.monthlyNetAfter, 0);
  assert.equal(projection.runwayMonthsAfter, null);
  assert.equal(projection.statusAfter, 'Healthy');
  assert.match(projection.verdict, /stop burning cash/);
});

test('losing a sponsorship pushes a break-even club into burn', () => {
  const projection = projectFinanceScenario({
    ...baseInput,
    monthlyNet: 10_000,
    deltas: { ...EMPTY_FINANCE_SCENARIO, sponsorshipDeltaAnnual: -600_000 },
  });
  assert.equal(projection.monthlyNetAfter, -40_000);
  assert.equal(projection.runwayMonthsBefore, null);
  assert.equal(projection.runwayMonthsAfter, 50);
  assert.match(projection.verdict, /start burning cash/);
});

test('an empty balance or cash flow refuses to answer instead of guessing', () => {
  const noBalance = projectFinanceScenario({ ...baseInput, balance: null });
  assert.equal(noBalance.available, false);
  assert.match(noBalance.unavailableReason ?? '', /bank balance/);
  assert.equal(noBalance.balanceAfterLabel, '--');

  const noCashflow = projectFinanceScenario({
    ...baseInput,
    monthlyNet: null,
    monthlyBurnRate: null,
  });
  assert.equal(noCashflow.available, false);
  assert.match(noCashflow.unavailableReason ?? '', /monthly cash flow/);

  const neither = projectFinanceScenario({
    ...baseInput,
    balance: null,
    monthlyNet: null,
    monthlyBurnRate: null,
  });
  assert.match(neither.unavailableReason ?? '', /bank balance or monthly cash flow/);
});

test('a burn rate stands in for a missing latest month, and never invents a positive one', () => {
  const fromBurn = projectFinanceScenario({ ...baseInput, monthlyNet: null });
  assert.equal(fromBurn.available, true);
  assert.equal(fromBurn.monthlyNetAfter, -100_000);

  const noBurn = projectFinanceScenario({ ...baseInput, monthlyNet: null, monthlyBurnRate: 0 });
  assert.equal(noBurn.available, false);
});

test('missing wages leave the cap verdict out rather than zeroing it', () => {
  const projection = projectFinanceScenario({
    ...baseInput,
    wagePayrollWeekly: null,
    deltas: { ...EMPTY_FINANCE_SCENARIO, wageDeltaWeekly: 500 },
  });
  assert.equal(projection.wageHeadroomAfterWeekly, null);
  assert.equal(projection.wageHeadroomAfterLabel, '--');
  assert.doesNotMatch(projection.verdict, /cap/);
});

test('an overdrawn balance after the change is called out in plain English', () => {
  const projection = projectFinanceScenario({
    ...baseInput,
    balance: 100_000,
    monthlyNet: -20_000,
    deltas: { ...EMPTY_FINANCE_SCENARIO, transferFeeOut: 300_000 },
  });
  assert.equal(projection.balanceAfter, -200_000);
  assert.equal(projection.statusAfter, 'Critical');
  assert.match(projection.verdict, /in the red/);
  assert.equal(projection.balanceAfterLabel, '-£200K');
  assert.equal(projection.runwayBeforeLabel, '5 months');
});

test('the card runway is the "before" side, and a differing basis is explained', () => {
  const projection = projectFinanceScenario({
    ...baseInput,
    balance: 2_000_000,
    monthlyNet: -50_000,
    baselineRunwayMonths: 26.7,
    baselineRunwayLabel: 'Healthy · 26.7 months',
    deltas: { ...EMPTY_FINANCE_SCENARIO, wageDeltaWeekly: 2_000 },
  });

  assert.equal(projection.runwayMonthsBefore, 26.7);
  assert.equal(projection.runwayBeforeLabel, 'Healthy · 26.7 months');
  // -50,000 - (2,000 × 52/12) = -58,667 → 2,000,000 / 58,667 = 34.1
  assert.equal(projection.runwayMonthsAfter, 34.1);
  assert.match(projection.verdict, /from Healthy · 26\.7 months to 34\.1 months/);
  assert.match(projection.basisNote ?? '', /averages your losing months/);
});

test('no basis note when the two runway methods agree', () => {
  const projection = projectFinanceScenario({
    ...baseInput,
    balance: 2_000_000,
    monthlyNet: -100_000,
    baselineRunwayMonths: 20,
    baselineRunwayLabel: 'Healthy · 20 months',
  });
  assert.equal(projection.basisNote, null);
  assert.equal(projection.runwayBeforeLabel, 'Healthy · 20 months');
});

test('a wage rise must worsen the monthly net and a wage saving must improve it', () => {
  const rise = projectFinanceScenario({
    ...baseInput,
    deltas: { ...EMPTY_FINANCE_SCENARIO, wageDeltaWeekly: 1_000 },
  });
  const cut = projectFinanceScenario({
    ...baseInput,
    deltas: { ...EMPTY_FINANCE_SCENARIO, wageDeltaWeekly: -1_000 },
  });
  assert.ok(rise.monthlyNetAfter! < baseInput.monthlyNet, 'a wage rise costs cash');
  assert.ok(cut.monthlyNetAfter! > baseInput.monthlyNet, 'a wage saving frees cash');
  assert.ok(rise.runwayMonthsAfter! < cut.runwayMonthsAfter!, 'signing shortens the runway');
});
