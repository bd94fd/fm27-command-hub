import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  GitCompare,
  Layers,
  MessageSquare,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  UserPlus,
  X,
} from 'lucide-react';
import {
  PlayerRecord,
  RecruitmentCase,
  ShortlistRecord,
} from '../types/fm27';
import {
  CompetitionRegistrationRules,
  DivisionBenchmarks,
  FinancialRunway,
  RecruitmentTarget,
  TransferWindowInfo,
} from '../types/fmSave';
import {
  buildSquadTransferAudit,
  ClubFinancialInput,
  TransferActionVerdict,
} from '../utils/transferAudit';
import {
  buildScoutTargetPlayerRecord,
  buildTargetVsStarterComparison,
  computeTargetBestRoleFit,
  enrichAndFilterScoutedTargets,
  evaluatePlaybookArchetype,
  evaluateTargetSquadDepth,
  findTopSeniorStarterForPosition,
  formatTargetContractSummary,
  getPositionRelevantAttributes,
  PlaybookArchetypeMatch,
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

type AuditView = 'advice' | 'contracts' | 'depth' | 'targets' | 'shortlist';

function archetypeBadgeClass(tone: PlaybookArchetypeMatch['badgeTone']): string {
  switch (tone) {
    case 'rose':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/35';
    case 'sky':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/35';
    case 'emerald':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
    case 'amber':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
    case 'indigo':
      return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/35';
    case 'purple':
      return 'bg-purple-500/15 text-purple-300 border-purple-500/35';
  }
}

function verdictBadgeClass(verdict: TransferActionVerdict): string {
  switch (verdict) {
    case 'Protect Youth Asset':
      return 'bg-purple-500/15 text-purple-300 border-purple-500/40';
    case 'Renew Now':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
    case 'Sell / Transfer List':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/40';
    case 'Replace Before Selling':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/40';
    case 'Let Expire':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
    case 'Loan Out':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/40';
    case 'Hold':
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
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
  scoutedTargets = [],
  trackedTargets: controlledTrackedTargets,
  onToggleTrackTarget,
  onAskAnalyst,
  onAddCase,
  onSelectPlayer,
}) => {
  const [view, setView] = useState<AuditView>('advice');
  const [verdictFilter, setVerdictFilter] = useState<
    'ALL' | TransferActionVerdict
  >('ALL');
  const [search, setSearch] = useState('');
  const [targetFilter, setTargetFilter] = useState<ScoutContractFilter>('ALL');
  const [targetPosGroup, setTargetPosGroup] = useState<ScoutPositionGroup>('ALL');
  const [targetAgeBand, setTargetAgeBand] = useState<ScoutAgeBand>('ALL');
  const [genuineGapsOnly, setGenuineGapsOnly] = useState<boolean>(false);
  const [localTrackedTargets, setLocalTrackedTargets] = useState<RecruitmentTarget[]>(() =>
    loadTrackedScoutTargets()
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [compareTarget, setCompareTarget] = useState<RecruitmentTarget | null>(null);

  const trackedTargets = controlledTrackedTargets ?? localTrackedTargets;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2600);
  };

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
    onSelectPlayer(buildScoutTargetPlayerRecord(target));
  };

  const handleAskAnalystCompareShortlist = () => {
    if (!onAskAnalyst || trackedTargets.length === 0) return;
    const summaryLines = trackedTargets.slice(0, 10).map((t) => {
      const arch = evaluatePlaybookArchetype(t.primaryPosition, t.attributes);
      const role = computeTargetBestRoleFit(t);
      const contract = formatTargetContractSummary(t);
      const starter = findTopSeniorStarterForPosition(t.primaryPosition, players);
      return `- ${t.name} (${t.primaryPosition}, Age ${t.age}, ${t.nationality}) | ${arch.name} ${arch.score}% | Best Role: ${role.roleName} (${role.fitPct}%) | ${contract.primaryLabel}${contract.trialBadge ? ' [2-Week Free Trial]' : ''}${contract.wageLabel ? ` · ${contract.wageLabel}` : ''} | vs Starter: ${starter ? `${starter.name} (${starter.ability.toFixed(1)}★, £${starter.wagePw}/wk)` : 'None'}`;
    });
    const prompt = `Compare my persisted Shortlist (${trackedTargets.length} targets) against my current senior starters using Bobby Dean's Playbook v2.0 Section 7 recruitment archetypes and £0-budget free-trial rules. Rank who to trial/sign first and who to skip:\n${summaryLines.join('\n')}`;
    onAskAnalyst(prompt);
  };

  const activeComparison = useMemo(() => {
    if (!compareTarget) return null;
    const starter = findTopSeniorStarterForPosition(compareTarget.primaryPosition, players);
    if (!starter) return { target: compareTarget, starter: null, comparison: null };
    return {
      target: compareTarget,
      starter,
      comparison: buildTargetVsStarterComparison(compareTarget, starter),
    };
  }, [compareTarget, players]);

  const filteredScoutedTargets = useMemo(
    () =>
      enrichAndFilterScoutedTargets({
        targets: scoutedTargets,
        squadPlayers: players,
        posGroup: targetPosGroup,
        ageBand: targetAgeBand,
        contractFilter: targetFilter,
        genuineGapsOnly,
        searchQuery: search,
      }),
    [
      scoutedTargets,
      players,
      targetPosGroup,
      targetAgeBand,
      targetFilter,
      genuineGapsOnly,
      search,
    ]
  );

  const audit = useMemo(
    () =>
      buildSquadTransferAudit(
        players,
        saveDate,
        {
          ...finances,
          balanceLabel: balance,
          wageSpendLabel: wageSpend,
        },
        divisionBenchmarks
      ),
    [players, saveDate, finances, balance, wageSpend, divisionBenchmarks]
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
    const q = search.trim().toLowerCase();
    return audit.playerAdvice.filter((item) => {
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
  }, [audit.playerAdvice, verdictFilter, search]);

  const expiringAdvice = useMemo(
    () =>
      audit.playerAdvice.filter(
        (item) => item.monthsLeft !== null && item.monthsLeft <= 12
      ),
    [audit.playerAdvice]
  );

  const thinPositions = useMemo(
    () => audit.positionalNeeds.filter((b) => b.status === 'Need Signing'),
    [audit.positionalNeeds]
  );

  const { clubProfile } = audit;

  return (
    <div className="space-y-4">
      {/* Header & Club Financial Health Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-emerald-400" />
              {clubName && clubName !== '--'
                ? `${clubName} · Transfers, Contracts & Squad Audit`
                : 'Transfers, Contracts & Squad Audit'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Club-aware transfer &amp; contract strategy factoring in finances, financial runway, youth potential, personalities &amp; positional depth ({saveDate})
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {transferWindows && typeof transferWindows.isOpen === 'boolean' && (
              <span
                className={`rounded-md border px-2 py-0.5 text-[11px] font-mono font-semibold ${
                  transferWindows.isOpen
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                Window: {transferWindows.isOpen ? 'OPEN' : 'Closed'}
              </span>
            )}
            {financialRunway && (
              <span
                className={`rounded-md border px-2 py-0.5 text-[11px] font-mono font-semibold ${
                  financialRunway.status === 'Critical'
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                    : financialRunway.status === 'Warning'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                }`}
              >
                Runway: {financialRunway.status} ({financialRunway.runwayMonths}m · Burn £{Math.round(financialRunway.monthlyBurnRate).toLocaleString()}/mo)
              </span>
            )}
          </div>
        </div>

        {/* Club Size & Debt Strategy Banner */}
        {players.length > 0 && (
          <div
            className={`rounded-xl border p-3 space-y-1.5 ${
              clubProfile.isInDebt
                ? 'border-rose-500/40 bg-rose-950/25'
                : clubProfile.isOverWageBudget
                  ? 'border-amber-500/40 bg-amber-950/20'
                  : 'border-emerald-500/30 bg-emerald-950/20'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              {clubProfile.isInDebt && (
                <TrendingDown className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span
                className={
                  clubProfile.isInDebt
                    ? 'text-rose-300'
                    : clubProfile.isOverWageBudget
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                }
              >
                {clubProfile.strategyHeadline}
              </span>
            </div>
            <ul className="space-y-0.5 text-[11px] text-slate-300">
              {clubProfile.strategyBullets.map((b, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-slate-500">•</span>
                  <span>{b}</span>
                </li>
              ))}
              {audit.tierBenchmarks.divisionDeficits.map((def, idx) => (
                <li key={`div-${idx}`} className="flex items-start gap-1.5 text-amber-300">
                  <span className="text-amber-400">•</span>
                  <span>Division Benchmark Gap: {def}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pass 1 Tier-1: Competition Registration Compliance Strip */}
        {competitionRules && registrationCheck && players.length > 0 && (
          <div
            className={`rounded-xl border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs ${
              registrationCheck.overLimit
                ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
                : 'border-sky-500/30 bg-sky-950/20 text-sky-200'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 font-semibold">
              <span className="uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-slate-900/70 border border-slate-700 text-slate-200">
                Registration Compliance · {competitionRules.competitionName || 'League'}
              </span>
              {competitionRules.maxSquadSize !== null && (
                <span className="font-mono">
                  {registrationCheck.countableSenior} / {competitionRules.maxSquadSize} Senior Slots
                  {competitionRules.u21Exempt
                    ? ` (${registrationCheck.u21Count} U21 Exempt)`
                    : ''}
                </span>
              )}
              {registrationCheck.overLimit && (
                <span className="text-rose-300 font-bold">
                  OVER LIMIT — trim or loan senior squad before registration lock
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-300">
              {competitionRules.minHomegrownClub !== null && (
                <span>Min HGC: {competitionRules.minHomegrownClub}</span>
              )}
              {competitionRules.minHomegrownNation !== null && (
                <span>Min HGN: {competitionRules.minHomegrownNation}</span>
              )}
              {competitionRules.maxForeignPlayers !== null && (
                <span>Max Foreign: {competitionRules.maxForeignPlayers}</span>
              )}
              {competitionRules.matchdaySubsLimit !== null && (
                <span>Matchday Subs: {competitionRules.matchdaySubsLimit}</span>
              )}
            </div>
          </div>
        )}

        {/* 4 Compact Financial & Action KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[11px] text-slate-400">Balance &amp; Wages</div>
            <div
              className={`text-xs sm:text-sm font-bold font-mono mt-0.5 truncate ${
                clubProfile.isInDebt ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {balance}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
              {wageSpend}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[11px] text-slate-400">Renew / Youth Lock</div>
            <div className="text-sm sm:text-base font-bold font-mono text-emerald-400 mt-0.5">
              {players.length > 0
                ? `${audit.countsByVerdict['Renew Now'] + audit.countsByVerdict['Protect Youth Asset']} Players`
                : '--'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {audit.countsByVerdict['Protect Youth Asset']} U21 assets ·{' '}
              {audit.expiringWithin12mCount} exp &le;12m
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[11px] text-slate-400">Wage Savings Pool</div>
            <div className="text-sm sm:text-base font-bold font-mono text-amber-300 mt-0.5">
              {players.length > 0
                ? `£${audit.potentialWeeklySavings.toLocaleString()}/wk`
                : '--'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {audit.countsByVerdict['Sell / Transfer List'] +
                audit.countsByVerdict['Replace Before Selling']}{' '}
              sell · {audit.countsByVerdict['Let Expire']} exit ·{' '}
              {audit.countsByVerdict['Loan Out']} loan
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[11px] text-slate-400">Transfer Priorities</div>
            <div className="text-sm sm:text-base font-bold font-mono text-sky-300 mt-0.5 truncate">
              {players.length > 0
                ? thinPositions.map((b) => b.code).join(', ') || 'Balanced'
                : '--'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              4-3-3 depth scan
            </div>
          </div>
        </div>

        {/* 5 Focused View Switchers */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
          {(
            [
              {
                id: 'advice',
                label: `Squad Advice (${players.length})`,
                icon: Sparkles,
              },
              {
                id: 'contracts',
                label: `Expiring (${expiringAdvice.length})`,
                icon: CalendarClock,
              },
              {
                id: 'depth',
                label: `Needs (${thinPositions.length})`,
                icon: Layers,
              },
              {
                id: 'targets',
                label: `Scouted (${scoutedTargets.length})`,
                icon: UserPlus,
              },
              {
                id: 'shortlist',
                label: `Shortlist (${trackedTargets.length})`,
                icon: Bookmark,
              },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setView(t.id)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition cursor-pointer ${
                  view === t.id
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-950/70 text-slate-400 border border-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {players.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center space-y-2">
          <div className="text-sm font-bold text-slate-200">
            Awaiting .fm Save
          </div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Load your `.fm` save in the <strong>Analyst</strong> tab to generate club-aware transfer, contract, youth, and wage advice.
          </p>
        </div>
      ) : (
        <>
          {/* VIEW 1: TAILORED PLAYER-BY-PLAYER ADVICE */}
          {view === 'advice' && (
            <div className="space-y-3">
              {/* Filter Pills + Search */}
              <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: 'ALL', label: `All (${players.length})` },
                      {
                        id: 'Protect Youth Asset',
                        label: `Youth (${audit.countsByVerdict['Protect Youth Asset']})`,
                      },
                      {
                        id: 'Renew Now',
                        label: `Renew (${audit.countsByVerdict['Renew Now']})`,
                      },
                      {
                        id: 'Sell / Transfer List',
                        label: `Sell (${audit.countsByVerdict['Sell / Transfer List']})`,
                      },
                      {
                        id: 'Replace Before Selling',
                        label: `Replace 1st (${audit.countsByVerdict['Replace Before Selling']})`,
                      },
                      {
                        id: 'Let Expire',
                        label: `Let Expire (${audit.countsByVerdict['Let Expire']})`,
                      },
                      {
                        id: 'Loan Out',
                        label: `Loan (${audit.countsByVerdict['Loan Out']})`,
                      },
                      {
                        id: 'Hold',
                        label: `Hold (${audit.countsByVerdict['Hold']})`,
                      },
                    ] as const
                  ).map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setVerdictFilter(pill.id)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition ${
                        verdictFilter === pill.id
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>

                <div className="relative sm:w-56">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter player, pos, tag..."
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>

              {/* Player Advice Cards */}
              <div className="space-y-2.5">
                {filteredAdvice.map((item) => {
                  const p = item.player;
                  return (
                    <div
                      key={p.id}
                      className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 sm:p-4 space-y-2 hover:border-slate-700 transition"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectPlayer(p)}
                          className="text-left group"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-bold text-white group-hover:text-emerald-300 transition">
                              {p.name}
                            </span>
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                              {p.position}
                            </span>
                            <span className="text-[11px] font-mono text-amber-300">
                              {p.ability.toFixed(1)}★/{p.potential.toFixed(1)}★
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Age {p.age} · £{p.wagePw.toLocaleString()}/wk (£
                            {item.annualWage.toLocaleString()}/yr) · Exp{' '}
                            <span className="font-mono text-slate-200">
                              {p.expires}
                            </span>{' '}
                            · {p.minutes}m
                          </div>
                        </button>

                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold shrink-0 ${verdictBadgeClass(
                            item.verdict
                          )}`}
                        >
                          {item.verdict}
                        </span>
                      </div>

                      {item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.tags.map((tag, idx) => {
                            const isBannedTag = tag.startsWith('BANNED');
                            const isOptionTag = tag.startsWith('Club Option');
                            const isClauseTag = tag.startsWith('Release Clause');
                            return (
                              <span
                                key={idx}
                                className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                                  isBannedTag
                                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-bold'
                                    : isOptionTag
                                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                                      : isClauseTag
                                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                        : 'bg-slate-800/90 border-slate-700/80 text-slate-300'
                                }`}
                              >
                                {tag}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <div className="text-xs font-semibold text-slate-100">
                        {item.headline}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        <strong className="text-slate-300">Why:</strong>{' '}
                        {item.rationale}
                      </p>
                      <div className="rounded-lg border border-slate-800/90 bg-slate-950/70 px-3 py-2 text-xs text-emerald-300/95 flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-400" />
                        <span>
                          <strong className="text-emerald-300">Action:</strong>{' '}
                          {item.recommendedMove}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 2: EXPIRING CONTRACTS TIMELINE */}
          {view === 'contracts' && (
            <div className="space-y-2.5">
              {expiringAdvice.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
                  No players expiring within the next 12 months.
                </div>
              ) : (
                expiringAdvice.map((item) => {
                  const p = item.player;
                  return (
                    <div
                      key={p.id}
                      className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectPlayer(p)}
                          className="text-left"
                        >
                          <span className="text-sm font-bold text-white hover:text-emerald-300">
                            {p.name}
                          </span>{' '}
                          <span className="text-[11px] font-mono text-slate-400">
                            ({p.position} · Age {p.age} · {p.ability.toFixed(1)}★/{p.potential.toFixed(1)}★)
                          </span>
                        </button>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${verdictBadgeClass(
                            item.verdict
                          )}`}
                        >
                          {item.verdict}
                        </span>
                      </div>
                      <div className="text-xs text-amber-300 font-mono">
                        Expires {p.expires} ({item.monthsLeft}m left) · £{p.wagePw}/wk · {p.minutes}m · {p.personality}
                      </div>
                      <div className="text-xs text-slate-300">
                        {item.recommendedMove}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* VIEW 3: 4-3-3 POSITIONAL DEPTH & SCOUTING PROFILES */}
          {view === 'depth' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {audit.positionalNeeds.map((b) => {
                const isThin = b.status === 'Need Signing';
                const isOver = b.status === 'Overstocked';
                return (
                  <div
                    key={b.code}
                    className={`rounded-2xl border p-4 space-y-2.5 ${
                      isThin
                        ? 'border-rose-500/40 bg-rose-950/20'
                        : isOver
                          ? 'border-amber-500/40 bg-amber-950/15'
                          : 'border-slate-800 bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-white">{b.label}</h4>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                          isThin
                            ? 'bg-rose-500/20 text-rose-300'
                            : isOver
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                        }`}
                      >
                        {b.currentCount} (Ideal {b.idealMin}–{b.idealMax})
                      </span>
                    </div>

                    {isThin && (
                      <div className="rounded-lg border border-rose-500/30 bg-rose-950/40 p-2 text-[11px] text-rose-200 space-y-1">
                        <div className="font-bold flex items-center gap-1 text-rose-300">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          Priority Signing Target
                        </div>
                        <div className="text-[10px] text-slate-300 leading-snug">
                          {b.scoutProfile}
                        </div>
                      </div>
                    )}

                    {isOver && (
                      <div className="text-[11px] text-amber-300">
                        Overstocked — loan or sell surplus depth to cut wages.
                      </div>
                    )}

                    <div className="space-y-1">
                      {b.players.length === 0 ? (
                        <div className="text-[11px] text-slate-500 italic">
                          No natural/accomplished cover
                        </div>
                      ) : (
                        b.players.slice(0, 6).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => onSelectPlayer(p)}
                            className="w-full flex items-center justify-between rounded-lg bg-slate-950/70 border border-slate-800/80 px-2.5 py-1.5 text-[11px] hover:border-emerald-500/40 transition"
                          >
                            <span className="truncate text-slate-200 font-medium">
                              {p.name}
                            </span>
                            <span className="font-mono text-amber-300 shrink-0 ml-2">
                              {p.ability.toFixed(1)}★/{p.potential.toFixed(1)}★
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 4: PASS 0 GROUP 4 SCOUTED FREE AGENTS & EXPIRING <= 6M */}
          {view === 'targets' && (
            <div className="space-y-3">
              {/* Interactive Scouted Filter Bar */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Position Group Chips */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map((grp) => (
                      <button
                        key={grp}
                        type="button"
                        onClick={() => setTargetPosGroup(grp)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition cursor-pointer ${
                          targetPosGroup === grp
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {grp}
                      </button>
                    ))}
                  </div>

                  {/* Age Band Chips */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'ALL', label: 'All Ages' },
                        { id: 'U23', label: 'U23' },
                        { id: '23-28', label: '23–28' },
                        { id: '29+', label: '29+' },
                      ] as const
                    ).map((band) => (
                      <button
                        key={band.id}
                        type="button"
                        onClick={() => setTargetAgeBand(band.id)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition cursor-pointer ${
                          targetAgeBand === band.id
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                            : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {band.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'ALL', label: `All (${scoutedTargets.length})` },
                        {
                          id: 'FREE',
                          label: `Free Agents (${scoutedTargets.filter((t) => t.isFreeAgent).length})`,
                        },
                        {
                          id: 'EXPIRING',
                          label: `Expiring ≤6m (${scoutedTargets.filter((t) => !t.isFreeAgent).length})`,
                        },
                      ] as const
                    ).map((btn) => (
                      <button
                        key={btn.id}
                        type="button"
                        onClick={() => setTargetFilter(btn.id)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition cursor-pointer ${
                          targetFilter === btn.id
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}

                    <button
                      type="button"
                      aria-pressed={genuineGapsOnly}
                      onClick={() => setGenuineGapsOnly((prev) => !prev)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition cursor-pointer ${
                        genuineGapsOnly
                          ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400 ring-1 ring-emerald-400/40 shadow-sm shadow-emerald-500/20'
                          : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {genuineGapsOnly ? '✓ Genuine Gaps Only' : 'Genuine Gaps Only'}
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-400">
                    Showing {filteredScoutedTargets.length} · Sorted by Gap &amp; Role Fit · Zero raw CA/PA
                  </span>
                </div>
              </div>

              {scoutedTargets.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
                  No Free Agent or Expiring ≤6m targets decoded in this save yet. Drop a `.fm` save in the Analyst tab to run the Pass 0 recruitment scan.
                </div>
              ) : filteredScoutedTargets.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
                  No scouted targets match the active filters. Try clearing &ldquo;Genuine Gaps Only&rdquo; or broadening the position/age band.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredScoutedTargets.map(
                    ({
                      target,
                      bestRole,
                      archetype,
                      relevantAttributes,
                      depth,
                      contractDisplay,
                    }) => {
                      const isTracked = isScoutTargetTracked(trackedTargets, target);

                      return (
                        <div
                          key={target.uid || target.name}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleOpenTargetCard(target)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleOpenTargetCard(target);
                            }
                          }}
                          className={`rounded-xl border p-4 space-y-2.5 text-left transition cursor-pointer hover:border-emerald-500/50 ${
                            depth.isGenuineGap
                              ? 'border-amber-500/40 bg-amber-950/15'
                              : 'border-slate-800 bg-slate-900/70'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-white truncate">
                                {target.name}
                              </h3>
                              <p className="text-[11px] text-slate-400">
                                {target.age} yrs · {target.nationality} ·{' '}
                                <span className="font-mono text-emerald-300">
                                  {target.primaryPosition}
                                </span>
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold border ${
                                target.isFreeAgent
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                  : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                              }`}
                            >
                              {contractDisplay.primaryLabel}
                            </span>
                          </div>

                          {/* Playbook v2.0 Archetype + Free Trial Badge + Best Role & Wage */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span
                              className={`rounded border px-2 py-0.5 font-semibold ${archetypeBadgeClass(
                                archetype.badgeTone
                              )}`}
                            >
                              {archetype.name} · {archetype.score}%
                            </span>
                            {contractDisplay.trialBadge && (
                              <span className="rounded bg-teal-500/15 border border-teal-500/40 px-2 py-0.5 text-[10px] font-bold text-teal-300">
                                {contractDisplay.trialBadge}
                              </span>
                            )}
                            <span className="rounded bg-emerald-500/15 border border-emerald-500/35 px-2 py-0.5 font-semibold text-emerald-300">
                              {bestRole.roleName} · {bestRole.fitPct}% Fit
                            </span>
                            {contractDisplay.wageLabel && (
                              <span className="rounded bg-slate-950/80 border border-slate-800 px-2 py-0.5 font-mono text-slate-300">
                                Wage {contractDisplay.wageLabel}
                              </span>
                            )}
                          </div>

                          {/* 4 Position-Relevant Attributes */}
                          <div className="grid grid-cols-4 gap-1.5 text-[11px] font-mono text-slate-200">
                            {relevantAttributes.map((attrChip) => (
                              <div
                                key={attrChip.label}
                                className="rounded bg-slate-950/80 border border-slate-800 px-2 py-1 text-center"
                              >
                                <span className="text-slate-400 mr-1">
                                  {attrChip.label}
                                </span>
                                <span
                                  className={
                                    attrChip.value >= 14
                                      ? 'text-emerald-300 font-bold'
                                      : attrChip.value >= 11
                                        ? 'text-slate-100 font-semibold'
                                        : 'text-slate-400'
                                  }
                                >
                                  {attrChip.value}
                                </span>
                              </div>
                            ))}
                          </div>

                          {target.scoutBadges && target.scoutBadges.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {target.scoutBadges.map((badge) => (
                                <span
                                  key={badge}
                                  className="rounded bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.5 text-[10px] text-indigo-300"
                                >
                                  {badge}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center justify-between pt-1.5 border-t border-slate-800/80 text-[11px] gap-2">
                            {depth.isGenuineGap ? (
                              <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                {depth.label}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-slate-800/80 text-slate-400 border border-slate-700/80">
                                {depth.label}
                              </span>
                            )}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCompareTarget(target);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 px-2 py-1 text-[11px] font-semibold text-sky-300 transition cursor-pointer"
                              >
                                <GitCompare className="h-3 w-3" />
                                Compare
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleTrack(target);
                                }}
                                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                                  isTracked
                                    ? 'bg-emerald-500/25 hover:bg-emerald-500/35 border-emerald-400/60 text-emerald-200'
                                    : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-300'
                                }`}
                              >
                                {isTracked ? '✓ Tracked' : '+ Track'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          )}

          {/* VIEW 5: PERSISTED SHORTLIST */}
          {view === 'shortlist' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                    <Bookmark className="h-4 w-4 text-emerald-400" />
                    Persisted Recruitment Shortlist ({trackedTargets.length})
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Saved locally in browser storage · Tap any card for full 52-attribute profile or compare directly against our senior starter
                  </p>
                </div>
                <button
                  type="button"
                  disabled={trackedTargets.length === 0 || !onAskAnalyst}
                  onClick={handleAskAnalystCompareShortlist}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-40 border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition cursor-pointer"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Ask Analyst to Compare Shortlist
                </button>
              </div>

              {trackedTargets.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
                  No targets shortlisted yet. Tap <strong>+ Track</strong> on any player in the <strong>Scouted</strong> tab to persist them here.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {trackedTargets.map((target) => {
                    const bestRole = computeTargetBestRoleFit(target);
                    const archetype = evaluatePlaybookArchetype(
                      target.primaryPosition,
                      target.attributes
                    );
                    const relevantAttributes = getPositionRelevantAttributes(target);
                    const depth = evaluateTargetSquadDepth(
                      target.primaryPosition,
                      players
                    );
                    const contractDisplay = formatTargetContractSummary(target);

                    return (
                      <div
                        key={target.uid || target.name}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleOpenTargetCard(target)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleOpenTargetCard(target);
                          }
                        }}
                        className="rounded-xl border border-emerald-500/30 bg-slate-900/75 p-4 space-y-2.5 text-left transition cursor-pointer hover:border-emerald-400/60"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-white truncate">
                              {target.name}
                            </h3>
                            <p className="text-[11px] text-slate-400">
                              {target.age} yrs · {target.nationality} ·{' '}
                              <span className="font-mono text-emerald-300">
                                {target.primaryPosition}
                              </span>
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold border ${
                              target.isFreeAgent
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                            }`}
                          >
                            {contractDisplay.primaryLabel}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span
                            className={`rounded border px-2 py-0.5 font-semibold ${archetypeBadgeClass(
                              archetype.badgeTone
                            )}`}
                          >
                            {archetype.name} · {archetype.score}%
                          </span>
                          {contractDisplay.trialBadge && (
                            <span className="rounded bg-teal-500/15 border border-teal-500/40 px-2 py-0.5 text-[10px] font-bold text-teal-300">
                              {contractDisplay.trialBadge}
                            </span>
                          )}
                          <span className="rounded bg-emerald-500/15 border border-emerald-500/35 px-2 py-0.5 font-semibold text-emerald-300">
                            {bestRole.roleName} · {bestRole.fitPct}% Fit
                          </span>
                          {contractDisplay.wageLabel && (
                            <span className="rounded bg-slate-950/80 border border-slate-800 px-2 py-0.5 font-mono text-slate-300">
                              Wage {contractDisplay.wageLabel}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-4 gap-1.5 text-[11px] font-mono text-slate-200">
                          {relevantAttributes.map((attrChip) => (
                            <div
                              key={attrChip.label}
                              className="rounded bg-slate-950/80 border border-slate-800 px-2 py-1 text-center"
                            >
                              <span className="text-slate-400 mr-1">
                                {attrChip.label}
                              </span>
                              <span
                                className={
                                  attrChip.value >= 14
                                    ? 'text-emerald-300 font-bold'
                                    : attrChip.value >= 11
                                      ? 'text-slate-100 font-semibold'
                                      : 'text-slate-400'
                                }
                              >
                                {attrChip.value}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center justify-between pt-1.5 border-t border-slate-800/80 text-[11px] gap-1.5">
                          <span className="text-[10px] text-slate-400">
                            {depth.label}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenTargetCard(target);
                              }}
                              className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200 transition cursor-pointer"
                            >
                              Open Card
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCompareTarget(target);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 px-2 py-1 text-[11px] font-semibold text-sky-300 transition cursor-pointer"
                            >
                              <GitCompare className="h-3 w-3" />
                              Compare
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveTracked(target);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 px-2 py-1 text-[11px] font-semibold text-rose-300 transition cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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

      {/* 1-Tap Compare vs Starter Modal */}
      {activeComparison && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-4"
          onClick={() => setCompareTarget(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-4 sm:p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                  <GitCompare className="h-3.5 w-3.5" />
                  1-Tap Compare vs Current Senior Starter
                </div>
                <h3 className="text-base font-bold text-white mt-0.5">
                  <span className="text-emerald-300">
                    {activeComparison.target.name}
                  </span>{' '}
                  <span className="text-slate-500">vs</span>{' '}
                  <span className="text-sky-300">
                    {activeComparison.starter
                      ? activeComparison.starter.name
                      : 'No Senior Starter'}
                  </span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCompareTarget(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                aria-label="Close comparison"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!activeComparison.comparison || !activeComparison.starter ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-6 text-center text-xs text-slate-400">
                No senior starter found in the squad for{' '}
                <strong>{activeComparison.target.primaryPosition}</strong> to compare against yet.
              </div>
            ) : (
              <>
                {/* SVG 6-Axis Radar Comparison */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col sm:flex-row items-center gap-4">
                  <div className="shrink-0">
                    {(() => {
                      const axes = activeComparison.comparison.radarAxes;
                      const cx = 110;
                      const cy = 110;
                      const maxR = 76;
                      const pointAt = (idx: number, val: number) => {
                        const angle = (Math.PI * 2 * idx) / axes.length - Math.PI / 2;
                        const r = (Math.max(1, Math.min(20, val)) / 20) * maxR;
                        return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
                      };
                      const targetPoly = axes
                        .map((ax, i) => pointAt(i, ax.targetVal))
                        .join(' ');
                      const starterPoly = axes
                        .map((ax, i) => pointAt(i, ax.starterVal))
                        .join(' ');
                      return (
                        <svg
                          viewBox="0 0 220 220"
                          className="w-48 h-48 sm:w-52 sm:h-52"
                          aria-label="Attribute radar comparison"
                        >
                          {[5, 10, 15, 20].map((ring) => (
                            <polygon
                              key={ring}
                              points={axes
                                .map((_, i) => pointAt(i, ring))
                                .join(' ')}
                              fill="none"
                              stroke="rgb(51 65 85)"
                              strokeWidth="1"
                              strokeDasharray={ring === 20 ? undefined : '2 2'}
                            />
                          ))}
                          {axes.map((ax, i) => {
                            const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
                            const x2 = cx + maxR * Math.cos(angle);
                            const y2 = cy + maxR * Math.sin(angle);
                            const lx = cx + (maxR + 18) * Math.cos(angle);
                            const ly = cy + (maxR + 18) * Math.sin(angle);
                            return (
                              <g key={ax.label}>
                                <line
                                  x1={cx}
                                  y1={cy}
                                  x2={x2}
                                  y2={y2}
                                  stroke="rgb(51 65 85)"
                                  strokeWidth="1"
                                />
                                <text
                                  x={lx}
                                  y={ly}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fill="rgb(203 213 225)"
                                  fontSize="10"
                                  fontFamily="monospace"
                                >
                                  {ax.label}
                                </text>
                              </g>
                            );
                          })}
                          <polygon
                            points={starterPoly}
                            fill="rgba(56, 189, 248, 0.20)"
                            stroke="rgb(56, 189, 248)"
                            strokeWidth="2"
                          />
                          <polygon
                            points={targetPoly}
                            fill="rgba(16, 185, 129, 0.25)"
                            stroke="rgb(16, 185, 129)"
                            strokeWidth="2"
                          />
                        </svg>
                      );
                    })()}
                  </div>

                  {/* Age, Wage & Archetype Summary */}
                  <div className="flex-1 w-full space-y-2 text-xs">
                    <div className="flex flex-wrap items-center gap-3 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                        {activeComparison.target.name} ({activeComparison.target.primaryPosition})
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-sky-300 font-semibold">
                        <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                        {activeComparison.starter.name} ({activeComparison.starter.position})
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2.5">
                        <div className="text-[10px] text-slate-400">Age Comparison</div>
                        <div className="font-mono font-bold text-white mt-0.5">
                          {activeComparison.target.age} vs {activeComparison.starter.age}
                        </div>
                        <div
                          className={`text-[10px] font-mono font-semibold ${
                            activeComparison.comparison.ageDelta <= 0
                              ? 'text-emerald-300'
                              : 'text-amber-300'
                          }`}
                        >
                          {activeComparison.comparison.ageDelta > 0 ? '+' : ''}
                          {activeComparison.comparison.ageDelta} yrs
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2.5">
                        <div className="text-[10px] text-slate-400">Weekly Wage</div>
                        <div className="font-mono font-bold text-white mt-0.5">
                          £{(activeComparison.target.demandedWageEur || 0).toLocaleString()} vs £
                          {(activeComparison.starter.wagePw || 0).toLocaleString()}
                        </div>
                        <div
                          className={`text-[10px] font-mono font-semibold ${
                            activeComparison.comparison.wageDelta <= 0
                              ? 'text-emerald-300'
                              : 'text-rose-300'
                          }`}
                        >
                          {activeComparison.comparison.wageDelta > 0 ? '+' : ''}
                          £{activeComparison.comparison.wageDelta.toLocaleString()}/wk
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2.5 flex items-center justify-between">
                      <span className="text-[11px] text-slate-300">
                        Playbook Archetype:{' '}
                        <strong className="text-white">
                          {activeComparison.comparison.archetype.name}
                        </strong>
                      </span>
                      <span className="font-mono text-xs font-bold">
                        <span className="text-emerald-300">
                          {activeComparison.comparison.archetype.score}%
                        </span>{' '}
                        <span className="text-slate-500">vs</span>{' '}
                        <span className="text-sky-300">
                          {activeComparison.comparison.starterArchetype.score}%
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Green/Red Attribute Deltas */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {activeComparison.comparison.radarAxes.map((ax) => (
                    <div
                      key={ax.label}
                      className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 flex items-center justify-between text-xs font-mono"
                    >
                      <span className="text-slate-300 font-semibold">{ax.label}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-emerald-300 font-bold">
                          {ax.targetVal}
                        </span>
                        <span className="text-slate-500">/</span>
                        <span className="text-sky-300">{ax.starterVal}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            ax.delta > 0
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : ax.delta < 0
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {ax.delta > 0 ? `+${ax.delta}` : ax.delta}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  const t = activeComparison.target;
                  setCompareTarget(null);
                  handleOpenTargetCard(t);
                }}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                Open Full Card
              </button>
              <button
                type="button"
                onClick={() => handleToggleTrack(activeComparison.target)}
                className="rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition cursor-pointer"
              >
                {isScoutTargetTracked(trackedTargets, activeComparison.target)
                  ? '✓ Tracked'
                  : '+ Track'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
