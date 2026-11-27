/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  MatchLogEntry,
  PlayerRecord,
  StaffRecord,
} from '../types/fm27';
import type { ClubFinancesPanelData } from './clubFinances';
import { getRealShirtNumber } from './playerCardAnalysis';
import { topPlayersByRating } from './shareSummary';

export {
  SHARE_TOKEN_MAX_LENGTH,
  buildShareSummary,
  decodeShareSummary,
  describeShareSummary,
  encodeShareSummary,
  type ShareSummary,
} from './shareSummary';
import { formatClubMoney } from './clubFinances';
import {
  classifyStaffDepartment,
  staffContractDaysRemaining,
} from './staffRatings';

export type ReportKind = 'squad' | 'staff' | 'matches' | 'finances' | 'contracts';

export const REPORT_KINDS: ReportKind[] = [
  'squad',
  'staff',
  'matches',
  'finances',
  'contracts',
];

export const REPORT_LABELS: Record<ReportKind, string> = {
  squad: 'Squad',
  staff: 'Staff',
  matches: 'Matches',
  finances: 'Finances',
  contracts: 'Contracts',
};

export interface ReportContext {
  clubName: string;
  saveDate: string;
  players: ReadonlyArray<PlayerRecord>;
  staff?: ReadonlyArray<StaffRecord>;
  matches?: ReadonlyArray<MatchLogEntry>;
  finances?: ClubFinancesPanelData | null;
  generatedAt?: Date;
}

const MISSING = '';

function cell(value: unknown): string {
  if (value === null || value === undefined) return MISSING;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : MISSING;
  if (typeof value === 'string') return value;
  return String(value);
}

function num(value: number | null | undefined, digits = 0): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return MISSING;
  return value.toFixed(digits);
}

