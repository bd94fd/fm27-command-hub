import React, { useMemo, useState } from 'react';
import { Calendar, Filter, Trophy } from 'lucide-react';
import { MatchLogEntry } from '../types/fm27';
import {
  buildMatchMomentumSummary,
  buildSeasonChronicle,
} from '../utils/seasonInsights';
import {
  classifyMatchEntryBucket,
  deriveFootballSeasonLabel,
  formatCompetitionFilterLabel,
  MatchCompetitionFilter,
  matchesEntryCompetitionFilter,
  parseScoreGoals,
  summarizeMatchesByScope,
} from '../utils/matchScopeHelpers';
import { MatchXgMomentumChart } from './charts/MatchXgMomentumChart';
import { MatchLogCard } from './MatchLogCard';

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
  return deriveFootballSeasonLabel(dateStr);
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
  const [compFilter, setCompFilter] = useState<MatchCompetitionFilter | null>(null);
  const [openDebriefMatchId, setOpenDebriefMatchId] = useState<string | null>(
    null
  );
  const [aiDebriefByMatchId, setAiDebriefByMatchId] = useState<
    Record<string, PostMatchDebriefData>
  >({});
  const [aiDebriefErrorByMatchId, setAiDebriefErrorByMatchId] = useState<
    Record<string, string>
  >({});
  const [loadingAiMatchId, setLoadingAiMatchId] = useState<string | null>(null);

  const handleRequestAiDebrief = async (m: MatchLogEntry) => {
    setLoadingAiMatchId(m.id);
    setAiDebriefErrorByMatchId((prev) => {
      if (!(m.id in prev)) return prev;
      const next = { ...prev };
      delete next[m.id];
      return next;
    });
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
      if (!res.ok) {
        let errDetail = `AI debrief unavailable (HTTP ${res.status})`;
        try {
          const errJson = (await res.json()) as { error?: string };
          if (errJson?.error) errDetail = errJson.error;
        } catch {
          // keep status fallback
        }
        setAiDebriefErrorByMatchId((prev) => ({ ...prev, [m.id]: errDetail }));
        return;
      }
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
      } else {
        setAiDebriefErrorByMatchId((prev) => ({
          ...prev,
          [m.id]: 'AI debrief response was incomplete — showing deterministic Playbook audit.',
        }));
      }
    } catch (err) {
      setAiDebriefErrorByMatchId((prev) => ({
        ...prev,
        [m.id]:
          err instanceof Error
            ? err.message
            : 'Could not reach AI debrief service — showing deterministic Playbook audit.',
      }));
    } finally {
      setLoadingAiMatchId(null);
    }
  };

  const activeSeason = selectedSeason || currentSeason;

  const seasonScopedMatches = useMemo(() => {
    return matches.filter((m) => {
      const season = getFootballSeasonLabel(m.date);
      if (activeSeason !== 'ALL' && season !== activeSeason) return false;
      return true;
    });
  }, [matches, activeSeason]);

  const seasonScopeBreakdown = useMemo(
    () =>
      summarizeMatchesByScope(
        matches,
        activeSeason === 'ALL' ? 'ALL' : activeSeason
      ),
    [matches, activeSeason]
  );

  const seasonBucketCounts = useMemo(
    () => ({
      competitive: seasonScopeBreakdown.competitive.played,
      league: seasonScopeBreakdown.league.played,
      cup: seasonScopeBreakdown.cup.played,
      friendly: seasonScopeBreakdown.friendly.played,
      all: seasonScopeBreakdown.all.played,
    }),
    [seasonScopeBreakdown]
  );

  const activeCompFilter: MatchCompetitionFilter =
    compFilter ?? (seasonBucketCounts.competitive > 0 ? 'competitive' : 'all');

  const filteredMatches = useMemo(() => {
    return seasonScopedMatches.filter((m) =>
      matchesEntryCompetitionFilter(m, activeCompFilter, seasonScopedMatches)
    );
  }, [seasonScopedMatches, activeCompFilter]);

  const filteredXgStats = useMemo(() => {
    const xgMatches = filteredMatches.filter(
      (m) => typeof m.xGFor === 'number' && typeof m.xGAgainst === 'number'
    );
    const totalXgFor = xgMatches.reduce((sum, m) => sum + (m.xGFor ?? 0), 0);
    const totalXgAgainst = xgMatches.reduce(
      (sum, m) => sum + (m.xGAgainst ?? 0),
      0
    );
    let xgGoalsFor = 0;
    let xgGoalsAgainst = 0;
    for (const m of xgMatches) {
      const [gf, ga] = parseScoreGoals(m.score);
      xgGoalsFor += gf;
      xgGoalsAgainst += ga;
    }
    let goalsFor = 0;
    let goalsAgainst = 0;
    let cleanSheets = 0;
    let homeW = 0;
    let homeD = 0;
    let homeL = 0;
    let awayW = 0;
    let awayD = 0;
    let awayL = 0;
    for (const m of filteredMatches) {
      const [gf, ga] = parseScoreGoals(m.score);
      goalsFor += gf;
      goalsAgainst += ga;
      if (ga === 0) cleanSheets += 1;
      if (m.venue === 'H') {
        if (m.result === 'W') homeW += 1;
        else if (m.result === 'D') homeD += 1;
        else homeL += 1;
      } else {
        if (m.result === 'W') awayW += 1;
        else if (m.result === 'D') awayD += 1;
        else awayL += 1;
      }
    }
    return {
      count: xgMatches.length,
      totalXgFor,
      totalXgAgainst,
      xgGoalsFor,
      xgGoalsAgainst,
      goalsFor,
      goalsAgainst,
      cleanSheets,
      homeRecord: `${homeW}W-${homeD}D-${homeL}L`,
      awayRecord: `${awayW}W-${awayD}D-${awayL}L`,
    };
  }, [filteredMatches]);

  const wins = filteredMatches.filter((m) => m.result === 'W').length;
  const draws = filteredMatches.filter((m) => m.result === 'D').length;
  const losses = filteredMatches.filter((m) => m.result === 'L').length;
  const points = wins * 3 + draws;
  const ppg = filteredMatches.length > 0 ? points / filteredMatches.length : 0;
  const winPct =
    filteredMatches.length > 0
      ? Math.round((wins / filteredMatches.length) * 100)
      : 0;

  const [chronicleScope, setChronicleScope] = useState<MatchCompetitionFilter>('competitive');

  const momentumSummary = useMemo(
    () => buildMatchMomentumSummary(filteredMatches),
    [filteredMatches]
  );

  const chronicleSourceMatches = useMemo(
    () =>
      matches.filter((m) =>
        matchesEntryCompetitionFilter(m, chronicleScope, matches)
      ),
    [matches, chronicleScope]
  );

  const seasonChronicle = useMemo(
    () => buildSeasonChronicle(chronicleSourceMatches),
    [chronicleSourceMatches]
  );

  const activeScopeLabel = useMemo(() => {
    const compLabel = formatCompetitionFilterLabel(activeCompFilter);
    const seasonPart = activeSeason === 'ALL' ? 'All Seasons' : activeSeason;
    return `${seasonPart} · ${compLabel} (${filteredMatches.length} GP)`;
  }, [activeSeason, activeCompFilter, filteredMatches.length]);

  const leagueOnlyCountInSeason = seasonBucketCounts.league;

  return (
    <div className="space-y-4">
      {/* Synced Analytics Scope Overview: League vs Cup vs Friendlies + Key Performance KPIs */}
      {matches.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-white flex flex-wrap items-center gap-2">
                <span>Match Analytics Overview</span>
                <span className="rounded border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                  {activeScopeLabel}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tap League, Cup, or Friendlies below to filter the xG chart, momentum story, and match log together.
              </p>
            </div>
            {liveLeagueRecord && (
              <span className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-mono text-emerald-300 font-semibold">
                League Table: {liveLeagueRecord}
              </span>
            )}
          </div>

          {/* Clickable Competition Scope Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {(
              [
                {
                  id: 'league' as const,
                  label: 'League',
                  rec: seasonScopeBreakdown.league,
                  activeCls: 'border-emerald-500/60 bg-emerald-950/35',
                  idleCls: 'border-slate-800 bg-slate-950/60 hover:border-emerald-500/35',
                  accent: 'text-emerald-300',
                },
                {
                  id: 'cup' as const,
                  label: 'Cup',
                  rec: seasonScopeBreakdown.cup,
                  activeCls: 'border-sky-500/60 bg-sky-950/35',
                  idleCls: 'border-slate-800 bg-slate-950/60 hover:border-sky-500/35',
                  accent: 'text-sky-300',
                },
                {
                  id: 'friendly' as const,
                  label: 'Friendlies',
                  rec: seasonScopeBreakdown.friendly,
                  activeCls: 'border-amber-500/60 bg-amber-950/25',
                  idleCls: 'border-slate-800 bg-slate-950/60 hover:border-amber-500/35',
                  accent: 'text-amber-300',
                },
              ] as const
            ).map((card) => {
              const isActive = activeCompFilter === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() =>
                    setCompFilter((curr) =>
                      curr === card.id ? 'competitive' : card.id
                    )
                  }
                  className={`rounded-lg border px-3 py-2 text-left transition cursor-pointer ${
                    isActive ? card.activeCls : card.idleCls
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                    <span className={card.accent}>{card.label}</span>
                    <span className="font-mono text-slate-300">{card.rec.played} GP</span>
                  </div>
                  {card.rec.played === 0 ? (
                    <div className="mt-1 text-[11px] text-slate-500">0 matches</div>
                  ) : (
                    <div className="mt-1 flex items-baseline justify-between gap-2 font-mono tabular-nums text-[11px]">
                      <span className="text-white font-semibold">
                        {card.rec.won}W-{card.rec.drawn}D-{card.rec.lost}L ({card.rec.goalsFor}:{card.rec.goalsAgainst})
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {card.rec.xgDiff !== null
                          ? `xGD ${card.rec.xgDiff >= 0 ? '+' : ''}${card.rec.xgDiff.toFixed(2)}`
                          : 'No xG'}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* 4-Card Synced KPI Strip */}
          {filteredMatches.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Record &amp; Pace
                </div>
                <div className="mt-0.5 font-mono tabular-nums font-bold text-white">
                  {wins}W-{draws}D-{losses}L
                </div>
                <div className="text-[10px] font-mono text-emerald-300">
                  {ppg.toFixed(2)} PPG · {winPct}% Win
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Goals &amp; Shutouts
                </div>
                <div className="mt-0.5 font-mono tabular-nums font-bold text-white">
                  {filteredXgStats.goalsFor} : {filteredXgStats.goalsAgainst}{' '}
                  <span className="text-[11px] font-normal text-slate-400">
                    ({filteredXgStats.goalsFor - filteredXgStats.goalsAgainst >= 0 ? '+' : ''}
                    {filteredXgStats.goalsFor - filteredXgStats.goalsAgainst})
                  </span>
                </div>
                <div className="text-[10px] font-mono text-sky-300">
                  {filteredXgStats.cleanSheets} Clean Sheet{filteredXgStats.cleanSheets === 1 ? '' : 's'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  xG &amp; Finishing
                </div>
                {filteredXgStats.count > 0 ? (
                  <>
                    <div className="mt-0.5 font-mono tabular-nums font-bold text-white">
                      {filteredXgStats.totalXgFor.toFixed(2)} – {filteredXgStats.totalXgAgainst.toFixed(2)}
                    </div>
                    <div
                      className={`text-[10px] font-mono ${
                        filteredXgStats.totalXgFor - filteredXgStats.totalXgAgainst >= 0
                          ? 'text-emerald-300'
                          : 'text-rose-300'
                      }`}
                    >
                      xGD {filteredXgStats.totalXgFor - filteredXgStats.totalXgAgainst >= 0 ? '+' : ''}
                      {(filteredXgStats.totalXgFor - filteredXgStats.totalXgAgainst).toFixed(2)} · Fin{' '}
                      {filteredXgStats.xgGoalsFor - filteredXgStats.totalXgFor >= 0 ? '+' : ''}
                      {(filteredXgStats.xgGoalsFor - filteredXgStats.totalXgFor).toFixed(2)}
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-[11px] text-slate-500">No xG tracked</div>
                )}
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Home vs Away
                </div>
                <div className="mt-0.5 font-mono tabular-nums text-[11px] text-white">
                  H: <strong>{filteredXgStats.homeRecord}</strong>
                </div>
                <div className="font-mono tabular-nums text-[11px] text-slate-300">
                  A: <strong>{filteredXgStats.awayRecord}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {matches.length >= 2 && (
        <MatchXgMomentumChart
          matches={matches}
          saveDate={saveDate}
          title="Match xG Momentum & Finishing Trends"
          controlledSeason={activeSeason}
          onSeasonChange={setSelectedSeason}
          controlledScope={activeCompFilter}
          onScopeChange={setCompFilter}
        />
      )}

      {momentumSummary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
                  Match Momentum &amp; xG Story
                </span>
                <span className="rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                  {activeScopeLabel}
                </span>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {momentumSummary.actualPoints} pts vs {momentumSummary.expectedPoints} xPts (
                {momentumSummary.pointsDelta >= 0 ? '+' : ''}
                {momentumSummary.pointsDelta})
              </span>
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              {momentumSummary.verdictTitle}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {momentumSummary.verdictDetail}
            </p>
            {momentumSummary.matchesWithXg > 0 && (
              <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                  Goals vs xG: {momentumSummary.goalsFor} vs {momentumSummary.xGFor} (
                  {momentumSummary.finishingDelta >= 0 ? '+' : ''}
                  {momentumSummary.finishingDelta})
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                  Conceded vs xGA: {momentumSummary.goalsAgainst} vs {momentumSummary.xGAgainst}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  xG tracked: {momentumSummary.matchesWithXg}/{filteredMatches.length} GP
                </span>
              </div>
            )}
          </div>

          {seasonChronicle.length > 0 && (
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-sky-600 dark:text-sky-400 font-semibold">
                    Season Chronicle
                  </span>
                  <span className="rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                    {formatCompetitionFilterLabel(chronicleScope)}
                  </span>
                </div>
                <div className="inline-flex flex-wrap items-center rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 p-0.5 text-[10px] font-semibold">
                  {(
                    [
                      { id: 'competitive', label: 'Comp' },
                      { id: 'league', label: 'League' },
                      { id: 'cup', label: 'Cup' },
                      { id: 'friendly', label: 'Friendlies' },
                      { id: 'all', label: 'All' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setChronicleScope(opt.id)}
                      className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                        chronicleScope === opt.id
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'text-slate-500 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                {seasonChronicle.slice(0, 3).map((s) => (
                  <div
                    key={s.seasonLabel}
                    className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-1.5 text-xs px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                        {s.seasonLabel}
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-slate-400">
                        ({s.played} GP)
                      </span>
                      <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                        {`${s.wins}W-${s.draws}D-${s.losses}L · ${s.goalsFor}:${s.goalsAgainst}`}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 break-words">
                      {`${s.cleanSheets} CS · ${s.longestUnbeatenRun} unbeaten${s.biggestWin ? ` · Best: ${s.biggestWin}` : ''}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
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
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
            {liveLeagueRecord && (
              <span className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-emerald-300 font-semibold">
                League Table Only: {liveLeagueRecord}
              </span>
            )}
            {filteredMatches.length > 0 && (
              <span className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1 text-slate-200">
                {`${formatCompetitionFilterLabel(activeCompFilter)} (${filteredMatches.length} GP${
                  activeCompFilter === 'all' && leagueOnlyCountInSeason > 0 && leagueOnlyCountInSeason !== filteredMatches.length
                    ? ` · ${leagueOnlyCountInSeason} League`
                    : ''
                })`}
                {`: ${wins}W-${draws}D-${losses}L`}
                {filteredXgStats.count > 0
                  ? ` · xG ${filteredXgStats.totalXgFor.toFixed(2)}-${filteredXgStats.totalXgAgainst.toFixed(2)}${
                      filteredXgStats.count < filteredMatches.length
                        ? ` (${filteredXgStats.count}/${filteredMatches.length} tracked)`
                        : ''
                    }`
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
                  className={`min-h-[38px] sm:min-h-[30px] rounded-lg px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
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
                  className={`min-h-[38px] sm:min-h-[30px] rounded-lg px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
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
              {(
                [
                  { id: 'competitive', label: 'Competitive', count: seasonBucketCounts.competitive },
                  { id: 'league', label: 'League', count: seasonBucketCounts.league },
                  { id: 'cup', label: 'Cup', count: seasonBucketCounts.cup },
                  { id: 'friendly', label: 'Friendlies', count: seasonBucketCounts.friendly },
                  { id: 'all', label: 'All', count: seasonBucketCounts.all },
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCompFilter(c.id)}
                  className={`min-h-[38px] sm:min-h-[30px] rounded-lg px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
                    activeCompFilter === c.id
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {c.label} <span className="font-mono text-[10px] opacity-75">({c.count})</span>
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
              in the <strong>Hub</strong> tab to populate all played matches.
            </p>
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            No matches found for <strong>{activeSeason}</strong> ({formatCompetitionFilterLabel(activeCompFilter)}). Try switching the competition or season filter above.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredMatches.map((m) => {
              const seasonLabel = getFootballSeasonLabel(m.date);
              const compBucket = classifyMatchEntryBucket(m, seasonScopedMatches);
              const isDebriefOpen = openDebriefMatchId === m.id;
              const debrief = isDebriefOpen
                ? aiDebriefByMatchId[m.id] || buildDeterministicPostMatchDebrief(m)
                : null;

              return (
                <MatchLogCard
                  key={m.id}
                  match={m}
                  seasonLabel={seasonLabel}
                  compBucket={compBucket}
                  isDebriefOpen={isDebriefOpen}
                  onToggleDebrief={() =>
                    setOpenDebriefMatchId((curr) => (curr === m.id ? null : m.id))
                  }
                  debrief={debrief}
                  hasAiDebrief={Boolean(aiDebriefByMatchId[m.id])}
                  isLoadingAi={loadingAiMatchId === m.id}
                  aiError={aiDebriefErrorByMatchId[m.id]}
                  onRequestAiDebrief={() => handleRequestAiDebrief(m)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
