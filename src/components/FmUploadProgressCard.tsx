/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  AlertCircle,
  Pause,
  Play,
  RefreshCw,
  Smartphone,
  Sun,
  WifiOff,
  X,
} from 'lucide-react';
import type { FmSaveProgressStage } from '../services/fmSaveReader';
import {
  formatBytesMb,
  formatEtaSeconds,
  formatTransferSpeed,
} from '../utils/uploadMetrics';

interface FmUploadProgressCardProps {
  stage: FmSaveProgressStage;
  elapsedSec: number;
  clubCoreReady: boolean;
  wakeLockActive: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onDecodeOnPhone?: () => void;
  onCancel: () => void;
}

export const FmUploadProgressCard: React.FC<FmUploadProgressCardProps> = ({
  stage,
  elapsedSec,
  clubCoreReady,
  wakeLockActive,
  onPause,
  onResume,
  onDecodeOnPhone,
  onCancel,
}) => {
  const isPaused = Boolean(stage.paused);
  const isOfflinePaused = isPaused && stage.pauseReason === 'offline';
  const hasKnownPct =
    typeof stage.progressPct === 'number' && Number.isFinite(stage.progressPct);
  const clampedPct = hasKnownPct
    ? Math.max(0, Math.min(100, Math.round(stage.progressPct!)))
    : null;

  const hasBytes =
    typeof stage.totalBytes === 'number' &&
    stage.totalBytes > 0 &&
    typeof stage.bytesUploaded === 'number';
  const speedLabel = formatTransferSpeed(stage.speedBytesPerSec);
  const etaLabel = formatEtaSeconds(stage.etaSec);

  const showPauseControl = Boolean(stage.canPause && (onPause || onResume));
  const showFallbackControl = Boolean(stage.canFallbackToLocal && onDecodeOnPhone);

  const borderTone = isPaused
    ? 'bg-amber-500/10 border-amber-500/40 text-amber-100'
    : 'bg-emerald-500/10 border-emerald-500/35 text-emerald-100';

  const barFillTone = isPaused ? 'bg-amber-400' : 'bg-emerald-400';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`p-3.5 border rounded-xl space-y-2.5 text-xs ${borderTone}`}
    >
      {/* Top Row: Status Icon, Step Title, Wake Lock Pill & Elapsed Timer */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          {isOfflinePaused ? (
            <WifiOff className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          ) : isPaused ? (
            <Pause className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          ) : (
            <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-emerald-400 mt-0.5" />
          )}

          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-xs text-white">
                {isOfflinePaused
                  ? 'Upload Paused — Waiting for Signal'
                  : isPaused
                    ? 'Upload Paused'
                    : stage.step || 'Syncing .fm Save'}
              </span>
              {wakeLockActive && !isPaused && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-medium text-emerald-300">
                  <Sun className="w-2.5 h-2.5" />
                  Screen awake
                </span>
              )}
            </div>

            {clubCoreReady && (
              <div className="text-[11px] font-semibold text-emerald-200 leading-snug">
                Squad, Staff &amp; Tactics ready — browse tabs now while stats finish in background
              </div>
            )}

            <p className="text-[11px] leading-snug break-words text-slate-200/90">
              {stage.label}
            </p>
          </div>
        </div>

        <span className="font-mono text-[11px] text-slate-300/90 tabular-nums shrink-0 pt-0.5">
          {elapsedSec}s
        </span>
      </div>

      {/* Visual Progress Bar */}
      <div className="space-y-1">
        <div
          className="h-2.5 w-full rounded-full bg-slate-900/90 border border-slate-700/70 overflow-hidden"
          role="progressbar"
          aria-valuenow={clampedPct ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={stage.step || 'FM save sync progress'}
        >
          {clampedPct !== null ? (
            <div
              className={`h-full rounded-full transition-all duration-300 ${barFillTone}`}
              style={{ width: `${Math.max(clampedPct, clampedPct > 0 ? 3 : 0)}%` }}
            />
          ) : (
            <div className="h-full w-2/5 rounded-full bg-emerald-400/80 animate-pulse" />
          )}
        </div>

        {/* Metrics Row: MB Uploaded / Total MB, %, Speed (MB/s), ETA */}
        {(hasBytes || clampedPct !== null || isPaused) && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px] font-mono tabular-nums text-slate-300">
            <span>
              {hasBytes
                ? `${formatBytesMb(stage.bytesUploaded!)} / ${formatBytesMb(stage.totalBytes!)} MB${
                    clampedPct !== null ? ` (${clampedPct}%)` : ''
                  }`
                : clampedPct !== null
                  ? `${clampedPct}%`
                  : ''}
            </span>
            <span className={isPaused ? 'text-amber-300 font-sans' : 'text-emerald-300'}>
              {isOfflinePaused
                ? 'Server holds progress for 15 min · auto-resumes on signal'
                : isPaused
                  ? 'Paused · server holds progress for 15 min'
                  : [speedLabel, etaLabel].filter(Boolean).join(' · ') ||
                    (stage.transport === 'server_upload' ? 'Measuring speed…' : '')}
            </span>
          </div>
        )}
      </div>

      {/* Google Drive Android Stall Tip */}
      {stage.stallTipVisible && (
        <div className="p-2.5 rounded-lg bg-amber-950/50 border border-amber-500/35 flex items-start gap-2 text-[11px] text-amber-100 leading-snug">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="min-w-0">
            <strong className="font-semibold text-amber-200">
              Google Drive tip:{' '}
            </strong>
            Reading a `.fm` save directly from Google Drive on Android can stall.
            For the fastest upload, download it to your phone&apos;s{' '}
            <strong className="text-white">Downloads</strong> folder first, then
            pick it from Downloads.
          </p>
        </div>
      )}

      {/* Touch-Friendly Controls (44px+ targets, wrap cleanly at 360px) */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {showPauseControl &&
          (isPaused ? (
            <button
              type="button"
              onClick={onResume}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume Upload</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg transition cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5 text-amber-300" />
              <span>Pause</span>
            </button>
          ))}

        {showFallbackControl && (
          <button
            type="button"
            onClick={onDecodeOnPhone}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-xs font-semibold text-sky-200 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 rounded-lg transition cursor-pointer"
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span>Decode on phone instead</span>
          </button>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center gap-1 min-h-[44px] px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-lg transition cursor-pointer ml-auto"
        >
          <X className="w-3.5 h-3.5" />
          <span>Cancel</span>
        </button>
      </div>
    </div>
  );
};
