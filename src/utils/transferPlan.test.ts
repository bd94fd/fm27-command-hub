import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerRecord } from '../types/fm27';
import { buildPlanImpact, PlanFinanceContext, PlanMove } from './transferPlan';

const makePlayer = (over: Partial<PlayerRecord> & { id: string; name: string; position: string }): PlayerRecord =>
  ({
    number: 1,
    apps: '10',
    minutes: 900,
    rating: 7,
    goals: 1,
    xG: 1,
    xGPer90: 0.1,
    assists: 1,
    xA: 1,
    xAPer90: 0.1,
    drbPer90: 1,
    prPassesPer90: 1,
    hdrPct: 50,
    intPer90: 1,
    tckPct: 50,
    personality: 'Balanced',
    age: 24,
    ability: 3,
    potential: 4,
    wagePw: 500,
    ...over,
  }) as PlayerRecord;

const squad: PlayerRecord[] = [
  makePlayer({ id: 'p1', name: 'René Vanden Borre', position: 'GK', wagePw: 400 }),
  makePlayer({ id: 'p2', name: 'Arthur Devos', position: 'DR', wagePw: 600 }),
  makePlayer({ id: 'p3', name: 'Brendan Schoonbaert', position: 'DC', wagePw: 700 }),
  makePlayer({ id: 'p4', name: 'Jef De Block', position: 'MC', wagePw: 550 }),
  makePlayer({ id: 'p5', name: 'Mbey Epolo', position: 'ST', wagePw: 900 }),
  makePlayer({ id: 'p6', name: 'Nathan Kaninda', position: 'AMR', wagePw: 500 }),
];

const finance: PlanFinanceContext = {
  balance: 1_000_000,
  monthlyNet: -100_000,
  monthlyBurnRate: 100_000,
  wagePayrollWeekly: 10_000,
  wageBudgetWeekly: 11_000,
  currencySymbol: '£',
  baselineRunwayMonths: 10,
  baselineRunwayLabel: '10 months',
};

const move = (over: Partial<PlanMove> & Pick<PlanMove, 'kind' | 'playerName'>): PlanMove => ({
  id: `m-${over.playerName}-${over.kind}`,
  playerId: null,
  position: 'MID',
  age: 25,
  wagePw: null,
  fee: 0,
  note: null,
  ...over,
});

test('no moves means no change and a plain instruction', () => {
  const impact = buildPlanImpact(squad, [], finance);
  assert.equal(impact.hasMoves, false);
  assert.equal(impact.wageDeltaWeekly, 0);
  assert.equal(impact.squadWageAfter, impact.squadWageBefore);
  assert.match(impact.verdict, /No moves planned/);
  assert.equal(impact.finance.changed, false);
});

test('a signing adds its offered wage and pays the fee', () => {
  const impact = buildPlanImpact(
    squad,
    [move({ kind: 'sign', playerName: 'New Striker', position: 'FWD', wagePw: 750, fee: 250_000 })],
    finance
  );
  assert.equal(impact.wageDeltaWeekly, 750);
  assert.equal(impact.feeOut, 250_000);
  assert.equal(impact.feeIn, 0);
  assert.equal(impact.squadWageAfter, impact.squadWageBefore + 750);
  assert.equal(impact.squadSizeAfter, squad.length + 1);
  assert.equal(impact.finance.balanceAfter, 750_000);
});

test('a sale frees the wage the save records and brings the fee in', () => {
  const impact = buildPlanImpact(
    squad,
    [move({ kind: 'sell', playerName: 'Mbey Epolo', playerId: 'p5', position: 'FWD', fee: 400_000 })],
    finance
  );
  assert.equal(impact.wageDeltaWeekly, -900);
  assert.equal(impact.feeIn, 400_000);
  assert.equal(impact.squadSizeAfter, squad.length - 1);
  assert.equal(impact.finance.balanceAfter, 1_400_000);
  assert.equal(impact.moves[0].status, 'ok');
});

test('a release frees the wage with no fee', () => {
  const impact = buildPlanImpact(
    squad,
    [move({ kind: 'release', playerName: 'Jef De Block', playerId: 'p4', position: 'MID' })],
    finance
  );
  assert.equal(impact.wageDeltaWeekly, -550);
  assert.equal(impact.feeIn, 0);
  assert.equal(impact.feeOut, 0);
});

test('a wage change is the difference between the new wage and the saved one', () => {
  const rise = buildPlanImpact(
    squad,
    [move({ kind: 'wage', playerName: 'Jef De Block', playerId: 'p4', wagePw: 800 })],
    finance
  );
  assert.equal(rise.wageDeltaWeekly, 250);
  assert.equal(rise.squadSizeAfter, squad.length);

  const cut = buildPlanImpact(
    squad,
    [move({ kind: 'wage', playerName: 'Jef De Block', playerId: 'p4', wagePw: 300 })],
    finance
  );
  assert.equal(cut.wageDeltaWeekly, -250);
});

