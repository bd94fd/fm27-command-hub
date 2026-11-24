import React, { useMemo, useState, useDeferredValue } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { VList } from 'virtua';
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
  TransferActionVerdict,
} from '../utils/transferAudit';
import { ScoutTargetDetailModal } from './ScoutTargetDetailModal';
import {
  buildTargetVsStarterComparison,
  computeTargetBestRoleFit,
  enrichAndFilterScoutedTargets,
  evaluatePlaybookArchetype,
  findTopSeniorStarterForPosition,
  formatTargetContractSummary,
  ScoutAgeBand,
  ScoutContractFilter,
  ScoutPositionGroup,
} from '../utils/recruitmentHelpers';
import {
  isScoutTargetTracked,
  loadTrackedScoutTargets,
  removeTrackedScoutTarget,
  toggleTrackedScoutTarget,
} from '../services/fmStorage';
import {
  ClubDnaPillarWeights,
  DEFAULT_CLUB_DNA_WEIGHTS,
  evaluatePlayerClubDna,
  loadPersistedClubDnaWeights,
  savePersistedClubDnaWeights,
  StrategicDnaArchetypeId,
} from '../utils/clubDnaEngine';
import { RecruitmentHeader } from './recruitment/RecruitmentHeader';
import { SquadAdviceView } from './recruitment/SquadAdviceView';
import { ContractHorizonView } from './recruitment/ContractHorizonView';
import { PositionalDepthView } from './recruitment/PositionalDepthView';
import { ScoutTargetFilters } from './recruitment/ScoutTargetFilters';
import { ScoutTargetCard } from './recruitment/ScoutTargetCard';
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
  const [includeYouthInAudit, setIncludeYouthInAudit] = useState<boolean>(false);
  const [verdictFilter, setVerdictFilter] = useState<
    'ALL' | TransferActionVerdict
  >('ALL');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [targetFilter, setTargetFilter] = useState<ScoutContractFilter>('ALL');
  const [targetPosGroup, setTargetPosGroup] = useState<ScoutPositionGroup>('ALL');
  const [exactPosFilter, setExactPosFilter] = useState<string>('ALL');
  const [dnaArchetypeFilter, setDnaArchetypeFilter] = useState<
    'ALL' | StrategicDnaArchetypeId
  >('ALL');
  const [clubDnaWeights, setClubDnaWeights] = useState<ClubDnaPillarWeights>(
    () => loadPersistedClubDnaWeights()
  );
  const [showDnaTuner, setShowDnaTuner] = useState<boolean>(false);
  const [contractHorizonTier, setContractHorizonTier] = useState<
    'ALL' | 'CRITICAL_6M' | 'WARNING_12M' | 'WATCH_18M' | 'SECURE_18M_PLUS'
  >('ALL');
  const [targetSortBy, setTargetSortBy] = useState<
    'GAP_FIT' | 'CLUB_DNA' | 'ROLE_FIT' | 'ARCHETYPE' | 'AGE' | 'WAGE'
  >('GAP_FIT');
  const [visibleTargetCount, setVisibleTargetCount] = useState<number>(24);
  const [targetAgeBand, setTargetAgeBand] = useState<ScoutAgeBand>('ALL');
  const [genuineGapsOnly, setGenuineGapsOnly] = useState<boolean>(false);
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

  const handleUpdateDnaWeight = (
    key: keyof ClubDnaPillarWeights,
    val: number
  ) => {
    const next = {
      ...clubDnaWeights,
      [key]: Math.max(0, Math.min(100, val)),
    };
    setClubDnaWeights(next);
    savePersistedClubDnaWeights(next);
  };

  const handleResetDnaWeights = () => {
    setClubDnaWeights({ ...DEFAULT_CLUB_DNA_WEIGHTS });
    savePersistedClubDnaWeights({ ...DEFAULT_CLUB_DNA_WEIGHTS });
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
          ? `Added ${target.name} to Shortlist`
          : `Removed ${target.name} from Shortlist`
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
        notes: `Scouted Target (${target.nationality}) · ${bestRole.roleName} (${bestRole.fitPct}% Fit)`,
      });
    }
    showToast(
      tracked
        ? `Added ${target.name} to Shortlist`
        : `Removed ${target.name} from Shortlist`
    );
  };

  const handleRemoveTracked = (target: RecruitmentTarget) => {
    if (onToggleTrackTarget) {
      onToggleTrackTarget(target);
      showToast(`Removed ${target.name} from Shortlist`);
      return;
    }
    const next = removeTrackedScoutTarget(target.uid || target.name, localTrackedTargets);
    setLocalTrackedTargets(next);
    showToast(`Removed ${target.name} from Shortlist`);
  };

  const handleOpenTargetCard = (target: RecruitmentTarget) => {
    setDeepScoutTarget(target);
  };

  const handleAskAnalystCompareShortlist = () => {
    if (!onAskAnalyst || trackedTargets.length === 0) return;
    const summaryLines = trackedTargets.slice(0, 10).map((t) => {
      const arch = evaluatePlaybookArchetype(t.primaryPosition, t.attributes);
      const role = computeTargetBestRoleFit(t);
      const contract = formatTargetContractSummary(t);
      const starter = findTopSeniorStarterForPosition(t.primaryPosition, auditPlayers);
      return `- ${t.name} (${t.primaryPosition}, Age ${t.age}, ${t.nationality}) | ${arch.name} ${arch.score}% | Best Role: ${role.roleName} (${role.fitPct}%) | ${contract.primaryLabel}${contract.trialBadge ? ' [2-Week Free Trial]' : ''}${contract.wageLabel ? ` · ${contract.wageLabel}` : ''} | vs Starter: ${starter ? `${starter.name} (${starter.ability.toFixed(1)}★, £${starter.wagePw}/wk)` : 'None'}`;
    });
    const prompt = `Compare my persisted Shortlist (${trackedTargets.length} targets) against my current senior starters using Bobby Dean's Playbook v2.0 Section 7 recruitment archetypes and £0-budget free-trial rules. Rank who to trial/sign first and who to skip:\n${summaryLines.join('\n')}`;
    onAskAnalyst(prompt);
  };

  const activeComparison = useMemo(() => {
    if (!compareTarget) return null;
    const starter = findTopSeniorStarterForPosition(compareTarget.primaryPosition, auditPlayers);
    if (!starter) return { target: compareTarget, starter: null, comparison: null };
    return {
      target: compareTarget,
      starter,
      comparison: buildTargetVsStarterComparison(compareTarget, starter),
    };
  }, [compareTarget, auditPlayers]);

  const filteredScoutedTargets = useMemo(() => {
    const base = enrichAndFilterScoutedTargets({
      targets: scoutedTargets,
      squadPlayers: auditPlayers,
      posGroup: targetPosGroup,
      ageBand: targetAgeBand,
      contractFilter: targetFilter,
      genuineGapsOnly,
      searchQuery: deferredSearch,
    });
    const withDna = base.map((item) => ({
      ...item,
      dna: evaluatePlayerClubDna(
        item.target.primaryPosition,
        item.target.attributes,
        clubDnaWeights,
        divisionBenchmarks
      ),
    }));
    const posFiltered =
      exactPosFilter === 'ALL'
        ? withDna
        : withDna.filter((item) => item.depth.slot === exactPosFilter);
    const dnaFiltered =
      dnaArchetypeFilter === 'ALL'
        ? posFiltered
        : posFiltered.filter(
            (item) => item.dna.bestArchetypeId === dnaArchetypeFilter
          );
    if (targetSortBy === 'GAP_FIT') return dnaFiltered;
    return [...dnaFiltered].sort((a, b) => {
      if (targetSortBy === 'CLUB_DNA') {
        return b.dna.overallDnaScore - a.dna.overallDnaScore;
      }
      if (targetSortBy === 'ROLE_FIT') {
        return b.bestRole.fitPct - a.bestRole.fitPct;
      }
      if (targetSortBy === 'ARCHETYPE') {
        return b.archetype.score - a.archetype.score;
      }
      if (targetSortBy === 'AGE') {
        return a.target.age - b.target.age || b.bestRole.fitPct - a.bestRole.fitPct;
      }
      return (
        (a.target.demandedWageEur || 0) - (b.target.demandedWageEur || 0) ||
        b.bestRole.fitPct - a.bestRole.fitPct
      );
    });
  }, [
    scoutedTargets,
    auditPlayers,
    targetPosGroup,
    exactPosFilter,
    dnaArchetypeFilter,
    clubDnaWeights,
    divisionBenchmarks,
    targetSortBy,
    targetAgeBand,
    targetFilter,
    genuineGapsOnly,
    deferredSearch,
  ]);

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
        divisionBenchmarks
      ),
    [players, saveDate, finances, balance, wageSpend, financialRunway, divisionBenchmarks]
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
          {/* VIEW 1: TAILORED PLAYER-BY-PLAYER ADVICE */}
          {view === 'advice' && (
            <SquadAdviceView
              scopedPlayerAdvice={scopedPlayerAdvice}
              scopedCountsByVerdict={scopedCountsByVerdict}
              verdictFilter={verdictFilter}
              setVerdictFilter={setVerdictFilter}
              search={search}
              setSearch={setSearch}
              filteredAdvice={filteredAdvice}
              onSelectPlayer={onSelectPlayer}
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

          {/* VIEW 3: 4-3-3 POSITIONAL DEPTH — SENIOR PRIMARY VS VERSATILITY COVER VS U21/YOUTH VS ON LOAN */}
          {view === 'depth' && (
            <PositionalDepthView
              audit={audit}
              thinPositions={thinPositions}
              promoteInternalPositions={promoteInternalPositions}
              successionGapPositions={successionGapPositions}
              overstockedPositions={overstockedPositions}
              onSelectPlayer={onSelectPlayer}
            />
          )}

          {/* VIEW 4: PASS 0 GROUP 4 SCOUTED FREE AGENTS & EXPIRING <= 6M + PHASE 2 CLUB DNA ENGINE */}
          {view === 'targets' && (
            <div className="space-y-3">
              {/* Interactive Scouted Filter Bar */}
              <ScoutTargetFilters
                scoutedTargets={scoutedTargets}
                filteredScoutedTargets={filteredScoutedTargets}
                targetPosGroup={targetPosGroup}
                setTargetPosGroup={setTargetPosGroup}
                targetAgeBand={targetAgeBand}
                setTargetAgeBand={setTargetAgeBand}
                dnaArchetypeFilter={dnaArchetypeFilter}
                setDnaArchetypeFilter={setDnaArchetypeFilter}
                setVisibleTargetCount={setVisibleTargetCount}
                showDnaTuner={showDnaTuner}
                setShowDnaTuner={setShowDnaTuner}
                clubDnaWeights={clubDnaWeights}
                handleUpdateDnaWeight={handleUpdateDnaWeight}
                handleResetDnaWeights={handleResetDnaWeights}
                targetFilter={targetFilter}
                setTargetFilter={setTargetFilter}
                exactPosFilter={exactPosFilter}
                setExactPosFilter={setExactPosFilter}
                targetSortBy={targetSortBy}
                setTargetSortBy={setTargetSortBy}
                genuineGapsOnly={genuineGapsOnly}
                setGenuineGapsOnly={setGenuineGapsOnly}
                search={search}
                setSearch={setSearch}
              />

              {scoutedTargets.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
                  No Free Agent or Expiring ≤6m targets decoded in this save yet. Drop a `.fm` save in the Hub tab to run the full recruitment scan.
                </div>
              ) : filteredScoutedTargets.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
                  No scouted targets match the active filters. Try clearing &ldquo;Genuine Gaps Only&rdquo;{search.trim() ? ', clearing the search filter,' : ''} or broadening the position/age band.
                </div>
              ) : (
                <VList
                  style={{ height: 680 }}
                  className="pr-1"
                >
                  {Array.from(
                    { length: Math.ceil(filteredScoutedTargets.length / 3) },
                    (_, rowIdx) =>
                      filteredScoutedTargets.slice(rowIdx * 3, rowIdx * 3 + 3)
                  ).map((rowItems, rowIdx) => (
                    <div
                      key={`scout-row-${rowIdx}`}
                      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-3"
                    >
                      {rowItems.map(
                        ({
                          target,
                          bestRole,
                          archetype,
                          dna,
                          relevantAttributes,
                          depth,
                          contractDisplay,
                        }) => {
                          const isTracked = isScoutTargetTracked(
                            trackedTargets,
                            target
                          );

                          return (
                            <ScoutTargetCard
                              key={target.uid || target.name}
                              item={{
                                target,
                                bestRole,
                                archetype,
                                dna,
                                relevantAttributes,
                                depth,
                                contractDisplay,
                              }}
                              isTracked={isTracked}
                              handleOpenTargetCard={handleOpenTargetCard}
                              handleToggleCompareTray={handleToggleCompareTray}
                              setCompareTarget={setCompareTarget}
                              handleToggleTrack={handleToggleTrack}
                              compareTrayTargets={compareTrayTargets}
                              players={players}
                              divisionBenchmarks={divisionBenchmarks}
                              lastMatchTactic={lastMatchTactic}
                              governance={governance}
                              clubDnaWeights={clubDnaWeights}
                            />
                          );
                        }
                      )}
                    </div>
                  ))}
                </VList>
              )}
            </div>
          )}

          {/* VIEW 5: PERSISTED SHORTLIST */}
          {view === 'shortlist' && (
            <ShortlistView
              trackedTargets={trackedTargets}
              onAskAnalyst={onAskAnalyst}
              handleAskAnalystCompareShortlist={handleAskAnalystCompareShortlist}
              handleOpenTargetCard={handleOpenTargetCard}
              setCompareTarget={setCompareTarget}
              handleRemoveTracked={handleRemoveTracked}
              players={players}
              divisionBenchmarks={divisionBenchmarks}
              lastMatchTactic={lastMatchTactic}
              governance={governance}
              clubDnaWeights={clubDnaWeights}
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

      {/* Deep Scout Target Analysis Modal (Percentile Pizza + Starter Radar + FM27 Fit) */}
      <ScoutTargetDetailModal
        target={deepScoutTarget}
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
