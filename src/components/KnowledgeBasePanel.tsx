import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  FM27_KNOWLEDGE_BASE,
  KnowledgeCategory,
  searchFm27KnowledgeBase,
  verifyFm27Accuracy,
} from '../data/fm27KnowledgeBase';

interface KnowledgeBasePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: Array<'All' | KnowledgeCategory> = [
  'All',
  'Match Engine & Patch 27.1.0',
  'Dual-Phase Tactics (IP/OOP)',
  'Tactical Effectiveness',
  'Attributes & Engine Metrics',
  'Training & Fatigue',
  'Set Pieces',
  'Recruitment, SCR & Contracts',
  'Squad Dynamics & Mentoring',
];

export const KnowledgeBasePanel: React.FC<KnowledgeBasePanelProps> = ({
  isOpen,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<
    'All' | KnowledgeCategory
  >('All');
  const [verifyInput, setVerifyInput] = useState('');

  const results = useMemo(() => {
    const base = query.trim()
      ? searchFm27KnowledgeBase(query, 12)
      : FM27_KNOWLEDGE_BASE;
    if (selectedCategory === 'All') return base;
    return base.filter((e) => e.category === selectedCategory);
  }, [query, selectedCategory]);

  const verification = useMemo(() => {
    if (!verifyInput.trim()) return null;
    return verifyFm27Accuracy(verifyInput);
  }, [verifyInput]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-800 bg-slate-900 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                FM27 Verified Knowledge Base &amp; Fact-Checker
              </h2>
              <p className="text-xs text-slate-400">
                Patch 27.1.0 mechanics · Automatically grounds &amp; verifies AI Analyst answers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close knowledge base"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {/* Search & Category Filter */}
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search FM27 mechanics (e.g. Tracking Winger, Patch 27.1.0, corners, SCR, fatigue)..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                    selectedCategory === cat
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Fact-Checker Box */}
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
              <ShieldCheck className="h-4 w-4" />
              FM27 Accuracy Checker (Verify any tactic or AI reply)
            </div>
            <textarea
              rows={2}
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value)}
              placeholder="Paste any tactical advice or AI answer to check for retired FM24 roles, legacy duties, or raw CA/PA leaks..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
            />
            {verification && (
              <div
                className={`rounded-lg border p-2.5 text-xs ${
                  verification.passed
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  {verification.passed ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      Verified FM27-Compliant
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                      {verification.warnings.length} FM27 Accuracy Warning(s)
                    </>
                  )}
                </div>
                {verification.warnings.length > 0 && (
                  <ul className="mt-1.5 list-disc pl-4 space-y-0.5 text-[11px]">
                    {verification.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                )}
                {verification.citedVerifiedRoles.length > 0 && (
                  <div className="mt-1.5 text-[11px] text-slate-300">
                    Verified FM27 roles detected:{' '}
                    <span className="font-mono text-emerald-300">
                      {verification.citedVerifiedRoles.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Knowledge Entries */}
          <div className="space-y-3">
            {results.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                    {entry.category}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    {entry.patchVerified}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white">{entry.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {entry.summary}
                </p>
                <ul className="space-y-1 pt-1">
                  {entry.keyFacts.map((fact, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-slate-300 flex items-start gap-2"
                    >
                      <span className="text-emerald-400 mt-0.5">•</span>
                      <span>{fact}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
