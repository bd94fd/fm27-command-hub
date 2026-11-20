import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Briefcase,
  CalendarClock,
  FolderPlus,
  Layers,
  Plus,
  PoundSterling,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  DealStage,
  InterestStatus,
  PlayerRecord,
  RecruitmentCase,
  ShortlistRecord,
} from '../types/fm27';

interface RecruitmentWorkspaceProps {
  cases: RecruitmentCase[];
  shortlists: ShortlistRecord[];
  players: PlayerRecord[];
  saveDate: string;
  wageSpend?: string;
  balance?: string;
  clubName?: string;
  onAddCase: (entry: Omit<RecruitmentCase, 'id' | 'updatedAt'>) => void;
  onUpdateCase: (id: string, patch: Partial<RecruitmentCase>) => void;
  onDeleteCase: (id: string) => void;
  onCreateShortlist: (name: string, description: string) => void;
  onDeleteShortlist: (id: string) => void;
  onRemoveFromShortlist: (shortlistId: string, playerId: string) => void;
  onSelectPlayer: (player: PlayerRecord) => void;
}

type AuditSubTab = 'contracts' | 'wages' | 'depth' | 'targets';

const INTEREST_OPTIONS: InterestStatus[] = [
  'Extremely Interested',
  'Very Interested',
  'Interested',
  'Unsure',
  'Dubious',
  'No Interest',
];

const STAGE_OPTIONS: DealStage[] = [
  'Scouted',
  'Shortlisted',
  'Agent Enquiry',
  'Bid Submitted',
  'Contract Talks',
  'Agreed',
  'Rejected',
];

function parseDateDmyOrIso(raw: string): Date | null {
  const s = (raw || '').trim();
  if (!s || s === 'N/A' || s === '--') return null;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  const yearOnly = s.match(/\b(20\d{2})\b/);
  if (yearOnly) {
    return new Date(Number(yearOnly[1]), 5, 30);
  }
  return null;
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth())
  );
}

interface DepthBucket {
  code: string;
  label: string;
  idealMin: number;
  idealMax: number;
  players: PlayerRecord[];
}

