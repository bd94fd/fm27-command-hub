import { Filter, Sparkles, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AiAndSyncWorkspace } from './components/AiAndSyncWorkspace';
import { AppHeader } from './components/AppHeader';
import { ClubDetailModal } from './components/ClubDetailModal';
import { DataTable, type TableColumn } from './components/DataTable';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Users } from 'lucide-react';
import { KVV_ZELZATE_META, SQUAD_PLAYERS } from './data/squadData';
import { COMPETITIVE_MATCH_LOGS } from './data/matchAndTacticsData';
import { MatchLogEntry, PlayerRecord } from './types/fm27';
import { computeCompetitiveSummary } from './utils/fmSyncEngine';
import {
  ClubFilterModal,
  CompetitionFilterModal,
  StaffFilterModal,
} from './components/GenericFilterModal';
import { LoadingSnapshotModal } from './components/LoadingSnapshotModal';
import { LoadSaveModal } from './components/LoadSaveModal';
import { MatchLogArchive } from './components/MatchLogArchive';
import { OverviewDashboard } from './components/OverviewDashboard';
import { PlaybookReferenceView } from './components/PlaybookReferenceView';
import { PlayerDetailModal } from './components/PlayerDetailModal';
import { PlayerFilterModal } from './components/PlayerFilterModal';
import { PlayersWorkspace } from './components/PlayersWorkspace';
import { RecruitmentView } from './components/RecruitmentView';
import { SettingsModal } from './components/SettingsModal';
import { SidebarNav, WORKSPACE_NAV_ITEMS } from './components/SidebarNav';
import { StaffDetailModal } from './components/StaffDetailModal';
import { TacticsAndLoadView } from './components/TacticsAndLoadView';
import { createEmptyAiContext, createEmptySnapshot } from './domain/emptyState';
import {
  createEmptyClubFilter,
  createEmptyCompetitionFilter,
  createEmptyPlayerFilter,
  createEmptyStaffFilter,
  filterClubs,
  filterCompetitions,
  filterPlayers,
  filterStaff,
  formatMoney,
  formatWage,
  isClubFilterActive,
  isCompetitionFilterActive,
  isPlayerFilterActive,
  isStaffFilterActive,
  wagePeriodSuffix,
} from './domain/filters';
import { formatStars, getBestStaffRoleRating } from './domain/staffRatings';
import type {
  AiContextState,
  AppSettings,
  ClubFilterCriteria,
  ClubRecord,
  CompetitionFilterCriteria,
  CompetitionRecord,
  FixtureRecord,
  MatchLogEntry,
  PlayerFilterCriteria,
  PlayerRecord,
  RecruitmentCase,
  SavedFilterSet,
  ShortlistRecord,
  StaffFilterCriteria,
  StaffRecord,
  TacticDefinition,
  WorkspaceSnapshot,
  WorkspaceTabId,
} from './domain/types';

const DEFAULT_SAVED_FILTERS: SavedFilterSet[] = [
  {
    id: 'preset-u21-high-pot',
    name: 'U21 High Potential (PA 140+)',
    criteria: { ...createEmptyPlayerFilter(), ageMax: 21, paMin: 140 },
  },
  {
    id: 'preset-high-stamina-speed',
    name: 'High-Engine Athletes (Pac 14+, Sta 13+)',
    criteria: {
      ...createEmptyPlayerFilter(),
      attributes: { pace: 14, stamina: 13 },
    },
  },
];
import { LiveFmSaveProofCard } from './components/LiveFmSaveProofCard';
import {
  loadPersistedFmState,
  savePersistedFmState,
  clearPersistedFmState,
  recordPreviousSnapshot,
  exportFmStateBackupJson,
  importFmStateBackupJson,
} from './services/fmStorage';
import { Download, Upload, Trash2, Database } from 'lucide-react';

