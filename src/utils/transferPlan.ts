import { PlayerRecord } from '../types/fm27';
import { getPositionGroup, PositionGroupFilter } from './squadViewHelpers';
import {
  FinanceScenarioProjection,
  projectFinanceScenario,
} from './financeScenarios';

export type PlanMoveKind = 'sign' | 'sell' | 'release' | 'wage';

export type PlanPositionGroup = Exclude<PositionGroupFilter, 'ALL'>;

/**
 * One planned move. Nothing here is written back to the save: a plan is a what-if list the
 * user builds and keeps on this device, and every number is derived on the fly.
 */
export interface PlanMove {
  id: string;
  kind: PlanMoveKind;
  /** Squad member the move targets; null for a hypothetical signing. */
  playerId: string | null;
  playerName: string;
  position: PlanPositionGroup;
  age: number | null;
  /**
   * Sign: the wage being offered. Wage change: the new wage. Sell/release: the wage read from
   * the save when the move was added, used only if the player has since left the squad.
   */
  wagePw: number | null;
  /** Sign: fee paid. Sell: fee received. Release and wage change: 0. */
  fee: number;
  note: string | null;
}

export const PLAN_MOVE_LABELS: Record<PlanMoveKind, string> = {
  sign: 'Sign',
  sell: 'Sell',
  release: 'Release',
  wage: 'Wage change',
};

export const PLAN_POSITION_LABELS: Record<PlanPositionGroup, string> = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
};

export interface PlanMoveImpact {
  moveId: string;
  label: string;
  kind: PlanMoveKind;
  wageDeltaWeekly: number;
  feeIn: number;
  feeOut: number;
  /** `stale` when a sell/release/wage move points at someone no longer in the squad. */
  status: 'ok' | 'stale';
  detail: string;
}

export interface PlanDepthRow {
  group: PlanPositionGroup;
  label: string;
  before: number;
  after: number;
  warning: string | null;
}

export interface PlanImpact {
  hasMoves: boolean;
  moves: PlanMoveImpact[];
  wageDeltaWeekly: number;
  feeIn: number;
  feeOut: number;
  squadWageBefore: number;
  squadWageAfter: number;
  squadSizeBefore: number;
  squadSizeAfter: number;
  depth: PlanDepthRow[];
  finance: FinanceScenarioProjection;
  warnings: string[];
  verdict: string;
}

export interface PlanFinanceContext {
  balance: number | null;
  monthlyNet: number | null;
  monthlyBurnRate: number | null;
  wagePayrollWeekly: number | null;
  wageBudgetWeekly: number | null;
  currencySymbol: string;
  baselineRunwayMonths: number | null;
  baselineRunwayLabel: string;
}

const POSITION_ORDER: PlanPositionGroup[] = ['GK', 'DEF', 'MID', 'FWD'];

const isWage = (value: number | null): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const findPlayer = (
  squad: PlayerRecord[],
  playerId: string | null
): PlayerRecord | null =>
  playerId ? squad.find((player) => player.id === playerId) ?? null : null;

const describeMove = (move: PlanMove): string => {
  switch (move.kind) {
    case 'sign':
      return `Sign ${move.playerName}`;
    case 'sell':
      return `Sell ${move.playerName}`;
    case 'release':
      return `Release ${move.playerName}`;
    case 'wage':
      return `Change ${move.playerName}'s wage`;
  }
};

/**
 * Turns a plan into one set of numbers. Money goes through `projectFinanceScenario`, so the
 * balance, monthly net, runway and cap headroom here are computed exactly the way the
 * scenario panel above computes them, and the two can never disagree.
 */
