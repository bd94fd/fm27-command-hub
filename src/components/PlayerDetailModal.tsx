import React, { useMemo, useState } from 'react';
import {
  BookmarkPlus,
  ClipboardPlus,
  Download,
  Shield,
  Sparkles,
  User,
  X,
  Zap,
} from 'lucide-react';
import { PlayerRecord, ShortlistRecord } from '../types/fm27';
import { computeFm27EngineMetrics } from '../utils/fmSyncEngine';
import {
  FM27_ROLES,
  FM27_ROLE_ATTR_MAP,
  getNaturalRolesForPlayer,
  resolveNaturalDefaultRoles,
  scorePlayerForFm27Role,
} from '../utils/fm27RoleMatcher';
import {
  evaluatePlaybookArchetype,
  getPlaybookContractNotes,
  partitionContractClausesAndBonuses,
} from '../utils/recruitmentHelpers';
import {
  AttributeRadarChart,
  RolePercentilePizzaChart,
} from './FootballAnalyticsCharts';

interface PlayerDetailModalProps {
  player: PlayerRecord | null;
  shortlists: ShortlistRecord[];
  isManagedClubPlayer?: boolean;
  isTracked?: boolean;
  onClose: () => void;
  onAddRecruitment: (player: PlayerRecord) => void;
  onToggleTrack?: (player: PlayerRecord) => void;
  onAddToShortlist: (shortlistId: string, playerId: string) => void;
}

type DetailTab = 'attributes' | 'positions' | 'metrics' | 'contract';

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

function attrColorClass(val: number): string {
  if (val >= 16) return 'text-emerald-300 font-bold';
  if (val >= 13) return 'text-lime-300 font-semibold';
  if (val >= 10) return 'text-amber-200';
  return 'text-slate-400';
}

function pitchBadgeClass(rating: number): string {
  if (rating >= 18) return 'border-emerald-400 bg-emerald-500/20 text-emerald-200';
  if (rating >= 15) return 'border-lime-400/70 bg-lime-500/15 text-lime-200';
  if (rating >= 12) return 'border-amber-400/60 bg-amber-500/15 text-amber-200';
  if (rating >= 9) return 'border-orange-400/50 bg-orange-500/10 text-orange-200';
  return 'border-slate-700 bg-slate-900/70 text-slate-500';
}

function normalizeAttrKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({
  player,
  shortlists,
  isManagedClubPlayer = false,
  isTracked = false,
  onClose,
  onAddRecruitment,
  onToggleTrack,
  onAddToShortlist,
}) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('attributes');
  const [selectedIpRole, setSelectedIpRole] = useState<string>('');
  const [selectedOopRole, setSelectedOopRole] = useState<string>('');
  const [selectedShortlistId, setSelectedShortlistId] = useState<string>('');
  const [shortlistFeedback, setShortlistFeedback] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const naturalDefaults = useMemo(
    () =>
      player
        ? resolveNaturalDefaultRoles(player)
        : { ipRole: '', oopRole: '' },
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

  const playbookArchetype = useMemo(
    () =>
      player ? evaluatePlaybookArchetype(player.position, player.attributes) : null,
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
    const matchRole = (name: string) =>
      FM27_ROLES.find(
        (r) =>
          r.name.toLowerCase() === name.toLowerCase() ||
          name.toLowerCase().includes(r.name.toLowerCase())
      );

    for (const roleName of [effectiveIpRole, effectiveOopRole]) {
      if (!roleName) continue;
      const found = matchRole(roleName);
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

  if (!player) return null;

  const engineMetrics = computeFm27EngineMetrics(player);
  const a = player.attributes;

  const technicalAttrs: Array<{ label: string; value: number }> = [
    { label: 'Corners', value: a.corners ?? 10 },
    { label: 'Crossing', value: a.crossing ?? 10 },
    { label: 'Dribbling', value: a.dribbling ?? 10 },
    { label: 'Finishing', value: a.finishing },
    { label: 'First Touch', value: a.firstTouch },
    { label: 'Free Kicks', value: a.freeKicks ?? 10 },
    { label: 'Heading', value: a.heading ?? 10 },
    { label: 'Long Shots', value: a.longShots ?? 10 },
    { label: 'Long Throws', value: a.longThrows ?? 10 },
    { label: 'Marking', value: a.marking ?? 10 },
    { label: 'Passing', value: a.passing },
    { label: 'Penalties', value: a.penalties ?? 10 },
    { label: 'Tackling', value: a.tackling },
    { label: 'Technique', value: a.technique ?? 10 },
  ];

  const mentalAttrs: Array<{ label: string; value: number }> = [
    { label: 'Aggression', value: a.aggression ?? 10 },
    { label: 'Anticipation', value: a.anticipation ?? 10 },
    { label: 'Bravery', value: a.bravery ?? 10 },
    { label: 'Composure', value: a.composure ?? 10 },
    { label: 'Concentration', value: a.concentration ?? 10 },
    { label: 'Decisions', value: a.decisions },
    { label: 'Determination', value: a.determination },
    { label: 'Flair', value: a.flair ?? 10 },
    { label: 'Leadership', value: a.leadership ?? 10 },
    { label: 'Off The Ball', value: a.offTheBall },
    { label: 'Positioning', value: a.positioning ?? 10 },
    { label: 'Teamwork', value: a.teamwork ?? 10 },
    { label: 'Vision', value: a.vision ?? 10 },
    { label: 'Work Rate', value: a.workRate },
  ];

  const physicalAttrs: Array<{ label: string; value: number }> = [
    { label: 'Acceleration', value: a.acceleration },
    { label: 'Agility', value: a.agility ?? 10 },
    { label: 'Balance', value: a.balance ?? 10 },
    { label: 'Jumping Reach', value: a.jumpingReach },
    { label: 'Natural Fitness', value: a.naturalFitness ?? 10 },
    { label: 'Pace', value: a.pace },
    { label: 'Stamina', value: a.stamina },
    { label: 'Strength', value: a.strength ?? 10 },
  ];

  const isGoalkeeper =
    player.position.toUpperCase().includes('GK') ||
    (typeof a.reflexes === 'number' && a.reflexes >= 8) ||
    (typeof a.handling === 'number' && a.handling >= 8);

  const gkAttrs: Array<{ label: string; value: number }> = [
    { label: 'Aerial Reach', value: a.aerialReach ?? 1 },
    { label: 'Command of Area', value: a.commandOfArea ?? 1 },
    { label: 'Communication', value: a.communication ?? 1 },
    { label: 'Eccentricity', value: a.eccentricity ?? 1 },
    { label: 'Handling', value: a.handling ?? 1 },
    { label: 'Kicking', value: a.kicking ?? 1 },
    { label: 'One on Ones', value: a.oneOnOnes ?? 1 },
    { label: 'Punching', value: a.punching ?? 1 },
    { label: 'Reflexes', value: a.reflexes ?? 1 },
    { label: 'Rushing Out', value: a.rushingOut ?? 1 },
    { label: 'Throwing', value: a.throwing ?? 1 },
  ];

  const scoutBadges = player.scoutBadges || [];
  const traits = player.traits || [];
  const formTrend = player.last5Form;
  const seasonHistory = player.seasonHistory || [];

  const getPositionScore = (code: string): number => {
    if (player.positionRatings && typeof player.positionRatings[code] === 'number') {
      return player.positionRatings[code];
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

  const renderAttrRow = (item: { label: string; value: number }) => {
    const norm = normalizeAttrKey(item.label);
    const isKey = highlightedKeys.keySet.has(norm);
    const isPref = !isKey && highlightedKeys.prefSet.has(norm);
    return (
      <div
        key={item.label}
        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs border ${
          isKey
            ? 'bg-emerald-500/15 border-emerald-500/40'
            : isPref
              ? 'bg-sky-500/10 border-sky-500/30'
              : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <span className="text-slate-300 flex items-center gap-1.5">
          {isKey && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Key role attribute" />
          )}
          {isPref && (
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" title="Preferable role attribute" />
          )}
          {item.label}
        </span>
        <span className={`font-mono ${attrColorClass(item.value)}`}>{item.value}</span>
      </div>
    );
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
    canvas.height = 460;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background gradient (dark slate / emerald border)
    const bg = ctx.createLinearGradient(0, 0, 760, 460);
    bg.addColorStop(0, '#020617');
    bg.addColorStop(0.55, '#0f172a');
    bg.addColorStop(1, '#022c22');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 760, 460);

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 744, 444);

    // Top Accent Bar
    ctx.fillStyle = '#10b981';
    ctx.fillRect(28, 28, 704, 4);

    // Header: Name, Number, Position & Stars (Strictly Zero Raw CA/PA)
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(
      `FM27 COMMAND HUB · PATCH 27.1.0 DUAL-PHASE PLAYER CARD`,
      28,
      54
    );

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(`#${player.number} ${player.name}`, 28, 92);

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
      `Age ${player.age} · ${player.nation} · ${player.preferredFoot || 'Right'} Foot · ${player.personality} · £${player.wagePw.toLocaleString()}/wk (exp ${player.expires})`,
      28,
      144
    );

    // Dual-Phase IP/OOP Role Fit & Physical Engine Panel
    const ipRoleObj = FM27_ROLES.find((r) => r.name === effectiveIpRole);
    const oopRoleObj = FM27_ROLES.find((r) => r.name === effectiveOopRole);
    const ipFitScore = ipRoleObj ? scorePlayerForFm27Role(player, ipRoleObj) : 75;
    const oopFitScore = oopRoleObj ? scorePlayerForFm27Role(player, oopRoleObj) : 75;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(28, 162, 704, 68);
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(28, 162, 704, 68);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(
      `IN POSSESSION (IP): ${effectiveIpRole || player.ipRole} (${ipFitScore}% Fit)`,
      44,
      188
    );

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(
      `OUT OF POSSESSION (OOP): ${effectiveOopRole || player.oopRole} (${oopFitScore}% Fit)`,
      44,
      214
    );

    ctx.fillStyle = '#a7f3d0';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(
      `Engine ${engineMetrics.physicalEngineScore}/100 · ${engineMetrics.topSpeedMps} m/s · +${engineMetrics.jumpHeightMeters}m Jump`,
      430,
      188
    );

    if (playbookArchetype) {
      ctx.fillStyle = '#bae6fd';
      ctx.font = '12px monospace';
      ctx.fillText(
        `Archetype: ${playbookArchetype.name} (${playbookArchetype.score}%)`,
        430,
        214
      );
    }

    // 12 Key Attributes Grid (3 Columns x 4 Rows)
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
      const y = 246 + row * (rowHeight + 6);

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

    // Footer: Qualitative Scout Badges & Traits (Zero Raw CA/PA)
    const badgeLine =
      scoutBadges.length > 0
        ? `Scout Badges: ${scoutBadges.join(' · ')}`
        : 'Scout Badges: Verified 1–20 Display Scale (Zero Raw CA/PA)';
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(badgeLine.slice(0, 88), 28, 428);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
              #{player.number}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-white">{player.name}</h2>
                <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-mono text-emerald-300">
                  {player.position}
                </span>
                <span className="rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-xs font-semibold text-amber-300">
                  {player.ability.toFixed(1)}★ / {player.potential.toFixed(1)}★ Pot
                </span>
                {playbookArchetype && (
                  <span className="rounded-md bg-sky-500/15 border border-sky-500/35 px-2 py-0.5 text-xs font-semibold text-sky-300">
                    {playbookArchetype.name} · {playbookArchetype.score}%
                  </span>
                )}
                {player.activeSuspensions && player.activeSuspensions.length > 0 && (
                  <span className="rounded-md bg-rose-500/20 border border-rose-500/50 px-2 py-0.5 text-xs font-bold uppercase text-rose-300">
                    BANNED ({player.activeSuspensions[0].matchesRemaining}m)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Age {player.age} · {player.preferredFoot || 'Right'} Foot
                {player.heightCm ? ` · ${player.heightCm} cm` : ''} · {player.personality} ·{' '}
                £{player.wagePw.toLocaleString()}/wk (exp {player.expires})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportPlayerCardPng}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/35 bg-sky-500/15 hover:bg-sky-500/25 px-3 py-1.5 text-xs font-semibold text-sky-300 transition cursor-pointer"
              title="Export 1-Click Shareable FM27 Player Card (PNG)"
            >
              <Download className="h-3.5 w-3.5" />
              {exportFeedback || 'Export Card PNG'}
            </button>
            {!isManagedClubPlayer && (
              <button
                type="button"
                onClick={() =>
                  onToggleTrack ? onToggleTrack(player) : onAddRecruitment(player)
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  isTracked
                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/50 text-emerald-300'
                    : 'bg-indigo-500/15 hover:bg-indigo-500/25 border-indigo-500/30 text-indigo-300'
                }`}
              >
                <ClipboardPlus className="h-3.5 w-3.5" />
                {isTracked ? '✓ Tracked' : '+ Track'}
              </button>
            )}
            {shortlists.length > 0 && (
              <div className="flex items-center gap-1">
                <select
                  value={selectedShortlistId || shortlists[0]?.id || ''}
                  onChange={(e) => setSelectedShortlistId(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
                >
                  {shortlists.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleShortlistAdd}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  {shortlistFeedback || 'Shortlist'}
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
              aria-label="Close player modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-800 bg-slate-950/40 px-5 pt-2">
          {(
            [
              { id: 'attributes', label: 'Attributes & IP/OOP Role Fit', icon: Sparkles },
              { id: 'positions', label: 'Pitch Familiarity', icon: Shield },
              { id: 'metrics', label: 'FM27 Engine Metrics', icon: Zap },
              { id: 'contract', label: 'Season Output & Contract', icon: User },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition ${
                  activeTab === t.id
                    ? 'border-emerald-400 text-emerald-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {player.activeSuspensions && player.activeSuspensions.length > 0 && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 space-y-1">
              <div className="font-bold uppercase tracking-wider text-rose-300">
                Active Disciplinary Suspension — Do Not Select as Starter
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
          )}

          {activeTab === 'attributes' && (
            <>
              {/* Pass 0: Scout Report Badges, Last 5 Form & Readable Player Traits */}
              {(scoutBadges.length > 0 ||
                traits.length > 0 ||
                (formTrend && formTrend.recentRatings.length > 0)) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Scout Report Badges
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {scoutBadges.length > 0 ? (
                        scoutBadges.map((badge) => (
                          <span
                            key={badge}
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                              badge === 'Injury-Prone'
                                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                            }`}
                          >
                            {badge}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">
                          No flagged scout traits
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Last 5 Match Form
                    </div>
                    {formTrend && formTrend.recentRatings.length > 0 ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold font-mono text-white">
                            {formTrend.averageRating.toFixed(2)}
                          </span>
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                              formTrend.trend === 'improving'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : formTrend.trend === 'declining'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {formTrend.trend}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {formTrend.recentRatings.map((r, i) => (
                            <span
                              key={i}
                              className="rounded bg-slate-900 border border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-300"
                            >
                              {r.toFixed(1)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500 italic">
                        Awaiting match ratings
                      </span>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Player Traits
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {traits.length > 0 ? (
                        traits.map((t, idx) => (
                          <span
                            key={`${t}-${idx}`}
                            className="rounded bg-slate-800/90 border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200"
                          >
                            {t}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">
                          No player traits recorded
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* IP / OOP role highlight selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">
                    In-Possession (IP) Role Highlight
                  </label>
                  <select
                    value={effectiveIpRole}
                    onChange={(e) => setSelectedIpRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <option value={naturalDefaults.ipRole}>
                      {naturalDefaults.ipRole} (Assigned)
                    </option>
                    {scopedIpRoles
                      .filter((r) => r.name !== naturalDefaults.ipRole)
                      .map((r) => (
                        <option key={`ip-${r.name}`} value={r.name}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-sky-400 mb-1">
                    Out-of-Possession (OOP) Role Highlight
                  </label>
                  <select
                    value={effectiveOopRole}
                    onChange={(e) => setSelectedOopRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <option value={naturalDefaults.oopRole}>
                      {naturalDefaults.oopRole} (Assigned)
                    </option>
                    {scopedOopRoles
                      .filter((r) => r.name !== naturalDefaults.oopRole)
                      .map((r) => (
                        <option key={`oop-${r.name}`} value={r.name}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    {isGoalkeeper ? 'Goalkeeping (11)' : 'Technical (14)'}
                  </h4>
                  {(isGoalkeeper ? gkAttrs : technicalAttrs).map(renderAttrRow)}
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Mental (14)
                  </h4>
                  {mentalAttrs.map(renderAttrRow)}
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Physical (8)
                  </h4>
                  {physicalAttrs.map(renderAttrRow)}
                  <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>Key role attribute</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-sky-400" />
                      <span>Preferable role attribute</span>
                    </div>
                  </div>
                </div>
              </div>

              {isGoalkeeper && (
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Technical Outfield Attributes (14)
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {technicalAttrs.map(renderAttrRow)}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'positions' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="rounded-xl border border-emerald-900/50 bg-gradient-to-b from-emerald-950/40 to-slate-950 p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300 text-center">
                  FM27 Positional Familiarity Map
                </h4>
                <div className="space-y-2.5">
                  {PITCH_ROWS.map((row, rIdx) => (
                    <div key={rIdx} className="flex items-center justify-center gap-3">
                      {row.map((pos) => {
                        const score = getPositionScore(pos.code);
                        return (
                          <div
                            key={pos.code}
                            className={`w-16 rounded-lg border px-2 py-1.5 text-center ${pitchBadgeClass(
                              score
                            )}`}
                          >
                            <div className="text-[11px] font-bold">{pos.label}</div>
                            <div className="text-[10px] font-mono opacity-80">{score}/20</div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Assigned Dual-Phase Roles
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">In-Possession (IP):</span>
                      <span className="font-semibold text-emerald-300">
                        {naturalDefaults.ipRole}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Out-of-Possession (OOP):</span>
                      <span className="font-semibold text-sky-300">
                        {naturalDefaults.oopRole}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Preferred Foot:</span>
                      <span className="font-semibold text-slate-200">
                        {player.preferredFoot || 'Right'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Scout & Tactical Notes
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {player.notes || 'Synced directly from FM27 save.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">
                    FM27 Engine Score
                  </div>
                  <div className="mt-1 text-2xl font-bold text-emerald-400 font-mono">
                    {engineMetrics.physicalEngineScore}/100
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Custom physical + engine rating
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">
                    Top Sprint Speed
                  </div>
                  <div className="mt-1 text-2xl font-bold text-sky-300 font-mono">
                    {engineMetrics.topSpeedMps} m/s
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Pace {a.pace} · Acc {a.acceleration}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">
                    Aerial Reach
                  </div>
                  <div className="mt-1 text-2xl font-bold text-amber-300 font-mono">
                    +{engineMetrics.jumpHeightMeters} m
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    JR {a.jumpingReach} · Heading {a.heading ?? 10}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">
                    Condition / Sharpness
                  </div>
                  <div className="mt-1 text-2xl font-bold text-slate-100 font-mono">
                    {player.condition ?? '--'}% / {player.sharpness ?? '--'}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Stamina {a.stamina}/20
                  </div>
                </div>
              </div>

              {/* Phase 1 (v3.0): Role & Positional Percentile Pizza Chart + 6-Axis Radar */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 flex items-center justify-center">
                  <RolePercentilePizzaChart
                    player={player}
                    ipRoleName={effectiveIpRole}
                    oopRoleName={effectiveOopRole}
                    highlightedPrimaryKeys={highlightedKeys.keySet}
                  />
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 flex flex-col items-center justify-center">
                  <div className="text-xs font-bold text-slate-200 mb-1">
                    6-Axis Core Profile Radar
                  </div>
                  <AttributeRadarChart player={player} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'contract' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-xs">
                  <h4 className="font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Season Production
                  </h4>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Apps / Minutes:</span>
                    <span className="font-mono text-slate-200">
                      {player.apps} ({player.minutes}m)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Avg Rating:</span>
                    <span className="font-mono text-emerald-300">
                      {player.rating !== null ? player.rating.toFixed(2) : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Goals (xG / per 90):</span>
                    <span className="font-mono text-slate-200">
                      {player.goals} ({player.xG.toFixed(2)} xG · {player.xGPer90.toFixed(2)}/90)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Assists (xA / per 90):</span>
                    <span className="font-mono text-slate-200">
                      {player.assists} ({player.xA.toFixed(2)} xA · {player.xAPer90.toFixed(2)}/90)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tackling / Aerial Win %:</span>
                    <span className="font-mono text-slate-200">
                      {player.tckPct}% / {player.hdrPct}%
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-xs">
                  <h4 className="font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Contract &amp; Squad Standing
                  </h4>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Squad Status:</span>
                    <span className="font-semibold text-slate-200">{player.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Weekly Wage:</span>
                    <span className="font-mono text-slate-200">
                      £{player.wagePw.toLocaleString()}/wk
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Contract Expires:</span>
                    <span className="font-mono text-amber-300">{player.expires}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Relative Ability / Potential:</span>
                    <span className="font-mono text-amber-300">
                      {player.ability.toFixed(1)}★ / {player.potential.toFixed(1)}★
                    </span>
                  </div>
                </div>
              </div>

              {/* Pass 1 Tier-1: Contract Clauses, Match Bonuses & Promised Playing Time */}
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
                        Contract Clauses, Match Bonuses &amp; Promised Playing Time
                      </h4>
                      <span className="rounded bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 text-[11px] font-semibold text-indigo-300">
                        {player.contractDetails?.promisedPlayingTime || player.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <div className="text-[10px] uppercase text-slate-400">
                          Optional Club Extension
                        </div>
                        <div className="mt-0.5 font-mono font-semibold text-slate-100">
                          {player.contractDetails?.optionalExtensionYears
                            ? `+${player.contractDetails.optionalExtensionYears} year${player.contractDetails.optionalExtensionYears === 1 ? '' : 's'} (Club Option)`
                            : 'None recorded'}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <div className="text-[10px] uppercase text-slate-400">
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
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <div className="text-[10px] uppercase text-slate-400">
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
                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                          Playbook v2.0 Contract Notes
                        </div>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                          {contractNotes.map((note, idx) => (
                            <li key={idx}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Pass 0 Group 2: Career Season History */}
              {seasonHistory.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Career Season History ({seasonHistory.length} Seasons)
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left text-slate-300">
                      <thead className="bg-slate-900/90 text-[10px] uppercase text-slate-400">
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
        </div>
      </div>
    </div>
  );
};
