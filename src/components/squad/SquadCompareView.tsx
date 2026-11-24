import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { PlayerRecord } from '../../types/fm27';
import { AttributeRadarChart } from '../FootballAnalyticsCharts';
import { COMPARE_ROWS } from './squadTableConfig';

interface SquadCompareViewProps {
  players: PlayerRecord[];
  comparePlayerA: PlayerRecord | null;
  comparePlayerB: PlayerRecord | null;
  setCompareAId: Dispatch<SetStateAction<string>>;
  setCompareBId: Dispatch<SetStateAction<string>>;
}

export const SquadCompareView: React.FC<SquadCompareViewProps> = ({
  players,
  comparePlayerA,
  comparePlayerB,
  setCompareAId,
  setCompareBId,
}) => {
  return (
    <div className="mt-4 space-y-5">
      {players.length < 2 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          Load at least 2 players to run a side-by-side radar comparison.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">
                Player A (Emerald)
              </label>
              <select
                aria-label="Select Player A to compare"
                value={comparePlayerA?.id || ''}
                onChange={(e) => setCompareAId(e.target.value)}
                className="w-full min-h-[44px] sm:min-h-[38px] px-3 py-2 text-xs bg-slate-950 border border-emerald-500/40 rounded-lg text-slate-100"
              >
                {players.map((p) => (
                  <option key={`a-${p.id}`} value={p.id}>
                    {p.name} ({p.position} · {p.ability.toFixed(1)}★ · £{p.wagePw}/wk)
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-sky-400 mb-1">
                Player B (Sky Blue)
              </label>
              <select
                aria-label="Select Player B to compare"
                value={comparePlayerB?.id || ''}
                onChange={(e) => setCompareBId(e.target.value)}
                className="w-full min-h-[44px] sm:min-h-[38px] px-3 py-2 text-xs bg-slate-950 border border-sky-500/40 rounded-lg text-slate-100"
              >
                {players.map((p) => (
                  <option key={`b-${p.id}`} value={p.id}>
                    {p.name} ({p.position} · {p.ability.toFixed(1)}★ · £{p.wagePw}/wk)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {comparePlayerA && comparePlayerB && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
              <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 flex justify-center min-w-0">
                <AttributeRadarChart
                  player={comparePlayerA}
                  comparePlayer={comparePlayerB}
                  size={280}
                />
              </div>
              <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 overflow-x-auto min-w-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-2 text-left">Attribute</th>
                      <th className="py-2 px-1.5 text-right text-emerald-300 max-w-[92px] sm:max-w-none truncate">
                        {comparePlayerA.name}
                      </th>
                      <th className="py-2 px-1.5 text-right text-sky-300 max-w-[92px] sm:max-w-none truncate">
                        {comparePlayerB.name}
                      </th>
                      <th className="py-2 pl-1.5 text-right whitespace-nowrap">Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-mono">
                    {COMPARE_ROWS.map((row) => {
                      const va = Number(comparePlayerA.attributes?.[row.key] ?? 10);
                      const vb = Number(comparePlayerB.attributes?.[row.key] ?? 10);
                      const diff = va - vb;
                      return (
                        <tr key={row.key}>
                          <td className="py-1.5 font-sans text-slate-300">
                            {row.label}
                          </td>
                          <td className="py-1.5 text-right text-emerald-300 font-semibold">
                            {va}
                          </td>
                          <td className="py-1.5 text-right text-sky-300 font-semibold">
                            {vb}
                          </td>
                          <td
                            className={`py-1.5 text-right font-bold ${
                              diff > 0
                                ? 'text-emerald-400'
                                : diff < 0
                                  ? 'text-rose-400'
                                  : 'text-slate-500'
                            }`}
                          >
                            {diff > 0 ? `+${diff}` : diff}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
