import { Database, Menu, Settings } from 'lucide-react';
import type { SnapshotMetadata } from '../domain/types';

interface AppHeaderProps {
  metadata: SnapshotMetadata;
  onLoadData: () => void;
  onOpenSettings: () => void;
  onToggleMobileNav?: () => void;
  isLoading: boolean;
}

export function AppHeader({
  metadata,
  onLoadData,
  onOpenSettings,
  onToggleMobileNav,
  isLoading,
}: AppHeaderProps) {
  const isAwaiting = metadata.status === 'awaiting_save';
  const isCurrent = metadata.status === 'loaded' && metadata.freshness === 'current';

  let pillStyle = 'border-[#614722] bg-[#2e2214] text-[#f5c469]';
  let dotStyle = 'bg-[#f5b446]';
  let pillLabel = 'Snapshot stale';

  if (isLoading || metadata.freshness === 'refreshing') {
    pillStyle = 'border-[#734096] bg-[#2a1a38] text-[#e4adff]';
    dotStyle = 'bg-[#dc87ff] animate-pulse';
    pillLabel = 'Refreshing…';
  } else if (isAwaiting) {
    pillStyle = 'border-[#4b4154] bg-[#1d1822] text-[#d4ced8]';
    dotStyle = 'bg-[#9c8ba9]';
    pillLabel = 'Awaiting .fm Save';
  } else if (isCurrent) {
    pillStyle = 'border-[#25553b] bg-[#142c21] text-[#71e7a7]';
    dotStyle = 'bg-[#36d881]';
    pillLabel = 'Data current';
  }

  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-[#32293a] bg-[#120e16] px-4 sm:px-5">
      <div className="flex items-center gap-3 min-w-0">
        {onToggleMobileNav && (
          <button
            type="button"
            onClick={onToggleMobileNav}
            aria-label="Toggle workspace navigation"
            className="inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[5px] border border-[#473d50] bg-[#241f29] text-[#d4ced8] hover:border-[#dc87ff] hover:text-white lg:hidden cursor-pointer"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}

        <div className="fm-font-display select-none text-[24px] sm:text-[26px] font-black italic tracking-[-1.2px] leading-none shrink-0">
          <span className="text-[#faf5fc]">FM</span>
          <span className="text-[#dc87ff]">27</span>
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="truncate text-[14px] font-bold tracking-[-0.1px] text-[#faf5fc]">
            FM27 Command Hub
          </span>
          <span className="hidden sm:block truncate text-[10px] font-semibold uppercase tracking-[0.11em] text-[#a295ac]">
            {metadata.status === 'loaded' && metadata.managedClubName
              ? `${metadata.managedClubName} · ${metadata.gameDateDmy || metadata.gameDate || 'Loaded'}`
              : 'Live Save Intelligence & Playbook v2.0'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div
          className={`hidden sm:flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-semibold ${pillStyle}`}
          title={
            metadata.gameDate
              ? `Snapshot game date: ${metadata.gameDateDmy || metadata.gameDate}`
              : 'No .fm save loaded yet'
          }
        >
          <span className={`h-2 w-2 rounded-full ${dotStyle}`} />
          <span>{pillLabel}</span>
        </div>

        <button
          type="button"
          onClick={onLoadData}
          disabled={isLoading}
          className="inline-flex h-[36px] items-center gap-2 rounded-[5px] bg-[#850be3] px-3 sm:px-4 text-[12.5px] sm:text-[13px] font-semibold text-white transition-colors hover:bg-[#9c2be4] disabled:opacity-60 cursor-pointer"
        >
          <Database className="h-4 w-4 shrink-0" />
          <span>Load .fm Save</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
          className="inline-flex h-[36px] w-[36px] items-center justify-center rounded-[5px] border border-[#473d50] bg-[#241f29] text-[#d4ced8] transition-colors hover:border-[#dc87ff] hover:text-white cursor-pointer"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
