/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Download,
  FileText,
  Image as ImageIcon,
  Link2,
  Printer,
  Share2,
} from 'lucide-react';
import type { MatchLogEntry, PlayerRecord, StaffRecord } from '../types/fm27';
import type { ClubFinancesPanelData } from '../utils/clubFinances';
import {
  REPORT_KINDS,
  REPORT_LABELS,
  buildPrintableReportHtml,
  buildReportCardModel,
  buildReportCardSvg,
  buildReportCsv,
  buildReportFileName,
  buildReportRows,
  buildShareSummary,
  describeShareSummary,
  encodeShareSummary,
  type ReportContext,
  type ReportKind,
} from '../utils/reportExport';
import {
  buildShareUrl,
  copyTextToClipboard,
  downloadReportCardPng,
  downloadTextFile,
  printHtmlDocument,
  shareReportLink,
} from '../utils/reportDelivery';
import { MobileSheetFrame } from './MobileSheetFrame';

interface ShareReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubName: string;
  saveDate: string;
  players: PlayerRecord[];
  staff: StaffRecord[];
  matches: MatchLogEntry[];
  finances: ClubFinancesPanelData | null;
  onToast?: (message: string) => void;
}

const REPORT_HINTS: Record<ReportKind, string> = {
  squad: 'Every player with season totals, ability, wage and contract.',
  staff: 'The backroom with department, wage and contract.',
  matches: 'Every match with result, xG, shots and player of the match.',
  finances: 'Balance, monthly net, runway, wages and sponsorships.',
  contracts: 'Players and staff sorted by the soonest expiry.',
};

const actionClass =
  'min-h-[48px] w-full inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-800 px-3 py-2.5 text-left text-sm font-semibold text-slate-100 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

