import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchLogEntry, PlayerRecord, StaffRecord } from '../types/fm27';
import { ClubFinancesPanelData } from './clubFinances';
import {
  REPORT_KINDS,
  SHARE_TOKEN_MAX_LENGTH,
  buildPrintableReportHtml,
  buildReportCardModel,
  buildReportCardSvg,
  buildReportCsv,
  buildReportFileName,
  buildReportRows,
  buildShareSummary,
  csvCell,
  decodeShareSummary,
  describeShareSummary,
  encodeShareSummary,
  toCsv,
  type ReportContext,
} from './reportExport';

const makePlayer = (
  over: Partial<PlayerRecord> & { id: string; name: string; position: string }
): PlayerRecord =>
  ({
    number: 1,
    apps: '12 (3)',
    minutes: 1043,
    rating: 7.12,
    goals: 4,
    xG: 3.4,
    xGPer90: 0.3,
    assists: 2,
    xA: 1.8,
    xAPer90: 0.15,
    drbPer90: 1.2,
    prPassesPer90: 4.1,
    hdrPct: 52,
    intPer90: 2.1,
    tckPct: 61,
    personality: 'Balanced',
    age: 24,
    ability: 3.5,
    potential: 4.2,
    wagePw: 625,
    expires: '30/06/2028',
    contractExpiryMonths: 20,
    nation: 'Belgium',
    status: 'Starter',
    squadUnit: 'First Team',
    attributes: {},
    ...over,
  }) as unknown as PlayerRecord;

const players: PlayerRecord[] = [
  makePlayer({ id: 'p1', name: 'René Vanden Borre', position: 'GK', rating: 6.9, wagePw: 432 }),
  makePlayer({
    id: 'p2',
    name: 'Nathan Kaninda',
    position: 'AMR',
    rating: 7.42,
    contractExpiryMonths: 6,
  }),
  makePlayer({
    id: 'p3',
    name: 'Test Striker, Junior',
    position: 'ST',
    rating: null,
    wagePw: 1200,
    contractExpiryMonths: undefined,
  }),
];

const staff: StaffRecord[] = [
  {
    id: 's1',
    name: 'Bram De Coninck',
    role: 'Manager',
    age: 51,
    nation: 'Belgium',
    club: 'KVV Zelzate',
    wagePw: 2500,
    expires: '30/06/2027',
    attributes: {},
  } as unknown as StaffRecord,
];

const matches: MatchLogEntry[] = [
  {
    id: 'm1',
    eventNumber: 1,
    date: '11/08/2027',
    competition: 'League',
    opponent: 'KRC Gent',
    venue: 'H',
    result: 'W',
    score: '2-1',
    xGFor: 1.84,
    xGAgainst: 0.92,
    possession: 56,
    shotsFor: '12 (5)',
    shotsAgainst: '8 (3)',
    cccFor: 3,
    cccAgainst: 1,
    passCompletion: 81,
    goalTimeline: '12, 67',
    potm: 'Nathan Kaninda',
  } as unknown as MatchLogEntry,
];

const finances: ClubFinancesPanelData = {
  currencySymbol: '£',
  cash: {
    balanceLabel: '-£631K',
    balanceAmount: -631_000,
    isInDebt: true,
    monthlyNetAmount: -120_000,
    monthlyBurnRate: 120_000,
    monthlyNetLabel: '-£120K/mo',
    runwayStatus: 'Critical',
    runwayMonths: 0,
    runwayLabel: 'overdrawn',
    runwayWarning: null,
  },
  payroll: {
    clubPayrollLabel: '£8.66k/wk',
    wagePayrollWeekly: 8660,
    wageBudgetLabel: '£10,203/wk',
    wageBudgetWeekly: 10_203,
    wageComplianceLabel: '£976/wk over cap',
    wageHeadroomLabel: '-£976/wk',
    wageHeadroomWeekly: -976,
    wageSeverity: 'over',
    staffPayrollLabel: '£10.6k/wk',
    staffMissingWageCount: 0,
    squadWageSubtotalLabel: '£8.09k/wk',
    squadWageMissingCount: 0,
  },
  sponsorships: [
    {
      name: 'Hoofdsponsor',
      type: 'Main',
      annualValueLabel: '£250K',
      expires: '30/06/2028',
      datesReordered: false,
    },
  ],
};

const context: ReportContext = {
  clubName: 'KVV Zelzate',
  saveDate: '11/08/2027',
  players,
  staff,
  matches,
  finances,
  generatedAt: new Date('2026-11-26T12:00:00Z'),
};

test('CSV cells are quoted only when they need to be', () => {
  assert.equal(csvCell('KVV Zelzate'), 'KVV Zelzate');
  assert.equal(csvCell(42), '42');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('Striker, Junior'), '"Striker, Junior"');
  assert.equal(csvCell('He said "go"'), '"He said ""go"""');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
});

