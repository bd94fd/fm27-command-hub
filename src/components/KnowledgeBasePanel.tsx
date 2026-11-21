import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Compass,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import {
  FM27_KNOWLEDGE_BASE,
  FM27_ROLE_CATALOG,
  KnowledgeCategory,
  searchFm27KnowledgeBase,
  verifyFm27Accuracy,
} from '../data/fm27KnowledgeBase';
import { PlayerRecord } from '../types/fm27';
import { rankSquadForFm27Role } from '../utils/fm27RoleMatcher';

interface KnowledgeBasePanelProps {
  isOpen: boolean;
  onClose: () => void;
  players?: PlayerRecord[];
}

type DrawerTab = 'mechanics' | 'roles';

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

const POSITION_GROUPS: string[] = [
  'All',
  ...Array.from(new Set(FM27_ROLE_CATALOG.map((r) => r.positionGroup))),
];

export const KnowledgeBasePanel: React.FC<KnowledgeBasePanelProps> = ({
  isOpen,
  onClose,
  players = [],
}) => {
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('mechanics');
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<
    'All' | KnowledgeCategory
  >('All');
  const [verifyInput, setVerifyInput] = useState('');

  // Dual-Phase Role Encyclopedia filters
  const [roleSearch, setRoleSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<'ALL' | 'IP' | 'OOP'>('ALL');
  const [posGroupFilter, setPosGroupFilter] = useState<string>('All');

  const results = useMemo(() => {
    const base = query.trim()
      ? searchFm27KnowledgeBase(query, 12)
      : FM27_KNOWLEDGE_BASE;
    if (selectedCategory === 'All') return base;
    return base.filter((e) => e.category === selectedCategory);
  }, [query, selectedCategory]);

  const filteredRoles = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return FM27_ROLE_CATALOG.filter((role) => {
      if (phaseFilter !== 'ALL' && role.phase !== phaseFilter) return false;
      if (posGroupFilter !== 'All' && role.positionGroup !== posGroupFilter) {
        return false;
      }
      if (!q) return true;
      return (
        role.name.toLowerCase().includes(q) ||
        role.positionGroup.toLowerCase().includes(q) ||
        role.primaryAttributes.some((a) => a.toLowerCase().includes(q)) ||
        role.secondaryAttributes.some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [roleSearch, phaseFilter, posGroupFilter]);

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
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 px-5 pt-4 pb-3 backdrop-blur space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                <BookOpen className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  FM27 Verified Knowledge Base &amp; Dual-Phase Encyclopedia
                </h2>
                <p className="text-xs text-slate-400">
                  Patch 27.1.0 mechanics · Pure IP/OOP role catalog (zero legacy duties)
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              aria-label="Close knowledge base"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Drawer Tab Switcher */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setDrawerTab('mechanics')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold border transition cursor-pointer ${
                drawerTab === 'mechanics'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Mechanics &amp; Fact-Checker
            </button>
            <button
              type="button"
              onClick={() => setDrawerTab('roles')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold border transition cursor-pointer ${
                drawerTab === 'roles'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              FM27 Dual-Phase Roles ({FM27_ROLE_CATALOG.length})
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {drawerTab === 'mechanics' ? (
            <>
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
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
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
            </>
          ) : (
            <div className="space-y-4">
              {/* Role Encyclopedia Filters */}
              <div className="space-y-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={roleSearch}
                    onChange={(e) => setRoleSearch(e.target.value)}
                    placeholder={`Search ${FM27_ROLE_CATALOG.length} FM27 IP/OOP roles or key attributes (e.g. Tracking Winger, Pressing, Pace)...`}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        { id: 'ALL', label: `All (${FM27_ROLE_CATALOG.length})` },
                        {
                          id: 'IP',
                          label: `In-Possession (${FM27_ROLE_CATALOG.filter((r) => r.phase === 'IP').length})`,
                        },
                        {
                          id: 'OOP',
                          label: `Out-of-Possession (${FM27_ROLE_CATALOG.filter((r) => r.phase === 'OOP').length})`,
                        },
                      ] as const
                    ).map((ph) => (
                      <button
                        key={ph.id}
                        type="button"
                        onClick={() => setPhaseFilter(ph.id)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition cursor-pointer ${
                          phaseFilter === ph.id
                            ? ph.id === 'OOP'
                              ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:text-slate-200'
                        }`}
                      >
                        {ph.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {filteredRoles.length} roles shown
                  </span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {POSITION_GROUPS.map((grp) => (
                    <button
                      key={grp}
                      type="button"
                      onClick={() => setPosGroupFilter(grp)}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-mono font-semibold border transition cursor-pointer ${
                        posGroupFilter === grp
                          ? 'bg-slate-100 text-slate-900 border-white'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {grp}
                    </button>
                  ))}
                </div>
              </div>

              {/* Role Cards with Live Squad Fit */}
              <div className="space-y-3">
                {filteredRoles.map((role) => {
                  const topMatches =
                    players.length > 0
                      ? rankSquadForFm27Role(
                          players,
                          {
                            positionGroup: role.positionGroup,
                            name: role.name,
                            phase: role.rawPhase,
                            priorities: role.priorities,
                          },
                          3
                        )
                      : [];
                  return (
                    <div
                      key={role.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white">
                            {role.name}
                          </h3>
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                            {role.positionGroup}
                          </span>
                        </div>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            role.phase === 'IP'
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                          }`}
                        >
                          {role.phase === 'IP' ? 'In Possession (IP)' : 'Out of Possession (OOP)'}
                        </span>
                      </div>

                      <div className="space-y-1 text-[11px]">
                        <div className="flex flex-wrap gap-1 items-center">
                          <span className="text-slate-400 font-semibold mr-1">
                            Primary:
                          </span>
                          {role.primaryAttributes.map((attr) => (
                            <span
                              key={`p-${attr}`}
                              className="rounded bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-emerald-300"
                            >
                              {attr}
                            </span>
                          ))}
                        </div>
                        {role.secondaryAttributes.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-slate-400 font-semibold mr-1">
                              Secondary:
                            </span>
                            {role.secondaryAttributes.map((attr) => (
                              <span
                                key={`s-${attr}`}
                                className="rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5 text-slate-300"
                              >
                                {attr}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {topMatches.length > 0 ? (
                        <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <Users className="h-3 w-3 text-emerald-400" />
                            Top Suited Squad Fits (Live fm27RoleMatcher)
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                            {topMatches.map((m) => (
                              <div
                                key={m.player.id}
                                className="rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-[11px]"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-semibold text-slate-100 truncate">
                                    {m.player.name}
                                  </span>
                                  <span className="font-mono font-bold text-emerald-400 shrink-0">
                                    {m.fitPct}%
                                  </span>
                                </div>
                                <div className="text-[10px] font-mono text-slate-400">
                                  {m.player.position} · {m.player.ability.toFixed(1)}★ · £
                                  {m.player.wagePw}/wk
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="pt-1.5 border-t border-slate-800/80 text-[11px] text-slate-500 italic">
                          Load a .fm save to rank your squad&apos;s best fits for {role.name}.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