export const ShareReportModal: React.FC<ShareReportModalProps> = ({
  isOpen,
  onClose,
  clubName,
  saveDate,
  players,
  staff,
  matches,
  finances,
  onToast,
}) => {
  const [kind, setKind] = useState<ReportKind>('squad');
  const [busy, setBusy] = useState<null | 'png' | 'link'>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const context: ReportContext = useMemo(
    () => ({ clubName, saveDate, players, staff, matches, finances }),
    [clubName, saveDate, players, staff, matches, finances]
  );

  const cardModel = useMemo(() => buildReportCardModel(context), [context]);
  const cardSvg = useMemo(() => buildReportCardSvg(cardModel), [cardModel]);
  const previewSrc = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardSvg)}`,
    [cardSvg]
  );
  const shareSummary = useMemo(() => buildShareSummary(context), [context]);
  const shareContents = useMemo(() => describeShareSummary(shareSummary), [shareSummary]);

  const notify = (message: string) => onToast?.(message);

  const handleCsv = () => {
    const csv = buildReportCsv(kind, context);
    const filename = buildReportFileName(kind, context, 'csv');
    const ok = downloadTextFile(filename, csv, 'text/csv');
    notify(ok ? `${REPORT_LABELS[kind]} CSV saved.` : 'Could not save the CSV in this browser.');
  };

  const handlePng = async () => {
    setBusy('png');
    try {
      const ok = await downloadReportCardPng(cardSvg, buildReportFileName('squad', context, 'png').replace('-squad', '-card'));
      notify(ok ? 'Report card saved as PNG.' : 'Could not build the PNG in this browser.');
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = () => {
    const report = buildPrintableReportHtml(cardModel, buildReportRows(kind, context));
    const ok = printHtmlDocument(report.html);
    notify(
      ok
        ? 'Print sheet ready. Choose Save as PDF to keep a copy.'
        : 'This browser would not open the print sheet.'
    );
  };

  const handleShareLink = async () => {
    setBusy('link');
    try {
      const token = encodeShareSummary(shareSummary);
      if (!token) {
        notify('This summary is too large to put in a link.');
        return;
      }
      const url = buildShareUrl(window.location.origin, window.location.pathname, token);
      setShareUrl(url);
      const outcome = await shareReportLink({
        title: `${shareSummary.club} — FM27 report`,
        text: 'Read-only FM27 club summary.',
        url,
      });
      if (outcome === 'shared') notify('Shared.');
      else if (outcome === 'copied') notify('Read-only link copied to your clipboard.');
      else if (outcome === 'failed') notify('Could not copy the link. Select it below instead.');
    } finally {
      setBusy(null);
    }
  };

  const handleCopyAgain = async () => {
    if (!shareUrl) return;
    const ok = await copyTextToClipboard(shareUrl);
    notify(ok ? 'Link copied.' : 'Could not copy the link. Select it instead.');
  };

  return (
    <MobileSheetFrame
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Share and export"
      alignTopDesktop
      header={
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-100">Share &amp; export</h2>
          <p className="text-micro text-slate-400">
            A clean report you can send, print or file away.
          </p>
        </div>
      }
    >
      <div className="space-y-5">
        <section className="space-y-2" aria-label="Choose a report">
          <h3 className="text-micro font-semibold uppercase tracking-wider text-slate-400">
            Report
          </h3>
          <div role="group" aria-label="Report to export" className="flex flex-wrap gap-1.5">
            {REPORT_KINDS.map((option) => {
              const selected = option === kind;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setKind(option)}
                  className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    selected
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                      : 'border-slate-700 bg-slate-800/70 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {REPORT_LABELS[option]}
                </button>
              );
            })}
          </div>
          <p className="text-micro text-slate-400">{REPORT_HINTS[kind]}</p>
        </section>

        <section className="space-y-2" aria-label="Report card preview">
          <h3 className="text-micro font-semibold uppercase tracking-wider text-slate-400">
            Card preview
          </h3>
          <div className="flex items-start gap-3">
            <img
              src={previewSrc}
              alt={`Preview of the ${cardModel.clubName} report card`}
              width={180}
              height={225}
              className="w-[150px] sm:w-[180px] rounded-xl border border-slate-700 bg-slate-900 shrink-0"
            />
            <div className="min-w-0 space-y-1 text-micro text-slate-400">
              <p className="text-sm font-semibold text-slate-200">{cardModel.clubName}</p>
              <p>{cardModel.saveDate}</p>
              <p>
                {cardModel.headline
                  .slice(0, 3)
                  .map((stat) => `${stat.label}: ${stat.value}`)
                  .join(' · ')}
              </p>
              <p>Saved as a 1080 × 1350 PNG, ready for a group chat or a post.</p>
            </div>
          </div>
        </section>

        <section className="space-y-2" aria-label="Export actions">
          <h3 className="text-micro font-semibold uppercase tracking-wider text-slate-400">
            Export
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button type="button" onClick={handleCsv} className={actionClass}>
              <Download className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="min-w-0">
                Download CSV
                <span className="block text-micro font-normal text-slate-400">
                  {REPORT_LABELS[kind]} · opens in a spreadsheet
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => void handlePng()}
              disabled={busy === 'png'}
              className={actionClass}
            >
              <ImageIcon className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="min-w-0">
                {busy === 'png' ? 'Building PNG…' : 'Save card as PNG'}
                <span className="block text-micro font-normal text-slate-400">
                  Image for a chat or a post
                </span>
              </span>
            </button>
            <button type="button" onClick={handlePrint} className={actionClass}>
              <Printer className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="min-w-0">
                Print or save as PDF
                <span className="block text-micro font-normal text-slate-400">
                  A4 sheet with the card and the {REPORT_LABELS[kind].toLowerCase()} table
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => void handleShareLink()}
              disabled={busy === 'link'}
              className={actionClass}
            >
              <Share2 className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="min-w-0">
                {busy === 'link' ? 'Preparing link…' : 'Share read-only link'}
                <span className="block text-micro font-normal text-slate-400">
                  Opens in the phone share sheet
                </span>
              </span>
            </button>
          </div>
        </section>

        <section className="space-y-2" aria-label="What the shared link contains">
          <h3 className="text-micro font-semibold uppercase tracking-wider text-slate-400">
            What the link shows
          </h3>
          <ul className="space-y-1 text-micro text-slate-300 list-disc pl-4">
            {shareContents.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-micro text-slate-400">
            The link carries this summary inside the address, so it works without a server.
            Anyone you send it to sees a read-only page and nothing is written to their save or
            yours.
          </p>
          {shareUrl && (
            <div className="space-y-1.5">
              <label
                htmlFor="share-link-url"
                className="block text-micro font-semibold uppercase tracking-wider text-slate-400"
              >
                Your link
              </label>
              <div className="flex gap-2">
                <input
                  id="share-link-url"
                  readOnly
                  value={shareUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 min-h-[44px] rounded-xl border border-slate-700 bg-slate-950/60 px-3 text-xs text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyAgain()}
                  className="min-h-[44px] min-w-[44px] shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 text-xs font-semibold text-slate-100 transition-colors cursor-pointer"
                >
                  <Link2 className="w-4 h-4" />
                  Copy
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="flex items-start gap-2 text-micro text-slate-400 border-t border-slate-800 pt-3">
          <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500" />
          <span>
            Exports are made on this device from the save you loaded. Nothing is uploaded, and no
            file is created until you tap an export.
          </span>
        </p>
      </div>
    </MobileSheetFrame>
  );
};
