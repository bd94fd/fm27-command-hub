export type FeedbackTone = 'success' | 'error' | 'info';

export interface FeedbackAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface FeedbackMessage {
  id: number;
  tone: FeedbackTone;
  text: string;
  durationMs: number;
  action?: FeedbackAction;
}

/**
 * Errors get longer than confirmations: they carry a cause and often a fix, and
 * a toast that vanishes before it is read is worse than no toast.
 */
const TONE_DURATION_MS: Record<FeedbackTone, number> = {
  success: 5000,
  info: 6000,
  error: 9000,
};

/** An undo toast has to outlive the user's surprise at what just happened. */
export const UNDO_DURATION_MS = 10000;

type Listener = (message: FeedbackMessage) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function feedbackDuration(tone: FeedbackTone, hasAction: boolean): number {
  return hasAction ? Math.max(UNDO_DURATION_MS, TONE_DURATION_MS[tone]) : TONE_DURATION_MS[tone];
}

export function emitFeedback(input: {
  text: string;
  tone?: FeedbackTone;
  action?: FeedbackAction;
}): FeedbackMessage {
  const tone = input.tone ?? (input.action ? 'info' : 'success');
  const message: FeedbackMessage = {
    id: nextId++,
    tone,
    text: input.text,
    durationMs: feedbackDuration(tone, Boolean(input.action)),
    action: input.action,
  };
  for (const listener of [...listeners]) listener(message);
  return message;
}

export function subscribeFeedback(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const feedback = {
  success: (text: string) => emitFeedback({ text, tone: 'success' }),
  info: (text: string) => emitFeedback({ text, tone: 'info' }),
  error: (text: string) => emitFeedback({ text, tone: 'error' }),
  undo: (text: string, run: FeedbackAction['run']) =>
    emitFeedback({ text, tone: 'info', action: { label: 'Undo', run } }),
};

export function __resetFeedbackBusForTests(): void {
  listeners.clear();
  nextId = 1;
}
