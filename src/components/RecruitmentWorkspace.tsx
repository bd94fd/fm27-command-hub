import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Layers,
  Search,
  Sparkles,
  TrendingDown,
  UserPlus,
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
  enrichAndFilterScoutedTargets,
  ScoutAgeBand,
  ScoutContractFilter,
  ScoutPositionGroup,
} from '../utils/recruitmentHelpers';

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
  onAddCase: (entry: Omit<RecruitmentCase, 'id' | 'updatedAt'>) => void;
  onUpdateCase: (id: string, patch: Partial<RecruitmentCase>) => void;
  onDeleteCase: (id: string) => void;
  onCreateShortlist: (name: string, description: string) => void;
  onDeleteShortlist: (id: string) => void;
  onRemoveFromShortlist: (shortlistId: string, playerId: string) => void;
  onSelectPlayer: (player: PlayerRecord) => void;
}

type AuditView = 'advice' | 'contracts' | 'depth' | 'targets';

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

        {/* 4 Focused View Switchers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
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
                      onClick={() => setGenuineGapsOnly((prev) => !prev)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition cursor-pointer ${
                        genuineGapsOnly
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
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
                      relevantAttributes,
                      depth,
                      contractDisplay,
                    }) => {
                      const alreadyTracked = cases.some(
                        (c) =>
                          c.playerName.toLowerCase() === target.name.toLowerCase()
                      );

                      return (
                        <div
                          key={target.uid || target.name}
                          className={`rounded-xl border p-4 space-y-2.5 ${
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

                          {/* Best FM27 Role + Fit % & Expiring Wage */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
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

                          <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/80 text-[11px] gap-2">
                            {depth.isGenuineGap ? (
                              <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                Priority GAP · {depth.count} at club
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-slate-800/80 text-slate-400 border border-slate-700/80">
                                Depth: {depth.count} at club
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={alreadyTracked}
                              onClick={() =>
                                onAddCase({
                                  playerName: target.name,
                                  position: target.primaryPosition,
                                  age: target.age,
                                  currentClub:
                                    target.currentClub ||
                                    (target.isFreeAgent
                                      ? 'Free Agent'
                                      : 'Expiring Contract'),
                                  targetIpRole: bestRole.roleName,
                                  targetOopRole: 'To Assign',
                                  interest: 'Interested',
                                  stage: 'Scouted',
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
                                })
                              }
                              className="rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 transition cursor-pointer shrink-0"
                            >
                              {alreadyTracked ? 'Tracked' : '+ Track'}
                            </button>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
