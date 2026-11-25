import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Database,
  FileSignature,
  History,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingUp,
  UserMinus,
} from 'lucide-react';
import type { MatchLogEntry } from '../types/fm27';
import {
  AiJourneyBriefingResult,
  buildDeepJourneyReport,
  clearAllSaveCache,
  DeepJourneyReport,
  deleteSaveHistoryPoint,
  getCachedJourneyBriefing,
  listSaveHistoryPoints,
  putCachedJourneyBriefing,
  SaveHistoryPoint,
} from '../services/saveCache';
import { clearProgressionArchive } from '../utils/progressionDiff';
import { formatWeeklyWage } from '../utils/squadViewHelpers';
import {
  deriveFootballSeasonLabel,
  formatSignedCurrency,
} from '../utils/matchScopeHelpers';

interface SaveSnapshotDiffPanelProps {
  /** Bumped whenever a new .fm save sync completes so the panel refreshes automatically */
  refreshToken: string;
  /** Optional live matches from the current save (used to compute League/Cup/Friendly split even for legacy cached snapshots) */
  liveMatches?: MatchLogEntry[];
  /** Optional callback notifying parent of the active DeepJourneyReport (for Analyst Chat context) */
  onJourneyReportChange?: (report: DeepJourneyReport | null) => void;
  /** Optional 1-tap handoff to discuss the Save-to-Save Journey directly in Tactical Analyst Chat */
  onAskAnalyst?: (prompt: string) => void;
}

type DiffTab = 'summary' | 'risers' | 'fallers' | 'stats' | 'contracts' | 'arrivals' | 'departed';
type TimelineMetric = 'avgAbility' | 'totalWagePw' | 'xgDiff' | 'leaguePosition';

