import type { StaffRecord } from '../types/fm27';
import type { PlayerTransferAdvice } from './transferAudit';
import {
  classifyStaffDepartment,
  staffContractDaysRemaining,
} from './staffRatings';

/** Players inside this window are in the alert centre. Matches the Transfers 12m tier. */
export const CONTRACT_CENTRE_PLAYER_WINDOW_MONTHS = 12;
/**
 * Staff share the same 12 month horizon here. The Staff tab keeps its tighter 190 day
 * "expiring soon" badge (`isStaffContractExpiringSoon`); this centre answers the wider
 * planning question, so it must not hide a coach whose deal ends next summer.
 */
export const CONTRACT_CENTRE_STAFF_WINDOW_MONTHS = 12;
/** Six months is the Bosman cut for players and the "act now" cut for staff. */
export const CONTRACT_CENTRE_CRITICAL_MONTHS = 6;

export type ContractDecision = 'renew' | 'sell' | 'release';
export type ContractUrgency = 'critical' | 'warning';

export interface ContractCentreRow {
  /** Plan key: `player:<id>` or `staff:<id>`. Stable across reloads. */
  key: string;
  kind: 'player' | 'staff';
  id: string;
  name: string;
  roleLabel: string;
  age: number | null;
  expiresLabel: string;
  monthsLeft: number | null;
  daysLeft: number | null;
  urgency: ContractUrgency;
  weeklyWage: number | null;
  marketValue: number | null;
  marketValueCapped: boolean;
  /** The existing Transfer Audit advice, or the staff contract note. Never re-derived here. */
  recommendation: string;
  /** What the existing advice already implies, offered as the default in the UI. */
  suggestedDecision: ContractDecision | null;
  /** The user's own plan, or null while undecided. */
  decision: ContractDecision | null;
}

export interface ContractCentreSummary {
  rows: ContractCentreRow[];
  playerCount: number;
  staffCount: number;
  criticalCount: number;
  weeklyWageAtRisk: number;
  /** Rows whose wage did not decode; their money is unknown, not zero. */
  wageUnknownCount: number;
  renewedCount: number;
  renewedWeeklyWage: number;
  soldCount: number;
  soldWeeklyWage: number;
  soldValue: number;
  releasedCount: number;
  releasedWeeklyWage: number;
  undecidedCount: number;
  undecidedWeeklyWage: number;
  /** Sold players whose stored value is the 300m ceiling, so the fee total is a floor. */
  cappedValueCount: number;
}

const STAFF_DEPARTMENT_LABEL: Record<string, string> = {
  coaching: 'Coaching',
  scouting: 'Recruitment',
  medical: 'Medical',
  board: 'Board',
};

/** Reuses the Transfer Audit verdict instead of forming a second opinion. */
export function suggestedDecisionForVerdict(verdict: string): ContractDecision | null {
  switch (verdict) {
    case 'Renew Now':
    case 'Protect Youth Asset':
    case 'Replace Before Selling':
      return 'renew';
    case 'Sell / Transfer List':
      return 'sell';
    case 'Let Expire':
      return 'release';
    default:
      return null;
  }
}

function staffRoleLabel(member: StaffRecord): string {
  const departmentLabel = STAFF_DEPARTMENT_LABEL[classifyStaffDepartment(member)] ?? 'Staff';
  return member.role ? `${departmentLabel} — ${member.role}` : departmentLabel;
}

function knownWage(wage: number | null | undefined): number | null {
  return typeof wage === 'number' && Number.isFinite(wage) && wage > 0 ? wage : null;
}

