import { PlayerRecord } from '../types/fm27';
import {
  ClubGovernanceState,
  DivisionBenchmarks,
  LastMatchTacticBlueprint,
  RecruitmentTarget,
} from '../types/fmSave';
import { evaluatePlayerClubDna } from './clubDnaEngine';
import {
  buildScoutTargetPlayerRecord,
  buildTargetVsStarterComparison,
  computeTargetBestRoleFit,
  evaluatePlaybookArchetype,
  evaluateTargetSquadDepth,
  findTopSeniorStarterForPosition,
  formatTargetContractSummary,
} from './recruitmentHelpers';
import { TransferActionVerdict } from './transferAudit';

export interface PercentilePizzaSlice {
  key: string;
  label: string;
  shortLabel: string;
  value: number;
  percentile: number; // 0..99
  category: 'physical' | 'mental' | 'technical' | 'goalkeeping';
  benchmarkValue?: number;
}

export interface CardIntelligenceSummary {
  verdictLabel: string;
  tone: 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';
  inlineRationale: string;
  topStrength: string;
  primaryRisk: string;
  dnaFitPct: number;
  valueTag: string;
  promiseTag: string | null;
  tacticalFitNote: string;
  pizzaSlices: PercentilePizzaSlice[];
}

export interface ScoutCardIntelligenceSummary extends CardIntelligenceSummary {
  bestIpRole: string;
  bestOopRole: string;
  bestRoleFitPct: number;
  archetypeLabel: string;
  starterName: string | null;
  starterDnaDelta: number | null;
  depthPriority: 'Critical Gap' | 'Upgrade Opportunity' | 'Depth Cover' | 'Well Covered';
  cost3YrLabel: string;
  contractSummary: string;
  syntheticPlayerRecord: PlayerRecord;
  starterRecord: PlayerRecord | null;
}

