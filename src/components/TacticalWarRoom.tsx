import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  FileSpreadsheet,
  Smartphone,
} from 'lucide-react';
import { PLAYBOOK_V2_REFERENCE_RULES } from '../data/matchAndTacticsData';
import { PlayerRecord } from '../types/fm27';
import {
  ActiveSuspensionRecord,
  CompetitionRegistrationRules,
} from '../types/fmSave';
import { HydratedSaveState } from '../utils/fmSaveHydrator';
import { FormationPresetKey, SolvedSlot } from '../utils/bestXiSolver';
import { PersistedCustomSlot } from '../services/fmStorage';
import { InteractivePitchBuilder } from './InteractivePitchBuilder';
import { MatchPrepCard } from './MatchPrepCard';
import { MatchdayCompanionView } from './MatchdayCompanionView';

interface TacticalWarRoomProps {
  players: PlayerRecord[];
  saveDate: string;
  nextFixture: string;
  clubName: string;
  activeSuspensions?: ActiveSuspensionRecord[];
  competitionRules?: CompetitionRegistrationRules | null;
  hydratedFmSave?: HydratedSaveState | null;
  activeShape?: FormationPresetKey;
  customSlots?: PersistedCustomSlot[];
  applyToAnalystOnly?: boolean;
  onChangeShape?: (shape: FormationPresetKey) => void;
  onChangeCustomSlots?: (slots: PersistedCustomSlot[]) => void;
  onChangeApplyToAnalystOnly?: (val: boolean) => void;
  onSolvedLineupChange?: (slots: SolvedSlot[]) => void;
}

