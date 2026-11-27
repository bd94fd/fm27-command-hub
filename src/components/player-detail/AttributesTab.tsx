/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { scorePlayerForFm27Role, type Fm27RoleItem } from '../../utils/fm27RoleMatcher';
import { attrColorClass, normalizeAttrKey, type AttrRowItem } from '../../utils/playerDetailFormat';
import type { PlayerRecord } from '../../types/fm27';
import type { FormTrend } from '../../types/fmSave';

export type MobileAttrGroup = 'all' | 'primary' | 'mental' | 'physical';

export interface AttributesTabProps {
  player: PlayerRecord;
  scoutBadges: string[];
  traits: string[];
  formTrend: FormTrend | null | undefined;
  isGoalkeeper: boolean;
  gkAttrs: AttrRowItem[];
  technicalAttrs: AttrRowItem[];
  mentalAttrs: AttrRowItem[];
  physicalAttrs: AttrRowItem[];
  highlightedKeys: { keySet: Set<string>; prefSet: Set<string> };
  scopedIpRoles: Fm27RoleItem[];
  scopedOopRoles: Fm27RoleItem[];
  effectiveIpRole: string;
  effectiveOopRole: string;
  naturalDefaults: { ipRole: string; oopRole: string };
  mobileAttrGroup: MobileAttrGroup;
  onMobileAttrGroupChange: (group: MobileAttrGroup) => void;
  onSelectIpRole: (role: string) => void;
  onSelectOopRole: (role: string) => void;
}

