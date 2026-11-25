import React, { useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { PlayerRecord } from '../types/fm27';
import {
  ClubGovernanceState,
  DivisionBenchmarks,
  LastMatchTacticBlueprint,
  RecruitmentTarget,
} from '../types/fmSave';
import { evaluateScoutTargetCard } from '../utils/cardIntelligenceEngine';
import type { ClubDnaPillarWeights } from '../utils/clubDnaEngine';
import type { ShortlistTargetAdvice } from '../utils/shortlistAdviceEngine';
import { AttributeRadarChart, PercentilePizzaChart } from './charts/PlayerRadarAndPizzaCharts';
import { MobileSheetFrame } from './MobileSheetFrame';

interface ScoutTargetDetailModalProps {
  target: RecruitmentTarget | null;
  shortlistAdvice?: ShortlistTargetAdvice | null;
  squadPlayers: PlayerRecord[];
  divisionBenchmarks?: DivisionBenchmarks | null;
  lastMatchTactic?: LastMatchTacticBlueprint | null;
  governance?: ClubGovernanceState | null;
  clubDnaWeights?: ClubDnaPillarWeights;
  isTracked: boolean;
  onToggleTrack: (target: RecruitmentTarget) => void;
  onAskAnalyst?: (prompt: string) => void;
  onClose: () => void;
}

type DossierTab = 'fit' | 'attributes' | 'compare';

const TONE_TEXT: Record<string, string> = {
  emerald: 'text-emerald-300',
  sky: 'text-sky-300',
  teal: 'text-teal-300',
  purple: 'text-purple-300',
  amber: 'text-amber-300',
  rose: 'text-rose-300',
  slate: 'text-slate-300',
};

const TONE_BORDER: Record<string, string> = {
  emerald: 'border-emerald-500/40 bg-emerald-500/10',
  sky: 'border-sky-500/40 bg-sky-500/10',
  teal: 'border-teal-500/40 bg-teal-500/10',
  purple: 'border-purple-500/40 bg-purple-500/10',
  amber: 'border-amber-500/40 bg-amber-500/10',
  rose: 'border-rose-500/40 bg-rose-500/10',
  slate: 'border-slate-700 bg-slate-900/70',
};

const OUTFIELD_ATTR_GROUPS: Array<{
  title: string;
  items: Array<{ key: keyof PlayerRecord['attributes']; label: string }>;
}> = [
  {
    title: 'Technical',
    items: [
      { key: 'corners', label: 'Corners' },
      { key: 'crossing', label: 'Crossing' },
      { key: 'dribbling', label: 'Dribbling' },
      { key: 'finishing', label: 'Finishing' },
      { key: 'firstTouch', label: 'First Touch' },
      { key: 'freeKicks', label: 'Free Kicks' },
      { key: 'heading', label: 'Heading' },
      { key: 'longShots', label: 'Long Shots' },
      { key: 'longThrows', label: 'Long Throws' },
      { key: 'marking', label: 'Marking' },
      { key: 'passing', label: 'Passing' },
      { key: 'penalties', label: 'Penalties' },
      { key: 'tackling', label: 'Tackling' },
      { key: 'technique', label: 'Technique' },
    ],
  },
  {
    title: 'Mental',
    items: [
      { key: 'aggression', label: 'Aggression' },
      { key: 'anticipation', label: 'Anticipation' },
      { key: 'bravery', label: 'Bravery' },
      { key: 'composure', label: 'Composure' },
      { key: 'concentration', label: 'Concentration' },
      { key: 'decisions', label: 'Decisions' },
      { key: 'determination', label: 'Determination' },
      { key: 'flair', label: 'Flair' },
      { key: 'leadership', label: 'Leadership' },
      { key: 'offTheBall', label: 'Off The Ball' },
      { key: 'positioning', label: 'Positioning' },
      { key: 'teamwork', label: 'Teamwork' },
      { key: 'vision', label: 'Vision' },
      { key: 'workRate', label: 'Work Rate' },
    ],
  },
  {
    title: 'Physical',
    items: [
      { key: 'acceleration', label: 'Acceleration' },
      { key: 'agility', label: 'Agility' },
      { key: 'balance', label: 'Balance' },
      { key: 'jumpingReach', label: 'Jumping Reach' },
      { key: 'naturalFitness', label: 'Natural Fitness' },
      { key: 'pace', label: 'Pace' },
      { key: 'stamina', label: 'Stamina' },
      { key: 'strength', label: 'Strength' },
    ],
  },
];

const GK_ATTR_GROUP: Array<{ key: keyof PlayerRecord['attributes']; label: string }> = [
  { key: 'aerialReach', label: 'Aerial Reach' },
  { key: 'commandOfArea', label: 'Command of Area' },
  { key: 'communication', label: 'Communication' },
  { key: 'eccentricity', label: 'Eccentricity' },
  { key: 'handling', label: 'Handling' },
  { key: 'kicking', label: 'Kicking' },
  { key: 'oneOnOnes', label: 'One on Ones' },
  { key: 'punching', label: 'Punching' },
  { key: 'reflexes', label: 'Reflexes' },
  { key: 'rushingOut', label: 'Rushing Out' },
  { key: 'throwing', label: 'Throwing' },
];

function attrToneClass(val: number): string {
  if (val >= 16) return 'text-emerald-300 font-bold';
  if (val >= 13) return 'text-lime-300 font-semibold';
  if (val >= 10) return 'text-amber-200';
  return 'text-slate-400';
}

export const ScoutTargetDetailModal: React.FC<ScoutTargetDetailModalProps> = ({
  target,
  shortlistAdvice = null,
  squadPlayers,
  divisionBenchmarks = null,
  lastMatchTactic = null,
  governance = null,
  clubDnaWeights,
  isTracked,
  onToggleTrack,
  onAskAnalyst,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<DossierTab>('fit');

  if (!target) return null;

  const intel = evaluateScoutTargetCard(target, squadPlayers, {
    divisionBenchmarks,
    activeTactic: lastMatchTactic,
    governance,
    clubDnaWeights,
  });

  const incumbent = shortlistAdvice?.targetIncumbent ?? intel.starterRecord;
  const incumbentName = incumbent?.name ?? intel.starterName;
  const displayTone = shortlistAdvice?.badgeTone ?? intel.tone;
  const displayVerdict = shortlistAdvice?.tierLabel ?? intel.verdictLabel;
  const displayIpRole = shortlistAdvice?.bestIpRole ?? intel.bestIpRole;
  const displayOopRole = shortlistAdvice?.bestOopRole ?? intel.bestOopRole;
  const displayRoleFit = shortlistAdvice?.ipRoleFitPct ?? intel.bestRoleFitPct;
  const personality = shortlistAdvice?.character.personalityLabel || target.personality || 'Balanced';
  const weeklyWage = Math.round(
    shortlistAdvice?.budget.expectedWagePw ?? target.currentWagePw ?? target.demandedWageEur ?? 0
  );
  const clubLabel = target.currentClub || 'Unattached';
  const isGk = (target.primaryPosition || '').toUpperCase().includes('GK');

  const posEntries = Object.entries(target.positionRatings || intel.syntheticPlayerRecord.positionRatings || {})
    .filter(([, v]) => typeof v === 'number' && v >= 12)
    .sort((a, b) => b[1] - a[1]);

  const handleAsk = () => {
    if (!onAskAnalyst) return;
    const prompt = `Give me a full FM27 Patch 27.1.0 shortlist verdict on ${target.name} (${target.primaryPosition}, Age ${target.age}, ${clubLabel}, Personality: ${personality}, ${weeklyWage > 0 ? `£${weeklyWage.toLocaleString()}/wk` : 'Free Agent'}, ${shortlistAdvice?.budget.feeLabel || intel.valueTag}, expires ${target.expires || 'N/A'}). Explain how he fills our squad gaps NOW vs over the next 1–3 seasons, compare him directly against ${incumbentName || 'our current starter'} for ${displayIpRole} IP / ${displayOopRole} OOP, and confirm whether he fits our club finances.`;
    onClose();
    onAskAnalyst(prompt);
  };

  return (
    <MobileSheetFrame
      isOpen={Boolean(target)}
      onClose={onClose}
      ariaLabel={`Shortlist player profile for ${target.name}`}
      closeAriaLabel="Close player dossier"
      maxWidthClass="sm:max-w-3xl"
      bodyClassName="p-4 sm:p-6 space-y-4"
      header={
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-white leading-tight break-words">
              {target.name}
            </h2>
            <span className="rounded bg-emerald-500/15 border border-emerald-500/35 px-1.5 py-0.5 font-mono text-xs text-emerald-300 font-semibold">
              {target.primaryPosition}
            </span>
            {target.shortlistOrigin === 'in_game_shortlist' && (
              <span className="rounded bg-sky-500/15 border border-sky-500/35 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-300">
                In-Game Shortlist
              </span>
            )}
            <span className="text-xs text-slate-400">
              Age {target.age} · {target.nationality || 'Unknown'} · {clubLabel}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            {personality}
            {target.preferredFoot ? ` · ${target.preferredFoot} Foot` : ''}
            {target.heightCm ? ` · ${target.heightCm}cm` : ''} ·{' '}
            <span className="font-mono text-slate-200">
              {shortlistAdvice?.budget.feeLabel || intel.valueTag}
            </span>{' '}
            ·{' '}
            <span className="font-mono text-slate-200">
              {weeklyWage > 0 ? `£${weeklyWage.toLocaleString()}/wk` : 'Wage TBD'}
            </span>
          </p>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => onToggleTrack(target)}
            className={`min-h-[44px] inline-flex items-center gap-2 rounded-xl px-4 text-xs font-semibold border transition-colors cursor-pointer ${
              isTracked
                ? 'border-amber-400/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                : 'border-slate-700 bg-slate-950 text-slate-200 hover:border-amber-400/40'
            }`}
          >
            {isTracked ? (
              <>
                <BookmarkCheck className="h-4 w-4" /> ★ Priority Pinned
              </>
            ) : (
              <>
                <Bookmark className="h-4 w-4" /> Pin Priority Target
              </>
            )}
          </button>

          {onAskAnalyst && (
            <button
              type="button"
              onClick={handleAsk}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              <MessageSquare className="h-4 w-4" /> Ask Analyst About{' '}
              {target.name.split(' ').slice(-1)[0]}
            </button>
          )}
        </div>
      }
    >
      {/* 3-Tab Dossier Switcher */}
      <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-950/80 border border-slate-800 p-1">
        {(
          [
            { id: 'fit', label: 'Fit & Verdict' },
            { id: 'attributes', label: '52 Attrs & Positions' },
            { id: 'compare', label: 'Head-to-Head' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-[38px] rounded-lg px-2 py-1.5 text-xs font-semibold transition cursor-pointer ${
              activeTab === tab.id
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: FIT & VERDICT (NOW VS FUTURE) */}
      {activeTab === 'fit' && (
        <div className="space-y-4">
          {/* Verdict Banner */}
          <div className={`rounded-xl border p-3.5 space-y-2 ${TONE_BORDER[displayTone] || TONE_BORDER.slate}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`text-sm font-bold ${TONE_TEXT[displayTone] || 'text-white'}`}>
                {displayVerdict}
                {shortlistAdvice ? ` · ${shortlistAdvice.headline}` : ''}
              </span>
              <span className="font-mono text-xs tabular-nums text-slate-200">
                Club DNA {intel.dnaFitPct}% · Role Fit {displayRoleFit}%
              </span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              {shortlistAdvice?.whyUpgradeOrHold || intel.inlineRationale}
            </p>
          </div>

          {/* How He Fits NOW vs IN FUTURE */}
          {shortlistAdvice && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  How He Helps Right Now
                </div>
                <p className="text-slate-200 leading-relaxed">{shortlistAdvice.howFitsNow}</p>
              </div>
              <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-300">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  1–3 Year Future Outlook
                </div>
                <p className="text-slate-200 leading-relaxed">{shortlistAdvice.howFitsFuture}</p>
              </div>
            </div>
          )}

          {/* Deal Economics & Strict Budget Gate Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                FM27 Dual-Phase Roles
              </div>
              <div className="font-semibold text-emerald-300">
                IP: {displayIpRole} ({displayRoleFit}%)
              </div>
              <div className="font-semibold text-sky-300">
                OOP: {displayOopRole}
                {shortlistAdvice ? ` (${shortlistAdvice.oopRoleFitPct}%)` : ''}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                vs. {shortlistAdvice?.incumbentRoleLabel || 'Current Starter'}
              </div>
              <div className="font-semibold text-white truncate">
                {incumbentName || 'Fills open depth slot'}
              </div>
              <div
                className={`font-mono text-[11px] tabular-nums ${
                  (shortlistAdvice?.footballDelta ?? intel.starterDnaDelta ?? 0) >= 0
                    ? 'text-emerald-400'
                    : 'text-amber-300'
                }`}
              >
                {shortlistAdvice?.footballDelta != null
                  ? `${shortlistAdvice.footballDelta >= 0 ? '+' : ''}${shortlistAdvice.footballDelta.toFixed(1)} overall role/DNA delta`
                  : intel.starterDnaDelta != null
                    ? `${intel.starterDnaDelta >= 0 ? '+' : ''}${intel.starterDnaDelta}% Club DNA delta`
                    : 'Direct gap coverage'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
                {shortlistAdvice?.budget.passesBudgetGate === false ? (
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                )}
                Budget Gate &amp; Deal
              </div>
              <div className="font-semibold text-slate-100">
                {shortlistAdvice?.budget.feeLabel || intel.valueTag}
              </div>
              <div className="text-[11px] text-slate-400 leading-snug">
                {shortlistAdvice?.dealStructureAdvice || intel.promiseTag || 'Within club guidelines'}
              </div>
            </div>
          </div>

          {/* Personality, Scout Badges & Traits */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Personality, Reliability &amp; Player Traits
              </span>
              <span className="font-mono text-[11px] text-slate-200">
                {personality} · Det {intel.syntheticPlayerRecord.attributes.determination}/20
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(target.scoutBadges || []).map((badge) => (
                <span
                  key={badge}
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                    badge === 'Injury-Prone'
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                      : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                  }`}
                >
                  {badge}
                </span>
              ))}
              {(shortlistAdvice?.character.traitNotes || []).map((note, idx) => (
                <span
                  key={idx}
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                    note.startsWith('!')
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                      : 'bg-sky-500/15 border-sky-500/35 text-sky-200'
                  }`}
                >
                  {note}
                </span>
              ))}
              {(!target.traits || target.traits.length === 0) &&
                (!target.scoutBadges || target.scoutBadges.length === 0) && (
                  <span className="text-[11px] text-slate-400">
                    No special traits or reliability flags recorded in save.
                  </span>
                )}
            </div>
          </div>

          {/* Tactical Fit, Strengths & Risks */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
                <TrendingUp className="h-3.5 w-3.5" /> Top Strength
              </div>
              <p className="text-slate-200">{intel.topStrength}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-400 font-semibold">
                <ShieldCheck className="h-3.5 w-3.5" /> Primary Risk
              </div>
              <p className="text-slate-200">
                {shortlistAdvice?.character.riskSignals.length
                  ? shortlistAdvice.character.riskSignals.join(' · ')
                  : intel.primaryRisk}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-sky-400 font-semibold">
                Active Tactic Fit
              </div>
              <p className="text-slate-200">{intel.tacticalFitNote}</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FULL 52 ATTRIBUTES & POSITIONAL FAMILIARITY */}
      {activeTab === 'attributes' && (
        <div className="space-y-4">
          {posEntries.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Positional Familiarity (1–20)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {posEntries.map(([code, rating]) => (
                  <span
                    key={code}
                    className={`rounded-md border px-2 py-0.5 font-mono text-xs ${
                      rating >= 18
                        ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200 font-bold'
                        : rating >= 15
                          ? 'border-lime-400/50 bg-lime-500/15 text-lime-200 font-semibold'
                          : 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                    }`}
                  >
                    {code}: {rating}/20
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(isGk
              ? [
                  { title: 'Goalkeeping', items: GK_ATTR_GROUP },
                  OUTFIELD_ATTR_GROUPS[1],
                  OUTFIELD_ATTR_GROUPS[2],
                ]
              : OUTFIELD_ATTR_GROUPS
            ).map((group) => (
              <div
                key={group.title}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1.5"
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 pb-1 border-b border-slate-800">
                  {group.title}
                </div>
                {group.items.map((item) => {
                  const val = Math.round(
                    Number(intel.syntheticPlayerRecord.attributes[item.key] ?? 10)
                  );
                  return (
                    <div
                      key={item.key}
                      className="flex items-center justify-between text-xs py-0.5"
                    >
                      <span className="text-slate-300">{item.label}</span>
                      <span className={`font-mono tabular-nums ${attrToneClass(val)}`}>
                        {val}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: HEAD-TO-HEAD VISUAL COMPARISON */}
      {activeTab === 'compare' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 flex items-center justify-center">
              <PercentilePizzaChart
                slices={intel.pizzaSlices}
                playerName={target.name}
                subtitle="8-spoke percentile vs. squad & division"
                size={255}
              />
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 flex items-center justify-center">
              <AttributeRadarChart
                player={intel.syntheticPlayerRecord}
                comparePlayer={incumbent}
                size={250}
              />
            </div>
          </div>

          {shortlistAdvice?.comparison && incumbent && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {shortlistAdvice.comparison.radarAxes.map((ax) => (
                <div
                  key={ax.label}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 flex items-center justify-between text-xs font-mono"
                >
                  <span className="text-slate-300 font-semibold">{ax.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-300 font-bold">{ax.targetVal}</span>
                    <span className="text-slate-500">/</span>
                    <span className="text-sky-300">{ax.starterVal}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        ax.delta > 0
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : ax.delta < 0
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {ax.delta > 0 ? `+${ax.delta}` : ax.delta}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </MobileSheetFrame>
  );
};
