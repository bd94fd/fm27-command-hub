import React, { useMemo, useState } from 'react';
import { LayoutDashboard, Shield, Sparkles, User, Zap } from 'lucide-react';
import { MobileSheetFrame } from './MobileSheetFrame';
import { AttributesTab } from './player-detail/AttributesTab';
import { OverviewTab } from './player-detail/OverviewTab';
import { ContractTab } from './player-detail/ContractTab';
import { RolesTab } from './player-detail/RolesTab';
import { EngineTab } from './player-detail/EngineTab';
import {
  formatFootLabel,
  normalizeAttrKey,
  readOptionalAttr,
} from '../utils/playerDetailFormat';
import { PlayerQuickActionBar } from './PlayerModalMobileStrip';
import { PlayerRecord, ShortlistRecord } from '../types/fm27';
import {
  ClubGovernanceState,
  DivisionBenchmarks,
  LastMatchTacticBlueprint,
  RecruitmentTarget,
} from '../types/fmSave';
import type { ShortlistTargetAdvice } from '../utils/shortlistAdviceEngine';
import { evaluateSquadPlayerCard } from '../utils/cardIntelligenceEngine';
import {
  FM27_ROLES,
  FM27_ROLE_ATTR_MAP,
  getNaturalRolesForPlayer,
  resolveNaturalDefaultRoles,
} from '../utils/fm27RoleMatcher';

import {
  formatAge,
  formatContractExpiry,
  formatNation,
  formatWeeklyWage,
} from '../utils/squadViewHelpers';
import {
  analyzePlayerCard,
  getPrimaryPositionCode,
  getRealShirtNumber,
} from '../utils/playerCardAnalysis';
import { isSuspensionActiveForCompetition } from '../utils/bestXiSolver';
import { formatDynamicCurrency } from './charts/chartScaleHelpers';
import { evaluatePlayerMetaScore } from '../utils/metaScoreEngine';
import { buildPlayerCardModel, exportPlayerCardPng } from '../utils/playerCardExport';
import { MetaRatingBadge } from './meta/MetaRatingBadge';
import { evaluateDualPhaseRoles } from '../utils/dualPhaseRoleEngine';

interface PlayerDetailModalProps {
  player: PlayerRecord | null;
  squadPlayers?: PlayerRecord[];
  divisionBenchmarks?: DivisionBenchmarks | null;
  governance?: ClubGovernanceState | null;
  lastMatchTactic?: LastMatchTacticBlueprint | null;
  nextCompetitionName?: string | null;
  isFastSync?: boolean;
  playedMatchesCount?: number;
  shortlists: ShortlistRecord[];
  shortlistUpgrades?: ShortlistTargetAdvice[];
  onOpenShortlistTarget?: (target: RecruitmentTarget) => void;
  isManagedClubPlayer?: boolean;
  isTracked?: boolean;
  onClose: () => void;
  onAddRecruitment: (player: PlayerRecord) => void;
  onToggleTrack?: (player: PlayerRecord) => void;
  onAddToShortlist: (shortlistId: string, playerId: string) => void;
}