export const SaveSnapshotDiffPanel: React.FC<SaveSnapshotDiffPanelProps> = ({
  refreshToken,
  liveMatches = [],
  onJourneyReportChange,
  onAskAnalyst,
}) => {
  const [snapshots, setSnapshots] = useState<SaveHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromKey, setFromKey] = useState<string>('');
  const [toKey, setToKey] = useState<string>('');
  const [activeTab, setActiveTab] = useState<DiffTab>('summary');
  const [timelineMetric, setTimelineMetric] = useState<TimelineMetric>('avgAbility');

  // AI Journey Briefing state (cached locally + auto-triggered once per uncached save pair)
  const [aiBriefing, setAiBriefing] = useState<AiJourneyBriefingResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const autoTriggeredPairsRef = useRef<Set<string>>(new Set());
  const latestSeenTopKeyRef = useRef<string>('');
  const aiBriefingRef = useRef<AiJourneyBriefingResult | null>(null);
  aiBriefingRef.current = aiBriefing;

  const pickNewestSameClubPair = (
    items: SaveHistoryPoint[]
  ): [SaveHistoryPoint, SaveHistoryPoint] | null => {
    if (items.length < 2) return null;
    const latest = items[0];
    const latestClub = (latest.clubName || '').trim().toLowerCase();
    const sameClub = latestClub
      ? items.filter(
          (i) => (i.clubName || '').trim().toLowerCase() === latestClub
        )
      : items;
    if (sameClub.length < 2) return null;
    const parseSaveDateMs = (raw: string | undefined): number => {
      if (!raw) return 0;
      const dmy = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
      if (dmy) {
        return Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
      }
      const parsed = Date.parse(raw);
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    const chronological = [...sameClub].sort((a, b) => {
      const da = parseSaveDateMs(a.inGameDate);
      const db = parseSaveDateMs(b.inGameDate);
      if (da !== db) return db - da;
      return b.capturedAt.localeCompare(a.capturedAt);
    });
    return [chronological[1], chronological[0]];
  };

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    const items = await listSaveHistoryPoints();
    setSnapshots(items);
    const topKey = items[0]?.cacheKey ?? '';
    const hasNewTopSnapshot = Boolean(topKey && topKey !== latestSeenTopKeyRef.current);
    latestSeenTopKeyRef.current = topKey;

    if (items.length >= 2) {
      const bestPair = pickNewestSameClubPair(items);
      if (bestPair) {
        const [older, newer] = bestPair;
        setToKey((prev) =>
          !hasNewTopSnapshot && items.some((i) => i.cacheKey === prev)
            ? prev
            : newer.cacheKey
        );
        setFromKey((prev) =>
          !hasNewTopSnapshot && items.some((i) => i.cacheKey === prev)
            ? prev
            : older.cacheKey
        );
      } else {
        setToKey(items[0].cacheKey);
        setFromKey(items[0].cacheKey);
      }
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

  const journey = useMemo<DeepJourneyReport | null>(() => {
    if (!fromSnapshot || !toSnapshot || fromSnapshot.cacheKey === toSnapshot.cacheKey) {
      return null;
    }
    return buildDeepJourneyReport(fromSnapshot, toSnapshot, snapshots, liveMatches);
  }, [fromSnapshot, toSnapshot, snapshots, liveMatches]);

  useEffect(() => {
    onJourneyReportChange?.(journey);
  }, [journey, onJourneyReportChange]);

  const handleGenerateAiBriefing = useCallback(
    async (forceRefresh = false, silentOnFailure = false) => {
      if (!journey || !fromSnapshot || !toSnapshot) return;
      if (!forceRefresh && aiBriefingRef.current) return;
      setAiLoading(true);
      setAiError(null);
      try {
        const res = await fetch('/api/fm27/journey-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clubName: journey.clubName,
            journeySummary: journey.aiPayload,
          }),
        });
        const rawText = await res.text();
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok) {
          let errMsg = `Journey briefing failed (${res.status})`;
          if (contentType.includes('application/json')) {
            try {
              const parsed = JSON.parse(rawText);
              errMsg = parsed.error || errMsg;
            } catch {
              // fallback
            }
          }
          throw new Error(errMsg);
        }
        if (!contentType.includes('application/json')) {
          throw new Error('Server returned non-JSON response for Journey Briefing.');
        }
        const parsed = JSON.parse(rawText) as {
          briefing?: AiJourneyBriefingResult;
          headline?: string;
          journeyArc?: string;
          whatImproved?: string[];
          whatWorsened?: string[];
          thingsToNote?: string[];
          tacticalEvolution?: string;
          governanceAndPromisesAudit?: string;
          priorityNextActions?: string[];
          error?: string;
        };
        const resolved: AiJourneyBriefingResult | null =
          parsed.briefing ??
          (parsed.headline
            ? {
                headline: parsed.headline,
                journeyArc: parsed.journeyArc || '',
                whatImproved: Array.isArray(parsed.whatImproved) ? parsed.whatImproved : [],
                whatWorsened: Array.isArray(parsed.whatWorsened) ? parsed.whatWorsened : [],
                thingsToNote: Array.isArray(parsed.thingsToNote) ? parsed.thingsToNote : [],
                tacticalEvolution: parsed.tacticalEvolution || '',
                governanceAndPromisesAudit: parsed.governanceAndPromisesAudit || '',
                priorityNextActions: Array.isArray(parsed.priorityNextActions)
                  ? parsed.priorityNextActions
                  : [],
              }
            : null);
        if (!resolved) {
          throw new Error(parsed.error || 'No journey briefing returned.');
        }
        const withTime: AiJourneyBriefingResult = {
          ...resolved,
          generatedAtIso: new Date().toISOString(),
        };
        setAiBriefing(withTime);
        await putCachedJourneyBriefing(fromSnapshot.cacheKey, toSnapshot.cacheKey, withTime);
      } catch (err) {
        if (!silentOnFailure) {
          setAiError(
            err instanceof Error ? err.message : 'Unable to generate AI Journey Briefing.'
          );
        }
      } finally {
        setAiLoading(false);
      }
    },
    [journey, fromSnapshot, toSnapshot]
  );

  // Load cached AI briefing when pair changes — and auto-trigger once for newly synced uncached pairs
  useEffect(() => {
    let active = true;
    setAiError(null);
    if (!fromSnapshot || !toSnapshot || fromSnapshot.cacheKey === toSnapshot.cacheKey || !journey) {
      setAiBriefing(null);
      return;
    }
    const pairKey = `${fromSnapshot.cacheKey}::${toSnapshot.cacheKey}`;
    void getCachedJourneyBriefing(fromSnapshot.cacheKey, toSnapshot.cacheKey).then((cached) => {
      if (!active) return;
      if (cached) {
        setAiBriefing(cached);
        return;
      }
      setAiBriefing(null);
      if (!autoTriggeredPairsRef.current.has(pairKey)) {
        autoTriggeredPairsRef.current.add(pairKey);
        void handleGenerateAiBriefing(true, true);
      }
    });
    return () => {
      active = false;
    };
  }, [fromSnapshot, toSnapshot, journey, handleGenerateAiBriefing]);

  const handleDeleteSnapshot = async (cacheKey: string) => {
    await deleteSaveHistoryPoint(cacheKey);
    await loadSnapshots();
  };

  const handleClearAllSnapshots = async () => {
    if (!confirmClearAll) {
      setConfirmClearAll(true);
      window.setTimeout(() => setConfirmClearAll(false), 5000);
      return;
    }
    setConfirmClearAll(false);
    await clearAllSaveCache();
    clearProgressionArchive();
    setAiBriefing(null);
    setAiError(null);
    onJourneyReportChange?.(null);
    await loadSnapshots();
  };

  if (loading) {
    return null;
  }

  if (snapshots.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-1.5">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
          <History className="h-4 w-4 text-sky-400" />
          Save-to-Save Journey Report &amp; Progression Archive
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Every full <span className="font-mono text-emerald-400">.fm</span> save sync is stored locally on this device. Sync two different in-game dates to unlock the instant Save-to-Save Journey Report (trajectory chart, what improved/worsened, player stat deltas, and an on-demand AI Journey Briefing).
        </p>
      </div>
    );
  }

  const diff = journey?.baseDiff ?? null;

  // Compute SVG trajectory polyline
  const timelineSvg = (() => {
    const pts = journey?.timeline ?? [];
    if (pts.length < 2) return null;
    const vals = pts.map((p) => {
      if (timelineMetric === 'avgAbility') return p.avgAbility;
      if (timelineMetric === 'totalWagePw') return p.totalWagePw;
      if (timelineMetric === 'xgDiff') return p.xgDiff ?? 0;
      return p.leaguePosition ?? 10;
    });
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = Math.max(0.1, maxV - minV);
    const w = 480;
    const h = 110;
    const padX = 28;
    const padY = 18;
    const plotW = w - padX * 2;
    const plotH = h - padY * 2;

    const coords = pts.map((pt, idx) => {
      const v = vals[idx];
      const norm = (v - minV) / span;
      // Invert Y for leaguePosition (#1 is highest!)
      const yFrac = timelineMetric === 'leaguePosition' ? 1 - norm : norm;
      return {
        x: padX + (idx / Math.max(1, pts.length - 1)) * plotW,
        y: padY + plotH - yFrac * plotH,
        pt,
        v,
      };
    });

    const formatVal = (v: number) => {
      if (timelineMetric === 'avgAbility') return `${v.toFixed(2)}★`;
      if (timelineMetric === 'totalWagePw') return `£${Math.round(v).toLocaleString()}`;
      if (timelineMetric === 'xgDiff') return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
      return `#${Math.round(v)}`;
    };

    const firstVal = vals[0];
    const lastVal = vals[vals.length - 1];
    const netDelta = lastVal - firstVal;
    const netDeltaLabel = (() => {
      if (timelineMetric === 'avgAbility') {
        return `${netDelta >= 0 ? '+' : ''}${netDelta.toFixed(2)}★`;
      }
      if (timelineMetric === 'totalWagePw') {
        return `${formatSignedCurrency(netDelta)}/wk`;
      }
      if (timelineMetric === 'xgDiff') {
        return `${netDelta >= 0 ? '+' : ''}${netDelta.toFixed(2)} xGD`;
      }
      const placesClimbed = Math.round(firstVal - lastVal);
      if (placesClimbed === 0) return 'Unchanged';
      return placesClimbed > 0 ? `+${placesClimbed} places` : `${placesClimbed} places`;
    })();
    const netIsGood =
      timelineMetric === 'leaguePosition'
        ? firstVal - lastVal >= 0
        : timelineMetric === 'totalWagePw'
          ? netDelta <= 0
          : netDelta >= 0;

    const metricSubtitle =
      timelineMetric === 'avgAbility'
        ? 'Mean Current Ability (★) across tracked squad'
        : timelineMetric === 'totalWagePw'
          ? 'Basic weekly playing-squad contracts (£/wk — excludes staff & club commitments)'
          : timelineMetric === 'xgDiff'
            ? 'Competitive xG Differential (League + Cup ONLY — excludes friendlies)'
            : 'League table standing (higher line = better table rank)';

    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
          <div className="space-y-0.5">
            <div className="inline-flex flex-wrap items-center gap-1.5 font-semibold text-slate-200">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              <span>Career Journey Trajectory ({pts.length} saves)</span>
              {journey && (
                <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                  {journey.sameSeason ? journey.toSeason : `${journey.fromSeason} → ${journey.toSeason}`}
                </span>
              )}
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                  netIsGood
                    ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300'
                    : 'border-rose-500/35 bg-rose-500/15 text-rose-300'
                }`}
              >
                {formatVal(firstVal)} → {formatVal(lastVal)} ({netDeltaLabel})
              </span>
            </div>
            <div className="text-[11px] text-slate-400">{metricSubtitle}</div>
          </div>
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-0.5 text-[10px]">
            {(
              [
                { id: 'avgAbility', label: 'Avg Stars ★' },
                { id: 'totalWagePw', label: 'Player Wages' },
                { id: 'xgDiff', label: 'Comp xG' },
                { id: 'leaguePosition', label: 'League Pos' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setTimelineMetric(m.id)}
                className={`min-h-[44px] sm:min-h-[28px] px-2.5 sm:px-2 rounded font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  timelineMetric === m.id
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Career journey trajectory chart">
          {[0, 0.5, 1].map((frac) => {
            const gy = padY + plotH * frac;
            return (
              <line
                key={frac}
                x1={padX}
                y1={gy}
                x2={w - padX}
                y2={gy}
                stroke="rgba(51, 65, 85, 0.45)"
                strokeDasharray="3 3"
                strokeWidth={0.75}
              />
            );
          })}
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth={2.4}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')}
          />
          {coords.map((c, idx) => (
            <g key={`${c.pt.cacheKey}-${idx}`}>
              <circle cx={c.x} cy={c.y} r={4.5} fill="#10b981" stroke="#0f172a" strokeWidth={1.4} />
              {(idx === 0 || idx === coords.length - 1 || coords.length <= 5) && (
                <text
                  x={c.x}
                  y={Math.max(11, c.y - 8)}
                  textAnchor={idx === 0 ? 'start' : idx === coords.length - 1 ? 'end' : 'middle'}
                  className="fill-emerald-300 text-[9px] font-mono tabular-nums font-semibold"
                >
                  {formatVal(c.v)}
                </text>
              )}
              <text
                x={c.x}
                y={h - 3}
                textAnchor={idx === 0 ? 'start' : idx === coords.length - 1 ? 'end' : 'middle'}
                className="fill-slate-400 text-[8.5px] font-mono"
              >
                {c.pt.inGameDate.slice(0, 5)}
              </text>
            </g>
          ))}
        </svg>
        {pts.length === 2 && (
          <div className="text-[10px] text-slate-500">
            2 save checkpoints tracked so far — import future dates to build a multi-month trend curve.
          </div>
        )}
      </div>
    );
  })();

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
            <Database className="h-4 w-4 text-sky-400" />
            Save-to-Save Deep Journey Report
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {snapshots.length} cached save snapshot{snapshots.length === 1 ? '' : 's'} — instant trajectory breakdown plus on-demand AI Journey Briefing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleClearAllSnapshots()}
          className={`min-h-[44px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors shrink-0 whitespace-nowrap ${
            confirmClearAll
              ? 'border-rose-500/60 bg-rose-950/80 text-rose-200 hover:bg-rose-900/80'
              : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-rose-500/40 hover:text-rose-300'
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirmClearAll ? 'Tap Again to Clear All' : 'Clear Snapshots'}
        </button>
      </div>

      {snapshots.length === 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-xs">
          <div className="min-w-0">
            <div className="font-mono font-semibold text-sky-300">
              1 snapshot stored: {snapshots[0].inGameDate} · {snapshots[0].clubName}
            </div>
            <div className="text-[11px] text-slate-400">
              {snapshots[0].players.length} players cached — sync a newer save date to compare, or remove this snapshot to start fresh.
            </div>
          </div>
          <button
            type="button"
            title="Delete stored snapshot"
            onClick={() => void handleDeleteSnapshot(snapshots[0].cacheKey)}
            className="min-h-[44px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-rose-500/40 hover:text-rose-300 transition shrink-0 whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove Snapshot
          </button>
        </div>
      )}

      {snapshots.length >= 2 && (
        <>
          {/* Snapshot selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Baseline Save (From)
              </span>
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Baseline snapshot"
                  value={fromKey}
                  onChange={(e) => setFromKey(e.target.value)}
                  className="w-full min-h-[44px] sm:min-h-[40px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-xs text-slate-100"
                >
                  {snapshots.map((s) => {
                    const seasonTag = s.seasonLabel || deriveFootballSeasonLabel(s.inGameDate);
                    return (
                      <option key={s.cacheKey} value={s.cacheKey}>
                        {s.inGameDate} ({seasonTag}) · {s.clubName} ({s.players.length} players)
                      </option>
                    );
                  })}
                </select>
                {fromSnapshot && (
                  <button
                    type="button"
                    aria-label="Delete baseline snapshot"
                    title="Delete baseline snapshot"
                    onClick={() => void handleDeleteSnapshot(fromSnapshot.cacheKey)}
                    className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Current Save (To)
              </span>
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Comparison snapshot"
                  value={toKey}
                  onChange={(e) => setToKey(e.target.value)}
                  className="w-full min-h-[44px] sm:min-h-[40px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-xs text-slate-100"
                >
                  {snapshots.map((s) => {
                    const seasonTag = s.seasonLabel || deriveFootballSeasonLabel(s.inGameDate);
                    return (
                      <option key={s.cacheKey} value={s.cacheKey}>
                        {s.inGameDate} ({seasonTag}) · {s.clubName} ({s.players.length} players)
                      </option>
                    );
                  })}
                </select>
                {toSnapshot && (
                  <button
                    type="button"
                    aria-label="Delete comparison snapshot"
                    title="Delete comparison snapshot"
                    onClick={() => void handleDeleteSnapshot(toSnapshot.cacheKey)}
                    className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </label>
          </div>

          {!journey || !diff ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
              Select two different saves above to generate the full Journey Report.
            </div>
          ) : (
            <div className="space-y-4">
              {/* KPI Deltas Strip (Zero raw CA/PA — Star Rating ★ only) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Squad Size
                  </div>
                  <div className="mt-1 flex items-baseline justify-between font-mono tabular-nums">
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

                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Avg Squad Rating (★)
                  </div>
                  <div className="mt-1 flex items-baseline justify-between font-mono tabular-nums">
                    <span className="text-sm font-bold text-white">
                      {diff.kpiDeltas.toAvgAbility.toFixed(2)}★
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
                      {diff.kpiDeltas.avgAbilityDelta.toFixed(2)}★
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Player Wages (Basic)
                  </div>
                  <div className="mt-1 flex items-baseline justify-between font-mono tabular-nums">
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
                      {formatSignedCurrency(diff.kpiDeltas.totalWageDeltaPw)}
                    </span>
                  </div>
                  {typeof diff.kpiDeltas.toClubWagePayrollWeekly === 'number' &&
                    diff.kpiDeltas.toClubWagePayrollWeekly > 0 && (
                      <div className="mt-0.5 text-[10px] font-mono text-slate-400 tabular-nums truncate">
                        Club Payroll: £{diff.kpiDeltas.toClubWagePayrollWeekly.toLocaleString()}
                        {typeof diff.kpiDeltas.toWageBudgetWeekly === 'number' &&
                        diff.kpiDeltas.toWageBudgetWeekly > 0
                          ? ` / £${diff.kpiDeltas.toWageBudgetWeekly.toLocaleString()}`
                          : ''}{' '}
                        p/w
                      </div>
                    )}
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Balance / Table
                  </div>
                  <div className="mt-1 text-xs font-mono text-white truncate tabular-nums">
                    {diff.kpiDeltas.toBalance || '--'}
                    {diff.kpiDeltas.toLeaguePosition != null && (
                      <span className="text-sky-400 ml-1.5">
                        #{diff.kpiDeltas.toLeaguePosition}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Season & Competition Scope Split (League vs Cup vs Friendlies — never mixed!) */}
              {journey.competitionComparison.to && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-100">
                        {journey.toSeason} Competition Breakdown
                      </span>
                      <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                        Competitive: {journey.competitionComparison.to.competitive.played} GP
                        {journey.competitionComparison.to.competitive.xgDiff !== null
                          ? ` · xGD ${journey.competitionComparison.to.competitive.xgDiff >= 0 ? '+' : ''}${journey.competitionComparison.to.competitive.xgDiff.toFixed(2)}`
                          : ''}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">
                      {journey.sameSeason
                        ? `Same Season (${journey.toSeason})`
                        : `Cross-Season (${journey.fromSeason} → ${journey.toSeason})`}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    {(
                      [
                        {
                          label: 'League',
                          isLeague: true,
                          rec: journey.competitionComparison.to.league,
                          prev: journey.sameSeason ? journey.competitionComparison.from?.league ?? null : null,
                          tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-950/15',
                          subtitle: 'Counts toward table & competitive xG',
                        },
                        {
                          label: 'Cup',
                          isLeague: false,
                          rec: journey.competitionComparison.to.cup,
                          prev: journey.sameSeason ? journey.competitionComparison.from?.cup ?? null : null,
                          tone: 'text-sky-300 border-sky-500/30 bg-sky-950/15',
                          subtitle: 'Knockout ties · 0 league pts · in comp xG',
                        },
                        {
                          label: 'Friendlies',
                          isLeague: false,
                          rec: journey.competitionComparison.to.friendly,
                          prev: journey.sameSeason ? journey.competitionComparison.from?.friendly ?? null : null,
                          tone: 'text-amber-300 border-amber-500/25 bg-amber-950/10',
                          subtitle: 'Excluded from competitive xG & form',
                        },
                      ] as const
                    ).map((bucket) => {
                      const ppg =
                        bucket.isLeague && bucket.rec.played > 0
                          ? (bucket.rec.points / bucket.rec.played).toFixed(2)
                          : null;
                      const winPct =
                        bucket.rec.played > 0
                          ? Math.round((bucket.rec.won / bucket.rec.played) * 100)
                          : null;
                      const gd = bucket.rec.goalsFor - bucket.rec.goalsAgainst;
                      const gpDelta =
                        bucket.prev != null ? bucket.rec.played - bucket.prev.played : null;
                      return (
                        <div
                          key={bucket.label}
                          className={`rounded-lg border px-3 py-2.5 space-y-1 ${bucket.tone}`}
                        >
                          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold">
                            <span>{bucket.label}</span>
                            <span className="font-mono">
                              {bucket.rec.played} GP
                              {gpDelta != null && gpDelta > 0 ? ` (+${gpDelta})` : ''}
                            </span>
                          </div>
                          {bucket.rec.played === 0 ? (
                            <div className="text-[11px] text-slate-500 py-0.5">
                              No matches recorded yet
                            </div>
                          ) : (
                            <div className="space-y-1 font-mono tabular-nums text-[11px]">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-white font-bold">
                                  {bucket.rec.won}W-{bucket.rec.drawn}D-{bucket.rec.lost}L
                                </span>
                                <span className="text-[10px] text-slate-300">
                                  {bucket.rec.goalsFor}:{bucket.rec.goalsAgainst} ({gd >= 0 ? '+' : ''}{gd})
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-300">
                                <span>
                                  {bucket.isLeague
                                    ? `${bucket.rec.points} Pts · ${ppg} PPG · ${winPct}% Win`
                                    : `${winPct}% Win`}
                                </span>
                                <span>
                                  {bucket.rec.xgFor !== null && bucket.rec.xgAgainst !== null
                                    ? `xG ${bucket.rec.xgFor.toFixed(2)}–${bucket.rec.xgAgainst.toFixed(2)} (${
                                        (bucket.rec.xgDiff ?? 0) >= 0 ? '+' : ''
                                      }${(bucket.rec.xgDiff ?? 0).toFixed(2)})`
                                    : 'No xG data'}
                                </span>
                              </div>
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500 pt-0.5">
                            {bucket.subtitle}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* At-a-Glance Journey Change Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/15 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-300/80">Improved</div>
                  <div className="mt-0.5 font-mono font-bold text-white">
                    {journey.improved.length} signal{journey.improved.length === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="rounded-lg border border-rose-500/25 bg-rose-950/15 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-rose-300/80">Worsened</div>
                  <div className="mt-0.5 font-mono font-bold text-white">
                    {journey.worsened.length} watchpoint{journey.worsened.length === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="rounded-lg border border-sky-500/25 bg-sky-950/15 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-sky-300/80">Stat Movers</div>
                  <div className="mt-0.5 font-mono font-bold text-white">
                    {journey.playerStatDeltas.length} player{journey.playerStatDeltas.length === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Roster Turnover</div>
                  <div className="mt-0.5 font-mono font-bold text-white">
                    +{diff.newgens.length} in · -{diff.departed.length} out
                  </div>
                </div>
              </div>

              {/* Trajectory Chart */}
              {timelineSvg}

              {/* AI Career Journey Narrative Box */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-white flex flex-wrap items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                      AI Career Journey Narrative ({journey.fromDate} → {journey.toDate})
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Deep scouting, tactical &amp; governance review separating League, Cup &amp; Friendlies — cached locally.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={() => void handleGenerateAiBriefing(Boolean(aiBriefing), false)}
                      className="min-h-[44px] sm:min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-3 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                    >
                      {aiLoading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Generating...
                        </>
                      ) : aiBriefing ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5" /> Refresh Briefing
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" /> Generate AI Briefing
                        </>
                      )}
                    </button>
                    {onAskAnalyst && (
                      <button
                        type="button"
                        onClick={() =>
                          onAskAnalyst(
                            `Review my Save-to-Save Career Journey (${journey.fromDate} -> ${journey.toDate}, ${journey.toSeason}). Separate League, Cup, and Friendlies clearly — what improved, what worsened, which players stepped up or dropped off, and what should we adjust next?`
                          )
                        }
                        className="min-h-[44px] sm:min-h-[38px] inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 px-3 text-xs font-semibold text-sky-200 transition-colors whitespace-nowrap"
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> Discuss in Analyst
                      </button>
                    )}
                  </div>
                </div>

                {aiError && (
                  <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{aiError}</span>
                  </div>
                )}

                {aiBriefing && (
                  <div className="space-y-3 pt-2 border-t border-slate-800 text-xs">
                    <div>
                      <div className="text-sm font-bold text-emerald-300">
                        {aiBriefing.headline}
                      </div>
                      <p className="mt-1 text-slate-200 leading-relaxed">
                        {aiBriefing.journeyArc}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 space-y-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                          What Improved
                        </div>
                        <ul className="space-y-1 text-slate-200 list-disc pl-4">
                          {aiBriefing.whatImproved.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 space-y-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                          What Worsened
                        </div>
                        <ul className="space-y-1 text-slate-200 list-disc pl-4">
                          {aiBriefing.whatWorsened.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 space-y-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                          Things To Note
                        </div>
                        <ul className="space-y-1 text-slate-200 list-disc pl-4">
                          {aiBriefing.thingsToNote.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px]">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-400 mb-1">
                          Tactical Evolution
                        </div>
                        <p className="text-slate-200 leading-relaxed">
                          {aiBriefing.tacticalEvolution}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300 mb-1">
                          Governance &amp; Promises Audit
                        </div>
                        <p className="text-slate-200 leading-relaxed">
                          {aiBriefing.governanceAndPromisesAudit}
                        </p>
                      </div>
                    </div>

                    {aiBriefing.priorityNextActions.length > 0 && (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 space-y-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                          Priority Next Actions
                        </div>
                        <ol className="list-decimal pl-4 space-y-1 text-slate-200">
                          {aiBriefing.priorityNextActions.map((act, idx) => (
                            <li key={idx}>{act}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Filterable Journey Category Tabs */}
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    {
                      id: 'summary',
                      label: `Improved / Worsened (${journey.improved.length + journey.worsened.length})`,
                      icon: TrendingUp,
                    },
                    {
                      id: 'stats',
                      label: `Match Stat Deltas (${journey.playerStatDeltas.length})`,
                      icon: Sparkles,
                    },
                    {
                      id: 'risers',
                      label: `Star Risers (${diff.risers.length})`,
                      icon: ArrowUpRight,
                    },
                    {
                      id: 'fallers',
                      label: `Star Fallers (${diff.fallers.length})`,
                      icon: ArrowDownRight,
                    },
                    {
                      id: 'contracts',
                      label: `Contracts (${diff.contractChanges.length})`,
                      icon: FileSignature,
                    },
                    {
                      id: 'arrivals',
                      label: `Arrivals (${diff.newgens.length})`,
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
                      className={`min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Active Tab Content */}
              {activeTab === 'summary' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                      Improved ({journey.improved.length})
                    </div>
                    {journey.improved.length === 0 ? (
                      <p className="text-slate-500">No major upward shifts between these two saves.</p>
                    ) : (
                      journey.improved.map((item, idx) => (
                        <div key={idx} className="space-y-0.5 border-t border-slate-800/70 pt-2 first:border-t-0 first:pt-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-white">{item.title}</span>
                            {item.deltaLabel && (
                              <span className="font-mono text-[11px] text-emerald-400 shrink-0">
                                {item.deltaLabel}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">{item.detail}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                      Worsened ({journey.worsened.length})
                    </div>
                    {journey.worsened.length === 0 ? (
                      <p className="text-slate-500">No downward regressions detected.</p>
                    ) : (
                      journey.worsened.map((item, idx) => (
                        <div key={idx} className="space-y-0.5 border-t border-slate-800/70 pt-2 first:border-t-0 first:pt-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-white">{item.title}</span>
                            {item.deltaLabel && (
                              <span className="font-mono text-[11px] text-rose-400 shrink-0">
                                {item.deltaLabel}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">{item.detail}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                      Things To Note ({journey.thingsToNote.length})
                    </div>
                    {journey.thingsToNote.length === 0 ? (
                      <p className="text-slate-500">No structural or governance alerts.</p>
                    ) : (
                      journey.thingsToNote.map((item, idx) => (
                        <div key={idx} className="space-y-0.5 border-t border-slate-800/70 pt-2 first:border-t-0 first:pt-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-white">{item.title}</span>
                            {item.deltaLabel && (
                              <span className="font-mono text-[11px] text-amber-300 shrink-0">
                                {item.deltaLabel}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">{item.detail}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/70 max-h-64 overflow-y-auto text-xs">
                  {activeTab === 'stats' &&
                    (journey.playerStatDeltas.length === 0 ? (
                      <div className="p-4 text-slate-500">
                        No match-stat changes recorded between {diff.fromDate} and {diff.toDate}.
                      </div>
                    ) : (
                      journey.playerStatDeltas.map((p) => (
                        <div
                          key={p.uid}
                          className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-white">{p.name}</span>
                            <span className="ml-2 text-slate-400">{p.position}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums">
                            {p.minutesDelta !== 0 && (
                              <span className="text-slate-300">
                                {p.minutesDelta > 0 ? '+' : ''}
                                {p.minutesDelta}m
                              </span>
                            )}
                            {p.goalsDelta !== 0 && (
                              <span className="text-emerald-400">
                                {p.goalsDelta > 0 ? '+' : ''}
                                {p.goalsDelta}G
                              </span>
                            )}
                            {p.assistsDelta !== 0 && (
                              <span className="text-sky-300">
                                {p.assistsDelta > 0 ? '+' : ''}
                                {p.assistsDelta}A
                              </span>
                            )}
                            {p.ratingDelta != null && Math.abs(p.ratingDelta) >= 0.05 && (
                              <span
                                className={
                                  p.ratingDelta > 0 ? 'text-emerald-300' : 'text-rose-400'
                                }
                              >
                                {p.ratingDelta > 0 ? '+' : ''}
                                {p.ratingDelta.toFixed(2)} rt
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    ))}

                  {activeTab === 'risers' &&
                    (diff.risers.length === 0 ? (
                      <div className="p-4 text-slate-500">
                        No star-rating risers detected between {diff.fromDate} and {diff.toDate}.
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
                          <div className="font-mono text-emerald-400 shrink-0 tabular-nums">
                            +{p.abilityDelta.toFixed(1)}★
                            {p.potentialDelta !== 0 && (
                              <span className="ml-2 text-sky-300">
                                Pot {p.potentialDelta > 0 ? '+' : ''}
                                {p.potentialDelta.toFixed(1)}★
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    ))}

                  {activeTab === 'fallers' &&
                    (diff.fallers.length === 0 ? (
                      <div className="p-4 text-slate-500">
                        No star-rating declines detected between {diff.fromDate} and {diff.toDate}.
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
                          <div className="font-mono text-rose-400 shrink-0 tabular-nums">
                            {p.abilityDelta.toFixed(1)}★
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
                          <div className="font-mono text-[11px] text-slate-300 tabular-nums">
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
                          <span className="font-mono text-[11px] text-emerald-300">
                            New Arrival{p.abilityDelta > 0 ? ` · +${p.abilityDelta.toFixed(1)}★` : ''}
                          </span>
                        </div>
                      ))
                    ))}

                  {activeTab === 'departed' &&
                    (diff.departed.length === 0 ? (
                      <div className="p-4 text-slate-500">No squad departures detected.</div>
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
                          <span className="font-mono text-slate-400 tabular-nums">
                            {p.ability.toFixed(1)}★ · {formatWeeklyWage(p.wagePw)}
                          </span>
                        </div>
                      ))
                    ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
