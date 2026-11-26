import React, { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  GitCompare,
  MessageSquare,
  Search,
  Sparkles,
} from 'lucide-react';
import type { RecruitmentTarget } from '../../types/fmSave';
import type {
  ShortlistAuditSummary,
  ShortlistRecommendationTier,
  ShortlistTargetAdvice,
} from '../../utils/shortlistAdviceEngine';
import { isScoutTargetTracked } from '../../services/fmStorage';
import { getPositionRelevantAttributes } from '../../utils/recruitmentHelpers';
import { formatAge, formatNation } from '../../utils/squadViewHelpers';
import { nextWindowLimit, takeLeadingWindow } from '../../utils/listWindow';

type ShortlistFilterKey =
  | 'ALL'
  | 'ACTIONABLE'
  | ShortlistRecommendationTier
  | 'LOAN'
  | 'PINNED';

const SHORTLIST_PAGE_SIZE = 30;

interface ShortlistViewProps {
  shortlistAudit: ShortlistAuditSummary;
  trackedTargets: RecruitmentTarget[];
  initialFilter?: ShortlistFilterKey;
  onAskAnalyst?: (prompt: string) => void;
  handleAskAnalystCompareShortlist: () => void;
  handleOpenTargetCard: (target: RecruitmentTarget) => void;
  setCompareTarget: (target: RecruitmentTarget | null) => void;
  handleToggleTrack: (target: RecruitmentTarget) => void;
  handleToggleCompareTray: (target: RecruitmentTarget) => void;
  compareTrayTargets: RecruitmentTarget[];
}

const TIER_BADGE_CLASSES: Record<ShortlistTargetAdvice['badgeTone'], string> = {
  emerald: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/45',
  sky: 'bg-sky-500/20 text-sky-200 border-sky-500/45',
  teal: 'bg-teal-500/20 text-teal-200 border-teal-500/45',
  purple: 'bg-purple-500/20 text-purple-200 border-purple-500/45',
  amber: 'bg-amber-500/20 text-amber-200 border-amber-500/45',
  slate: 'bg-slate-800 text-slate-300 border-slate-700',
};

