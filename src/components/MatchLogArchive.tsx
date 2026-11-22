import React, { useMemo, useState } from 'react';
import { Calendar, Filter, Sparkles, Trophy } from 'lucide-react';
import { MatchLogEntry } from '../types/fm27';
import { computeCompetitiveSummary } from '../utils/fmSyncEngine';

export interface PostMatchDebriefData {
  headlineVerdict: string;
  xgAndExecutionAudit: string;
  primaryTacticalFlaws: string[];
  subOptimalRoleCombinations: string[];
  inGameAdjustmentRecommendations: string[];
  source: 'Playbook v2.0 Engine' | 'Gemini 3.5 Tactical Analyst';
}

export function buildDeterministicPostMatchDebrief(
  m: MatchLogEntry
): PostMatchDebriefData {
  const xgFor = typeof m.xGFor === 'number' ? m.xGFor : null;
  const xgAg = typeof m.xGAgainst === 'number' ? m.xGAgainst : null;
  const poss = typeof m.possession === 'number' ? m.possession : null;
  const passPct = typeof m.passCompletion === 'number' ? m.passCompletion : null;

  const [gfRaw, gaRaw] = (m.score || '0 - 0')
    .split('-')
    .map((s) => Number(s.trim()) || 0);
  const gf = gfRaw ?? 0;
  const ga = gaRaw ?? 0;

  const xgDiff = xgFor !== null && xgAg !== null ? xgFor - xgAg : gf - ga;
  const headlineVerdict =
    m.result === 'W'
      ? xgDiff >= 0.4
        ? `Dominant ${m.score} win vs ${m.opponent} (+${xgDiff.toFixed(2)} xG margin).`
        : `Clinical ${m.score} win vs ${m.opponent} overcoming tight xG margins.`
      : m.result === 'D'
        ? xgDiff >= 0.5
          ? `Frustrating ${m.score} draw vs ${m.opponent} despite creating +${xgDiff.toFixed(2)} xG superiority.`
          : `Hard-fought ${m.score} draw vs ${m.opponent} (${m.venue === 'H' ? 'Home' : 'Away'}).`
        : xgDiff > 0.2
          ? `Unlucky ${m.score} defeat vs ${m.opponent} despite winning the xG battle (${xgFor?.toFixed(2) ?? gf} vs ${xgAg?.toFixed(2) ?? ga}).`
          : `Deserved ${m.score} defeat vs ${m.opponent}; defensive transition structure conceded high-quality chances.`;

  const xgAndExecutionAudit = [
    xgFor !== null && xgAg !== null
      ? `xG: ${xgFor.toFixed(2)} For vs ${xgAg.toFixed(2)} Against (Finishing delta ${(gf - xgFor >= 0 ? '+' : '') + (gf - xgFor).toFixed(2)}G)`
      : `Scoreline: ${m.score}`,
    m.shotsFor && m.shotsFor !== '—' ? `Shots: ${m.shotsFor} vs ${m.shotsAgainst || '—'}` : null,
    poss !== null ? `Possession: ${poss}%` : null,
    passPct !== null ? `Pass Completion: ${passPct}%` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const primaryTacticalFlaws: string[] = [];
  if ((xgAg !== null && xgAg >= 1.35) || ga >= 2) {
    primaryTacticalFlaws.push(
      `Defensive transition leakage (${xgAg !== null ? `${xgAg.toFixed(2)} xGA` : `${ga} GA`}): opponent exploited half-space or wide overload behind full-backs.`
    );
  }
  if ((xgFor !== null && xgFor < 0.95) || gf === 0) {
    primaryTacticalFlaws.push(
      `Low final-third box penetration (${xgFor !== null ? `${xgFor.toFixed(2)} xG` : '0 goals'}): striker isolated from wide & channel runners.`
    );
  }
  if (poss !== null && poss < 45) {
    primaryTacticalFlaws.push(
      `Progression turnovers (${poss}% possession): midfield pivot bypassed under opponent counter-press.`
    );
  }
  if (primaryTacticalFlaws.length === 0) {
    primaryTacticalFlaws.push(
      'Controlled both boxes cleanly; monitor 62m–75m wide stamina drop-off to prevent late set-piece concessions.'
    );
  }

  const subOptimalRoleCombinations: string[] = [
    'Ensure both AML and AMR remain on Tracking Winger OOP (never Wide Outlet Winger OOP) when protecting parity or leads.',
    'Maintain a 2-3 or 3-2 Rest-Defense Base (Screening DM + Holding Full-Backs) so both flanks never vacate simultaneously.',
  ];

  const inGameAdjustmentRecommendations: string[] = [
    ga >= 2
      ? 'Drop OOP Defensive Line 1 notch & lock DM to Screening Defensive Midfielder OOP for the next fixture.'
      : 'Keep Balanced Ground Build-Up + Short/Mixed GK Distribution to protect Zone 5 rest-defense.',
    gf === 0
      ? 'At 60m if level/behind: trigger "Play With More Urgency" + "Swap Wings" while keeping 3 midfielders on pitch.'
      : 'Execute 2-Window Substitution Script (62m lowest-stamina wide/CM runners; 75m closer window without touching both CBs).',
  ];

  return {
    headlineVerdict,
    xgAndExecutionAudit,
    primaryTacticalFlaws,
    subOptimalRoleCombinations,
    inGameAdjustmentRecommendations,
    source: 'Playbook v2.0 Engine',
  };
}

interface MatchLogArchiveProps {
  matches: MatchLogEntry[];
  liveLeagueRecord?: string | null;
  liveSaveFileName?: string | null;
  clubName?: string;
  saveDate?: string;
  activeShape?: string;
  activeTacticSummary?: string | null;
}

export function getFootballSeasonLabel(dateStr: string): string {
  const s = (dateStr || '').trim();
  let year: number | null = null;
  let month: number | null = null;

  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else {
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
    }
  }

  if (!year || !month) return 'Unknown Season';
  // European football season runs July 1 -> June 30
  const startYear = month >= 7 ? year : year - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}/${endShort}`;
}

function classifyCompetition(comp: string): 'League' | 'Cup / Friendly' {
  const c = (comp || '').toLowerCase();
  if (
    c.includes('friendly') ||
    c.includes('cup') ||
    c.includes('beker') ||
    c.includes('trophy') ||
    c.includes('playoff')
  ) {
    return 'Cup / Friendly';
  }
  return 'League';
}

export const MatchLogArchive: React.FC<MatchLogArchiveProps> = ({
  matches,
  liveLeagueRecord,
  liveSaveFileName,
  clubName,
  saveDate,
  activeShape = '4-3-3 DM Wide',
  activeTacticSummary = null,
}) => {
  const seasons = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) {
      set.add(getFootballSeasonLabel(m.date));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [matches]);

  const currentSeason = useMemo(() => {
    if (saveDate && saveDate !== '--') {
      const fromSave = getFootballSeasonLabel(saveDate);
      if (seasons.includes(fromSave)) return fromSave;
    }
    return seasons[0] || 'ALL';
  }, [saveDate, seasons]);

  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [compFilter, setCompFilter] = useState<'ALL' | 'League' | 'Cup / Friendly'>('ALL');
  const [openDebriefMatchId, setOpenDebriefMatchId] = useState<string | null>(
    null
  );
  const [aiDebriefByMatchId, setAiDebriefByMatchId] = useState<
    Record<string, PostMatchDebriefData>
  >({});
  const [loadingAiMatchId, setLoadingAiMatchId] = useState<string | null>(null);

  const handleRequestAiDebrief = async (m: MatchLogEntry) => {
    setLoadingAiMatchId(m.id);
    try {
      const res = await fetch('/api/fm27/match-debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubName: clubName || 'Managed Club',
          activeShape,
          activeTacticSummary: activeTacticSummary || undefined,
          matchSummary: {
            date: m.date,
            competition: m.competition,
            opponent: m.opponent,
            venue: m.venue,
            result: m.result,
            score: m.score,
            xGFor: m.xGFor,
            xGAgainst: m.xGAgainst,
            possession: m.possession,
            passCompletion: m.passCompletion,
            shotsFor: m.shotsFor,
            shotsAgainst: m.shotsAgainst,
            cccFor: m.cccFor,
            cccAgainst: m.cccAgainst,
          },
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as Partial<PostMatchDebriefData>;
      if (data.headlineVerdict && Array.isArray(data.primaryTacticalFlaws)) {
        setAiDebriefByMatchId((prev) => ({
          ...prev,
          [m.id]: {
            headlineVerdict: data.headlineVerdict!,
            xgAndExecutionAudit: data.xgAndExecutionAudit || '',
            primaryTacticalFlaws: data.primaryTacticalFlaws || [],
            subOptimalRoleCombinations: data.subOptimalRoleCombinations || [],
            inGameAdjustmentRecommendations:
              data.inGameAdjustmentRecommendations || [],
            source: 'Gemini 3.5 Tactical Analyst',
          },
        }));
      }
    } catch {
      // Fall back silently to deterministic Playbook v2.0 debrief
    } finally {
      setLoadingAiMatchId(null);
    }
  };

  const activeSeason = selectedSeason || currentSeason;

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      const season = getFootballSeasonLabel(m.date);
      if (activeSeason !== 'ALL' && season !== activeSeason) return false;
      if (compFilter !== 'ALL' && classifyCompetition(m.competition) !== compFilter) {
        return false;
      }
      return true;
    });
  }, [matches, activeSeason, compFilter]);

  const filteredSummary = useMemo(
    () => computeCompetitiveSummary(filteredMatches),
    [filteredMatches]
  );

  const wins = filteredMatches.filter((m) => m.result === 'W').length;
  const draws = filteredMatches.filter((m) => m.result === 'D').length;
  const losses = filteredMatches.filter((m) => m.result === 'L').length;

  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              {clubName && clubName !== '--'
                ? `${clubName} · Match Log by Season & Competition`
                : 'Match Log by Season & Competition'}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {liveSaveFileName
                ? `Synced from ${liveSaveFileName} · Separated by season (Jul–Jun) and competition`
                : 'Awaiting .fm Save — Import your .fm save file to populate played fixtures and results'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-700 dark:text-slate-300">
            {liveLeagueRecord && (
              <span className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-emerald-300 font-semibold">
                Current League: {liveLeagueRecord}
              </span>
            )}
            {filteredMatches.length > 0 && (
              <span className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1 text-slate-200">
                Showing {filteredMatches.length} GP: {wins}W-{draws}D-{losses}L
                {filteredSummary.xgMatchesCount > 0
                  ? ` · xG ${filteredSummary.totalXgFor.toFixed(2)}-${filteredSummary.totalXgAgainst.toFixed(2)}`
                  : ''}
              </span>
            )}
          </div>
        </div>

        {/* Season & Competition Filter Controls */}
        {matches.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 mr-1">
                <Calendar className="w-3.5 h-3.5" /> Season:
              </span>
              {seasons.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedSeason(s)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition ${
                    activeSeason === s
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {s}
                  {s === currentSeason ? ' (Current)' : ''}
                </button>
              ))}
              {seasons.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSelectedSeason('ALL')}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition ${
                    activeSeason === 'ALL'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  All Seasons
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 mr-1">
                <Filter className="w-3.5 h-3.5" /> Comp:
              </span>
              {(['ALL', 'League', 'Cup / Friendly'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCompFilter(c)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition ${
                    compFilter === c
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {c === 'ALL' ? 'All Comps' : c}
                </button>
              ))}
            </div>
          </div>
        )}

        {matches.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Trophy className="w-8 h-8 text-emerald-500 mx-auto" />
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Awaiting .fm Save — 0 Played Matches Loaded
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
              Zero pre-filled matches or guessed xG figures. Drop your{' '}
              <span className="font-mono text-emerald-400">.fm</span> save file
              in the <strong>Analyst</strong> tab to populate all played matches.
            </p>
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            No matches found for <strong>{activeSeason}</strong> ({compFilter}). Try switching the competition or season filter above.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredMatches.map((m) => {
              const seasonLabel = getFootballSeasonLabel(m.date);
              const compBucket = classifyCompetition(m.competition);
              const hasXg =
                typeof m.xGFor === 'number' && typeof m.xGAgainst === 'number';
              const resultBadge =
                m.result === 'W'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : m.result === 'D'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : 'bg-rose-500/15 text-rose-300 border-rose-500/40';

              const hasShots =
                Boolean(m.shotsFor && m.shotsFor !== '—' && m.shotsFor !== '-');
              const hasMetrics =
                hasXg ||
                m.possession !== null ||
                hasShots ||
                m.passCompletion !== null;

              return (
                <React.Fragment key={m.id}>
                <div
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-mono text-slate-400">{m.date}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                        {seasonLabel}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          compBucket === 'League'
                            ? 'bg-indigo-500/15 text-indigo-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {m.competition}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      vs {m.opponent}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        ({m.venue === 'H' ? 'Home' : 'Away'})
                      </span>
                    </div>
                    {hasMetrics && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-400">
                        {hasXg && (
                          <span>
                            xG{' '}
                            <strong className="text-slate-200">
                              {m.xGFor?.toFixed(2)}
                            </strong>{' '}
                            -{' '}
                            <strong className="text-slate-200">
                              {m.xGAgainst?.toFixed(2)}
                            </strong>
                          </span>
                        )}
                        {hasShots && (
                          <span>
                            Shots{' '}
                            <strong className="text-slate-200">
                              {m.shotsFor}
                            </strong>
                            {m.shotsAgainst && m.shotsAgainst !== '—'
                              ? ` vs ${m.shotsAgainst}`
                              : ''}
                          </span>
                        )}
                        {m.possession !== null && (
                          <span>
                            Poss{' '}
                            <strong className="text-slate-200">
                              {Number(m.possession).toFixed(
                                Number.isInteger(m.possession) ? 0 : 1
                              )}
                              %
                            </strong>
                          </span>
                        )}
                        {m.passCompletion !== null && (
                          <span>
                            Pass{' '}
                            <strong className="text-slate-200">
                              {m.passCompletion}%
                            </strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenDebriefMatchId((curr) =>
                          curr === m.id ? null : m.id
                        )
                      }
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                        openDebriefMatchId === m.id
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-950/70 text-slate-300 border-slate-700 hover:border-emerald-500/40'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      {openDebriefMatchId === m.id ? 'Hide Debrief' : 'Post-Match Debrief'}
                    </button>
                    <span
                      className={`rounded-lg border px-2.5 py-1 text-xs font-mono font-bold ${resultBadge}`}
                    >
                      {m.result} {m.score}
                    </span>
                  </div>
                </div>
                {openDebriefMatchId === m.id &&
                  (() => {
                    const debrief =
                      aiDebriefByMatchId[m.id] ||
                      buildDeterministicPostMatchDebrief(m);
                    return (
                      <div className="mb-3 rounded-xl border border-emerald-500/30 bg-slate-950/90 p-3.5 space-y-2.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-bold text-emerald-300">
                              {debrief.headlineVerdict}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                              {debrief.xgAndExecutionAudit}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-slate-900 border border-slate-700 px-2 py-0.5 text-[10px] font-mono text-slate-300">
                              {debrief.source}
                            </span>
                            {!aiDebriefByMatchId[m.id] && (
                              <button
                                type="button"
                                disabled={loadingAiMatchId === m.id}
                                onClick={() => handleRequestAiDebrief(m)}
                                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2.5 py-1 text-[11px] font-semibold text-white transition cursor-pointer"
                              >
                                {loadingAiMatchId === m.id
                                  ? 'Analyzing...'
                                  : 'Deep AI Debrief'}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 space-y-1">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300">
                              Primary Tactical Flaws
                            </div>
                            <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-300">
                              {debrief.primaryTacticalFlaws.map((f, idx) => (
                                <li key={idx}>{f}</li>
                              ))}
                            </ul>
                          </div>

                          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 space-y-1">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
                              Dual-Phase Role Audit
                            </div>
                            <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-300">
                              {debrief.subOptimalRoleCombinations.map((r, idx) => (
                                <li key={idx}>{r}</li>
                              ))}
                            </ul>
                          </div>

                          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 space-y-1">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                              In-Game Adjustments
                            </div>
                            <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-300">
                              {debrief.inGameAdjustmentRecommendations.map(
                                (adj, idx) => (
                                  <li key={idx}>{adj}</li>
                                )
                              )}
                            </ul>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
