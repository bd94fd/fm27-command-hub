import { Database } from 'lucide-react';

interface LoadingSnapshotModalProps {
  open: boolean;
  phase: string;
}

export function LoadingSnapshotModal({ open, phase }: LoadingSnapshotModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040308]/75 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Refreshing Football Manager snapshot"
    >
      <div className="flex w-full max-w-[400px] flex-col items-center gap-3 rounded-[8px] border border-[#d0c6db]/25 bg-[#121116] px-8 py-7 text-center shadow-[0_24px_64px_rgba(0,0,0,0.65)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#734096] bg-[#34223f] text-[#dc87ff]">
          <Database className="h-6 w-6 animate-pulse" />
        </div>
        <h3 className="fm-font-display text-[18px] font-bold text-[#faf5fc]">
          Loading Football Manager snapshot
        </h3>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2a2330]">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-[#850be3]" />
        </div>
        <p className="text-[13px] font-semibold text-[#dc87ff]">{phase}</p>
        <p className="text-[12px] text-[#b2acbb]">
          Players, staff, clubs, and competitions will refresh automatically.
        </p>
      </div>
    </div>
  );
}
