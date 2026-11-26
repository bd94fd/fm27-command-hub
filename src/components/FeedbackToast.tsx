import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { FeedbackMessage } from '../utils/feedbackBus';

interface FeedbackToastProps {
  message: FeedbackMessage | null;
  onDismiss: (id: number) => void;
}

const TONE_STYLES = {
  success: {
    frame: 'border-emerald-500/40 bg-slate-900/95 text-emerald-200',
    icon: 'text-emerald-400',
    Icon: CheckCircle2,
  },
  error: {
    frame: 'border-rose-500/50 bg-slate-900/95 text-rose-200',
    icon: 'text-rose-400',
    Icon: AlertTriangle,
  },
  info: {
    frame: 'border-sky-500/40 bg-slate-900/95 text-sky-200',
    icon: 'text-sky-400',
    Icon: Info,
  },
} as const;

export const FeedbackToast: React.FC<FeedbackToastProps> = ({ message, onDismiss }) => {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(0);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const idRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(
    (ms: number) => {
      clearTimer();
      remainingRef.current = ms;
      startedAtRef.current = Date.now();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        if (idRef.current !== null) onDismiss(idRef.current);
      }, ms);
    },
    [clearTimer, onDismiss]
  );

  useEffect(() => {
    if (!message) {
      clearTimer();
      idRef.current = null;
      return;
    }
    idRef.current = message.id;
    setPaused(false);
    startTimer(message.durationMs);
    return clearTimer;
  }, [message, startTimer, clearTimer]);

  const pause = () => {
    if (timerRef.current === null) return;
    const elapsed = Date.now() - startedAtRef.current;
    remainingRef.current = Math.max(1000, remainingRef.current - elapsed);
    clearTimer();
    setPaused(true);
  };

  const resume = () => {
    if (!message) return;
    setPaused(false);
    startTimer(remainingRef.current || message.durationMs);
  };

  const runAction = async () => {
    if (!message?.action) return;
    const id = message.id;
    clearTimer();
    // Dismiss first: the action may unmount the surface that raised the toast,
    // and a toast frozen over stale content reads as a bug.
    onDismiss(id);
    try {
      await message.action.run();
    } catch (err) {
      console.warn('Feedback action failed:', err);
    }
  };

  if (!message) return null;

  const { frame, icon, Icon } = TONE_STYLES[message.tone];
  const isError = message.tone === 'error';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-[70] flex justify-center px-3 md:bottom-6 md:justify-end md:px-6">
      <div
        role={isError ? 'alert' : 'status'}
        aria-live={isError ? 'assertive' : 'polite'}
        aria-atomic="true"
        onPointerEnter={pause}
        onPointerLeave={resume}
        onFocus={pause}
        onBlur={resume}
        className={`pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold shadow-2xl backdrop-blur motion-safe:animate-feedback-in md:max-w-lg ${frame}`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${icon}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-snug">{message.text}</span>
        {message.action && (
          <button
            type="button"
            onClick={() => void runAction()}
            className="min-h-[44px] shrink-0 rounded-md border border-current/40 px-3 text-2xs font-bold uppercase tracking-wider hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 md:min-h-[36px]"
          >
            {message.action.label}
          </button>
        )}
        <button
          type="button"
          onClick={() => onDismiss(message.id)}
          aria-label="Dismiss message"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-current/70 hover:bg-white/10 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        {paused && <span className="sr-only">Message timer paused</span>}
      </div>
    </div>
  );
};
