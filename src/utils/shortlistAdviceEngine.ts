/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Targeted In-Game Shortlist Advice, Gap-Fit & Direct First-Team Upgrade Engine.
 * Evaluates strictly the manager's decoded In-Game FM27 Shortlist against live squad gaps,
 * First-Team incumbents, personality/traits, and the club's Strict Financial Budget Gate
 * using visible attributes, FM27 Dual-Phase IP/OOP role scores, and real wages/fees (ZERO raw CA/PA).
 */

import type { PlayerRecord } from '../types/fm27';
import type {
  DivisionBenchmarks,
  LastMatchTacticBlueprint,
  RecruitmentTarget,
} from '../types/fmSave';
import {
  ClubDnaPillarWeights,
  evaluatePlayerClubDna,
} from './clubDnaEngine';
import { evaluateDualPhaseRoles } from './dualPhaseRoleEngine';
import {
  buildScoutTargetPlayerRecord,
  buildTargetVsStarterComparison,
  classifyExactPositionSlot,
  computeTargetBestRoleFit,
  evaluatePlaybookArchetype,
  ExactPositionSlot,
  TargetVsStarterComparison,
} from './recruitmentHelpers';
import type {
  PlayerTransferAdvice,
  PositionBucketCode,
  PositionalSigningNeed,
  SquadTransferAuditSummary,
} from './transferAudit';

export type ShortlistRecommendationTier =
  | 'direct_xi_upgrade'
  | 'fills_gap_now'
  | 'cheaper_squad_upgrade'
  | 'future_succession'
  | 'monitor_budget_blocked'
  | 'below_squad_level';

export interface ShortlistBudgetEvaluation {
  passesBudgetGate: boolean;
  dealRoute:
    | 'free_agent'
    | 'pre_contract'
    | 'loan_option'
    | 'cash_fee'
    | 'not_for_sale';
  estimatedFee: number | null;
  feeLabel: string;
  expectedWagePw: number;
  netWeeklyWageDelta: number | null; // negative = cheaper than incumbent
  budgetSummary: string;
  whenViableNote: string | null;
}

export interface ShortlistCharacterEvaluation {
  modifier: number; // -10 .. +8 holistic score delta
  personalityLabel: string;
  positiveSignals: string[];
  riskSignals: string[];
  traitNotes: string[];
  hasSeriousRedFlag: boolean;
}

export interface ShortlistTargetAdvice {
  target: RecruitmentTarget;
  syntheticPlayer: PlayerRecord;
  bucketCode: PositionBucketCode;
  exactSlot: ExactPositionSlot;
  tier: ShortlistRecommendationTier;
  tierLabel: string;
  badgeTone: 'emerald' | 'sky' | 'teal' | 'purple' | 'amber' | 'slate';
  priorityScore: number; // higher = show first
  isActionable: boolean; // passes strict budget gate & genuinely helps now or future
  bestIpRole: string;
  bestOopRole: string;
  ipRoleFitPct: number;
  oopRoleFitPct: number;
  dnaFitPct: number;
  archetypeName: string;
  archetypeScore: number;
  /** The specific squad player this shortlisted target upgrades or replaces (First-Team starter or paid backup). */
  targetIncumbent: PlayerRecord | null;
  incumbentRoleLabel: 'First-Team Starter' | 'Senior Rotation/Backup' | 'Expiring/Exit Slot' | null;
  comparison: TargetVsStarterComparison | null;
  footballDelta: number | null; // positive = target outperforms incumbent on holistic role+DNA+character
  budget: ShortlistBudgetEvaluation;
  character: ShortlistCharacterEvaluation;
  /** Which positional need or succession gap this player addresses, if any. */
  matchedNeed: PositionalSigningNeed | null;
  /** Plain-English tactical & squad-building narratives */
  headline: string;
  howFitsNow: string;
  howFitsFuture: string;
  whyUpgradeOrHold: string;
  dealStructureAdvice: string;
}

export interface ShortlistAuditSummary {
  items: ShortlistTargetAdvice[];
  directUpgrades: ShortlistTargetAdvice[];
  gapFillersNow: ShortlistTargetAdvice[];
  cheaperBackups: ShortlistTargetAdvice[];
  futureSuccessors: ShortlistTargetAdvice[];
  budgetBlocked: ShortlistTargetAdvice[];
  belowLevel: ShortlistTargetAdvice[];
  actionableCount: number;
  /** Inline lookup: squad player id -> best actionable shortlist upgrades/replacements for that player */
  bySquadPlayerId: Record<string, ShortlistTargetAdvice[]>;
  /** Inline lookup: positional bucket -> top matching shortlist players (actionable first, then blocked) */
  byBucketCode: Record<PositionBucketCode, ShortlistTargetAdvice[]>;
  /** Loan-viable shortlist options (passing budget gate via loan route) */
  loanViableTargets: ShortlistTargetAdvice[];
}

export interface EvaluateShortlistOptions {
  shortlistTargets: RecruitmentTarget[];
  squadPlayers: PlayerRecord[];
  audit: SquadTransferAuditSummary;
  divisionBenchmarks?: DivisionBenchmarks | null;
  lastMatchTactic?: LastMatchTacticBlueprint | null;
  clubDnaWeights?: ClubDnaPillarWeights;
  transferBudgetRemaining?: number | null;
}

export function mapExactSlotToBucketCode(slot: ExactPositionSlot): PositionBucketCode {
  switch (slot) {
    case 'GK':
      return 'GK';
    case 'DR':
      return 'RB';
    case 'DL':
      return 'LB';
    case 'DC':
      return 'CB';
    case 'DM':
      return 'DM';
    case 'MC':
      return 'CM';
    case 'AMC':
      return 'AM';
    case 'AML':
    case 'AMR':
      return 'W';
    case 'STC':
      return 'ST';
    default:
      return 'CM';
  }
}