function getPosGroup(pos: string): 'GK' | 'DEF' | 'MID' | 'FWD' {
  const u = (pos || '').toUpperCase();
  if (u.includes('GK')) return 'GK';
  if (/\b(DC|DL|DR|CB|LB|RB|WBL|WBR|D\s*\()/.test(u)) return 'DEF';
  if (/\b(ST|STC|AML|AMR|LW|RW|FWD)/.test(u)) return 'FWD';
  return 'MID';
}

const PIZZA_SPECS: Record<
  'GK' | 'DEF' | 'MID' | 'FWD',
  Array<{
    key: keyof PlayerRecord['attributes'];
    label: string;
    shortLabel: string;
    category: PercentilePizzaSlice['category'];
  }>
> = {
  GK: [
    { key: 'reflexes', label: 'Reflexes', shortLabel: 'REF', category: 'goalkeeping' },
    { key: 'handling', label: 'Handling', shortLabel: 'HAN', category: 'goalkeeping' },
    { key: 'oneOnOnes', label: 'One on Ones', shortLabel: '1v1', category: 'goalkeeping' },
    { key: 'aerialReach', label: 'Aerial Reach', shortLabel: 'AER', category: 'goalkeeping' },
    { key: 'commandOfArea', label: 'Command', shortLabel: 'CMD', category: 'goalkeeping' },
    { key: 'positioning', label: 'Positioning', shortLabel: 'POS', category: 'mental' },
    { key: 'decisions', label: 'Decisions', shortLabel: 'DEC', category: 'mental' },
    { key: 'agility', label: 'Agility', shortLabel: 'AGI', category: 'physical' },
  ],
  DEF: [
    { key: 'tackling', label: 'Tackling', shortLabel: 'TCK', category: 'technical' },
    { key: 'marking', label: 'Marking', shortLabel: 'MRK', category: 'technical' },
    { key: 'heading', label: 'Heading', shortLabel: 'HEA', category: 'technical' },
    { key: 'passing', label: 'Passing', shortLabel: 'PAS', category: 'technical' },
    { key: 'positioning', label: 'Positioning', shortLabel: 'POS', category: 'mental' },
    { key: 'anticipation', label: 'Anticipation', shortLabel: 'ANT', category: 'mental' },
    { key: 'pace', label: 'Pace', shortLabel: 'PAC', category: 'physical' },
    { key: 'jumpingReach', label: 'Jump Reach', shortLabel: 'JMP', category: 'physical' },
  ],
  MID: [
    { key: 'passing', label: 'Passing', shortLabel: 'PAS', category: 'technical' },
    { key: 'firstTouch', label: 'First Touch', shortLabel: '1ST', category: 'technical' },
    { key: 'tackling', label: 'Tackling', shortLabel: 'TCK', category: 'technical' },
    { key: 'vision', label: 'Vision', shortLabel: 'VIS', category: 'mental' },
    { key: 'decisions', label: 'Decisions', shortLabel: 'DEC', category: 'mental' },
    { key: 'workRate', label: 'Work Rate', shortLabel: 'WRK', category: 'mental' },
    { key: 'stamina', label: 'Stamina', shortLabel: 'STA', category: 'physical' },
    { key: 'pace', label: 'Pace', shortLabel: 'PAC', category: 'physical' },
  ],
  FWD: [
    { key: 'finishing', label: 'Finishing', shortLabel: 'FIN', category: 'technical' },
    { key: 'dribbling', label: 'Dribbling', shortLabel: 'DRI', category: 'technical' },
    { key: 'firstTouch', label: 'First Touch', shortLabel: '1ST', category: 'technical' },
    { key: 'offTheBall', label: 'Off The Ball', shortLabel: 'OTB', category: 'mental' },
    { key: 'composure', label: 'Composure', shortLabel: 'CMP', category: 'mental' },
    { key: 'anticipation', label: 'Anticipation', shortLabel: 'ANT', category: 'mental' },
    { key: 'pace', label: 'Pace', shortLabel: 'PAC', category: 'physical' },
    { key: 'acceleration', label: 'Acceleration', shortLabel: 'ACC', category: 'physical' },
  ],
};

/**
 * Computes position-aware 8-spoke Percentile Pizza slices for any squad player or scout target,
 * benchmarking against squad peers AND division median attributes when available.
 */
export function computePositionPercentilePizza(
  player: PlayerRecord,
  squadPool: PlayerRecord[],
  divisionBenchmarks?: DivisionBenchmarks | null
): PercentilePizzaSlice[] {
  const group = getPosGroup(player.position);
  const specs = PIZZA_SPECS[group];
  const divMedianAttrs = divisionBenchmarks?.byPositionGroup?.[group]?.medianAttributes;

  const sameGroupPeers = squadPool.filter((p) => getPosGroup(p.position) === group);
  const peers = sameGroupPeers.length >= 3 ? sameGroupPeers : squadPool;

  return specs.map((spec) => {
    const val = Math.max(1, Math.min(20, Number(player.attributes?.[spec.key] ?? 10)));
    const peerVals = peers
      .map((p) => Number(p.attributes?.[spec.key] ?? 10))
      .filter((n) => Number.isFinite(n));

    let squadPct = 50;
    if (peerVals.length > 0) {
      const below = peerVals.filter((v) => v < val).length;
      const equal = peerVals.filter((v) => v === val).length;
      squadPct = Math.round(((below + equal * 0.5) / peerVals.length) * 99);
    }

    const divBench =
      divMedianAttrs && typeof divMedianAttrs[spec.key] === 'number'
        ? divMedianAttrs[spec.key]
        : undefined;

    let finalPct = squadPct;
    if (typeof divBench === 'number' && divBench > 0) {
      // Blend squad rank with division-relative z-score (~1.8 attr pts per quartile)
      const divPct = Math.max(
        5,
        Math.min(99, Math.round(50 + (val - divBench) * 11))
      );
      finalPct = Math.round(squadPct * 0.45 + divPct * 0.55);
    }

    return {
      key: String(spec.key),
      label: spec.label,
      shortLabel: spec.shortLabel,
      value: val,
      percentile: Math.max(2, Math.min(99, finalPct)),
      category: spec.category,
      benchmarkValue: typeof divBench === 'number' ? Number(divBench.toFixed(1)) : undefined,
    };
  });
}

/**
 * Unified inline + modal intelligence for any Squad Player card/row.
 */
export function evaluateSquadPlayerCard(
  player: PlayerRecord,
  allPlayers: PlayerRecord[],
  options?: {
    divisionBenchmarks?: DivisionBenchmarks | null;
    governance?: ClubGovernanceState | null;
    activeTactic?: LastMatchTacticBlueprint | null;
    transferVerdict?: TransferActionVerdict | null;
  }
): CardIntelligenceSummary {
  const dna = evaluatePlayerClubDna(
    player.position,
    player.attributes,
    undefined,
    options?.divisionBenchmarks ?? null
  );
  const pizzaSlices = computePositionPercentilePizza(
    player,
    allPlayers,
    options?.divisionBenchmarks ?? null
  );

  const sortedSlices = [...pizzaSlices].sort((a, b) => b.percentile - a.percentile);
  const bestSlice = sortedSlices[0];
  const weakSlice = sortedSlices[sortedSlices.length - 1];

  const topStrength = bestSlice
    ? `${bestSlice.label} ${bestSlice.value}/20 (${bestSlice.percentile}th pct)`
    : `Club DNA ${dna.overallDnaScore}%`;

  const promiseAudit = options?.governance?.playerPromiseAudits.find(
    (pa) => pa.playerId === player.id || (player.uid && pa.playerUid === player.uid)
  );
  const promiseTag = promiseAudit
    ? promiseAudit.status === 'breached'
      ? `Promise Risk: ${promiseAudit.promisedPlayingTime}`
      : promiseAudit.status === 'at_risk'
        ? `Monitor: ${promiseAudit.promisedPlayingTime}`
        : promiseAudit.status === 'met'
          ? `Promise Met`
          : null
    : null;

  let primaryRisk = weakSlice
    ? `${weakSlice.label} ${weakSlice.value}/20 (${weakSlice.percentile}th pct)`
    : 'Balanced profile';

  if (promiseAudit && (promiseAudit.status === 'breached' || promiseAudit.status === 'at_risk')) {
    primaryRisk = promiseAudit.note;
  } else if (player.status === 'Injured') {
    primaryRisk = 'Currently injured — manage reintegration load';
  } else if ((player.attributes?.stamina ?? 12) <= 10 && !player.position.toUpperCase().includes('GK')) {
    primaryRisk = `Stamina ${player.attributes.stamina}/20 — Window 1 (60–63') sub candidate`;
  } else if (player.contractExpiryMonths !== undefined && player.contractExpiryMonths <= 6) {
    primaryRisk = `Contract expires in ${player.contractExpiryMonths}m (${player.expires})`;
  }

  // Value efficiency vs division/squad median wage
  const group = getPosGroup(player.position);
  const divWage = options?.divisionBenchmarks?.byPositionGroup?.[group]?.medianWeeklyWage ?? 0;
  const seniorWages = allPlayers
    .filter((p) => (p.teamSlot === undefined || p.teamSlot === 0) && p.wagePw > 0)
    .map((p) => p.wagePw);
  const medianSquadWage =
    seniorWages.length > 0
      ? seniorWages.sort((a, b) => a - b)[Math.floor(seniorWages.length / 2)]
      : 350;
  const refWage = divWage > 0 ? divWage : medianSquadWage;

  const valueTag =
    player.wagePw <= 0
      ? 'Youth / Non-Contract'
      : player.wagePw <= refWage * 0.75 && dna.overallDnaScore >= 58
        ? 'High Wage Value'
        : player.wagePw >= refWage * 1.45 && dna.overallDnaScore < 62
          ? 'Expensive Wage'
          : 'Fair Market Wage';

  // Verdict label & tone aligned cleanly with Transfers & Youth protection
  const isYouth = player.age <= 21 && (player.potential - player.ability >= 0.75 || player.teamSlot !== 0);
  let verdictLabel = 'Solid Squad Option';
  let tone: CardIntelligenceSummary['tone'] = 'slate';

  if (options?.transferVerdict === 'Sell / Transfer List' || player.status === 'Surplus') {
    verdictLabel = 'Surplus / Offload';
    tone = 'rose';
  } else if (options?.transferVerdict === 'Protect Youth Asset' || (isYouth && player.potential >= 3.5)) {
    verdictLabel = 'Protect U21 Asset';
    tone = 'sky';
  } else if (options?.transferVerdict === 'Renew Now') {
    verdictLabel = 'Priority Renewal';
    tone = 'amber';
  } else if (dna.overallDnaScore >= 68 || player.status === 'Starter') {
    verdictLabel = 'Core Starter';
    tone = 'emerald';
  } else if (dna.overallDnaScore >= 56) {
    verdictLabel = 'Rotation / Cover';
    tone = 'sky';
  } else if (player.age >= 29) {
    verdictLabel = 'Succession Watch';
    tone = 'amber';
  }

  const tacticalSlot = options?.activeTactic?.starters.find(
    (s) =>
      (player.uid && s.playerUid === player.uid) ||
      (s.playerName && s.playerName.toLowerCase() === player.name.toLowerCase())
  );
  const tacticalFitNote = tacticalSlot
    ? `Last Tactic: ${tacticalSlot.inPossessionRole || player.ipRole} IP / ${tacticalSlot.outOfPossessionRole || player.oopRole} OOP`
    : `Best Fit: ${player.ipRole || 'Standard'} IP / ${player.oopRole || 'Standard'} OOP`;

  const inlineRationale = `${verdictLabel} · DNA ${dna.overallDnaScore}% · ${valueTag}${
    promiseTag ? ` · ${promiseTag}` : ''
  }`;

  return {
    verdictLabel,
    tone,
    inlineRationale,
    topStrength,
    primaryRisk,
    dnaFitPct: dna.overallDnaScore,
    valueTag,
    promiseTag,
    tacticalFitNote,
    pizzaSlices,
  };
}

/**
 * Unified inline + modal intelligence for EVERY Scout / Shortlist target card.
 */
export function evaluateScoutTargetCard(
  target: RecruitmentTarget,
  squadPlayers: PlayerRecord[],
  options?: {
    divisionBenchmarks?: DivisionBenchmarks | null;
    activeTactic?: LastMatchTacticBlueprint | null;
    governance?: ClubGovernanceState | null;
  }
): ScoutCardIntelligenceSummary {
  const synthetic = buildScoutTargetPlayerRecord(target);
  const dna = evaluatePlayerClubDna(
    synthetic.position,
    synthetic.attributes,
    undefined,
    options?.divisionBenchmarks ?? null
  );
  const roleFit = computeTargetBestRoleFit(target);
  const bestIpRole = roleFit.roleName || synthetic.ipRole || 'Standard';
  const bestOopRole = synthetic.oopRole || bestIpRole;
  const archetype = evaluatePlaybookArchetype(target.primaryPosition, target.attributes);
  const depth = evaluateTargetSquadDepth(target.primaryPosition, squadPlayers);
  const starter = findTopSeniorStarterForPosition(target.primaryPosition, squadPlayers);
  const comparison = starter ? buildTargetVsStarterComparison(target, starter) : null;
  const contractDisplay = formatTargetContractSummary(target);
  const contractSummary = [
    contractDisplay.primaryLabel,
    contractDisplay.wageLabel ? `Wage ${contractDisplay.wageLabel}` : null,
    contractDisplay.trialBadge,
  ]
    .filter(Boolean)
    .join(' · ');
  const pizzaSlices = computePositionPercentilePizza(
    synthetic,
    squadPlayers,
    options?.divisionBenchmarks ?? null
  );

  const sortedSlices = [...pizzaSlices].sort((a, b) => b.percentile - a.percentile);
  const topStrength = sortedSlices[0]
    ? `${sortedSlices[0].label} ${sortedSlices[0].value}/20 (${sortedSlices[0].percentile}th pct)`
    : `${bestIpRole} (${roleFit.fitPct}%)`;

  const weakSlice = sortedSlices[sortedSlices.length - 1];
  let primaryRisk = weakSlice
    ? `${weakSlice.label} ${weakSlice.value}/20 (${weakSlice.percentile}th pct)`
    : 'Standard scouting variance';

  if (target.age >= 30) {
    primaryRisk = `Age ${target.age} — short-term bridge only, zero resale upside`;
  } else if ((synthetic.attributes.stamina ?? 11) <= 10 && !target.primaryPosition.toUpperCase().includes('GK')) {
    primaryRisk = `Stamina ${synthetic.attributes.stamina}/20 — struggles in FM27 dual-phase pressing`;
  } else if (!target.isFreeAgent && target.contractExpiryMonths > 6) {
    primaryRisk = `Under contract (${target.contractExpiryMonths}m) — transfer fee required`;
  }

  const starterDna = starter
    ? evaluatePlayerClubDna(
        starter.position,
        starter.attributes,
        undefined,
        options?.divisionBenchmarks ?? null
      ).overallDnaScore
    : null;
  const starterDnaDelta = starterDna !== null ? dna.overallDnaScore - starterDna : null;

  const isCriticalGap = depth.isGenuineGap;
  const isOverstocked = depth.count >= 4;
  const depthPriority: ScoutCardIntelligenceSummary['depthPriority'] = isCriticalGap
    ? 'Critical Gap'
    : starterDnaDelta !== null && starterDnaDelta >= 4
      ? 'Upgrade Opportunity'
      : !isOverstocked
        ? 'Depth Cover'
        : 'Well Covered';

  const weeklyWage = Math.max(0, Math.round(target.demandedWageEur || 0));
  const annual3Yr = weeklyWage * 52 * 3;
  const cost3YrLabel =
    weeklyWage === 0
      ? 'Wage TBD'
      : annual3Yr >= 1_000_000
        ? `£${(annual3Yr / 1_000_000).toFixed(2)}M / 3y`
        : `£${Math.round(annual3Yr / 1000)}k / 3y`;

  const valueTag = target.isFreeAgent
    ? 'Free Agent'
    : target.contractExpiryMonths <= 6
      ? 'Pre-Contract Eligible'
      : 'Fee Required';

  let verdictLabel = 'Monitor / Depth';
  let tone: CardIntelligenceSummary['tone'] = 'slate';

  if (isCriticalGap && (dna.overallDnaScore >= 58 || (starterDnaDelta ?? 0) >= 0)) {
    verdictLabel = 'Priority Signing';
    tone = 'emerald';
  } else if (starterDnaDelta !== null && starterDnaDelta >= 5) {
    verdictLabel = `Upgrade (+${starterDnaDelta} DNA)`;
    tone = 'emerald';
  } else if (target.age <= 22 && dna.overallDnaScore >= 56 && (target.isFreeAgent || target.contractExpiryMonths <= 6)) {
    verdictLabel = 'High-Upside U23';
    tone = 'sky';
  } else if (starterDnaDelta !== null && starterDnaDelta <= -6 && isOverstocked) {
    verdictLabel = 'Pass · Covered';
    tone = 'rose';
  } else if (isOverstocked) {
    verdictLabel = 'Low Need · Stocked';
    tone = 'amber';
  } else if (target.isFreeAgent || target.contractExpiryMonths <= 6) {
    verdictLabel = 'Value Opportunity';
    tone = 'sky';
  }

  const starterBit =
    starter && starterDnaDelta !== null
      ? `${starterDnaDelta >= 0 ? '+' : ''}${starterDnaDelta} DNA vs ${starter.name.split(' ').slice(-1)[0]}`
      : depth.label;

  const tacticalFitNote = options?.activeTactic
    ? `Fits ${options.activeTactic.inPossessionFormation} as ${bestIpRole} IP / ${bestOopRole} OOP (${roleFit.fitPct}% role fit)`
    : `${bestIpRole} IP / ${bestOopRole} OOP (${roleFit.fitPct}% role fit)`;

  const promiseTag =
    options?.governance && options.governance.promisesAtRiskCount > 0 && isOverstocked
      ? 'Watch Squad Promises'
      : comparison
        ? `${comparison.ageDelta <= 0 ? `${Math.abs(comparison.ageDelta)}y younger` : `${comparison.ageDelta}y older`} · ${comparison.wageDelta <= 0 ? `£${Math.abs(comparison.wageDelta)}/wk cheaper` : `+£${comparison.wageDelta}/wk`}`
        : null;

  const inlineRationale = `${verdictLabel} · ${starterBit} · ${valueTag}`;

  return {
    verdictLabel,
    tone,
    inlineRationale,
    topStrength,
    primaryRisk,
    dnaFitPct: dna.overallDnaScore,
    valueTag,
    promiseTag,
    tacticalFitNote,
    pizzaSlices,
    bestIpRole,
    bestOopRole,
    bestRoleFitPct: roleFit.fitPct,
    archetypeLabel: archetype.name,
    starterName: starter?.name ?? null,
    starterDnaDelta,
    depthPriority,
    cost3YrLabel,
    contractSummary,
    syntheticPlayerRecord: synthetic,
    starterRecord: starter,
  };
}