type DetailTab = 'overview' | 'attributes' | 'positions' | 'metrics' | 'contract';

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({
  player,
  squadPlayers = [],
  divisionBenchmarks = null,
  governance = null,
  lastMatchTactic = null,
  nextCompetitionName = null,
  isFastSync = false,
  playedMatchesCount,
  shortlists,
  shortlistUpgrades = [],
  onOpenShortlistTarget,
  isManagedClubPlayer = false,
  isTracked = false,
  onClose,
  onAddRecruitment,
  onToggleTrack,
  onAddToShortlist,
}) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [mobileAttrGroup, setMobileAttrGroup] = useState<'all' | 'primary' | 'mental' | 'physical'>('all');
  const [selectedIpRole, setSelectedIpRole] = useState<string>('');
  const [selectedOopRole, setSelectedOopRole] = useState<string>('');
  const [comparePlayerId, setComparePlayerId] = useState<string>('__AUTO__');
  const [selectedShortlistId, setSelectedShortlistId] = useState<string>('');
  const [shortlistFeedback, setShortlistFeedback] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  React.useEffect(() => {
    setActiveTab('overview');
    setMobileAttrGroup('all');
    setSelectedIpRole('');
    setSelectedOopRole('');
    setComparePlayerId('__AUTO__');
  }, [player?.id]);

  const analysis = useMemo(
    () =>
      player
        ? analyzePlayerCard(player, squadPlayers, divisionBenchmarks, {
            isFastSync,
            playedMatchesCount,
          })
        : null,
    [player, squadPlayers, divisionBenchmarks, isFastSync, playedMatchesCount]
  );

  const cardIntel = useMemo(
    () =>
      player
        ? evaluateSquadPlayerCard(player, squadPlayers, {
            divisionBenchmarks,
            activeTactic: lastMatchTactic,
            governance,
          })
        : null,
    [player, squadPlayers, divisionBenchmarks, lastMatchTactic, governance]
  );

  const naturalDefaults = useMemo(
    () =>
      player ? resolveNaturalDefaultRoles(player) : { ipRole: '', oopRole: '' },
    [player]
  );

  const scopedIpRoles = useMemo(
    () => (player ? getNaturalRolesForPlayer(player, 'In Possession') : []),
    [player]
  );

  const scopedOopRoles = useMemo(
    () => (player ? getNaturalRolesForPlayer(player, 'Out of Possession') : []),
    [player]
  );

  const effectiveIpRole =
    selectedIpRole && scopedIpRoles.some((r) => r.name === selectedIpRole)
      ? selectedIpRole
      : naturalDefaults.ipRole;
  const effectiveOopRole =
    selectedOopRole && scopedOopRoles.some((r) => r.name === selectedOopRole)
      ? selectedOopRole
      : naturalDefaults.oopRole;

  const highlightedKeys = useMemo(() => {
    const keySet = new Set<string>();
    const prefSet = new Set<string>();
    const matchRole = (name: string, phase: 'In Possession' | 'Out of Possession') =>
      FM27_ROLES.find(
        (r) =>
          r.phase === phase &&
          (r.name.toLowerCase() === name.toLowerCase() ||
            name.toLowerCase().includes(r.name.toLowerCase()))
      );

    for (const [roleName, phase] of [
      [effectiveIpRole, 'In Possession'],
      [effectiveOopRole, 'Out of Possession'],
    ] as const) {
      if (!roleName) continue;
      const found = matchRole(roleName, phase);
      if (found?.priorities) {
        for (const [snakeKey, tier] of Object.entries(found.priorities)) {
          const camelKey = FM27_ROLE_ATTR_MAP[snakeKey] || snakeKey;
          const normKey = normalizeAttrKey(String(camelKey));
          const normSnake = normalizeAttrKey(snakeKey);
          if (tier === 'primary') {
            keySet.add(normKey);
            keySet.add(normSnake);
          } else {
            prefSet.add(normKey);
            prefSet.add(normSnake);
          }
        }
      }
    }
    return { keySet, prefSet };
  }, [effectiveIpRole, effectiveOopRole]);

  const compareCandidates = useMemo(
    () =>
      player
        ? squadPlayers
            .filter((p) => p.id !== player.id)
            .sort((a, b) => b.ability - a.ability)
        : [],
    [player, squadPlayers]
  );

  const resolvedComparePlayer = useMemo(() => {
    if (!player) return null;
    if (comparePlayerId === '__NONE__') return null;
    if (comparePlayerId === '__AUTO__') {
      return analysis?.squadDepth?.bestTeammate || null;
    }
    return compareCandidates.find((p) => p.id === comparePlayerId) || null;
  }, [player, comparePlayerId, analysis, compareCandidates]);

  if (!player || !analysis) return null;

  const a = player.attributes;
  const realNumber = getRealShirtNumber(player);
  const posCode = getPrimaryPositionCode(player.position);

  const technicalAttrs: Array<{ label: string; value: number | null }> = [
    { label: 'Corners', value: readOptionalAttr(a.corners) },
    { label: 'Crossing', value: readOptionalAttr(a.crossing) },
    { label: 'Dribbling', value: readOptionalAttr(a.dribbling) },
    { label: 'Finishing', value: readOptionalAttr(a.finishing) },
    { label: 'First Touch', value: readOptionalAttr(a.firstTouch) },
    { label: 'Free Kicks', value: readOptionalAttr(a.freeKicks) },
    { label: 'Heading', value: readOptionalAttr(a.heading) },
    { label: 'Long Shots', value: readOptionalAttr(a.longShots) },
    { label: 'Long Throws', value: readOptionalAttr(a.longThrows) },
    { label: 'Marking', value: readOptionalAttr(a.marking) },
    { label: 'Passing', value: readOptionalAttr(a.passing) },
    { label: 'Penalties', value: readOptionalAttr(a.penalties) },
    { label: 'Tackling', value: readOptionalAttr(a.tackling) },
    { label: 'Technique', value: readOptionalAttr(a.technique) },
  ];

  const mentalAttrs: Array<{ label: string; value: number | null }> = [
    { label: 'Aggression', value: readOptionalAttr(a.aggression) },
    { label: 'Anticipation', value: readOptionalAttr(a.anticipation) },
    { label: 'Bravery', value: readOptionalAttr(a.bravery) },
    { label: 'Composure', value: readOptionalAttr(a.composure) },
    { label: 'Concentration', value: readOptionalAttr(a.concentration) },
    { label: 'Decisions', value: readOptionalAttr(a.decisions) },
    { label: 'Determination', value: readOptionalAttr(a.determination) },
    { label: 'Flair', value: readOptionalAttr(a.flair) },
    { label: 'Leadership', value: readOptionalAttr(a.leadership) },
    { label: 'Off The Ball', value: readOptionalAttr(a.offTheBall) },
    { label: 'Positioning', value: readOptionalAttr(a.positioning) },
    { label: 'Teamwork', value: readOptionalAttr(a.teamwork) },
    { label: 'Vision', value: readOptionalAttr(a.vision) },
    { label: 'Work Rate', value: readOptionalAttr(a.workRate) },
  ];

  const physicalAttrs: Array<{ label: string; value: number | null }> = [
    { label: 'Acceleration', value: readOptionalAttr(a.acceleration) },
    { label: 'Agility', value: readOptionalAttr(a.agility) },
    { label: 'Balance', value: readOptionalAttr(a.balance) },
    { label: 'Jumping Reach', value: readOptionalAttr(a.jumpingReach) },
    { label: 'Natural Fitness', value: readOptionalAttr(a.naturalFitness) },
    { label: 'Pace', value: readOptionalAttr(a.pace) },
    { label: 'Stamina', value: readOptionalAttr(a.stamina) },
    { label: 'Strength', value: readOptionalAttr(a.strength) },
  ];

  const posUpperNormalized = (player.position || '').toUpperCase();
  const isGoalkeeper =
    posUpperNormalized.includes('GK') ||
    (!posUpperNormalized.trim() &&
      typeof a.reflexes === 'number' &&
      a.reflexes >= 12 &&
      typeof a.handling === 'number' &&
      a.handling >= 12);

  const gkAttrs: Array<{ label: string; value: number | null }> = [
    { label: 'Aerial Reach', value: readOptionalAttr(a.aerialReach) },
    { label: 'Command of Area', value: readOptionalAttr(a.commandOfArea) },
    { label: 'Communication', value: readOptionalAttr(a.communication) },
    { label: 'Eccentricity', value: readOptionalAttr(a.eccentricity) },
    { label: 'Handling', value: readOptionalAttr(a.handling) },
    { label: 'Kicking', value: readOptionalAttr(a.kicking) },
    { label: 'One on Ones', value: readOptionalAttr(a.oneOnOnes) },
    { label: 'Punching', value: readOptionalAttr(a.punching) },
    { label: 'Reflexes', value: readOptionalAttr(a.reflexes) },
    { label: 'Rushing Out', value: readOptionalAttr(a.rushingOut) },
    { label: 'Throwing', value: readOptionalAttr(a.throwing) },
  ];

  const scoutBadges = player.scoutBadges || [];
  const traits = player.traits || [];
  const formTrend = player.last5Form;

  const handleShortlistAdd = () => {
    const targetId = selectedShortlistId || shortlists[0]?.id;
    if (!targetId) return;
    onAddToShortlist(targetId, player.id);
    setShortlistFeedback('Added to shortlist');
    setTimeout(() => setShortlistFeedback(null), 2000);
  };

  const handleExportPlayerCardPng = () => {
    const model = buildPlayerCardModel({
      player,
      analysis,
      effectiveIpRole,
      effectiveOopRole,
      isGoalkeeper,
      scoutBadges,
    });
    if (!exportPlayerCardPng(model)) return;
    setExportFeedback('PNG Exported');
    setTimeout(() => setExportFeedback(null), 2200);
  };

  return (
    <MobileSheetFrame
      isOpen={Boolean(player)}
      onClose={onClose}
      ariaLabel={`Player profile for ${player.name}`}
      closeAriaLabel="Close player modal"
      maxWidthClass="sm:max-w-4xl"
      bodyClassName="p-4 sm:p-5 space-y-4"
      header={
        <div className="space-y-2 min-w-0">
          <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
            <div
              className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-sm font-mono"
              title={realNumber ? `Squad Number #${realNumber}` : `Primary Position: ${posCode}`}
            >
              {realNumber ? `#${realNumber}` : posCode}
            </div>
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="text-base sm:text-lg font-bold text-white leading-tight break-words">
                  {player.name}
                </h2>
                <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-mono text-emerald-300">
                  {player.position}
                </span>
                <span
                  className="rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-xs font-semibold text-amber-300"
                  title="Star rating relative to your current squad"
                >
                  {player.ability.toFixed(1)}★ / {player.potential.toFixed(1)}★
                </span>
                {/* Secondary intelligence badges stay in header on sm:+ desktop; shown inside body ribbon on < sm mobile to keep sticky header sleek */}
                <span className="hidden sm:contents">
                  {analysis.bestIpRole && (
                    <span className="rounded-md bg-sky-500/15 border border-sky-500/35 px-2 py-0.5 text-xs font-semibold text-sky-300">
                      Best Fit: {analysis.bestIpRole.role.name} · {analysis.bestIpRole.fitPct}%
                    </span>
                  )}
                  {(() => {
                    const dual = evaluateDualPhaseRoles(player, 1);
                    return (
                      <>
                        <MetaRatingBadge player={player} />
                        {(dual.bestInPossession || dual.bestOutOfPossession) && (
                          <span
                            className="rounded-md bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-micro font-medium text-cyan-200"
                            title="FM27 Touchline Dual-Phase Best Roles (In-Possession / Out-of-Possession)"
                          >
                            IP: {dual.bestInPossession?.name ?? '--'} · OOP:{' '}
                            {dual.bestOutOfPossession?.name ?? '--'}
                          </span>
                        )}
                      </>
                    );
                  })()}
                  {player.squadUnit && player.squadUnit !== 'First Team' && (
                    <span className="rounded-md bg-indigo-500/15 border border-indigo-500/35 px-2 py-0.5 text-micro font-semibold text-indigo-300">
                      {player.squadUnit}
                    </span>
                  )}
                  {player.onLoan && (
                    <span className="rounded-md bg-purple-500/15 border border-purple-500/35 px-2 py-0.5 text-micro font-semibold text-purple-300">
                      On Loan
                    </span>
                  )}
                  {player.morale && (
                    <span className="rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-micro text-slate-300">
                      Morale: {player.morale}
                    </span>
                  )}
                </span>
                {player.activeSuspensions && player.activeSuspensions.length > 0 && (() => {
                  const nextBan = player.activeSuspensions.find((b) =>
                    isSuspensionActiveForCompetition(b, nextCompetitionName)
                  );
                  const firstBan = nextBan || player.activeSuspensions[0];
                  return nextBan ? (
                    <span className="rounded-md bg-rose-500/20 border border-rose-500/50 px-2 py-0.5 text-xs font-bold uppercase text-rose-300">
                      BANNED ({nextBan.matchesRemaining}m)
                    </span>
                  ) : (
                    <span className="rounded-md bg-amber-500/20 border border-amber-500/50 px-2 py-0.5 text-xs font-bold uppercase text-amber-200">
                      {firstBan.scope === 'cup' ? 'CUP BAN ONLY' : 'OTHER-COMP BAN'} ({firstBan.matchesRemaining}m)
                    </span>
                  );
                })()}
              </div>
              <p className="text-micro sm:text-xs text-slate-400 leading-snug">
                Age {formatAge(player.age)} · {formatNation(player.nation)} ·{' '}
                {formatFootLabel(player)}
                {player.heightCm ? ` · ${player.heightCm} cm` : ''}
                <span className="hidden sm:inline"> · {player.personality}</span> ·{' '}
                {formatWeeklyWage(player.wagePw)}
                <span className="hidden sm:inline">
                  {' '}
                  (exp {formatContractExpiry(player.expires)})
                </span>
                {player.marketValueCapped || player.marketValueState === 'capped'
                  ? ' · £300m cap'
                  : typeof player.marketValue === 'number' && player.marketValue > 0
                    ? ` · ${formatDynamicCurrency(player.marketValue, 'marketValue')}`
                    : ''}
              </p>
            </div>
          </div>

          <div className="hidden sm:block">
            <PlayerQuickActionBar
              player={player}
              isManagedClubPlayer={isManagedClubPlayer}
              isTracked={isTracked}
              shortlists={shortlists}
              selectedShortlistId={selectedShortlistId}
              onSelectShortlistId={setSelectedShortlistId}
              exportFeedback={exportFeedback}
              shortlistFeedback={shortlistFeedback}
              onExportPng={handleExportPlayerCardPng}
              onToggleTrack={onToggleTrack}
              onAddRecruitment={onAddRecruitment}
              onShortlistAdd={handleShortlistAdd}
            />
          </div>
        </div>
      }
      subHeader={
        <div className="flex gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950/60 px-3 sm:px-5 pt-1 no-scrollbar snap-x">
          {(
            [
              { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: LayoutDashboard },
              { id: 'attributes', label: 'Attributes', shortLabel: 'Attrs', icon: Sparkles },
              { id: 'positions', label: 'Roles & Pitch', shortLabel: 'Roles', icon: Shield },
              { id: 'metrics', label: 'Engine & Charts', shortLabel: 'Charts', icon: Zap },
              { id: 'contract', label: 'Stats & Contract', shortLabel: 'Contract', icon: User },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`min-h-[44px] inline-flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 sm:px-3 py-2 text-xs font-medium transition cursor-pointer ${
                  activeTab === t.id
                    ? 'border-emerald-400 text-emerald-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="sm:hidden">{t.shortLabel}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
        </div>
      }
    >
          {/* Mobile-only compact intelligence tags & 44px action bar (keeps sticky sheet header slim on Android) */}
          <div className="sm:hidden space-y-2.5 rounded-xl border border-slate-800/90 bg-slate-950/60 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {analysis.bestIpRole && (
                <span className="rounded-md bg-sky-500/15 border border-sky-500/35 px-2 py-0.5 text-micro font-semibold text-sky-300">
                  Best Fit: {analysis.bestIpRole.role.name} · {analysis.bestIpRole.fitPct}%
                </span>
              )}
              {(() => {
                const meta = evaluatePlayerMetaScore(player);
                return meta.metaScore !== null ? (
                  <MetaRatingBadge player={player} className="text-micro" />
                ) : null;
              })()}
              {player.squadUnit && player.squadUnit !== 'First Team' && (
                <span className="rounded-md bg-indigo-500/15 border border-indigo-500/35 px-2 py-0.5 text-micro font-semibold text-indigo-300">
                  {player.squadUnit}
                </span>
              )}
              {player.onLoan && (
                <span className="rounded-md bg-purple-500/15 border border-purple-500/35 px-2 py-0.5 text-micro font-semibold text-purple-300">
                  On Loan
                </span>
              )}
              {player.morale && (
                <span className="rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-micro text-slate-300">
                  Morale: {player.morale}
                </span>
              )}
              <span className="rounded-md bg-slate-900 border border-slate-800 px-2 py-0.5 text-micro text-slate-400">
                {player.personality} · exp {formatContractExpiry(player.expires)}
              </span>
            </div>
            <PlayerQuickActionBar
              player={player}
              isManagedClubPlayer={isManagedClubPlayer}
              isTracked={isTracked}
              shortlists={shortlists}
              selectedShortlistId={selectedShortlistId}
              onSelectShortlistId={setSelectedShortlistId}
              exportFeedback={exportFeedback}
              shortlistFeedback={shortlistFeedback}
              onExportPng={handleExportPlayerCardPng}
              onToggleTrack={onToggleTrack}
              onAddRecruitment={onAddRecruitment}
              onShortlistAdd={handleShortlistAdd}
            />
          </div>

          {player.activeSuspensions && player.activeSuspensions.length > 0 && (() => {
            const appliesNext = player.activeSuspensions.some((b) =>
              isSuspensionActiveForCompetition(b, nextCompetitionName)
            );
            return (
              <div
                className={`rounded-xl border px-4 py-3 text-xs space-y-1 ${
                  appliesNext
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                }`}
              >
                <div
                  className={`font-bold uppercase tracking-wider ${
                    appliesNext ? 'text-rose-300' : 'text-amber-300'
                  }`}
                >
                  {appliesNext
                    ? 'Active Disciplinary Suspension — Do Not Select for Next Match'
                    : 'Other-Competition Suspension Only — Eligible for Next Match'}
                </div>
                {player.activeSuspensions.map((ban, idx) => (
                  <div key={`${ban.competitionName}-${idx}`}>
                    Banned for{' '}
                    <strong className="font-mono text-white">
                      {ban.matchesRemaining} match{ban.matchesRemaining === 1 ? '' : 'es'}
                    </strong>{' '}
                    in <strong>{ban.competitionName}</strong> ({ban.scope}) — {ban.reason}.
                  </div>
                ))}
              </div>
            );
          })()}

          {/* TAB 1: OVERVIEW (Instant Manager's Briefing) */}
          {activeTab === 'overview' && (
            <OverviewTab
              player={player}
              analysis={analysis}
              cardIntel={cardIntel}
              shortlistUpgrades={shortlistUpgrades}
              onOpenShortlistTarget={onOpenShortlistTarget}
              onClose={onClose}
            />
          )}

          {/* TAB 2: ATTRIBUTES */}
          {activeTab === 'attributes' && (
            <AttributesTab
              player={player}
              scoutBadges={scoutBadges}
              traits={traits}
              formTrend={formTrend}
              isGoalkeeper={isGoalkeeper}
              gkAttrs={gkAttrs}
              technicalAttrs={technicalAttrs}
              mentalAttrs={mentalAttrs}
              physicalAttrs={physicalAttrs}
              highlightedKeys={highlightedKeys}
              scopedIpRoles={scopedIpRoles}
              scopedOopRoles={scopedOopRoles}
              effectiveIpRole={effectiveIpRole}
              effectiveOopRole={effectiveOopRole}
              naturalDefaults={naturalDefaults}
              mobileAttrGroup={mobileAttrGroup}
              onMobileAttrGroupChange={setMobileAttrGroup}
              onSelectIpRole={setSelectedIpRole}
              onSelectOopRole={setSelectedOopRole}
            />
          )}

          {/* TAB 3: ROLES & PITCH */}
          {activeTab === 'positions' && <RolesTab player={player} analysis={analysis} />}

          {/* TAB 4: ENGINE & CHARTS */}
          {activeTab === 'metrics' && (
            <EngineTab
              player={player}
              analysis={analysis}
              squadPlayers={squadPlayers}
              effectiveIpRole={effectiveIpRole}
              effectiveOopRole={effectiveOopRole}
              highlightedPrimaryKeys={highlightedKeys.keySet}
              compareCandidates={compareCandidates}
              comparePlayerId={comparePlayerId}
              onComparePlayerChange={setComparePlayerId}
              resolvedComparePlayer={resolvedComparePlayer}
            />
          )}

          {/* TAB 5: STATS & CONTRACT */}
          {activeTab === 'contract' && <ContractTab player={player} analysis={analysis} />}
    </MobileSheetFrame>
  );
};