function formatCompactMoney(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  if (abs >= 1_000_000) return `£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `£${Math.round(abs / 1_000)}k`;
  return `£${abs.toLocaleString()}`;
}

const POSITIVE_TRAIT_HINTS: Array<{ match: RegExp; note: string; bonus: number }> = [
  { match: /places shots/i, note: 'Places Shots (reliable finishing)', bonus: 1.5 },
  { match: /likes to beat offside trap/i, note: 'Beats Offside Trap (suits counter transitions)', bonus: 1.2 },
  { match: /tries killer balls/i, note: 'Tries Killer Balls (line-breaking vision)', bonus: 1.2 },
  { match: /plays one-twos/i, note: 'Plays One-Twos (sharp combination play)', bonus: 1.0 },
  { match: /dictates tempo/i, note: 'Dictates Tempo (controls build-up rhythm)', bonus: 1.2 },
  { match: /marks opponent tightly/i, note: 'Marks Tightly (strong OOP discipline)', bonus: 1.0 },
  { match: /does not dive into tackles/i, note: 'Stays On Feet (low foul/card risk)', bonus: 1.0 },
  { match: /arrives late in opponent/i, note: 'Arrives Late in Box (second-wave goal threat)', bonus: 1.0 },
  { match: /gets forward whenever possible/i, note: 'Overlaps Naturally (adds width)', bonus: 0.8 },
];

const RISKY_TRAIT_HINTS: Array<{ match: RegExp; note: string; penalty: number }> = [
  { match: /argues with officials/i, note: 'Argues With Officials (card/ban risk)', penalty: -1.5 },
  { match: /dwells on ball/i, note: 'Dwells On Ball (press turnover risk)', penalty: -2.0 },
  { match: /dives into tackles/i, note: 'Dives Into Tackles (foul/red-card risk)', penalty: -1.5 },
  { match: /shoots from distance/i, note: 'Shoots From Distance (wastes possession)', penalty: -1.0 },
  { match: /stops play/i, note: 'Stops Play (slows counter-attacks)', penalty: -1.2 },
  { match: /avoids using weaker foot/i, note: 'One-Footed (predictable under press)', penalty: -0.8 },
];

export function evaluateTargetCharacter(
  target: RecruitmentTarget,
  synthetic: PlayerRecord
): ShortlistCharacterEvaluation {
  const personalityLabel = (target.personality || synthetic.personality || 'Balanced').trim();
  const persLower = personalityLabel.toLowerCase();
  const det = Number(synthetic.attributes.determination ?? 10);
  const badges = target.scoutBadges || [];
  const traits = target.traits || [];

  let modifier = 0;
  const positiveSignals: string[] = [];
  const riskSignals: string[] = [];
  const traitNotes: string[] = [];
  let hasSeriousRedFlag = false;

  if (persLower.includes('model citizen') || persLower.includes('model professional')) {
    modifier += 5;
    positiveSignals.push(`${personalityLabel} personality`);
  } else if (
    persLower.includes('professional') ||
    persLower.includes('resolute') ||
    persLower.includes('perfectionist') ||
    persLower.includes('driven') ||
    persLower.includes('spirited') ||
    persLower.includes('determined')
  ) {
    modifier += 3;
    positiveSignals.push(`${personalityLabel} mentality`);
  } else if (
    persLower.includes('unambitious') ||
    persLower.includes('casual') ||
    persLower.includes('slack') ||
    persLower.includes('temperamental') ||
    persLower.includes('low determination') ||
    persLower.includes('spineless') ||
    persLower.includes('easily discouraged')
  ) {
    modifier -= 6;
    hasSeriousRedFlag = true;
    riskSignals.push(`${personalityLabel} personality`);
  }

  if (det >= 15) {
    modifier += 1.5;
    positiveSignals.push(`Det ${det}/20`);
  } else if (det <= 8) {
    modifier -= 2.5;
    riskSignals.push(`Low Det (${det}/20)`);
  }

  if (badges.includes('Consistent Performer')) {
    modifier += 2.5;
    positiveSignals.push('Consistent Performer');
  }
  if (badges.includes('Big-Game Player')) {
    modifier += 1.5;
    positiveSignals.push('Big-Game Player');
  }
  if (badges.includes('Versatile')) {
    modifier += 1;
    positiveSignals.push('Versatile');
  }
  if (badges.includes('Injury-Prone')) {
    modifier -= 6;
    hasSeriousRedFlag = true;
    riskSignals.push('Injury-Prone');
  }

  for (const tr of traits) {
    for (const posRule of POSITIVE_TRAIT_HINTS) {
      if (posRule.match.test(tr)) {
        modifier += posRule.bonus;
        traitNotes.push(`+ ${posRule.note}`);
        break;
      }
    }
    for (const negRule of RISKY_TRAIT_HINTS) {
      if (negRule.match.test(tr)) {
        modifier += negRule.penalty;
        traitNotes.push(`! ${negRule.note}`);
        break;
      }
    }
  }

  return {
    modifier: Math.max(-10, Math.min(8, Math.round(modifier * 10) / 10)),
    personalityLabel,
    positiveSignals,
    riskSignals,
    traitNotes: traitNotes.slice(0, 3),
    hasSeriousRedFlag,
  };
}

function scorePlayerCharacterSimple(p: PlayerRecord): number {
  const persLower = (p.personality || '').toLowerCase();
  const det = Number(p.attributes?.determination ?? 10);
  const badges = p.scoutBadges || [];
  let mod = 0;
  if (persLower.includes('model citizen') || persLower.includes('model professional')) mod += 5;
  else if (
    persLower.includes('professional') ||
    persLower.includes('resolute') ||
    persLower.includes('driven') ||
    persLower.includes('spirited') ||
    persLower.includes('determined')
  ) {
    mod += 3;
  } else if (
    persLower.includes('unambitious') ||
    persLower.includes('casual') ||
    persLower.includes('slack') ||
    persLower.includes('temperamental')
  ) {
    mod -= 6;
  }
  if (det >= 15) mod += 1.5;
  else if (det <= 8) mod -= 2.5;
  if (badges.includes('Consistent Performer')) mod += 2.5;
  if (badges.includes('Big-Game Player')) mod += 1.5;
  if (badges.includes('Injury-Prone')) mod -= 6;
  return mod;
}

function computeHolisticFootballScore(
  player: PlayerRecord,
  positionRef: string,
  dnaScore: number,
  ipFitPct: number,
  oopFitPct: number,
  charMod: number
): number {
  const archScore = evaluatePlaybookArchetype(positionRef, player.attributes).score;
  const dualRole = ipFitPct * 0.6 + oopFitPct * 0.4;
  return Math.round((dualRole * 0.45 + dnaScore * 0.35 + archScore * 0.2 + charMod) * 10) / 10;
}

function evaluateBudgetGate(
  target: RecruitmentTarget,
  incumbent: PlayerRecord | null,
  audit: SquadTransferAuditSummary,
  transferBudgetRemaining: number | null | undefined
): ShortlistBudgetEvaluation {
  const { clubProfile, leagueLevelCalibration, loanAdvice, tierBenchmarks } = audit;
  const isInDebt = clubProfile.isInDebt;
  const isOverWageCap = clubProfile.isMateriallyOverWageBudget;
  const wageHeadroom = clubProfile.wageHeadroomWeekly;
  const incumbentWage = incumbent ? Math.max(0, incumbent.wagePw || 0) : 0;
  const incumbentMarketVal =
    incumbent &&
    !incumbent.marketValueCapped &&
    typeof incumbent.marketValue === 'number' &&
    incumbent.marketValue > 0
      ? incumbent.marketValue
      : 0;

  // Resolve release clause if lower than valuation
  const minReleaseClause = (target.contractDetails?.releaseClauses || [])
    .filter((rc) => rc.amount > 0 && /minimum|release|relegation/i.test(rc.type || ''))
    .map((rc) => rc.amount)
    .sort((a, b) => a - b)[0];

  const rawTransferVal =
    target.transferValueState !== 'capped' &&
    typeof target.transferValue === 'number' &&
    target.transferValue > 0
      ? target.transferValue
      : null;

  let estimatedFee: number | null;
  if (target.isFreeAgent || (target.contractExpiryMonths > 0 && target.contractExpiryMonths <= 6)) {
    estimatedFee = 0;
  } else if (minReleaseClause && (!rawTransferVal || minReleaseClause < rawTransferVal)) {
    estimatedFee = minReleaseClause;
  } else {
    estimatedFee = rawTransferVal;
  }

  const currentWage = Math.max(
    0,
    Math.round(target.currentWagePw ?? target.demandedWageEur ?? 0)
  );

  // Determine deal route & expected weekly wage
  let dealRoute: ShortlistBudgetEvaluation['dealRoute'] = 'cash_fee';
  let expectedWagePw = currentWage;
  let feeLabel = 'Fee Required';

  if (target.isFreeAgent) {
    dealRoute = 'free_agent';
    expectedWagePw = Math.max(
      0,
      Math.round(
        target.demandedWageEur > 0
          ? target.demandedWageEur
          : Math.min(
              tierBenchmarks.medianPaidWeeklyWage || 250,
              Math.max(120, Math.round((tierBenchmarks.medianPaidWeeklyWage || 250) * 0.85))
            )
      )
    );
    feeLabel = '£0 Free Transfer';
  } else if (target.contractExpiryMonths > 0 && target.contractExpiryMonths <= 6) {
    dealRoute = 'pre_contract';
    expectedWagePw = currentWage;
    feeLabel = `£0 Pre-Contract (${target.contractExpiryMonths}m left)`;
  } else if (target.transferValueState === 'capped') {
    dealRoute = target.isLoanCandidate ? 'loan_option' : 'not_for_sale';
    feeLabel = target.isLoanCandidate ? '£0 Loan Path (Not For Sale)' : 'Not For Sale';
    if (target.isLoanCandidate) {
      expectedWagePw = Math.round(currentWage * 0.3);
    }
  } else if (
    target.isLoanCandidate &&
    (isInDebt ||
      (typeof transferBudgetRemaining === 'number' &&
        estimatedFee !== null &&
        estimatedFee > transferBudgetRemaining) ||
      (estimatedFee !== null && estimatedFee > 15_000 && (clubProfile.balanceNum ?? 0) < 100_000))
  ) {
    dealRoute = 'loan_option';
    expectedWagePw = Math.min(
      loanAdvice.incomingLoanPriorities[0]?.maxWeeklyWageSharePw ?? Math.round(currentWage * 0.35),
      Math.round(currentWage * 0.35)
    );
    feeLabel = `£0 Loan Path (Val ${estimatedFee ? formatCompactMoney(estimatedFee) : 'Parent Club'})`;
  } else {
    dealRoute = 'cash_fee';
    if (minReleaseClause && estimatedFee === minReleaseClause) {
      feeLabel = `Clause ${formatCompactMoney(minReleaseClause)}`;
    } else if (estimatedFee !== null && estimatedFee > 0) {
      feeLabel = `Est. Fee ${formatCompactMoney(estimatedFee)}`;
    } else {
      feeLabel = 'Transfer Fee Required';
    }
  }

  const netWeeklyWageDelta = incumbent ? expectedWagePw - incumbentWage : null;

  // Strict Club Budget Gate — 1) Fee Check
  const availableTransferCash =
    typeof transferBudgetRemaining === 'number' && Number.isFinite(transferBudgetRemaining)
      ? Math.max(0, transferBudgetRemaining)
      : isInDebt
        ? 0
        : Math.max(0, Math.round((clubProfile.balanceNum ?? 0) * 0.25));

  let feePasses = true;
  let feeBlockReason: string | null = null;
  if (dealRoute === 'not_for_sale') {
    feePasses = false;
    feeBlockReason = `${target.currentClub || 'His club'} lists him as Not For Sale`;
  } else if (dealRoute === 'cash_fee') {
    const reqFee = estimatedFee ?? 0;
    const fundedBySale =
      !isInDebt && incumbentMarketVal > 0 && incumbentMarketVal + availableTransferCash >= reqFee;
    if (isInDebt && reqFee > 0) {
      feePasses = false;
      feeBlockReason = `Cash fee (${formatCompactMoney(reqFee)}) blocked while club is in ${clubProfile.balanceLabel} debt`;
    } else if (reqFee > availableTransferCash && !fundedBySale) {
      feePasses = false;
      feeBlockReason = `Est. fee (${formatCompactMoney(reqFee)}) exceeds available transfer budget (${formatCompactMoney(availableTransferCash)})`;
    }
  }

  // Strict Club Budget Gate — 2) Wage Check
  let wagePasses = true;
  let wageBlockReason: string | null = null;
  const maxSoloWage =
    wageHeadroom !== null
      ? Math.max(0, wageHeadroom)
      : Math.max(tierBenchmarks.p75PaidWeeklyWage, 250);
  const maxFundedWage = Math.max(0, (wageHeadroom ?? 0) + incumbentWage);

  if (isOverWageCap) {
    // When materially over wage cap, must either be cheaper/equal to incumbent or virtually free (<= £120/wk)
    if (incumbent && expectedWagePw > incumbentWage) {
      wagePasses = false;
      wageBlockReason = `Wage (£${expectedWagePw.toLocaleString()}/wk) is +£${(expectedWagePw - incumbentWage).toLocaleString()}/wk higher than ${incumbent.name} while over wage cap`;
    } else if (!incumbent && expectedWagePw > 120) {
      wagePasses = false;
      wageBlockReason = `Wage (£${expectedWagePw.toLocaleString()}/wk) adds payroll while ${clubProfile.wageComplianceLabel}`;
    }
  } else if (wageHeadroom !== null) {
    const allowedWage = incumbent ? maxFundedWage : maxSoloWage;
    // Allow tiny 10% negotiation buffer when not in debt
    const ceiling = isInDebt ? allowedWage : Math.round(allowedWage * 1.1);
    if (expectedWagePw > ceiling && expectedWagePw > 0) {
      wagePasses = false;
      wageBlockReason = incumbent
        ? `Wage (£${expectedWagePw.toLocaleString()}/wk) exceeds headroom even after offloading ${incumbent.name} (£${incumbentWage.toLocaleString()}/wk)`
        : `Wage (£${expectedWagePw.toLocaleString()}/wk) exceeds remaining weekly headroom (£${Math.max(0, wageHeadroom).toLocaleString()}/wk)`;
    }
  }

  // Lower-league debt guardrail: even loan candidates whose parent wage is huge (> 3.5x squad p75) won't realistically come on 0-30% share
  if (
    dealRoute === 'loan_option' &&
    currentWage > Math.max(1500, (tierBenchmarks.p75PaidWeeklyWage || 400) * 4.5) &&
    (isInDebt || leagueLevelCalibration.divisionMedianWeeklyWage === null || leagueLevelCalibration.divisionMedianWeeklyWage < 600)
  ) {
    wagePasses = false;
    wageBlockReason = `Parent club wage (£${currentWage.toLocaleString()}/wk) is far above ${leagueLevelCalibration.competitionName} scale`;
  }

  const passesBudgetGate = feePasses && wagePasses;

  let budgetSummary = '';
  let whenViableNote: string | null = null;
  if (passesBudgetGate) {
    if (dealRoute === 'free_agent') {
      budgetSummary = incumbent
        ? `£0 fee · est. £${expectedWagePw.toLocaleString()}/wk (${netWeeklyWageDelta !== null && netWeeklyWageDelta <= 0 ? `saves £${Math.abs(netWeeklyWageDelta).toLocaleString()}/wk vs ${incumbent.name}` : `within budget`})`
        : `£0 Free Transfer · 2-week trial available`;
    } else if (dealRoute === 'pre_contract') {
      budgetSummary = `£0 Pre-Contract (${target.contractExpiryMonths}m left) · £${expectedWagePw.toLocaleString()}/wk`;
    } else if (dealRoute === 'loan_option') {
      budgetSummary = `£0 Loan Fee · est. ~£${expectedWagePw.toLocaleString()}/wk wage share`;
    } else {
      budgetSummary = `${feeLabel} · £${expectedWagePw.toLocaleString()}/wk (within club budget)`;
    }
  } else {
    budgetSummary = feeBlockReason || wageBlockReason || 'Outside current club budget';
    if (!feePasses && target.contractExpiryMonths > 6) {
      const monthsToBosman = Math.max(1, target.contractExpiryMonths - 6);
      whenViableNote =
        target.age <= 23
          ? `Try a £0-fee / 0%–30% wage-share loan first, or revisit in ${monthsToBosman}m when he enters his pre-contract window.`
          : `Revisit in ${monthsToBosman}m for a £0 pre-contract, or once club debt/transfer budget clears.`;
    } else if (!wagePasses) {
      whenViableNote = incumbent
        ? `Becomes viable once you offload ${incumbent.name} (£${incumbentWage.toLocaleString()}/wk) or clear surplus wages.`
        : `Becomes viable once surplus wages are cleared from the payroll.`;
    }
  }

  return {
    passesBudgetGate,
    dealRoute,
    estimatedFee,
    feeLabel,
    expectedWagePw,
    netWeeklyWageDelta,
    budgetSummary,
    whenViableNote,
  };
}

function getBucketPlayersSorted(
  bucketCode: PositionBucketCode,
  audit: SquadTransferAuditSummary
): {
  need: PositionalSigningNeed | null;
  activeSeniors: PlayerRecord[];
  exitCandidates: PlayerTransferAdvice[];
} {
  const need = audit.positionalNeeds.find((n) => n.code === bucketCode) ?? null;
  const activeSeniors = (need?.seniorPrimaryPlayers || []).filter(
    (p) =>
      p.status !== 'Surplus' &&
      !/surplus/i.test(p.contractDetails?.promisedPlayingTime || '')
  );
  const exitCandidates = audit.playerAdvice.filter(
    (a) =>
      a.primaryBucketCode === bucketCode &&
      a.squadTier === 'senior' &&
      (a.verdict === 'Replace Before Selling' ||
        a.verdict === 'Sell / Transfer List' ||
        a.verdict === 'Let Expire')
  );
  return { need, activeSeniors, exitCandidates };
}

/**
 * Evaluates every player on the manager's in-game FM27 shortlist against the live squad,
 * positional needs, succession gaps, First-Team starters, personality/traits, and Strict Club Budget Gate.
 */
export function evaluateInGameShortlist(
  options: EvaluateShortlistOptions
): ShortlistAuditSummary {
  const {
    shortlistTargets,
    squadPlayers,
    audit,
    divisionBenchmarks = null,
    lastMatchTactic = null,
    clubDnaWeights,
    transferBudgetRemaining = null,
  } = options;

  const emptyByBucket: Record<PositionBucketCode, ShortlistTargetAdvice[]> = {
    GK: [],
    RB: [],
    CB: [],
    LB: [],
    DM: [],
    CM: [],
    AM: [],
    W: [],
    ST: [],
  };

  if (!shortlistTargets.length || !squadPlayers.length) {
    return {
      items: [],
      directUpgrades: [],
      gapFillersNow: [],
      cheaperBackups: [],
      futureSuccessors: [],
      budgetBlocked: [],
      belowLevel: [],
      actionableCount: 0,
      bySquadPlayerId: {},
      byBucketCode: emptyByBucket,
      loanViableTargets: [],
    };
  }

  // Pre-score squad players once so 100 shortlist comparisons stay sub-10ms
  const squadScoreCache = new Map<string, { score: number; dna: number; ipFit: number; oopFit: number }>();
  const getSquadPlayerScore = (p: PlayerRecord, posRef: string) => {
    const key = `${p.id}::${posRef}`;
    const cached = squadScoreCache.get(key);
    if (cached) return cached;
    const dna = evaluatePlayerClubDna(p.position, p.attributes, clubDnaWeights, divisionBenchmarks)
      .overallDnaScore;
    const dual = evaluateDualPhaseRoles(p, 1);
    const ipFit = dual.bestInPossession?.fit ?? 55;
    const oopFit = dual.bestOutOfPossession?.fit ?? ipFit;
    const charMod = scorePlayerCharacterSimple(p);
    const score = computeHolisticFootballScore(p, posRef, dna, ipFit, oopFit, charMod);
    const entry = { score, dna, ipFit, oopFit };
    squadScoreCache.set(key, entry);
    return entry;
  };

  const items: ShortlistTargetAdvice[] = shortlistTargets.map((target) => {
    const synthetic = buildScoutTargetPlayerRecord(target);
    const exactSlot = classifyExactPositionSlot(target.primaryPosition);
    const bucketCode = mapExactSlotToBucketCode(exactSlot);

    const dual = evaluateDualPhaseRoles(synthetic, 2);
    const fallbackRole = computeTargetBestRoleFit(target);
    const bestIpRole = dual.bestInPossession?.name || fallbackRole.roleName || 'Central Midfielder';
    const bestOopRole = dual.bestOutOfPossession?.name || bestIpRole;
    const ipRoleFitPct = dual.bestInPossession?.fit ?? fallbackRole.fitPct;
    const oopRoleFitPct = dual.bestOutOfPossession?.fit ?? ipRoleFitPct;

    const dna = evaluatePlayerClubDna(
      target.primaryPosition,
      synthetic.attributes,
      clubDnaWeights,
      divisionBenchmarks
    );
    const archetype = evaluatePlaybookArchetype(target.primaryPosition, target.attributes);
    const character = evaluateTargetCharacter(target, synthetic);
    const targetHolistic = computeHolisticFootballScore(
      synthetic,
      target.primaryPosition,
      dna.overallDnaScore,
      ipRoleFitPct,
      oopRoleFitPct,
      character.modifier
    );

    const { need, activeSeniors, exitCandidates } = getBucketPlayersSorted(bucketCode, audit);

    // Determine primary starters in this bucket (top 2 for CB/CM/W, top 1 for GK/RB/LB/DM/AM/ST)
    const starterSlots = bucketCode === 'CB' || bucketCode === 'CM' || bucketCode === 'W' ? 2 : 1;
    const starters = activeSeniors.slice(0, starterSlots);
    const backups = activeSeniors.slice(starterSlots);

    // Find the weakest current starter we could directly upgrade, or an exit/backup candidate
    let bestStarterToUpgrade: { player: PlayerRecord; delta: number } | null = null;
    for (const st of starters) {
      const stEval = getSquadPlayerScore(st, target.primaryPosition);
      const delta = Math.round((targetHolistic - stEval.score) * 10) / 10;
      if (!bestStarterToUpgrade || delta > bestStarterToUpgrade.delta) {
        bestStarterToUpgrade = { player: st, delta };
      }
    }

    let bestExitOrBackup: {
      player: PlayerRecord;
      delta: number;
      isExitSlot: boolean;
    } | null = null;
    for (const ex of exitCandidates) {
      const exEval = getSquadPlayerScore(ex.player, target.primaryPosition);
      const delta = Math.round((targetHolistic - exEval.score) * 10) / 10;
      if (!bestExitOrBackup || delta > bestExitOrBackup.delta) {
        bestExitOrBackup = { player: ex.player, delta, isExitSlot: true };
      }
    }
    if (!bestExitOrBackup) {
      for (const bk of backups) {
        const bkEval = getSquadPlayerScore(bk, target.primaryPosition);
        const delta = Math.round((targetHolistic - bkEval.score) * 10) / 10;
        if (!bestExitOrBackup || delta > bestExitOrBackup.delta) {
          bestExitOrBackup = { player: bk, delta, isExitSlot: false };
        }
      }
    }

    const isGenuineSigningGap = need?.status === 'Need Signing';
    const isSuccessionGap = Boolean(need?.hasSuccessionGap);
    const hasReplaceBeforeSelling = exitCandidates.some(
      (e) => e.verdict === 'Replace Before Selling'
    );

    // Pick the primary incumbent to compare against & test budget against
    let targetIncumbent: PlayerRecord | null = null;
    let incumbentRoleLabel: ShortlistTargetAdvice['incumbentRoleLabel'] = null;
    let footballDelta: number | null = null;

    const beatsStarterClearly =
      bestStarterToUpgrade !== null &&
      bestStarterToUpgrade.delta >= 2.5 &&
      !character.hasSeriousRedFlag;

    if (beatsStarterClearly && bestStarterToUpgrade) {
      targetIncumbent = bestStarterToUpgrade.player;
      incumbentRoleLabel = 'First-Team Starter';
      footballDelta = bestStarterToUpgrade.delta;
    } else if ((hasReplaceBeforeSelling || exitCandidates.length > 0) && bestExitOrBackup) {
      targetIncumbent = bestExitOrBackup.player;
      incumbentRoleLabel = 'Expiring/Exit Slot';
      footballDelta = bestExitOrBackup.delta;
    } else if (bestStarterToUpgrade) {
      targetIncumbent = bestStarterToUpgrade.player;
      incumbentRoleLabel = 'First-Team Starter';
      footballDelta = bestStarterToUpgrade.delta;
    } else if (bestExitOrBackup) {
      targetIncumbent = bestExitOrBackup.player;
      incumbentRoleLabel = 'Senior Rotation/Backup';
      footballDelta = bestExitOrBackup.delta;
    }

    let comparison = targetIncumbent
      ? buildTargetVsStarterComparison(target, targetIncumbent)
      : null;

    let budget = evaluateBudgetGate(
      target,
      targetIncumbent,
      audit,
      transferBudgetRemaining
    );

    // Determine whether target meets division/squad baseline quality
    const meetsStarterBaseline =
      ipRoleFitPct >= 58 || dna.overallDnaScore >= 56 || (footballDelta ?? -99) >= -1;
    const isYoungSuccessorProfile =
      target.age <= 23 &&
      !character.hasSeriousRedFlag &&
      (dna.overallDnaScore >= 52 || ipRoleFitPct >= 55 || (footballDelta ?? -99) >= -4);
    const hasLetExpireExit = exitCandidates.some((e) => e.verdict === 'Let Expire');

    // Classify into exact tier
    let tier: ShortlistRecommendationTier = 'below_squad_level';
    let tierLabel = 'Below Squad Level';
    let badgeTone: ShortlistTargetAdvice['badgeTone'] = 'slate';

    const cheaperThanStarterSameLevel =
      bestStarterToUpgrade !== null &&
      bestStarterToUpgrade.delta >= 0.5 &&
      budget.netWeeklyWageDelta !== null &&
      budget.netWeeklyWageDelta <= -75 &&
      !character.hasSeriousRedFlag;

    const cheaperBackupUpgrade =
      bestExitOrBackup !== null &&
      bestExitOrBackup.delta >= -0.5 &&
      budget.expectedWagePw <= (bestExitOrBackup.player.wagePw || 0) - 40 &&
      !character.hasSeriousRedFlag;

    const isFootballUpgradeOrGapFit =
      beatsStarterClearly ||
      cheaperThanStarterSameLevel ||
      (isGenuineSigningGap && meetsStarterBaseline) ||
      (hasReplaceBeforeSelling && meetsStarterBaseline) ||
      cheaperBackupUpgrade ||
      ((isSuccessionGap || hasLetExpireExit) && isYoungSuccessorProfile);

    if (!budget.passesBudgetGate) {
      if (isFootballUpgradeOrGapFit) {
        tier = 'monitor_budget_blocked';
        tierLabel = 'Watch · Fee/Wage Blocked';
        badgeTone = 'amber';
      } else {
        tier = 'below_squad_level';
        tierLabel = 'Skip · Covered & Costly';
        badgeTone = 'slate';
      }
    } else if (beatsStarterClearly || cheaperThanStarterSameLevel) {
      tier = 'direct_xi_upgrade';
      tierLabel = 'Direct XI Upgrade';
      badgeTone = 'emerald';
    } else if ((isGenuineSigningGap || hasReplaceBeforeSelling) && meetsStarterBaseline) {
      tier = 'fills_gap_now';
      tierLabel = 'Fills Gap Now';
      badgeTone = 'sky';
    } else if (cheaperBackupUpgrade && bestExitOrBackup) {
      const switchedIncumbent = targetIncumbent?.id !== bestExitOrBackup.player.id;
      targetIncumbent = bestExitOrBackup.player;
      incumbentRoleLabel = bestExitOrBackup.isExitSlot
        ? 'Expiring/Exit Slot'
        : 'Senior Rotation/Backup';
      footballDelta = bestExitOrBackup.delta;
      if (switchedIncumbent) {
        comparison = buildTargetVsStarterComparison(target, targetIncumbent);
        budget = evaluateBudgetGate(
          target,
          targetIncumbent,
          audit,
          transferBudgetRemaining
        );
      }
      tier = 'cheaper_squad_upgrade';
      tierLabel = 'Cheaper Squad Upgrade';
      badgeTone = 'teal';
    } else if (
      (isSuccessionGap || hasLetExpireExit) &&
      isYoungSuccessorProfile
    ) {
      tier = 'future_succession';
      tierLabel = 'Future U23 Successor';
      badgeTone = 'purple';
    } else {
      tier = 'below_squad_level';
      tierLabel =
        need?.status === 'Promote Internal'
          ? 'Skip · U21 Ready Internally'
          : 'Depth Only · Covered';
      badgeTone = 'slate';
    }

    const isActionable =
      tier === 'direct_xi_upgrade' ||
      tier === 'fills_gap_now' ||
      tier === 'cheaper_squad_upgrade' ||
      tier === 'future_succession';

    // Build crisp plain-English narratives ("Now", "Future", "Why", "Deal")
    const topPosDeltas = (comparison?.radarAxes || [])
      .filter((ax) => ax.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 3)
      .map((ax) => `${ax.label} +${ax.delta}`);
    const attrEdgeText =
      topPosDeltas.length > 0 ? ` (${topPosDeltas.join(', ')})` : '';
    const charBit =
      character.positiveSignals.length > 0
        ? ` · ${character.positiveSignals.slice(0, 2).join(', ')}`
        : character.riskSignals.length > 0
          ? ` · Watch: ${character.riskSignals.slice(0, 2).join(', ')}`
          : '';
    const formationLabel = lastMatchTactic?.inPossessionFormation || '4-3-3';

    let headline = '';
    let howFitsNow = '';
    let howFitsFuture = '';
    let whyUpgradeOrHold = '';
    let dealStructureAdvice = '';

    if (tier === 'direct_xi_upgrade' && targetIncumbent) {
      const wagePhrase =
        budget.netWeeklyWageDelta !== null && budget.netWeeklyWageDelta < 0
          ? `saving £${Math.abs(budget.netWeeklyWageDelta).toLocaleString()}/wk`
          : budget.netWeeklyWageDelta === 0
            ? 'on matching wages'
            : `for +£${(budget.netWeeklyWageDelta ?? 0).toLocaleString()}/wk within budget`;
      headline = `Direct First-Team Upgrade on ${targetIncumbent.name} (${bucketCode})`;
      howFitsNow = `Steps straight into your ${formationLabel} starting XI as ${bestIpRole} (IP ${ipRoleFitPct}%) / ${bestOopRole} (OOP ${oopRoleFitPct}%), directly improving on ${targetIncumbent.name}${attrEdgeText} while ${wagePhrase}.`;
      howFitsFuture =
        target.age <= 23
          ? `At Age ${target.age} (${character.personalityLabel}), he locks down ${bucketCode} for the next 3+ seasons with strong development and resale upside.`
          : target.age <= 27
            ? `Entering his peak years (Age ${target.age}, ${character.personalityLabel}) — gives immediate reliability over the next 2–3 seasons.`
            : `Experienced bridge (Age ${target.age}) — raises your matchday floor right now while you develop a U23 successor behind him.`;
      whyUpgradeOrHold = `Beats ${targetIncumbent.name} by +${(footballDelta ?? 0).toFixed(1)} overall role/DNA score${attrEdgeText}${charBit}. ${budget.budgetSummary}.`;
    } else if (tier === 'fills_gap_now') {
      headline = hasReplaceBeforeSelling && targetIncumbent
        ? `Unlocks Selling ${targetIncumbent.name} & Covers ${bucketCode} Now`
        : `Plugs Immediate ${bucketCode} Depth Gap (${need?.effectiveReadyCount ?? 0}/${need?.idealMin ?? 2} Ready)`;
      howFitsNow = `Fills an open first-team ${bucketCode} slot immediately in your ${formationLabel} as ${bestIpRole} (IP ${ipRoleFitPct}%) / ${bestOopRole} (OOP ${oopRoleFitPct}%), meeting your ${audit.leagueLevelCalibration.competitionName} standard without stretching finances.`;
      howFitsFuture =
        target.age <= 23
          ? `Age ${target.age} (${character.personalityLabel}) — can grow from rotation cover into a multi-season starter.`
          : `Age ${target.age} (${character.personalityLabel}) — stabilises ${bucketCode} depth this season while keeping wage commitments disciplined.`;
      whyUpgradeOrHold = `Directly resolves your ${bucketCode} shortage${attrEdgeText}${charBit}. ${budget.budgetSummary}.`;
    } else if (tier === 'cheaper_squad_upgrade' && targetIncumbent) {
      const savedPw = Math.abs(budget.netWeeklyWageDelta ?? 0);
      headline = `Cheaper ${bucketCode} Upgrade vs ${targetIncumbent.name} (Saves £${savedPw.toLocaleString()}/wk)`;
      howFitsNow = `Replaces ${targetIncumbent.name} (£${targetIncumbent.wagePw.toLocaleString()}/wk) in the ${bucketCode} rotation as ${bestIpRole} / ${bestOopRole} (${ipRoleFitPct}% IP fit) while trimming £${savedPw.toLocaleString()}/wk off payroll.`;
      howFitsFuture =
        target.age < targetIncumbent.age
          ? `${targetIncumbent.age - target.age} years younger than ${targetIncumbent.name} — lowers squad age and wage bill simultaneously.`
          : `Keeps matchday cover intact on leaner wages so funds can go toward priority starters.`;
      whyUpgradeOrHold = `Matches or improves on ${targetIncumbent.name}${attrEdgeText} at lower weekly cost${charBit}. ${budget.budgetSummary}.`;
    } else if (tier === 'future_succession') {
      headline = `U23 ${bucketCode} Successor for Next 12–24 Months (Age ${target.age})`;
      howFitsNow = `Joins as rotational ${bucketCode} cover (${bestIpRole} IP ${ipRoleFitPct}% / ${bestOopRole} OOP ${oopRoleFitPct}%) to learn your ${formationLabel} without blocking your current starter.`;
      howFitsFuture = isSuccessionGap
        ? `Directly fixes your 28+ ${bucketCode} Succession Gap — ready to inherit the starting role within 12–18 months (${character.personalityLabel}, Det ${synthetic.attributes.determination}/20).`
        : `Lined up to take over when expiring ${bucketCode} contracts depart next summer, giving you a low-wage U23 asset with resale value.`;
      whyUpgradeOrHold = `Strong age-curve & character fit (Age ${target.age}, ${character.personalityLabel}${charBit}). ${budget.budgetSummary}.`;
    } else if (tier === 'monitor_budget_blocked') {
      headline = targetIncumbent && beatsStarterClearly
        ? `Football Upgrade on ${targetIncumbent.name} — Blocked by Club Budget Today`
        : `Strong ${bucketCode} Fit — Outside Current Club Budget`;
      howFitsNow = `On the pitch he would ${beatsStarterClearly && targetIncumbent ? `upgrade ${targetIncumbent.name}${attrEdgeText}` : `strengthen ${bucketCode}`} as ${bestIpRole} (${ipRoleFitPct}% IP), but ${budget.budgetSummary}.`;
      howFitsFuture = budget.whenViableNote || `Keep on your in-game shortlist and monitor his contract/asking price next window.`;
      whyUpgradeOrHold = `Blocked by Strict Club Budget Gate: ${budget.budgetSummary}. ${budget.whenViableNote || ''}`.trim();
    } else {
      headline =
        need?.status === 'Promote Internal'
          ? `Skip — Promote Ready U21 at ${bucketCode} Instead`
          : `No Clear Upgrade Over Current ${bucketCode} Options`;
      howFitsNow = targetIncumbent
        ? `Currently behind ${targetIncumbent.name} for ${bestIpRole} IP / ${bestOopRole} OOP (${ipRoleFitPct}% fit) with ${need?.effectiveReadyCount ?? 0} ready options already at the club.`
        : `Depth at ${bucketCode} is already covered internally.`;
      howFitsFuture =
        character.hasSeriousRedFlag
          ? `Character/durability flag (${character.riskSignals.join(', ')}) makes him a poor long-term investment — safe to trim from your in-game shortlist.`
          : `Does not improve your current starter or solve a succession gap — safe to remove from your FM27 shortlist to keep focus sharp.`;
      whyUpgradeOrHold = `${character.riskSignals.length > 0 ? `Flagged: ${character.riskSignals.join(', ')}. ` : ''}${budget.budgetSummary}.`;
    }

    // Deal Structure Advice
    if (!budget.passesBudgetGate) {
      dealStructureAdvice =
        budget.whenViableNote ||
        'Keep on your shortlist — do not pay cash fees or break wage cap right now.';
    } else if (budget.dealRoute === 'free_agent') {
      dealStructureAdvice =
        'Offer a 2-week Free Trial first to confirm hidden traits, then sign on £0 fee with no Unused-Sub bonus.';
    } else if (budget.dealRoute === 'pre_contract') {
      dealStructureAdvice = `Approach to sign on a £0 Pre-Contract (${target.contractExpiryMonths}m left on deal) — cap wages at ≤ £${budget.expectedWagePw.toLocaleString()}/wk.`;
    } else if (budget.dealRoute === 'loan_option') {
      dealStructureAdvice = `Enquire for a £0-fee loan from ${target.currentClub || 'parent club'} targeting 0%–30% wage share (~£${budget.expectedWagePw.toLocaleString()}/wk) with zero Unused-Sub fee.`;
    } else {
      dealStructureAdvice = `Budget-approved ${budget.feeLabel} move — keep basic wage ≤ £${budget.expectedWagePw.toLocaleString()}/wk and include an optional 1-year club extension.`;
    }

    const tierBaseScore: Record<ShortlistRecommendationTier, number> = {
      direct_xi_upgrade: 1000,
      fills_gap_now: 800,
      cheaper_squad_upgrade: 650,
      future_succession: 500,
      monitor_budget_blocked: 250,
      below_squad_level: 50,
    };
    const priorityScore =
      tierBaseScore[tier] +
      (footballDelta ?? 0) * 6 +
      dna.overallDnaScore * 0.5 +
      ipRoleFitPct * 0.4 +
      (budget.netWeeklyWageDelta !== null && budget.netWeeklyWageDelta < 0 ? 18 : 0);

    return {
      target,
      syntheticPlayer: synthetic,
      bucketCode,
      exactSlot,
      tier,
      tierLabel,
      badgeTone,
      priorityScore: Math.round(priorityScore * 10) / 10,
      isActionable,
      bestIpRole,
      bestOopRole,
      ipRoleFitPct,
      oopRoleFitPct,
      dnaFitPct: dna.overallDnaScore,
      archetypeName: archetype.name,
      archetypeScore: archetype.score,
      targetIncumbent,
      incumbentRoleLabel,
      comparison,
      footballDelta,
      budget,
      character,
      matchedNeed: need,
      headline,
      howFitsNow,
      howFitsFuture,
      whyUpgradeOrHold,
      dealStructureAdvice,
    };
  });

  items.sort((a, b) => b.priorityScore - a.priorityScore);

  const bySquadPlayerId: Record<string, ShortlistTargetAdvice[]> = {};
  const byBucketCode: Record<PositionBucketCode, ShortlistTargetAdvice[]> = {
    GK: [],
    RB: [],
    CB: [],
    LB: [],
    DM: [],
    CM: [],
    AM: [],
    W: [],
    ST: [],
  };

  for (const item of items) {
    byBucketCode[item.bucketCode].push(item);
    if (item.isActionable && item.targetIncumbent) {
      const pid = item.targetIncumbent.id;
      if (!bySquadPlayerId[pid]) bySquadPlayerId[pid] = [];
      bySquadPlayerId[pid].push(item);
    }
  }

  const directUpgrades = items.filter((i) => i.tier === 'direct_xi_upgrade');
  const gapFillersNow = items.filter((i) => i.tier === 'fills_gap_now');
  const cheaperBackups = items.filter((i) => i.tier === 'cheaper_squad_upgrade');
  const futureSuccessors = items.filter((i) => i.tier === 'future_succession');
  const budgetBlocked = items.filter((i) => i.tier === 'monitor_budget_blocked');
  const belowLevel = items.filter((i) => i.tier === 'below_squad_level');
  const loanViableTargets = items.filter(
    (i) => i.budget.passesBudgetGate && i.budget.dealRoute === 'loan_option'
  );

  return {
    items,
    directUpgrades,
    gapFillersNow,
    cheaperBackups,
    futureSuccessors,
    budgetBlocked,
    belowLevel,
    actionableCount:
      directUpgrades.length +
      gapFillersNow.length +
      cheaperBackups.length +
      futureSuccessors.length,
    bySquadPlayerId,
    byBucketCode,
    loanViableTargets,
  };
}
