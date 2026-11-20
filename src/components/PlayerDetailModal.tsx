import { Activity, BookmarkPlus, ClipboardPlus, Gauge, User, X } from 'lucide-react';
import { useState } from 'react';
import { formatMoney, formatWage, wagePeriodSuffix } from '../domain/filters';
import { computeFm27EngineMetrics } from '../domain/fmEngine';
import {
  attributeScoreColorClass,
  getPlayerAttributeCategories,
  getRoleFitScore,
  getRolePriorities,
  IN_POSSESSION_ROLES,
  OUT_OF_POSSESSION_ROLES,
  PITCH_POSITION_ROWS,
  positionFamiliarityLabel,
} from '../domain/playerCatalog';
import type { AppSettings, PlayerRecord, PositionCode, ShortlistRecord } from '../domain/types';

interface PlayerDetailModalProps {
  player: PlayerRecord | null;
  settings: AppSettings;
  shortlists: ShortlistRecord[];
  onClose: () => void;
  onAddRecruitment: (player: PlayerRecord) => void;
  onAddToShortlist: (shortlistId: string, playerId: number) => void;
}

type DetailTab = 'info' | 'attributes' | 'positions' | 'contracts';

function pitchBadgeColor(rating: number): string {
  if (rating >= 18) return 'border-[#33e27a] bg-[#164b2c] text-[#66ff9c]';
  if (rating >= 15) return 'border-[#9ad436] bg-[#2f4518] text-[#d5ff78]';
  if (rating >= 12) return 'border-[#d6b234] bg-[#453a14] text-[#ffe16b]';
  if (rating >= 9) return 'border-[#c47a2f] bg-[#402612] text-[#ffba70]';
  return 'border-[#3b4740] bg-[#18221e]/85 text-[#7f8c85]';
}

