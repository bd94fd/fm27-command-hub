import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaffDirectory } from '../components/StaffDirectory';
import { StaffDetailModal } from '../components/StaffDetailModal';
import { StaffAttributes, StaffRecord } from '../types/fm27';

const ROOT = process.cwd();
const readSrc = (relPath: string) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('Staff tab exposes the 4-tile KPI strip and two clean sub-tabs', () => {
  const src = readSrc('src/components/StaffDirectory.tsx');

  for (const label of [
    'Total Staff',
    'Weekly Staff Payroll',
    'Expiring Soon',
    'Avg Staff Rating',
  ]) {
    assert.ok(src.includes(label), `KPI strip is missing ${label}`);
  }
  assert.match(src, /computeStaffKpiSummary/);
  assert.match(src, /grid grid-cols-2 sm:grid-cols-4/);

  assert.match(src, /label: 'Directory'/);
  assert.match(src, /label: 'Training & Dept Matrix'/);
  assert.match(src, /min-h-\[36px\]/);
  assert.match(src, /buildUnifiedStaffMatrix/);

  // The old duplicate matrix walls must be gone.
  assert.doesNotMatch(src, /Backroom Department Efficiency Matrix/);
  assert.doesNotMatch(src, /FM27 Coaching Category Rating Matrix/);
  assert.doesNotMatch(src, /evaluateBackroomDepartmentEfficiency/);
});

test('Staff tab keeps Preferred Job Affinity inside the detail modal only', () => {
  const directory = readSrc('src/components/StaffDirectory.tsx');
  const modal = readSrc('src/components/StaffDetailModal.tsx');

  assert.doesNotMatch(directory, /jobRatings/);
  assert.match(modal, /PREFERRED_JOB_AFFINITY_CAPTION/);
  for (const label of [
    'Fitness Coach',
    'Goalkeeping Coach',
    'Set-Piece Coach',
    'Loan Manager',
    'Physio',
    'Sports Scientist',
  ]) {
    assert.ok(modal.includes(label), `detail modal is missing ${label}`);
  }
  assert.match(directory, /focus-visible:ring-2/);
});

test('Hub Finances panel is driven by clubFinances and staffRatings selectors', () => {
  const src = readSrc('src/components/AutoSyncWorkspace.tsx');

  assert.match(src, /buildFinancesPanelFromSave/);
  for (const label of [
    'Club Finances',
    'Cash &amp; Runway',
    'Weekly Payroll Breakdown',
    'Sponsorship Deals',
    'Player Wage Bill (Canonical)',
    'Player Wage Budget',
    'Weekly Staff Payroll',
    'Squad Wage Subtotal',
    'a subset of the player wage bill, not a club total',
  ]) {
    assert.ok(src.includes(label), `Finances panel is missing ${label}`);
  }
  assert.match(src, /datesReordered/);
  assert.match(src, /Dates reordered/);
  assert.match(src, /staff wages are separate and not included/);
  assert.match(src, /separate from the player wage bill/);

  // The old claim that the finance-table wage figure includes all staff is false.
  const analyst = readSrc('src/utils/tacticalAnalystContext.ts');
  assert.doesNotMatch(analyst, /all players in every squad plus all staff/);
  assert.match(analyst, /Staff wages are separate and can exceed it/);
  const saveCache = readSrc('src/services/saveCache.ts');
  assert.doesNotMatch(saveCache, /players \+ staff/);
  assert.match(saveCache, /It does NOT include staff wages/);
  // Finances stays a Hub sub-tab; it must not become a 7th top-level nav tab.
  assert.doesNotMatch(src, /id: 'finances' as const, label:/);
});

test('Clear Chat requires a confirmation step instead of wiping history immediately', () => {
  const src = readSrc('src/components/AutoSyncWorkspace.tsx');

  assert.match(src, /onClick=\{armClearChat\}/);
  assert.match(src, /onClick=\{handleConfirmClearChat\}/);
  assert.match(src, /onClick=\{disarmClearChat\}/);
  assert.ok(src.includes('Confirm Clear'));
  assert.ok(src.includes('Cancel'));
  assert.match(src, /\}, 5000\);/);
  assert.doesNotMatch(
    src,
    /onClick=\{\(\) => \{\s*clearClubChatHistory\(chatClubKey\);/,
    'Clear Chat must not call clearClubChatHistory straight from a click handler'
  );
});

test('MobileSheetFrame adds initial focus, a focus trap, and focus restore', () => {
  const src = readSrc('src/components/MobileSheetFrame.tsx');

  assert.match(src, /FOCUSABLE_SELECTOR/);
  assert.match(src, /getFocusableElements/);
  assert.match(src, /focusInitial/);
  assert.match(src, /previouslyFocused\.focus\(\)/);
  assert.match(src, /handleSurfaceKeyDown/);
  assert.match(src, /tabIndex=\{-1\}/);
  assert.match(src, /acquireBodyScrollLock\(\)/);
});

