import React from 'react';
import { BookmarkPlus, ClipboardPlus, Download } from 'lucide-react';
import { CompareTrayToggle } from './CompareTrayToggle';
import type { PlayerRecord, ShortlistRecord } from '../types/fm27';
import type { PlayerCardAnalysis } from '../utils/playerCardAnalysis';
import type { CardIntelligenceSummary } from '../utils/cardIntelligenceEngine';

export interface PlayerQuickActionBarProps {
  player: PlayerRecord;
  isManagedClubPlayer: boolean;
  isTracked: boolean;
  shortlists: ShortlistRecord[];
  selectedShortlistId: string;
  onSelectShortlistId: (id: string) => void;
  exportFeedback: string | null;
  shortlistFeedback: string | null;
  onExportPng: () => void;
  onToggleTrack?: (player: PlayerRecord) => void;
  onAddRecruitment: (player: PlayerRecord) => void;
  onShortlistAdd: () => void;
}

/**
 * Touch-friendly (44px on mobile) player action bar that wraps cleanly at 360px
 * without overflowing or bloating the sticky modal header.
 */
export const PlayerQuickActionBar: React.FC<PlayerQuickActionBarProps> = ({
  player,
  isManagedClubPlayer,
  isTracked,
  shortlists,
  selectedShortlistId,
  onSelectShortlistId,
  exportFeedback,
  shortlistFeedback,
  onExportPng,
  onToggleTrack,
  onAddRecruitment,
  onShortlistAdd,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
      <button
        type="button"
        onClick={onExportPng}
        className="min-h-[44px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-500/35 bg-sky-500/15 hover:bg-sky-500/25 px-3 sm:px-2.5 py-1.5 text-xs font-semibold text-sky-300 transition cursor-pointer shrink-0"
        title="Export 1-Click Shareable FM27 Player Card (PNG)"
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span>{exportFeedback || 'Export PNG'}</span>
      </button>

      <CompareTrayToggle player={player} />

      {!isManagedClubPlayer && (
        <button
          type="button"
          onClick={() =>
            onToggleTrack ? onToggleTrack(player) : onAddRecruitment(player)
          }
          className={`min-h-[44px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 sm:px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer shrink-0 ${
            isTracked
              ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/50 text-emerald-300'
              : 'bg-indigo-500/15 hover:bg-indigo-500/25 border-indigo-500/30 text-indigo-300'
          }`}
        >
          <ClipboardPlus className="h-3.5 w-3.5 shrink-0" />
          <span>{isTracked ? '✓ Tracked' : '+ Track'}</span>
        </button>
      )}

      {shortlists.length > 0 && (
        <div className="flex items-center gap-1.5 min-w-0 flex-1 sm:flex-none">
          <select
            aria-label="Select shortlist"
            value={selectedShortlistId || shortlists[0]?.id || ''}
            onChange={(e) => onSelectShortlistId(e.target.value)}
            className="min-h-[44px] sm:min-h-[36px] min-w-0 flex-1 sm:flex-none sm:max-w-[160px] rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200"
          >
            {shortlists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onShortlistAdd}
            className="min-h-[44px] sm:min-h-[36px] inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-3 sm:px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition cursor-pointer shrink-0"
          >
            <BookmarkPlus className="h-3.5 w-3.5 shrink-0" />
            <span>{shortlistFeedback || 'Shortlist'}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export interface PlayerOverviewKpiStripProps {
  player: PlayerRecord;
  analysis: PlayerCardAnalysis;
  cardIntel: CardIntelligenceSummary | null;
  durabilityBadgeClass: string;
}

/**
 * Compact 2x2 (mobile) / 4-column (desktop) at-a-glance snapshot bar at the top
 * of Player Card Overview so Android users immediately see Form, DNA, Role Fit,
 * and Durability without scrolling through text walls.
 */
export const PlayerOverviewKpiStrip: React.FC<PlayerOverviewKpiStripProps> = ({
  player,
  analysis,
  cardIntel,
  durabilityBadgeClass,
}) => {
  const hasPlayed = analysis.seasonProduction.hasPlayed;
  const ratingText =
    hasPlayed && player.rating !== null && player.rating > 0
      ? player.rating.toFixed(2)
      : '—';
  const seasonSub = hasPlayed
    ? `${player.apps} apps · ${player.goals}G ${player.assists}A`
    : analysis.seasonProduction.mode === 'preseason_no_matches'
      ? 'Pre-season (0 apps)'
      : '0 competitive apps';

  const dnaPct = cardIntel ? cardIntel.dnaFitPct : analysis.clubDna.overallDnaScore;
  const bestIpPct = analysis.bestIpRole?.fitPct ?? null;
  const bestOopPct = analysis.bestOopRole?.fitPct ?? null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-2.5 min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Season Rating
        </div>
        <div className="mt-0.5 text-base sm:text-lg font-bold font-mono tabular-nums text-emerald-300">
          {ratingText}
        </div>
        <div className="text-[10px] text-slate-400 truncate">{seasonSub}</div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-2.5 min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Club DNA Fit
        </div>
        <div className="mt-0.5 text-base sm:text-lg font-bold font-mono tabular-nums text-sky-300">
          {dnaPct}%
        </div>
        <div className="text-[10px] text-slate-400 truncate">
          {analysis.clubDna.bestArchetypeLabel}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-2.5 min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Dual-Phase Fit
        </div>
        <div className="mt-0.5 text-base sm:text-lg font-bold font-mono tabular-nums text-white">
          {bestIpPct !== null ? `${bestIpPct}%` : '—'}
          <span className="text-xs font-normal text-slate-500"> / </span>
          <span className="text-sky-300">
            {bestOopPct !== null ? `${bestOopPct}%` : '—'}
          </span>
        </div>
        <div className="text-[10px] text-slate-400 truncate">
          IP / OOP natural fit
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-2.5 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">
            Durability
          </span>
          <span
            className={`rounded border px-1 py-0.25 text-[9px] font-semibold shrink-0 ${durabilityBadgeClass}`}
          >
            {analysis.physical.durability.tier}
          </span>
        </div>
        <div className="mt-0.5 text-base sm:text-lg font-bold font-mono tabular-nums text-slate-100">
          {analysis.physical.durability.stamina}
          <span className="text-xs font-normal text-slate-500"> / </span>
          {analysis.physical.durability.naturalFitness ?? '—'}
        </div>
        <div className="text-[10px] text-slate-400 truncate">
          Stamina / Nat Fit
        </div>
      </div>
    </div>
  );
};
