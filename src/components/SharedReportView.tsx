/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Read-only view of a shared summary. It renders only the values carried in the link,
 * never reads the local save, and never writes anything.
 */

import React from 'react';
import { Eye, ShieldCheck } from 'lucide-react';
import type { ShareSummary } from '../utils/shareSummary';
import { formatClubMoney } from '../utils/clubFinances';

interface SharedReportViewProps {
  summary: ShareSummary | null;
  rawToken: string;
  onOpenOwnHub: () => void;
}

const statCard = 'rounded-xl border border-slate-700 bg-slate-900/70 p-3';
const statLabel = 'text-micro font-semibold uppercase tracking-wider text-slate-400';
const statValue = 'mt-1 text-lg font-semibold text-slate-100 tabular-nums';

export const SharedReportView: React.FC<SharedReportViewProps> = ({
  summary,
  rawToken,
  onOpenOwnHub,
}) => {
  if (!summary) {
    return (
      <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-xl p-5 space-y-4">
          <h1 className="text-lg font-semibold">This link is not valid</h1>
          <p className="text-sm text-slate-300">
            The shared report could not be read. It may have been cut short by the app it was sent
            through. Ask the sender for a fresh link.
          </p>
          <p className="text-micro text-slate-500 break-all">Link data: {rawToken.slice(0, 24)}…</p>
          <button
            type="button"
            onClick={onOpenOwnHub}
            className="min-h-[48px] w-full rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition-colors cursor-pointer"
          >
            Open FM27 Command Hub
          </button>
        </div>
      </div>
    );
  }

  const stats: Array<{ label: string; value: string }> = [
    { label: 'Squad', value: String(summary.squad) },
    { label: 'Staff', value: String(summary.staff) },
    {
      label: 'Wage bill',
      value: summary.wageBillPw === null ? '--' : `${formatClubMoney(summary.wageBillPw)}/wk`,
    },
    {
      label: 'Wage budget',
      value: summary.wageBudgetPw === null ? '--' : `${formatClubMoney(summary.wageBudgetPw)}/wk`,
    },
    { label: 'Balance', value: formatClubMoney(summary.balance) },
    { label: 'Runway', value: summary.runway || '--' },
  ];

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-xl p-4 sm:p-6 space-y-5">
        <header className="space-y-1">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-1 text-micro font-semibold uppercase tracking-wider text-indigo-200">
            <Eye className="w-3.5 h-3.5" />
            Shared report · read only
          </p>
          <h1 className="text-xl font-bold text-white">{summary.club}</h1>
          <p className="text-sm text-slate-400">
            {summary.saveDate || 'Save date not shared'}
            {summary.created ? ` · shared ${summary.created}` : ''}
          </p>
        </header>

        <section aria-label="Club summary" className="grid grid-cols-2 gap-2">
          {stats.map((stat) => (
            <div key={stat.label} className={statCard}>
              <div className={statLabel}>{stat.label}</div>
              <div className={statValue}>{stat.value}</div>
            </div>
          ))}
        </section>

        {summary.top.length > 0 && (
          <section aria-label="Highest rated players" className="space-y-2">
            <h2 className="text-micro font-semibold uppercase tracking-wider text-slate-400">
              Highest rated players
            </h2>
            <ul className="divide-y divide-slate-800 rounded-xl border border-slate-700 bg-slate-900/70">
              {summary.top.map((player) => (
                <li
                  key={`${player.n}-${player.r}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <span className="min-w-0 truncate text-sm text-slate-100">{player.n}</span>
                  <span className="shrink-0 text-sm font-semibold text-emerald-300 tabular-nums">
                    {player.r}
                    <span className="ml-1.5 text-micro font-normal text-slate-400">
                      {player.p}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="flex items-start gap-2 rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-micro text-slate-400">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
          <span>
            This page only shows what the sender chose to share. It is not your save, it does not
            load anything from this device, and opening it changes nothing.
          </span>
        </p>

        <button
          type="button"
          onClick={onOpenOwnHub}
          className="min-h-[48px] w-full rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition-colors cursor-pointer"
        >
          Open FM27 Command Hub
        </button>
      </div>
    </div>
  );
};
