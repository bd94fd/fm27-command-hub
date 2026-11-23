import { MatchLogEntry, PlayerRecord } from '../types/fm27';
import {
  CustomSlotOverride,
  FormationPresetKey,
  isSuspensionActiveForCompetition,
  solveBestXi,
} from './bestXiSolver';
import { buildSquadTransferAudit } from './transferAudit';
import { computeCompetitiveSummary } from './fmSyncEngine';
import type { HydratedSaveState } from './fmSaveHydrator';
import {
  deriveFootballSeasonLabel,
  extractMatchSeasons,
  formatBucketCompactSummary,
  summarizeMatchesByScope,
} from './matchScopeHelpers';
import {
  buildClubGovernanceState,
  buildLastMatchTacticBlueprint,
} from './clubGovernanceAndTactics';
import { loadTacticRoleOverrides } from './fm27TacticRoleInference';
import { loadFm27BinaryDictionary } from './fm27BinaryDictionary';

export interface OfflineBriefingInput {
  clubName: string;
  saveDate: string;
  nextFixture: string;
  leagueStandingSub: string;
  wageSpend: string;
  balance: string;
  players: PlayerRecord[];
  matches: MatchLogEntry[];
  hydratedFmSave?: HydratedSaveState | null;
  userQuery?: string;
  activeShape?: FormationPresetKey;
  customSlots?: CustomSlotOverride[];
  fallbackReason?: string;
}

export interface OfflineBriefingResponse {
  screenDetected: string;
  inGameDate: string;
  analysisMarkdown: string;
  immediateClicks: string[];
  followUpQuestions: string[];
  chronicleTitle: string;
  chronicleOutcomeMetric: string;
}

/**
 * Deterministic, 100% offline FM27 Director of Football & Tactical Briefing engine.
 * Requires zero external LLM API keys, never fabricates data, and never exposes raw CA/PA.
 */
