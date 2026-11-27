import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  LayoutDashboard,
  Shield,
  Sparkles,
  TrendingUp,
  User,
  Zap,
} from 'lucide-react';
import { MobileSheetFrame } from './MobileSheetFrame';
import { AttributesTab } from './player-detail/AttributesTab';
import {
  attrColorClass,
  formatFootLabel,
  normalizeAttrKey,
  pitchBadgeClass,
  readOptionalAttr,
} from '../utils/playerDetailFormat';
import {
  PlayerOverviewKpiStrip,
  PlayerQuickActionBar,
} from './PlayerModalMobileStrip';
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
  scorePlayerForFm27Role,
} from '../utils/fm27RoleMatcher';
import {
  getPlaybookContractNotes,
  partitionContractClausesAndBonuses,
} from '../utils/recruitmentHelpers';
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
  type RankedRoleFit,
} from '../utils/playerCardAnalysis';
import { isSuspensionActiveForCompetition } from '../utils/bestXiSolver';
import {
  AttributeRadarChart,
  PercentilePizzaChart,
  PlayerProgressionSparkline,
  RolePercentilePizzaChart,
} from './charts/PlayerRadarAndPizzaCharts';
import { formatDynamicCurrency } from './charts/chartScaleHelpers';
import {
  buildPlayerProgressionSeries,
  loadProgressionArchive,
} from '../utils/progressionDiff';
import { evaluatePlayerMetaScore } from '../utils/metaScoreEngine';
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

const RoleFitExplainability: React.FC<{ fit: RankedRoleFit }> = ({ fit }) => (
  <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
    <div className="text-2xs font-bold uppercase tracking-wider text-slate-400">
      Why this score
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
      {fit.attributeWeights.map((attr) => (
        <div
          key={attr.key}
          className="flex items-center justify-between gap-2 text-micro min-w-0"
        >
          <span className="text-slate-300 truncate">
            {attr.label}
            {attr.missing ? ' (missing)' : ''}
          </span>
          <span className="font-mono text-slate-400 shrink-0 tabular-nums">
            {attr.value}/20 · ×{attr.weight} · {attr.weightSharePct}%
          </span>
        </div>
      ))}
    </div>
    <div className="flex flex-wrap gap-1">
      {fit.keyThresholds.map((threshold) => (
        <span
          key={threshold.key}
          className={`rounded-md border px-1.5 py-0.5 text-2xs font-mono ${
            threshold.met
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
          }`}
        >
          {threshold.label} {threshold.value}/20{' '}
          {threshold.met ? '✓' : `✗ < ${threshold.threshold}`}
        </span>
      ))}
    </div>
    {fit.nearestAlternative && (
      <div className="text-micro text-slate-400">
        Nearest alternative:{' '}
        <span className="text-slate-200">{fit.nearestAlternative.roleName}</span>{' '}
        ({fit.nearestAlternative.fitPct}% · {fit.nearestAlternative.tier})
      </div>
    )}
  </div>
);