export function PlayerDetailModal({
  player,
  settings,
  shortlists,
  onClose,
  onAddRecruitment,
  onAddToShortlist,
}: PlayerDetailModalProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('attributes');
  const [showGoalkeeping, setShowGoalkeeping] = useState<boolean>(
    () => (player ? (player.positions.GK ?? 1) >= 15 : false),
  );
  const [inPossessionRole, setInPossessionRole] = useState<string>('');
  const [outOfPossessionRole, setOutOfPossessionRole] = useState<string>('');
  const [shortlistFeedback, setShortlistFeedback] = useState<string | null>(null);

  if (!player) return null;

  const engine = computeFm27EngineMetrics(player);
  const activePriorities = inPossessionRole
    ? getRolePriorities('In Possession', inPossessionRole)
    : outOfPossessionRole
      ? getRolePriorities('Out of Possession', outOfPossessionRole)
      : {};

  const activeRoleScore = inPossessionRole
    ? getRoleFitScore(player.attributes, 'In Possession', inPossessionRole)
    : outOfPossessionRole
      ? getRoleFitScore(player.attributes, 'Out of Possession', outOfPossessionRole)
      : null;

  const categories = getPlayerAttributeCategories(showGoalkeeping);

  const infoPairs: { label: string; value: string }[] = [
    { label: 'Full Name', value: player.name },
    { label: 'Nationality', value: player.nationality ?? '—' },
    {
      label: 'Date of Birth',
      value: player.dateOfBirth
        ? `${player.dateOfBirth}${player.age !== null ? ` (${player.age})` : ''}`
        : player.age !== null
          ? `Age ${player.age}`
          : '—',
    },
    { label: 'Preferred Foot', value: player.preferredFoot ?? '—' },
    {
      label: 'Height / Weight',
      value: `${player.heightCm !== null ? `${player.heightCm} cm` : '—'} · ${player.weightKg !== null ? `${player.weightKg} kg` : '—'}`,
    },
    { label: 'Position', value: player.positionText || '—' },
    { label: 'Contract Club', value: player.club || 'Free Agent' },
    { label: 'Playing Club', value: player.playingClub || 'Free Agent' },
    { label: 'Competition', value: player.playingCompetition ?? '—' },
    { label: 'Personality', value: player.personality ?? '—' },
    { label: 'Estimated Value', value: formatMoney(player.estimatedValue, settings) },
    { label: 'Asking Price', value: formatMoney(player.askingPrice, settings) },
    {
      label: `Wage (${wagePeriodSuffix(settings)})`,
      value: formatWage(player.wagePw, settings),
    },
    { label: 'Contract Expires', value: player.contractEnd ?? player.expires ?? '—' },
    { label: 'Squad Status', value: player.squadStatus ?? '—' },
    { label: 'Transfer / Loan Listed', value: `${player.transferListed ? 'Yes' : 'No'} / ${player.listedForLoan ? 'Yes' : 'No'}` },
    {
      label: 'Condition / Sharpness',
      value: `${player.condition !== null ? `${player.condition}%` : '—'} / ${player.sharpness !== null ? `${player.sharpness}%` : '—'}`,
    },
    {
      label: 'Reputation (Cur / Home / World)',
      value: `${player.currentReputation ?? '—'} / ${player.homeReputation ?? '—'} / ${player.worldReputation ?? '—'}`,
    },
  ];

  function handleQuickShortlist(shortlistId: string) {
    if (!player || !shortlistId) return;
    onAddToShortlist(shortlistId, player.id);
    const sl = shortlists.find((s) => s.id === shortlistId);
    setShortlistFeedback(`Added to "${sl?.name ?? 'Shortlist'}"`);
    setTimeout(() => setShortlistFeedback(null), 2500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040308]/80 p-3 sm:p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-dialog-title"
    >
      <div className="flex h-[min(860px,calc(100dvh-24px))] w-full max-w-[1140px] flex-col overflow-hidden rounded-[8px] border border-[#d0c6db]/25 bg-[#121116] shadow-[0_24px_64px_rgba(0,0,0,0.65)]">
        {/* Header */}
        <div className="flex min-h-[58px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#39333f] bg-[#202128] px-5 py-2">
          <h2 id="player-dialog-title" className="fm-font-display text-[19px] font-bold text-[#f0edf4]">
            {player.name}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {shortlistFeedback && (
              <span className="rounded bg-[#17372a] px-2.5 py-1 text-[12px] font-semibold text-[#71e7a7]">
                {shortlistFeedback}
              </span>
            )}
            {shortlists.length > 0 && (
              <div className="flex items-center gap-1.5">
                <BookmarkPlus className="h-4 w-4 text-[#dc87ff]" />
                <select
                  aria-label="Add player to shortlist"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleQuickShortlist(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="h-[32px] rounded-[4px] border border-[#59515f] bg-[#121116] px-2.5 text-[12px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
                >
                  <option value="">Add to shortlist…</option>
                  {shortlists.map((sl) => (
                    <option key={sl.id} value={sl.id}>
                      {sl.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                onAddRecruitment(player);
                onClose();
              }}
              className="inline-flex h-[32px] items-center gap-1.5 rounded-[4px] border border-[#59515f] bg-[#2c2534] px-3 text-[12px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] cursor-pointer"
            >
              <ClipboardPlus className="h-3.5 w-3.5 text-[#dc87ff]" />
              <span>Track recruitment</span>
            </button>
          </div>
        </div>

        {/* Hero Banner */}
        <div className="fm-profile-hero flex shrink-0 flex-wrap items-center gap-4 px-6 py-3.5">
          <div className="flex h-[56px] w-[52px] shrink-0 items-center justify-center rounded-[6px] border border-[#ba647a]/40 bg-[#1a0b16]/70 text-[#c28ca3]">
            <User className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="fm-font-display text-[22px] font-bold leading-tight text-white truncate">
              {player.name}
            </h3>
            <p className="mt-1 text-[12px] text-[#d8bdc9] truncate">
              {player.positionText || '—'}
              {player.club && player.playingClub && player.club !== player.playingClub
                ? ` · Loaned to ${player.playingClub}`
                : ''}
              {player.personality ? ` · ${player.personality}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {[
              { label: 'Club', value: player.club || 'Free Agent' },
              { label: 'Age', value: player.age !== null ? String(player.age) : '—' },
              { label: 'CA / PA', value: `${player.ca ?? '—'} / ${player.pa ?? '—'}` },
              {
                label: 'Top Speed',
                value: engine.topSpeedMps !== null ? `${engine.topSpeedMps} m/s` : '—',
              },
              {
                label: 'Jump Height',
                value: engine.jumpHeightMeters !== null ? `+${engine.jumpHeightMeters} m` : '—',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex min-w-[78px] flex-col border-l border-white/15 px-3 py-1"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#b2acbb]">
                  {stat.label}
                </span>
                <span className="mt-0.5 text-[15px] font-bold text-[#ecc2ff] tabular-nums">
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Dialog Tabs */}
        <div
          role="tablist"
          aria-label="Player profile sections"
          className="flex shrink-0 border-b border-[#39333f] bg-[#121116] px-6 overflow-x-auto"
        >
          {(
            [
              { id: 'info', label: 'Info & Season Stats' },
              { id: 'attributes', label: 'Attributes (59)' },
              { id: 'positions', label: 'Positions' },
              { id: 'contracts', label: 'Contracts & Clauses' },
            ] as const
          ).map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={`relative h-[44px] whitespace-nowrap px-4 text-[13px] font-bold transition-colors cursor-pointer ${
                  selected ? 'bg-[#251f2d] text-[#dc87ff]' : 'text-[#b2acbb] hover:text-white'
                }`}
              >
                {tab.label}
                {selected && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#dc87ff]" />}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          {activeTab === 'info' && (
            <div className="flex flex-col gap-5">
              {player.injured && (
                <div className="rounded-[6px] border border-[#ff758b]/40 bg-[#40212b] px-4 py-2.5 text-[13px] text-[#ffb5c1]">
                  <strong>Injured:</strong> {player.injury || 'Active injury'} · Light training in{' '}
                  {player.injuryLightTrainingDays ?? '—'}d · Expected return{' '}
                  {player.injuryExpectedReturn ?? 'TBD'}
                </div>
              )}

              {/* Patch 27.1.0 Physics & Season Stats Strip */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-[6px] border border-[#39333f] bg-[#18151e] p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#b2acbb]">
                    <Gauge className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Patch 27.1.0 Physics</span>
                  </div>
                  <div className="mt-1 font-mono text-[13px] font-bold text-white tabular-nums">
                    {engine.topSpeedMps !== null ? `${engine.topSpeedMps} m/s` : '—'} ·{' '}
                    {engine.jumpHeightMeters !== null ? `+${engine.jumpHeightMeters} m` : '—'}
                  </div>
                  <div className="text-[11px] text-[#9c92a6]">
                    Sprint drain: {engine.sprintDrainRate ?? '—'}
                  </div>
                </div>

                <div className="rounded-[6px] border border-[#39333f] bg-[#18151e] p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#b2acbb]">
                    <Activity className="h-3.5 w-3.5 text-[#dc87ff]" />
                    <span>Apps / Minutes</span>
                  </div>
                  <div className="mt-1 font-mono text-[13px] font-bold text-white tabular-nums">
                    {player.seasonStats?.apps ?? '—'} ({player.seasonStats?.minutes ?? '—'}m)
                  </div>
                  <div className="text-[11px] text-[#9c92a6]">
                    Rating:{' '}
                    {player.seasonStats?.rating != null
                      ? player.seasonStats.rating.toFixed(2)
                      : '—'}
                  </div>
                </div>

                <div className="rounded-[6px] border border-[#39333f] bg-[#18151e] p-3">
                  <div className="text-[10px] font-bold uppercase text-[#b2acbb]">
                    Goals / Assists (xG / xA)
                  </div>
                  <div className="mt-1 font-mono text-[13px] font-bold text-white tabular-nums">
                    {player.seasonStats?.goals ?? '—'}G ({player.seasonStats?.xG?.toFixed(2) ?? '—'}) ·{' '}
                    {player.seasonStats?.assists ?? '—'}A ({player.seasonStats?.xA?.toFixed(2) ?? '—'})
                  </div>
                  <div className="text-[11px] text-[#9c92a6]">
                    xG/90: {player.seasonStats?.xGPer90?.toFixed(2) ?? '—'} · xA/90:{' '}
                    {player.seasonStats?.xAPer90?.toFixed(2) ?? '—'}
                  </div>
                </div>

                <div className="rounded-[6px] border border-[#39333f] bg-[#18151e] p-3">
                  <div className="text-[10px] font-bold uppercase text-[#b2acbb]">
                    Per-90 Progression / Def
                  </div>
                  <div className="mt-1 font-mono text-[13px] font-bold text-white tabular-nums">
                    PrP: {player.seasonStats?.prPassesPer90?.toFixed(2) ?? '—'} · Int:{' '}
                    {player.seasonStats?.intPer90?.toFixed(2) ?? '—'}
                  </div>
                  <div className="text-[11px] text-[#9c92a6]">
                    Hdr%: {player.seasonStats?.hdrPct ?? '—'} · Tck%:{' '}
                    {player.seasonStats?.tckPct ?? '—'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                {infoPairs.map((item, idx) => (
                  <div
                    key={item.label}
                    className={`flex items-baseline justify-between gap-4 border-b border-[#39333f] px-3 py-2.5 ${
                      idx % 2 === 0 ? 'bg-white/[0.025]' : ''
                    }`}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#b2acbb]">
                      {item.label}
                    </span>
                    <span className="text-right text-[13.5px] font-semibold text-[#f0edf4] tabular-nums">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'attributes' && (
            <div className="flex flex-col gap-3">
              {/* Role & GK Toolbar */}
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#39333f] pb-3">
                <label className="inline-flex items-center gap-2.5 text-[13px] font-medium text-[#f0edf4] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showGoalkeeping}
                    onChange={(e) => setShowGoalkeeping(e.target.checked)}
                    className="h-4 w-4 rounded border-[#59515f] bg-[#202128] accent-[#850be3]"
                  />
                  <span>Show goalkeeping attributes</span>
                </label>

                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-semibold text-[#f0edf4]">
                      In possession role (FM27 IP)
                    </span>
                    <div className="flex items-center gap-1">
                      <select
                        aria-label="In possession role"
                        value={inPossessionRole}
                        onChange={(e) => {
                          setInPossessionRole(e.target.value);
                          if (e.target.value) setOutOfPossessionRole('');
                        }}
                        className="h-[36px] min-w-[220px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
                      >
                        <option value="">Select IP role…</option>
                        {IN_POSSESSION_ROLES.map((r) => (
                          <option key={`${r.positionGroup}-${r.name}`} value={r.name}>
                            {r.name} ({r.positionGroup})
                          </option>
                        ))}
                      </select>
                      {inPossessionRole && (
                        <button
                          type="button"
                          onClick={() => setInPossessionRole('')}
                          aria-label="Clear in possession role"
                          className="rounded p-1.5 text-[#b2acbb] hover:bg-white/10 hover:text-white cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-semibold text-[#f0edf4]">
                      Out of possession role (FM27 OOP)
                    </span>
                    <div className="flex items-center gap-1">
                      <select
                        aria-label="Out of possession role"
                        value={outOfPossessionRole}
                        onChange={(e) => {
                          setOutOfPossessionRole(e.target.value);
                          if (e.target.value) setInPossessionRole('');
                        }}
                        className="h-[36px] min-w-[220px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
                      >
                        <option value="">Select OOP role…</option>
                        {OUT_OF_POSSESSION_ROLES.map((r) => (
                          <option key={`${r.positionGroup}-${r.name}`} value={r.name}>
                            {r.name} ({r.positionGroup})
                          </option>
                        ))}
                      </select>
                      {outOfPossessionRole && (
                        <button
                          type="button"
                          onClick={() => setOutOfPossessionRole('')}
                          aria-label="Clear out of possession role"
                          className="rounded p-1.5 text-[#b2acbb] hover:bg-white/10 hover:text-white cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {(inPossessionRole || outOfPossessionRole) && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-[#b2acbb]">
                  <div className="flex items-center gap-5">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-3 w-3 border-l-[3px] border-[#19d88b] bg-[#17372a]" />
                      Key attribute (primary)
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-3 w-3 border-l-[3px] border-[#4493ff] bg-[#1a2941]" />
                      Preferable attribute (secondary)
                    </span>
                  </div>
                  <div className="rounded bg-[#251f2d] px-2.5 py-1 font-mono text-[12px] font-bold text-[#ecc2ff]">
                    Role Fit Score: {activeRoleScore !== null ? `${activeRoleScore} / 20` : '—'}
                  </div>
                </div>
              )}

              {/* 5-Column Attribute Grid */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
                {categories.map((cat, colIdx) => (
                  <div
                    key={cat.name}
                    className={`min-w-0 ${
                      colIdx > 0 ? 'lg:border-l lg:border-[#39333f] lg:pl-3' : ''
                    }`}
                  >
                    <div className="mb-2 border-b border-[#39333f] pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#f0edf4]">
                      {cat.name}
                    </div>
                    <div className="flex flex-col">
                      {cat.attributes.map((attr, idx) => {
                        const val = player.attributes[attr.key];
                        const priority = activePriorities[attr.key];
                        const rowHighlight =
                          priority === 'primary'
                            ? 'fm-attr-primary'
                            : priority === 'secondary'
                              ? 'fm-attr-secondary'
                              : idx % 2 === 0
                                ? 'bg-white/[0.03]'
                                : '';
                        return (
                          <div
                            key={`${cat.name}-${attr.key}`}
                            className={`flex min-h-[26px] items-center justify-between px-2.5 text-[12px] transition-colors hover:bg-[#302337] ${rowHighlight}`}
                          >
                            <span className="truncate text-[#d4ced8]">{attr.label}</span>
                            <span
                              className={`ml-2 font-bold tabular-nums ${attributeScoreColorClass(
                                val,
                              )}`}
                            >
                              {val !== null && val !== undefined ? val : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'positions' && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[340px_1fr]">
              {/* Visual FM Pitch */}
              <div className="relative overflow-hidden rounded-[8px] border border-[#2c593e] bg-gradient-to-b from-[#163a27] via-[#1b4630] to-[#163a27] p-5 shadow-lg">
                <div className="pointer-events-none absolute inset-3 rounded-[4px] border border-white/15" />
                <div className="pointer-events-none absolute inset-x-3 top-1/2 h-px bg-white/15" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />

                <div className="relative z-10 flex flex-col gap-3.5 py-2">
                  {PITCH_POSITION_ROWS.map((row) => (
                    <div key={row.label} className="grid grid-cols-3 gap-3">
                      {row.positions.map((pos, idx) =>
                        pos ? (
                          <div
                            key={pos}
                            className={`flex flex-col items-center justify-center rounded-[5px] border py-2 text-center ${pitchBadgeColor(
                              player.positions[pos] ?? 1,
                            )}`}
                          >
                            <span className="text-[12px] font-bold">{pos}</span>
                            <span className="text-[10px] font-semibold opacity-90 tabular-nums">
                              {player.positions[pos] ?? 1}/20
                            </span>
                          </div>
                        ) : (
                          <div key={`empty-${row.label}-${idx}`} />
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Position familiarity table */}
              <div className="flex flex-col gap-1">
                <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[#b2acbb]">
                  Positional Familiarity Breakdown
                </div>
                {(Object.entries(player.positions) as [PositionCode, number][])
                  .filter(([, v]) => v >= 5)
                  .sort((a, b) => b[1] - a[1])
                  .map(([pos, val], idx) => (
                    <div
                      key={pos}
                      className={`flex items-center justify-between border-b border-[#39333f] px-3 py-2 text-[13px] ${
                        idx % 2 === 0 ? 'bg-white/[0.03]' : ''
                      }`}
                    >
                      <span className="font-bold text-[#faf5fc]">{pos}</span>
                      <span className="text-[#b2acbb]">{positionFamiliarityLabel(val)}</span>
                      <span className={`font-bold tabular-nums ${attributeScoreColorClass(val)}`}>
                        {val} / 20
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'contracts' && (
            <div className="flex flex-col gap-4">
              {player.contracts.length === 0 ? (
                <div className="rounded-[6px] border border-[#39333f] bg-[#18151e] p-6 text-center text-[13px] text-[#b2acbb]">
                  No contract records available for this player in the loaded snapshot.
                </div>
              ) : (
                player.contracts.map((c, idx) => (
                  <div
                    key={`${c.club}-${c.type}-${idx}`}
                    className="rounded-[6px] border border-[#39333f] bg-[#18151e] p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="fm-font-display text-[16px] font-bold text-[#faf5fc]">
                        {c.club}
                      </span>
                      <span className="rounded bg-[#34223f] px-2.5 py-0.5 text-[11px] font-bold text-[#dc87ff]">
                        {c.type}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                      {[
                        { label: 'Squad Status', value: c.squadStatus ?? '—' },
                        {
                          label: `Wage (${wagePeriodSuffix(settings)})`,
                          value: formatWage(c.weeklyWage, settings),
                        },
                        { label: 'Start Date', value: c.startDate ?? '—' },
                        { label: 'Expiry Date', value: c.endDate ?? '—' },
                        {
                          label: 'Release Clause',
                          value: c.releaseClause ? formatMoney(c.releaseClause, settings) : 'None',
                        },
                        {
                          label: 'Appearance Fee',
                          value: c.appearanceFee ? formatMoney(c.appearanceFee, settings) : '—',
                        },
                      ].map((row) => (
                        <div
                          key={row.label}
                          className="flex justify-between border-b border-[#39333f]/70 py-2 text-[13px]"
                        >
                          <span className="text-[#b2acbb]">{row.label}</span>
                          <span className="font-semibold text-[#f0edf4] tabular-nums">
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}

              {player.clauses && player.clauses.length > 0 && (
                <div className="rounded-[6px] border border-[#39333f] bg-[#18151e] p-4">
                  <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-[#dc87ff]">
                    Active Contract Clauses
                  </div>
                  <div className="space-y-1.5 text-[13px]">
                    {player.clauses.map((cl, i) => (
                      <div
                        key={`${cl.kind}-${i}`}
                        className="flex items-center justify-between border-b border-[#39333f]/60 py-1.5 last:border-b-0"
                      >
                        <span className="text-[#d4ced8]">{cl.kind}</span>
                        <span className="font-mono font-semibold text-white tabular-nums">
                          {cl.value !== null ? formatMoney(cl.value, settings) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex h-[58px] shrink-0 items-center justify-end border-t border-[#39333f] bg-[#202128] px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[36px] items-center gap-1.5 rounded-[5px] bg-[#850be3] px-4 text-[13px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
          >
            <X className="h-4 w-4" />
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
