import type { ContractDecision } from '../utils/contractExpiryCentre';

export const CONTRACT_PLAN_STORAGE_KEY = 'fm27_contract_plan_v1';
export const CONTRACT_PLAN_MAX_CLUBS = 12;
export const CONTRACT_PLAN_MAX_ROWS = 250;

export type ContractPlanDecisions = Record<string, ContractDecision>;

export interface ReadableStorage {
  getItem(key: string): string | null;
}

export interface WritableStorage extends ReadableStorage {
  setItem(key: string, value: string): void;
}

interface StoredPlan {
  v: 1;
  clubs: Record<string, ContractPlanDecisions>;
}

const DECISIONS: ContractDecision[] = ['renew', 'sell', 'release'];

const isDecision = (value: unknown): value is ContractDecision =>
  typeof value === 'string' && (DECISIONS as string[]).includes(value);

const isRowKey = (value: string): boolean =>
  /^(player|staff):[A-Za-z0-9_.:-]{1,120}$/.test(value);

const isClubKey = (value: string): boolean => value.length > 0 && value.length <= 80;

/**
 * Plans are user decisions, not save data, so they live in localStorage and are scoped to a
 * club. Anything malformed is dropped rather than repaired into a guess.
 */
export function parseContractPlan(raw: string | null): StoredPlan {
  const empty: StoredPlan = { v: 1, clubs: {} };
  if (!raw) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== 'object') return empty;
  const clubs = (parsed as { clubs?: unknown }).clubs;
  if (!clubs || typeof clubs !== 'object' || Array.isArray(clubs)) return empty;

  const out: StoredPlan = { v: 1, clubs: {} };
  for (const [clubKey, decisions] of Object.entries(clubs as Record<string, unknown>)) {
    if (!isClubKey(clubKey)) continue;
    if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions)) continue;
    const clean: ContractPlanDecisions = {};
    for (const [rowKey, decision] of Object.entries(decisions as Record<string, unknown>)) {
      if (!isRowKey(rowKey) || !isDecision(decision)) continue;
      clean[rowKey] = decision;
      if (Object.keys(clean).length >= CONTRACT_PLAN_MAX_ROWS) break;
    }
    out.clubs[clubKey] = clean;
    if (Object.keys(out.clubs).length >= CONTRACT_PLAN_MAX_CLUBS) break;
  }
  return out;
}

export function readContractPlan(
  storage: ReadableStorage | null,
  clubKey: string
): ContractPlanDecisions {
  if (!storage || !isClubKey(clubKey)) return {};
  try {
    return parseContractPlan(storage.getItem(CONTRACT_PLAN_STORAGE_KEY)).clubs[clubKey] ?? {};
  } catch {
    return {};
  }
}

/**
 * Writes one decision and returns the club's new plan. Passing `null` clears the row, so the
 * same control both sets and unsets a plan.
 */
export function writeContractDecision(
  storage: WritableStorage | null,
  clubKey: string,
  rowKey: string,
  decision: ContractDecision | null
): ContractPlanDecisions {
  if (!storage || !isClubKey(clubKey)) return {};
  if (!isRowKey(rowKey)) return readContractPlan(storage, clubKey);
  try {
    const plan = parseContractPlan(storage.getItem(CONTRACT_PLAN_STORAGE_KEY));
    const current = { ...(plan.clubs[clubKey] ?? {}) };
    if (decision === null) {
      delete current[rowKey];
    } else {
      current[rowKey] = decision;
    }
    const next: StoredPlan = {
      v: 1,
      clubs: { ...plan.clubs, [clubKey]: current },
    };
    storage.setItem(CONTRACT_PLAN_STORAGE_KEY, JSON.stringify(next));
    return current;
  } catch {
    // A full or blocked storage must not break the panel.
    return readContractPlan(storage, clubKey);
  }
}
