/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  AlertTriangle,
  Calendar,
  Compass,
  Flag,
  Shield,
  Timer,
} from 'lucide-react';
import { PlayerRecord } from '../types/fm27';
import { ActiveSuspensionRecord, LeagueTableRow } from '../types/fmSave';
import { HydratedSaveState } from '../utils/fmSaveHydrator';
import {
  buildSuspensionLookup,
  evaluatePlayerForSlot,
  getPlayerSuspension,
  SolvedSlot,
} from '../utils/bestXiSolver';

export interface MatchPrepCardProps {
  players: PlayerRecord[];
  activeSlots?: SolvedSlot[];
  hydratedFmSave: HydratedSaveState | null;
  activeSuspensions?: ActiveSuspensionRecord[];
  clubName: string;
}

interface SetPieceTakers {
  corners: PlayerRecord | null;
  penalties: PlayerRecord | null;
  freeKicks: PlayerRecord | null;
}

function pickSetPieceTakers(pool: PlayerRecord[]): SetPieceTakers {
  const outfield = pool.filter(
    (p) => !(p.position || '').toUpperCase().includes('GK')
  );
  if (outfield.length === 0) {
    return { corners: null, penalties: null, freeKicks: null };
  }

  const pickBest = (
    getter: (p: PlayerRecord) => number
  ): PlayerRecord | null => {
    return [...outfield].sort((a, b) => {
      const diff = getter(b) - getter(a);
      if (diff !== 0) return diff;
      return b.ability - a.ability;
    })[0];
  };

  return {
    corners: pickBest((p) => p.attributes.corners ?? p.attributes.passing ?? 0),
    penalties: pickBest(
      (p) => p.attributes.penalties ?? p.attributes.finishing ?? 0
    ),
    freeKicks: pickBest(
      (p) => p.attributes.freeKicks ?? p.attributes.passing ?? 0
    ),
  };
}

