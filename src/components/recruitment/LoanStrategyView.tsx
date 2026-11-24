import React from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Compass,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { PlayerRecord } from '../../types/fm27';
import type { RecruitmentTarget } from '../../types/fmSave';
import type { SquadTransferAuditSummary } from '../../utils/transferAudit';

interface LoanStrategyViewProps {
  audit: SquadTransferAuditSummary;
  scoutedTargets: RecruitmentTarget[];
  onSelectPlayer: (player: PlayerRecord) => void;
  onJumpToLoanTargets: (bucketCode?: string) => void;
  onAskAnalyst?: (prompt: string) => void;
}

export const LoanStrategyView: React.FC<LoanStrategyViewProps> = ({
  audit,
  scoutedTargets,
  onSelectPlayer,
  onJumpToLoanTargets,
  onAskAnalyst,
}) => {
  const { loanAdvice, leagueLevelCalibration, tierBenchmarks } = audit;
  const loanCandidatesCount = scoutedTargets.filter((t) => t.isLoanCandidate).length;

  return (
    <div className="space-y-3.5">
      {/* 1. Team & League Level Loan Calibration Header */}
      <div className="rounded-xl border border-indigo-500/35 bg-indigo-950/20 p-4 space-y-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-bold text-indigo-200">
              <Compass className="h-4 w-4 text-indigo-400 shrink-0" />
              <span>{loanAdvice.headline}</span>
              <span className="rounded-md border border-indigo-400/35 bg-indigo-500/15 px-2 py-0.5 font-mono text-[10px] text-indigo-200">
                {leagueLevelCalibration.standingContextLabel}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {leagueLevelCalibration.recruitmentApproachSummary}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loanCandidatesCount > 0 && (
              <button
                type="button"
                onClick={() => onJumpToLoanTargets()}
                className="min-h-[40px] sm:min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 px-3 py-1.5 text-xs font-semibold text-sky-200 transition cursor-pointer"
              >
                <ArrowDownLeft className="h-3.5 w-3.5" />
                Browse Loan Targets ({loanCandidatesCount})
              </button>
            )}
            {onAskAnalyst && (
              <button
                type="button"
                onClick={() =>
                  onAskAnalyst(
                    `Build a complete Incoming & Outgoing Loan Plan calibrated specifically for our club level (${leagueLevelCalibration.clubTierLabel}) and league (${leagueLevelCalibration.standingContextLabel}, starter attr baseline >= ${leagueLevelCalibration.starterAttrBaseline}/20). Cover: 1) Which exact positions to loan IN and on what wage share, 2) Which U21 prospects to loan OUT for regular men's minutes (and who NOT to loan out), and 3) Any surplus earners we should offer out on wage-relief loans.`
                  )
                }
                className="min-h-[40px] sm:min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Ask Analyst for Loan Plan
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] font-mono">
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              League Starter Floor
            </div>
            <div className="mt-0.5 font-bold text-white">
              {tierBenchmarks.firstTeamStarterFloor.toFixed(1)}★ · Attrs ≥{' '}
              {leagueLevelCalibration.starterAttrBaseline}/20
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Incoming Loan Needs
            </div>
            <div className="mt-0.5 font-bold text-sky-300">
              {loanAdvice.incomingLoanPriorities.length > 0
                ? loanAdvice.incomingLoanPriorities.map((i) => i.bucketCode).join(', ')
                : 'Opportunistic Only'}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Dev Loans Out
            </div>
            <div className="mt-0.5 font-bold text-emerald-300">
              {loanAdvice.developmentLoansOut.length} Prospect
              {loanAdvice.developmentLoansOut.length === 1 ? '' : 's'}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Wage-Relief Options
            </div>
            <div className="mt-0.5 font-bold text-amber-300">
              {loanAdvice.wageReliefLoanFallbacks.length} Senior
              {loanAdvice.wageReliefLoanFallbacks.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-300">
          <strong className="text-indigo-300">Rules &amp; Window Fit:</strong>{' '}
          {loanAdvice.leagueLoanRulesNote}
        </div>
      </div>

      {/* 2. Incoming Loan Priorities */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
            <ArrowDownLeft className="h-4 w-4 text-sky-400" />
            Incoming Loan Strategy ({leagueLevelCalibration.competitionName})
          </h3>
          <span className="text-[11px] font-mono text-slate-400">
            Target parent clubs 1–2 tiers above {leagueLevelCalibration.competitionName}
          </span>
        </div>

        {loanAdvice.incomingLoanPriorities.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
            Your core 4-3-3 positional depth is already covered internally for{' '}
            <strong>{leagueLevelCalibration.competitionName}</strong>. Only add an
            incoming loanee if a higher-tier U21 becomes available at{' '}
            <strong>£0 fee / 0% wage share</strong> and clearly beats your{' '}
            <strong>
              {tierBenchmarks.firstTeamStarterFloor.toFixed(1)}★ starter floor
            </strong>{' '}
            (key attributes ≥ {leagueLevelCalibration.standoutAttrBaseline}/20) —
            never bring in paid rotation loanees who block your own U21 pathway.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {loanAdvice.incomingLoanPriorities.map((item) => (
              <div
                key={item.bucketCode}
                className="rounded-xl border border-sky-500/30 bg-slate-950/70 p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-sky-200">
                    {item.bucketCode} · {item.bucketLabel}
                  </span>
                  <span className="rounded bg-sky-500/15 border border-sky-500/35 px-2 py-0.5 text-[10px] font-mono font-semibold text-sky-300">
                    {item.reason}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {item.rationale}
                </p>
                <div className="text-[11px] font-mono text-emerald-300">
                  Terms: {item.recommendedWageSplitLabel}
                </div>
                <div className="text-[11px] text-slate-400">
                  Profile: {item.targetRoles}
                </div>
                {loanCandidatesCount > 0 && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => onJumpToLoanTargets(item.bucketCode)}
                      className="text-[11px] font-semibold text-sky-300 hover:text-sky-200 underline cursor-pointer"
                    >
                      Filter Scouted Loan Candidates for {item.bucketCode} →
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Outgoing Development Loans */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
            <ArrowUpRight className="h-4 w-4 text-emerald-400" />
            Outgoing Development Loans (Age 18–23 · Blocked Pathway)
          </h3>
          <span className="text-[11px] font-mono text-slate-400">
            Lock &ldquo;Regular Starter&rdquo; + Recall Clause
          </span>
        </div>

        {loanAdvice.developmentLoansOut.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
            No 18–23yo developing prospects need an outgoing loan right now —
            First-Team Ready U21s ({tierBenchmarks.firstTeamRotationFloor.toFixed(1)}★+)
            are needed in your matchday squad, and 15–17yo raw academy players
            develop best in U18/U21 training with mentoring.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {loanAdvice.developmentLoansOut.map((item) => (
              <div
                key={item.player.id}
                className="rounded-xl border border-emerald-500/30 bg-slate-950/70 p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(item.player)}
                    className="text-left text-xs font-bold text-white hover:text-emerald-300 transition cursor-pointer"
                  >
                    {item.player.name}{' '}
                    <span className="font-mono text-slate-400">
                      ({item.player.position}, {item.player.age}y)
                    </span>
                  </button>
                  <span className="font-mono text-xs font-bold text-amber-300">
                    {item.player.ability.toFixed(1)}★/{item.player.potential.toFixed(1)}★
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {item.rationale}
                </p>
                <div className="text-[11px] text-emerald-300 font-medium">
                  Action: {item.recommendedMove}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Wage-Relief Loan Fallbacks & Active Loans / Do-Not-Loan Guardrails */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-2.5">
          <h3 className="text-xs sm:text-sm font-bold text-amber-300">
            Wage-Relief Loan Fallbacks (If Cash Sales Stall)
          </h3>
          {loanAdvice.wageReliefLoanFallbacks.length === 0 ? (
            <p className="text-xs text-slate-400">
              No paid surplus seniors flagged for wage-relief loans.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-300">
                At <strong>{leagueLevelCalibration.clubTierLabel}</strong> level,
                rival clubs often hesitate to pay cash fees. If permanent bids do
                not land for these transfer-listed/surplus earners, offer via{' '}
                <strong>TransferRoom for Loan (50%–100% wage share)</strong> to
                cut weekly payroll burn immediately:
              </p>
              <div className="space-y-1.5">
                {loanAdvice.wageReliefLoanFallbacks.slice(0, 6).map((item) => (
                  <div
                    key={item.player.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPlayer(item.player)}
                      className="font-semibold text-white hover:text-amber-300 transition text-left cursor-pointer"
                    >
                      {item.player.name}{' '}
                      <span className="text-slate-400 font-mono">
                        ({item.primaryBucketCode}, {item.player.age}y)
                      </span>
                    </button>
                    <span className="font-mono font-bold text-amber-300 shrink-0">
                      £{item.player.wagePw.toLocaleString()}/wk
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-2.5">
          <h3 className="text-xs sm:text-sm font-bold text-rose-300 flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 text-rose-400" />
            Do NOT Loan Out Guardrails &amp; Active Loans
          </h3>
          {loanAdvice.doNotLoanGuardrails.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-300">
                Keep these U21 players in your first-team squad — they already
                start or cover senior departures:
              </p>
              {loanAdvice.doNotLoanGuardrails.slice(0, 6).map((item) => (
                <div
                  key={item.player.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-rose-500/25 bg-rose-950/15 px-3 py-1.5 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(item.player)}
                    className="font-semibold text-white hover:text-emerald-300 transition text-left cursor-pointer"
                  >
                    {item.player.name}{' '}
                    <span className="text-slate-400 font-mono">
                      ({item.player.ability.toFixed(1)}★, {item.player.age}y)
                    </span>
                  </button>
                  <span className="text-[10px] font-mono text-rose-200 truncate max-w-[180px]">
                    {item.tags.find((t) => t.startsWith('Promote')) || 'Core Starter'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {loanAdvice.activeLoansMonitor.length > 0 ? (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-semibold text-indigo-300">
                Currently On Loan ({loanAdvice.activeLoansMonitor.length})
              </div>
              {loanAdvice.activeLoansMonitor.map((item) => (
                <div
                  key={item.player.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-indigo-500/25 bg-indigo-950/15 px-3 py-1.5 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(item.player)}
                    className="font-semibold text-white hover:text-indigo-300 transition text-left cursor-pointer"
                  >
                    {item.player.name} ({item.player.position})
                  </button>
                  <span className="font-mono text-[11px] text-slate-300">
                    exp {item.player.expires}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            loanAdvice.doNotLoanGuardrails.length === 0 && (
              <p className="text-xs text-slate-400">
                0 active loans currently registered on the club sheet.
              </p>
            )
          )}
        </div>
      </div>
    </div>
  );
};