function matchesBucket(p: PlayerRecord, code: string): boolean {
  const pr = p.positionRatings;
  if (pr && Object.values(pr).some((v) => typeof v === 'number' && v > 1)) {
    const lower: Record<string, number> = {};
    for (const [k, v] of Object.entries(pr)) {
      if (typeof v === 'number') lower[k.toLowerCase()] = v;
    }
    const maxOf = (...keys: string[]) =>
      Math.max(0, ...keys.map((k) => lower[k] || 0));
    switch (code) {
      case 'GK':
        return maxOf('gk') >= 15;
      case 'CB':
        return maxOf('dc', 'cb') >= 15;
      case 'RB':
        return maxOf('dr', 'rb', 'wbr') >= 15;
      case 'LB':
        return maxOf('dl', 'lb', 'wbl') >= 15;
      case 'DM':
        return maxOf('dm') >= 15;
      case 'CM':
        return maxOf('mc', 'cm', 'amc') >= 15;
      case 'W':
        return maxOf('amr', 'aml', 'mr', 'ml', 'rw', 'lw') >= 15;
      case 'ST':
        return maxOf('st', 'stc') >= 15;
    }
  }
  const pos = (p.position || '').toUpperCase();
  switch (code) {
    case 'GK':
      return pos.includes('GK');
    case 'CB':
      return /\bD\s*\([RLC]*C[RLC]*\)|DC|CB/.test(pos);
    case 'RB':
      return /\b(D|WB)\s*\([RLC]*R[RLC]*\)|DR|WBR/.test(pos);
    case 'LB':
      return /\b(D|WB)\s*\([RLC]*L[RLC]*\)|DL|WBL/.test(pos);
    case 'DM':
      return pos.includes('DM');
    case 'CM':
      return /\b(M|AM)\s*\([RLC]*C|MC|AMC/.test(pos);
    case 'W':
      return /\b(M|AM)\s*\([RLC]*[RL][RLC]*\)|AMR|AML|MR|ML|RW|LW/.test(pos);
    case 'ST':
      return pos.includes('ST');
    default:
      return false;
  }
}

export const RecruitmentWorkspace: React.FC<RecruitmentWorkspaceProps> = ({
  cases,
  shortlists,
  players,
  saveDate,
  wageSpend = '--',
  balance = '--',
  clubName,
  onAddCase,
  onUpdateCase,
  onDeleteCase,
  onCreateShortlist,
  onDeleteShortlist,
  onRemoveFromShortlist,
  onSelectPlayer,
}) => {
  const [subTab, setSubTab] = useState<AuditSubTab>('contracts');
  const [showAddForm, setShowAddForm] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [position, setPosition] = useState('');
  const [age, setAge] = useState('');
  const [currentClub, setCurrentClub] = useState('');
  const [targetIpRole, setTargetIpRole] = useState('');
  const [targetOopRole, setTargetOopRole] = useState('');
  const [interest, setInterest] = useState<InterestStatus>('Interested');
  const [stage, setStage] = useState<DealStage>('Scouted');
  const [estimatedFee, setEstimatedFee] = useState('');
  const [estimatedWagePw, setEstimatedWagePw] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [notes, setNotes] = useState('');

  const [newShortlistName, setNewShortlistName] = useState('');
  const [newShortlistDesc, setNewShortlistDesc] = useState('');

  const refDate = useMemo(
    () => parseDateDmyOrIso(saveDate) || new Date(2027, 8, 15),
    [saveDate]
  );

  // 1. Contract Expiry Watchlist (sorted soonest first)
  const contractAudit = useMemo(() => {
    return players
      .map((p) => {
        const expDate = parseDateDmyOrIso(p.expires);
        const monthsLeft = expDate ? monthsBetween(refDate, expDate) : null;
        let recommendation: 'Priority Renew' | 'Evaluate' | 'Let Expire / Sell' =
          'Evaluate';
        if (
          (p.ability >= 3.5 || p.minutes >= 180 || (p.age <= 21 && p.potential >= 3.5)) &&
          p.status !== 'Surplus'
        ) {
          recommendation = 'Priority Renew';
        } else if (
          p.status === 'Surplus' ||
          (p.minutes < 60 && p.age >= 24) ||
          (p.ability <= 2.0 && p.age >= 23)
        ) {
          recommendation = 'Let Expire / Sell';
        }
        return { player: p, monthsLeft, recommendation };
      })
      .sort((a, b) => {
        const am = a.monthsLeft ?? 999;
        const bm = b.monthsLeft ?? 999;
        if (am !== bm) return am - bm;
        return (b.player.wagePw || 0) - (a.player.wagePw || 0);
      });
  }, [players, refDate]);

  const expiringWithin12m = useMemo(
    () =>
      contractAudit.filter(
        (c) => c.monthsLeft !== null && c.monthsLeft <= 12
      ),
    [contractAudit]
  );

  // 2. Wage & Value Audit (sorted highest wage first)
  const wageAudit = useMemo(() => {
    const totalWage = players.reduce((sum, p) => sum + (p.wagePw || 0), 0);
    const ranked = [...players]
      .sort((a, b) => (b.wagePw || 0) - (a.wagePw || 0))
      .map((p) => {
        const isDeadwood =
          (p.wagePw || 0) >= 200 && p.minutes < 90 && p.status !== 'Injured';
        const isBargain =
          p.minutes >= 180 && (p.wagePw || 0) <= 250 && p.ability >= 3.0;
        const tag = isDeadwood
          ? 'Review / Sell or Loan'
          : isBargain
            ? 'High-Value Starter'
            : p.status === 'Youth'
              ? 'Youth Wage'
              : 'Fair Value';
        return { player: p, tag, isDeadwood, isBargain };
      });
    const potentialSavings = ranked
      .filter((r) => r.isDeadwood)
      .reduce((sum, r) => sum + (r.player.wagePw || 0), 0);
    return { totalWage, ranked, potentialSavings };
  }, [players]);

  // 3. 4-3-3 Positional Depth Matrix
  const depthBuckets: DepthBucket[] = useMemo(() => {
    const defs = [
      { code: 'GK', label: 'Goalkeepers', idealMin: 2, idealMax: 3 },
      { code: 'RB', label: 'Right-Backs', idealMin: 2, idealMax: 3 },
      { code: 'CB', label: 'Centre-Backs', idealMin: 4, idealMax: 5 },
      { code: 'LB', label: 'Left-Backs', idealMin: 2, idealMax: 3 },
      { code: 'DM', label: 'Defensive Mids', idealMin: 2, idealMax: 3 },
      { code: 'CM', label: 'Central Mids', idealMin: 4, idealMax: 6 },
      { code: 'W', label: 'Wingers / IFs', idealMin: 4, idealMax: 6 },
      { code: 'ST', label: 'Strikers', idealMin: 2, idealMax: 4 },
    ];
    return defs.map((d) => ({
      ...d,
      players: players
        .filter((p) => matchesBucket(p, d.code))
        .sort((a, b) => (b.ability || 0) - (a.ability || 0)),
    }));
  }, [players]);

  const handleQuickFlagPlayer = (
    p: PlayerRecord,
    actionLabel: 'Renewal Talk' | 'Transfer List / Sell' | 'Loan Out'
  ) => {
    const exists = cases.some(
      (c) =>
        c.playerId === p.id ||
        c.playerName.toLowerCase() === p.name.toLowerCase()
    );
    if (!exists) {
      onAddCase({
        playerId: p.id,
        playerName: p.name,
        position: p.position,
        age: p.age,
        currentClub: clubName || 'Managed Squad',
        targetIpRole: p.ipRole,
        targetOopRole: p.oopRole,
        interest: 'Interested',
        stage: actionLabel === 'Renewal Talk' ? 'Contract Talks' : 'Shortlisted',
        estimatedFee: actionLabel,
        estimatedWagePw: p.wagePw,
        expiresOn: p.expires,
        notes: `${actionLabel} · £${p.wagePw}/wk · ${p.minutes}m played · ${p.ability.toFixed(1)}★`,
      });
    }
    setSubTab('targets');
  };

  const handleSubmitCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    onAddCase({
      playerName: playerName.trim(),
      position: position.trim() || 'UTL',
      age: age ? Number(age) : null,
      currentClub: currentClub.trim() || 'Unknown',
      targetIpRole: targetIpRole.trim() || '--',
      targetOopRole: targetOopRole.trim() || '--',
      interest,
      stage,
      estimatedFee: estimatedFee.trim() || 'Free / TBC',
      estimatedWagePw: estimatedWagePw ? Number(estimatedWagePw) : null,
      expiresOn: expiresOn.trim() || '--',
      notes: notes.trim(),
    });
    setPlayerName('');
    setPosition('');
    setAge('');
    setCurrentClub('');
    setTargetIpRole('');
    setTargetOopRole('');
    setEstimatedFee('');
    setEstimatedWagePw('');
    setExpiresOn('');
    setNotes('');
    setShowAddForm(false);
  };

  const handleCreateShortlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShortlistName.trim()) return;
    onCreateShortlist(newShortlistName.trim(), newShortlistDesc.trim());
    setNewShortlistName('');
    setNewShortlistDesc('');
  };

  return (
    <div className="space-y-4">
      {/* Header & Executive Audit KPIs */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-emerald-400" />
              Transfers, Contracts &amp; Squad Audit
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live contract expiries, wage efficiency, 4-3-3 positional depth &amp; transfer tracker · {saveDate}
            </p>
          </div>
          <button
            onClick={() => {
              setSubTab('targets');
              setShowAddForm((prev) => !prev);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 text-xs font-bold text-slate-950 transition"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Transfer Target
          </button>
        </div>

        {/* 4 Compact Audit Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[11px] text-slate-400">Wage Spend / Budget</div>
            <div className="text-sm sm:text-base font-bold font-mono text-white mt-0.5 truncate">
              {wageSpend}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Bal: {balance}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[11px] text-slate-400">Expiring (&le;12m)</div>
            <div className="text-sm sm:text-base font-bold font-mono text-amber-400 mt-0.5">
              {players.length > 0 ? `${expiringWithin12m.length} Players` : '--'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {expiringWithin12m.filter((c) => c.recommendation === 'Priority Renew').length} priority renewals
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[11px] text-slate-400">Potential Wage Savings</div>
            <div className="text-sm sm:text-base font-bold font-mono text-emerald-400 mt-0.5">
              {players.length > 0 ? `£${wageAudit.potentialSavings.toLocaleString()}/wk` : '--'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Low-mins earners (&lt;90m)
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[11px] text-slate-400">Thin 4-3-3 Spots</div>
            <div className="text-sm sm:text-base font-bold font-mono text-sky-300 mt-0.5">
              {players.length > 0
                ? depthBuckets
                    .filter((b) => b.players.length < b.idealMin)
                    .map((b) => b.code)
                    .join(', ') || 'None'
                : '--'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {cases.length} tracked deals
            </div>
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
          {(
            [
              {
                id: 'contracts',
                label: `Contracts (${expiringWithin12m.length})`,
                icon: CalendarClock,
              },
              { id: 'wages', label: 'Wage Audit', icon: PoundSterling },
              { id: 'depth', label: 'Depth & Needs', icon: Layers },
              { id: 'targets', label: `Deals (${cases.length})`, icon: Bookmark },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  subTab === t.id
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-950/70 text-slate-400 border border-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* SUB-TAB 1: CONTRACT EXPIRY WATCHLIST */}
      {subTab === 'contracts' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Contract Expiry Audit (Soonest First)
            </h3>
            <span className="text-[11px] text-slate-400">
              Tap any player to inspect profile
            </span>
          </div>
          {players.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              Awaiting .fm Save — upload your save in <strong>Analyst</strong> to audit contract expiries.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {contractAudit.slice(0, 25).map(({ player: p, monthsLeft, recommendation }) => (
                <div
                  key={p.id}
                  className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-800/40"
                >
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(p)}
                    className="text-left min-w-0 flex-1"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-white hover:text-emerald-300">
                        {p.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {p.position}
                      </span>
                      <span className="text-[10px] font-mono text-amber-300">
                        {p.ability.toFixed(1)}★/{p.potential.toFixed(1)}★
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Expires <span className="font-mono text-slate-200">{p.expires}</span>
                      {monthsLeft !== null ? ` (${monthsLeft}m left)` : ''} · £{p.wagePw}/wk · {p.minutes}m · Age {p.age}
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        recommendation === 'Priority Renew'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : recommendation === 'Let Expire / Sell'
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {recommendation}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickFlagPlayer(
                          p,
                          recommendation === 'Priority Renew'
                            ? 'Renewal Talk'
                            : 'Transfer List / Sell'
                        )
                      }
                      className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2 py-1 text-[10px] font-medium text-slate-200"
                    >
                      + Track
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: WAGE & VALUE AUDIT */}
      {subTab === 'wages' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Wage Efficiency &amp; Deadwood Audit (Highest Earners First)
            </h3>
            <span className="text-[11px] font-mono text-emerald-400">
              Total: £{wageAudit.totalWage.toLocaleString()}/wk
            </span>
          </div>
          {players.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              Awaiting .fm Save — upload your save in <strong>Analyst</strong> to run the wage audit.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {wageAudit.ranked.slice(0, 25).map(({ player: p, tag, isDeadwood, isBargain }) => (
                <div
                  key={p.id}
                  className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-800/40"
                >
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(p)}
                    className="text-left min-w-0 flex-1"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-white hover:text-emerald-300">
                        {p.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        ({p.position} · Age {p.age})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      <span className="font-mono font-semibold text-white">
                        £{p.wagePw.toLocaleString()}/wk
                      </span>{' '}
                      · {p.minutes}m played · {p.ability.toFixed(1)}★ · Exp {p.expires}
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        isDeadwood
                          ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          : isBargain
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {tag}
                    </span>
                    {isDeadwood && (
                      <button
                        type="button"
                        onClick={() =>
                          handleQuickFlagPlayer(p, 'Transfer List / Sell')
                        }
                        className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-2 py-1 text-[10px] font-semibold text-rose-300"
                      >
                        Flag Sale
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: 4-3-3 POSITIONAL DEPTH & TRANSFER NEEDS */}
      {subTab === 'depth' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {depthBuckets.map((b) => {
            const isThin = players.length > 0 && b.players.length < b.idealMin;
            const isOver = players.length > 0 && b.players.length > b.idealMax;
            return (
              <div
                key={b.code}
                className={`rounded-2xl border p-4 space-y-2.5 ${
                  isThin
                    ? 'border-rose-500/40 bg-rose-950/20'
                    : isOver
                      ? 'border-amber-500/40 bg-amber-950/15'
                      : 'border-slate-800 bg-slate-900/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white">{b.label}</h4>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      isThin
                        ? 'bg-rose-500/20 text-rose-300'
                        : isOver
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                    }`}
                  >
                    {b.players.length} (Ideal {b.idealMin}–{b.idealMax})
                  </span>
                </div>
                {isThin && (
                  <div className="flex items-center gap-1 text-[11px] text-rose-300">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Transfer priority — reinforce
                  </div>
                )}
                {isOver && (
                  <div className="text-[11px] text-amber-300">
                    Overstocked — loan/sell surplus
                  </div>
                )}
                <div className="space-y-1">
                  {b.players.length === 0 ? (
                    <div className="text-[11px] text-slate-500 italic">
                      No natural/accomplished cover
                    </div>
                  ) : (
                    b.players.slice(0, 6).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectPlayer(p)}
                        className="w-full flex items-center justify-between rounded-lg bg-slate-950/70 border border-slate-800/80 px-2.5 py-1.5 text-[11px] hover:border-emerald-500/40 transition"
                      >
                        <span className="truncate text-slate-200 font-medium">
                          {p.name}
                        </span>
                        <span className="font-mono text-amber-300 shrink-0 ml-2">
                          {p.ability.toFixed(1)}★
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SUB-TAB 4: TRANSFER DEALS & SHORTLISTS */}
      {subTab === 'targets' && (
        <div className="space-y-4">
          {showAddForm && (
            <form
              onSubmit={handleSubmitCase}
              className="rounded-2xl border border-emerald-500/30 bg-slate-900/90 p-4 space-y-3"
            >
              <h3 className="text-sm font-bold text-emerald-300">
                New Transfer / Renewal Target
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <input
                  required
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Player Name *"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
                <input
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Position (e.g. D (C), AM (R))"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Age"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
                <input
                  value={currentClub}
                  onChange={(e) => setCurrentClub(e.target.value)}
                  placeholder="Current Club"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
                <input
                  value={targetIpRole}
                  onChange={(e) => setTargetIpRole(e.target.value)}
                  placeholder="Target IP Role"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
                <input
                  value={targetOopRole}
                  onChange={(e) => setTargetOopRole(e.target.value)}
                  placeholder="Target OOP Role"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
                <select
                  value={interest}
                  onChange={(e) => setInterest(e.target.value as InterestStatus)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  {INTEREST_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as DealStage)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  {STAGE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <input
                  value={estimatedFee}
                  onChange={(e) => setEstimatedFee(e.target.value)}
                  placeholder="Est. Fee / Action"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
                <input
                  type="number"
                  value={estimatedWagePw}
                  onChange={(e) => setEstimatedWagePw(e.target.value)}
                  placeholder="Est. Wage £/wk"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
                <input
                  value={expiresOn}
                  onChange={(e) => setExpiresOn(e.target.value)}
                  placeholder="Contract Expiry"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Save Deal
                </button>
              </div>
            </form>
          )}

          {/* Active Deals */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Tracked Transfers &amp; Renewals ({cases.length})
              </h3>
            </div>
            {cases.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No deals tracked yet. Tap <strong>+ Track</strong> on any player in the{' '}
                <strong>Contracts</strong> or <strong>Wage Audit</strong> tabs, or click{' '}
                <strong>Add Transfer Target</strong> above.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/70">
                {cases.map((c) => {
                  const linked = c.playerId
                    ? players.find((p) => p.id === c.playerId)
                    : undefined;
                  return (
                    <div
                      key={c.id}
                      className="px-4 py-3 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white">
                          {linked ? (
                            <button
                              type="button"
                              onClick={() => onSelectPlayer(linked)}
                              className="text-emerald-300 hover:underline"
                            >
                              {c.playerName}
                            </button>
                          ) : (
                            c.playerName
                          )}{' '}
                          <span className="font-normal text-slate-400">
                            · {c.position} · {c.estimatedFee}
                          </span>
                        </div>
                        {c.notes && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {c.notes}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={c.stage}
                          onChange={(e) =>
                            onUpdateCase(c.id, {
                              stage: e.target.value as DealStage,
                            })
                          }
                          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-emerald-300"
                        >
                          {STAGE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => onDeleteCase(c.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-rose-400"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Custom Shortlists */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Bookmark className="h-3.5 w-3.5 text-amber-400" />
              Shortlists ({shortlists.length})
            </h3>
            <form onSubmit={handleCreateShortlist} className="flex flex-wrap gap-2">
              <input
                value={newShortlistName}
                onChange={(e) => setNewShortlistName(e.target.value)}
                placeholder="Shortlist name (e.g. Summer Loans)"
                className="flex-1 min-w-[140px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
              />
              <input
                value={newShortlistDesc}
                onChange={(e) => setNewShortlistDesc(e.target.value)}
                placeholder="Note"
                className="flex-1 min-w-[120px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-300"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Create
              </button>
            </form>
            {shortlists.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {shortlists.map((sl) => {
                  const linkedPlayers = sl.playerIds
                    .map((pid) => players.find((p) => p.id === pid))
                    .filter((p): p is PlayerRecord => Boolean(p));
                  return (
                    <div
                      key={sl.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs font-bold text-white">{sl.name}</div>
                          {sl.description && (
                            <div className="text-[11px] text-slate-400">{sl.description}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteShortlist(sl.id)}
                          className="text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {linkedPlayers.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between text-xs bg-slate-900/70 rounded px-2 py-1"
                        >
                          <button
                            type="button"
                            onClick={() => onSelectPlayer(p)}
                            className="text-emerald-300 hover:underline"
                          >
                            {p.name} ({p.position})
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveFromShortlist(sl.id, p.id)}
                            className="text-[10px] text-slate-400 hover:text-rose-400"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
