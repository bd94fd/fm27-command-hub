import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  inspectFmSaveBuffer,
  parseFmStructuredExport,
  mergeParsedPlayersIntoSquad,
} from './fmFileImporter';
import { SQUAD_PLAYERS } from '../data/squadData';

test('inspectFmSaveBuffer detects FMF binary header, version, date, and club metadata without fabricating tables', () => {
  const samplePayload =
    'fmf.\x03\x00\x00\x00Football Manager 27 27.1.0\x00KVV Zelzate\x00Bobby Dean\x0018/09/2027\x00Mbey Epolo\x00Matteo Polizzi\x00\x78\x9c\xed\x01';
  const buf = new ArrayBuffer(samplePayload.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < samplePayload.length; i++) {
    view[i] = samplePayload.charCodeAt(i);
  }

  const res = inspectFmSaveBuffer(
    buf,
    'KVV_Zelzate_Sep2027.fm',
    Date.now(),
    ['Mbey Epolo', 'Matteo Polizzi']
  );

  assert.equal(res.canExtractFullTables, false);
  assert.equal(res.isCompressedOrEncrypted, true);
  assert.match(res.containerFormat, /FMF Archive/i);
  assert.equal(res.detectedVersion, '27.1.0');
  assert.ok(res.detectedDates.includes('18/09/2027'));
  assert.ok(res.detectedClubsOrKeywords.includes('KVV Zelzate'));
  assert.ok(res.matchedSquadPlayers.includes('Mbey Epolo'));
  assert.ok(res.matchedSquadPlayers.includes('Matteo Polizzi'));
});

test('parseFmStructuredExport parses real FM27 Attributes CSV and merges attribute changes into squad', () => {
  const csvPath = path.resolve(
    process.cwd(),
    'src/utils/__fixtures__/player-database_20261118_093343_11119b9e.csv'
  );
  const rawCsv = fs.readFileSync(csvPath, 'utf-8');

  const parsed = parseFmStructuredExport(
    rawCsv,
    'player-database_20261118_093343.csv'
  );
  assert.equal(parsed.format, 'CSV');
  assert.equal(parsed.exportType, 'FM_ATTRIBUTES_TABLE');
  assert.equal(parsed.parsedPlayers.length, 28);

  const epolo = parsed.parsedPlayers.find((p) => p.name === 'Mbey Epolo');
  assert.ok(epolo);
  assert.equal(epolo.attributes?.finishing, 13);
  assert.equal(epolo.attributes?.determination, 16);

  const merged = mergeParsedPlayersIntoSquad(
    SQUAD_PLAYERS,
    parsed.parsedPlayers
  );
  assert.equal(merged.matchedCount, 28);
});

test('parseFmStructuredExport parses real FM27 Stats CSV and updates squad stats & ratings', () => {
  const csvPath = path.resolve(
    process.cwd(),
    'src/utils/__fixtures__/player-database_20261118_093204_3aa9853a.csv'
  );
  const rawCsv = fs.readFileSync(csvPath, 'utf-8');

  const parsed = parseFmStructuredExport(
    rawCsv,
    'player-database_20261118_093204.csv'
  );
  assert.equal(parsed.format, 'CSV');
  assert.equal(parsed.exportType, 'FM_STATS_TABLE');
  assert.equal(parsed.parsedPlayers.length, 28);

  // Initialize base squad from parsed export
  const initial = mergeParsedPlayersIntoSquad(
    [],
    parsed.parsedPlayers
  );
  assert.equal(initial.matchedCount, 28);

  // Modify Mbey Epolo in parsed delta to simulate a new matchday export
  const epoloDelta = parsed.parsedPlayers.find((p) => p.name === 'Mbey Epolo');
  assert.ok(epoloDelta);
  epoloDelta.goals = 5;
  epoloDelta.minutes = 401;
  epoloDelta.rating = 7.45;

  const merged = mergeParsedPlayersIntoSquad(
    initial.updatedSquad,
    parsed.parsedPlayers
  );
  assert.equal(merged.matchedCount, 28);
  const updatedEpolo = merged.updatedSquad.find((p) => p.name === 'Mbey Epolo');
  assert.equal(updatedEpolo?.goals, 5);
  assert.equal(updatedEpolo?.minutes, 401);
  assert.equal(updatedEpolo?.rating, 7.45);
  assert.ok(
    merged.changedPlayers.some(
      (c) => c.name === 'Mbey Epolo' && c.changes.some((s) => s.includes('Goals'))
    )
  );
});

test('parseFmStructuredExport parses FM27 Ctrl+P HTML table exports cleanly', () => {
  const html = `
    <html><body><table>
      <tr><th>Name</th><th>Pos</th><th>Apps</th><th>Mins</th><th>Av Rat</th><th>Gls</th><th>Ast</th></tr>
      <tr><td>Mbey Epolo</td><td>ST (C)</td><td>5</td><td>401</td><td>7.35</td><td>5</td><td>1</td></tr>
      <tr><td>Matteo Polizzi</td><td>M/AM (RL)</td><td>2 (3)</td><td>293</td><td>7.15</td><td>0</td><td>2</td></tr>
    </table></body></html>
  `;

  const parsed = parseFmStructuredExport(html, 'squad-stats-md5.html');
  assert.equal(parsed.format, 'HTML');
  assert.equal(parsed.exportType, 'FM_STATS_TABLE');
  assert.equal(parsed.parsedPlayers.length, 2);
  assert.equal(parsed.parsedPlayers[0].name, 'Mbey Epolo');
  assert.equal(parsed.parsedPlayers[0].goals, 5);
  assert.equal(parsed.parsedPlayers[1].assists, 2);
});
