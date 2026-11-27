/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { pitchBadgeClass, tierBadgeClass } from '../../utils/playerDetailFormat';
import { PITCH_ROWS, getPositionScore } from '../../utils/pitchFamiliarity';
import type { PlayerCardAnalysis, RankedRoleFit } from '../../utils/playerCardAnalysis';
import type { PlayerRecord } from '../../types/fm27';

export interface RolesTabProps {
  player: PlayerRecord;
  analysis: PlayerCardAnalysis;
}

function RoleList({ title, roles, accent }: { title: string; roles: RankedRoleFit[]; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 sm:p-4 space-y-2.5">
      <h4 className={`text-xs font-bold uppercase tracking-wider ${accent}`}>{title}</h4>
      <div className="space-y-1.5">
        {roles.map((r) => (
          <div
            key={r.role.name}
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs"
          >
            <span className="font-medium text-slate-200 min-w-0 truncate">{r.role.name}</span>
            <span
              className={`rounded-md border px-2 py-0.5 text-2xs font-mono font-semibold shrink-0 ${tierBadgeClass(
                r.tier
              )}`}
            >
              {r.fitPct}% · {r.tier}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RolesTab({ player, analysis }: RolesTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
      <div className="rounded-xl border border-emerald-900/50 bg-gradient-to-b from-emerald-950/40 to-slate-950 p-3.5 sm:p-4 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300 text-center">
          FM27 Positional Familiarity Map
        </h4>
        <div className="space-y-2.5">
          {PITCH_ROWS.map((row, rIdx) => (
            <div key={rIdx} className="flex items-center justify-center gap-2 sm:gap-3">
              {row.map((pos) => {
                const score = getPositionScore(player, pos.code);
                return (
                  <div
                    key={pos.code}
                    className={`w-16 rounded-lg border px-2 py-1.5 text-center ${pitchBadgeClass(
                      score
                    )}`}
                  >
                    <div className="text-micro font-bold">{pos.label}</div>
                    <div className="text-2xs font-mono opacity-80">{score}/20</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className="text-2xs text-slate-400 text-center">
          18–20 = Natural · 15–17 = Accomplished · 12–14 = Competent
        </p>
      </div>

      <div className="space-y-3">
        <RoleList title="Top In-Possession (IP) Roles" roles={analysis.topIpRoles} accent="text-emerald-400" />
        <RoleList
          title="Top Out-of-Possession (OOP) Roles"
          roles={analysis.topOopRoles}
          accent="text-sky-400"
        />

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 sm:p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Scout &amp; Tactical Notes
          </h4>
          <p className="text-xs text-slate-300 leading-relaxed">
            {player.notes || 'Synced directly from FM27 save.'}
          </p>
        </div>
      </div>
    </div>
  );
}
