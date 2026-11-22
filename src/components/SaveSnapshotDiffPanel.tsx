import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Database,
  FileSignature,
  History,
  Sparkles,
  Trash2,
  UserMinus,
} from 'lucide-react';
import {
  deleteSaveHistoryPoint,
  diffSaveHistoryPoints,
  listSaveHistoryPoints,
  SaveHistoryPoint,
} from '../services/saveCache';

interface SaveSnapshotDiffPanelProps {
  /** Bumped whenever a new .fm save sync completes so the panel refreshes automatically */
  refreshToken: string;
}

type DiffTab = 'risers' | 'fallers' | 'contracts' | 'arrivals' | 'departed';

export const SaveSnapshotDiffPanel: React.FC<SaveSnapshotDiffPanelProps> = ({
  refreshToken,
}) => {
  const [snapshots, setSnapshots] = useState<SaveHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromKey, setFromKey] = useState<string>('');
  const [toKey, setToKey] = useState<string>('');
  const [activeTab, setActiveTab] = useState<DiffTab>('risers');

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    const items = await listSaveHistoryPoints();
    setSnapshots(items);
    if (items.length >= 2) {
      setToKey((prev) =>
        items.some((i) => i.cacheKey === prev) ? prev : items[0].cacheKey
      );
      setFromKey((prev) =>
        items.some((i) => i.cacheKey === prev) ? prev : items[1].cacheKey
      );
    } else if (items.length === 1) {
      setToKey(items[0].cacheKey);
      setFromKey(items[0].cacheKey);
    } else {
      setToKey('');
      setFromKey('');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots, refreshToken]);

  const fromSnapshot = useMemo(
    () => snapshots.find((s) => s.cacheKey === fromKey) ?? null,
    [snapshots, fromKey]
  );
  const toSnapshot = useMemo(
    () => snapshots.find((s) => s.cacheKey === toKey) ?? null,
    [snapshots, toKey]
  );

  const diff = useMemo(() => {
    if (!fromSnapshot || !toSnapshot || fromSnapshot.cacheKey === toSnapshot.cacheKey) {
      return null;
    }
    return diffSaveHistoryPoints(fromSnapshot, toSnapshot);
  }, [fromSnapshot, toSnapshot]);

  const handleDeleteSnapshot = async (cacheKey: string) => {
    await deleteSaveHistoryPoint(cacheKey);
    await loadSnapshots();
  };

  if (loading) {
    return null;
  }

  if (snapshots.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-1.5">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
          <History className="h-4 w-4 text-sky-400" />
          Cached Save Snapshots &amp; Progression Diff (IndexedDB)
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Every full <span className="font-mono text-emerald-400">.fm</span> save
          sync is automatically saved as a lightweight snapshot on this device.
          Sync two different in-game dates to compare CA/PA growth, contract
          changes, and KPI deltas instantly without re-parsing large files.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Database className="h-4 w-4 text-sky-400" />
            Cached Save Snapshots &amp; Progression Diff
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {snapshots.length} lightweight snapshot{snapshots.length === 1 ? '' : 's'}{' '}
            stored in IndexedDB — instant comparison without re-parsing .fm files.
          </p>
        </div>
        {snapshots.length === 1 && (
          <span className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-300">
            1 snapshot stored ({snapshots[0].inGameDate}) — sync a newer save date to diff
          </span>
        )}
      </div>

      {snapshots.length >= 2 && (
        <>
          {/* Snapshot selectors (responsive 1-col on Pixel 10 Pro XL, 2-col on desktop) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Baseline Snapshot (From)
              </span>
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Baseline snapshot"
                  value={fromKey}
                  onChange={(e) => setFromKey(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  {snapshots.map((s) => (
                    <option key={s.cacheKey} value={s.cacheKey}>
                      {s.inGameDate} · {s.clubName} ({s.players.length} players)
                    </option>
                  ))}
                </select>
                {fromSnapshot && (
                  <button
                    type="button"
                    title="Delete baseline snapshot"
                    onClick={() => void handleDeleteSnapshot(fromSnapshot.cacheKey)}
                    className="rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Comparison Snapshot (To)
              </span>
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Comparison snapshot"
                  value={toKey}
                  onChange={(e) => setToKey(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  {snapshots.map((s) => (
                    <option key={s.cacheKey} value={s.cacheKey}>
                      {s.inGameDate} · {s.clubName} ({s.players.length} players)
                    </option>
                  ))}
                </select>
                {toSnapshot && (
                  <button
                    type="button"
                    title="Delete comparison snapshot"
                    onClick={() => void handleDeleteSnapshot(toSnapshot.cacheKey)}
                    className="rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </label>
          </div>

          {!diff ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
              Select two different snapshots above to view CA/PA growth, contract changes, and KPI deltas.
            </div>
          ) : (
            <div className="space-y-4">
              {/* KPI Deltas Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Squad Size
                  </div>
                  <div className="mt-1 flex items-baseline justify-between font-mono">
                    <span className="text-sm font-bold text-white">
                      {diff.kpiDeltas.toSquadCount}
                    </span>
                    <span
                      className={
                        diff.kpiDeltas.squadCountDelta > 0
                          ? 'text-emerald-400'
                          : diff.kpiDeltas.squadCountDelta < 0
                            ? 'text-rose-400'
                            : 'text-slate-500'
                      }
                    >
                      {diff.kpiDeltas.squadCountDelta >= 0 ? '+' : ''}
                      {diff.kpiDeltas.squadCountDelta}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Avg Squad CA
                  </div>
                  <div className="mt-1 flex items-baseline justify-between font-mono">
                    <span className="text-sm font-bold text-white">
                      {diff.kpiDeltas.toAvgAbility.toFixed(1)}
                    </span>
                    <span
                      className={
                        diff.kpiDeltas.avgAbilityDelta > 0
                          ? 'text-emerald-400'
                          : diff.kpiDeltas.avgAbilityDelta < 0
                            ? 'text-rose-400'
                            : 'text-slate-500'
                      }
                    >
                      {diff.kpiDeltas.avgAbilityDelta >= 0 ? '+' : ''}
                      {diff.kpiDeltas.avgAbilityDelta.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Weekly Wage Bill
                  </div>
                  <div className="mt-1 flex items-baseline justify-between font-mono">
                    <span className="text-sm font-bold text-white">
                      £{diff.kpiDeltas.toTotalWagePw.toLocaleString()}
                    </span>
                    <span
                      className={
                        diff.kpiDeltas.totalWageDeltaPw <= 0
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }
                    >
                      {diff.kpiDeltas.totalWageDeltaPw >= 0 ? '+' : ''}£
                      {diff.kpiDeltas.totalWageDeltaPw.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Balance / League
                  </div>
                  <div className="mt-1 text-xs font-mono text-white truncate">
                    {diff.kpiDeltas.toBalance || '--'}
                    {diff.kpiDeltas.toLeaguePosition != null && (
                      <span className="text-sky-400 ml-1.5">
                        #{diff.kpiDeltas.toLeaguePosition}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Filterable Diff Category Tabs */}
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    {
                      id: 'risers',
                      label: `CA Risers (${diff.risers.length})`,
                      icon: ArrowUpRight,
                    },
                    {
                      id: 'fallers',
                      label: `CA Fallers (${diff.fallers.length})`,
                      icon: ArrowDownRight,
                    },
                    {
                      id: 'contracts',
                      label: `Contracts (${diff.contractChanges.length})`,
                      icon: FileSignature,
                    },
                    {
                      id: 'arrivals',
                      label: `Arrivals / Newgens (${diff.newgens.length})`,
                      icon: Sparkles,
                    },
                    {
                      id: 'departed',
                      label: `Departed (${diff.departed.length})`,
                      icon: UserMinus,
                    },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition cursor-pointer ${
                        active
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Active Tab Content */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/70 max-h-64 overflow-y-auto text-xs">
                {activeTab === 'risers' &&
                  (diff.risers.length === 0 ? (
                    <div className="p-4 text-slate-500">
                      No CA risers detected between {diff.fromDate} and {diff.toDate}.
                    </div>
                  ) : (
                    diff.risers.map((p) => (
                      <div
                        key={p.uid}
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-white">{p.name}</span>
                          <span className="ml-2 text-slate-400">
                            {p.position} · Age {p.age}
                          </span>
                        </div>
                        <div className="font-mono text-emerald-400 shrink-0">
                          CA +{p.abilityDelta}
                          {p.potentialDelta !== 0 && (
                            <span className="ml-2 text-sky-300">
                              PA {p.potentialDelta > 0 ? '+' : ''}
                              {p.potentialDelta}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ))}

                {activeTab === 'fallers' &&
                  (diff.fallers.length === 0 ? (
                    <div className="p-4 text-slate-500">
                      No CA declines detected between {diff.fromDate} and {diff.toDate}.
                    </div>
                  ) : (
                    diff.fallers.map((p) => (
                      <div
                        key={p.uid}
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-white">{p.name}</span>
                          <span className="ml-2 text-slate-400">
                            {p.position} · Age {p.age}
                          </span>
                        </div>
                        <div className="font-mono text-rose-400 shrink-0">
                          CA {p.abilityDelta}
                        </div>
                      </div>
                    ))
                  ))}

                {activeTab === 'contracts' &&
                  (diff.contractChanges.length === 0 ? (
                    <div className="p-4 text-slate-500">
                      No contract expiry or wage changes detected.
                    </div>
                  ) : (
                    diff.contractChanges.map((c) => (
                      <div
                        key={c.uid}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-3.5 py-2.5"
                      >
                        <div>
                          <span className="font-semibold text-white">{c.name}</span>
                          <span className="ml-2 text-slate-400">{c.position}</span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-300">
                          {c.previousExpires !== c.currentExpires && (
                            <span className="mr-3 text-sky-300">
                              Exp: {c.previousExpires} → {c.currentExpires}
                            </span>
                          )}
                          {c.wageDeltaPw !== 0 && (
                            <span
                              className={
                                c.wageDeltaPw > 0 ? 'text-amber-300' : 'text-emerald-400'
                              }
                            >
                              £{c.previousWagePw.toLocaleString()} → £
                              {c.currentWagePw.toLocaleString()}/wk
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ))}

                {activeTab === 'arrivals' &&
                  (diff.newgens.length === 0 ? (
                    <div className="p-4 text-slate-500">
                      No new arrivals or youth intake players detected.
                    </div>
                  ) : (
                    diff.newgens.map((p) => (
                      <div
                        key={p.uid}
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5"
                      >
                        <div>
                          <span className="font-semibold text-white">{p.name}</span>
                          <span className="ml-2 text-slate-400">
                            {p.position} · Age {p.age}
                          </span>
                        </div>
                        <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          New in Squad
                        </span>
                      </div>
                    ))
                  ))}

                {activeTab === 'departed' &&
                  (diff.departed.length === 0 ? (
                    <div className="p-4 text-slate-500">
                      No squad departures detected.
                    </div>
                  ) : (
                    diff.departed.map((p) => (
                      <div
                        key={p.uid}
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5"
                      >
                        <div>
                          <span className="font-semibold text-white">{p.name}</span>
                          <span className="ml-2 text-slate-400">
                            {p.position} · Age {p.age}
                          </span>
                        </div>
                        <span className="font-mono text-slate-400">
                          CA {p.ability} · £{p.wagePw.toLocaleString()}/wk
                        </span>
                      </div>
                    ))
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
