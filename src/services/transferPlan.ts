import { PlanMove, PlanMoveKind, PlanPositionGroup } from '../utils/transferPlan';

/**
 * A plan lives in its own key. It is never merged into the save state, so planning can never
 * rewrite, replace or clear the decoded save the app is working from.
 */
export const PLAN_STORAGE_KEY = 'fm27_command_hub_transfer_plan_v1';

export const PLAN_MAX_MOVES = 40;

const KINDS: PlanMoveKind[] = ['sign', 'sell', 'release', 'wage'];
const GROUPS: PlanPositionGroup[] = ['GK', 'DEF', 'MID', 'FWD'];

let idCounter = 0;

export const makePlanMoveId = (): string => {
  idCounter += 1;
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `plan-${Date.now().toString(36)}-${idCounter}-${random}`;
};

const readNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Rejects anything that is not a usable move, so a corrupt plan cannot break the panel. */
export function normalizePlanMove(raw: unknown): PlanMove | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  const kind = candidate.kind;
  if (typeof kind !== 'string' || !KINDS.includes(kind as PlanMoveKind)) return null;
  const playerName =
    typeof candidate.playerName === 'string' ? candidate.playerName.trim() : '';
  if (!playerName) return null;
  const group = candidate.position;
  const position = GROUPS.includes(group as PlanPositionGroup)
    ? (group as PlanPositionGroup)
    : 'MID';
  const playerId =
    typeof candidate.playerId === 'string' && candidate.playerId.trim()
      ? candidate.playerId.trim()
      : null;

  return {
    id:
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id.trim()
        : makePlanMoveId(),
    kind: kind as PlanMoveKind,
    playerId,
    playerName,
    position,
    age: readNumber(candidate.age),
    wagePw: readNumber(candidate.wagePw),
    fee: Math.abs(readNumber(candidate.fee) ?? 0),
    note:
      typeof candidate.note === 'string' && candidate.note.trim()
        ? candidate.note.trim()
        : null,
  };
}

export function normalizePlanMoves(raw: unknown): PlanMove[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { moves?: unknown }).moves)
      ? ((raw as { moves: unknown[] }).moves)
      : [];
  return list
    .map((entry) => normalizePlanMove(entry))
    .filter((move): move is PlanMove => move !== null)
    .slice(0, PLAN_MAX_MOVES);
}

export function loadPlanMoves(): PlanMove[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return [];
    return normalizePlanMoves(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function savePlanMoves(moves: PlanMove[]): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    window.localStorage.setItem(
      PLAN_STORAGE_KEY,
      JSON.stringify({ version: 1, moves: moves.slice(0, PLAN_MAX_MOVES) })
    );
    return true;
  } catch {
    return false;
  }
}

export function clearPlanMoves(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(PLAN_STORAGE_KEY);
  } catch {
    // Ignore storage failures; a plan that cannot be cleared is not worth crashing over.
  }
}