export function buildOfflineTacticalBriefing(
  input: OfflineBriefingInput
): OfflineBriefingResponse {
  const club =
    input.clubName && input.clubName !== '--' ? input.clubName : 'Your Club';
  const saveDate =
    input.saveDate && input.saveDate !== '--' ? input.saveDate : '--';

  // Zero fake/mock data guarantee: clean awaiting-save response when no squad is loaded.
  if (!input.players || input.players.length === 0) {
    return {
      screenDetected: 'Offline Briefing — Awaiting .fm Save',
      inGameDate: saveDate,
      analysisMarkdown: [
        '### Offline Tactical Briefing (Zero-API-Key Mode)',
        '',
        'No `.fm` save or squad export is loaded yet. Import your FM27 `.fm` save (or CSV/HTML export) above to unlock the full offline Director of Football briefing, Dual-Phase IP/OOP Best XI solver, contract audit, and matchday prep.',
      ].join('\n'),
      immediateClicks: [
        'Drop your FM27 .fm save file into the Auto-Sync dropzone',
        'Or import a squad CSV/HTML view export for instant offline analysis',
      ],
      followUpQuestions: [
        'Run an offline squad & contract audit after loading my save',
        'Build my FM27 IP/OOP Best XI for the next fixture',
      ],
      chronicleTitle: 'Offline Mode — Awaiting .fm Save',
      chronicleOutcomeMetric: 'Offline',
    };
  }

  const hydrated = input.hydratedFmSave ?? null;
  const decoded = hydrated?.decodedPayload ?? null;
  const nextCompetitionName = decoded?.upcomingFixtures?.[0]?.competition ?? null;
  const activeSuspensions =
    hydrated?.activeSuspensions && hydrated.activeSuspensions.length > 0
      ? hydrated.activeSuspensions
      : input.players.flatMap((p) => p.activeSuspensions || []);

  // Match War Room & live Analyst: First-Team pool with injured & next-match-banned excluded
  const firstTeamPool = input.players.filter(
    (p) => p.teamSlot === undefined || p.teamSlot === 0
  );
  const solverPool = firstTeamPool.length >= 11 ? firstTeamPool : input.players;

  const shape: FormationPresetKey = input.activeShape ?? '4-3-3 DM Wide';
  const bestXi = solveBestXi(solverPool, {
    shape,
    customSlots: input.customSlots,
    excludeInjured: true,
    excludeSuspended: true,
    activeSuspensions,
    nextCompetitionName,
  });

  const auditFinances =
    decoded?.finances || hydrated?.canonicalBalanceNum !== undefined
      ? {
          balanceNum:
            hydrated?.canonicalBalanceNum ?? decoded?.finances?.balance ?? null,
          wagePayrollWeekly: decoded?.finances?.wagePayrollWeekly ?? null,
          wageBudgetWeekly: decoded?.finances?.wageBudgetWeekly ?? null,
          transferBudgetRemaining: decoded?.finances?.transferBudgetRemaining ?? null,
          monthlyBurnRate: hydrated?.financialRunway?.monthlyBurnRate ?? null,
        }
      : undefined;

  const audit = buildSquadTransferAudit(
    input.players,
    saveDate,
    auditFinances,
    hydrated?.divisionBenchmarks ?? null
  );

  const allMatches = input.matches || [];
  const { currentSeason } = extractMatchSeasons(allMatches, saveDate);
  const activeSeasonScope =
    currentSeason !== 'ALL' ? currentSeason : deriveFootballSeasonLabel(saveDate);
  const scopeBreakdown = summarizeMatchesByScope(
    allMatches,
    activeSeasonScope !== 'Unknown Season' ? activeSeasonScope : undefined
  );
  const compSummary = computeCompetitiveSummary(allMatches, saveDate);

  const liveDict = loadFm27BinaryDictionary();
  const roleOverrides = loadTacticRoleOverrides();
  const lastTactic = decoded
    ? buildLastMatchTacticBlueprint(decoded, input.players, 0, roleOverrides, liveDict) ??
      hydrated?.lastMatchTactic ??
      null
    : hydrated?.lastMatchTactic ?? null;
  const governance = decoded
    ? buildClubGovernanceState(decoded, input.players, liveDict)
    : hydrated?.governance ?? null;

  const injuredPlayers = input.players.filter((p) => p.status === 'Injured');
  const nextMatchBanned = input.players.filter((p) => {
    const pBans = activeSuspensions.filter(
      (b) =>
        (typeof p.uid === 'number' && b.playerUid === p.uid) ||
        (b.playerName && b.playerName.toLowerCase() === p.name.toLowerCase())
    );
    return pBans.some((b) => isSuspensionActiveForCompetition(b, nextCompetitionName));
  });
  const otherCompBanned = input.players.filter((p) => {
    const pBans = activeSuspensions.filter(
      (b) =>
        (typeof p.uid === 'number' && b.playerUid === p.uid) ||
        (b.playerName && b.playerName.toLowerCase() === p.name.toLowerCase())
    );
    return (
      pBans.length > 0 &&
      !pBans.some((b) => isSuspensionActiveForCompetition(b, nextCompetitionName))
    );
  });
  const expiringSoon = input.players
    .filter(
      (p) =>
        typeof p.contractExpiryMonths === 'number' &&
        p.contractExpiryMonths >= 0 &&
        p.contractExpiryMonths <= 6
    )
    .sort((a, b) => (a.contractExpiryMonths ?? 99) - (b.contractExpiryMonths ?? 99));

  const weakSlots = bestXi.startingXI
    .filter((s) => !s.player || s.combinedFitPct < 60)
    .slice(0, 4);

  const sellCandidates = audit.playerAdvice.filter(
    (a) => a.verdict === 'Sell / Transfer List' || a.verdict === 'Let Expire'
  );
  const keepCount =
    (audit.countsByVerdict['Hold'] ?? 0) +
    (audit.countsByVerdict['Renew Now'] ?? 0) +
    (audit.countsByVerdict['Protect Youth Asset'] ?? 0);

  const lines: string[] = [];
  lines.push(`### ${club} — Offline Director of Football & Tactical Briefing`);
  if (input.fallbackReason) {
    lines.push(`> *Running in deterministic Zero-API-Key offline mode (${input.fallbackReason}).*`);
  }
  lines.push('');

  // 1. Club & Form Snapshot
  lines.push('#### 1. Club & Season Snapshot');
  lines.push(
    `- **Save Date:** ${saveDate} | **Standing:** ${input.leagueStandingSub || '--'}`
  );
  lines.push(
    `- **Finances:** Balance ${input.balance || '--'} | Wage Spend ${input.wageSpend || '--'}`
  );
  if (scopeBreakdown.competitive.played > 0) {
    const parts: string[] = [];
    if (scopeBreakdown.league.played > 0) {
      parts.push(`League: ${formatBucketCompactSummary(scopeBreakdown.league)}`);
    }
    if (scopeBreakdown.cup.played > 0) {
      parts.push(`Cup: ${formatBucketCompactSummary(scopeBreakdown.cup)}`);
    }
    if (scopeBreakdown.friendly.played > 0) {
      parts.push(`Friendlies (excluded): ${scopeBreakdown.friendly.played}GP`);
    }
    lines.push(
      `- **Competitive Record (${activeSeasonScope !== 'Unknown Season' ? activeSeasonScope : 'Current'}):** ${parts.join(' | ')}`
    );
  } else if (compSummary.played > 0) {
    lines.push(
      `- **Competitive Record:** ${compSummary.wins}W-${compSummary.draws}D-${compSummary.losses}L (${compSummary.played} played, ${compSummary.points} pts, xG Diff ${compSummary.xgDiff >= 0 ? '+' : ''}${compSummary.xgDiff.toFixed(2)})`
    );
  } else {
    lines.push('- **Competitive Record:** No competitive matches logged yet');
  }
  if (lastTactic) {
    lines.push(
      `- **Active Save Tactic (${lastTactic.tacticName}):** IP ${lastTactic.inPossessionFormation} / OOP ${lastTactic.outOfPossessionFormation} · ${lastTactic.mentality} (${lastTactic.styleName}) · Effectiveness ${lastTactic.tacticalEffectivenessScore}/100`
    );
  }
  if (governance) {
    const atRisk = governance.playerPromiseAudits.filter(
      (a) => a.status === 'breached' || a.status === 'at_risk'
    );
    if (atRisk.length > 0) {
      lines.push(
        `- **Playing-Time Promise Risks (${atRisk.length}):** ${atRisk
          .slice(0, 4)
          .map((a) => `${a.playerName} (${a.promisedPlayingTime}, ${a.actualMinutesSharePct}% mins)`)
          .join(', ')}`
      );
    }
  }
  lines.push('');

  // 2. FM27 Dual-Phase IP/OOP Best XI & Weak Spots
  lines.push(`#### 2. FM27 Dual-Phase IP/OOP Best XI (${shape})`);
  lines.push(
    `- **Projected XI Role Fit:** ${Math.round(bestXi.averageFitPct)}/100 across ${bestXi.startingXI.filter((s) => s.player).length}/11 filled slots (First-Team fit & available)`
  );
  if (weakSlots.length > 0) {
    lines.push('- **Positional Weak Spots:**');
    for (const slot of weakSlots) {
      if (!slot.player) {
        lines.push(`  - **${slot.label}** (${slot.ipRole} IP / ${slot.oopRole} OOP): Unfilled — recruitment priority`);
      } else {
        lines.push(
          `  - **${slot.label}** (${slot.player.name}, ${slot.player.ability.toFixed(1)}★): Fit ${Math.round(slot.combinedFitPct)}/100 for ${slot.ipRole} IP / ${slot.oopRole} OOP`
        );
      }
    }
  } else {
    lines.push('- **Positional Weak Spots:** None — all 11 slots meet ≥ 60/100 role fit.');
  }
  lines.push('');

  // 3. Contract & Wage Audit
  lines.push('#### 3. Contract & Transfer Audit');
  lines.push(
    `- **Squad Health:** ${keepCount} Core/Renew | ${sellCandidates.length} Sell/Release Candidates | ${expiringSoon.length} Expiring ≤ 6 Months`
  );
  if (expiringSoon.length > 0) {
    const topExpiring = expiringSoon
      .slice(0, 5)
      .map(
        (p) =>
          `${p.name} (${p.position}, ${p.ability.toFixed(1)}★, ${p.contractExpiryMonths}m left)`
      )
      .join(', ');
    lines.push(`- **Expiring Soon:** ${topExpiring}`);
  }
  if (sellCandidates.length > 0) {
    const topSell = sellCandidates
      .slice(0, 4)
      .map((c) => `${c.player.name} (${c.player.position}, ${c.headline})`)
      .join('; ');
    lines.push(`- **Wage / Surplus Review:** ${topSell}`);
  }
  lines.push('');

  // 4. Availability & Next Match Prep
  lines.push('#### 4. Availability & Next Match Prep');
  lines.push(`- **Next Fixture:** ${input.nextFixture || '--'}${nextCompetitionName ? ` (${nextCompetitionName})` : ''}`);
  lines.push(
    `- **Injuries (${injuredPlayers.length}):** ${
      injuredPlayers.length > 0
        ? injuredPlayers.slice(0, 5).map((p) => `${p.name} (${p.position})`).join(', ')
        : 'None reported'
    }`
  );
  lines.push(
    `- **Suspended for Next Match (${nextMatchBanned.length}):** ${
      nextMatchBanned.length > 0
        ? nextMatchBanned.slice(0, 5).map((p) => `${p.name} (${p.position})`).join(', ')
        : 'None'
    }${
      otherCompBanned.length > 0
        ? ` | *Other-Comp Bans Only (Eligible Next Match): ${otherCompBanned.slice(0, 3).map((p) => p.name).join(', ')}*`
        : ''
    }`
  );
  lines.push('');

  // 5. FM27 Tactical Effectiveness Training Focus
  lines.push('#### 5. FM27 Tactical Effectiveness Weekly Focus');
  lines.push(
    weakSlots.length > 0
      ? '- **Tactical Understanding & Player Ability:** Schedule *Match Tactics* + *Positional Role* sessions targeting your weakest IP/OOP slots.'
      : '- **Next Match Info & Player Buy-In:** Keep *Match Preview* + *Team Bonding* active to maintain cohesion ahead of the next fixture.'
  );

  const immediateClicks: string[] = [];
  if (expiringSoon.length > 0) {
    immediateClicks.push(
      `Review ${expiringSoon.length} expiring contract(s) (top priority: ${expiringSoon[0].name})`
    );
  }
  if (weakSlots.length > 0) {
    immediateClicks.push(
      `Inspect ${weakSlots[0].label} (${weakSlots[0].ipRole} IP / ${weakSlots[0].oopRole} OOP) in Tactical War Room`
    );
  }
  if (sellCandidates.length > 0) {
    immediateClicks.push(
      `Audit ${sellCandidates.length} surplus/sell candidate(s) to free wage budget`
    );
  }
  if (immediateClicks.length === 0) {
    immediateClicks.push(
      'Open Tactical War Room to verify your IP/OOP Best XI for the next match'
    );
  }

  return {
    screenDetected: 'Offline DoF & Tactical Briefing',
    inGameDate: saveDate,
    analysisMarkdown: lines.join('\n'),
    immediateClicks,
    followUpQuestions: [
      'Which expiring contracts should I renew vs. release?',
      'Show my strongest IP/OOP lineup without injured or suspended players',
    ],
    chronicleTitle: `${club} Offline Briefing`,
    chronicleOutcomeMetric: `XI Fit ${Math.round(bestXi.averageFitPct)}/100`,
  };
}