export const TacticalWarRoom: React.FC<TacticalWarRoomProps> = ({
  players,
  saveDate,
  nextFixture,
  clubName,
  activeSuspensions = [],
  competitionRules = null,
  hydratedFmSave = null,
  activeShape: controlledShape,
  customSlots: controlledCustomSlots,
  applyToAnalystOnly: controlledApplyOnly,
  onChangeShape,
  onChangeCustomSlots,
  onChangeApplyToAnalystOnly,
  onSolvedLineupChange,
}) => {
  const [localShape, setLocalShape] = useState<FormationPresetKey>('4-3-3 DM Wide');
  const [localCustomSlots, setLocalCustomSlots] = useState<PersistedCustomSlot[]>([]);
  const [localApplyOnly, setLocalApplyOnly] = useState<boolean>(false);
  const [solvedSlots, setSolvedSlots] = useState<SolvedSlot[]>([]);
  const [includeYouthInWarRoom, setIncludeYouthInWarRoom] = useState<boolean>(false);
  const [companionMode, setCompanionMode] = useState<boolean>(false);

  const activeShape = controlledShape ?? localShape;
  const customSlots = controlledCustomSlots ?? localCustomSlots;
  const applyToAnalystOnly = controlledApplyOnly ?? localApplyOnly;

  const handleShapeChange = (shape: FormationPresetKey) => {
    setLocalShape(shape);
    onChangeShape?.(shape);
  };
  const handleCustomSlotsChange = (slots: PersistedCustomSlot[]) => {
    setLocalCustomSlots(slots);
    onChangeCustomSlots?.(slots);
  };
  const handleApplyOnlyChange = (val: boolean) => {
    setLocalApplyOnly(val);
    onChangeApplyToAnalystOnly?.(val);
  };
  const handleSolvedLineupChange = (slots: SolvedSlot[]) => {
    setSolvedSlots(slots);
    onSolvedLineupChange?.(slots);
  };

  const firstTeamPlayers = players.filter(
    (p) => p.teamSlot === undefined || p.teamSlot === 0
  );
  const youthReservesCount = players.length - firstTeamPlayers.length;
  const scopedPlayers =
    includeYouthInWarRoom || firstTeamPlayers.length === 0
      ? players
      : firstTeamPlayers;

  const hasSquad = players.length > 0;
  const displayClub =
    clubName && clubName !== '--' && clubName !== 'Awaiting .fm Save'
      ? clubName
      : 'Managed Club';

  const combinedSuspensions: ActiveSuspensionRecord[] =
    activeSuspensions.length > 0
      ? activeSuspensions
      : scopedPlayers.flatMap((p) => p.activeSuspensions || []);

  return (
    <div className="space-y-8">
      {hasSquad && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-900/75 text-xs">
          <div className="text-slate-300">
            <strong className="text-white">{displayClub} Squad Pool:</strong>{' '}
            {includeYouthInWarRoom || youthReservesCount === 0
              ? `All ${players.length} players`
              : `First Team Only (${firstTeamPlayers.length} senior players · ${youthReservesCount} Reserves/Youth hidden)`}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {youthReservesCount > 0 && (
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-950 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setIncludeYouthInWarRoom(false)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                    !includeYouthInWarRoom
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  First Team ({firstTeamPlayers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setIncludeYouthInWarRoom(true)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                    includeYouthInWarRoom
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Include Youth ({players.length})
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setCompanionMode((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                companionMode
                  ? 'bg-emerald-500 text-slate-950 border-white shadow-md'
                  : 'bg-slate-950 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/15'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              {companionMode
                ? 'Exit Matchday Companion'
                : 'Matchday Companion (Phone View)'}
            </button>
          </div>
        </div>
      )}

      {hasSquad && companionMode && solvedSlots.length > 0 && (
        <MatchdayCompanionView
          clubName={displayClub}
          nextFixture={nextFixture}
          activeShape={activeShape}
          slots={solvedSlots}
          allPlayers={scopedPlayers}
        />
      )}

      {/* Pass 2 (v2.1): Matchday Prep Card (Clean empty state when awaiting .fm save) */}
      <MatchPrepCard
        players={scopedPlayers}
        activeSlots={solvedSlots}
        hydratedFmSave={hydratedFmSave}
        activeSuspensions={combinedSuspensions}
        clubName={clubName}
      />

      {/* Pass 2 (v2.1): Single Authoritative Interactive Dual-Phase Pitch Builder */}
      {hasSquad && (
        <InteractivePitchBuilder
          players={scopedPlayers}
          activeSuspensions={combinedSuspensions}
          nextCompetitionName={
            hydratedFmSave?.decodedPayload?.upcomingFixtures?.[0]?.competition ??
            null
          }
          savedTactics={hydratedFmSave?.decodedPayload?.tactics}
          activeShape={activeShape}
          customSlots={customSlots}
          applyToAnalystOnly={applyToAnalystOnly}
          onChangeShape={handleShapeChange}
          onChangeCustomSlots={handleCustomSlotsChange}
          onChangeApplyToAnalystOnly={handleApplyOnlyChange}
          onSolvedLineupChange={handleSolvedLineupChange}
        />
      )}
      {/* Generic Bobby Dean FM27 Playbook v2.0 Reference (Always Available) */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-2.5">
            <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Bobby Dean — Portable FM27 Tactics &amp; Journeyman Playbook
                v2.0 Reference
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Club-independent Patch 27.1.0 Dual-Phase architecture, 2-Window
                Substitution Rule, Set-Piece Zonal Fortress, and Physical Engine
                laws used by the Tactical Analyst &amp; War Room auto-builder.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 shrink-0">
            Patch 27.1.0 Baseline · Dual-Phase IP/OOP
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PLAYBOOK_V2_REFERENCE_RULES.map((rule) => (
            <div
              key={rule.id}
              className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{rule.section}</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                  {rule.tag}
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {rule.title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {rule.summary}
              </p>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                {rule.inGameSetting}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic Tactical War Room: Recommended Dual-Phase 4-3-3 Starting XI & 62m/75m Sub Plan */}
      {!hasSquad ? (
        <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-3">
          <FileSpreadsheet className="w-8 h-8 text-emerald-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Awaiting .fm Save — Dynamic Tactical War Room (-- / 11 Starters)
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Zero pre-filled squad or tactical lineups loaded. Drop or select
            your <span className="font-mono text-emerald-400">.fm</span> save
            file in the <strong>Tactical Analyst Chat</strong> tab to
            automatically build your club&apos;s recommended Dual-Phase 4-3-3
            Starting XI, IP/OOP roles, 62m/75m Touchline Substitution Plan, and
            Double-Gameweek Stamina Load Audit strictly from your imported
            players&apos; positions, Stamina, Pace, Acceleration, and Jumping
            Reach.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto pt-2 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">Recommended Starting XI</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                --
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">62m / 75m Sub Script</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                --
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">Dual-CB 90m Lock</div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                --
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Pass 1 Tier-1: Active Matchday Suspensions Alert */}
          {combinedSuspensions.length > 0 && (
            <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/25 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  Active Disciplinary Suspensions ({combinedSuspensions.length}) — Do Not Select as Starters
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {combinedSuspensions.map((ban, idx) => (
                  <div
                    key={`${ban.playerUid}-${ban.competitionName}-${idx}`}
                    className="rounded-lg border border-rose-500/40 bg-slate-950/70 px-3 py-1.5 text-xs text-rose-200"
                  >
                    <strong className="text-white">{ban.playerName}</strong>{' '}
                    <span className="font-mono text-rose-300 font-bold">
                      BANNED ({ban.matchesRemaining}m)
                    </span>{' '}
                    · {ban.competitionName} ({ban.scope}) — {ban.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          {competitionRules?.matchdaySubsLimit && (
            <div className="px-4 py-2.5 rounded-xl border border-sky-500/30 bg-sky-950/20 text-xs text-sky-200 flex items-center justify-between">
              <span>
                <strong>Competition Rule:</strong> Max {competitionRules.matchdaySubsLimit} matchday substitutions
                {competitionRules.fixturesPerClub ? ` · ${competitionRules.fixturesPerClub}-match season` : ''}
              </span>
              <span className="font-mono text-[11px] text-sky-300">
                Save Date: {saveDate}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};
