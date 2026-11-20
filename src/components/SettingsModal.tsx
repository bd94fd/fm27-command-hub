import { Download, FileArchive, Upload, X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { AppSettings, ClubRecord, WorkspaceSnapshot } from '../domain/types';

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  managedClubName: string | null;
  clubs: ClubRecord[];
  snapshot: WorkspaceSnapshot;
  onUpdateSettings: (next: AppSettings) => void;
  onChangeManagedClub: (clubName: string) => void;
  onImportSnapshot: (snap: WorkspaceSnapshot) => void;
  onOpenLoadSave: () => void;
  onClose: () => void;
}

export function SettingsModal({
  open,
  settings,
  managedClubName,
  clubs,
  snapshot,
  onUpdateSettings,
  onChangeManagedClub,
  onImportSnapshot,
  onOpenLoadSave,
  onClose,
}: SettingsModalProps) {
  if (!open) return null;

  function handleExportSnapshot() {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fm27-snapshot-${snapshot.metadata.gameDate || 'empty'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFileImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as WorkspaceSnapshot;
        if (Array.isArray(parsed.players) && Array.isArray(parsed.clubs)) {
          onImportSnapshot(parsed);
          onClose();
        }
      } catch {
        // Invalid JSON ignored cleanly
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040308]/75 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-[8px] border border-[#d0c6db]/25 bg-[#121116] shadow-[0_24px_64px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between border-b border-[#39333f] bg-[#202128] px-6 py-4">
          <h2 id="settings-modal-title" className="fm-font-display text-[19px] font-bold text-[#f0edf4]">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded p-1 text-[#b2acbb] hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-6">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-[#b2acbb]">Display Currency</span>
            <select
              value={settings.currency}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  currency: e.target.value as AppSettings['currency'],
                })
              }
              className="h-[38px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
            >
              <option value="GBP">British Pound (£ GBP)</option>
              <option value="EUR">Euro (€ EUR)</option>
              <option value="USD">US Dollar ($ USD)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-[#b2acbb]">Wage Period</span>
            <select
              value={settings.wagePeriod}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  wagePeriod: e.target.value as AppSettings['wagePeriod'],
                })
              }
              className="h-[38px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none"
            >
              <option value="weekly">Per week</option>
              <option value="monthly">Per month</option>
              <option value="annual">Per year</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-[#b2acbb]">Managed Club</span>
            <select
              disabled={clubs.length === 0}
              value={managedClubName ?? ''}
              onChange={(e) => onChangeManagedClub(e.target.value)}
              className="h-[38px] rounded-[5px] border border-[#59515f] bg-[#202128] px-3 text-[13px] text-[#f0edf4] focus:border-[#dc87ff] focus:outline-none disabled:opacity-50"
            >
              {clubs.length === 0 ? (
                <option value="">Awaiting .fm Save</option>
              ) : (
                clubs.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} {c.competition ? `(${c.competition})` : ''}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="border-t border-[#39333f] pt-4">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#b2acbb]">
              Save File &amp; Snapshot Data Transfer
            </div>
            <p className="mb-3 text-[12px] leading-relaxed text-[#b2acbb]">
              Load your FM26/FM27 <code className="text-[#dc87ff]">.fm</code> save directly in the
              browser, or export/import a JSON snapshot.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLoadSave();
                }}
                className="inline-flex h-[36px] items-center gap-2 rounded-[5px] bg-[#850be3] px-3.5 text-[12px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
              >
                <FileArchive className="h-3.5 w-3.5" />
                <span>Load .fm save file</span>
              </button>

              <button
                type="button"
                disabled={snapshot.metadata.status !== 'loaded'}
                onClick={handleExportSnapshot}
                className="inline-flex h-[36px] items-center gap-2 rounded-[5px] border border-[#59515f] bg-[#202128] px-3.5 text-[12px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] disabled:opacity-45 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export snapshot JSON</span>
              </button>

              <label className="inline-flex h-[36px] items-center gap-2 rounded-[5px] border border-[#59515f] bg-[#202128] px-3.5 text-[12px] font-semibold text-[#f0edf4] hover:border-[#dc87ff] cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                <span>Import snapshot JSON</span>
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleFileImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-[#39333f] bg-[#202128] px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[36px] items-center rounded-[5px] bg-[#850be3] px-4 text-[13px] font-semibold text-white hover:bg-[#9c2be4] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
