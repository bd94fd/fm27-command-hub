import React, { useMemo, useState, useDeferredValue } from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  PlayerRecord,
  RecruitmentCase,
  ShortlistRecord,
} from '../types/fm27';
import {
  ClubGovernanceState,
  CompetitionRegistrationRules,
  DivisionBenchmarks,
  FinancialRunway,
  LastMatchTacticBlueprint,
  RecruitmentTarget,
  TransferWindowInfo,
} from '../types/fmSave';
import {
  buildSquadTransferAudit,
  ClubFinancialInput,
  ClubLeagueContextInput,
  TransferActionVerdict,
} from '../utils/transferAudit';
import { evaluateInGameShortlist } from '../utils/shortlistAdviceEngine';
import { ScoutTargetDetailModal } from './ScoutTargetDetailModal';
import {
  buildTargetVsStarterComparison,
  computeTargetBestRoleFit,
  findTopSeniorStarterForPosition,
} from '../utils/recruitmentHelpers';
import {
  isScoutTargetTracked,
  loadTrackedScoutTargets,
  toggleTrackedScoutTarget,
} from '../services/fmStorage';
import {
  ClubDnaPillarWeights,
  loadPersistedClubDnaWeights,
} from '../utils/clubDnaEngine';
import { RecruitmentHeader } from './recruitment/RecruitmentHeader';
import { SquadAdviceView } from './recruitment/SquadAdviceView';
import { LoanStrategyView } from './recruitment/LoanStrategyView';
import { ContractHorizonView } from './recruitment/ContractHorizonView';
import { PositionalDepthView } from './recruitment/PositionalDepthView';
import { ShortlistView } from './recruitment/ShortlistView';
import { CompareTargetModal } from './recruitment/CompareTargetModal';
import { SelectionCompareDock } from './recruitment/SelectionCompareDock';
import type { AuditView } from './recruitment/recruitmentTypes';

interface RecruitmentWorkspaceProps {
  cases: RecruitmentCase[];
  shortlists: ShortlistRecord[];
  players: PlayerRecord[];
  saveDate: string;
  wageSpend?: string;
  balance?: string;
  clubName?: string;
  finances?: ClubFinancialInput | null;
  leagueContext?: ClubLeagueContextInput | null;
  financialRunway?: FinancialRunway | null;
  transferWindows?: TransferWindowInfo | null;
  competitionRules?: CompetitionRegistrationRules | null;
  divisionBenchmarks?: DivisionBenchmarks | null;
  governance?: ClubGovernanceState | null;
  lastMatchTactic?: LastMatchTacticBlueprint | null;
  scoutedTargets?: RecruitmentTarget[];
  trackedTargets?: RecruitmentTarget[];
  onToggleTrackTarget?: (target: RecruitmentTarget) => boolean;
  onAskAnalyst?: (prompt: string) => void;
  onAddCase: (entry: Omit<RecruitmentCase, 'id' | 'updatedAt'>) => void;
  onUpdateCase: (id: string, patch: Partial<RecruitmentCase>) => void;
  onDeleteCase: (id: string) => void;
  onCreateShortlist: (name: string, description: string) => void;
  onDeleteShortlist: (id: string) => void;
  onRemoveFromShortlist: (shortlistId: string, playerId: string) => void;
  onSelectPlayer: (player: PlayerRecord) => void;
}

