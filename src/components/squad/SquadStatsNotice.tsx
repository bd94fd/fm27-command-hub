import React from 'react';

interface SquadStatsNoticeProps {
  showStatsNotice: boolean;
  statsNoticeMode: 'fast_sync' | 'preseason' | 'unavailable';
}

export const SquadStatsNotice: React.FC<SquadStatsNoticeProps> = ({
  showStatsNotice,
  statsNoticeMode,
}) => {
  return (
    <>
    {showStatsNotice && (
      <div
        className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
          statsNoticeMode === 'preseason'
            ? 'border-sky-500/30 bg-sky-950/25 text-sky-200'
            : 'border-amber-500/35 bg-amber-950/25 text-amber-200'
        }`}
      >
        {statsNoticeMode === 'fast_sync' ? (
          <>
            <strong>Fast Sync mode active:</strong> Season match stats were
            skipped to keep mobile decoding fast. Uncheck{' '}
            <strong>Fast Sync</strong> and re-import in the{' '}
            <strong>Hub</strong> tab to populate appearances, ratings, goals,
            and xG.
          </>
        ) : statsNoticeMode === 'preseason' ? (
          <>
            <strong>Pre-season snapshot (0 competitive matches played):</strong>{' '}
            This save was loaded with Full Sync, and no competitive fixtures
            have been played yet this season. Appearances, ratings, goals, and
            xG will populate automatically after your first competitive match.
          </>
        ) : (
          <>
            <strong>Season match stats unavailable in this snapshot:</strong>{' '}
            Your save was loaded with Full Sync, but per-player season stats
            were not populated (partial checkpoint recovery or table timeout).
            Re-import in the <strong>Hub</strong> tab or check{' '}
            <strong>Save Reader Info</strong> in Club KPIs for details.
          </>
        )}
      </div>
    )}
    </>
  );
};