test('muted informational labels were bumped off text-slate-500', () => {
  const positional = readSrc('src/components/recruitment/PositionalDepthView.tsx');
  assert.match(positional, /text-micro text-slate-400 italic/);

  const progression = readSrc('src/components/squad/SquadProgressionView.tsx');
  assert.equal(
    (progression.match(/text-2xs text-slate-500 dark:text-slate-400 mt-0\.5/g) ?? [])
      .length,
    4
  );

  const diff = readSrc('src/components/SaveSnapshotDiffPanel.tsx');
  assert.match(diff, /text-2xs text-slate-400/);
  assert.match(diff, /text-micro text-slate-400 py-0\.5/);
  assert.match(diff, /text-2xs text-slate-400 pt-0\.5/);

  const archive = readSrc('src/components/MatchLogArchive.tsx');
  assert.equal(
    (archive.match(/className="mt-1 text-micro text-slate-400"/g) ?? []).length,
    2
  );
});

test('Staff and Finances functional labels stay at 11px or above', () => {
  const staff = readSrc('src/components/StaffDirectory.tsx');
  assert.doesNotMatch(staff, /text-\[9px\]|text-3xs/);
  assert.doesNotMatch(staff, /text-2xs|text-2xs/);
  assert.match(staff, /placeholder:text-slate-400/);
  assert.match(staff, /text-micro font-bold uppercase tracking-wider text-slate-400 leading-tight/);
  assert.match(staff, /grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2/);

  const hub = readSrc('src/components/AutoSyncWorkspace.tsx');
  assert.match(
    hub,
    /text-micro font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight/
  );
  assert.match(
    hub,
    /text-xs text-slate-500 dark:text-slate-400 break-words/
  );
});

test('audited controls expose focus-visible rings instead of bare focus:outline-none', () => {
  for (const relPath of [
    'src/components/LastMatchTacticBlueprintCard.tsx',
    'src/components/KnowledgeBasePanel.tsx',
  ]) {
    const src = readSrc(relPath);
    assert.doesNotMatch(src, /focus:outline-none/, `${relPath} still has bare focus:outline-none`);
    assert.match(src, /focus-visible:ring-2/, `${relPath} needs focus-visible:ring-2`);
  }
});


const BASE_ATTRIBUTES: StaffAttributes = {
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

const makeRosterStaff = (
  id: string,
  name: string,
  role: string,
  wagePw: number,
  expires: string,
  attributes: Partial<StaffAttributes> = {}
): StaffRecord => ({
  id,
  name,
  role,
  age: 42,
  nation: 'BEL',
  club: 'KVV Zelzate',
  wagePw,
  expires,
  attributes: { ...BASE_ATTRIBUTES, ...attributes },
});

test('StaffDirectory server-renders the KPI strip, filter pills, and scannable cards', () => {
  const staff = [
    makeRosterStaff('m', 'Alex Manager', 'Manager', 450, '30/06/2028', {
      attacking: 18,
      technical: 18,
      tactical: 18,
      determination: 18,
      authority: 18,
      motivating: 18,
    }),
    makeRosterStaff('s', 'Sam Scout', 'Chief Scout', 500, '30/06/2031', {
      judging_player_ability: 19,
      judging_player_potential: 19,
      adaptability: 18,
    }),
    makeRosterStaff('p', 'Pat Physio', 'Head Physio', 600, '30/06/2029', {
      physiotherapy: 19,
      sports_science: 18,
    }),
  ];

  const html = renderToStaticMarkup(
    React.createElement(StaffDirectory, {
      staff,
      saveDate: '15/02/2028',
      clubName: 'KVV Zelzate',
      onSelectStaff: () => {},
    })
  );

  for (const label of [
    'Total Staff',
    'Weekly Staff Payroll',
    'Expiring Soon',
    'Avg Staff Rating',
    'Directory',
    'Training &amp; Dept Matrix',
    'All (3)',
    'Coaching (1)',
    'Scouting (1)',
    'Medical (1)',
    'Alex Manager',
    'Sam Scout',
    'Pat Physio',
    'Dept Role Rating',
    'Weekly Wage',
    'Contract Expiry',
    '£1,550/wk',
  ]) {
    assert.ok(html.includes(label), `rendered Staff tab is missing ${label}`);
  }

  assert.ok(html.includes('Player Scouting &amp; Recruitment'), 'scout headline must be scouting');
  assert.ok(html.includes('Medical &amp; Sports Science'), 'physio headline must be medical');
  // Directory is the default view, so the unified matrix is not mounted yet.
  assert.ok(!html.includes('Training &amp; Department Matrix'));
});


test('StaffDetailModal renders Preferred Job Affinity wording above the six job ratings', () => {
  const scout: StaffRecord = {
    ...makeRosterStaff('s2', 'Sam Scout', 'Chief Scout', 500, '30/06/2031', {
      judging_player_ability: 19,
      judging_player_potential: 19,
      adaptability: 18,
    }),
    jobRatings: {
      fitness_coach: 1,
      goalkeeping_coach: 2,
      set_piece_coach: 1,
      loan_manager: 3,
      physio: 1,
      sports_scientist: 2,
    },
  };

  const html = renderToStaticMarkup(
    React.createElement(StaffDetailModal, { staff: scout, onClose: () => {} })
  );

  assert.ok(
    html.includes(
      'Preferred Job Affinity (0–20, NOT coaching/scouting ability'
    )
  );
  assert.ok(html.includes('do NOT treat 20/20 as elite skill'));
  for (const label of [
    'Fitness Coach',
    'Goalkeeping Coach',
    'Set-Piece Coach',
    'Loan Manager',
    'Physio',
    'Sports Scientist',
  ]) {
    assert.ok(html.includes(label), `detail modal is missing ${label}`);
  }
});