function knownValue(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function byUrgencyThenTime(a: ContractCentreRow, b: ContractCentreRow): number {
  if (a.urgency !== b.urgency) return a.urgency === 'critical' ? -1 : 1;
  const aTime = a.daysLeft ?? (a.monthsLeft !== null ? a.monthsLeft * 30.44 : Number.MAX_SAFE_INTEGER);
  const bTime = b.daysLeft ?? (b.monthsLeft !== null ? b.monthsLeft * 30.44 : Number.MAX_SAFE_INTEGER);
  if (aTime !== bTime) return aTime - bTime;
  return (b.weeklyWage ?? 0) - (a.weeklyWage ?? 0);
}

/**
 * One list of the players and staff whose contracts are running out, with the plan the user
 * has already chosen. Starting data comes from the Transfer Audit advice and the Staff tab
 * predicate; nothing here recomputes a verdict, so the centre cannot disagree with them.
 */
export function buildContractExpiryCentre(input: {
  players: ReadonlyArray<PlayerTransferAdvice>;
  staff: ReadonlyArray<StaffRecord>;
  saveDate?: string;
  decisions?: Record<string, ContractDecision>;
}): ContractCentreSummary {
  const decisions = input.decisions ?? {};
  const rows: ContractCentreRow[] = [];

  for (const advice of input.players) {
    const player = advice.player;
    const monthsLeft = advice.monthsLeft;
    if (monthsLeft === null || monthsLeft > CONTRACT_CENTRE_PLAYER_WINDOW_MONTHS) continue;
    const key = `player:${player.id}`;
    rows.push({
      key,
      kind: 'player',
      id: player.id,
      name: player.name,
      roleLabel: player.position,
      age: Number.isFinite(player.age) ? player.age : null,
      expiresLabel: player.expires,
      monthsLeft,
      daysLeft: null,
      urgency: monthsLeft <= CONTRACT_CENTRE_CRITICAL_MONTHS ? 'critical' : 'warning',
      weeklyWage: knownWage(player.wagePw),
      marketValue: knownValue(player.marketValue),
      marketValueCapped: player.marketValueCapped === true,
      recommendation: advice.recommendedMove,
      suggestedDecision: suggestedDecisionForVerdict(advice.verdict),
      decision: decisions[key] ?? null,
    });
  }

  for (const member of input.staff) {
    const daysLeft = staffContractDaysRemaining(member.expires, input.saveDate);
    if (daysLeft === null) continue;
    const monthsLeft = Math.round(daysLeft / 30.44);
    if (monthsLeft > CONTRACT_CENTRE_STAFF_WINDOW_MONTHS) continue;
    const key = `staff:${member.id}`;
    rows.push({
      key,
      kind: 'staff',
      id: member.id,
      name: member.name,
      roleLabel: staffRoleLabel(member),
      age: typeof member.age === 'number' && Number.isFinite(member.age) ? member.age : null,
      expiresLabel: member.expires,
      monthsLeft,
      daysLeft,
      urgency: monthsLeft <= CONTRACT_CENTRE_CRITICAL_MONTHS ? 'critical' : 'warning',
      weeklyWage: knownWage(member.wagePw),
      marketValue: null,
      marketValueCapped: false,
      recommendation:
        daysLeft <= 0
          ? 'Contract has already run out in this save.'
          : `Contract runs out in about ${Math.max(1, monthsLeft)} months.`,
      suggestedDecision: null,
      decision: decisions[key] ?? null,
    });
  }

  rows.sort(byUrgencyThenTime);

  const summary: ContractCentreSummary = {
    rows,
    playerCount: rows.filter((row) => row.kind === 'player').length,
    staffCount: rows.filter((row) => row.kind === 'staff').length,
    criticalCount: rows.filter((row) => row.urgency === 'critical').length,
    weeklyWageAtRisk: 0,
    wageUnknownCount: rows.filter((row) => row.weeklyWage === null).length,
    renewedCount: 0,
    renewedWeeklyWage: 0,
    soldCount: 0,
    soldWeeklyWage: 0,
    soldValue: 0,
    releasedCount: 0,
    releasedWeeklyWage: 0,
    undecidedCount: 0,
    undecidedWeeklyWage: 0,
    cappedValueCount: 0,
  };

  for (const row of rows) {
    const wage = row.weeklyWage ?? 0;
    summary.weeklyWageAtRisk += wage;
    switch (row.decision) {
      case 'renew':
        summary.renewedCount += 1;
        summary.renewedWeeklyWage += wage;
        break;
      case 'sell':
        summary.soldCount += 1;
        summary.soldWeeklyWage += wage;
        summary.soldValue += row.marketValue ?? 0;
        if (row.marketValueCapped) summary.cappedValueCount += 1;
        break;
      case 'release':
        summary.releasedCount += 1;
        summary.releasedWeeklyWage += wage;
        break;
      default:
        summary.undecidedCount += 1;
        summary.undecidedWeeklyWage += wage;
    }
  }

  return summary;
}