function AttributeRow({
  item,
  highlightedKeys,
}: {
  item: AttrRowItem;
  highlightedKeys: { keySet: Set<string>; prefSet: Set<string> };
}) {
  const norm = normalizeAttrKey(item.label);
  const isKey = highlightedKeys.keySet.has(norm);
  const isPref = !isKey && highlightedKeys.prefSet.has(norm);
  return (
    <div
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs border ${
        isKey
          ? 'bg-emerald-500/15 border-emerald-500/40'
          : isPref
            ? 'bg-sky-500/10 border-sky-500/30'
            : 'bg-slate-900/70 border-slate-800'
      }`}
    >
      <span className="text-slate-300 flex items-center gap-1.5">
        {isKey && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Key role attribute" />
        )}
        {isPref && (
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" title="Preferable role attribute" />
        )}
        {item.label}
      </span>
      <span className={`font-mono ${attrColorClass(item.value)}`}>
        {item.value !== null ? item.value : '—'}
      </span>
    </div>
  );
}

export function AttributesTab({
  player,
  scoutBadges,
  traits,
  formTrend,
  isGoalkeeper,
  gkAttrs,
  technicalAttrs,
  mentalAttrs,
  physicalAttrs,
  highlightedKeys,
  scopedIpRoles,
  scopedOopRoles,
  effectiveIpRole,
  effectiveOopRole,
  naturalDefaults,
  mobileAttrGroup,
  onMobileAttrGroupChange,
  onSelectIpRole,
  onSelectOopRole,
}: AttributesTabProps) {
  const renderAttrRow = (item: AttrRowItem) => (
    <AttributeRow key={item.label} item={item} highlightedKeys={highlightedKeys} />
  );

  return (
    <>
      {(scoutBadges.length > 0 ||
        traits.length > 0 ||
        (formTrend && formTrend.recentRatings.length > 0)) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
            <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">
              Scout Report Badges
            </div>
            <div className="flex flex-wrap gap-1.5">
              {scoutBadges.length > 0 ? (
                scoutBadges.map((badge) => (
                  <span
                    key={badge}
                    className={`rounded-md border px-2 py-0.5 text-micro font-semibold ${
                      badge === 'Injury-Prone'
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                        : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                    }`}
                  >
                    {badge}
                  </span>
                ))
              ) : (
                <span className="text-micro text-slate-500 italic">
                  No flagged scout traits
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
            <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">
              Last 5 Match Form
            </div>
            {formTrend && formTrend.recentRatings.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold font-mono text-white">
                    {formTrend.averageRating.toFixed(2)}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-2xs font-bold uppercase ${
                      formTrend.trend === 'improving'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : formTrend.trend === 'declining'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {formTrend.trend}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {formTrend.recentRatings.map((r, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-slate-900 border border-slate-700 px-1.5 py-0.5 text-2xs font-mono text-slate-300"
                    >
                      {r.toFixed(1)}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <span className="text-micro text-slate-500 italic">
                Awaiting match ratings
              </span>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
            <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">
              Player Traits
            </div>
            <div className="flex flex-wrap gap-1">
              {traits.length > 0 ? (
                traits.map((t, idx) => (
                  <span
                    key={`${t}-${idx}`}
                    className="rounded-md bg-slate-800/70 border border-slate-700 px-2 py-0.5 text-micro text-slate-200"
                  >
                    {t}
                  </span>
                ))
              ) : (
                <span className="text-micro text-slate-500 italic">
                  No player traits recorded
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* IP / OOP role highlight selector with live Fit % */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
        <div className="min-w-0">
          <label className="block text-micro font-semibold uppercase tracking-wider text-emerald-400 mb-1">
            In-Possession (IP) Role Highlight
          </label>
          <select
            value={effectiveIpRole}
            onChange={(e) => onSelectIpRole(e.target.value)}
            className="w-full min-h-[44px] sm:min-h-[36px] rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200"
          >
            {scopedIpRoles.map((r) => {
              const pct = scorePlayerForFm27Role(player, r);
              const isAssigned = r.name === naturalDefaults.ipRole;
              return (
                <option key={`ip-${r.name}`} value={r.name}>
                  {r.name} ({pct}% Fit){isAssigned ? ' · Assigned' : ''}
                </option>
              );
            })}
          </select>
        </div>
        <div className="min-w-0">
          <label className="block text-micro font-semibold uppercase tracking-wider text-sky-400 mb-1">
            Out-of-Possession (OOP) Role Highlight
          </label>
          <select
            value={effectiveOopRole}
            onChange={(e) => onSelectOopRole(e.target.value)}
            className="w-full min-h-[44px] sm:min-h-[36px] rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200"
          >
            {scopedOopRoles.map((r) => {
              const pct = scorePlayerForFm27Role(player, r);
              const isAssigned = r.name === naturalDefaults.oopRole;
              return (
                <option key={`oop-${r.name}`} value={r.name}>
                  {r.name} ({pct}% Fit){isAssigned ? ' · Assigned' : ''}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Mobile-only attribute pillar filter so Android users don't scroll 36 rows */}
      <div className="grid grid-cols-4 gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1 md:hidden">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'primary', label: isGoalkeeper ? 'GK' : 'Tech' },
            { id: 'mental', label: 'Mental' },
            { id: 'physical', label: 'Phys' },
          ] as const
        ).map((grp) => (
          <button
            key={grp.id}
            type="button"
            onClick={() => onMobileAttrGroupChange(grp.id)}
            className={`min-h-[40px] rounded-lg text-xs font-semibold transition cursor-pointer ${
              mobileAttrGroup === grp.id
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            {grp.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className={`space-y-1.5 ${
            mobileAttrGroup !== 'all' && mobileAttrGroup !== 'primary' ? 'hidden md:block' : ''
          }`}
        >
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            {isGoalkeeper ? 'Goalkeeping (11)' : 'Technical (14)'}
          </h4>
          {(isGoalkeeper ? gkAttrs : technicalAttrs).map(renderAttrRow)}
        </div>
        <div
          className={`space-y-1.5 ${
            mobileAttrGroup !== 'all' && mobileAttrGroup !== 'mental' ? 'hidden md:block' : ''
          }`}
        >
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Mental (14)
          </h4>
          {mentalAttrs.map(renderAttrRow)}
        </div>
        <div
          className={`space-y-1.5 ${
            mobileAttrGroup !== 'all' && mobileAttrGroup !== 'physical' ? 'hidden md:block' : ''
          }`}
        >
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Physical (8)
          </h4>
          {physicalAttrs.map(renderAttrRow)}
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400 space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Key role attribute</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span>Preferable role attribute</span>
            </div>
            <div className="text-micro text-slate-500 pt-1">
              “—” means that attribute wasn&apos;t included in this import.
            </div>
          </div>
        </div>
      </div>

      {isGoalkeeper && (
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Technical Outfield Attributes (14)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {technicalAttrs.map(renderAttrRow)}
          </div>
        </div>
      )}
    </>
  );
}
