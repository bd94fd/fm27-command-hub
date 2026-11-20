import { Check, Trash2, Upload, X } from 'lucide-react';
import { useState } from 'react';
import { createEmptyPlayerFilter } from '../domain/filters';
import { PITCH_POSITION_ROWS, PLAYER_ATTRIBUTE_CATEGORIES } from '../domain/playerCatalog';
import type {
  PlayerAttributes,
  PlayerFilterCriteria,
  PositionCode,
  SavedFilterSet,
} from '../domain/types';

interface PlayerFilterModalProps {
  open: boolean;
  initialCriteria: PlayerFilterCriteria;
  savedSets: SavedFilterSet[];
  nations: string[];
  competitions: string[];
  clubs: string[];
  onSaveSet: (name: string, criteria: PlayerFilterCriteria) => void;
  onDeleteSet: (id: string) => void;
  onApply: (criteria: PlayerFilterCriteria) => void;
  onClose: () => void;
}

function parseOptionalInt(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function PlayerFilterModal({
  open,
  initialCriteria,
  savedSets,
  nations,
  competitions,
  clubs,
  onSaveSet,
  onDeleteSet,
  onApply,
  onClose,
}: PlayerFilterModalProps) {
  const [draft, setDraft] = useState<PlayerFilterCriteria>(() => structuredClone(initialCriteria));
  const [tab, setTab] = useState<'filters' | 'positions' | 'attributes'>('filters');
  const [selectedSetId, setSelectedSetId] = useState<string>('');
  const [newSetName, setNewSetName] = useState<string>('');

  if (!open) return null;

  function togglePosition(pos: PositionCode) {
    const current = draft.positions[pos] ?? 0;
    const next = current === 0 ? 15 : current === 15 ? 18 : 0;
    const nextPositions = { ...draft.positions };
    if (next === 0) {
      delete nextPositions[pos];
    } else {
      nextPositions[pos] = next;
    }
    setDraft({ ...draft, positions: nextPositions });
  }

  function updateAttr(key: keyof PlayerAttributes, raw: string) {
    const val = parseOptionalInt(raw);
    const nextAttrs = { ...draft.attributes };
    if (val === null || val <= 0) {
      delete nextAttrs[key];
    } else {
      nextAttrs[key] = Math.min(20, Math.max(1, val));
    }
    setDraft({ ...draft, attributes: nextAttrs });
  }

  function handleLoadSet() {
    const found = savedSets.find((s) => s.id === selectedSetId);
    if (found) {
      setDraft(structuredClone(found.criteria));
    }
  }

  function handleSaveSet() {
    if (!newSetName.trim()) return;
    onSaveSet(newSetName.trim(), structuredClone(draft));
    setNewSetName('');
  }

  const inputClass =
    'h-[36px] w-full rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[13px] text-[#f0edf4] placeholder:text-[#8e8598] focus:border-[#dc87ff] focus:outline-none';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040308]/75 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-filter-title"
    >
      <div className="flex h-[min(780px,calc(100dvh-32px))] w-full max-w-[1040px] flex-col overflow-hidden rounded-[8px] border border-[#d0c6db]/25 bg-[#121116] shadow-[0_24px_64px_rgba(0,0,0,0.65)]">
        {/* Header */}
        <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-[#39333f] bg-[#202128] px-6">
          <h2 id="player-filter-title" className="fm-font-display text-[19px] font-bold text-[#f0edf4]">
            Player filter
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player filter"
            className="rounded p-1 text-[#b2acbb] hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Saved Filter Sets Row */}
        <div className="flex flex-wrap items-end gap-3 border-b border-[#39333f] bg-[#15131a] px-6 py-3">
          <label className="flex min-w-[200px] flex-col gap-1">
            <span className="text-[12px] font-semibold text-[#f0edf4]">Saved sets</span>
            <select
              aria-label="Saved sets"
              value={selectedSetId}
              onChange={(e) => setSelectedSetId(e.target.value)}
              className={inputClass}
            >
              <option value="">Select a saved set</option>
              {savedSets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleLoadSet}
            disabled={!selectedSetId}
            className="inline-flex h-[36px] items-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#241f2a] px-3.5 text-[12px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] disabled:opacity-50 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Load</span>
          </button>

          <label className="flex min-w-[180px] flex-col gap-1">
            <span className="text-[12px] font-semibold text-[#f0edf4]">Set name</span>
            <input
              type="text"
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              placeholder="Name this filter"
              className={inputClass}
            />
          </label>

          <button
            type="button"
            onClick={handleSaveSet}
            disabled={!newSetName.trim()}
            className="inline-flex h-[36px] items-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#241f2a] px-3.5 text-[12px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] disabled:opacity-50 cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Save</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (selectedSetId) {
                onDeleteSet(selectedSetId);
                setSelectedSetId('');
              }
            }}
            disabled={!selectedSetId}
            className="inline-flex h-[36px] items-center gap-1.5 rounded-[5px] px-3 text-[12px] font-semibold text-[#d4ced8] hover:bg-white/10 disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </button>
        </div>

        {/* Tabs */}
        <div role="tablist" className="flex shrink-0 border-b border-[#39333f] px-6">
          {(
            [
              { id: 'filters', label: 'Filters' },
              {
                id: 'positions',
                label: `Positions${
                  Object.keys(draft.positions).length > 0
                    ? ` (${Object.keys(draft.positions).length})`
                    : ''
                }`,
              },
              {
                id: 'attributes',
                label: `Attributes${
                  Object.keys(draft.attributes).length > 0
                    ? ` (${Object.keys(draft.attributes).length})`
                    : ''
                }`,
              },
            ] as const
          ).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`relative h-[44px] px-4 text-[13px] font-bold cursor-pointer ${
                  active ? 'bg-[#251f2d] text-[#dc87ff]' : 'text-[#b2acbb] hover:text-white'
                }`}
              >
                {t.label}
                {active && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#dc87ff]" />}
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
          {tab === 'filters' && (
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Name contains</span>
                <input
                  type="text"
                  value={draft.nameContains}
                  onChange={(e) => setDraft({ ...draft, nameContains: e.target.value })}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Gender</span>
                <select
                  value={draft.gender}
                  onChange={(e) =>
                    setDraft({ ...draft, gender: e.target.value as PlayerFilterCriteria['gender'] })
                  }
                  className={inputClass}
                >
                  <option value="Any">Any</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Playing nation</span>
                <select
                  value={draft.playingNation}
                  onChange={(e) => setDraft({ ...draft, playingNation: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Any nation</option>
                  {nations.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Playing competition</span>
                <select
                  value={draft.playingCompetition}
                  onChange={(e) => setDraft({ ...draft, playingCompetition: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Any competition</option>
                  {competitions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Age min</span>
                <input
                  type="number"
                  value={draft.ageMin ?? ''}
                  onChange={(e) => setDraft({ ...draft, ageMin: parseOptionalInt(e.target.value) })}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Age max</span>
                <input
                  type="number"
                  value={draft.ageMax ?? ''}
                  onChange={(e) => setDraft({ ...draft, ageMax: parseOptionalInt(e.target.value) })}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Height min (cm)</span>
                <input
                  type="number"
                  value={draft.heightMin ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, heightMin: parseOptionalInt(e.target.value) })
                  }
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Height max (cm)</span>
                <input
                  type="number"
                  value={draft.heightMax ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, heightMax: parseOptionalInt(e.target.value) })
                  }
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Club</span>
                <select
                  value={draft.club}
                  onChange={(e) => setDraft({ ...draft, club: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Any club</option>
                  {clubs.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">
                  Weekly Salary max (£)
                </span>
                <input
                  type="number"
                  value={draft.weeklySalaryMax ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, weeklySalaryMax: parseOptionalInt(e.target.value) })
                  }
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Asking price min (£)</span>
                <input
                  type="number"
                  value={draft.askingPriceMin ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, askingPriceMin: parseOptionalInt(e.target.value) })
                  }
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Asking price max (£)</span>
                <input
                  type="number"
                  value={draft.askingPriceMax ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, askingPriceMax: parseOptionalInt(e.target.value) })
                  }
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Current Ability min</span>
                <input
                  type="number"
                  value={draft.caMin ?? ''}
                  onChange={(e) => setDraft({ ...draft, caMin: parseOptionalInt(e.target.value) })}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Potential Ability min</span>
                <input
                  type="number"
                  value={draft.paMin ?? ''}
                  onChange={(e) => setDraft({ ...draft, paMin: parseOptionalInt(e.target.value) })}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Contract end from</span>
                <input
                  type="date"
                  value={draft.contractEndFrom}
                  onChange={(e) => setDraft({ ...draft, contractEndFrom: e.target.value })}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#f0edf4]">Contract end to</span>
                <input
                  type="date"
                  value={draft.contractEndTo}
                  onChange={(e) => setDraft({ ...draft, contractEndTo: e.target.value })}
                  className={inputClass}
                />
              </label>

              <div className="flex flex-wrap gap-6 pt-1 sm:col-span-2">
                <label className="inline-flex items-center gap-2 text-[13px] text-[#f0edf4] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.transferListedOnly}
                    onChange={(e) => setDraft({ ...draft, transferListedOnly: e.target.checked })}
                    className="h-4 w-4 accent-[#850be3]"
                  />
                  <span>Transfer listed only</span>
                </label>

                <label className="inline-flex items-center gap-2 text-[13px] text-[#f0edf4] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.loanListedOnly}
                    onChange={(e) => setDraft({ ...draft, loanListedOnly: e.target.checked })}
                    className="h-4 w-4 accent-[#850be3]"
                  />
                  <span>Listed for loan only</span>
                </label>
              </div>
            </div>
          )}

          {tab === 'positions' && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-[13px] text-[#b2acbb]">
                Click pitch positions to toggle minimum familiarity:{' '}
                <span className="font-semibold text-[#d5ff78]">Accomplished (15+)</span> →{' '}
                <span className="font-semibold text-[#66ff9c]">Natural (18+)</span> → Off.
              </p>

              <div className="relative w-full max-w-[440px] overflow-hidden rounded-[8px] border border-[#2c593e] bg-gradient-to-b from-[#163a27] via-[#1b4630] to-[#163a27] p-6">
                <div className="pointer-events-none absolute inset-3 rounded-[4px] border border-white/15" />
                <div className="pointer-events-none absolute inset-x-3 top-1/2 h-px bg-white/15" />
                <div className="relative z-10 flex flex-col gap-3.5">
                  {PITCH_POSITION_ROWS.map((row) => (
                    <div key={row.label} className="grid grid-cols-3 gap-3">
                      {row.positions.map((pos, idx) => {
                        if (!pos) return <div key={`sp-${row.label}-${idx}`} />;
                        const minFam = draft.positions[pos] ?? 0;
                        const style =
                          minFam >= 18
                            ? 'border-[#33e27a] bg-[#164b2c] text-[#66ff9c]'
                            : minFam >= 15
                              ? 'border-[#9ad436] bg-[#2f4518] text-[#d5ff78]'
                              : 'border-white/20 bg-[#14201a]/80 text-[#c9d4ce] hover:border-[#dc87ff]';
                        return (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => togglePosition(pos)}
                            className={`flex flex-col items-center justify-center rounded-[5px] border py-2.5 transition-transform hover:-translate-y-0.5 cursor-pointer ${style}`}
                          >
                            <span className="text-[13px] font-bold">{pos}</span>
                            <span className="text-[10px]">
                              {minFam >= 18 ? 'Natural' : minFam >= 15 ? 'Accomplished' : 'Any'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'attributes' && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {PLAYER_ATTRIBUTE_CATEGORIES.map((cat) => (
                <div key={cat.name} className="rounded-[6px] border border-[#39333f] bg-[#17141d] p-3.5">
                  <div className="mb-2.5 border-b border-[#39333f] pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#dc87ff]">
                    {cat.name} (Min 1–20)
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {cat.attributes.map((attr) => (
                      <div
                        key={`${cat.name}-${attr.key}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <label
                          htmlFor={`attr-filter-${cat.name}-${attr.key}`}
                          className="text-[12px] text-[#d4ced8]"
                        >
                          {attr.label}
                        </label>
                        <input
                          id={`attr-filter-${cat.name}-${attr.key}`}
                          type="number"
                          min={1}
                          max={20}
                          placeholder="—"
                          value={draft.attributes[attr.key] ?? ''}
                          onChange={(e) => updateAttr(attr.key, e.target.value)}
                          className="h-[28px] w-[62px] rounded-[4px] border border-[#59515f] bg-[#202128] px-2 text-right text-[12px] text-[#f0edf4] tabular-nums focus:border-[#dc87ff] focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex h-[60px] shrink-0 items-center justify-end gap-2.5 border-t border-[#39333f] bg-[#202128] px-6">
          <button
            type="button"
            onClick={() => setDraft(createEmptyPlayerFilter())}
            className="inline-flex h-[36px] items-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#241f2a] px-3.5 text-[13px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[36px] items-center gap-1.5 rounded-[5px] border border-[#59515f] bg-[#241f2a] px-3.5 text-[13px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            <span>Cancel</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="inline-flex h-[36px] items-center gap-1.5 rounded-[5px] bg-[#850be3] px-4 text-[13px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
          >
            <Check className="h-4 w-4" />
            <span>Apply filters</span>
          </button>
        </div>
      </div>
    </div>
  );
}
