import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaffDirectory } from '../components/StaffDirectory';
import {
  filterUsableSponsorshipDeals,
  isUsableSponsorshipDeal,
} from '../components/AutoSyncWorkspace';
import { StaffAttributes, StaffRecord } from '../types/fm27';

const ROOT = process.cwd();
const readSrc = (relPath: string) =>
  fs.readFileSync(path.join(ROOT, relPath), 'utf8');

const attributes: StaffAttributes = {
  attacking: 17,
  defending: 11,
  fitness: 9,
  goalkeeping: 4,
  mental: 14,
  possession: 15,
  set_pieces: 12,
  tactical: 16,
  technical: 16,
  working_with_youngsters: 15,
  adaptability: 12,
  authority: 15,
  determination: 16,
  judging_player_ability: 14,
  judging_player_potential: 14,
  judging_staff_ability: 12,
  man_management: 15,
  motivating: 16,
  negotiating: 10,
  physiotherapy: 3,
  sports_science: 5,
  tactical_knowledge: 16,
  analysing_data: 14,
};

const makeStaff = (overrides: Partial<StaffRecord>): StaffRecord => ({
  id: 'staff-1',
  name: 'Alex Coach',
  role: 'Assistant Manager',
  age: 41,
  nation: 'BEL',
  club: 'KVV Zelzate',
  wagePw: 450,
  expires: '30/06/2031',
  attributes,
  secondaryJob: null,
  jobRatings: null,
  ...overrides,
});

test('generic "Staff · Club" vacancy placeholders are filtered out', () => {
  const html = renderToStaticMarkup(
    React.createElement(StaffDirectory, {
      staff: [makeStaff({})],
      jobVacancies: [
        { role: 'Staff', club: 'Club' },
        { role: '', club: '' },
        { role: '--', club: '--' },
      ],
      onSelectStaff: () => {},
    })
  );
  assert.ok(
    !html.includes('Open Market Vacancies'),
    'generic placeholders must not render a vacancy box'
  );
});

test('real vacancies still render with their decoded role and club', () => {
  const html = renderToStaticMarkup(
    React.createElement(StaffDirectory, {
      staff: [makeStaff({})],
      jobVacancies: [
        { role: 'Staff', club: 'Club' },
        { role: 'Head of Youth Development', club: 'Anderlecht' },
      ],
      onSelectStaff: () => {},
    })
  );
  assert.ok(html.includes('Open Market Vacancies (1)'));
  assert.ok(html.includes('Head of Youth Development · Anderlecht'));
  assert.ok(!html.includes('Staff · Club'));
});

test('board/executive staff render a BOARD label and Board filter', () => {
  const html = renderToStaticMarkup(
    React.createElement(StaffDirectory, {
      staff: [
        makeStaff({ id: 'board-1', name: 'Elite Chair', role: 'Chairperson' }),
        makeStaff({ id: 'coach-1' }),
      ],
      onSelectStaff: () => {},
    })
  );
  assert.ok(html.includes('Board (1)'), 'Board filter pill is missing');
  assert.ok(
    html.includes('uppercase tracking-wider text-slate-400">board<'),
    'Board department pill is missing'
  );
});

test('sponsorship filter drops placeholders but keeps amount-only and expiry-only rows', () => {
  assert.equal(isUsableSponsorshipDeal({ annualValue: null, expires: '--' }), false);
  assert.equal(isUsableSponsorshipDeal({ annualValue: null, expires: '' }), false);
  assert.equal(isUsableSponsorshipDeal({ annualValue: null, expires: 'Unknown' }), false);
  assert.equal(isUsableSponsorshipDeal({ annualValue: 1_500_000, expires: '--' }), true);
  assert.equal(isUsableSponsorshipDeal({ annualValue: null, expires: '30/06/2028' }), true);
  assert.equal(
    isUsableSponsorshipDeal({
      annual_value: 227_145,
      end: '2030-05-23',
      dates_reordered: false,
    } as never),
    true,
    'fmsave snake_case sponsorship rows must not be filtered out'
  );

  const filtered = filterUsableSponsorshipDeals([
    { name: 'Kit Deal', annualValue: 1_500_000, expires: '30/06/2028' },
    { name: 'Placeholder', annualValue: null, expires: '--' },
    { name: 'Expiry only', annualValue: null, expires: '30/06/2029' },
    { name: 'Amount only', annualValue: 250_000, expires: null },
    {
      annual_value: 227_145,
      end: '2030-05-23',
      dates_reordered: false,
    } as never,
  ]);
  assert.equal(filtered?.length, 4);
  assert.deepEqual(
    filtered?.map((deal) => deal.name),
    ['Kit Deal', 'Expiry only', 'Amount only', 'Sponsorship 5']
  );
  assert.equal(filtered?.[3].annualValue, 227_145);
  assert.equal(filtered?.[3].expires, '2030-05-23');
  assert.equal(filterUsableSponsorshipDeals(null), null);
  assert.equal(filterUsableSponsorshipDeals(undefined), null);
});

test('matrix is a compact two-column grid on mobile and no longer ellipsizes unit or lead text', () => {
  const src = readSrc('src/components/StaffDirectory.tsx');
  assert.match(src, /grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2/);
  assert.doesNotMatch(src, /text-xs font-bold text-white truncate/);
  assert.match(src, /text-xs text-slate-300 break-words/);
  assert.doesNotMatch(src, /text-\[10px\] text-slate-400 truncate/);
  assert.match(src, /Board \/\s+Executive staff are excluded/);
});

test('matrix header explains the absolute star scale and overload rule', () => {
  const src = readSrc('src/components/StaffDirectory.tsx');
  assert.match(src, /absolute global scale, not a league-relative one/);
  assert.match(src, /best assigned coach sets each unit's stars/);
  assert.match(src, /3\+ pitch units is overloaded and hurts/);
  assert.match(src, /Overloaded: \$\{overloadedLeads\[0\]\.name\}/);
});

test('Hub finances uses filtered sponsorships and the compact empty note', () => {
  const panel = readSrc('src/components/AutoSyncWorkspace.tsx');
  // The panel and the share/export report share one builder, so they cannot disagree.
  assert.match(panel, /buildFinancesPanelFromSave\(/);
  assert.match(panel, /No decoded sponsorship amounts in this save/);
  const builder = readSrc('src/utils/clubFinances.ts');
  assert.match(builder, /filterUsableSponsorshipDeals\(decoded\?\.sponsorships\)/);
});
