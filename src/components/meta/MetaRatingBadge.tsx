/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Interactive Meta rating pill. Hovering opens an anchored explanation on
 * pointer devices, tapping opens the same explanation as a bottom sheet on
 * phones, so the score is never a mystery number.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import type { PlayerRecord } from '../../types/fm27';
import {
  evaluatePlayerMetaScore,
  FM_ARENA_GK_META_WEIGHTS,
  FM_ARENA_OUTFIELD_META_WEIGHTS,
  type PlayerMetaEvaluation,
} from '../../utils/metaScoreEngine';
import { MobileSheetFrame } from '../MobileSheetFrame';

export const META_TIER_LEGEND: Array<{
  tier: PlayerMetaEvaluation['tier'];
  range: string;
}> = [
  { tier: 'Elite', range: '14.5 and above' },
  { tier: 'Strong', range: '12.5 to 14.4' },
  { tier: 'Solid', range: '10.5 to 12.4' },
  { tier: 'Below Par', range: 'under 10.5' },
];

const OUTSIDE_TOP_WEIGHTS = [
  'pace',
  'acceleration',
  'jumpingReach',
  'dribbling',
  'balance',
] as const;

interface MetaRatingBadgeProps {
  player: PlayerRecord;
  className?: string;
}

const matchesMedia = (query: string): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;

const isSmallViewport = (): boolean => matchesMedia('(max-width: 639px)');

const supportsHover = (): boolean =>
  matchesMedia('(hover: hover) and (pointer: fine)');

const POPOVER_WIDTH = 360;