test('toCsv uses CRLF line endings and one row per line', () => {
  const csv = toCsv([
    ['a', 'b'],
    [1, 2],
  ]);
  assert.equal(csv, 'a,b\r\n1,2');
});

test('every report kind produces a header row and one row per record', () => {
  const expectedRows: Record<string, number> = {
    squad: players.length + 1,
    staff: staff.length + 1,
    matches: matches.length + 1,
    contracts: 4,
    finances: 10 + 1 + 1,
  };
  for (const kind of REPORT_KINDS) {
    const rows = buildReportRows(kind, context);
    assert.equal(rows.length, expectedRows[kind], `${kind} row count`);
    assert.ok(rows[0].length >= 3, `${kind} header has columns`);
  }
});

test('the squad CSV carries a BOM, the shirt number and a quoted comma name', () => {
  const csv = buildReportCsv('squad', context);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /\r\n/);
  assert.match(csv, /"Test Striker, Junior"/);
  assert.match(csv, /Nathan Kaninda,AMR,24,First Team,Starter,12 \(3\),1043,7\.42/);
});

test('the shirt number is left blank when the save has no real kit number', () => {
  const withNumbers = [
    makePlayer({ id: 'a', name: 'Real Nine', position: 'ST', number: 9 }),
    makePlayer({ id: 'b', name: 'No Number', position: 'MC', number: 0 }),
    makePlayer({ id: 'c', name: 'Outfield One', position: 'DC', number: 1 }),
  ];
  const rows = buildReportRows('squad', { clubName: 'X', saveDate: '', players: withNumbers });
  const byName = Object.fromEntries(rows.slice(1).map((row) => [String(row[1]), row[0]]));
  assert.equal(byName['Real Nine'], 9);
  assert.equal(byName['No Number'], '');
  assert.equal(byName['Outfield One'], '');
});

test('a missing rating or contract length is left blank, never zero', () => {
  const rows = buildReportRows('squad', context);
  const header = rows[0];
  const ratingIndex = header.indexOf('Avg rating');
  const monthsIndex = header.indexOf('Months left');
  const striker = rows.find((row) => String(row[1]).startsWith('Test Striker'));
  assert.ok(striker);
  assert.equal(striker![ratingIndex], '');
  assert.equal(striker![monthsIndex], '');
});

test('a wage the save does not have is blank, matching the app dash', () => {
  const squad = [makePlayer({ id: 'y', name: 'Youth Keeper', position: 'GK', wagePw: 0 })];
  const rows = buildReportRows('squad', { clubName: 'X', saveDate: '', players: squad });
  const wageIndex = rows[0].indexOf('Wage/wk');
  assert.equal(rows[1][wageIndex], '');
  const contracts = buildReportRows('contracts', { clubName: 'X', saveDate: '', players: squad });
  const contractWageIndex = contracts[0].indexOf('Wage/wk');
  assert.equal(contracts[1][contractWageIndex], '');
});

test('the contracts CSV sorts the soonest expiry first and mixes players and staff', () => {
  const rows = buildReportRows('contracts', context);
  assert.deepEqual(rows[0], ['Type', 'Name', 'Position or role', 'Wage/wk', 'Contract expires', 'Time left']);
  assert.equal(rows[1][1], 'Nathan Kaninda');
  assert.equal(rows[1][5], '6 months');
  assert.ok(rows.some((row) => row[0] === 'Staff' && row[1] === 'Bram De Coninck'));
});

test('the finances CSV lists cash, payroll and sponsorship lines', () => {
  const rows = buildReportRows('finances', context);
  const lines = rows.slice(1).map((row) => `${row[0]}:${row[1]}:${row[2]}`);
  assert.ok(lines.includes('Cash:Balance:-£631K'));
  assert.ok(lines.includes('Cash:Runway:overdrawn'));
  assert.ok(lines.includes('Payroll:Wage bill:£8.66k/wk'));
  assert.ok(lines.includes('Sponsorship:Hoofdsponsor:£250K until 30/06/2028'));
});

test('a report with no finances still exports a header', () => {
  const rows = buildReportRows('finances', { clubName: 'X', saveDate: '', players: [] });
  assert.deepEqual(rows, [['Section', 'Line', 'Value']]);
});

test('file names are filesystem safe', () => {
  const name = buildReportFileName('squad', { ...context, clubName: 'KVV Zelzate / First' }, 'csv');
  assert.equal(name, 'fm27-KVV-Zelzate-First-11-08-2027-squad.csv');
});