/** RFC 4180 quoting: wrap when the value holds a comma, quote, tab or newline. */
export function csvCell(value: unknown): string {
  const text = cell(value);
  if (!/["\t\r\n,]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function withBom(csv: string): string {
  return `\uFEFF${csv}`;
}

/** The app shows `--` for a wage it does not have, so a CSV cell stays empty for those. */
function wageCell(value: unknown): number | string {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : '';
}

function contractMonthsLeft(player: PlayerRecord): string {
  const months = player.contractExpiryMonths;
  if (typeof months === 'number' && Number.isFinite(months)) return String(months);
  return MISSING;
}

function staffDaysLeft(member: StaffRecord, saveDate: string): string {
  const days = staffContractDaysRemaining(member.expires, saveDate);
  return days === null ? MISSING : String(days);
}

export function buildSquadRows(players: ReadonlyArray<PlayerRecord>): Array<Array<string | number>> {
  const header = [
    'No',
    'Name',
    'Position',
    'Age',
    'Unit',
    'Status',
    'Apps',
    'Minutes',
    'Avg rating',
    'Goals',
    'Assists',
    'xG',
    'xA',
    'Ability',
    'Potential',
    'Wage/wk',
    'Contract expires',
    'Months left',
    'Nation',
  ];
  const rows = players.map((player) => [
    getRealShirtNumber(player) ?? '',
    player.name,
    player.position,
    player.age,
    player.squadUnit ?? MISSING,
    player.status,
    player.apps,
    num(player.minutes),
    num(player.rating, 2),
    num(player.goals),
    num(player.assists),
    num(player.xG, 2),
    num(player.xA, 2),
    num(player.ability, 1),
    num(player.potential, 1),
    wageCell(player.wagePw),
    player.expires,
    contractMonthsLeft(player),
    player.nation,
  ]);
  return [header, ...rows] as Array<Array<string | number>>;
}

export function buildSquadCsv(players: ReadonlyArray<PlayerRecord>): string {
  return withBom(toCsv(buildSquadRows(players)));
}

export function buildStaffRows(
  staff: ReadonlyArray<StaffRecord>,
  saveDate = ''
): Array<Array<string | number>> {
  const header = [
    'Name',
    'Role',
    'Department',
    'Age',
    'Wage/wk',
    'Contract expires',
    'Days left',
    'Nation',
  ];
  const rows = staff.map((member) => [
    member.name,
    member.role,
    classifyStaffDepartment(member),
    member.age,
    wageCell(member.wagePw),
    member.expires,
    staffDaysLeft(member, saveDate),
    member.nation,
  ]);
  return [header, ...rows] as Array<Array<string | number>>;
}

export function buildStaffCsv(
  staff: ReadonlyArray<StaffRecord>,
  saveDate = ''
): string {
  return withBom(toCsv(buildStaffRows(staff, saveDate)));
}

export function buildMatchRows(matches: ReadonlyArray<MatchLogEntry>): Array<Array<string | number>> {
  const header = [
    'Date',
    'Competition',
    'Opponent',
    'Venue',
    'Result',
    'Score',
    'xG for',
    'xG against',
    'Possession %',
    'Shots for',
    'Shots against',
    'CCC for',
    'CCC against',
    'Pass %',
    'Player of the match',
  ];
  const rows = matches.map((match) => [
    match.date,
    match.competition,
    match.opponent,
    match.venue,
    match.result,
    match.score,
    num(match.xGFor, 2),
    num(match.xGAgainst, 2),
    num(match.possession),
    match.shotsFor,
    match.shotsAgainst,
    num(match.cccFor),
    num(match.cccAgainst),
    num(match.passCompletion),
    match.potm,
  ]);
  return [header, ...rows] as Array<Array<string | number>>;
}

export function buildMatchesCsv(matches: ReadonlyArray<MatchLogEntry>): string {
  return withBom(toCsv(buildMatchRows(matches)));
}

export function buildFinanceRows(finances: ClubFinancesPanelData | null | undefined): Array<Array<string | number>> {
  const header = ['Section', 'Line', 'Value'];
  if (!finances) return [header];
  const rows: Array<Array<string | number>> = [
    ['Cash', 'Balance', finances.cash.balanceLabel],
    ['Cash', 'Monthly net', finances.cash.monthlyNetLabel],
    ['Cash', 'Runway', finances.cash.runwayLabel],
    ['Cash', 'Runway status', finances.cash.runwayStatus ?? 'Unknown'],
    ['Payroll', 'Wage bill', finances.payroll.clubPayrollLabel],
    ['Payroll', 'Wage budget', finances.payroll.wageBudgetLabel],
    ['Payroll', 'Wage headroom', finances.payroll.wageHeadroomLabel],
    ['Payroll', 'Compliance', finances.payroll.wageComplianceLabel],
    ['Payroll', 'Staff payroll', finances.payroll.staffPayrollLabel],
    ['Payroll', 'Squad wage subtotal', finances.payroll.squadWageSubtotalLabel],
  ];
  for (const deal of finances.sponsorships) {
    rows.push(['Sponsorship', deal.name, `${deal.annualValueLabel} until ${deal.expires}`]);
  }
  return [header, ...rows] as Array<Array<string | number>>;
}

export function buildFinancesCsv(finances: ClubFinancesPanelData | null | undefined): string {
  return withBom(toCsv(buildFinanceRows(finances)));
}

export function buildContractRows(
  players: ReadonlyArray<PlayerRecord>,
  staff: ReadonlyArray<StaffRecord>,
  saveDate = ''
): Array<Array<string | number>> {
  const header = ['Type', 'Name', 'Position or role', 'Wage/wk', 'Contract expires', 'Time left'];
  const playerRows = players
    .map((player) => ({
      player,
      months: player.contractExpiryMonths,
    }))
    .filter((row) => typeof row.months === 'number' && Number.isFinite(row.months))
    .sort((a, b) => (a.months as number) - (b.months as number))
    .map(({ player, months }) => [
      'Player',
      player.name,
      player.position,
      wageCell(player.wagePw),
      player.expires,
      `${months} months`,
    ]);
  const staffRows = staff
    .map((member) => ({ member, days: staffContractDaysRemaining(member.expires, saveDate) }))
    .filter((row) => row.days !== null)
    .sort((a, b) => (a.days as number) - (b.days as number))
    .map(({ member, days }) => [
      'Staff',
      member.name,
      member.role,
      wageCell(member.wagePw),
      member.expires,
      `${days} days`,
    ]);
  return [header, ...playerRows, ...staffRows] as Array<Array<string | number>>;
}

export function buildContractsCsv(
  players: ReadonlyArray<PlayerRecord>,
  staff: ReadonlyArray<StaffRecord>,
  saveDate = ''
): string {
  return withBom(toCsv(buildContractRows(players, staff, saveDate)));
}

export function buildReportRows(kind: ReportKind, context: ReportContext): Array<Array<string | number>> {
  switch (kind) {
    case 'squad':
      return buildSquadRows(context.players);
    case 'staff':
      return buildStaffRows(context.staff ?? [], context.saveDate);
    case 'matches':
      return buildMatchRows(context.matches ?? []);
    case 'finances':
      return buildFinanceRows(context.finances);
    case 'contracts':
      return buildContractRows(context.players, context.staff ?? [], context.saveDate);
    default:
      return [['Report']];
  }
}

export function buildReportCsv(kind: ReportKind, context: ReportContext): string {
  return withBom(toCsv(buildReportRows(kind, context)));
}

function reportFileStem(context: ReportContext): string {
  const club = context.clubName.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'fm27';
  const date = context.saveDate.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'save';
  return `fm27-${club}-${date}`;
}

export function buildReportFileName(
  kind: ReportKind,
  context: ReportContext,
  extension: string
): string {
  return `${reportFileStem(context)}-${kind}.${extension}`;
}


export interface ReportCardModel {
  title: string;
  clubName: string;
  saveDate: string;
  generatedLabel: string;
  headline: Array<{ label: string; value: string }>;
  topPlayers: Array<{ name: string; position: string; rating: string }>;
  footer: string;
}

export function buildReportCardModel(context: ReportContext): ReportCardModel {
  const finances = context.finances ?? null;
  const expiring = context.players.filter(
    (player) =>
      typeof player.contractExpiryMonths === 'number' &&
      Number.isFinite(player.contractExpiryMonths) &&
      player.contractExpiryMonths <= 12
  ).length;
  const wageBill = finances?.payroll.wagePayrollWeekly ?? null;
  const headline: Array<{ label: string; value: string }> = [
    { label: 'Squad', value: String(context.players.length) },
    { label: 'Staff', value: String((context.staff ?? []).length) },
    {
      label: 'Wage bill',
      value: wageBill === null ? '--' : `${formatClubMoney(wageBill)}/wk`,
    },
    {
      label: 'Wage budget',
      value:
        finances?.payroll.wageBudgetWeekly === null || finances?.payroll.wageBudgetWeekly === undefined
          ? '--'
          : `${formatClubMoney(finances.payroll.wageBudgetWeekly)}/wk`,
    },
    { label: 'Balance', value: finances?.cash.balanceLabel ?? '--' },
    { label: 'Monthly net', value: finances?.cash.monthlyNetLabel ?? '--' },
    { label: 'Runway', value: finances?.cash.runwayLabel ?? '--' },
    { label: 'Expiring in 12 months', value: String(expiring) },
  ];
  const generated = context.generatedAt ?? new Date();
  return {
    title: 'Club report',
    clubName: context.clubName || 'FM27 save',
    saveDate: context.saveDate || 'Save date not decoded',
    generatedLabel: `Exported ${generated.toISOString().slice(0, 10)}`,
    headline,
    topPlayers: topPlayersByRating(context.players),
    footer: 'Made with FM27 Command Hub. Figures come from your save file.',
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Truncates on word boundaries so long club names cannot run off the card. */
function fit(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export const REPORT_CARD_WIDTH = 1080;
export const REPORT_CARD_HEIGHT = 1350;

export function buildReportCardSvg(model: ReportCardModel): string {
  const width = REPORT_CARD_WIDTH;
  const height = REPORT_CARD_HEIGHT;
  const pad = 72;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(
      `${model.clubName} club report`
    )}">`
  );
  parts.push('<rect width="100%" height="100%" fill="#0f172a"/>');
  parts.push(`<rect x="0" y="0" width="100%" height="10" fill="#10b981"/>`);
  parts.push(
    `<text x="${pad}" y="${pad + 44}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="26" letter-spacing="4" fill="#64748b">FM27 COMMAND HUB</text>`
  );
  parts.push(
    `<text x="${pad}" y="${pad + 116}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="64" font-weight="700" fill="#f8fafc">${escapeXml(
      fit(model.clubName, 24)
    )}</text>`
  );
  parts.push(
    `<text x="${pad}" y="${pad + 164}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="30" fill="#94a3b8">${escapeXml(
      fit(model.saveDate, 40)
    )}</text>`
  );

  const colWidth = (width - pad * 2 - 24) / 2;
  const statTop = pad + 220;
  const statHeight = 132;
  model.headline.forEach((stat, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = pad + col * (colWidth + 24);
    const y = statTop + row * (statHeight + 20);
    parts.push(
      `<rect x="${x}" y="${y}" width="${colWidth}" height="${statHeight}" rx="18" fill="#1e293b"/>`
    );
    parts.push(
      `<text x="${x + 26}" y="${y + 44}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="22" letter-spacing="2" fill="#94a3b8">${escapeXml(
        stat.label.toUpperCase()
      )}</text>`
    );
    parts.push(
      `<text x="${x + 26}" y="${y + 96}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="42" font-weight="700" fill="#f8fafc">${escapeXml(
        fit(stat.value, 16)
      )}</text>`
    );
  });

  const listTop = statTop + 4 * (statHeight + 20) + 30;
  parts.push(
    `<text x="${pad}" y="${listTop}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="24" letter-spacing="2" fill="#94a3b8">TOP RATED</text>`
  );
  model.topPlayers.forEach((player, index) => {
    const y = listTop + 56 + index * 52;
    parts.push(
      `<text x="${pad}" y="${y}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="32" fill="#e2e8f0">${escapeXml(
        fit(player.name, 26)
      )}</text>`
    );
    parts.push(
      `<text x="${width - pad}" y="${y}" text-anchor="end" font-family="Inter, Helvetica, Arial, sans-serif" font-size="32" font-weight="700" fill="#34d399">${escapeXml(
        `${player.rating} · ${player.position}`
      )}</text>`
    );
  });
  parts.push(
    `<text x="${pad}" y="${height - 56}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="24" fill="#64748b">${escapeXml(
      fit(`${model.generatedLabel}. ${model.footer}`, 92)
    )}</text>`
  );
  parts.push('</svg>');
  return parts.join('');
}

export interface PrintableReport {
  title: string;
  html: string;
}

function escapeHtml(value: string): string {
  return escapeXml(value);
}

export function buildPrintableReportHtml(
  model: ReportCardModel,
  rows: ReadonlyArray<ReadonlyArray<string | number>>
): PrintableReport {
  const [header, ...body] = rows.map((row) => row.map((value) => cell(value)));
  const head = (header ?? []).map((cellText) => `<th>${escapeHtml(cellText)}</th>`).join('');
  const trs = body
    .map(
      (row) =>
        `<tr>${row.map((cellText) => `<td>${escapeHtml(cellText)}</td>`).join('')}</tr>`
    )
    .join('');
  const stats = model.headline
    .map(
      (stat) =>
        `<div class="stat"><span class="label">${escapeHtml(stat.label)}</span><span class="value">${escapeHtml(stat.value)}</span></div>`
    )
    .join('');
  return {
    title: `${model.clubName} — ${model.title}`,
    html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(model.clubName)} — ${escapeHtml(model.title)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .sub { color: #475569; font-size: 12px; margin-bottom: 14px; }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .stat { border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px 10px; min-width: 128px; }
  .label { display: block; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: #64748b; }
  .value { font-size: 14px; font-weight: 600; }
  table { border-collapse: collapse; width: 100%; font-size: 9px; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 3px 5px; text-align: left; }
  th { background: #f1f5f9; text-transform: uppercase; letter-spacing: .04em; font-size: 8px; }
  tr:nth-child(even) td { background: #f8fafc; }
  footer { margin-top: 12px; color: #64748b; font-size: 9px; }
</style>
</head>
<body>
<h1>${escapeHtml(model.clubName)}</h1>
<div class="sub">${escapeHtml(model.saveDate)} · ${escapeHtml(model.generatedLabel)}</div>
<div class="stats">${stats}</div>
<table><thead><tr>${head}</tr></thead><tbody>${trs}</tbody></table>
<footer>${escapeHtml(model.footer)}</footer>
</body>
</html>`,
  };
}