export const ShortlistView: React.FC<ShortlistViewProps> = ({
  shortlistAudit,
  trackedTargets,
  initialFilter = 'ALL',
  onAskAnalyst,
  handleAskAnalystCompareShortlist,
  handleOpenTargetCard,
  setCompareTarget,
  handleToggleTrack,
  handleToggleCompareTray,
  compareTrayTargets,
}) => {
  const [tierFilter, setTierFilter] = useState<ShortlistFilterKey>(initialFilter);
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shortlistAudit.items.filter((item) => {
      if (tierFilter === 'ACTIONABLE' && !item.isActionable) return false;
      if (tierFilter === 'LOAN' && item.budget.dealRoute !== 'loan_option') return false;
      if (
        tierFilter === 'PINNED' &&
        !isScoutTargetTracked(trackedTargets, item.target)
      ) {
        return false;
      }
      if (
        tierFilter !== 'ALL' &&
        tierFilter !== 'ACTIONABLE' &&
        tierFilter !== 'LOAN' &&
        tierFilter !== 'PINNED' &&
        item.tier !== tierFilter
      ) {
        return false;
      }
      if (posFilter !== 'ALL' && item.bucketCode !== posFilter) return false;
      if (q) {
        const hay = `${item.target.name} ${item.target.primaryPosition} ${item.target.currentClub || ''} ${item.character.personalityLabel} ${item.headline}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [shortlistAudit.items, tierFilter, posFilter, search, trackedTargets]);

  // A save can carry hundreds of shortlisted players, and each card is heavy, so
  // render a page at a time instead of the whole shortlist at once.
  const [visibleLimit, setVisibleLimit] = useState(SHORTLIST_PAGE_SIZE);
  useEffect(() => {
    setVisibleLimit(SHORTLIST_PAGE_SIZE);
  }, [tierFilter, posFilter, search]);
  const visibleItems = useMemo(
    () => takeLeadingWindow(filteredItems, visibleLimit),
    [filteredItems, visibleLimit]
  );

  return (
    <div className="space-y-3">
      {/* Header Strip */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
            <Bookmark className="h-4 w-4 text-emerald-400" />
            Your In-Game FM27 Shortlist ({shortlistAudit.items.length})
            {shortlistAudit.actionableCount > 0 && (
              <span className="rounded-md bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[11px] font-mono text-emerald-200">
                {shortlistAudit.actionableCount} Budget-Ready Moves
              </span>
            )}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Pulled strictly from your `.fm` save shortlist · Ranked by Direct First-Team Upgrades, Immediate Gaps, Cheaper Backups &amp; Future U23 Succession under your Strict Club Budget Gate.
          </p>
        </div>
        <button
          type="button"
          disabled={shortlistAudit.items.length === 0 || !onAskAnalyst}
          onClick={handleAskAnalystCompareShortlist}
          className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-40 border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition cursor-pointer"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Ask Analyst to Rank Shortlist
        </button>
      </div>

      {/* Filter Pills + Position + Search */}
      {shortlistAudit.items.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'ALL', label: `All (${shortlistAudit.items.length})` },
                { id: 'ACTIONABLE', label: `Budget-Ready (${shortlistAudit.actionableCount})` },
                { id: 'direct_xi_upgrade', label: `Direct XI Upgrades (${shortlistAudit.directUpgrades.length})` },
                { id: 'fills_gap_now', label: `Fills Gap Now (${shortlistAudit.gapFillersNow.length})` },
                { id: 'cheaper_squad_upgrade', label: `Cheaper Backups (${shortlistAudit.cheaperBackups.length})` },
                { id: 'future_succession', label: `Future U23 (${shortlistAudit.futureSuccessors.length})` },
                { id: 'monitor_budget_blocked', label: `Watch · Blocked (${shortlistAudit.budgetBlocked.length})` },
                { id: 'LOAN', label: `Loans (${shortlistAudit.loanViableTargets.length})` },
                { id: 'PINNED', label: `★ Pinned (${trackedTargets.length})` },
              ] as const
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setTierFilter(pill.id)}
                className={`min-h-[34px] rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition cursor-pointer ${
                  tierFilter === pill.id
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/45'
                    : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value)}
              className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 sm:w-40"
              aria-label="Filter shortlist by position"
            >
              <option value="ALL">All Positions</option>
              {(['GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'W', 'ST'] as const).map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search player, club, personality, position…"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Empty State or Cards */}
      {shortlistAudit.items.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center space-y-1.5 text-xs text-slate-400">
          <div className="text-sm font-bold text-slate-200">
            No In-Game Shortlist Players Found in This Save
          </div>
          <p className="max-w-md mx-auto">
            Add players to your Shortlist in Football Manager 27, save your game, and drop the updated `.fm` file in the Hub tab. The app will automatically scan them for Direct XI Upgrades, Gap Fillers, and Future U23 Successors.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
          No shortlisted players match the active filter. Try switching back to <strong>All</strong>.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleItems.map((item) => {
            const { target } = item;
            const isPinned = isScoutTargetTracked(trackedTargets, target);
            const inCompareTray = compareTrayTargets.some((t) => t.uid === target.uid);
            const relevantAttributes = getPositionRelevantAttributes(target);

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
                className={`rounded-xl border p-3.5 sm:p-4 space-y-2.5 text-left transition cursor-pointer hover:border-emerald-400/60 ${
                  item.tier === 'direct_xi_upgrade'
                    ? 'border-emerald-500/45 bg-emerald-950/15'
                    : item.tier === 'fills_gap_now'
                      ? 'border-sky-500/40 bg-sky-950/15'
                      : item.tier === 'monitor_budget_blocked'
                        ? 'border-amber-500/35 bg-amber-950/10'
                        : 'border-slate-800 bg-slate-900/75'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white truncate">
                      {target.name}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate">
                      {formatAge(target.age)}y · {formatNation(target.nationality)} ·{' '}
                      <span className="font-mono font-semibold text-emerald-300">
                        {target.primaryPosition}
                      </span>{' '}
                      · {target.currentClub || 'Free Agent'}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold ${TIER_BADGE_CLASSES[item.badgeTone]}`}
                  >
                    {item.tierLabel}
                  </span>
                </div>

                {/* 4-KPI Grid */}
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 min-w-0">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 truncate">
                      FM27 Role Fit
                    </div>
                    <div className="mt-0.5 font-semibold text-emerald-300 truncate">
                      {item.ipRoleFitPct}% · {item.bestIpRole}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 min-w-0">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 truncate">
                      Personality
                    </div>
                    <div className="mt-0.5 font-semibold text-sky-200 truncate">
                      {item.character.personalityLabel}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 min-w-0">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 truncate">
                      Deal / Fee
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] font-semibold text-slate-200 truncate">
                      {item.budget.feeLabel}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 min-w-0">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 truncate">
                      Wage vs Squad
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] font-semibold text-amber-300 truncate">
                      £{item.budget.expectedWagePw.toLocaleString()}/wk
                      {item.budget.netWeeklyWageDelta !== null
                        ? ` (${item.budget.netWeeklyWageDelta <= 0 ? '' : '+'}£${item.budget.netWeeklyWageDelta})`
                        : ''}
                    </div>
                  </div>
                </div>

                {/* 4 Position-Relevant Attributes */}
                <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
                  {relevantAttributes.map((attrChip) => (
                    <div
                      key={attrChip.label}
                      className="rounded-lg bg-slate-950/80 border border-slate-800 px-1.5 py-1.5 min-w-0"
                    >
                      <div className="text-[9px] uppercase tracking-wider text-slate-400 truncate">
                        {attrChip.label}
                      </div>
                      <div
                        className={`text-xs tabular-nums ${
                          attrChip.value >= 14
                            ? 'text-emerald-300 font-bold'
                            : attrChip.value >= 11
                              ? 'text-slate-100 font-semibold'
                              : 'text-slate-400'
                        }`}
                      >
                        {attrChip.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Plain-English Now/Why Strip */}
                <div className="rounded-lg border border-slate-800/90 bg-slate-950/75 px-2.5 py-2 text-[11px] space-y-1">
                  <div className="font-semibold text-slate-100 flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-emerald-400 shrink-0" />
                    <span className="truncate">{item.headline}</span>
                  </div>
                  <p className="line-clamp-2 text-slate-300 leading-snug">
                    {item.howFitsNow}
                  </p>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleCompareTray(target);
                    }}
                    className={`min-h-[40px] sm:min-h-[32px] inline-flex items-center justify-center rounded-lg border px-2 py-1 text-[11px] font-semibold transition cursor-pointer ${
                      inCompareTray
                        ? 'bg-amber-500/25 border-amber-400/60 text-amber-200'
                        : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700 text-slate-300'
                    }`}
                  >
                    {inCompareTray ? 'In Tray' : '+ Tray'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCompareTarget(target);
                    }}
                    className="min-h-[40px] sm:min-h-[32px] inline-flex items-center justify-center gap-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 px-2 py-1 text-[11px] font-semibold text-sky-300 transition cursor-pointer"
                  >
                    <GitCompare className="h-3 w-3 shrink-0" />
                    <span>Compare</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleTrack(target);
                    }}
                    className={`min-h-[40px] sm:min-h-[32px] inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition cursor-pointer ${
                      isPinned
                        ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                        : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/35 text-emerald-300'
                    }`}
                  >
                    {isPinned ? (
                      <>
                        <BookmarkCheck className="h-3 w-3 shrink-0" /> ★ Pinned
                      </>
                    ) : (
                      <>★ Pin</>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filteredItems.length > visibleItems.length && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-slate-400">
            Showing {visibleItems.length} of {filteredItems.length} shortlisted players
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setVisibleLimit((prev) =>
                  nextWindowLimit(prev, SHORTLIST_PAGE_SIZE, filteredItems.length)
                )
              }
              className="min-h-[44px] sm:min-h-[32px] px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer transition"
            >
              Show {SHORTLIST_PAGE_SIZE} More
            </button>
            <button
              type="button"
              onClick={() => setVisibleLimit(filteredItems.length)}
              className="min-h-[44px] sm:min-h-[32px] px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/15 text-emerald-200 border border-emerald-500/30 hover:bg-emerald-600/25 cursor-pointer transition"
            >
              Show All ({filteredItems.length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