export function App() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(() => createEmptySnapshot());
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [settings, setSettings] = useState<AppSettings>({
    currency: 'GBP',
    wagePeriod: 'weekly',
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadSaveOpen, setLoadSaveOpen] = useState(false);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState('Applying decoded FM27 snapshot…');

  // Filters
  const [playerFilter, setPlayerFilter] = useState<PlayerFilterCriteria>(() =>
    createEmptyPlayerFilter(),
  );
  const [staffFilter, setStaffFilter] = useState<StaffFilterCriteria>(() =>
    createEmptyStaffFilter(),
  );
  const [clubFilter, setClubFilter] = useState<ClubFilterCriteria>(() => createEmptyClubFilter());
  const [compFilter, setCompFilter] = useState<CompetitionFilterCriteria>(() =>
    createEmptyCompetitionFilter(),
  );
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [savedFilterSets, setSavedFilterSets] = useState<SavedFilterSet[]>(DEFAULT_SAVED_FILTERS);

  // Detail modals
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRecord | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffRecord | null>(null);
  const [selectedClub, setSelectedClub] = useState<{
    club: ClubRecord;
    tab: 'overview' | 'finances' | 'coefficients' | 'squad';
  } | null>(null);

  // Recruitment, Shortlists, AI Context
  const [recruitmentCases, setRecruitmentCases] = useState<RecruitmentCase[]>([]);
  const [prefillRecruitmentPlayer, setPrefillRecruitmentPlayer] = useState<PlayerRecord | null>(
    null,
  );
  const [shortlists, setShortlists] = useState<ShortlistRecord[]>([]);
  const [aiContext, setAiContext] = useState<AiContextState>(() => createEmptyAiContext());
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string | null>(null);
  const [isRestoredFromMemory, setIsRestoredFromMemory] = useState<boolean>(false);
  const [lastSyncedTimestamp, setLastSyncedTimestamp] = useState<string | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  // Restore saved state from previous session on initial mount
  useEffect(() => {
    const saved = loadPersistedFmState();
    if (saved && (saved.players.length > 0 || saved.matches.length > 0)) {
      setPlayers(saved.players);
      setMatches(saved.matches);
      if (saved.saveDate) setSaveDate(saved.saveDate);
      if (saved.nextFixture) setNextFixture(saved.nextFixture);
      if (saved.leagueStandingSub) setLeagueStandingSub(saved.leagueStandingSub);
      if (saved.wageSpend) setWageSpend(saved.wageSpend);
      if (saved.balance) setBalance(saved.balance);
      if (saved.hydratedFmSave) setHydratedFmSave(saved.hydratedFmSave);
      setIsRestoredFromMemory(true);
      setLastSyncedTimestamp(saved.lastSyncedAt);
    }
  }, []);

  // Automatically persist non-empty state across browser refreshes & sessions
  useEffect(() => {
    if (players.length > 0 || matches.length > 0) {
      savePersistedFmState({
        saveDate,
        nextFixture,
        leagueStandingSub,
        wageSpend,
        balance,
        clubName: hydratedFmSave?.decodedPayload.meta.clubName,
        players,
        matches,
        hydratedFmSave,
      });
      setIsRestoredFromMemory(true);
    }
  }, [
    players,
    matches,
    saveDate,
    nextFixture,
    leagueStandingSub,
    wageSpend,
    balance,
    hydratedFmSave,
  ]);

  // Hydrate initial server state (clean Awaiting .fm Save by default)
  useEffect(() => {
    void (async () => {
      try {
        const [snapRes, recRes, slRes, ctxRes] = await Promise.all([
          fetch('/api/snapshot'),
          fetch('/api/recruitment'),
          fetch('/api/shortlists'),
          fetch('/api/context'),
        ]);
        if (snapRes.ok) setSnapshot((await snapRes.json()) as WorkspaceSnapshot);
        if (recRes.ok) {
          const recData = (await recRes.json()) as { cases: RecruitmentCase[] };
          if (Array.isArray(recData.cases)) setRecruitmentCases(recData.cases);
        }
        if (slRes.ok) setShortlists((await slRes.json()) as ShortlistRecord[]);
        if (ctxRes.ok) setAiContext((await ctxRes.json()) as AiContextState);
      } catch {
        // Keep clean empty state on initial boot if server unreachable
      }
    })();
  }, []);

  async function handleApplyImportedSave(payload: {
    snapshot: WorkspaceSnapshot;
    managedClubName?: string | null;
    tactics?: TacticDefinition[];
  }) {
    setIsLoadingSnapshot(true);
    setLoadingPhase('Indexing players, staff, clubs & tactics…');
    try {
      const res = await fetch('/api/snapshot/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || 'Server rejected imported save snapshot.');
      }
      const data = (await res.json()) as {
        snapshot: WorkspaceSnapshot;
        aiContext: AiContextState;
      };
      setSnapshot(data.snapshot);
      setAiContext(data.aiContext);
      setPlayerFilter(createEmptyPlayerFilter());
      setStaffFilter(createEmptyStaffFilter());
      setClubFilter(createEmptyClubFilter());
      setCompFilter(createEmptyCompetitionFilter());
    } finally {
      setIsLoadingSnapshot(false);
    }
  }

  async function handleResetWorkspace() {
    setIsLoadingSnapshot(true);
    setLoadingPhase('Resetting workspace to Awaiting .fm Save…');
    try {
      const res = await fetch('/api/snapshot/reset', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as {
          snapshot: WorkspaceSnapshot;
          aiContext: AiContextState;
        };
        setSnapshot(data.snapshot);
        setAiContext(data.aiContext);
        setRecruitmentCases([]);
        setShortlists([]);
      } else {
        setSnapshot(createEmptySnapshot());
        setAiContext(createEmptyAiContext());
        setRecruitmentCases([]);
        setShortlists([]);
      }
      setPlayerFilter(createEmptyPlayerFilter());
      setStaffFilter(createEmptyStaffFilter());
      setClubFilter(createEmptyClubFilter());
      setCompFilter(createEmptyCompetitionFilter());
    } finally {
      setIsLoadingSnapshot(false);
  const handleClearMemory = () => {
    const confirmed = window.confirm(
      'Clear saved FM27 memory and return to clean "Awaiting .fm Save" state?'
    );
    if (!confirmed) return;

    clearPersistedFmState();
    setPlayers(SQUAD_PLAYERS);
    setMatches(COMPETITIVE_MATCH_LOGS);
    setSaveDate(KVV_ZELZATE_META.saveDate);
    setNextFixture(KVV_ZELZATE_META.nextFixture);
    setLeagueStandingSub('--');
    setWageSpend(KVV_ZELZATE_META.wageSpend);
    setBalance(KVV_ZELZATE_META.balance);
    setHydratedFmSave(null);
    setIsRestoredFromMemory(false);
    setLastSyncedTimestamp(null);
  };

  const handleExportBackup = () => {
    const json = exportFmStateBackupJson();
    if (!json) {
      alert('No save data currently in memory to export.');
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fm27-hub-backup-${saveDate.replace(/\//g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const imported = importFmStateBackupJson(text);
      if (imported) {
        setPlayers(imported.players);
        setMatches(imported.matches);
        setSaveDate(imported.saveDate);
        setNextFixture(imported.nextFixture);
        setLeagueStandingSub(imported.leagueStandingSub);
        setWageSpend(imported.wageSpend);
        setBalance(imported.balance);
        setHydratedFmSave(imported.hydratedFmSave);
        setIsRestoredFromMemory(true);
        setLastSyncedTimestamp(imported.lastSyncedAt);
      } else {
        alert('Invalid FM27 backup file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddMatch = (newMatch: MatchLogEntry) => {
    setMatches((prev) => [newMatch, ...prev]);
    if (newMatch.date) {
      setSaveDate(newMatch.date);
    }
  };

  const handleApplyDecodedFmSave = (
    decoded: DecodedFmSavePayload
  ): HydratedSaveState => {
    // Record current snapshot before applying new save for delta / progression tracking
    recordPreviousSnapshot(saveDate, players, matches);

    const hydrated = hydrateAppFromDecodedFmSave(decoded, players, matches);
    setHydratedFmSave(hydrated);
    setPlayers(hydrated.updatedSquad);
    setMatches(hydrated.updatedMatches);
    setSaveDate(hydrated.saveDateLabel);
    if (hydrated.nextFixtureLabel) {
      setNextFixture(hydrated.nextFixtureLabel);
    }
  }

  // Filtered datasets
  const filteredPlayers = useMemo(
    () => filterPlayers(snapshot.players, playerFilter),
    [snapshot.players, playerFilter],
  );
  const filteredStaff = useMemo(
    () => filterStaff(snapshot.staff, staffFilter),
    [snapshot.staff, staffFilter],
  );
  const filteredClubs = useMemo(
    () => filterClubs(snapshot.clubs, clubFilter),
    [snapshot.clubs, clubFilter],
  );
  const filteredCompetitions = useMemo(
    () => filterCompetitions(snapshot.competitions, compFilter),
    [snapshot.competitions, compFilter],
  );

  // Distinct filter dropdown options
  const distinctPlayerNations = useMemo(
    () =>
      Array.from(
        new Set(
          snapshot.players
            .flatMap((p) => [p.nationality, p.playingNation])
            .filter((v): v is string => Boolean(v)),
        ),
      ).sort(),
    [snapshot.players],
  );
  const distinctPlayerComps = useMemo(
    () =>
      Array.from(
        new Set(
          snapshot.players
            .map((p) => p.playingCompetition)
            .filter((v): v is string => Boolean(v)),
        ),
      ).sort(),
    [snapshot.players],
  );
  const distinctPlayerClubs = useMemo(
    () =>
      Array.from(
        new Set(
          snapshot.players
            .flatMap((p) => [p.club, p.playingClub])
            .filter((v): v is string => Boolean(v)),
        ),
      ).sort(),
    [snapshot.players],
  );
  const distinctStaffJobs = useMemo(
    () => Array.from(new Set(snapshot.staff.map((s) => s.job).filter(Boolean))).sort(),
    [snapshot.staff],
  );
  const distinctStaffClubs = useMemo(
    () => Array.from(new Set(snapshot.staff.map((s) => s.club).filter(Boolean))).sort(),
    [snapshot.staff],
  );
  const distinctStaffNations = useMemo(
    () =>
      Array.from(
        new Set(
          snapshot.staff.map((s) => s.nationality).filter((v): v is string => Boolean(v)),
        ),
      ).sort(),
    [snapshot.staff],
  );
  const distinctClubNations = useMemo(
    () =>
      Array.from(
        new Set(snapshot.clubs.map((c) => c.nation).filter((v): v is string => Boolean(v))),
      ).sort(),
    [snapshot.clubs],
  );
  const distinctClubComps = useMemo(
    () =>
      Array.from(
        new Set(
          snapshot.clubs.map((c) => c.competition).filter((v): v is string => Boolean(v)),
        ),
      ).sort(),
    [snapshot.clubs],
  );
  const distinctCompNations = useMemo(
    () =>
      Array.from(
        new Set(
          snapshot.competitions.map((c) => c.nation).filter((v): v is string => Boolean(v)),
        ),
      ).sort(),
    [snapshot.competitions],
  );

  // Table column definitions
  const staffColumns = useMemo<TableColumn<StaffRecord>[]>(
    () => [
      { key: 'name', header: 'Name', minWidth: '150px', sortValue: (s) => s.name, render: (s) => s.name },
      { key: 'job', header: 'Job', minWidth: '110px', sortValue: (s) => s.job, render: (s) => s.job },
      {
        key: 'bestRole',
        header: 'Best Coaching Role',
        minWidth: '142px',
        sortValue: (s) => getBestStaffRoleRating(s).label,
        render: (s) => getBestStaffRoleRating(s).label,
      },
      {
        key: 'bestStars',
        header: 'Best Stars',
        sortValue: (s) => getBestStaffRoleRating(s).stars,
        render: (s) => `${formatStars(getBestStaffRoleRating(s).stars)} ★`,
      },
      { key: 'club', header: 'Club', minWidth: '100px', sortValue: (s) => s.club, render: (s) => s.club || 'Unemployed' },
      { key: 'division', header: 'Division', minWidth: '115px', sortValue: (s) => s.division, render: (s) => s.division || '--' },
      { key: 'nationality', header: 'Nationality', sortValue: (s) => s.nationality, render: (s) => s.nationality ?? '--' },
      { key: 'age', header: 'Age', sortValue: (s) => s.age, render: (s) => s.age ?? '--' },
      { key: 'ca', header: 'CA', align: 'right', sortValue: (s) => s.ca, render: (s) => s.ca ?? '--' },
      { key: 'pa', header: 'PA', align: 'right', sortValue: (s) => s.pa, render: (s) => s.pa ?? '--' },
      {
        key: 'salary',
        header: `Salary (${wagePeriodSuffix(settings)})`,
        align: 'right',
        sortValue: (s) => s.salaryWeekly,
        render: (s) => formatWage(s.salaryWeekly, settings),
      },
    ],
    [settings],
  );

  const clubColumns = useMemo<TableColumn<ClubRecord>[]>(
    () => [
      { key: 'name', header: 'Name', minWidth: '150px', sortValue: (c) => c.name, render: (c) => c.name },
      { key: 'uniqueId', header: 'Unique ID', sortValue: (c) => c.uniqueId, render: (c) => c.uniqueId },
      { key: 'competition', header: 'Competition', minWidth: '140px', sortValue: (c) => c.competition, render: (c) => c.competition ?? '--' },
      { key: 'nation', header: 'Nation', sortValue: (c) => c.nation, render: (c) => c.nation ?? '--' },
      { key: 'reputation', header: 'Rep', align: 'right', sortValue: (c) => c.reputation, render: (c) => c.reputation ?? '--' },
      { key: 'training', header: 'Training', align: 'right', sortValue: (c) => c.trainingFacilities, render: (c) => c.trainingFacilities ?? '--' },
      { key: 'youth', header: 'Youth Fac', align: 'right', sortValue: (c) => c.youthFacilities, render: (c) => c.youthFacilities ?? '--' },
      {
        key: 'balance',
        header: 'Balance',
        align: 'right',
        sortValue: (c) => c.balance,
        render: (c) => formatMoney(c.balance, settings),
      },
      {
        key: 'transferBudget',
        header: 'Transfer Budget',
        align: 'right',
        sortValue: (c) => c.transferBudget,
        render: (c) => formatMoney(c.transferBudget, settings),
      },
    ],
    [settings],
  );

  const competitionColumns = useMemo<TableColumn<CompetitionRecord>[]>(
    () => [
      { key: 'name', header: 'Name', minWidth: '220px', sortValue: (c) => c.name, render: (c) => c.name },
      { key: 'nation', header: 'Nation', sortValue: (c) => c.nation, render: (c) => c.nation ?? '--' },
      { key: 'reputation', header: 'Reputation', align: 'right', sortValue: (c) => c.reputation, render: (c) => c.reputation ?? '--' },
      { key: 'gender', header: 'Gender', sortValue: (c) => c.gender, render: (c) => c.gender },
      { key: 'teams', header: 'Teams', align: 'right', sortValue: (c) => c.teamsCount, render: (c) => c.teamsCount ?? '--' },
    ],
    [],
  );

  const fixtureColumns = useMemo<TableColumn<FixtureRecord>[]>(
    () => [
      { key: 'date', header: 'Date', sortValue: (f) => f.kickoffDate, render: (f) => f.kickoffDate || '--' },
      { key: 'time', header: 'Kick-off', sortValue: (f) => f.kickoffTime, render: (f) => f.kickoffTime ?? '--' },
      { key: 'opponent', header: 'Opponent', minWidth: '140px', sortValue: (f) => f.opponent, render: (f) => f.opponent },
      {
        key: 'ha',
        header: 'H/A',
        sortValue: (f) => (f.home ? 'H' : 'A'),
        render: (f) => (
          <span
            className={`inline-flex h-5 w-6 items-center justify-center rounded text-[11px] font-bold ${
              f.home ? 'bg-[#17372a] text-[#71e7a7]' : 'bg-[#1a2941] text-[#85d0ff]'
            }`}
          >
            {f.home ? 'H' : 'A'}
          </span>
        ),
      },
      { key: 'competition', header: 'Competition', minWidth: '165px', sortValue: (f) => f.competition, render: (f) => f.competition },
      { key: 'venue', header: 'Venue', minWidth: '140px', sortValue: (f) => f.venue, render: (f) => f.venue ?? '--' },
      { key: 'homeClub', header: 'Home club', sortValue: (f) => f.homeClub, render: (f) => f.homeClub },
      { key: 'awayClub', header: 'Away club', sortValue: (f) => f.awayClub, render: (f) => f.awayClub },
      {
        key: 'result',
        header: 'Status',
        sortValue: (f) => f.status,
        render: (f) =>
          f.status === 'Played' ? (
            <span className="font-bold text-[#71e7a7]">{f.score ?? 'Played'}</span>
          ) : (
            <span className="text-[#b2acbb]">Upcoming</span>
          ),
      },
    ],
    [],
  );

  // Recruitment, Shortlist & Context mutations
  async function handleCreateRecruitment(payload: Omit<RecruitmentCase, 'id'>) {
    const res = await fetch('/api/recruitment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const created = (await res.json()) as RecruitmentCase;
      setRecruitmentCases((prev) => [created, ...prev]);
    }
  }

  async function handleUpdateRecruitment(id: string, patch: Partial<RecruitmentCase>) {
    setRecruitmentCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await fetch(`/api/recruitment/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }

  async function handleDeleteRecruitment(id: string) {
    setRecruitmentCases((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/recruitment/${id}`, { method: 'DELETE' });
  }

  async function handleClearExpiredRecruitment() {
    const res = await fetch('/api/recruitment/clear-expired', { method: 'POST' });
    if (res.ok) {
      const data = (await res.json()) as { cases: RecruitmentCase[] };
      setRecruitmentCases(data.cases);
    }
  }

  async function handleCreateShortlist(name: string, notes: string, playerIds: number[]) {
    const res = await fetch('/api/shortlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, notes, playerIds, createdBy: 'Manager' }),
    });
    if (res.ok) {
      const created = (await res.json()) as ShortlistRecord;
      setShortlists((prev) => [created, ...prev]);
    }
  }

  async function handleAddPlayerToShortlist(shortlistId: string, playerId: number) {
    const res = await fetch(`/api/shortlists/${shortlistId}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    });
    if (res.ok) {
      const updated = (await res.json()) as ShortlistRecord;
      setShortlists((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }
  }

  async function handleDeleteShortlist(id: string) {
    setShortlists((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/shortlists/${id}`, { method: 'DELETE' });
  }

  async function handleUpdateContext(patch: Partial<AiContextState>) {
    setAiContext((prev) => ({ ...prev, ...patch }));
    const res = await fetch('/api/context', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setAiContext((await res.json()) as AiContextState);
    }
  }

  async function handleAddTactic(tactic: Partial<TacticDefinition>) {
    const res = await fetch('/api/context/tactics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tactic),
    });
    if (res.ok) {
      const updatedCtx = (await res.json()) as AiContextState;
      setAiContext(updatedCtx);
      setSnapshot((prev) => ({
        ...prev,
        tactics: updatedCtx.tactics,
      }));
    }
  }

  function handleAddMatchLog(match: MatchLogEntry) {
    setSnapshot((prev) => ({
      ...prev,
      matchLogs: [match, ...prev.matchLogs],
    }));
  }

  const currentNav = WORKSPACE_NAV_ITEMS.find((n) => n.id === activeTab)!;
  const isAiOrSyncTab = activeTab === 'ai' || activeTab === 'sync';

  const isCurrentFilterActive =
    (activeTab === 'players' && isPlayerFilterActive(playerFilter)) ||
    (activeTab === 'staff' && isStaffFilterActive(staffFilter)) ||
    (activeTab === 'clubs' && isClubFilterActive(clubFilter)) ||
    (activeTab === 'competitions' && isCompetitionFilterActive(compFilter));

  const footerStatusText = useMemo(() => {
    if (snapshot.metadata.status === 'awaiting_save') {
      return 'Awaiting .fm Save · Zero mock data loaded';
    }
    if (activeTab === 'players' && isPlayerFilterActive(playerFilter)) {
      return `Filtered players ${filteredPlayers.length} | Total players ${snapshot.players.length}`;
    }
    if (activeTab === 'staff' && isStaffFilterActive(staffFilter)) {
      return `Filtered staff ${filteredStaff.length} | Total staff ${snapshot.staff.length}`;
    }
    if (activeTab === 'clubs' && isClubFilterActive(clubFilter)) {
      return `Filtered clubs ${filteredClubs.length} | Total clubs ${snapshot.clubs.length}`;
    }
    if (activeTab === 'competitions' && isCompetitionFilterActive(compFilter)) {
      return `Filtered competitions ${filteredCompetitions.length} | Total competitions ${snapshot.competitions.length}`;
    }
    return `Players ${snapshot.players.length} | Staff ${snapshot.staff.length} | Clubs ${snapshot.clubs.length} | Competitions ${snapshot.competitions.length}`;
  }, [
    activeTab,
    playerFilter,
    staffFilter,
    clubFilter,
    compFilter,
    filteredPlayers.length,
    filteredStaff.length,
    filteredClubs.length,
    filteredCompetitions.length,
    snapshot,
  ]);

  const awaitingEmptyAction =
    snapshot.metadata.status === 'awaiting_save' ? (
      <button
        type="button"
        onClick={() => setLoadSaveOpen(true)}
        className="inline-flex h-[34px] items-center gap-1.5 rounded-[5px] bg-[#850be3] px-3.5 text-[12px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
      >
        <Upload className="h-3.5 w-3.5" />
        <span>Load .fm Save / Export</span>
      </button>
    ) : undefined;

  const combinedTactics = useMemo(() => {
    const map = new Map<string, TacticDefinition>();
    for (const t of aiContext.tactics) map.set(t.id, t);
    for (const t of snapshot.tactics) {
      if (!map.has(t.id)) map.set(t.id, t);
    }
    return Array.from(map.values());
  }, [aiContext.tactics, snapshot.tactics]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0e0c12] text-[#f0edf4]">
      <AppHeader
        metadata={snapshot.metadata}
        onLoadData={() => setLoadSaveOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleMobileNav={() => setMobileNavOpen((v) => !v)}
        isLoading={isLoadingSnapshot}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <SidebarNav
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />

        <main className="fm-workspace-bg flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Workspace Heading */}
          <div className="flex shrink-0 items-center justify-between gap-4 px-5 sm:px-7 pb-4 pt-5">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#dc87ff]">
                {currentNav.section}
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract (responsive wrap on mobile) */}
      <header className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-x-6 gap-y-3 px-4 sm:px-6 py-3.5 sm:py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('sync');
          }}
          className="order-1 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          {hydratedFmSave ? hydratedFmSave.decodedPayload.meta.clubName : 'FM27 Command Hub'}
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label="Primary sections"
          className="order-3 lg:order-2 w-full lg:w-auto flex items-center gap-5 sm:gap-6 text-sm font-medium text-slate-600 dark:text-slate-400 overflow-x-auto pb-0.5"
        >
          <button
            type="button"
            onClick={() => setActiveTab('sync')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
              activeTab === 'sync'
                ? 'text-emerald-700 dark:text-emerald-400 underline underline-offset-4 font-semibold'
                : ''
            }`}
          >
            Tactical Analyst Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('squad')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
              activeTab === 'squad'
                ? 'text-emerald-700 dark:text-emerald-400 underline underline-offset-4 font-semibold'
                : ''
            }`}
          >
            Squad Database ({players.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tactics')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
              activeTab === 'tactics'
                ? 'text-emerald-700 dark:text-emerald-400 underline underline-offset-4 font-semibold'
                : ''
            }`}
          >
            Playbook v2.0 Reference
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('setpieces')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
              activeTab === 'setpieces'
                ? 'text-emerald-700 dark:text-emerald-400 underline underline-offset-4 font-semibold'
                : ''
            }`}
          >
            Corners &amp; Training
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('matches')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
              activeTab === 'matches'
                ? 'text-emerald-700 dark:text-emerald-400 underline underline-offset-4 font-semibold'
                : ''
            }`}
          >
            Match Log ({matches.length})
          </button>
        </nav>

        {/* Zone 3: Actions & Memory Controls */}
        <div className="order-2 lg:order-3 flex items-center gap-2 shrink-0">
          <input
            ref={backupFileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportBackup}
            className="hidden"
          />

          {players.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleExportBackup}
                title="Export campaign snapshot as JSON backup"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Backup</span>
              </button>

              <button
                type="button"
                onClick={handleClearMemory}
                title="Clear saved memory and return to clean Awaiting Save state"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-red-400 bg-slate-800/80 hover:bg-red-950/40 border border-slate-700/80 hover:border-red-800/50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => backupFileInputRef.current?.click()}
              title="Restore previous campaign from a JSON backup file"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Restore Backup</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              setActiveTab(activeTab === 'squad' ? 'sync' : 'squad')
            }
            className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5" />
            {activeTab === 'squad' ? 'Back to Analyst Chat' : `Inspect ${players.length}-Man Squad`}
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-8 space-y-8">
        {/* Executive Club & Save Baseline Strip */}
        <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {hydratedFmSave
                    ? `${hydratedFmSave.decodedPayload.meta.clubName} (${hydratedFmSave.decodedPayload.meta.game} Build ${hydratedFmSave.decodedPayload.meta.build})`
                    : 'Football Manager 27 · Local Browser Engine'}
                </span>
                <span>&middot;</span>
                <span>
                  Save Date:{' '}
                  <span className="font-mono font-semibold text-slate-900 dark:text-emerald-300">
                    {saveDate}
                  </span>
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded border ${
                    hydratedFmSave
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {hydratedFmSave
                    ? `LIVE .FM SYNCED (${hydratedFmSave.decodedPayload.meta.fileName || hydratedFmSave.decodedPayload.meta.saveName || '.fm'})`
                    : 'AWAITING .FM SAVE — DROP .FM SAVE TO SYNC'}
                </span>

                {isRestoredFromMemory && players.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                    <Database className="w-3 h-3 text-blue-400" />
                    PERSISTENT MEMORY ACTIVE
                  </span>
                )}
              </div>
              <h1 className="fm-font-display mt-0.5 text-[24px] sm:text-[28px] font-bold leading-[1.12] tracking-[-0.5px] text-[#faf5fc] truncate">
                {currentNav.label}
              </h1>
              <p className="mt-0.5 text-[12px] text-[#b2acbb] truncate">{currentNav.description}</p>
            </div>

            {currentNav.hasFilter && snapshot.metadata.status === 'loaded' && (
              <button
                type="button"
                onClick={() => setFilterModalOpen(true)}
                className={`inline-flex h-[36px] min-w-[94px] shrink-0 items-center justify-center gap-2 rounded-[5px] border px-3.5 text-[12.5px] font-semibold transition-colors cursor-pointer ${
                  isCurrentFilterActive
                    ? 'border-[#dc87ff] bg-[#34223f] text-[#e4adff]'
                    : 'border-[#766b7c] bg-[#302a34] text-[#f0edf4] hover:border-[#dc87ff] hover:bg-[#3a2c43]'
                }`}
              >
                <Filter className="h-3.5 w-3.5" />
                <span>{isCurrentFilterActive ? 'Filter active' : 'Filter'}</span>
              </button>
            )}

            {activeTab === 'fixtures' && snapshot.fixtures.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPendingAiPrompt('/opposition');
                  setActiveTab('ai');
                }}
                className="inline-flex h-[36px] shrink-0 items-center gap-2 rounded-[5px] bg-[#850be3] px-4 text-[12.5px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
              >
                <Sparkles className="h-4 w-4" />
                <span>Scout next opponent</span>
              </button>
            )}
          </div>

          {/* Active Workspace Content */}
          <div
            className={`min-h-0 flex-1 overflow-hidden ${
              isAiOrSyncTab ? '' : 'px-4 sm:px-6 pb-3'
            }`}
          >
            {activeTab === 'overview' && (
              <OverviewDashboard
                snapshot={snapshot}
                aiContext={aiContext}
                settings={settings}
                onOpenLoadSave={() => setLoadSaveOpen(true)}
                onNavigateTab={setActiveTab}
                onSelectPlayer={(pid) => {
                  const found = snapshot.players.find((p) => p.id === pid);
                  if (found) setSelectedPlayer(found);
                }}
              />
            )}

            {activeTab === 'players' && (
              <PlayersWorkspace
                players={filteredPlayers}
                totalPlayersInSnapshot={snapshot.players.length}
                managedClubName={aiContext.managedClubName || snapshot.metadata.managedClubName}
                saveStatus={snapshot.metadata.status}
                settings={settings}
                onSelectPlayer={(p) => setSelectedPlayer(p)}
                onOpenLoadSave={() => setLoadSaveOpen(true)}
              />
            )}

            {activeTab === 'tactics' && (
              <TacticsAndLoadView
                saveStatus={snapshot.metadata.status}
                tactics={combinedTactics}
                activeTacticId={aiContext.activeTacticId}
                players={snapshot.players}
                managedClubName={aiContext.managedClubName || snapshot.metadata.managedClubName}
                onSelectActiveTactic={(tacticId) =>
                  void handleUpdateContext({ activeTacticId: tacticId, includeTactic: true })
                }
                onAddTactic={handleAddTactic}
                onOpenLoadSave={() => setLoadSaveOpen(true)}
                onSelectPlayer={(p) => setSelectedPlayer(p)}
              />
            )}

            {activeTab === 'matches' && (
              <MatchLogArchive
                matches={snapshot.matchLogs}
                saveStatus={snapshot.metadata.status}
                saveLabel={snapshot.metadata.sourceLabel}
                leagueStanding={snapshot.leagueStanding}
                onOpenLoadSave={() => setLoadSaveOpen(true)}
                onOpenSync={() => setActiveTab('sync')}
              />
            )}

            {activeTab === 'staff' && (
              <DataTable
                rows={filteredStaff}
                columns={staffColumns}
                rowKey={(s) => s.id}
                defaultSortKey="name"
                onRowClick={(s) => setSelectedStaff(s)}
                emptyMessage={
                  snapshot.metadata.status === 'awaiting_save'
                    ? 'Awaiting .fm Save — load your save to inspect backroom staff and 9-role coaching ratings.'
                    : 'No staff members match the current filters.'
                }
                emptyAction={awaitingEmptyAction}
              />
            )}

            {activeTab === 'clubs' && (
              <DataTable
                rows={filteredClubs}
                columns={clubColumns}
                rowKey={(c) => c.id}
                defaultSortKey="reputation"
                defaultSortDir="desc"
                onRowClick={(club) => setSelectedClub({ club, tab: 'overview' })}
                emptyMessage={
                  snapshot.metadata.status === 'awaiting_save'
                    ? 'Awaiting .fm Save — load your save to inspect clubs, finances, and facilities.'
                    : 'No clubs match the current filters.'
                }
                emptyAction={awaitingEmptyAction}
              />
            )}

            {activeTab === 'competitions' && (
              <DataTable
                rows={filteredCompetitions}
                columns={competitionColumns}
                rowKey={(c) => c.id}
                defaultSortKey="reputation"
                defaultSortDir="desc"
                emptyMessage={
                  snapshot.metadata.status === 'awaiting_save'
                    ? 'Awaiting .fm Save — load your save to inspect competitions.'
                    : 'No competitions match the current filters.'
                }
                emptyAction={awaitingEmptyAction}
              />
            )}

            {activeTab === 'fixtures' && (
              <DataTable
                rows={snapshot.fixtures}
                columns={fixtureColumns}
                rowKey={(f) => f.id}
                defaultSortKey="date"
                defaultSortDir="asc"
                emptyMessage={
                  snapshot.metadata.status === 'awaiting_save'
                    ? 'Awaiting .fm Save — load your save to view your upcoming & played schedule.'
                    : 'No fixtures decoded in this save snapshot.'
                }
                emptyAction={awaitingEmptyAction}
              />
            )}

            {activeTab === 'recruitment' && (
              <RecruitmentView
                cases={recruitmentCases}
                shortlists={shortlists}
                gameDate={snapshot.metadata.gameDate}
                players={snapshot.players}
                prefillPlayer={prefillRecruitmentPlayer}
                onClearPrefill={() => setPrefillRecruitmentPlayer(null)}
                onCreateCase={handleCreateRecruitment}
                onUpdateCase={handleUpdateRecruitment}
                onDeleteCase={handleDeleteRecruitment}
                onClearExpired={handleClearExpiredRecruitment}
                onCreateShortlist={handleCreateShortlist}
                onDeleteShortlist={handleDeleteShortlist}
                onSelectPlayer={(pid) => {
                  const found = snapshot.players.find((p) => p.id === pid);
                  if (found) setSelectedPlayer(found);
                }}
              />
            )}

            {activeTab === 'playbook' && <PlaybookReferenceView players={snapshot.players} />}

            {/* Keep AI & Sync Workspace permanently mounted to preserve conversations & Google OAuth across tab switches */}
            <div className={isAiOrSyncTab ? 'h-full min-h-0' : 'hidden'}>
              <AiAndSyncWorkspace
                mode={activeTab === 'sync' ? 'sync' : 'ai'}
                snapshot={snapshot}
                aiContext={aiContext}
                clubs={snapshot.clubs}
                players={snapshot.players}
                shortlists={shortlists}
                pendingPrompt={pendingAiPrompt}
                onConsumePendingPrompt={() => setPendingAiPrompt(null)}
                onApplyImportedSave={handleApplyImportedSave}
                onUpdateContext={handleUpdateContext}
                onAddTactic={handleAddTactic}
                onCreateShortlist={handleCreateShortlist}
                onDeleteShortlist={handleDeleteShortlist}
                onShortlistCreatedFromAi={(sl) =>
                  setShortlists((prev) => [sl, ...prev.filter((s) => s.id !== sl.id)])
                }
                onAddMatchLog={handleAddMatchLog}
                onSelectPlayer={(p) => setSelectedPlayer(p)}
              />
            </div>
          </div>

          {/* Workspace Footer */}
          <footer className="flex h-[34px] shrink-0 items-center justify-between gap-4 border-t border-white/[0.05] bg-[#100d15]/75 px-5 text-[10.5px] text-[#b8adbf]">
            <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-[#d4ced8] truncate">
              <span
                className={`h-[6px] w-[6px] shrink-0 rounded-full ${
                  snapshot.metadata.status === 'loaded' ? 'bg-emerald-400' : 'bg-[#dc87ff]'
                }`}
              />
              <span className="truncate">
                {snapshot.metadata.sourceLabel}
                {snapshot.metadata.gameDateDmy || snapshot.metadata.gameDate
                  ? ` (${snapshot.metadata.gameDateDmy || snapshot.metadata.gameDate})`
                  : ''}
              </span>
            </span>
            <span className="hidden sm:inline truncate text-[11px] text-[#b2acbb]" data-testid="footer-status">
              {footerStatusText}
            </span>
          </footer>
        </main>
      </div>

      {/* Detail & Filter Modals */}
      {selectedPlayer && (
        <PlayerDetailModal
          key={selectedPlayer.id}
          player={selectedPlayer}
          settings={settings}
          shortlists={shortlists}
          onClose={() => setSelectedPlayer(null)}
          onAddRecruitment={(p) => {
            setPrefillRecruitmentPlayer(p);
            setActiveTab('recruitment');
          }}
          onAddToShortlist={(slId, pid) => void handleAddPlayerToShortlist(slId, pid)}
        />
      )}

      {selectedStaff && (
        <StaffDetailModal
          key={selectedStaff.id}
          staff={selectedStaff}
          settings={settings}
          onClose={() => setSelectedStaff(null)}
        />
      )}

      {selectedClub && (
        <ClubDetailModal
          key={selectedClub.club.id}
          club={selectedClub.club}
          initialTab={selectedClub.tab}
          squadPlayers={snapshot.players.filter(
            (p) =>
              p.playingClub.toLowerCase() === selectedClub.club.name.toLowerCase() ||
              p.club.toLowerCase() === selectedClub.club.name.toLowerCase(),
          )}
          settings={settings}
          onSelectPlayer={(p) => setSelectedPlayer(p)}
          onClose={() => setSelectedClub(null)}
        />
      )}

      {filterModalOpen && activeTab === 'players' && (
        <PlayerFilterModal
          open={filterModalOpen}
          initialCriteria={playerFilter}
          savedSets={savedFilterSets}
          nations={distinctPlayerNations}
          competitions={distinctPlayerComps}
          clubs={distinctPlayerClubs}
          onSaveSet={(name, criteria) =>
            setSavedFilterSets((prev) => [
              ...prev,
              { id: `set-${Date.now()}`, name, criteria },
            ])
          }
          onDeleteSet={(id) =>
            setSavedFilterSets((prev) => prev.filter((s) => s.id !== id))
          }
          onApply={setPlayerFilter}
          onClose={() => setFilterModalOpen(false)}
        />
      )}

      {filterModalOpen && activeTab === 'staff' && (
        <StaffFilterModal
          open={filterModalOpen}
          initial={staffFilter}
          jobs={distinctStaffJobs}
          clubs={distinctStaffClubs}
          nations={distinctStaffNations}
          onApply={setStaffFilter}
          onClose={() => setFilterModalOpen(false)}
        />
      )}

      {filterModalOpen && activeTab === 'clubs' && (
        <ClubFilterModal
          open={filterModalOpen}
          initial={clubFilter}
          nations={distinctClubNations}
          competitions={distinctClubComps}
          onApply={setClubFilter}
          onClose={() => setFilterModalOpen(false)}
        />
      )}

      {filterModalOpen && activeTab === 'competitions' && (
        <CompetitionFilterModal
          open={filterModalOpen}
          initial={compFilter}
          nations={distinctCompNations}
          onApply={setCompFilter}
          onClose={() => setFilterModalOpen(false)}
        />
      )}

      <LoadSaveModal
        open={loadSaveOpen}
        currentSnapshot={snapshot}
        managedClubName={aiContext.managedClubName || snapshot.metadata.managedClubName}
        onApplyImportedSave={handleApplyImportedSave}
        onResetWorkspace={handleResetWorkspace}
        onClose={() => setLoadSaveOpen(false)}
      />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        managedClubName={aiContext.managedClubName || snapshot.metadata.managedClubName}
        clubs={snapshot.clubs}
        snapshot={snapshot}
        onUpdateSettings={setSettings}
        onChangeManagedClub={(clubName) =>
          void handleUpdateContext({ managedClubName: clubName, includeManagedClub: true })
        }
        onImportSnapshot={(snap) =>
          void handleApplyImportedSave({
            snapshot: snap,
            managedClubName: snap.metadata?.managedClubName ?? snap.clubs[0]?.name ?? null,
          })
        }
        onOpenLoadSave={() => setLoadSaveOpen(true)}
        onClose={() => setSettingsOpen(false)}
      />

      <LoadingSnapshotModal open={isLoadingSnapshot} phase={loadingPhase} />
    </div>
  );
}

export default App;
