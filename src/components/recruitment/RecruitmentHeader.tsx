import React from 'react';
import {
  Bookmark,
  Briefcase,
  CalendarClock,
  Layers,
  Sparkles,
  TrendingDown,
  UserPlus,
} from 'lucide-react';
import type { PlayerRecord } from '../../types/fm27';
import type {
  CompetitionRegistrationRules,
  FinancialRunway,
  RecruitmentTarget,
  TransferWindowInfo,
} from '../../types/fmSave';
import type {
  AuditView,
  ContractHorizonSummary,
  PlayerAdviceItem,
  PositionalNeed,
  RegistrationCheck,
  SquadAudit,
} from './recruitmentTypes';

interface RecruitmentHeaderProps {
  clubName?: string;
  saveDate: string;
  youthReservesCount: number;
  includeYouthInAudit: boolean;
  setIncludeYouthInAudit: (value: boolean) => void;
  firstTeamPlayers: PlayerRecord[];
  players: PlayerRecord[];
  transferWindows: TransferWindowInfo | null;
  financialRunway: FinancialRunway | null;
  audit: SquadAudit;
  registrationCheck: RegistrationCheck | null;
  competitionRules: CompetitionRegistrationRules | null;
  thinPositions: PositionalNeed[];
  successionGapPositions: PositionalNeed[];
  view: AuditView;
  setView: (view: AuditView) => void;
  scopedPlayerAdvice: PlayerAdviceItem[];
  contractHorizonSummary: ContractHorizonSummary;
  scoutedTargets: RecruitmentTarget[];
  trackedTargets: RecruitmentTarget[];
}

export const RecruitmentHeader: React.FC<RecruitmentHeaderProps> = ({
  clubName,
  saveDate,
  youthReservesCount,
  includeYouthInAudit,
  setIncludeYouthInAudit,
  firstTeamPlayers,
  players,
  transferWindows,
  financialRunway,
  audit,
  registrationCheck,
  competitionRules,
  thinPositions,
  successionGapPositions,
  view,
  setView,
  scopedPlayerAdvice,
  contractHorizonSummary,
  scoutedTargets,
  trackedTargets,
}) => {
  const { clubProfile } = audit;

  return (
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
          {youthReservesCount > 0 && (
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-950 border border-slate-800">
              <button
                type="button"
                onClick={() => setIncludeYouthInAudit(false)}
                className={`min-h-[44px] sm:min-h-[32px] px-2.5 sm:px-2 py-1 rounded-md text-xs sm:text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                  !includeYouthInAudit
                    ? 'bg-emerald-700 text-white dark:bg-emerald-500 dark:text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                First Team ({firstTeamPlayers.length})
              </button>
              <button
                type="button"
                onClick={() => setIncludeYouthInAudit(true)}
                className={`min-h-[44px] sm:min-h-[32px] px-2.5 sm:px-2 py-1 rounded-md text-xs sm:text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                  includeYouthInAudit
                    ? 'bg-emerald-700 text-white dark:bg-emerald-500 dark:text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Squad ({players.length})
              </button>
            </div>
          )}
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
              className={`rounded-md border px-2 py-0.5 text-[11px] font-mono font-semibold tabular-nums ${
                financialRunway.status === 'Critical'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                  : financialRunway.status === 'Warning'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
              }`}
            >
              Runway: {financialRunway.status} ({financialRunway.runwayMonths < 999 ? `${financialRunway.runwayMonths}m` : 'Pos'} · Burn £{Math.round(financialRunway.monthlyBurnRate).toLocaleString()}/mo)
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
              : clubProfile.isMateriallyOverWageBudget
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
                  : clubProfile.isMateriallyOverWageBudget
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

      {/* 4 Compact Financial & Action KPIs (Single Canonical Financial Source of Truth) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 min-w-0">
          <div className="text-[11px] text-slate-400">Bank Balance &amp; Wage Cap</div>
          <div
            className={`text-sm sm:text-base font-bold font-mono tabular-nums mt-0.5 ${
              clubProfile.isInDebt ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {clubProfile.balanceLabel}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-300 mt-0.5 break-words">
            {clubProfile.wageComplianceLabel}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 min-w-0">
          <div className="text-[11px] text-slate-400">Renew / Youth Protection</div>
          <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-emerald-400 mt-0.5">
            {players.length > 0
              ? `${audit.countsByVerdict['Renew Now'] + audit.countsByVerdict['Protect Youth Asset']} Players`
              : '--'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {audit.countsByVerdict['Protect Youth Asset']} U21 protected ·{' '}
            {audit.expiringWithin12mCount} exp &le;12m
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 min-w-0">
          <div className="text-[11px] text-slate-400">Projected Savings (Unbanked)</div>
          <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-amber-300 mt-0.5">
            {players.length > 0
              ? `£${audit.projectedWeeklySavings.toLocaleString()}/wk`
              : '--'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Banked: £{audit.actualBankedWeeklySavings.toLocaleString()}/wk ·{' '}
            {audit.countsByVerdict['Sell / Transfer List'] +
              audit.countsByVerdict['Replace Before Selling']}{' '}
            sell · {audit.countsByVerdict['Let Expire']} exit
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 min-w-0">
          <div className="text-[11px] text-slate-400">Senior Depth &amp; Succession</div>
          <div className="text-sm sm:text-base font-bold font-mono text-sky-300 mt-0.5 break-words">
            {players.length > 0
              ? thinPositions.length > 0
                ? thinPositions.map((b) => b.code).join(', ')
                : successionGapPositions.length > 0
                  ? `U23: ${successionGapPositions.map((b) => b.code).join(', ')}`
                  : 'Balanced'
              : '--'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {audit.squadTierCounts.senior} Senior · {audit.squadTierCounts.youthReserve} U21/Res
            {audit.squadTierCounts.onLoan > 0 ? ` · ${audit.squadTierCounts.onLoan} Loan` : ''}
          </div>
        </div>
      </div>

      {/* 5 Focused View Switchers (Unified In-Game Shortlist, Zero Generic Market Dump) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 pt-1">
        {(
          [
            {
              id: 'advice',
              label: `Squad Advice (${scopedPlayerAdvice.length})`,
              icon: Sparkles,
            },
            {
              id: 'loans',
              label: `Loans (${
                audit.loanAdvice.incomingLoanPriorities.length +
                audit.loanAdvice.developmentLoansOut.length +
                audit.loanAdvice.activeLoansMonitor.length
              })`,
              icon: Layers,
            },
            {
              id: 'contracts',
              label: `Expiring (${
                contractHorizonSummary.critical6m.length +
                contractHorizonSummary.warning12m.length +
                contractHorizonSummary.watch18m.length
              })`,
              icon: CalendarClock,
            },
            {
              id: 'depth',
              label: `Needs (${audit.actionableNeedsCount})`,
              icon: Layers,
            },
            {
              id: 'shortlist',
              label: `Shortlist (${scoutedTargets.length}${trackedTargets.length > 0 ? ` · ${trackedTargets.length} ★` : ''})`,
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
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2.5 min-h-[44px] text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                view === t.id
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-950/70 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
