import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaffDirectory } from '../components/StaffDirectory';
import { hydratePass0Payload } from './fmSaveHydrator';
import { normalizeJobVacancy } from './jobVacancies';
import { StaffRecord } from '../types/fm27';

const rawVacancy = {
  team_id: 45759,
  club_uid: 673,
  club_name: 'Leicester City',
  team_slot: 2,
  advertised_date: '2026-07-13',
  competition_id: 5461,
  competition_name: 'Sky Bet Championship',
  league_position: 14,
  unknown: "{'role': 20, 'advertised_slot': 13, 'date_12': 132782797, 'u20': 28, 'b24': 0}",
};

test('normalizeJobVacancy reads fmsave role codes and club_name', () => {
  const vacancy = normalizeJobVacancy(rawVacancy as never);

  assert.equal(vacancy.role, 'Assistant Manager');
  assert.equal(vacancy.club, 'Leicester City');
  assert.equal(vacancy.league, 'Sky Bet Championship');
  assert.equal(vacancy.advertisedDate, '2026-07-13');
  assert.equal(vacancy.leaguePosition, 14);
  assert.equal(vacancy.roleCode, 20);
});

test('normalizeJobVacancy handles object role maps and unknown codes honestly', () => {
  assert.equal(
    normalizeJobVacancy({ club_name: 'Ajax', unknown: { role: 2 } } as never).role,
    'Coach'
  );
  assert.equal(
    normalizeJobVacancy({ club_name: 'Ajax', unknown: "{'role': 999}" } as never).role,
    'Staff'
  );
  assert.equal(normalizeJobVacancy({} as never).club, 'Unknown');
});

test('hydratePass0Payload normalizes decoded job vacancies', () => {
  const hydrated = hydratePass0Payload(
    JSON.stringify({ clubUid: 18104898, jobVacancies: [rawVacancy] })
  );

  assert.equal(hydrated.jobVacancies[0].role, 'Assistant Manager');
  assert.equal(hydrated.jobVacancies[0].club, 'Leicester City');
});

test('StaffDirectory renders a real decoded vacancy instead of filtering it out', () => {
  const staff: StaffRecord = {
    id: 'm',
    name: 'Alex Manager',
    role: 'Manager',
    age: 42,
    nation: 'BEL',
    club: 'KVV Zelzate',
    wagePw: 450,
    expires: '30/06/2028',
    attributes: {
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
    },
  };

  const html = renderToStaticMarkup(
    React.createElement(StaffDirectory, {
      staff: [staff],
      saveDate: '15/09/2027',
      clubName: 'KVV Zelzate',
      jobVacancies: [rawVacancy as never],
      onSelectStaff: () => {},
    })
  );

  assert.ok(html.includes('Open Market Vacancies (1)'));
  assert.ok(html.includes('Assistant Manager'));
  assert.ok(html.includes('Leicester City'));
});