export function buildPlanImpact(
  squad: PlayerRecord[],
  moves: PlanMove[],
  finance: PlanFinanceContext
): PlanImpact {
  const warnings: string[] = [];
  const impacts: PlanMoveImpact[] = [];
  let wageDeltaWeekly = 0;
  let feeIn = 0;
  let feeOut = 0;

  const depthBefore = new Map<PlanPositionGroup, number>();
  const depthAfter = new Map<PlanPositionGroup, number>();
  for (const player of squad) {
    const group = getPositionGroup(player.position);
    depthBefore.set(group, (depthBefore.get(group) ?? 0) + 1);
    depthAfter.set(group, (depthAfter.get(group) ?? 0) + 1);
  }

  for (const move of moves) {
    const player = findPlayer(squad, move.playerId);
    const stale = move.kind !== 'sign' && move.playerId !== null && player === null;
    let wageDelta = 0;
    let moveFeeIn = 0;
    let moveFeeOut = 0;
    let detail = '';

    if (move.kind === 'sign') {
      const wage = isWage(move.wagePw) ? move.wagePw : 0;
      wageDelta = wage;
      moveFeeOut = Math.abs(move.fee || 0);
      detail = wage > 0 ? `adds ${PLAN_MOVE_LABELS.sign.toLowerCase()} at the offered wage` : 'no wage offered yet';
      depthAfter.set(move.position, (depthAfter.get(move.position) ?? 0) + 1);
    } else {
      const squadWage = player ? player.wagePw ?? 0 : move.wagePw ?? 0;
      if (stale) {
        warnings.push(
          `${move.playerName} is no longer in the save, so the wage recorded when the move was added is used.`
        );
      }
      if (move.kind === 'sell') {
        wageDelta = -squadWage;
        moveFeeIn = Math.abs(move.fee || 0);
        detail = squadWage > 0 ? 'removes the wage and brings the fee in' : 'no decoded wage to remove';
        const group = getPositionGroup(player?.position ?? move.position);
        depthAfter.set(group, Math.max(0, (depthAfter.get(group) ?? 0) - 1));
      } else if (move.kind === 'release') {
        wageDelta = -squadWage;
        detail = squadWage > 0 ? 'removes the wage with no fee' : 'no decoded wage to remove';
        const group = getPositionGroup(player?.position ?? move.position);
        depthAfter.set(group, Math.max(0, (depthAfter.get(group) ?? 0) - 1));
      } else {
        const newWage = isWage(move.wagePw) ? move.wagePw : squadWage;
        wageDelta = newWage - squadWage;
        detail =
          wageDelta === 0
            ? 'no change'
            : `${wageDelta > 0 ? 'adds' : 'frees'} ${Math.abs(Math.round(wageDelta))} per week`;
      }
    }

    wageDeltaWeekly += wageDelta;
    feeIn += moveFeeIn;
    feeOut += moveFeeOut;
    impacts.push({
      moveId: move.id,
      label: describeMove(move),
      kind: move.kind,
      wageDeltaWeekly: Math.round(wageDelta),
      feeIn: moveFeeIn,
      feeOut: moveFeeOut,
      status: stale ? 'stale' : 'ok',
      detail,
    });
  }

  const squadWageBefore = squad.reduce((sum, player) => sum + (player.wagePw ?? 0), 0);
  const squadSizeBefore = squad.length;
  const squadSizeAfter = Math.max(0, squadSizeBefore + impacts.reduce((sum, impact) => {
    if (impact.kind === 'sign') return sum + 1;
    if (impact.kind === 'sell' || impact.kind === 'release') return sum - 1;
    return sum;
  }, 0));

  const depth: PlanDepthRow[] = POSITION_ORDER.map((group) => {
    const before = depthBefore.get(group) ?? 0;
    const after = depthAfter.get(group) ?? 0;
    let warning: string | null = null;
    if (before > 0 && after === 0) warning = `This plan leaves no ${PLAN_POSITION_LABELS[group].toLowerCase()}.`;
    else if (before > 0 && after === 1) warning = `Only one ${PLAN_POSITION_LABELS[group].toLowerCase()} left.`;
    return { group, label: PLAN_POSITION_LABELS[group], before, after, warning };
  });

  const projection = projectFinanceScenario({
    balance: finance.balance,
    monthlyNet: finance.monthlyNet,
    monthlyBurnRate: finance.monthlyBurnRate,
    wagePayrollWeekly: finance.wagePayrollWeekly,
    wageBudgetWeekly: finance.wageBudgetWeekly,
    currencySymbol: finance.currencySymbol,
    baselineRunwayMonths: finance.baselineRunwayMonths,
    baselineRunwayLabel: finance.baselineRunwayLabel,
    deltas: {
      wageDeltaWeekly,
      transferFeeIn: feeIn,
      transferFeeOut: feeOut,
      sponsorshipDeltaAnnual: 0,
    },
  });

  for (const row of depth) {
    if (row.warning) warnings.push(row.warning);
  }

  const verdict = buildVerdict({
    moves: moves.length,
    wageDeltaWeekly,
    feeIn,
    feeOut,
    projection,
    currencySymbol: finance.currencySymbol,
  });

  return {
    hasMoves: moves.length > 0,
    moves: impacts,
    wageDeltaWeekly: Math.round(wageDeltaWeekly),
    feeIn,
    feeOut,
    squadWageBefore,
    squadWageAfter: Math.max(0, squadWageBefore + wageDeltaWeekly),
    squadSizeBefore,
    squadSizeAfter,
    depth,
    finance: projection,
    warnings,
    verdict,
  };
}

const signedWeekly = (amount: number, currencySymbol: string): string => {
  if (amount === 0) return 'no wage change';
  const rounded = Math.round(Math.abs(amount)).toLocaleString();
  return amount > 0 ? `+${currencySymbol}${rounded}/wk` : `-${currencySymbol}${rounded}/wk`;
};

const buildVerdict = (input: {
  moves: number;
  wageDeltaWeekly: number;
  feeIn: number;
  feeOut: number;
  projection: FinanceScenarioProjection;
  currencySymbol: string;
}): string => {
  if (input.moves === 0) {
    return 'No moves planned. Add a signing, sale, release or wage change to see what it does.';
  }
  const parts: string[] = [];
  parts.push(`${input.moves} ${input.moves === 1 ? 'move' : 'moves'}`);
  parts.push(signedWeekly(input.wageDeltaWeekly, input.currencySymbol));
  if (input.feeIn > 0 || input.feeOut > 0) {
    const feeParts: string[] = [];
    if (input.feeIn > 0) feeParts.push(`${input.currencySymbol}${Math.round(input.feeIn).toLocaleString()} in`);
    if (input.feeOut > 0) feeParts.push(`${input.currencySymbol}${Math.round(input.feeOut).toLocaleString()} out`);
    parts.push(feeParts.join(', '));
  }
  if (input.projection.available) {
    parts.push(`runway ${input.projection.runwayAfterLabel}`);
    if (input.projection.wageHeadroomAfterWeekly !== null) {
      parts.push(`cap ${input.projection.wageHeadroomAfterLabel}`);
    }
  } else {
    parts.push('money impact not available for this save');
  }
  return `${parts.join(' · ')}.`;
};