test('the report card summarises the save', () => {
  const model = buildReportCardModel(context);
  assert.equal(model.clubName, 'KVV Zelzate');
  assert.equal(model.saveDate, '11/08/2027');
  const byLabel = Object.fromEntries(model.headline.map((stat) => [stat.label, stat.value]));
  assert.equal(byLabel['Squad'], '3');
  assert.equal(byLabel['Staff'], '1');
  assert.equal(byLabel['Wage bill'], '£9K/wk');
  assert.equal(byLabel['Runway'], 'overdrawn');
  assert.equal(byLabel['Expiring in 12 months'], '1');
  assert.equal(model.topPlayers[0].name, 'Nathan Kaninda');
  assert.equal(model.topPlayers[0].rating, '7.42');
});

test('the report card SVG escapes XML and never emits raw markup', () => {
  const model = buildReportCardModel({ ...context, clubName: 'A & B <script>' });
  const svg = buildReportCardSvg(model);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.endsWith('</svg>'));
  assert.match(svg, /A &amp; B &lt;script&gt;/);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /width="1080"/);
});

test('the printable HTML carries the stats and every data row', () => {
  const model = buildReportCardModel(context);
  const report = buildPrintableReportHtml(model, buildReportRows('squad', context));
  assert.match(report.title, /KVV Zelzate/);
  assert.match(report.html, /@page \{ size: A4 portrait/);
  assert.match(report.html, /Wage bill/);
  assert.match(report.html, /<td>Nathan Kaninda<\/td>/);
  assert.match(report.html, /<td>Test Striker, Junior<\/td>/);
});

test('the printable HTML escapes a name that looks like markup', () => {
  const hostile = makePlayer({ id: 'x', name: '<img src=x onerror=alert(1)>', position: 'GK' });
  const model = buildReportCardModel({ ...context, players: [hostile] });
  const report = buildPrintableReportHtml(model, buildReportRows('squad', { ...context, players: [hostile] }));
  assert.doesNotMatch(report.html, /<img src=x/);
  assert.match(report.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('a share summary round-trips through the token', () => {
  const summary = buildShareSummary(context);
  const token = encodeShareSummary(summary);
  assert.ok(token);
  assert.match(token!, /^[A-Za-z0-9_-]+$/);
  const decoded = decodeShareSummary(token);
  assert.deepEqual(decoded, summary);
});

test('the share token stays small and holds no per-player wages or contracts', () => {
  const token = encodeShareSummary(buildShareSummary(context))!;
  assert.ok(token.length < 700, `token was ${token.length} characters`);
  const decoded = decodeShareSummary(token)!;
  const json = JSON.stringify(decoded);
  assert.doesNotMatch(json, /wagePw|expires|contractExpiry|625/);
  assert.equal(decoded.top.length, 2, 'only rated players are listed');
});

test('a mangled or hostile share token is rejected rather than thrown', () => {
  assert.equal(decodeShareSummary(null), null);
  assert.equal(decodeShareSummary(''), null);
  assert.equal(decodeShareSummary('not base64 !!'), null);
  assert.equal(decodeShareSummary('a'.repeat(SHARE_TOKEN_MAX_LENGTH + 1)), null);
  assert.equal(decodeShareSummary('eyJ2IjoyfQ'), null, 'wrong version');
  const noClub = encodeShareSummary({ ...buildShareSummary(context), club: '' });
  assert.equal(decodeShareSummary(noClub), null);
});

test('decoding clamps absurd values instead of trusting them', () => {
  const token = encodeShareSummary({
    ...buildShareSummary(context),
    squad: 99_999,
    staff: -5,
    top: [
      { n: 'y'.repeat(200), p: 'GK', r: '9' },
      ...Array.from({ length: 11 }, () => ({ n: 'short', p: 'GK', r: '9' })),
    ],
  })!;
  const decoded = decodeShareSummary(token)!;
  assert.equal(decoded.squad, 999);
  assert.equal(decoded.staff, 0);
  assert.equal(decoded.top.length, 10);
  assert.equal(decoded.top[0].n.length, 40);
});

test('the description says what the link shows and what it leaves out', () => {
  const lines = describeShareSummary(buildShareSummary(context));
  const text = lines.join(' ');
  assert.match(text, /KVV Zelzate/);
  assert.match(text, /3 players, 1 staff/);
  assert.match(text, /no player list/i);
});

test('no report builder mutates the save it reads', () => {
  const snapshot = JSON.stringify({ players, staff, matches, finances });
  for (const kind of REPORT_KINDS) {
    buildReportRows(kind, context);
    buildReportCsv(kind, context);
  }
  buildReportCardModel(context);
  buildShareSummary(context);
  assert.equal(JSON.stringify({ players, staff, matches, finances }), snapshot);
});
