import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_MAX_MOVES,
  PLAN_STORAGE_KEY,
  clearPlanMoves,
  loadPlanMoves,
  makePlanMoveId,
  normalizePlanMove,
  normalizePlanMoves,
  savePlanMoves,
} from './transferPlan';
import { FM27_STORAGE_KEY } from './fmStorage';
import { PlanMove } from '../utils/transferPlan';

const storage = new Map<string, string>();

const installStorage = () => {
  storage.clear();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
        removeItem: (key: string) => void storage.delete(key),
      },
    },
  });
};

const move = (over: Partial<PlanMove> = {}): PlanMove => ({
  id: 'm1',
  kind: 'sign',
  playerId: null,
  playerName: 'New Striker',
  position: 'FWD',
  age: 24,
  wagePw: 700,
  fee: 100_000,
  note: null,
  ...over,
});

test('the plan is stored under its own key, never in the save state', () => {
  installStorage();
  storage.set(FM27_STORAGE_KEY, '{"players":[]}');
  assert.equal(savePlanMoves([move()]), true);
  assert.equal(storage.get(FM27_STORAGE_KEY), '{"players":[]}');
  assert.ok(storage.get(PLAN_STORAGE_KEY)?.includes('New Striker'));
});

test('a saved plan loads back unchanged', () => {
  installStorage();
  const moves = [move(), move({ id: 'm2', kind: 'sell', playerId: 'p1', playerName: 'Sold', fee: 50_000 })];
  assert.equal(savePlanMoves(moves), true);
  assert.deepEqual(loadPlanMoves(), moves);
});

test('clearing the plan leaves the save state untouched', () => {
  installStorage();
  storage.set(FM27_STORAGE_KEY, '{"players":[]}');
  savePlanMoves([move()]);
  clearPlanMoves();
  assert.deepEqual(loadPlanMoves(), []);
  assert.equal(storage.get(FM27_STORAGE_KEY), '{"players":[]}');
});

test('corrupt or partial storage never throws and never yields junk rows', () => {
  installStorage();
  storage.set(PLAN_STORAGE_KEY, 'not json');
  assert.deepEqual(loadPlanMoves(), []);

  storage.set(
    PLAN_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      moves: [
        { kind: 'sign', playerName: 'Good', position: 'FWD', wagePw: 100, fee: 0 },
        { kind: 'teleport', playerName: 'Bad kind' },
        { kind: 'sell', playerName: '   ' },
        null,
        'nope',
      ],
    })
  );
  const loaded = loadPlanMoves();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].playerName, 'Good');
  assert.ok(loaded[0].id.startsWith('plan-'));
});

test('an unknown position falls back to midfielder rather than breaking the depth chart', () => {
  const normalised = normalizePlanMove({ kind: 'sign', playerName: 'X', position: 'SWEEPER' });
  assert.equal(normalised?.position, 'MID');
});

test('fees are magnitudes, so a typed negative fee cannot flip the cash flow', () => {
  const normalised = normalizePlanMove({ kind: 'sign', playerName: 'X', fee: -250_000 });
  assert.equal(normalised?.fee, 250_000);
});

test('a plan is capped so a runaway list cannot bloat storage', () => {
  installStorage();
  const many = Array.from({ length: PLAN_MAX_MOVES + 15 }, (_, i) => move({ id: `m${i}` }));
  savePlanMoves(many);
  assert.equal(loadPlanMoves().length, PLAN_MAX_MOVES);
  assert.equal(normalizePlanMoves(many).length, PLAN_MAX_MOVES);
});

test('move ids are unique within a session', () => {
  const ids = new Set(Array.from({ length: 50 }, () => makePlanMoveId()));
  assert.equal(ids.size, 50);
});

test('a storage failure is reported instead of thrown', () => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota');
        },
        removeItem: () => {
          throw new Error('quota');
        },
      },
    },
  });
  assert.equal(savePlanMoves([move()]), false);
  assert.deepEqual(loadPlanMoves(), []);
  assert.doesNotThrow(() => clearPlanMoves());
});
