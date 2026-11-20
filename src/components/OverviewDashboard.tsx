import {
  BookOpen,
  Calendar,
  CloudUpload,
  FileArchive,
  Shield,
  Sparkles,
  Trophy,
  Upload,
  Wallet,
} from 'lucide-react';
import { formatMoney, formatWage, wagePeriodSuffix } from '../domain/filters';
import type {
  AiContextState,
  AppSettings,
  WorkspaceSnapshot,
  WorkspaceTabId,
} from '../domain/types';
import { LiveFmSaveProofCard } from './LiveFmSaveProofCard';

interface OverviewDashboardProps {
  snapshot: WorkspaceSnapshot;
  aiContext: AiContextState;
  settings: AppSettings;
  onOpenLoadSave: () => void;
  onNavigateTab: (tab: WorkspaceTabId) => void;
  onSelectPlayer: (playerId: number) => void;
}

export function OverviewDashboard({
  snapshot,
  aiContext,
  settings,
  onOpenLoadSave,
  onNavigateTab,
  onSelectPlayer,
}: OverviewDashboardProps) {
  const isLoaded = snapshot.metadata.status === 'loaded';
  const managedName = aiContext.managedClubName || snapshot.metadata.managedClubName;
  const managedClubLower = (managedName || '').toLowerCase();

  const managedClubObj = managedClubLower
    ? snapshot.clubs.find((c) => c.name.toLowerCase() === managedClubLower)
    : snapshot.clubs[0];

  const nextFixture = snapshot.fixtures.find((f) => f.status === 'Upcoming') ?? null;

  const managedSquad = managedClubLower
    ? snapshot.players.filter(
        (p) =>
          p.playingClub.toLowerCase() === managedClubLower ||
          p.club.toLowerCase() === managedClubLower,
      )
    : snapshot.players;

  const totalGoals = managedSquad.reduce((acc, p) => acc + (p.seasonStats?.goals ?? 0), 0);
  const totalAssists = managedSquad.reduce((acc, p) => acc + (p.seasonStats?.assists ?? 0), 0);
  const ratedPlayers = managedSquad.filter((p) => typeof p.seasonStats?.rating === 'number');
  const avgRating =
    ratedPlayers.length > 0
      ? (
          ratedPlayers.reduce((acc, p) => acc + (p.seasonStats?.rating ?? 0), 0) /
          ratedPlayers.length
        ).toFixed(2)
      : null;

  const activeTactic =
    aiContext.tactics.find((t) => t.id === aiContext.activeTacticId) ??
    snapshot.tactics[0] ??
    null;

  const fin = snapshot.finances;
  const wagePayroll = fin?.wagePayrollWeekly ?? managedClubObj?.currentWagesWeekly ?? null;
  const wageBudget = fin?.wageBudgetWeekly ?? managedClubObj?.payrollBudgetWeekly ?? null;
  const balance = fin?.balance ?? managedClubObj?.balance ?? null;

  const wageStatusText =
    wagePayroll !== null && wageBudget !== null
      ? wagePayroll <= wageBudget
        ? 'Compliant'
        : `Over by ${formatWage(wagePayroll - wageBudget, settings)}`
      : '--';

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-5">
      {/* Executive KPI Strip (strictly -- until save loaded) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {/* 1. Club / Division */}
        <div className="rounded-[7px] border border-[#39333f] bg-[#14111a]/95 p-4">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.08em] text-[#b2acbb]">
            <span>Club / Division</span>
            <Shield className="h-3.5 w-3.5 text-[#dc87ff]" />
          </div>
          <div className="mt-1.5 text-[18px] font-bold text-[#faf5fc] truncate">
            {isLoaded ? managedName || '--' : '--'}
          </div>
          <div className="mt-0.5 text-[12px] text-[#9c92a6] truncate">
            {isLoaded
              ? snapshot.leagueStanding?.competitionName ||
                managedClubObj?.competition ||
                '--'
              : 'Awaiting .fm Save'}
          </div>
        </div>

        {/* 2. Save Date */}
        <div className="rounded-[7px] border border-[#39333f] bg-[#14111a]/95 p-4">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.08em] text-[#b2acbb]">
            <span>Save Date</span>
            <Calendar className="h-3.5 w-3.5 text-[#dc87ff]" />
          </div>
          <div className="mt-1.5 font-mono text-[18px] font-bold text-[#faf5fc] tabular-nums">
            {isLoaded
              ? snapshot.metadata.gameDateDmy || snapshot.metadata.gameDate || '--'
              : '--'}
          </div>
          <div className="mt-0.5 text-[12px] text-[#9c92a6] truncate">
            {isLoaded
              ? `${snapshot.metadata.game ?? 'FM27'} · ${snapshot.metadata.saveName || 'Live Save'}`
              : 'No save date decoded'}
          </div>
        </div>

        {/* 3. Next Fixture */}
        <div className="rounded-[7px] border border-[#39333f] bg-[#14111a]/95 p-4">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.08em] text-[#b2acbb]">
            <span>Next Fixture</span>
            <Calendar className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="mt-1.5 text-[18px] font-bold text-[#faf5fc] truncate">
            {isLoaded && nextFixture
              ? `vs ${nextFixture.opponent} (${nextFixture.home ? 'H' : 'A'})`
              : '--'}
          </div>
          <div className="mt-0.5 text-[12px] text-[#9c92a6] truncate">
            {isLoaded && nextFixture
              ? `${nextFixture.kickoffDate}${nextFixture.kickoffTime ? ` ${nextFixture.kickoffTime}` : ''} · ${nextFixture.competition}`
              : 'No upcoming fixture loaded'}
          </div>
        </div>

        {/* 4. League Standing */}
        <div className="rounded-[7px] border border-[#39333f] bg-[#14111a]/95 p-4">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.08em] text-[#b2acbb]">
            <span>League Standing</span>
            <Trophy className="h-3.5 w-3.5 text-[#f0d637]" />
          </div>
          <div className="mt-1.5 font-mono text-[18px] font-bold text-[#faf5fc] tabular-nums">
            {isLoaded && snapshot.leagueStanding
              ? `#${snapshot.leagueStanding.position} · ${snapshot.leagueStanding.points} Pts`
              : '--'}
          </div>
          <div className="mt-0.5 text-[12px] text-[#9c92a6] tabular-nums">
            {isLoaded && snapshot.leagueStanding
              ? `${snapshot.leagueStanding.played} GP (${snapshot.leagueStanding.won}W-${snapshot.leagueStanding.drawn}D-${snapshot.leagueStanding.lost}L · GD ${snapshot.leagueStanding.goalDiff >= 0 ? `+${snapshot.leagueStanding.goalDiff}` : snapshot.leagueStanding.goalDiff})`
              : 'League table unavailable'}
          </div>
        </div>

        {/* 5. Squad Season Output */}
        <div className="rounded-[7px] border border-[#39333f] bg-[#14111a]/95 p-4">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.08em] text-[#b2acbb]">
            <span>Squad Season Output</span>
            <Sparkles className="h-3.5 w-3.5 text-[#dc87ff]" />
          </div>
          <div className="mt-1.5 font-mono text-[18px] font-bold text-[#faf5fc] tabular-nums">
            {isLoaded && managedSquad.length > 0
              ? `${managedSquad.length} Players · ${avgRating ?? '--'} Avg`
              : '--'}
          </div>
          <div className="mt-0.5 text-[12px] text-[#9c92a6] tabular-nums">
            {isLoaded && managedSquad.length > 0
              ? `${totalGoals} Goals · ${totalAssists} Assists (${snapshot.players.length.toLocaleString()} world pool)`
              : 'Load save or CSV/HTML export'}
          </div>
        </div>

        {/* 6. Active Tactic, Injuries & Finances */}
        <div className="rounded-[7px] border border-[#39333f] bg-[#14111a]/95 p-4">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.08em] text-[#b2acbb]">
            <span>Tactic / Health / Wage</span>
            <Wallet className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="mt-1.5 text-[16px] font-bold text-[#faf5fc] truncate">
            {isLoaded
              ? activeTactic
                ? `${activeTactic.name} (${activeTactic.formation})`
                : balance !== null
                  ? `Bal ${formatMoney(balance, settings)}`
                  : '--'
              : '--'}
          </div>
          <div className="mt-0.5 text-[12px] text-[#9c92a6] tabular-nums truncate">
            {isLoaded
              ? `Inj: ${snapshot.activeInjuries.length} · Mentor: ${snapshot.mentoring.length} · Wage (${wagePeriodSuffix(settings)}): ${wagePayroll !== null ? formatWage(wagePayroll, settings) : '--'} (${wageStatusText})`
              : 'Inj: -- · Mentor: -- · Wage: --'}
          </div>
        </div>
      </div>

      {/* Main Workspace State: Awaiting Save Hero vs Live Save Proof Card */}
      {!isLoaded ? (
        <section className="rounded-[8px] border border-dashed border-[#59515f] bg-[#14111a]/90 p-6 sm:p-8">
          <div className="mx-auto flex max-w-[700px] flex-col items-center text-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#734096] bg-[#34223f] text-[#dc87ff]">
              <FileArchive className="h-6 w-6" />
            </div>

            <div className="space-y-1.5">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#dc87ff]">
                Awaiting .fm Save · Zero Fake or Mock Data
              </div>
              <h2 className="fm-font-display text-[24px] font-bold text-white">
                Load Your Football Manager 27 Save or Export
              </h2>
              <p className="text-[13px] leading-relaxed text-[#b2acbb]">
                FM27 Command Hub starts completely clean with zero pre-seeded clubs or players.
                Drop your <code className="text-[#dc87ff]">.fm</code> save file to decode it 100%
                locally in your browser via Pyodide 3.14 +{' '}
                <code className="text-[#dc87ff]">fmsave 0.14.1</code>, or import a{' '}
                <code className="text-[#d4ced8]">.csv</code> /{' '}
                <code className="text-[#d4ced8]">.html</code> /{' '}
                <code className="text-[#d4ced8]">.rtf</code> /{' '}
                <code className="text-[#d4ced8]">.json</code> export.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={onOpenLoadSave}
                className="inline-flex h-[40px] items-center gap-2 rounded-[6px] bg-[#850be3] px-5 text-[13px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                <span>Load .fm Save / Drop Export</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('sync')}
                className="inline-flex h-[40px] items-center gap-2 rounded-[6px] border border-[#59515f] bg-[#202128] px-4 text-[13px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] cursor-pointer"
              >
                <CloudUpload className="h-4 w-4 text-emerald-400" />
                <span>AI &amp; Auto-Sync Studio</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('playbook')}
                className="inline-flex h-[40px] items-center gap-2 rounded-[6px] border border-[#59515f] bg-[#202128] px-4 text-[13px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] cursor-pointer"
              >
                <BookOpen className="h-4 w-4 text-[#dc87ff]" />
                <span>Open Playbook v2.0</span>
              </button>
            </div>
          </div>
        </section>
      ) : (
        <LiveFmSaveProofCard snapshot={snapshot} onSelectPlayer={onSelectPlayer} />
      )}
    </div>
  );
}
