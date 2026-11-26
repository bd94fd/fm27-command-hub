import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, GitCompare } from 'lucide-react';
import type { PlayerRecord } from '../types/fm27';
import { useCompareTray } from '../context/CompareTrayContext';
import {
  buildCompareTargetFromSquadPlayer,
  resolveSquadPlayerUid,
} from '../utils/recruitmentHelpers';

interface CompareTrayToggleProps {
  player: PlayerRecord;
  clubName?: string | null;
  /** Compact icon-only form for narrow table cells. */
  iconOnly?: boolean;
  className?: string;
}

export const CompareTrayToggle: React.FC<CompareTrayToggleProps> = ({
  player,
  clubName,
  iconOnly = false,
  className = '',
}) => {
  const { isInTray, toggle } = useCompareTray();
  const uid = useMemo(() => resolveSquadPlayerUid(player), [player]);
  const inTray = isInTray(uid);
  const [showFullHint, setShowFullHint] = useState(false);
  const hintTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    },
    []
  );

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const result = toggle(buildCompareTargetFromSquadPlayer(player, clubName));
    if (result !== 'full') return;
    setShowFullHint(true);
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setShowFullHint(false), 2000);
  };

  const label = inTray ? 'In Compare' : showFullHint ? 'Tray full' : '+ Compare';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={inTray}
      aria-label={
        inTray
          ? `Remove ${player.name} from the compare tray`
          : `Add ${player.name} to the compare tray`
      }
      title={
        inTray
          ? 'Remove from compare tray'
          : 'Add to compare tray (3 players maximum)'
      }
      className={`inline-flex min-h-[36px] sm:min-h-[30px] items-center justify-center gap-1 rounded-lg border px-2 py-1 text-micro font-semibold transition cursor-pointer shrink-0 ${
        inTray
          ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-300 hover:bg-emerald-500/25'
          : 'bg-slate-100/80 dark:bg-slate-800/70 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-500/45 hover:text-emerald-600 dark:hover:text-emerald-300'
      } ${className}`}
    >
      {inTray ? (
        <Check className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <GitCompare className="h-3.5 w-3.5 shrink-0" />
      )}
      {!iconOnly && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
};