const MetaExplainer: React.FC<{
  player: PlayerRecord;
  meta: PlayerMetaEvaluation;
  onClose: () => void;
  showCloseButton: boolean;
  /** The mobile sheet header already shows the player name. */
  showPlayerName?: boolean;
}> = ({ player, meta, onClose, showCloseButton, showPlayerName = true }) => {
  const current = meta.metaScore ?? 0;
  const potential = meta.paMetaScore ?? current;
  const topWeights = useMemo(
    () =>
      OUTSIDE_TOP_WEIGHTS.map((key) => ({
        key,
        label: key.replace(/([A-Z])/g, ' $1').toLowerCase(),
        weight: FM_ARENA_OUTFIELD_META_WEIGHTS[key] ?? 0,
        value: player.attributes[key],
      })).filter((entry) => typeof entry.value === 'number'),
    [player]
  );

  return (
    <div className="space-y-3 text-slate-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
            Meta rating explained
          </div>
          <h3 className="text-sm font-bold text-white mt-0.5 break-words">
            {showPlayerName ? `${player.name}: ` : ''}
            {current.toFixed(1)} now
            {potential > current ? `, up to ${potential.toFixed(1)} at full potential` : ''}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Tier {meta.tier}
            {meta.isGoalkeeper ? ' · goalkeeper weights' : ' · outfield weights'}
          </p>
        </div>
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Meta rating explanation"
            className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
          What the score measures
        </h4>
        <p className="mt-1 text-[11px] leading-snug text-slate-300">
          A single 1 to 20 score for how much a player adds in the match
          engine. We weight the attributes that FM-Arena match testing rates as
          most influential, then average the result.
        </p>
        <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
          Outfield weights lead with pace (20.5), acceleration (20.4), jumping
          reach (11.6), dribbling (9.8) and balance (5.3). Keepers lead with
          reflexes (12.8), agility (8.0), acceleration (4.7), pace (3.5) and
          aerial reach (3.4).
        </p>
        {!meta.isGoalkeeper && topWeights.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-400">
            {topWeights.map((entry) => (
              <li key={entry.key} className="flex items-center justify-between gap-2">
                <span className="capitalize truncate">{entry.label}</span>
                <span className="font-mono text-slate-300 shrink-0">
                  {entry.value} × {entry.weight.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
          Pot is the ceiling if the player reaches full potential. We take the
          gap between current and potential ability stars, multiply by 1.15, and
          scale it by age: full uplift to 21, 65% to 24, then 25%. The result
          stops at 20.
        </p>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
          How it differs from other scores
        </h4>
        <dl className="mt-1 space-y-1.5 text-[11px] leading-snug">
          <div>
            <dt className="font-semibold text-sky-300">Best Fit %</dt>
            <dd className="text-slate-400">
              Tactical role suitability. The role engine scores how well the
              player suits a job in and out of possession. A strong role fit
              does not always mean a high Meta score, because roles weight
              attributes differently.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-amber-300">Star ratings</dt>
            <dd className="text-slate-400">
              Ability and potential measured against your own squad. Five stars
              is your best player, not a global benchmark, so two clubs rate the
              same player differently.
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
          Tier legend
        </h4>
        <ul className="mt-1 space-y-1 text-[11px]">
          {META_TIER_LEGEND.map((entry) => {
            const isCurrent = entry.tier === meta.tier;
            return (
              <li
                key={entry.tier}
                className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 ${
                  isCurrent ? 'bg-emerald-500/15 text-emerald-200' : 'text-slate-400'
                }`}
              >
                <span className="font-semibold">{entry.tier}</span>
                <span className="font-mono">{entry.range}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          The weights follow public FM-Arena testing, so treat them as a guide
          rather than official Sports Interactive data. Meta and Pot stay the
          same whatever tactic you pick. Best Fit % and stars do not.
        </p>
      </section>
    </div>
  );
};

export const MetaRatingBadge: React.FC<MetaRatingBadgeProps> = ({
  player,
  className = '',
}) => {
  const meta = useMemo(() => evaluatePlayerMetaScore(player), [player]);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [asSheet, setAsSheet] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPinned(false);
  }, []);

  const openFromAnchor = useCallback(() => {
    if (isSmallViewport()) {
      setAsSheet(true);
      setOpen(true);
      return;
    }
    setAsSheet(false);
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(POPOVER_WIDTH, window.innerWidth - 16);
      setPosition({
        top: Math.min(rect.bottom + 8, window.innerHeight - 80),
        left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
      });
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open || asSheet) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    };
    const reposition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(POPOVER_WIDTH, window.innerWidth - 16);
      setPosition({
        top: Math.min(rect.bottom + 8, window.innerHeight - 80),
        left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
      });
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, asSheet, close]);

  if (meta.metaScore === null) return null;

  const hasProjection =
    meta.paMetaScore !== null && meta.paMetaScore > meta.metaScore;
  const width = Math.min(
    POPOVER_WIDTH,
    typeof window !== 'undefined' ? window.innerWidth - 16 : POPOVER_WIDTH
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (open && pinned) {
            close();
            return;
          }
          openFromAnchor();
          setPinned(true);
        }}
        onMouseEnter={() => {
          if (!supportsHover() || open) return;
          openFromAnchor();
        }}
        onMouseLeave={() => {
          if (!supportsHover() || pinned) return;
          close();
        }}
        className={`rounded-md bg-emerald-500/15 border border-emerald-500/35 px-2 py-0.5 text-xs font-semibold text-emerald-300 inline-flex items-center gap-1 cursor-pointer hover:bg-emerald-500/25 hover:border-emerald-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 transition ${className}`}
        title="Tap or hover to see how the Meta rating works"
      >
        <span className="whitespace-nowrap">
          Meta {meta.metaScore.toFixed(1)}
          {hasProjection && meta.paMetaScore !== null
            ? ` → ${meta.paMetaScore.toFixed(1)} Pot`
            : ''}
        </span>
        <Info className="h-3 w-3 opacity-70 shrink-0" aria-hidden="true" />
      </button>

      {open && !asSheet && position && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="About the Meta rating"
              style={{ position: 'fixed', top: position.top, left: position.left, width }}
              className="z-[70] max-h-[70vh] overflow-y-auto rounded-xl border border-emerald-500/35 bg-slate-900 shadow-2xl p-3.5"
            >
              <MetaExplainer
                player={player}
                meta={meta}
                onClose={close}
                showCloseButton
              />
            </div>,
            document.body
          )
        : null}

      {open && asSheet && typeof document !== 'undefined'
        ? createPortal(
            // Portalled and lifted above the profile sheet, which itself sits at z-50.
            <div className="relative z-[80]">
              <MobileSheetFrame
                isOpen
                onClose={close}
                ariaLabel="About the Meta rating"
                closeAriaLabel="Close Meta rating explanation"
                maxWidthClass="sm:max-w-md"
                bodyClassName="p-4"
                header={
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                      Meta rating
                    </div>
                    <h3 className="text-base font-bold text-white mt-0.5 break-words">
                      {player.name}
                    </h3>
                  </div>
                }
              >
                <MetaExplainer
                  player={player}
                  meta={meta}
                  onClose={close}
                  showCloseButton={false}
                  showPlayerName={false}
                />
              </MobileSheetFrame>
            </div>,
            document.body
          )
        : null}
    </>
  );
};
