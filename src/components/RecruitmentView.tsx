import { BookmarkPlus, List, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type {
  DealStage,
  InterestStatus,
  PlayerRecord,
  RecruitmentCase,
  ShortlistRecord,
} from '../domain/types';

interface RecruitmentViewProps {
  cases: RecruitmentCase[];
  shortlists: ShortlistRecord[];
  gameDate: string | null;
  players: PlayerRecord[];
  prefillPlayer: PlayerRecord | null;
  onClearPrefill: () => void;
  onCreateCase: (payload: Omit<RecruitmentCase, 'id'>) => Promise<void>;
  onUpdateCase: (id: string, patch: Partial<RecruitmentCase>) => Promise<void>;
  onDeleteCase: (id: string) => Promise<void>;
  onClearExpired: () => Promise<void>;
  onCreateShortlist: (name: string, notes: string, playerIds: number[]) => Promise<void>;
  onDeleteShortlist: (id: string) => Promise<void>;
  onSelectPlayer: (playerId: number) => void;
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

export function RecruitmentView({
  cases,
  shortlists,
  gameDate,
  players,
  prefillPlayer,
  onClearPrefill,
  onCreateCase,
  onUpdateCase,
  onDeleteCase,
  onClearExpired,
  onCreateShortlist,
  onDeleteShortlist,
  onSelectPlayer,
}: RecruitmentViewProps) {
  const [viewSection, setViewSection] = useState<'cases' | 'shortlists'>('cases');
  const [modalOpen, setModalOpen] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [club, setClub] = useState('');
  const [interestStatus, setInterestStatus] = useState<InterestStatus>('Interested');
  const [dealStage, setDealStage] = useState<DealStage>('Scouted');
  const [source, setSource] = useState('Scout Report');
  const [validUntil, setValidUntil] = useState(
    () => gameDate || new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const [newSlName, setNewSlName] = useState('');
  const [newSlNotes, setNewSlNotes] = useState('');

  const isDialogVisible = modalOpen || Boolean(prefillPlayer);
  const effectivePlayerName = prefillPlayer && !modalOpen ? prefillPlayer.name : playerName;
  const effectiveClub = prefillPlayer && !modalOpen ? prefillPlayer.club : club;
  const effectivePlayerId = prefillPlayer && !modalOpen ? prefillPlayer.id : playerId;

  const refDate = gameDate || new Date().toISOString().slice(0, 10);
  const activeCount = cases.filter((c) => c.validUntilGameDate >= refDate).length;
  const expiredCount = cases.length - activeCount;

  function openNewDialog() {
    onClearPrefill();
    setPlayerName('');
    setPlayerId(null);
    setClub('');
    setInterestStatus('Interested');
    setDealStage('Scouted');
    setSource('Scout Report');
    setValidUntil(refDate);
    setNotes('');
    setValidationError(null);
    setModalOpen(true);
  }

  function closeDialog() {
    setModalOpen(false);
    onClearPrefill();
    setValidationError(null);
  }

  function handleSelectExistingPlayer(rawId: string) {
    if (!rawId) return;
    const found = players.find((p) => p.id === Number(rawId));
    if (found) {
      setPlayerId(found.id);
      setPlayerName(found.name);
      setClub(found.club || 'Free Agent');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalName = effectivePlayerName.trim();
    if (!finalName) {
      setValidationError('Player name is required.');
      return;
    }
    await onCreateCase({
      playerId: effectivePlayerId,
      playerName: finalName,
      club: effectiveClub.trim() || 'Free Agent',
      interestStatus,
      dealStage,
      source: source.trim() || 'Scout Report',
      observedGameDate: refDate,
      validUntilGameDate: validUntil || refDate,
      notes: notes.trim(),
    });
    closeDialog();
  }

  async function handleCreateShortlistSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newSlName.trim()) return;
    await onCreateShortlist(newSlName.trim(), newSlNotes.trim(), []);
    setNewSlName('');
    setNewSlNotes('');
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-[5px] border border-[#39333f] bg-[#0e0c12] p-0.5">
            <button
              type="button"
              onClick={() => setViewSection('cases')}
              className={`inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-[12px] font-semibold cursor-pointer ${
                viewSection === 'cases'
                  ? 'bg-[#34223f] text-[#ecc2ff]'
                  : 'text-[#b2acbb] hover:text-white'
              }`}
            >
              <span>Recruitment Evidence ({cases.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewSection('shortlists')}
              className={`inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-[12px] font-semibold cursor-pointer ${
                viewSection === 'shortlists'
                  ? 'bg-[#34223f] text-[#ecc2ff]'
                  : 'text-[#b2acbb] hover:text-white'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Shortlists ({shortlists.length})</span>
            </button>
          </div>

          <span className="text-[12px] font-medium text-[#b2acbb]" data-testid="recruitment-summary">
            {activeCount} active · {expiredCount} expired
          </span>
        </div>

        {viewSection === 'cases' && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={openNewDialog}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-[5px] bg-[#850be3] px-3.5 text-[12px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add evidence</span>
            </button>
            <button
              type="button"
              onClick={() => void onClearExpired()}
              disabled={expiredCount === 0}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#241f2a] px-3.5 text-[12px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] disabled:opacity-45 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear expired</span>
            </button>
          </div>
        )}
      </div>

      {viewSection === 'cases' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[7px] border border-[#59515f] bg-[#100e14]">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="fm-grid-table w-full border-collapse text-[13px] text-[#f0edf4]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="h-[42px] px-3 text-left">Player</th>
                  <th className="h-[42px] px-3 text-left">Club</th>
                  <th className="h-[42px] px-3 text-left">Interest</th>
                  <th className="h-[42px] px-3 text-left">Stage</th>
                  <th className="h-[42px] px-3 text-left">Source</th>
                  <th className="h-[42px] px-3 text-left">Observed</th>
                  <th className="h-[42px] px-3 text-left">Valid until</th>
                  <th className="h-[42px] px-3 text-left">Status</th>
                  <th className="h-[42px] px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cases.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-[13px] text-[#b2acbb]">
                      No recruitment evidence recorded yet. Track targets from Squad &amp; Players
                      or click &ldquo;Add evidence&rdquo;.
                    </td>
                  </tr>
                ) : (
                  cases.map((item) => {
                    const isActive = item.validUntilGameDate >= refDate;
                    return (
                      <tr key={item.id} className="border-b border-white/[0.04]">
                        <td className="h-[40px] px-3 font-semibold text-[#faf5fc]">
                          {item.playerId ? (
                            <button
                              type="button"
                              onClick={() => onSelectPlayer(item.playerId!)}
                              className="text-left hover:text-[#dc87ff] hover:underline cursor-pointer"
                            >
                              {item.playerName}
                            </button>
                          ) : (
                            item.playerName
                          )}
                        </td>
                        <td className="h-[40px] px-3">{item.club}</td>
                        <td className="h-[40px] px-3">
                          <select
                            aria-label={`Interest for ${item.playerName}`}
                            value={item.interestStatus}
                            onChange={(e) =>
                              void onUpdateCase(item.id, {
                                interestStatus: e.target.value as InterestStatus,
                              })
                            }
                            className="h-[28px] rounded border border-[#473d50] bg-[#1a151e] px-2 text-[12px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
                          >
                            {INTEREST_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="h-[40px] px-3">
                          <select
                            aria-label={`Stage for ${item.playerName}`}
                            value={item.dealStage}
                            onChange={(e) =>
                              void onUpdateCase(item.id, {
                                dealStage: e.target.value as DealStage,
                              })
                            }
                            className="h-[28px] rounded border border-[#473d50] bg-[#1a151e] px-2 text-[12px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
                          >
                            {STAGE_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="h-[40px] px-3 text-[#d4ced8]">{item.source}</td>
                        <td className="h-[40px] px-3 tabular-nums text-[#b2acbb]">
                          {item.observedGameDate}
                        </td>
                        <td className="h-[40px] px-3 tabular-nums text-[#b2acbb]">
                          {item.validUntilGameDate}
                        </td>
                        <td className="h-[40px] px-3">
                          <span
                            className={`inline-flex rounded px-2 py-0.5 text-[11px] font-bold ${
                              isActive
                                ? 'bg-[#17372a] text-[#71e7a7]'
                                : 'bg-[#40212b] text-[#ff8fa2]'
                            }`}
                          >
                            {isActive ? 'Active' : 'Expired'}
                          </span>
                        </td>
                        <td className="h-[40px] px-3 text-right">
                          <button
                            type="button"
                            onClick={() => void onDeleteCase(item.id)}
                            aria-label={`Delete recruitment case for ${item.playerName}`}
                            className="rounded p-1.5 text-[#b2acbb] hover:bg-white/10 hover:text-[#ff758b] cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto space-y-4 pr-1">
          <form
            onSubmit={handleCreateShortlistSubmit}
            className="flex flex-wrap items-end gap-3 rounded-[7px] border border-[#39333f] bg-[#14111a] p-4"
          >
            <label className="flex min-w-[200px] flex-1 flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-[#b2acbb]">New shortlist name</span>
              <input
                type="text"
                value={newSlName}
                onChange={(e) => setNewSlName(e.target.value)}
                placeholder="e.g. U23 Tracking Wingers"
                className="h-[34px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[12.5px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
              />
            </label>
            <label className="flex min-w-[220px] flex-1 flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-[#b2acbb]">Notes</span>
              <input
                type="text"
                value={newSlNotes}
                onChange={(e) => setNewSlNotes(e.target.value)}
                placeholder="Wage / age / role criteria"
                className="h-[34px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[12.5px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={!newSlName.trim()}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-[5px] bg-[#850be3] px-4 text-[12px] font-semibold text-white hover:bg-[#9c2be4] disabled:opacity-45 cursor-pointer"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              <span>Create Shortlist</span>
            </button>
          </form>

          {shortlists.length === 0 ? (
            <div className="rounded-[7px] border border-[#39333f] bg-[#100e14] p-12 text-center text-[13px] text-[#b2acbb]">
              No shortlists created yet. Use <code className="text-[#dc87ff]">/recruit</code> in
              AI Assistant or create one above.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {shortlists.map((sl) => {
                const members = players.filter((p) => sl.playerIds.includes(p.id));
                return (
                  <div
                    key={sl.id}
                    className="rounded-[7px] border border-[#39333f] bg-[#14111a] p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-[#39333f] pb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="fm-font-display text-[15px] font-bold text-white">
                            {sl.name}
                          </h3>
                          <span className="rounded bg-[#34223f] px-2 py-0.5 text-[10.5px] font-bold text-[#dc87ff]">
                            {sl.createdBy}
                          </span>
                        </div>
                        {sl.notes && (
                          <p className="mt-1 text-[12px] text-[#b2acbb]">{sl.notes}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void onDeleteShortlist(sl.id)}
                        aria-label={`Delete shortlist ${sl.name}`}
                        className="rounded p-1.5 text-[#b2acbb] hover:bg-white/10 hover:text-[#ff758b] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {members.length === 0 ? (
                      <p className="text-[12px] text-[#9c92a6]">
                        {sl.playerIds.length > 0
                          ? `${sl.playerIds.length} player IDs saved (load matching save to view profiles).`
                          : 'No players added to this shortlist yet — open a player profile to add.'}
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {members.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => onSelectPlayer(m.id)}
                            className="flex w-full items-center justify-between rounded bg-[#1a1521] px-3 py-1.5 text-left text-[12px] hover:bg-[#2a2036] cursor-pointer"
                          >
                            <span className="font-semibold text-white">
                              {m.name}{' '}
                              <span className="font-normal text-[#9c92a6]">
                                ({m.club || 'Free Agent'} · {m.positionText})
                              </span>
                            </span>
                            <span className="font-mono text-[#ecc2ff]">
                              CA {m.ca ?? '--'} / PA {m.pa ?? '--'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Evidence Modal */}
      {isDialogVisible && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#040308]/75 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-recruitment-title"
        >
          <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-[540px] flex-col overflow-hidden rounded-[8px] border border-[#d0c6db]/25 bg-[#121116] shadow-[0_24px_64px_rgba(0,0,0,0.65)]"
          >
            <div className="flex h-[56px] items-center justify-between border-b border-[#39333f] bg-[#202128] px-6">
              <h2
                id="add-recruitment-title"
                className="fm-font-display text-[18px] font-bold text-[#f0edf4]"
              >
                Record recruitment evidence
              </h2>
              <button
                type="button"
                onClick={closeDialog}
                aria-label="Close recruitment modal"
                className="rounded p-1 text-[#b2acbb] hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4 p-6">
              {!prefillPlayer && players.length > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold text-[#b2acbb]">
                    Quick-pick from loaded players
                  </span>
                  <select
                    defaultValue=""
                    onChange={(e) => handleSelectExistingPlayer(e.target.value)}
                    className="h-[36px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
                  >
                    <option value="">Choose player (optional)…</option>
                    {players.slice(0, 200).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.club || 'Free Agent'} ({p.positionText})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold">Player name</span>
                  <input
                    type="text"
                    value={effectivePlayerName}
                    onChange={(e) => {
                      if (prefillPlayer) onClearPrefill();
                      setPlayerName(e.target.value);
                    }}
                    placeholder="Player name from save or scout report"
                    className="h-[36px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold">Club</span>
                  <input
                    type="text"
                    value={effectiveClub}
                    onChange={(e) => {
                      if (prefillPlayer) onClearPrefill();
                      setClub(e.target.value);
                    }}
                    placeholder="Club or Free Agent"
                    className="h-[36px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold">Interest</span>
                  <select
                    value={interestStatus}
                    onChange={(e) => setInterestStatus(e.target.value as InterestStatus)}
                    className="h-[36px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
                  >
                    {INTEREST_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold">Deal stage</span>
                  <select
                    value={dealStage}
                    onChange={(e) => setDealStage(e.target.value as DealStage)}
                    className="h-[36px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
                  >
                    {STAGE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold">Source</span>
                  <input
                    type="text"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="h-[36px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold">Valid until (game date)</span>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="h-[36px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold">Scout / agent notes</span>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Fee expectations, wage demands, tactical role fit..."
                  className="rounded-[5px] border border-[#59515f] bg-[#202128] p-2.5 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
                />
              </label>

              {validationError && (
                <p className="text-[12px] font-semibold text-[#ff758b]">{validationError}</p>
              )}
            </div>

            <div className="flex h-[58px] items-center justify-end gap-2.5 border-t border-[#39333f] bg-[#202128] px-6">
              <button
                type="button"
                onClick={closeDialog}
                className="inline-flex h-[36px] items-center rounded-[5px] border border-[#59515f] bg-[#241f2a] px-4 text-[13px] font-semibold text-[#f0edf4] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex h-[36px] items-center rounded-[5px] bg-[#850be3] px-4 text-[13px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
              >
                Save evidence
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