export const RecruitmentWorkspace: React.FC<RecruitmentWorkspaceProps> = ({
  cases,
  players,
  saveDate,
  wageSpend = '--',
  balance = '--',
  clubName,
  finances,
  leagueContext = null,
  financialRunway = null,
  transferWindows = null,
  competitionRules = null,
  divisionBenchmarks = null,
  governance = null,
  lastMatchTactic = null,
  scoutedTargets = [],
  trackedTargets: controlledTrackedTargets,
  onToggleTrackTarget,
  onAskAnalyst,
  onAddCase,
  onSelectPlayer,
}) => {
  const [view, setView] = useState<AuditView>('advice');
  const [shortlistInitialFilter, setShortlistInitialFilter] = useState<'ALL' | 'LOAN'>('ALL');
  const [includeYouthInAudit, setIncludeYouthInAudit] = useState<boolean>(false);
  const [verdictFilter, setVerdictFilter] = useState<
    'ALL' | TransferActionVerdict
  >('ALL');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [clubDnaWeights] = useState<ClubDnaPillarWeights>(
    () => loadPersistedClubDnaWeights()
  );
  const [contractHorizonTier, setContractHorizonTier] = useState<
    'ALL' | 'CRITICAL_6M' | 'WARNING_12M' | 'WATCH_18M' | 'SECURE_18M_PLUS'
  >('ALL');
  const [localTrackedTargets, setLocalTrackedTargets] = useState<RecruitmentTarget[]>(() =>
    loadTrackedScoutTargets()
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [compareTarget, setCompareTarget] = useState<RecruitmentTarget | null>(null);
  const [deepScoutTarget, setDeepScoutTarget] = useState<RecruitmentTarget | null>(null);
  const [compareTrayTargets, setCompareTrayTargets] = useState<RecruitmentTarget[]>([]);
  const [isMultiCompareOpen, setIsMultiCompareOpen] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2600);
  };

  const handleToggleCompareTray = (target: RecruitmentTarget) => {
    setCompareTrayTargets((prev) => {
      const exists = prev.some((t) => t.uid === target.uid);
      if (exists) return prev.filter((t) => t.uid !== target.uid);
      if (prev.length >= 3) {
        showToast('Compare tray holds up to 3 players — remove one first.');
        return prev;
      }
      return [...prev, target];
    });
  };

  const firstTeamPlayers = useMemo(
    () =>
      players.filter(
        (p) =>
          (p.teamSlot === undefined || p.teamSlot === 0) &&
          !p.onLoan &&
          p.status !== 'Youth'
      ),
    [players]
  );
  const youthReservesCount = players.length - firstTeamPlayers.length;
  const auditPlayers = useMemo(
    () =>
      includeYouthInAudit || firstTeamPlayers.length === 0
        ? players
        : firstTeamPlayers,
    [includeYouthInAudit, firstTeamPlayers, players]
  );

  const trackedTargets = controlledTrackedTargets ?? localTrackedTargets;

  const handleToggleTrack = (target: RecruitmentTarget) => {
    if (onToggleTrackTarget) {
      const nowTracked = onToggleTrackTarget(target);
      showToast(
        nowTracked
          ? `Pinned ${target.name} as Priority Target`
          : `Unpinned ${target.name}`
      );
      return;
    }
    const { targets: next, tracked } = toggleTrackedScoutTarget(target, localTrackedTargets);
    setLocalTrackedTargets(next);
    if (tracked && !cases.some((c) => c.playerName.toLowerCase() === target.name.toLowerCase())) {
      const bestRole = computeTargetBestRoleFit(target);
      onAddCase({
        playerName: target.name,
        position: target.primaryPosition,
        age: target.age,
        currentClub:
          target.currentClub ||
          (target.isFreeAgent ? 'Free Agent' : 'Expiring Contract'),
        targetIpRole: bestRole.roleName,
        targetOopRole: 'To Assign',
        interest: 'Interested',
        stage: 'Shortlisted',
        estimatedFee: target.isFreeAgent
          ? 'Free Transfer'
          : 'Pre-Contract / Cut-Price',
        estimatedWagePw: target.demandedWageEur,
        expiresOn:
          target.expires ||
          (target.isFreeAgent
            ? 'Free'
            : `<= ${target.contractExpiryMonths}m`),
        notes: `In-Game Shortlist (${target.nationality}) · ${bestRole.roleName} (${bestRole.fitPct}% Fit)`,
      });
    }
    showToast(
      tracked
        ? `Pinned ${target.name} as Priority Target`
        : `Unpinned ${target.name}`
    );
  };

  const handleOpenTargetCard = (target: RecruitmentTarget) => {
    setDeepScoutTarget(target);
  };

  // Always audit the full club roster so Senior / Youth / Out-on-Loan splits and U21 successor paths stay unified.
  const audit = useMemo(
    () =>
      buildSquadTransferAudit(
        players,
        saveDate,
        {
          ...finances,
          balanceLabel: balance,
          wageSpendLabel: wageSpend,
          monthlyBurnRate:
            finances?.monthlyBurnRate ?? financialRunway?.monthlyBurnRate ?? null,
        },
        divisionBenchmarks,
        {
          ...leagueContext,
          competitionRules: leagueContext?.competitionRules ?? competitionRules ?? null,
          transferWindowOpen:
            leagueContext?.transferWindowOpen ??
            (typeof transferWindows?.isOpen === 'boolean' ? transferWindows.isOpen : null),
          boardObjectiveSummary:
            leagueContext?.boardObjectiveSummary ??
            governance?.boardObjectives?.[0]?.target ??
            null,
        }
      ),
    [
      players,
      saveDate,
      finances,
      balance,
      wageSpend,
      financialRunway,
      divisionBenchmarks,
      leagueContext,
      competitionRules,
      transferWindows,
      governance,
    ]
  );

  // Scoped advice list respects the Senior First Team vs All Club toggle without hiding youth successors from Depth
  const scopedPlayerAdvice = useMemo(
    () =>
      includeYouthInAudit || audit.squadTierCounts.senior === 0
        ? audit.playerAdvice
        : audit.playerAdvice.filter((item) => item.squadTier === 'senior'),
    [audit.playerAdvice, audit.squadTierCounts.senior, includeYouthInAudit]
  );

  const registrationCheck = useMemo(() => {
    if (!competitionRules) return null;
    const hasAnyRule =
      competitionRules.maxSquadSize !== null ||
      competitionRules.minHomegrownClub !== null ||
      competitionRules.minHomegrownNation !== null ||
      competitionRules.maxForeignPlayers !== null ||
      competitionRules.matchdaySubsLimit !== null;
    if (!hasAnyRule) return null;

    const u21Count = players.filter((p) => (p.age || 25) <= 21).length;
    const countableSenior = competitionRules.u21Exempt
      ? players.length - u21Count
      : players.length;
    const overLimit =
      competitionRules.maxSquadSize !== null &&
      countableSenior > competitionRules.maxSquadSize;

    return {
      u21Count,
      countableSenior,
      overLimit,
    };
  }, [competitionRules, players]);

  const filteredAdvice = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return scopedPlayerAdvice.filter((item) => {
      if (verdictFilter !== 'ALL' && item.verdict !== verdictFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.player.name.toLowerCase().includes(q) ||
        item.player.position.toLowerCase().includes(q) ||
        item.verdict.toLowerCase().includes(q) ||
        item.headline.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [scopedPlayerAdvice, verdictFilter, deferredSearch]);

  const scopedCountsByVerdict = useMemo(() => {
    const counts: Record<TransferActionVerdict, number> = {
      'Renew Now': 0,
      'Protect Youth Asset': 0,
      'Sell / Transfer List': 0,
      'Replace Before Selling': 0,
      'Loan Out': 0,
      'Let Expire': 0,
      Hold: 0,
    };
    for (const item of scopedPlayerAdvice) {
      counts[item.verdict] += 1;
    }
    return counts;
  }, [scopedPlayerAdvice]);

  // Phase 2.3 (v3.0): 4-Tier Contract Horizon & Wage Risk Monitor (6m / 12m / 18m / 18m+)
  const contractHorizonSummary = useMemo(() => {
    const critical6m = scopedPlayerAdvice.filter(
      (i) => i.monthsLeft !== null && i.monthsLeft <= 6
    );
    const warning12m = scopedPlayerAdvice.filter(
      (i) => i.monthsLeft !== null && i.monthsLeft > 6 && i.monthsLeft <= 12
    );
    const watch18m = scopedPlayerAdvice.filter(
      (i) => i.monthsLeft !== null && i.monthsLeft > 12 && i.monthsLeft <= 18
    );
    const secure18mPlus = scopedPlayerAdvice.filter(
      (i) => i.monthsLeft === null || i.monthsLeft > 18
    );

    const wageAtRisk12m = [...critical6m, ...warning12m].reduce(
      (sum, i) => sum + (i.player.wagePw || 0),
      0
    );
    const keyAssetsAtRisk = [...critical6m, ...warning12m].filter(
      (i) =>
        i.verdict === 'Renew Now' ||
        i.verdict === 'Protect Youth Asset' ||
        i.player.ability >= 3.5
    );
    const projectedWageFreed = [...critical6m, ...warning12m]
      .filter(
        (i) =>
          i.verdict === 'Let Expire' ||
          i.verdict === 'Sell / Transfer List'
      )
      .reduce((sum, i) => sum + (i.player.wagePw || 0), 0);

    const activeList =
      contractHorizonTier === 'CRITICAL_6M'
        ? critical6m
        : contractHorizonTier === 'WARNING_12M'
          ? warning12m
          : contractHorizonTier === 'WATCH_18M'
            ? watch18m
            : contractHorizonTier === 'SECURE_18M_PLUS'
              ? secure18mPlus
              : [...critical6m, ...warning12m, ...watch18m];

    return {
      critical6m,
      warning12m,
      watch18m,
      secure18mPlus,
      wageAtRisk12m,
      keyAssetsAtRisk,
      projectedWageFreed,
      activeList,
    };
  }, [scopedPlayerAdvice, contractHorizonTier]);

  const thinPositions = useMemo(
    () => audit.positionalNeeds.filter((b) => b.status === 'Need Signing'),
    [audit.positionalNeeds]
  );

  const promoteInternalPositions = useMemo(
    () => audit.positionalNeeds.filter((b) => b.status === 'Promote Internal'),
    [audit.positionalNeeds]
  );

  const successionGapPositions = useMemo(
    () => audit.positionalNeeds.filter((b) => b.hasSuccessionGap),
    [audit.positionalNeeds]
  );

  const overstockedPositions = useMemo(
    () => audit.positionalNeeds.filter((b) => b.status === 'Overstocked'),
    [audit.positionalNeeds]
  );

  const shortlistAudit = useMemo(
    () =>
      evaluateInGameShortlist({
        shortlistTargets: scoutedTargets,
        squadPlayers: players,
        audit,
        divisionBenchmarks,
        lastMatchTactic,
        clubDnaWeights,
        transferBudgetRemaining: finances?.transferBudgetRemaining ?? null,
      }),
    [
      scoutedTargets,
      players,
      audit,
      divisionBenchmarks,
      lastMatchTactic,
      clubDnaWeights,
      finances?.transferBudgetRemaining,
    ]
  );

  const shortlistAdviceByUid = useMemo(() => {
    const map = new Map<number, (typeof shortlistAudit.items)[number]>();
    for (const item of shortlistAudit.items) {
      map.set(item.target.uid, item);
    }
    return map;
  }, [shortlistAudit.items]);

  const handleAskAnalystCompareShortlist = () => {
    if (!onAskAnalyst || shortlistAudit.items.length === 0) return;
    const summaryLines = shortlistAudit.items.slice(0, 10).map((item) => {
      const t = item.target;
      const inc = item.targetIncumbent
        ? `${item.targetIncumbent.name} (${item.targetIncumbent.ability.toFixed(1)}★, £${item.targetIncumbent.wagePw}/wk)`
        : 'Open Gap';
      return `- ${t.name} (${t.primaryPosition}, Age ${t.age}, ${t.currentClub || 'Free Agent'}) | ${item.tierLabel} | ${item.bestIpRole}/${item.bestOopRole} (${item.ipRoleFitPct}%) | ${item.budget.feeLabel} · £${item.budget.expectedWagePw}/wk | ${item.character.personalityLabel} | vs ${inc}`;
    });
    const prompt = `Review my In-Game FM27 Shortlist (${shortlistAudit.items.length} players, ${shortlistAudit.actionableCount} passing our Strict Club Budget Gate). Rank the top moves to sign or loan first — covering Direct First-Team Upgrades, Immediate Gap Fillers, and Future U23 Successors — and tell me who to remove from my shortlist:\n${summaryLines.join('\n')}`;
    onAskAnalyst(prompt);
  };

  const activeComparison = useMemo(() => {
    if (!compareTarget) return null;
    const advice = shortlistAdviceByUid.get(compareTarget.uid) ?? null;
    const starter =
      advice?.targetIncumbent ??
      findTopSeniorStarterForPosition(compareTarget.primaryPosition, auditPlayers);
    if (!starter) return { target: compareTarget, starter: null, comparison: null };
    return {
      target: compareTarget,
      starter,
      comparison: buildTargetVsStarterComparison(compareTarget, starter),
    };
  }, [compareTarget, shortlistAdviceByUid, auditPlayers]);

  return (
    <div className="space-y-4">
      {/* Header & Club Financial Health Banner */}
      <RecruitmentHeader
        clubName={clubName}
        saveDate={saveDate}
        youthReservesCount={youthReservesCount}
        includeYouthInAudit={includeYouthInAudit}
        setIncludeYouthInAudit={setIncludeYouthInAudit}
        firstTeamPlayers={firstTeamPlayers}
        players={players}
        transferWindows={transferWindows}
        financialRunway={financialRunway}
        audit={audit}
        registrationCheck={registrationCheck}
        competitionRules={competitionRules}
        thinPositions={thinPositions}
        successionGapPositions={successionGapPositions}
        view={view}
        setView={setView}
        scopedPlayerAdvice={scopedPlayerAdvice}
        contractHorizonSummary={contractHorizonSummary}
        scoutedTargets={scoutedTargets}
        trackedTargets={trackedTargets}
      />

      {players.length === 0 ? (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center space-y-2">
      <div className="text-sm font-bold text-slate-200">
        Awaiting .fm Save
      </div>
      <p className="text-xs text-slate-400 max-w-md mx-auto">
        Load your `.fm` save in the <strong>Hub</strong> tab to generate club-aware transfer, contract, youth, and wage advice.
      </p>
    </div>
      ) : (
        <>
          {/* VIEW 1: TAILORED PLAYER-BY-PLAYER ADVICE (with inline Shortlist Upgrade callouts) */}
          {view === 'advice' && (
            <SquadAdviceView
              scopedPlayerAdvice={scopedPlayerAdvice}
              scopedCountsByVerdict={scopedCountsByVerdict}
              verdictFilter={verdictFilter}
              setVerdictFilter={setVerdictFilter}
              search={search}
              setSearch={setSearch}
              filteredAdvice={filteredAdvice}
              shortlistBySquadPlayerId={shortlistAudit.bySquadPlayerId}
              onSelectPlayer={onSelectPlayer}
              onOpenShortlistTarget={handleOpenTargetCard}
              onCompareShortlistTarget={setCompareTarget}
            />
          )}

          {/* VIEW 1B: CLUB & LEAGUE-CALIBRATED BIDIRECTIONAL LOAN HUB */}
          {view === 'loans' && (
            <LoanStrategyView
              audit={audit}
              scoutedTargets={scoutedTargets}
              onSelectPlayer={onSelectPlayer}
              onAskAnalyst={onAskAnalyst}
              onJumpToLoanTargets={() => {
                setShortlistInitialFilter('LOAN');
                setView('shortlist');
              }}
            />
          )}

          {/* VIEW 2: PHASE 2.3 (v3.0) CONTRACT HORIZON & WAGE RISK MONITOR */}
          {view === 'contracts' && (
            <ContractHorizonView
              contractHorizonSummary={contractHorizonSummary}
              contractHorizonTier={contractHorizonTier}
              setContractHorizonTier={setContractHorizonTier}
              onSelectPlayer={onSelectPlayer}
            />
          )}

          {/* VIEW 3: 4-3-3 POSITIONAL DEPTH & SUCCESSION (with embedded Shortlist Gap Fillers) */}
          {view === 'depth' && (
            <PositionalDepthView
              audit={audit}
              thinPositions={thinPositions}
              promoteInternalPositions={promoteInternalPositions}
              successionGapPositions={successionGapPositions}
              overstockedPositions={overstockedPositions}
              shortlistByBucketCode={shortlistAudit.byBucketCode}
              onSelectPlayer={onSelectPlayer}
              onOpenShortlistTarget={handleOpenTargetCard}
            />
          )}

          {/* VIEW 4: UNIFIED IN-GAME SHORTLIST & DIRECT UPGRADE HUB */}
          {view === 'shortlist' && (
            <ShortlistView
              key={`sl-${shortlistInitialFilter}`}
              shortlistAudit={shortlistAudit}
              trackedTargets={trackedTargets}
              initialFilter={shortlistInitialFilter}
              onAskAnalyst={onAskAnalyst}
              handleAskAnalystCompareShortlist={handleAskAnalystCompareShortlist}
              handleOpenTargetCard={handleOpenTargetCard}
              setCompareTarget={setCompareTarget}
              handleToggleTrack={handleToggleTrack}
              handleToggleCompareTray={handleToggleCompareTray}
              compareTrayTargets={compareTrayTargets}
            />
          )}
        </>
      )}

    {/* Confirmation Toast */}
    {toastMessage && (
      <div
        role="status"
        className="fixed bottom-20 md:bottom-6 right-4 z-50 flex items-center gap-2 rounded-xl border border-emerald-500/50 bg-slate-900/95 px-4 py-2.5 text-xs font-semibold text-emerald-200 shadow-xl backdrop-blur"
      >
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        <span>{toastMessage}</span>
      </div>
    )}

      <CompareTargetModal
        activeComparison={activeComparison}
        shortlistAdvice={
          compareTarget ? shortlistAdviceByUid.get(compareTarget.uid) ?? null : null
        }
        setCompareTarget={setCompareTarget}
        handleOpenTargetCard={handleOpenTargetCard}
        handleToggleTrack={handleToggleTrack}
        trackedTargets={trackedTargets}
      />

      <SelectionCompareDock
        compareTrayTargets={compareTrayTargets}
        handleToggleCompareTray={handleToggleCompareTray}
        setCompareTrayTargets={setCompareTrayTargets}
        isMultiCompareOpen={isMultiCompareOpen}
        setIsMultiCompareOpen={setIsMultiCompareOpen}
        auditPlayers={auditPlayers}
      />

      {/* Deep Shortlist Player Profile & Squad Fit Dossier */}
      <ScoutTargetDetailModal
        target={deepScoutTarget}
        shortlistAdvice={
          deepScoutTarget ? shortlistAdviceByUid.get(deepScoutTarget.uid) ?? null : null
        }
        squadPlayers={players}
        divisionBenchmarks={divisionBenchmarks}
        lastMatchTactic={lastMatchTactic}
        governance={governance}
        clubDnaWeights={clubDnaWeights}
        isTracked={
          deepScoutTarget
            ? isScoutTargetTracked(trackedTargets, deepScoutTarget)
            : false
        }
        onToggleTrack={handleToggleTrack}
        onAskAnalyst={onAskAnalyst}
        onClose={() => setDeepScoutTarget(null)}
      />
    </div>
  );
};
