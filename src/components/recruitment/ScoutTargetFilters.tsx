import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { RecruitmentTarget } from '../../types/fmSave';
import {
  ClubDnaPillarWeights,
  StrategicDnaArchetypeId,
  STRATEGIC_DNA_ARCHETYPES,
} from '../../utils/clubDnaEngine';
import {
  ScoutAgeBand,
  ScoutContractFilter,
  ScoutPositionGroup,
} from '../../utils/recruitmentHelpers';
import { archetypeBadgeClass } from './recruitmentBadges';
import type { EnrichedScoutTargetWithDna, TargetSortKey } from './recruitmentTypes';

interface ScoutTargetFiltersProps {
  scoutedTargets: RecruitmentTarget[];
  filteredScoutedTargets: EnrichedScoutTargetWithDna[];
  targetPosGroup: ScoutPositionGroup;
  setTargetPosGroup: Dispatch<SetStateAction<ScoutPositionGroup>>;
  targetAgeBand: ScoutAgeBand;
  setTargetAgeBand: Dispatch<SetStateAction<ScoutAgeBand>>;
  dnaArchetypeFilter: 'ALL' | StrategicDnaArchetypeId;
  setDnaArchetypeFilter: Dispatch<SetStateAction<'ALL' | StrategicDnaArchetypeId>>;
  setVisibleTargetCount: Dispatch<SetStateAction<number>>;
  showDnaTuner: boolean;
  setShowDnaTuner: Dispatch<SetStateAction<boolean>>;
  clubDnaWeights: ClubDnaPillarWeights;
  handleUpdateDnaWeight: (key: keyof ClubDnaPillarWeights, val: number) => void;
  handleResetDnaWeights: () => void;
  targetFilter: ScoutContractFilter;
  setTargetFilter: Dispatch<SetStateAction<ScoutContractFilter>>;
  exactPosFilter: string;
  setExactPosFilter: Dispatch<SetStateAction<string>>;
  targetSortBy: TargetSortKey;
  setTargetSortBy: Dispatch<SetStateAction<TargetSortKey>>;
  genuineGapsOnly: boolean;
  setGenuineGapsOnly: Dispatch<SetStateAction<boolean>>;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
}

