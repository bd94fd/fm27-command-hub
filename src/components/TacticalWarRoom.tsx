import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ClipboardList,
  Crosshair,
  Shield,
  Smartphone,
} from 'lucide-react';
import { PLAYBOOK_V2_REFERENCE_RULES } from '../data/matchAndTacticsData';
import { PlayerRecord } from '../types/fm27';
import {
  ActiveSuspensionRecord,
  CompetitionRegistrationRules,
} from '../types/fmSave';
import { HydratedSaveState } from '../utils/fmSaveHydrator';
import {
  FormationPresetKey,
  SolvedSlot,
  isSuspensionActiveForCompetition,
  solveBestXi,
} from '../utils/bestXiSolver';
import { PersistedCustomSlot } from '../services/fmStorage';
import { InteractivePitchBuilder } from './InteractivePitchBuilder';
import { MatchPrepCard } from './MatchPrepCard';
import { MatchdayCompanionView } from './MatchdayCompanionView';
import { SetPiecesAndTraining } from './SetPiecesAndTraining';

export type TacticsSubTab = 'pitch' | 'prep' | 'setpieces' | 'playbook';

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
  initialSubTab?: TacticsSubTab;
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
  initialSubTab = 'pitch',
  onChangeShape,
  onChangeCustomSlots,
  onChangeApplyToAnalystOnly,
  onSolvedLineupChange,
}) => {
  const [subTab, setSubTab] = useState<TacticsSubTab>(initialSubTab);
  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);
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

  const effectiveSolvedSlots = useMemo(() => {
    if (solvedSlots.length > 0) return solvedSlots;
    if (!hasSquad) return [];
    const nextComp =
      hydratedFmSave?.decodedPayload?.upcomingFixtures?.[0]?.competition ?? null;
    return solveBestXi(scopedPlayers, {
      shape: activeShape,
      customSlots,
      excludeInjured: true,
      excludeSuspended: true,
      activeSuspensions: combinedSuspensions,
      nextCompetitionName: nextComp,
    }).startingXI;
  }, [
    solvedSlots,
    hasSquad,
    hydratedFmSave,
    scopedPlayers,
    activeShape,
    customSlots,
    combinedSuspensions,
  ]);

  return (
    <div className="space-y-4">
      {/* Compact Tactics Sub-Navigation & Squad Scope Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2.5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {(
            [
              { id: 'pitch' as const, label: 'Pitch XI', icon: Shield },
              { id: 'prep' as const, label: 'Match Prep', icon: ClipboardList },
              { id: 'setpieces' as const, label: 'Corners & Train', icon: Crosshair },
              { id: 'playbook' as const, label: 'Playbook v2.0', icon: BookOpen },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold border transition cursor-pointer ${
                  active
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-50 dark:bg-slate-950/70 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {hasSquad && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
            <div className="text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-white">{displayClub}:</strong>{' '}
              {includeYouthInWarRoom || youthReservesCount === 0
                ? `All ${players.length} players`
                : `First Team (${firstTeamPlayers.length})`}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {youthReservesCount > 0 && (
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIncludeYouthInWarRoom(false)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      !includeYouthInWarRoom
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    First Team ({firstTeamPlayers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncludeYouthInWarRoom(true)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      includeYouthInWarRoom
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({players.length})
                  </button>
                </div>
              )}

              {subTab === 'prep' && (
                <button
                  type="button"
                  onClick={() => setCompanionMode((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                    companionMode
                      ? 'bg-emerald-500 text-slate-950 border-white shadow-md'
                      : 'bg-slate-950 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/15'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  {companionMode ? 'Exit Touchline View' : 'Touchline View'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SUB-TAB 1: INTERACTIVE PITCH XI */}
      <div className={subTab === 'pitch' ? 'space-y-4' : 'hidden'}>
        {!hasSquad ? (
          <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-3">
            <Shield className="w-8 h-8 text-emerald-500 mx-auto" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Awaiting .fm Save — Tactical Pitch Builder
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
              Import your <span className="font-mono text-emerald-400">.fm</span> save
              in the <strong>Hub</strong> tab to load your last-match XI, dual-phase
              In-Possession / Out-of-Possession roles, and Rest-Defense Matrix.
            </p>
          </div>
        ) : (
          <>
            {combinedSuspensions.length > 0 && (() => {
              const nextComp =
                hydratedFmSave?.decodedPayload?.upcomingFixtures?.[0]?.competition ??
                null;
              return (
                <div className="p-3.5 rounded-xl border border-amber-500/40 bg-slate-900/75 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Active Suspensions ({combinedSuspensions.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {combinedSuspensions.map((ban, idx) => {
                      const appliesNext = isSuspensionActiveForCompetition(
                        ban,
                        nextComp
                      );
                      return (
                        <div
                          key={`${ban.playerUid}-${ban.competitionName}-${idx}`}
                          className={`rounded-lg border px-2.5 py-1 text-xs ${
                            appliesNext
                              ? 'border-rose-500/45 bg-rose-950/40 text-rose-200'
                              : 'border-amber-500/40 bg-amber-950/30 text-amber-200'
                          }`}
                        >
                          <strong className="text-white">{ban.playerName}</strong>{' '}
                          <span
                            className={`font-mono font-bold ${
                              appliesNext ? 'text-rose-300' : 'text-amber-300'
                            }`}
                          >
                            ({ban.matchesRemaining}m)
                          </span>{' '}
                          · {ban.competitionName}{' '}
                          {!appliesNext && (
                            <span className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                              {ban.scope === 'cup'
                                ? 'Cup Ban Only — Eligible Next Match'
                                : 'Other-Comp Ban — Eligible Next Match'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

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

            {competitionRules?.matchdaySubsLimit && (
              <div className="px-4 py-2.5 rounded-xl border border-sky-500/30 bg-sky-950/20 text-xs text-sky-200 flex flex-wrap items-center justify-between gap-2">
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

      {/* SUB-TAB 2: MATCH PREP & TOUCHLINE COMPANION */}
      {subTab === 'prep' && (
        <div className="space-y-4">
          {hasSquad && companionMode && effectiveSolvedSlots.length > 0 && (
            <MatchdayCompanionView
              clubName={displayClub}
              nextFixture={nextFixture}
              activeShape={activeShape}
              slots={effectiveSolvedSlots}
              allPlayers={scopedPlayers}
            />
          )}
          <MatchPrepCard
            players={scopedPlayers}
            activeSlots={effectiveSolvedSlots}
            hydratedFmSave={hydratedFmSave}
            activeSuspensions={combinedSuspensions}
            clubName={clubName}
          />
        </div>
      )}

      {/* SUB-TAB 3: SET PIECES (CORNERS) & TRAINING */}
      {subTab === 'setpieces' && (
        <SetPiecesAndTraining
          players={scopedPlayers}
          saveDate={saveDate}
          upcomingFixtures={hydratedFmSave?.decodedPayload.upcomingFixtures || []}
          clubName={clubName}
        />
      )}

      {/* SUB-TAB 4: PORTABLE FM27 PLAYBOOK v2.0 REFERENCE */}
      {subTab === 'playbook' && (
        <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-start gap-2.5">
              <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  Bobby Dean — Portable FM27 Tactics &amp; Journeyman Playbook v2.0
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Club-independent Patch 27.1.0 Dual-Phase architecture, 2-Window Substitution Rule, Set-Piece Zonal Fortress, and Physical Engine laws.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 shrink-0">
              Patch 27.1.0 Baseline
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
      )}
    </div>
  );
};