export const MatchPrepCard: React.FC<MatchPrepCardProps> = ({
  players,
  activeSlots = [],
  hydratedFmSave,
  activeSuspensions = [],
  clubName,
}) => {
  const decoded = hydratedFmSave?.decodedPayload ?? null;
  const hasLiveSave = Boolean(decoded) || players.length > 0;

  const nextFixtureObj = decoded?.upcomingFixtures?.[0] ?? null;
  const leagueStanding = decoded?.leagueStanding ?? null;

  // Resolve opponent standing from nextOpponentStanding or league_tables rows
  const opponentStanding = useMemo(() => {
    if (leagueStanding?.nextOpponentStanding) {
      return leagueStanding.nextOpponentStanding;
    }
    if (!nextFixtureObj || !leagueStanding?.rows?.length) return null;
    const oppLower = nextFixtureObj.opponent.trim().toLowerCase();
    const row: LeagueTableRow | undefined = leagueStanding.rows.find(
      (r) =>
        r.clubName.trim().toLowerCase() === oppLower ||
        r.clubName.trim().toLowerCase().includes(oppLower)
    );
    if (!row) return null;
    return {
      clubName: row.clubName,
      position: row.position,
      played: row.played,
      points: row.points,
      goalDiff: row.goalDifference,
    };
  }, [leagueStanding, nextFixtureObj]);

  const activeXiPlayers: PlayerRecord[] = useMemo(() => {
    const fromSlots = activeSlots
      .map((s) => s.player)
      .filter((p): p is PlayerRecord => Boolean(p));
    if (fromSlots.length > 0) return fromSlots;
    return players.slice(0, 11);
  }, [activeSlots, players]);

  const suspensionLookup = useMemo(
    () => buildSuspensionLookup(players, activeSuspensions),
    [players, activeSuspensions]
  );

  // Active XI injury / ban / <85% fitness warnings
  const xiWarnings = useMemo(() => {
    const items: Array<{ player: string; badge: string; detail: string; severity: 'error' | 'warning' }> = [];
    for (const p of activeXiPlayers) {
      if (p.status === 'Injured') {
        items.push({
          player: p.name,
          badge: 'INJURED',
          detail: 'Flagged injured in save',
          severity: 'error',
        });
      }
      const ban = getPlayerSuspension(p, suspensionLookup);
      if (ban) {
        items.push({
          player: p.name,
          badge: `BANNED (${ban.matchesRemaining}m)`,
          detail: `${ban.competitionName} · ${ban.reason}`,
          severity: 'error',
        });
      }
      if (typeof p.condition === 'number' && p.condition < 85) {
        items.push({
          player: p.name,
          badge: `COND ${p.condition}%`,
          detail: 'Below Playbook v2.0 85% kickoff floor',
          severity: 'warning',
        });
      }
    }
    return items;
  }, [activeXiPlayers, suspensionLookup]);

  // 62' & 75' stamina substitution scripts (never subbing both starting CBs together)
  const subScripts = useMemo(() => {
    const xiIds = new Set(activeXiPlayers.map((p) => p.id));
    const bench = players.filter(
      (p) =>
        !xiIds.has(p.id) &&
        p.status !== 'Injured' &&
        !getPlayerSuspension(p, suspensionLookup) &&
        !(p.position || '').toUpperCase().includes('GK')
    );

    const isCbSlot = (slot: SolvedSlot) =>
      slot.positionGroup === 'Centre-Back';
    const isGkSlot = (slot: SolvedSlot) =>
      slot.positionGroup === 'Goalkeeper';

    // Candidate non-GK starters sorted by lowest stamina / condition
    const subCandidates =
      activeSlots.length > 0
        ? activeSlots
            .filter((s) => s.player && !isGkSlot(s))
            .sort((a, b) => {
              const aScore =
                (a.player!.attributes.stamina || 10) * 5 +
                (a.player!.condition ?? 85);
              const bScore =
                (b.player!.attributes.stamina || 10) * 5 +
                (b.player!.condition ?? 85);
              return aScore - bScore;
            })
        : [];

    const window62: string[] = [];
    const window75: string[] = [];
    const usedBenchIds = new Set<string>();
    let cbSubbedCount = 0;

    for (const slot of subCandidates) {
      if (!slot.player) continue;
      // Playbook v2.0 Law 2: NEVER sub both starting CBs when protecting a lead
      if (isCbSlot(slot) && cbSubbedCount >= 1) continue;

      const availableBench = bench.filter((b) => !usedBenchIds.has(b.id));
      if (availableBench.length === 0) break;

      const rankedBench = availableBench
        .map((candidate) => ({
          candidate,
          fit: evaluatePlayerForSlot(
            candidate,
            slot.positionGroup,
            slot.ipRole,
            slot.oopRole,
            slot.flank
          ),
        }))
        .sort((a, b) => {
          if (a.fit.isNaturalPosition !== b.fit.isNaturalPosition) {
            return a.fit.isNaturalPosition ? -1 : 1;
          }
          if (b.fit.combinedFitPct !== a.fit.combinedFitPct) {
            return b.fit.combinedFitPct - a.fit.combinedFitPct;
          }
          return (b.candidate.condition ?? 85) - (a.candidate.condition ?? 85);
        });

      const bestMatch = rankedBench[0];
      if (!bestMatch || (!bestMatch.fit.isNaturalPosition && bestMatch.fit.combinedFitPct < 45)) {
        continue;
      }

      const replacement = bestMatch.candidate;
      usedBenchIds.add(replacement.id);
      if (isCbSlot(slot)) cbSubbedCount++;

      const line = `${replacement.name} (${replacement.position}, ${bestMatch.fit.combinedFitPct}% fit) ON for ${slot.player.name} (${slot.label}, Sta ${slot.player.attributes.stamina}, C${slot.player.condition ?? '?'}%)`;
      if (window62.length < 2) {
        window62.push(line);
      } else if (window75.length < 2) {
        window75.push(line);
      } else {
        break;
      }
    }

    return { window62, window75 };
  }, [activeSlots, activeXiPlayers, players, suspensionLookup]);

  // CamelCase set-piece takers (corners, penalties, freeKicks)
  const setPieceTakers = useMemo(
    () => pickSetPieceTakers(activeXiPlayers),
    [activeXiPlayers]
  );

  // Playbook v2.0 home/away/table cues
  const tacticalCues = useMemo(() => {
    const cues: string[] = [];
    const venue = nextFixtureObj?.venue;
    const oppPos = opponentStanding?.position ?? null;
    const totalTeams = leagueStanding?.totalTeams ?? 16;

    if (venue === 'A' && oppPos !== null && oppPos <= 4) {
      cues.push(
        'Away at Top-4 Opponent: Start Balanced Mentality + Standard Tempo; lock both AML/AMR to Tracking Winger OOP.'
      );
    } else if (venue === 'A') {
      cues.push(
        'Away Fixture: Keep Mid Block + Higher Defensive Line (Step Up More OFF vs Pace 15+ strikers) and Balanced Ground Build-Up.'
      );
    } else if (venue === 'H' && oppPos !== null && oppPos > Math.ceil(totalTeams / 2)) {
      cues.push(
        'Home vs Lower-Half Opponent: Positive Mentality + Slightly Higher Tempo; attack half-spaces while keeping 3-man midfield intact.'
      );
    } else if (venue === 'H') {
      cues.push(
        'Home Fixture: Positive Mentality + Standard Passing Directness; batch all subs into 62m & 75m windows.'
      );
    } else {
      cues.push(
        'Playbook v2.0 Default: Balanced Ground Build-Up, Tracking Wingers OOP, 1 structural tweak per 20-25m.'
      );
    }

    cues.push(
      'Dual-CB 90m Continuity Lock: Never substitute both starting Centre-Backs together when protecting a lead.'
    );
    return cues;
  }, [nextFixtureObj, opponentStanding, leagueStanding]);

  // Phase 3.2 (v3.0): Pre-Match Opposition Tactical Scouting & Counter-Adjustments
  const oppositionIntel = useMemo(() => {
    const oppName = nextFixtureObj?.opponent || opponentStanding?.clubName || null;
    if (!oppName) return null;

    const venue = nextFixtureObj?.venue || 'H';
    const oppPos = opponentStanding?.position ?? null;
    const totalTeams = leagueStanding?.totalTeams ?? 16;
    const played = Math.max(1, opponentStanding?.played || 1);
    const ppg = opponentStanding ? opponentStanding.points / played : 1.35;
    const gdPerGame = opponentStanding ? opponentStanding.goalDiff / played : 0;

    // Resolve full row if present in leagueStanding.rows
    const fullRow: LeagueTableRow | undefined = leagueStanding?.rows?.find(
      (r) =>
        r.clubName.trim().toLowerCase() === oppName.trim().toLowerCase() ||
        r.clubName.trim().toLowerCase().includes(oppName.trim().toLowerCase())
    );
    const gfPerGame =
      fullRow && fullRow.played > 0 ? fullRow.goalsFor / fullRow.played : null;
    const gaPerGame =
      fullRow && fullRow.played > 0 ? fullRow.goalsAgainst / fullRow.played : null;

    const tierLabel =
      oppPos !== null && oppPos <= 4
        ? 'Title / Promotion Contender'
        : oppPos !== null && oppPos > totalTeams - 4
          ? 'Relegation Low-Block Underdog'
          : 'Mid-Table Direct Rival';

    const threatProfile =
      (gfPerGame !== null && gfPerGame >= 1.65) || gdPerGame >= 0.6
        ? 'High-Scoring Vertical Transition Threat'
        : (gaPerGame !== null && gaPerGame <= 1.0)
          ? 'Compact Low-Block & Set-Piece Unit'
          : 'Balanced Dual-Phase Structure';

    const counterAdjustments: string[] = [];
    if (tierLabel === 'Title / Promotion Contender' || venue === 'A') {
      counterAdjustments.push(
        'Rest-Defense Shape: Lock 2-3 Base (Screening DM + 2 Holding Full-Backs) and keep both wingers on Tracking Winger OOP.'
      );
      counterAdjustments.push(
        'Transition Counter: Exploit space behind opponent wing-backs with Channel Forward IP + Inside Forward IP diagonal runs.'
      );
    } else if (tierLabel === 'Relegation Low-Block Underdog') {
      counterAdjustments.push(
        'Break Low Block: Use Positive Mentality + 3-2 Rest-Defense Base (allow 1 full-back to overlap while opposite full-back holds).'
      );
      counterAdjustments.push(
        'Half-Space Creation: Pair Channel Midfielder IP + Inside Forward IP with Work Ball Into Box if shot quality drops.'
      );
    } else {
      counterAdjustments.push(
        'Zone 5 Control: Keep 3-man midfield triangle intact (1 Screening DM + 1 Box-to-Box + 1 Channel/Playmaker CM).'
      );
      counterAdjustments.push(
        'Flank Security: Keep Tracking Winger OOP on both flanks and trigger 62m stamina refresh on lowest-condition wide runner.'
      );
    }

    return {
      oppName,
      venue,
      tierLabel,
      threatProfile,
      ppg: ppg.toFixed(2),
      gfPerGame: gfPerGame !== null ? gfPerGame.toFixed(2) : null,
      gaPerGame: gaPerGame !== null ? gaPerGame.toFixed(2) : null,
      counterAdjustments,
    };
  }, [nextFixtureObj, opponentStanding, leagueStanding]);

  if (!hasLiveSave) {
    return (
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-2">
        <Calendar className="w-7 h-7 text-emerald-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Matchday Prep Card — Awaiting .fm Save
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          No live fixture or league table loaded yet (--). Import your{' '}
          <span className="font-mono text-emerald-500">.fm</span> save to
          populate your real next opponent, standing cues, 62&apos;/75&apos;
          substitution script, and set-piece takers.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">
      {/* Header: Real Next Opponent + Standing */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold">
              Matchday Prep Card
            </span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
            {nextFixtureObj ? (
              <>
                {clubName && clubName !== '--' ? clubName : 'Managed Club'} vs{' '}
                {nextFixtureObj.opponent}{' '}
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ml-1">
                  {nextFixtureObj.venue === 'H' ? 'HOME' : 'AWAY'}
                </span>
              </>
            ) : (
              'Next Fixture: -- (No upcoming fixture in save)'
            )}
          </h3>
          {nextFixtureObj && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {nextFixtureObj.dateDmy || nextFixtureObj.dateIso || '--'} · {nextFixtureObj.competition}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-mono">
          {opponentStanding && (
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] text-slate-500">Opponent Standing</div>
              <div className="font-bold text-slate-900 dark:text-slate-100">
                #{opponentStanding.position} · {opponentStanding.points} pts (
                {opponentStanding.goalDiff >= 0 ? '+' : ''}
                {opponentStanding.goalDiff} GD)
              </div>
            </div>
          )}
          {leagueStanding && (
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] text-slate-500">Our Standing</div>
              <div className="font-bold text-emerald-700 dark:text-emerald-400">
                #{leagueStanding.position}/{leagueStanding.totalTeams} ·{' '}
                {leagueStanding.points} pts
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Phase 3.2 (v3.0): Pre-Match Opposition Tactical Intelligence & Counter-Plan */}
      {oppositionIntel && (
        <div className="p-4 rounded-xl bg-slate-950/85 border border-emerald-500/30 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
              <Compass className="w-4 h-4 text-emerald-400" />
              Pre-Match Opposition Tactical Intelligence: {oppositionIntel.oppName}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
              <span className="rounded bg-indigo-500/15 border border-indigo-500/35 px-2 py-0.5 text-indigo-300 font-semibold">
                {oppositionIntel.tierLabel}
              </span>
              <span className="rounded bg-amber-500/15 border border-amber-500/35 px-2 py-0.5 text-amber-300">
                {oppositionIntel.threatProfile}
              </span>
              <span className="rounded bg-slate-900 border border-slate-700 px-2 py-0.5 text-slate-300">
                {oppositionIntel.ppg} PPG
                {oppositionIntel.gfPerGame
                  ? ` · ${oppositionIntel.gfPerGame} GF/g · ${oppositionIntel.gaPerGame} GA/g`
                  : ''}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
            {oppositionIntel.counterAdjustments.map((adj, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-slate-800 bg-slate-900/75 px-3 py-2 flex items-start gap-2"
              >
                <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>{adj}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3-Column Matchday Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Active XI Availability & Fitness Warnings */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Active XI Warnings ({xiWarnings.length})
          </div>
          {xiWarnings.length === 0 ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              All 11 starters are fit (≥85% Condition), uninjured, and eligible.
            </p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {xiWarnings.map((w, idx) => (
                <li
                  key={`${w.player}-${idx}`}
                  className={`p-2 rounded border ${
                    w.severity === 'error'
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-800 dark:text-rose-200'
                      : 'bg-amber-500/10 border-amber-500/40 text-amber-900 dark:text-amber-200'
                  }`}
                >
                  <strong>{w.player}</strong>{' '}
                  <span className="font-mono font-bold">[{w.badge}]</span> —{' '}
                  {w.detail}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 2. 62' & 75' Stamina Substitution Scripts */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
            <Timer className="w-4 h-4 text-emerald-500" />
            62&apos; &amp; 75&apos; Stamina Sub Script
          </div>
          <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
            <div>
              <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                Window 1 (62&apos;)
              </div>
              {subScripts.window62.length > 0 ? (
                subScripts.window62.map((line, i) => (
                  <div key={i} className="mt-0.5">
                    • {line}
                  </div>
                ))
              ) : (
                <div className="text-slate-500">No bench replacements available.</div>
              )}
            </div>
            <div>
              <div className="font-mono font-bold text-sky-700 dark:text-sky-400">
                Window 2 (75&apos;)
              </div>
              {subScripts.window75.length > 0 ? (
                subScripts.window75.map((line, i) => (
                  <div key={i} className="mt-0.5">
                    • {line}
                  </div>
                ))
              ) : (
                <div className="text-slate-500">Reserve for tactical closer.</div>
              )}
            </div>
          </div>
        </div>

        {/* 3. Set-Piece Takers & Playbook v2.0 Cues */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
              <Flag className="w-4 h-4 text-sky-500" />
              Set-Piece Takers (Active XI)
            </div>
            <div className="grid grid-cols-1 gap-1 text-xs font-mono">
              <div>
                <span className="text-slate-500">corners:</span>{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {setPieceTakers.corners
                    ? `${setPieceTakers.corners.name} (${setPieceTakers.corners.attributes.corners ?? '--'})`
                    : '--'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">penalties:</span>{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {setPieceTakers.penalties
                    ? `${setPieceTakers.penalties.name} (${setPieceTakers.penalties.attributes.penalties ?? '--'})`
                    : '--'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">freeKicks:</span>{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {setPieceTakers.freeKicks
                    ? `${setPieceTakers.freeKicks.name} (${setPieceTakers.freeKicks.attributes.freeKicks ?? '--'})`
                    : '--'}
                </strong>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
              <Compass className="w-4 h-4 text-emerald-500" />
              Playbook v2.0 Match Cues
            </div>
            {tacticalCues.map((cue, idx) => (
              <div
                key={idx}
                className="flex items-start gap-1.5 text-[11px] text-slate-600 dark:text-slate-400"
              >
                <Shield className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span>{cue}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