const PITCH_ROWS: Array<Array<{ code: string; label: string }>> = [
  [{ code: 'ST', label: 'ST' }],
  [
    { code: 'AML', label: 'AML' },
    { code: 'AMC', label: 'AMC' },
    { code: 'AMR', label: 'AMR' },
  ],
  [
    { code: 'ML', label: 'ML' },
    { code: 'MC', label: 'MC' },
    { code: 'MR', label: 'MR' },
  ],
  [
    { code: 'WBL', label: 'WBL' },
    { code: 'DM', label: 'DM' },
    { code: 'WBR', label: 'WBR' },
  ],
  [
    { code: 'DL', label: 'DL' },
    { code: 'DC', label: 'DC' },
    { code: 'DR', label: 'DR' },
  ],
  [{ code: 'GK', label: 'GK' }],
];

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
  const seasonHistory = player.seasonHistory || [];

  const getPositionScore = (code: string): number => {
    if (player.positionRatings) {
      if (typeof player.positionRatings[code] === 'number') {
        return player.positionRatings[code];
      }
      const upper = code.toUpperCase();
      if (upper === 'ST' && typeof player.positionRatings['STC'] === 'number') {
        return player.positionRatings['STC'];
      }
      if (upper === 'STC' && typeof player.positionRatings['ST'] === 'number') {
        return player.positionRatings['ST'];
      }
      const matchedKey = Object.keys(player.positionRatings).find(
        (k) => k.toUpperCase() === upper
      );
      if (matchedKey && typeof player.positionRatings[matchedKey] === 'number') {
        return player.positionRatings[matchedKey];
      }
    }
    const posUpper = player.position.toUpperCase();
    if (posUpper.includes(code)) return 19;
    if (code === 'DC' && /\bD\s*\([^)]*C/.test(posUpper)) return 19;
    if (code === 'DL' && /\bD\s*\([^)]*L/.test(posUpper)) return 18;
    if (code === 'DR' && /\bD\s*\([^)]*R/.test(posUpper)) return 18;
    if (code === 'AML' && /AM\s*\([^)]*L/.test(posUpper)) return 18;
    if (code === 'AMR' && /AM\s*\([^)]*R/.test(posUpper)) return 18;
    if (code === 'AMC' && /AM\s*\([^)]*C/.test(posUpper)) return 18;
    if (code === 'MC' && /\bM\s*\([^)]*C/.test(posUpper)) return 18;
    return 1;
  };

  const handleShortlistAdd = () => {
    const targetId = selectedShortlistId || shortlists[0]?.id;
    if (!targetId) return;
    onAddToShortlist(targetId, player.id);
    setShortlistFeedback('Added to shortlist');
    setTimeout(() => setShortlistFeedback(null), 2000);
  };

  const handleExportPlayerCardPng = () => {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 760;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bg = ctx.createLinearGradient(0, 0, 760, 500);
    bg.addColorStop(0, '#020617');
    bg.addColorStop(0.55, '#0f172a');
    bg.addColorStop(1, '#022c22');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 760, 500);

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 744, 484);

    ctx.fillStyle = '#10b981';
    ctx.fillRect(28, 28, 704, 4);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('FM27 COMMAND HUB · DUAL-PHASE PLAYER CARD', 28, 54);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(player.name, 28, 92);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(
      `${player.ability.toFixed(1)}★ / ${player.potential.toFixed(1)}★ Pot  ·  ${player.position}`,
      28,
      120
    );

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.fillText(
      `Age ${formatAge(player.age)} · ${formatNation(player.nation)} · ${player.preferredFoot || 'Right'} Foot · ${player.personality} · ${formatWeeklyWage(player.wagePw)} (exp ${formatContractExpiry(player.expires)})`,
      28,
      144
    );

    const ipRoleObj = FM27_ROLES.find(
      (r) => r.phase === 'In Possession' && r.name === effectiveIpRole
    );
    const oopRoleObj = FM27_ROLES.find(
      (r) => r.phase === 'Out of Possession' && r.name === effectiveOopRole
    );
    const ipFitScore = ipRoleObj ? scorePlayerForFm27Role(player, ipRoleObj) : 75;
    const oopFitScore = oopRoleObj ? scorePlayerForFm27Role(player, oopRoleObj) : 75;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(28, 160, 704, 102);
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(28, 160, 704, 102);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(
      `IN POSSESSION (IP): ${effectiveIpRole || player.ipRole} (${ipFitScore}% Fit)`,
      44,
      185
    );

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(
      `OUT OF POSSESSION (OOP): ${effectiveOopRole || player.oopRole} (${oopFitScore}% Fit)`,
      44,
      209
    );

    ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
    ctx.beginPath();
    ctx.moveTo(44, 223);
    ctx.lineTo(716, 223);
    ctx.stroke();

    ctx.fillStyle = '#a7f3d0';
    ctx.font = 'bold 12px monospace';
    const engineSummary = `Physical ${analysis.physical.score}/100 (${analysis.physical.tier}) · ${analysis.physical.topSpeedKmh} km/h · Durability: ${analysis.physical.durability.tier}`;
    ctx.fillText(engineSummary, 44, 246, 672);

    const keyGrid: Array<{ label: string; value: number }> = isGoalkeeper
      ? [
          { label: 'Reflexes', value: a.reflexes ?? 10 },
          { label: 'Handling', value: a.handling ?? 10 },
          { label: 'Command Area', value: a.commandOfArea ?? 10 },
          { label: 'Aerial Reach', value: a.aerialReach ?? 10 },
          { label: 'One on Ones', value: a.oneOnOnes ?? 10 },
          { label: 'Kicking', value: a.kicking ?? 10 },
          { label: 'Decisions', value: a.decisions },
          { label: 'Positioning', value: a.positioning ?? 10 },
          { label: 'Determination', value: a.determination },
          { label: 'Agility', value: a.agility ?? 10 },
          { label: 'Pace', value: a.pace },
          { label: 'Passing', value: a.passing },
        ]
      : [
          { label: 'Pace', value: a.pace },
          { label: 'Acceleration', value: a.acceleration },
          { label: 'Stamina', value: a.stamina },
          { label: 'Jumping Reach', value: a.jumpingReach },
          { label: 'Passing', value: a.passing },
          { label: 'First Touch', value: a.firstTouch },
          { label: 'Finishing', value: a.finishing },
          { label: 'Tackling', value: a.tackling },
          { label: 'Decisions', value: a.decisions },
          { label: 'Determination', value: a.determination },
          { label: 'Work Rate', value: a.workRate },
          { label: 'Off The Ball', value: a.offTheBall },
        ];

    const colWidth = 226;
    const rowHeight = 34;
    keyGrid.forEach((item, idx) => {
      const col = Math.floor(idx / 4);
      const row = idx % 4;
      const x = 28 + col * (colWidth + 13);
      const y = 278 + row * (rowHeight + 6);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(x, y, colWidth, rowHeight);
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
      ctx.strokeRect(x, y, colWidth, rowHeight);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '13px sans-serif';
      ctx.fillText(item.label, x + 12, y + 22);

      ctx.fillStyle =
        item.value >= 16
          ? '#6ee7b7'
          : item.value >= 13
            ? '#bef264'
            : item.value >= 10
              ? '#fde68a'
              : '#94a3b8';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(String(item.value).padStart(2, ' '), x + colWidth - 34, y + 22);
    });

    const badgeLine =
      scoutBadges.length > 0
        ? `Scout Badges: ${scoutBadges.join(' · ')}`
        : 'FM27 Command Hub · Relative Squad Stars & 1–20 Attributes';
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(badgeLine.slice(0, 88), 28, 468);

    const safeSlug = player.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${safeSlug || 'fm27-player'}-card.png`;
    link.href = dataUrl;
    link.click();

    setExportFeedback('PNG Exported');
    setTimeout(() => setExportFeedback(null), 2200);
  };

  const durabilityBadgeClass =
    analysis.physical.durability.tier === 'Ironman'
      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
      : analysis.physical.durability.tier === 'Reliable'
        ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
        : analysis.physical.durability.tier === 'Manage Load'
          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
          : 'bg-rose-500/15 border-rose-500/40 text-rose-300';

  const tierBadgeClass = (tier: 'Natural Fit' | 'Solid' | 'Makeshift') =>
    tier === 'Natural Fit'
      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
      : tier === 'Solid'
        ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
        : 'bg-amber-500/15 border-amber-500/40 text-amber-300';

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
            <div className="space-y-4">
              {/* Instant 4-Tile Snapshot Bar */}
              <PlayerOverviewKpiStrip
                player={player}
                analysis={analysis}
                cardIntel={cardIntel}
                durabilityBadgeClass={durabilityBadgeClass}
              />

              {/* Scouting Verdict */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 sm:p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                    Scouting Verdict
                  </h3>
                  {analysis.squadDepth && (
                    <span className="rounded-md bg-slate-900/95 border border-slate-700 px-2 py-0.5 text-micro font-medium text-slate-200">
                      {analysis.squadDepth.summary}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {analysis.scoutingVerdict}
                </p>
                <p className="text-micro text-slate-400">
                  Stars ({player.ability.toFixed(1)}★ / {player.potential.toFixed(1)}★) are measured relative to your current squad.
                </p>
              </div>

              {/* Role in Squad: Now vs 1–3 Year Future Outlook */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-1">
                  <div className="text-2xs font-bold uppercase tracking-wider text-emerald-400">
                    Role in Squad · Right Now
                  </div>
                  <p className="text-slate-200 leading-relaxed">
                    {analysis.squadDepth
                      ? `${analysis.squadDepth.summary}. `
                      : ''}
                    Best deployed as{' '}
                    <strong className="text-emerald-300">
                      {analysis.bestIpRole?.role.name || player.ipRole || 'Standard'}
                    </strong>{' '}
                    (IP) /{' '}
                    <strong className="text-sky-300">
                      {analysis.bestOopRole?.role.name || player.oopRole || 'Standard'}
                    </strong>{' '}
                    (OOP) · {analysis.physical.durability.tier} durability ({analysis.physical.durability.stamina}/20 Stamina).
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-1">
                  <div className="text-2xs font-bold uppercase tracking-wider text-sky-400">
                    1–3 Year Squad Outlook · {analysis.development.stage}
                  </div>
                  <p className="text-slate-200 leading-relaxed">
                    {analysis.development.headline} — {analysis.development.note}
                    {analysis.contractStanding.monthsRemaining !== null &&
                    analysis.contractStanding.monthsRemaining <= 12
                      ? ` Contract expires in ${analysis.contractStanding.monthsRemaining}m (${player.expires}).`
                      : ''}
                  </p>
                </div>
              </div>

              {/* Inline In-Game Shortlist Upgrade / Replacement Callout */}
              {shortlistUpgrades.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-amber-200">
                      ★ In-Game Shortlist Upgrade / Replacement Ready ({shortlistUpgrades.length})
                    </span>
                    <span className="text-2xs font-mono text-emerald-300">
                      Passes Strict Club Budget Gate
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {shortlistUpgrades.slice(0, 2).map((up) => (
                      <div
                        key={up.target.uid}
                        className="rounded-lg border border-slate-800 bg-slate-950/85 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="font-bold text-white">
                            {up.target.name}{' '}
                            <span className="font-mono text-micro text-emerald-300">
                              ({up.target.primaryPosition}, Age {formatAge(up.target.age)})
                            </span>{' '}
                            <span className="rounded-md bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-2xs text-emerald-200">
                              {up.tierLabel}
                            </span>
                          </div>
                          <p className="text-micro text-slate-300 leading-snug">
                            {up.whyUpgradeOrHold}
                          </p>
                        </div>
                        {onOpenShortlistTarget && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenShortlistTarget(up.target);
                            }}
                            className="min-h-[36px] shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-3 py-1.5 text-micro font-semibold text-emerald-200 transition cursor-pointer"
                          >
                            Open Profile →
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FM27 Intelligence Profile: 8-Spoke Percentile Pizza + Active Tactic & Promise Audit */}
              {cardIntel && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div className="md:col-span-6 flex justify-center">
                    <PercentilePizzaChart
                      slices={cardIntel.pizzaSlices}
                      playerName={player.name}
                      subtitle={`Club DNA ${cardIntel.dnaFitPct}% · ${cardIntel.valueTag}`}
                      size={238}
                    />
                  </div>
                  <div className="md:col-span-6 space-y-2.5 text-xs">
                    <div>
                      <div className="text-2xs uppercase tracking-wider text-slate-400 font-semibold">
                        Card Intelligence Verdict
                      </div>
                      <div className="text-sm font-bold text-white mt-0.5">
                        {cardIntel.verdictLabel}
                      </div>
                      <p className="text-slate-300 mt-1 leading-relaxed">
                        {cardIntel.inlineRationale}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 space-y-1">
                      <div className="text-2xs uppercase tracking-wider text-sky-400 font-semibold">
                        Active Tactic &amp; Promise Alignment
                      </div>
                      <p className="text-micro text-slate-200">{cardIntel.tacticalFitNote}</p>
                      <p className="text-micro text-amber-300">
                        {cardIntel.promiseTag || 'Playing-time promise currently aligned with minutes'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Strengths & Watchpoints */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Top Strengths
                  </div>
                  {analysis.strengths.length > 0 ? (
                    <div className="space-y-2">
                      {analysis.strengths.map((s) => (
                        <div key={s.attrKey} className="text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-100">{s.label}</span>
                            <span className={`font-mono ${attrColorClass(s.value)}`}>
                              {s.value}/20
                            </span>
                          </div>
                          <p className="text-micro text-slate-400">{s.summary}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">
                      No standout 12+ attributes recorded for this position yet.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Key Watchpoints
                  </div>
                  {analysis.watchpoints.length > 0 ? (
                    <div className="space-y-2">
                      {analysis.watchpoints.map((w) => (
                        <div key={w.attrKey} className="text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-100">{w.label}</span>
                            <span className="font-mono text-rose-300 font-semibold">
                              {w.value}/20
                            </span>
                          </div>
                          <p className="text-micro text-slate-400">{w.summary}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-300/80">
                      No major attribute weaknesses (all key positional traits are 10+).
                    </p>
                  )}
                </div>
              </div>

              {/* Recommended Dual-Phase Setup */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysis.bestIpRole && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-2xs font-bold uppercase tracking-wider text-emerald-400">
                        Best In-Possession (IP) Role
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-2xs font-semibold ${tierBadgeClass(
                          analysis.bestIpRole.tier
                        )}`}
                      >
                        {analysis.bestIpRole.fitPct}% · {analysis.bestIpRole.tier}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-white">
                      {analysis.bestIpRole.role.name}
                    </div>
                    <RoleFitExplainability fit={analysis.bestIpRole} />
                    {analysis.bestIpRole.topSupporting.length > 0 && (
                      <div className="text-micro text-slate-400">
                        Driven by:{' '}
                        <span className="text-slate-200">
                          {analysis.bestIpRole.topSupporting
                            .map((x) => `${x.label} ${x.value}`)
                            .join(' · ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {analysis.bestOopRole && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-2xs font-bold uppercase tracking-wider text-sky-400">
                        Best Out-of-Possession (OOP) Role
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-2xs font-semibold ${tierBadgeClass(
                          analysis.bestOopRole.tier
                        )}`}
                      >
                        {analysis.bestOopRole.fitPct}% · {analysis.bestOopRole.tier}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-white">
                      {analysis.bestOopRole.role.name}
                    </div>
                    <RoleFitExplainability fit={analysis.bestOopRole} />
                    {analysis.bestOopRole.topSupporting.length > 0 && (
                      <div className="text-micro text-slate-400">
                        Driven by:{' '}
                        <span className="text-slate-200">
                          {analysis.bestOopRole.topSupporting
                            .map((x) => `${x.label} ${x.value}`)
                            .join(' · ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actionable Manager Advice: Durability, Development & Club DNA */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">
                      Durability &amp; Workload
                    </span>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-2xs font-semibold ${durabilityBadgeClass}`}
                    >
                      {analysis.physical.durability.tier}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-white">
                    {analysis.physical.durability.headline}
                  </div>
                  <p className="text-micro text-slate-400 leading-relaxed">
                    {analysis.physical.durability.advice}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">
                      Development &amp; Training
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 text-2xs font-semibold text-indigo-300">
                      <TrendingUp className="h-3 w-3" />
                      {analysis.development.stage}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-white">
                    {analysis.development.headline}
                  </div>
                  <div className="text-micro text-slate-300">
                    Focus: <span className="text-emerald-300">{analysis.development.trainingFocus.join(', ')}</span>
                  </div>
                  <p className="text-micro text-slate-400 leading-relaxed">
                    {analysis.development.note}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">
                      Club DNA Fit
                    </span>
                    <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-2xs font-mono font-bold text-emerald-300">
                      {analysis.clubDna.overallDnaScore}/100
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-white">
                    {analysis.clubDna.bestArchetypeLabel}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-micro">
                    <div className="flex justify-between rounded-md bg-slate-900 px-2 py-1">
                      <span className="text-slate-400">Physical</span>
                      <span className="font-mono text-slate-200">{analysis.clubDna.pillarScores.physicalIntensity}</span>
                    </div>
                    <div className="flex justify-between rounded-md bg-slate-900 px-2 py-1">
                      <span className="text-slate-400">Technical</span>
                      <span className="font-mono text-slate-200">{analysis.clubDna.pillarScores.technicalSecurity}</span>
                    </div>
                    <div className="flex justify-between rounded-md bg-slate-900 px-2 py-1">
                      <span className="text-slate-400">Tactical</span>
                      <span className="font-mono text-slate-200">{analysis.clubDna.pillarScores.tacticalDiscipline}</span>
                    </div>
                    <div className="flex justify-between rounded-md bg-slate-900 px-2 py-1">
                      <span className="text-slate-400">Aerial</span>
                      <span className="font-mono text-slate-200">{analysis.clubDna.pillarScores.aerialDominance}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
          {activeTab === 'positions' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div className="rounded-xl border border-emerald-900/50 bg-gradient-to-b from-emerald-950/40 to-slate-950 p-3.5 sm:p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300 text-center">
                  FM27 Positional Familiarity Map
                </h4>
                <div className="space-y-2.5">
                  {PITCH_ROWS.map((row, rIdx) => (
                    <div key={rIdx} className="flex items-center justify-center gap-2 sm:gap-3">
                      {row.map((pos) => {
                        const score = getPositionScore(pos.code);
                        return (
                          <div
                            key={pos.code}
                            className={`w-16 rounded-lg border px-2 py-1.5 text-center ${pitchBadgeClass(
                              score
                            )}`}
                          >
                            <div className="text-micro font-bold">{pos.label}</div>
                            <div className="text-2xs font-mono opacity-80">{score}/20</div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <p className="text-2xs text-slate-400 text-center">
                  18–20 = Natural · 15–17 = Accomplished · 12–14 = Competent
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 sm:p-4 space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Top In-Possession (IP) Roles
                  </h4>
                  <div className="space-y-1.5">
                    {analysis.topIpRoles.map((r) => (
                      <div
                        key={r.role.name}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-slate-200 min-w-0 truncate">{r.role.name}</span>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-2xs font-mono font-semibold shrink-0 ${tierBadgeClass(
                            r.tier
                          )}`}
                        >
                          {r.fitPct}% · {r.tier}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 sm:p-4 space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400">
                    Top Out-of-Possession (OOP) Roles
                  </h4>
                  <div className="space-y-1.5">
                    {analysis.topOopRoles.map((r) => (
                      <div
                        key={r.role.name}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-slate-200 min-w-0 truncate">{r.role.name}</span>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-2xs font-mono font-semibold shrink-0 ${tierBadgeClass(
                            r.tier
                          )}`}
                        >
                          {r.fitPct}% · {r.tier}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 sm:p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Scout &amp; Tactical Notes
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {player.notes || 'Synced directly from FM27 save.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ENGINE & CHARTS */}
          {activeTab === 'metrics' && (
            <div className="space-y-4 sm:space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-2xs uppercase tracking-wider text-slate-400">
                      Physical
                    </span>
                    <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-3xs sm:text-2xs font-semibold text-emerald-300">
                      {analysis.physical.tier}
                    </span>
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono tabular-nums">
                    {analysis.physical.score}/100
                  </div>
                  <div className="text-micro text-slate-400 leading-snug">
                    {analysis.physical.explanation}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 space-y-1 min-w-0">
                  <div className="text-2xs uppercase tracking-wider text-slate-400">
                    Top Sprint Speed
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-sky-300 font-mono tabular-nums">
                    {analysis.physical.topSpeedKmh} <span className="text-xs sm:text-sm font-normal">km/h</span>
                  </div>
                  <div className="text-micro text-slate-300 leading-snug">
                    {analysis.physical.speedVerdict}
                  </div>
                  <div className="text-2xs text-slate-500 font-mono">
                    {analysis.physical.topSpeedMps} m/s · Pace {a.pace} · Acc {a.acceleration}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 space-y-1 min-w-0">
                  <div className="text-2xs uppercase tracking-wider text-slate-400">
                    Aerial Reach
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-amber-300 font-mono tabular-nums">
                    +{analysis.physical.jumpHeightMeters} m
                  </div>
                  <div className="text-micro text-slate-300 leading-snug">
                    {analysis.physical.aerialVerdict}
                  </div>
                  <div className="text-2xs text-slate-500 font-mono">
                    Jump {a.jumpingReach}/20 · Head {a.heading ?? '—'}/20
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-2xs uppercase tracking-wider text-slate-400">
                      Durability
                    </span>
                    <span
                      className={`rounded-md border px-1.5 py-0.5 text-3xs sm:text-2xs font-semibold ${durabilityBadgeClass}`}
                    >
                      {analysis.physical.durability.tier}
                    </span>
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-slate-100 font-mono tabular-nums">
                    {analysis.physical.durability.stamina}
                    <span className="text-xs sm:text-sm font-normal text-slate-400"> / </span>
                    {analysis.physical.durability.naturalFitness ?? '—'}
                  </div>
                  <div className="text-micro text-slate-300 leading-snug">
                    {analysis.physical.durability.headline}
                  </div>
                  <div className="text-2xs text-slate-500">
                    Stamina / Natural Fitness
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 flex items-center justify-center min-w-0">
                  <RolePercentilePizzaChart
                    player={player}
                    squadPlayers={squadPlayers}
                    ipRoleName={effectiveIpRole}
                    oopRoleName={effectiveOopRole}
                    highlightedPrimaryKeys={highlightedKeys.keySet}
                  />
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 flex flex-col items-center justify-center space-y-2 min-w-0">
                  <div className="w-full flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold text-slate-200">
                      6-Axis Comparison Radar
                    </div>
                    {compareCandidates.length > 0 && (
                      <select
                        value={comparePlayerId}
                        onChange={(e) => setComparePlayerId(e.target.value)}
                        aria-label="Compare with teammate"
                        className="w-full sm:w-auto sm:max-w-[210px] min-h-[44px] sm:min-h-[34px] rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-micro text-slate-200"
                      >
                        {analysis.squadDepth?.bestTeammate && (
                          <option value="__AUTO__">
                            vs {analysis.squadDepth.bestTeammate.name} (Best {analysis.squadDepth.positionLabel.split(' ')[0]})
                          </option>
                        )}
                        <option value="__NONE__">No comparison</option>
                        {compareCandidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            vs {c.name} ({c.position})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <AttributeRadarChart
                    player={player}
                    comparePlayer={resolvedComparePlayer}
                  />
                </div>
              </div>
              <PlayerProgressionSparkline
                points={buildPlayerProgressionSeries(player.uid, loadProgressionArchive())}
                playerName={player.name}
              />
            </div>
          )}

          {/* TAB 5: STATS & CONTRACT */}
          {activeTab === 'contract' && (
            <div className="space-y-4">
              {analysis.seasonProduction.mode === 'fast_sync_missing' && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                  <strong>Fast Sync mode active:</strong> Player goals, assists, xG and
                  match ratings were skipped for speed. Uncheck <strong>Fast Sync</strong>{' '}
                  and re-import your <span className="font-mono">.fm</span> save in the{' '}
                  <strong>Hub</strong> tab to populate all player match stats.
                </div>
              )}
              {analysis.seasonProduction.mode === 'preseason_no_matches' && (
                <div className="rounded-xl border border-sky-500/35 bg-sky-950/25 px-4 py-3 text-xs text-sky-200">
                  <strong>Pre-season snapshot (0 competitive matches played):</strong>{' '}
                  Season stats will populate automatically after your first competitive
                  match in this save.
                </div>
              )}
              {analysis.seasonProduction.mode === 'stats_unavailable' && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                  <strong>Season match stats unavailable in this snapshot:</strong>{' '}
                  Full Sync ran, but per-player season stats were not populated (partial
                  checkpoint recovery or table timeout). Re-import in the{' '}
                  <strong>Hub</strong> tab or check Save Reader Info in Club KPIs.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className="font-bold uppercase tracking-wider text-slate-400">
                      Season Production
                    </h4>
                    {analysis.seasonProduction.hasPlayed && player.statsSource && (
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-2xs text-slate-300">
                        {player.statsSource}
                      </span>
                    )}
                  </div>

                  {!analysis.seasonProduction.hasPlayed ? (
                    <p className="text-xs text-slate-400 py-3">
                      {analysis.seasonProduction.mode === 'fast_sync_missing'
                        ? 'Awaiting Full Sync to populate appearances, goals, assists and ratings.'
                        : analysis.seasonProduction.mode === 'stats_unavailable'
                          ? 'Season stats were not populated for this snapshot.'
                          : 'No competitive appearances recorded yet this season.'}
                    </p>
                  ) : (
                    <>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-slate-400">Apps / Minutes:</span>
                        <span className="font-mono text-slate-200 text-right shrink-0 tabular-nums">
                          {player.apps} ({player.minutes}m)
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-slate-400">Avg Rating:</span>
                        <span className="font-mono text-emerald-300 font-semibold text-right shrink-0 tabular-nums">
                          {player.rating !== null && player.rating > 0
                            ? player.rating.toFixed(2)
                            : '—'}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-slate-400">Goals (xG / 90):</span>
                        <span className="font-mono text-slate-200 text-right shrink-0 tabular-nums">
                          {player.goals} ({player.xG.toFixed(2)} · {player.xGPer90.toFixed(2)}/90)
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-slate-400">Assists (xA / 90):</span>
                        <span className="font-mono text-slate-200 text-right shrink-0 tabular-nums">
                          {player.assists} ({player.xA.toFixed(2)} · {player.xAPer90.toFixed(2)}/90)
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-slate-400">Drb / Prog.P / Int (/90):</span>
                        <span className="font-mono text-slate-200 text-right shrink-0 tabular-nums">
                          {player.drbPer90 > 0 ? player.drbPer90.toFixed(2) : '—'} /{' '}
                          {player.prPassesPer90 > 0 ? player.prPassesPer90.toFixed(2) : '—'} /{' '}
                          {player.intPer90 > 0 ? player.intPer90.toFixed(2) : '—'}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-slate-400">Tackling / Aerial %:</span>
                        <span className="font-mono text-slate-200 text-right shrink-0 tabular-nums">
                          {player.tckPct > 0 ? `${player.tckPct}%` : '—'} /{' '}
                          {player.hdrPct > 0 ? `${player.hdrPct}%` : '—'}
                        </span>
                      </div>
                      {(analysis.seasonProduction.finishingNote ||
                        analysis.seasonProduction.creationNote) && (
                        <div className="pt-2 border-t border-slate-800 space-y-1 text-micro text-emerald-300">
                          {analysis.seasonProduction.finishingNote && (
                            <div>• {analysis.seasonProduction.finishingNote}</div>
                          )}
                          {analysis.seasonProduction.creationNote && (
                            <div>• {analysis.seasonProduction.creationNote}</div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-xs">
                  <h4 className="font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Contract &amp; Squad Standing
                  </h4>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-slate-400">Hub Squad Role:</span>
                    <span className="font-semibold text-slate-200 text-right">{player.status}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-slate-400">Contract Promise:</span>
                    <span className="font-semibold text-indigo-300 text-right">
                      {analysis.contractStanding.promisedPlayingTime || 'Not recorded'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-slate-400">Weekly / Annual:</span>
                    <span className="font-mono text-slate-200 text-right tabular-nums">
                      {formatWeeklyWage(player.wagePw)} (
                      {Number.isFinite(analysis.contractStanding.annualWage)
                        ? `£${analysis.contractStanding.annualWage.toLocaleString()}/yr`
                        : '--'})
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-slate-400">Contract Expires:</span>
                    <span className="font-mono text-amber-300 text-right tabular-nums">
                      {formatContractExpiry(player.expires)}
                      {analysis.contractStanding.monthsRemaining !== null
                        ? ` (${analysis.contractStanding.monthsRemaining}m left)`
                        : ''}
                    </span>
                  </div>
                  {typeof player.marketValue === 'number' && player.marketValue >= 0 && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-slate-400">Market Value:</span>
                      <span className="font-mono text-emerald-300 text-right tabular-nums">
                        {player.marketValueCapped || player.marketValueState === 'capped'
                          ? 'Not for sale (£300m cap)'
                          : player.marketValue > 0
                            ? formatDynamicCurrency(player.marketValue, 'marketValue')
                            : '£0'}
                      </span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-slate-400">Ability / Potential:</span>
                    <span
                      className="font-mono text-amber-300 text-right tabular-nums"
                      title={
                        player.potentialUncertain
                          ? 'Potential is stored as a dynamic youth range in this FM27 save rather than a fixed ceiling.'
                          : undefined
                      }
                    >
                      {player.ability.toFixed(1)}★ / {player.potential.toFixed(1)}★
                      {player.potentialUncertain ? ' (Ranged)' : ''}
                    </span>
                  </div>
                  {analysis.contractStanding.promiseMismatch && (
                    <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-micro text-amber-200">
                      {analysis.contractStanding.promiseMismatch}
                    </div>
                  )}
                </div>
              </div>

              {/* Contract Clauses, Match Bonuses & Promised Playing Time */}
              {(() => {
                const partitioned = partitionContractClausesAndBonuses(
                  player.contractDetails
                );
                const contractNotes = getPlaybookContractNotes(player);
                const hasAnyBonus = Boolean(
                  partitioned.bonuses.appearanceFee ||
                    partitioned.bonuses.goalBonus ||
                    partitioned.bonuses.cleanSheetBonus ||
                    partitioned.bonuses.unusedSubFee ||
                    typeof partitioned.loanWageContributionPct === 'number'
                );

                return (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-bold uppercase tracking-wider text-slate-400">
                        Contract Clauses &amp; Match Bonuses
                      </h4>
                      {player.contractDetails?.promisedPlayingTime && (
                        <span className="rounded-md bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 text-micro font-semibold text-indigo-300">
                          Promised: {player.contractDetails.promisedPlayingTime}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
                        <div className="text-2xs uppercase text-slate-400">
                          Optional Club Extension
                        </div>
                        <div className="mt-0.5 font-mono font-semibold text-slate-100">
                          {player.contractDetails?.optionalExtensionYears
                            ? `+${player.contractDetails.optionalExtensionYears} year${player.contractDetails.optionalExtensionYears === 1 ? '' : 's'} (Club Option)`
                            : 'None recorded'}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
                        <div className="text-2xs uppercase text-slate-400">
                          Release Clauses
                        </div>
                        {partitioned.releaseClauses.length > 0 ? (
                          <div className="mt-0.5 space-y-0.5">
                            {partitioned.releaseClauses.map((rc, idx) => (
                              <div key={`${rc.type}-${idx}`} className="font-mono text-amber-300">
                                {rc.type}: £{rc.amount.toLocaleString()}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-0.5 text-slate-400">No release clauses</div>
                        )}
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
                        <div className="text-2xs uppercase text-slate-400">
                          Match Bonuses
                        </div>
                        <div className="mt-0.5 space-y-0.5 font-mono text-slate-200">
                          {partitioned.bonuses.appearanceFee ? (
                            <div>
                              Appearance Fee: £{partitioned.bonuses.appearanceFee.toLocaleString()}
                            </div>
                          ) : null}
                          {partitioned.bonuses.goalBonus ? (
                            <div>
                              Goal Bonus: £{partitioned.bonuses.goalBonus.toLocaleString()}
                            </div>
                          ) : null}
                          {partitioned.bonuses.cleanSheetBonus ? (
                            <div>
                              Clean Sheet Bonus: £{partitioned.bonuses.cleanSheetBonus.toLocaleString()}
                            </div>
                          ) : null}
                          {partitioned.bonuses.unusedSubFee ? (
                            <div className="text-amber-300">
                              Unused Sub Fee: £{partitioned.bonuses.unusedSubFee.toLocaleString()}
                            </div>
                          ) : null}
                          {typeof partitioned.loanWageContributionPct === 'number' ? (
                            <div className="text-sky-300">
                              Loan Wage Split: {partitioned.loanWageContributionPct}%
                            </div>
                          ) : null}
                          {!hasAnyBonus && (
                            <span className="font-sans text-slate-400">Standard terms</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {contractNotes.length > 0 && (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1 text-amber-200">
                        <div className="text-2xs font-bold uppercase tracking-wider text-amber-300">
                          Playbook v2.0 Contract Notes
                        </div>
                        <ul className="list-disc pl-4 space-y-0.5 text-micro">
                          {contractNotes.map((note, idx) => (
                            <li key={idx}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Career Season History */}
              {seasonHistory.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 sm:p-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Career Season History ({seasonHistory.length} Seasons)
                  </h4>
                  {/* Mobile cards (< sm) — zero horizontal scrolling at 360px */}
                  <div className="space-y-1.5 sm:hidden">
                    {seasonHistory.map((h, i) => (
                      <div
                        key={`m-${h.season}-${h.club}-${i}`}
                        className="rounded-lg border border-slate-800/80 bg-slate-900/70 px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-mono font-semibold text-white">
                            {h.season}{' '}
                            <span className="font-sans font-normal text-slate-300">
                              · {h.club}
                            </span>
                          </div>
                          <div className="text-micro font-mono text-slate-400 tabular-nums">
                            {h.apps} apps · {h.goals}G · {h.assists}A
                          </div>
                        </div>
                        <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono font-bold text-emerald-300 tabular-nums shrink-0">
                          {h.avgRating.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* Desktop table (sm:+) */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-xs text-left text-slate-300">
                      <thead className="bg-slate-900/95 text-2xs uppercase text-slate-400">
                        <tr>
                          <th className="px-2.5 py-2">Season</th>
                          <th className="px-2.5 py-2">Club</th>
                          <th className="px-2.5 py-2">Apps</th>
                          <th className="px-2.5 py-2">Goals</th>
                          <th className="px-2.5 py-2">Assists</th>
                          <th className="px-2.5 py-2">Avg Rating</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {seasonHistory.map((h, i) => (
                          <tr key={`${h.season}-${h.club}-${i}`}>
                            <td className="px-2.5 py-1.5 font-mono font-medium text-white">
                              {h.season}
                            </td>
                            <td className="px-2.5 py-1.5">{h.club}</td>
                            <td className="px-2.5 py-1.5 font-mono">{h.apps}</td>
                            <td className="px-2.5 py-1.5 font-mono">{h.goals}</td>
                            <td className="px-2.5 py-1.5 font-mono">{h.assists}</td>
                            <td className="px-2.5 py-1.5 font-mono font-semibold text-emerald-300">
                              {h.avgRating.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
    </MobileSheetFrame>
  );
};