test('moves stack into one combined impact', () => {
  const impact = buildPlanImpact(
    squad,
    [
      move({ kind: 'sell', playerName: 'Mbey Epolo', playerId: 'p5', position: 'FWD', fee: 400_000 }),
      move({ kind: 'sign', playerName: 'New Winger', position: 'MID', wagePw: 700, fee: 100_000 }),
      move({ kind: 'wage', playerName: 'Jef De Block', playerId: 'p4', wagePw: 650 }),
    ],
    finance
  );
  assert.equal(impact.wageDeltaWeekly, -900 + 700 + 100);
  assert.equal(impact.feeIn, 400_000);
  assert.equal(impact.feeOut, 100_000);
  assert.equal(impact.finance.balanceAfter, 1_300_000);
  assert.match(impact.verdict, /3 moves/);
});

test('money fields come from the shared finance projection', () => {
  const impact = buildPlanImpact(
    squad,
    [move({ kind: 'sign', playerName: 'Star', position: 'FWD', wagePw: 2_000 })],
    finance
  );
  // £2,000/wk = £8,667/mo, so the monthly net worsens from -100,000 to about -108,667.
  assert.equal(impact.finance.monthlyNetAfter, Math.round(-100_000 - 2_000 * (52 / 12)));
  assert.equal(impact.finance.wageHeadroomAfterWeekly, 11_000 - 12_000);
  assert.match(impact.finance.wageHeadroomAfterLabel, /over cap/);
});

test('depth tracks each position group and warns when a plan empties one', () => {
  const impact = buildPlanImpact(
    squad,
    [move({ kind: 'sell', playerName: 'René Vanden Borre', playerId: 'p1', position: 'GK', fee: 50_000 })],
    finance
  );
  const gk = impact.depth.find((row) => row.group === 'GK')!;
  assert.equal(gk.before, 1);
  assert.equal(gk.after, 0);
  assert.match(gk.warning!, /no goalkeeper/i);
  assert.ok(impact.warnings.some((w) => /no goalkeeper/i.test(w)));
});

test('depth warns when only one player is left in a group', () => {
  const thin = [
    makePlayer({ id: 'a', name: 'Keeper A', position: 'GK', wagePw: 300 }),
    makePlayer({ id: 'b', name: 'Keeper B', position: 'GK', wagePw: 300 }),
  ];
  const impact = buildPlanImpact(
    thin,
    [move({ kind: 'release', playerName: 'Keeper B', playerId: 'b', position: 'GK' })],
    finance
  );
  const gk = impact.depth.find((row) => row.group === 'GK')!;
  assert.equal(gk.after, 1);
  assert.match(gk.warning!, /only one goalkeeper/i);
});

test('depth never goes below zero', () => {
  const impact = buildPlanImpact(
    squad,
    [
      move({ kind: 'sell', playerName: 'René Vanden Borre', playerId: 'p1', position: 'GK', fee: 0 }),
      move({ kind: 'release', playerName: 'René again', playerId: 'p1', position: 'GK' }),
    ],
    finance
  );
  const gk = impact.depth.find((row) => row.group === 'GK')!;
  assert.equal(gk.after, 0);
  assert.equal(impact.squadSizeAfter, squad.length - 2);
});

test('a move for a player who has left the save falls back to the recorded wage and says so', () => {
  const impact = buildPlanImpact(
    squad,
    [move({ kind: 'sell', playerName: 'Gone Player', playerId: 'p999', position: 'FWD', wagePw: 480, fee: 0 })],
    finance
  );
  assert.equal(impact.wageDeltaWeekly, -480);
  assert.equal(impact.moves[0].status, 'stale');
  assert.ok(impact.warnings.some((w) => /no longer in the save/.test(w)));
});

test('an undecoded squad wage is treated as zero rather than a guess', () => {
  // The decoded save can hand back a null wage even though the type says number.
  const odd = [
    { ...makePlayer({ id: 'x', name: 'No Wage', position: 'MC' }), wagePw: null } as unknown as PlayerRecord,
  ];
  const impact = buildPlanImpact(
    odd,
    [move({ kind: 'release', playerName: 'No Wage', playerId: 'x', position: 'MID' })],
    finance
  );
  assert.equal(impact.wageDeltaWeekly, 0);
  assert.match(impact.moves[0].detail, /no decoded wage/i);
});

test('a save with no finance data refuses to project instead of guessing', () => {
  const impact = buildPlanImpact(squad, [move({ kind: 'sign', playerName: 'X', wagePw: 100 })], {
    ...finance,
    balance: null,
    monthlyNet: null,
    monthlyBurnRate: null,
  });
  assert.equal(impact.finance.available, false);
  assert.match(impact.finance.unavailableReason!, /no decoded/i);
  assert.match(impact.verdict, /money impact not available/i);
});
