import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSaveDateMs, selectJourneyPair } from './saveJourneyTimeline.ts';

const point = (clubName: string, inGameDate: string, capturedAt: string) => ({
  clubName,
  inGameDate,
  capturedAt,
});

test('parseSaveDateMs reads the in-game DD/MM/YYYY date and falls back to ISO', () => {
  assert.equal(parseSaveDateMs('11/08/2027'), Date.UTC(2027, 7, 11));
  assert.equal(parseSaveDateMs('2027-08-11T00:00:00Z'), Date.UTC(2027, 7, 11));
  assert.equal(parseSaveDateMs('not a date'), 0);
  assert.equal(parseSaveDateMs(undefined), 0);
});

test('selectJourneyPair compares the two newest saves of one club', () => {
  const items = [
    point('KVV Zelzate', '01/09/2027', '2027-09-01T10:00:00Z'),
    point('KVV Zelzate', '11/08/2027', '2027-08-11T10:00:00Z'),
    point('Other FC', '20/09/2027', '2027-09-20T10:00:00Z'),
  ];
  const pair = selectJourneyPair(items);
  assert.equal(pair?.latest.inGameDate, '01/09/2027');
  assert.equal(pair?.previous.inGameDate, '11/08/2027');
  assert.equal(pair?.sameClub.length, 2);
});

test('selectJourneyPair honours an explicit club and needs two saves of it', () => {
  const items = [
    point('Other FC', '20/09/2027', '2027-09-20T10:00:00Z'),
    point('KVV Zelzate', '01/09/2027', '2027-09-01T10:00:00Z'),
    point('KVV Zelzate', '11/08/2027', '2027-08-11T10:00:00Z'),
  ];
  assert.equal(selectJourneyPair(items, 'KVV Zelzate')?.latest.inGameDate, '01/09/2027');
  assert.equal(selectJourneyPair(items, 'Other FC'), null);
  assert.equal(selectJourneyPair(items, 'Nobody FC'), null);
});

test('selectJourneyPair returns null until there is a before and an after', () => {
  assert.equal(selectJourneyPair([]), null);
  assert.equal(selectJourneyPair([point('KVV Zelzate', '11/08/2027', '2027-08-11T10:00:00Z')]), null);
});

test('selectJourneyPair breaks a same-date tie on capture time', () => {
  const items = [
    point('KVV Zelzate', '11/08/2027', '2027-08-11T09:00:00Z'),
    point('KVV Zelzate', '11/08/2027', '2027-08-11T18:00:00Z'),
  ];
  const pair = selectJourneyPair(items);
  assert.equal(pair?.latest.capturedAt, '2027-08-11T18:00:00Z');
  assert.equal(pair?.previous.capturedAt, '2027-08-11T09:00:00Z');
});
