import React, { useState } from 'react';
import {
  Bookmark,
  Briefcase,
  FolderPlus,
  Plus,
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
  onAddCase: (entry: Omit<RecruitmentCase, 'id' | 'updatedAt'>) => void;
  onUpdateCase: (id: string, patch: Partial<RecruitmentCase>) => void;
  onDeleteCase: (id: string) => void;
  onCreateShortlist: (name: string, description: string) => void;
  onDeleteShortlist: (id: string) => void;
  onRemoveFromShortlist: (shortlistId: string, playerId: string) => void;
  onSelectPlayer: (player: PlayerRecord) => void;
}

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

export const RecruitmentWorkspace: React.FC<RecruitmentWorkspaceProps> = ({
  cases,
  shortlists,
  players,
  saveDate,
  onAddCase,
  onUpdateCase,
  onDeleteCase,
  onCreateShortlist,
  onDeleteShortlist,
  onRemoveFromShortlist,
  onSelectPlayer,
}) => {
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-emerald-400" />
            Recruitment Pipeline &amp; Transfer Shortlists
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Track transfer targets, FM27 IP/OOP tactical fit, SCR wage ceilings, and custom shortlists · Save Date: {saveDate}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3.5 py-2 text-xs font-bold text-slate-950 transition"
        >
          <UserPlus className="h-4 w-4" />
          {showAddForm ? 'Cancel' : 'Add Recruitment Target'}
        </button>
      </div>

      {/* Add Target Form */}
      {showAddForm && (
        <form
          onSubmit={handleSubmitCase}
          className="rounded-2xl border border-emerald-500/30 bg-slate-900/90 p-5 space-y-4"
        >
          <h3 className="text-sm font-bold text-emerald-300">
            New Recruitment Target
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
              placeholder="Target IP Role (e.g. Inside Forward)"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />
            <input
              value={targetOopRole}
              onChange={(e) => setTargetOopRole(e.target.value)}
              placeholder="Target OOP Role (e.g. Tracking Winger)"
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
              placeholder="Est. Fee (e.g. Free, £25K)"
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
              placeholder="Contract / Offer Expiry"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Scout / Tactical Effectiveness Notes"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-xs font-bold text-slate-950"
            >
              <Plus className="h-4 w-4" />
              Save Target
            </button>
          </div>
        </form>
      )}

      {/* Pipeline Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="border-b border-slate-800 px-5 py-3 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Active Recruitment Targets ({cases.length})
          </h3>
        </div>
        {cases.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            No active recruitment targets yet. Click{' '}
            <span className="text-emerald-300 font-semibold">Add Recruitment Target</span>{' '}
            above or click <span className="text-indigo-300 font-semibold">Track Target</span>{' '}
            inside any Player Detail modal.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/70 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Player</th>
                  <th className="px-4 py-2.5">Club / Pos</th>
                  <th className="px-4 py-2.5">Target IP / OOP</th>
                  <th className="px-4 py-2.5">Interest</th>
                  <th className="px-4 py-2.5">Stage</th>
                  <th className="px-4 py-2.5">Est. Fee / Wage</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {cases.map((c) => {
                  const linked = c.playerId
                    ? players.find((p) => p.id === c.playerId)
                    : undefined;
                  return (
                    <tr key={c.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-semibold text-white">
                        {linked ? (
                          <button
                            onClick={() => onSelectPlayer(linked)}
                            className="text-emerald-300 hover:underline text-left"
                          >
                            {c.playerName}
                          </button>
                        ) : (
                          c.playerName
                        )}
                        {c.notes && (
                          <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                            {c.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div>{c.currentClub}</div>
                        <div className="text-[11px] text-slate-400">
                          {c.position} {c.age ? `· Age ${c.age}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[11px]">
                        <div className="text-emerald-300">IP: {c.targetIpRole}</div>
                        <div className="text-sky-300">OOP: {c.targetOopRole}</div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={c.interest}
                          onChange={(e) =>
                            onUpdateCase(c.id, {
                              interest: e.target.value as InterestStatus,
                            })
                          }
                          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200"
                        >
                          {INTEREST_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
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
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-300">
                        <div>{c.estimatedFee}</div>
                        <div className="text-[11px] text-slate-400">
                          {c.estimatedWagePw ? `£${c.estimatedWagePw}/wk` : '--'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => onDeleteCase(c.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-400"
                          title="Remove target"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Custom Shortlists */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-amber-400" />
            Custom Shortlists ({shortlists.length})
          </h3>
          <form onSubmit={handleCreateShortlist} className="flex flex-wrap gap-2">
            <input
              value={newShortlistName}
              onChange={(e) => setNewShortlistName(e.target.value)}
              placeholder="New shortlist name (e.g. U21 Wingers)"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
            />
            <input
              value={newShortlistDesc}
              onChange={(e) => setNewShortlistDesc(e.target.value)}
              placeholder="Short description"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-300"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              Create Shortlist
            </button>
          </form>
        </div>

        {shortlists.length === 0 ? (
          <p className="text-xs text-slate-400">
            Create a shortlist above to group players from your squad or scouting targets.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shortlists.map((sl) => {
              const linkedPlayers = sl.playerIds
                .map((pid) => players.find((p) => p.id === pid))
                .filter((p): p is PlayerRecord => Boolean(p));
              return (
                <div
                  key={sl.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white">{sl.name}</h4>
                      {sl.description && (
                        <p className="text-[11px] text-slate-400">{sl.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => onDeleteShortlist(sl.id)}
                      className="text-slate-500 hover:text-rose-400"
                      title="Delete shortlist"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {linkedPlayers.length === 0 ? (
                    <p className="text-[11px] text-slate-500 italic">
                      No players assigned yet — open any player in Squad Analytics to add them here.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {linkedPlayers.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-xs"
                        >
                          <button
                            onClick={() => onSelectPlayer(p)}
                            className="text-left hover:text-emerald-300 transition"
                          >
                            <span className="font-semibold text-slate-100">{p.name}</span>{' '}
                            <span className="text-[11px] text-slate-400">
                              ({p.position} · {p.ability.toFixed(1)}★)
                            </span>
                          </button>
                          <button
                            onClick={() => onRemoveFromShortlist(sl.id, p.id)}
                            className="text-[11px] text-slate-500 hover:text-rose-400"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