export const ScoutTargetFilters: React.FC<ScoutTargetFiltersProps> = ({
  scoutedTargets,
  filteredScoutedTargets,
  targetPosGroup,
  setTargetPosGroup,
  targetAgeBand,
  setTargetAgeBand,
  dnaArchetypeFilter,
  setDnaArchetypeFilter,
  setVisibleTargetCount,
  showDnaTuner,
  setShowDnaTuner,
  clubDnaWeights,
  handleUpdateDnaWeight,
  handleResetDnaWeights,
  targetFilter,
  setTargetFilter,
  exactPosFilter,
  setExactPosFilter,
  targetSortBy,
  setTargetSortBy,
  genuineGapsOnly,
  setGenuineGapsOnly,
  search,
  setSearch,
}) => {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Position Group Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map((grp) => (
            <button
              key={grp}
              type="button"
              onClick={() => setTargetPosGroup(grp)}
              className={`min-h-[44px] sm:min-h-[30px] rounded-lg px-2.5 py-1 text-xs sm:text-micro font-semibold border transition cursor-pointer whitespace-nowrap ${
                targetPosGroup === grp
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {grp}
            </button>
          ))}
        </div>

        {/* Age Band Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: 'All Ages' },
              { id: 'U23', label: 'U23' },
              { id: '23-28', label: '23–28' },
              { id: '29+', label: '29+' },
            ] as const
          ).map((band) => (
            <button
              key={band.id}
              type="button"
              onClick={() => setTargetAgeBand(band.id)}
              className={`min-h-[44px] sm:min-h-[30px] rounded-lg px-2.5 py-1 text-xs sm:text-micro font-semibold border transition cursor-pointer whitespace-nowrap ${
                targetAgeBand === band.id
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                  : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {band.label}
            </button>
          ))}
        </div>
      </div>

      {/* Phase 2 (v3.0): Configurable Club DNA Archetypes & Pillar Weight Tuner */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-micro font-bold text-emerald-300 mr-1">
            Club DNA:
          </span>
          <button
            type="button"
            onClick={() => {
              setDnaArchetypeFilter('ALL');
              setVisibleTargetCount(24);
            }}
            className={`min-h-[44px] sm:min-h-[28px] rounded-lg px-2.5 sm:px-2 py-1 sm:py-0.5 text-xs sm:text-micro font-semibold border transition cursor-pointer whitespace-nowrap ${
              dnaArchetypeFilter === 'ALL'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            All DNA
          </button>
          {STRATEGIC_DNA_ARCHETYPES.map((arch) => (
            <button
              key={arch.id}
              type="button"
              onClick={() => {
                setDnaArchetypeFilter(arch.id);
                setVisibleTargetCount(24);
              }}
              className={`min-h-[44px] sm:min-h-[28px] rounded-lg px-2.5 sm:px-2 py-1 sm:py-0.5 text-xs sm:text-micro font-semibold border transition cursor-pointer whitespace-nowrap ${
                dnaArchetypeFilter === arch.id
                  ? archetypeBadgeClass(arch.badgeTone)
                  : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {arch.shortLabel}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowDnaTuner((v) => !v)}
          className="min-h-[44px] sm:min-h-[30px] rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 px-3 sm:px-2.5 py-1 text-xs sm:text-micro font-semibold text-emerald-300 transition cursor-pointer whitespace-nowrap"
        >
          {showDnaTuner ? 'Hide DNA Weight Sliders' : 'Tune Club DNA Weights'}
        </button>
      </div>

      {showDnaTuner && (
        <div className="rounded-xl border border-emerald-500/30 bg-slate-950/85 p-3 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-emerald-300">
              Custom Club DNA 4-Pillar Weight Matrix (0–100 + Division Benchmark Calibration)
            </span>
            <button
              type="button"
              onClick={handleResetDnaWeights}
              className="text-micro text-slate-400 hover:text-white underline cursor-pointer"
            >
              Reset Default DNA
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {(
              [
                {
                  key: 'physicalIntensity',
                  label: 'Physical Intensity (Pac/Acc/Sta)',
                },
                {
                  key: 'technicalSecurity',
                  label: 'Technical Security (Pas/1st/Drb)',
                },
                {
                  key: 'tacticalDiscipline',
                  label: 'Tactical Discipline (Dec/Pos/Ant)',
                },
                {
                  key: 'aerialDominance',
                  label: 'Aerial Dominance (Jum/Str/Hea)',
                },
              ] as const
            ).map((pillar) => (
              <div key={pillar.key} className="space-y-1">
                <div className="flex justify-between text-micro">
                  <span className="text-slate-300">{pillar.label}</span>
                  <span className="font-mono font-bold text-emerald-300">
                    {clubDnaWeights[pillar.key]}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={clubDnaWeights[pillar.key]}
                  onChange={(e) =>
                    handleUpdateDnaWeight(
                      pillar.key,
                      Number(e.target.value)
                    )
                  }
                  className="w-full accent-emerald-500"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: `All (${scoutedTargets.length})` },
              {
                id: 'FREE',
                label: `Free Agents (${scoutedTargets.filter((t) => t.isFreeAgent).length})`,
              },
              {
                id: 'LOAN',
                label: `Loans (${scoutedTargets.filter((t) => Boolean(t.isLoanCandidate)).length})`,
              },
              {
                id: 'EXPIRING',
                label: `Expiring (${scoutedTargets.filter((t) => !t.isFreeAgent && !t.isLoanCandidate).length})`,
              },
            ] as const
          ).map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setTargetFilter(btn.id)}
              className={`min-h-[44px] sm:min-h-[30px] rounded-lg px-2.5 py-1 text-xs sm:text-micro font-semibold border transition cursor-pointer whitespace-nowrap ${
                targetFilter === btn.id
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {btn.label}
            </button>
          ))}

          <select
            aria-label="Exact Position"
            value={exactPosFilter}
            onChange={(e) => {
              setExactPosFilter(e.target.value);
              setVisibleTargetCount(24);
            }}
            className="min-h-[44px] sm:min-h-[30px] rounded-lg bg-slate-950 border border-slate-700 px-2.5 sm:px-2 py-1 text-base sm:text-micro font-semibold text-slate-200 focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
          >
            <option value="ALL">All Exact Slots</option>
            {(['GK', 'DC', 'DL', 'DR', 'DM', 'MC', 'AMC', 'AML', 'AMR', 'STC'] as const).map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>

          <select
            aria-label="Sort Scouted Targets"
            value={targetSortBy}
            onChange={(e) => {
              setTargetSortBy(
                e.target.value as
                  | 'GAP_FIT'
                  | 'CLUB_DNA'
                  | 'ROLE_FIT'
                  | 'ARCHETYPE'
                  | 'AGE'
                  | 'WAGE'
              );
              setVisibleTargetCount(24);
            }}
            className="min-h-[44px] sm:min-h-[30px] rounded-lg bg-slate-950 border border-slate-700 px-2.5 sm:px-2 py-1 text-base sm:text-micro font-semibold text-slate-200 focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
          >
            <option value="GAP_FIT">Sort: Gap &amp; Role Fit</option>
            <option value="CLUB_DNA">Sort: Club DNA Score (0–100)</option>
            <option value="ROLE_FIT">Sort: Best Role Fit %</option>
            <option value="ARCHETYPE">Sort: Playbook Archetype</option>
            <option value="AGE">Sort: Youngest First</option>
            <option value="WAGE">Sort: Lowest Wage</option>
          </select>

          <button
            type="button"
            aria-pressed={genuineGapsOnly}
            onClick={() => {
              setGenuineGapsOnly((prev) => !prev);
              setVisibleTargetCount(24);
            }}
            className={`min-h-[44px] sm:min-h-[30px] rounded-lg px-2.5 py-1 text-xs sm:text-micro font-semibold border transition cursor-pointer whitespace-nowrap ${
              genuineGapsOnly
                ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400 ring-1 ring-emerald-400/40 shadow-sm shadow-emerald-500/20'
                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            {genuineGapsOnly ? '✓ Genuine Gaps Only' : 'Genuine Gaps Only'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {search.trim() && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-micro font-semibold text-amber-200 hover:bg-amber-500/25 cursor-pointer"
            >
              Filter: &ldquo;{search.trim()}&rdquo; ×
            </button>
          )}
          <span className="text-micro text-slate-400">
            Scout pool: {filteredScoutedTargets.length} matching ({scoutedTargets.length} in save)
          </span>
        </div>
      </div>
    </div>
  );
};
