import React from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { ChatTurnPayload } from '../../services/chatStorage';
import { mergeAnalystCitations } from '../../utils/analystCitations';
import { checkFm27ResponseWarnings } from '../../utils/fm27AccuracyCheck';

export interface AnalystChatFeedProps {
  turns: ChatTurnPayload[];
  isSending: boolean;
  copiedId: string | null;
  displayManagerLabel: string;
  feedEndRef: React.RefObject<HTMLDivElement | null>;
  onCopyTurn: (turn: ChatTurnPayload) => void;
  onAsk: (prompt: string) => void;
  onCancel: () => void;
}

/** The scrollable Analyst conversation, from the first question to the stop button. */
export const AnalystChatFeed: React.FC<AnalystChatFeedProps> = ({
  turns,
  isSending,
  copiedId,
  displayManagerLabel,
  feedEndRef,
  onCopyTurn,
  onAsk,
  onCancel,
}) => {
  if (turns.length === 0 && !isSending) return null;
  return (
  <div className="space-y-3 max-h-[52dvh] md:max-h-[55dvh] overflow-y-auto pr-1">
    {turns.map((turn) => {
      if (turn.role === 'user') {
        return (
          <div
            key={turn.id}
            className="ml-auto max-w-2xl p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-slate-100"
          >
            <div className="flex items-center justify-between gap-2 text-2xs font-mono text-emerald-400 mb-1">
              <span>{displayManagerLabel}</span>
              <div className="flex items-center gap-2 min-w-0">
                {turn.imageNames && turn.imageNames.length > 0 && (
                  <span className="truncate">
                    {turn.imageNames.join(', ')}
                  </span>
                )}
                {turn.userText && (
                  <button
                    type="button"
                    onClick={() =>
                      onCopyTurn(turn)
                    }
                    title="Copy message"
                    className="inline-flex items-center gap-1 min-h-[36px] md:min-h-[24px] px-2 rounded-md bg-emerald-900/60 hover:bg-emerald-800/70 text-emerald-200 transition cursor-pointer shrink-0"
                  >
                    {copiedId === turn.id ? (
                      <>
                        <Check className="w-3 h-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs leading-relaxed whitespace-pre-wrap">
              {turn.userText}
            </p>
          </div>
        );
      }

      const turnCitations = mergeAnalystCitations(
        turn.sourceCitations,
        turn.analysisMarkdown
      );

      return (
        <div
          key={turn.id}
          className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              Tactical Analyst{turn.screenDetected ? ` · ${turn.screenDetected}` : ''}
            </span>
            <div className="flex items-center gap-2">
              {turn.inGameDate && turn.inGameDate !== '--' && (
                <span className="text-2xs font-mono text-slate-500">
                  {turn.inGameDate}
                </span>
              )}
              <button
                type="button"
                onClick={() =>
                  onCopyTurn(turn)
                }
                title="Copy this Analyst reply"
                className="inline-flex items-center gap-1 min-h-[36px] md:min-h-[24px] px-2 rounded-md text-micro font-medium bg-slate-200/80 dark:bg-slate-800 hover:bg-emerald-500/20 text-slate-700 dark:text-slate-200 hover:text-emerald-300 border border-slate-300 dark:border-slate-700 transition cursor-pointer"
              >
                {copiedId === turn.id ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          {turn.playerUpdatesApplied &&
            turn.playerUpdatesApplied.length > 0 && (
              <div className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-micro text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="min-w-0 break-words">
                  Updated Squad:{' '}
                  <strong>
                    {turn.playerUpdatesApplied.slice(0, 8).join(', ')}
                    {turn.playerUpdatesApplied.length > 8
                      ? ` (+${turn.playerUpdatesApplied.length - 8} more)`
                      : ''}
                  </strong>
                </span>
              </div>
            )}

          {turn.analysisMarkdown && (() => {
            const check = checkFm27ResponseWarnings(turn.analysisMarkdown);
            if (check.passed) return null;
            return (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-micro text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="min-w-0 break-words">Notice: {check.warnings.join(' · ')}</span>
              </div>
            );
          })()}

          <div className="space-y-1.5 text-xs text-slate-800 dark:text-slate-200 leading-relaxed min-w-0 break-words">
            {(turn.analysisMarkdown || '')
              .split('\n')
              .map((rawLine, lineIdx) => {
                const line = rawLine.trim();
                if (!line) return <div key={lineIdx} className="h-1" />;

                const renderInlineBold = (text: string) => {
                  const parts = text.split(/(\*\*[^*]+\*\*)/g);
                  return parts.map((part, pIdx) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return (
                        <strong
                          key={pIdx}
                          className="font-semibold text-slate-950 dark:text-white"
                        >
                          {part.slice(2, -2)}
                        </strong>
                      );
                    }
                    return <span key={pIdx}>{part}</span>;
                  });
                };

                if (line.startsWith('### ')) {
                  return (
                    <h3
                      key={lineIdx}
                      className="text-sm font-bold text-emerald-700 dark:text-emerald-400 pt-1"
                    >
                      {renderInlineBold(line.replace(/^###\s+/, ''))}
                    </h3>
                  );
                }
                if (line.startsWith('#### ')) {
                  return (
                    <h4
                      key={lineIdx}
                      className="text-xs font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100 pt-1.5"
                    >
                      {renderInlineBold(line.replace(/^####\s+/, ''))}
                    </h4>
                  );
                }
                if (line.startsWith('* ') || line.startsWith('- ')) {
                  return (
                    <div
                      key={lineIdx}
                      className="flex items-start gap-2 pl-1.5"
                    >
                      <span className="text-emerald-500 font-bold">•</span>
                      <div className="flex-1">
                        {renderInlineBold(line.replace(/^[*-]\s+/, ''))}
                      </div>
                    </div>
                  );
                }
                return <p key={lineIdx}>{renderInlineBold(line)}</p>;
              })}
          </div>

          {turn.immediateClicks && turn.immediateClicks.length > 0 && (
            <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Immediate In-Game Actions
              </div>
              <ol className="list-decimal pl-4 space-y-1 text-xs text-slate-700 dark:text-slate-300">
                {turn.immediateClicks.map((clickItem, idx) => (
                  <li key={idx}>
                    {clickItem.replace(/^\s*\d+[.)]\s+/, '')}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {turnCitations.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <BookOpen className="h-3 w-3 shrink-0" />
                Grounded in
              </div>
              <div className="flex flex-wrap gap-1">
                {turnCitations.map((citation) => (
                  <span
                    key={citation}
                    className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-micro text-slate-600 dark:text-slate-300"
                  >
                    {citation}
                  </span>
                ))}
              </div>
            </div>
          )}

          {turn.followUpQuestions &&
            turn.followUpQuestions.length > 0 && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-1.5">
                {turn.followUpQuestions.map((q, qIdx) => (
                  <button
                    key={qIdx}
                    type="button"
                    disabled={isSending}
                    onClick={() => onAsk(q)}
                    className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:px-2.5 sm:py-1.5 text-micro font-medium text-left text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition cursor-pointer disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
        </div>
      );
    })}

    {isSending && (
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sparkles className="w-4 h-4 text-emerald-500 animate-spin motion-reduce:animate-none shrink-0" />
          <span className="min-w-0 break-words">
            Analysing your club &amp; preparing tactical advice...
          </span>
        </div>
        <button
          type="button"
          onClick={() => onCancel()}
          className="min-h-[44px] sm:min-h-[32px] px-3 sm:px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition cursor-pointer shrink-0"
        >
          Cancel
        </button>
      </div>
    )}
    <div ref={feedEndRef} />
  </div>
  );
};
