import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import { formatMoney, formatWage, wagePeriodSuffix } from '../domain/filters';
import type { AppSettings, ClubLedgerLine, ClubRecord, PlayerRecord } from '../domain/types';

interface ClubDetailModalProps {
  club: ClubRecord | null;
  initialTab?: 'overview' | 'finances' | 'coefficients' | 'squad';
  squadPlayers: PlayerRecord[];
  settings: AppSettings;
  onSelectPlayer: (player: PlayerRecord) => void;
  onClose: () => void;
}

export function ClubDetailModal({
  club,
  initialTab = 'overview',
  squadPlayers,
  settings,
  onSelectPlayer,
  onClose,
}: ClubDetailModalProps) {
  const [tab, setTab] = useState<'overview' | 'finances' | 'coefficients' | 'squad'>(initialTab);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [expenditureOpen, setExpenditureOpen] = useState(false);

  if (!club) return null;

  function renderLedgerTable(lines: ClubLedgerLine[]) {
    if (lines.length === 0) {
      return (
        <p className="py-3 text-[12px] text-[#b2acbb]">
          No detailed ledger entries available in this snapshot.
        </p>
      );
    }
    return (
      <div className="mt-2 overflow-x-auto rounded-[5px] border border-[#39333f]">
        <table className="fm-grid-table w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="h-[34px] px-3 text-left">Category</th>
              <th className="h-[34px] px-3 text-right">This Month</th>
              <th className="h-[34px] px-3 text-right">Last Month</th>
              <th className="h-[34px] px-3 text-right">This Season</th>
              <th className="h-[34px] px-3 text-right">Last Season</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.category} className="border-b border-white/[0.04]">
                <td className="h-[32px] px-3 font-medium text-[#f0edf4]">{line.category}</td>
                <td className="h-[32px] px-3 text-right tabular-nums">
                  {formatMoney(line.thisMonth, settings)}
                </td>
                <td className="h-[32px] px-3 text-right tabular-nums">
                  {formatMoney(line.lastMonth, settings)}
                </td>
                <td className="h-[32px] px-3 text-right tabular-nums">
                  {formatMoney(line.thisSeason, settings)}
                </td>
                <td className="h-[32px] px-3 text-right tabular-nums">
                  {formatMoney(line.lastSeason, settings)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040308]/75 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="club-dialog-title"
    >
      <div className="flex h-[min(780px,calc(100dvh-32px))] w-full max-w-[1040px] flex-col overflow-hidden rounded-[8px] border border-[#d0c6db]/25 bg-[#121116] shadow-[0_24px_64px_rgba(0,0,0,0.65)]">
        {/* Header */}
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-[#39333f] bg-[#202128] px-6">
          <h2 id="club-dialog-title" className="fm-font-display text-[20px] font-bold text-[#f0edf4]">
            {club.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close club dialog"
            className="rounded p-1 text-[#b2acbb] hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div role="tablist" className="flex shrink-0 border-b border-[#39333f] px-6 overflow-x-auto">
          {(
            [
              { id: 'overview', label: 'Overview' },
              { id: 'finances', label: 'Finances' },
              { id: 'coefficients', label: 'Coefficients' },
              { id: 'squad', label: `Squad (${squadPlayers.length})` },
            ] as const
          ).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`relative h-[46px] whitespace-nowrap px-5 text-[13px] font-bold cursor-pointer ${
                  active ? 'bg-[#251f2d] text-[#dc87ff]' : 'text-[#b2acbb] hover:text-white'
                }`}
              >
                {t.label}
                {active && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#dc87ff]" />}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
          {tab === 'overview' && (
            <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
              {[
                { label: 'Name', value: club.name },
                { label: 'Competition', value: club.competition ?? '—' },
                { label: 'Nation', value: club.nation ?? '—' },
                {
                  label: 'Reputation',
                  value: club.reputation !== null ? String(club.reputation) : '—',
                },
                {
                  label: 'Training Facilities',
                  value:
                    club.trainingFacilities !== null ? String(club.trainingFacilities) : '—',
                },
                {
                  label: 'Youth Facilities',
                  value: club.youthFacilities !== null ? String(club.youthFacilities) : '—',
                },
                {
                  label: 'Youth Coaching',
                  value: club.youthCoaching !== null ? String(club.youthCoaching) : '—',
                },
                {
                  label: 'Youth Recruitment',
                  value: club.youthRecruitment !== null ? String(club.youthRecruitment) : '—',
                },
                {
                  label: 'Corporate Facilities',
                  value:
                    club.corporateFacilities !== null ? String(club.corporateFacilities) : '—',
                },
                { label: 'Unique ID', value: String(club.uniqueId) },
              ].map((field, idx) => (
                <div
                  key={field.label}
                  className={`flex items-baseline justify-between border-b border-[#39333f] px-3 py-3 ${
                    idx % 2 === 0 ? 'bg-white/[0.03]' : ''
                  }`}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#b2acbb]">
                    {field.label}
                  </span>
                  <span className="text-[14px] font-bold text-[#f0edf4] tabular-nums">
                    {field.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {tab === 'finances' && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                {[
                  { label: 'Balance', value: formatMoney(club.balance, settings) },
                  { label: 'Transfer Budget', value: formatMoney(club.transferBudget, settings) },
                  {
                    label: `Payroll Budget (${wagePeriodSuffix(settings)})`,
                    value: formatWage(club.payrollBudgetWeekly, settings),
                  },
                  {
                    label: `Current Wages Incl. Bonuses (${wagePeriodSuffix(settings)})`,
                    value: formatWage(club.currentWagesWeekly, settings),
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="flex items-baseline justify-between border-b border-[#39333f] bg-white/[0.03] px-3.5 py-3"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#b2acbb]">
                      {kpi.label}
                    </span>
                    <span className="text-[15px] font-bold text-[#f0edf4] tabular-nums">
                      {kpi.value}
                    </span>
                  </div>
                ))}
              </div>

              <div>
                <h3 className="text-[15px] font-bold text-[#faf5fc]">Club debts and loans</h3>
                <p className="mt-1 text-[13px] text-[#b2acbb]">
                  As of {club.financialDate ?? 'current save date'}
                </p>
                {club.loans.length === 0 ? (
                  <p className="mt-3 text-[13px] text-[#b2acbb]">No active club loans recorded.</p>
                ) : (
                  club.loans.map((loan, idx) => (
                    <div key={`${loan.type}-${idx}`} className="mt-4">
                      <h4 className="mb-3 text-[14px] font-bold text-[#f0edf4]">{loan.type}</h4>
                      <div className="grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
                        {[
                          { label: 'Original amount', value: formatMoney(loan.originalAmount, settings) },
                          { label: 'Repayments start', value: loan.repaymentsStart },
                          { label: 'Until', value: loan.until },
                          {
                            label: 'Payable (per month)',
                            value: formatMoney(loan.payablePerMonth, settings),
                          },
                          {
                            label: 'Interest component',
                            value: formatMoney(loan.interestComponent, settings),
                          },
                          {
                            label: 'Remaining principal',
                            value: formatMoney(loan.remainingPrincipal, settings),
                          },
                          {
                            label: 'Remaining interest',
                            value: formatMoney(loan.remainingInterest, settings),
                          },
                        ].map((row) => (
                          <div key={row.label} className="grid grid-cols-[150px_1fr] gap-2 text-[13px]">
                            <span className="font-semibold text-[#f0edf4]">{row.label}</span>
                            <span className="text-[#d4ced8] tabular-nums">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-[#39333f] pt-4">
                <h3 className="text-[15px] font-bold text-[#faf5fc]">Club income and expenditure</h3>
                <p className="mt-1 text-[13px] text-[#b2acbb]">
                  Club&apos;s own financial records as of {club.financialDate ?? '—'}.
                </p>

                <div className="mt-3 flex flex-col gap-2">
                  <div>
                    <button
                      type="button"
                      aria-expanded={incomeOpen}
                      onClick={() => setIncomeOpen((v) => !v)}
                      className="inline-flex items-center gap-2 py-1.5 text-[14px] font-semibold text-[#f0edf4] hover:text-[#dc87ff] cursor-pointer"
                    >
                      {incomeOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span>Income</span>
                    </button>
                    {incomeOpen && renderLedgerTable(club.income)}
                  </div>

                  <div>
                    <button
                      type="button"
                      aria-expanded={expenditureOpen}
                      onClick={() => setExpenditureOpen((v) => !v)}
                      className="inline-flex items-center gap-2 py-1.5 text-[14px] font-semibold text-[#f0edf4] hover:text-[#dc87ff] cursor-pointer"
                    >
                      {expenditureOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span>Expenditure</span>
                    </button>
                    {expenditureOpen && renderLedgerTable(club.expenditure)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'coefficients' && (
            <div className="flex flex-col gap-5">
              {!club.coefficients ? (
                <div className="rounded-[6px] border border-[#39333f] bg-[#18151e] p-6 text-center text-[13px] text-[#b2acbb]">
                  No UEFA / continental coefficient data decoded for {club.name} in this snapshot.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                    {[
                      {
                        label: 'Five-year coefficient',
                        value:
                          club.coefficients.fiveYearCoefficient !== null
                            ? club.coefficients.fiveYearCoefficient.toFixed(2)
                            : '—',
                      },
                      {
                        label: 'Five-year ranking',
                        value:
                          club.coefficients.fiveYearRank !== null
                            ? `#${club.coefficients.fiveYearRank}`
                            : '—',
                      },
                      {
                        label: 'Ten-year coefficient',
                        value:
                          club.coefficients.tenYearCoefficient !== null
                            ? club.coefficients.tenYearCoefficient.toFixed(2)
                            : '—',
                      },
                      {
                        label: 'Ten-year ranking',
                        value:
                          club.coefficients.tenYearRank !== null
                            ? `#${club.coefficients.tenYearRank}`
                            : '—',
                      },
                      {
                        label: 'Current-season points',
                        value:
                          club.coefficients.currentSeasonPoints !== null
                            ? club.coefficients.currentSeasonPoints.toFixed(2)
                            : '—',
                      },
                    ].map((c) => (
                      <div
                        key={c.label}
                        className="flex justify-between border-b border-[#39333f] bg-white/[0.03] px-3.5 py-3"
                      >
                        <span className="text-[11px] font-semibold uppercase text-[#b2acbb]">
                          {c.label}
                        </span>
                        <span className="text-[15px] font-bold text-[#ecc2ff] tabular-nums">
                          {c.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {club.coefficients.seasonBreakdown.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-[13px] font-bold uppercase tracking-[0.06em] text-[#b2acbb]">
                        Five-Season UEFA Points Breakdown
                      </h4>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {club.coefficients.seasonBreakdown.map((s) => (
                          <div
                            key={s.season}
                            className="rounded-[6px] border border-[#39333f] bg-[#1a151e] p-3 text-center"
                          >
                            <div className="text-[11px] font-semibold text-[#b2acbb]">{s.season}</div>
                            <div className="mt-1 text-[18px] font-bold text-[#faf5fc] tabular-nums">
                              {s.points.toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'squad' && (
            <div className="overflow-hidden rounded-[6px] border border-[#39333f]">
              <table className="fm-grid-table w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className="h-[38px] px-3 text-left">Name</th>
                    <th className="h-[38px] px-3 text-left">Position</th>
                    <th className="h-[38px] px-3 text-right">Age</th>
                    <th className="h-[38px] px-3 text-right">CA</th>
                    <th className="h-[38px] px-3 text-right">PA</th>
                  </tr>
                </thead>
                <tbody>
                  {squadPlayers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#b2acbb]">
                        No squad players loaded for this club.
                      </td>
                    </tr>
                  ) : (
                    squadPlayers.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => {
                          onClose();
                          onSelectPlayer(p);
                        }}
                        className="cursor-pointer border-b border-white/[0.04]"
                      >
                        <td className="h-[36px] px-3 font-semibold text-[#faf5fc]">{p.name}</td>
                        <td className="h-[36px] px-3">{p.positionText || '—'}</td>
                        <td className="h-[36px] px-3 text-right tabular-nums">
                          {p.age ?? '—'}
                        </td>
                        <td className="h-[36px] px-3 text-right tabular-nums">
                          {p.ca ?? '—'}
                        </td>
                        <td className="h-[36px] px-3 text-right tabular-nums">
                          {p.pa ?? '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex h-[58px] shrink-0 items-center justify-end border-t border-[#39333f] bg-[#202128] px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[36px] items-center rounded-[5px] border border-[#59515f] bg-[#2a2531] px-4 text-[13px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
