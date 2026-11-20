import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectFmFileHeader,
  formatFmPositionText,
  mergeParsedPlayersIntoSquad,
  normalizeImportedSavePayload,
  parseFmStructuredExport,
  resolveCompetitionName,
  resolveNationName,
} from './fmSaveImport';

test('formatFmPositionText produces authentic FM27 positional strings', () => {
  assert.equal(
    formatFmPositionText({
      GK: 20, DL: 1, DC: 1, DR: 1, WBL: 1, WBR: 1, DM: 1, ML: 1, MC: 1, MR: 1, AML: 1, AMC: 1, AMR: 1, ST: 1,
    }),
    'GK',
  );
  assert.equal(
    formatFmPositionText({
      GK: 1, DL: 18, DC: 1, DR: 20, WBL: 16, WBR: 19, DM: 1, ML: 1, MC: 1, MR: 1, AML: 1, AMC: 1, AMR: 1, ST: 1,
    }),
    'D/WB(RL)',
  );
  assert.equal(
    formatFmPositionText({
      GK: 1, DL: 1, DC: 1, DR: 1, WBL: 1, WBR: 1, DM: 16, ML: 1, MC: 20, MR: 1, AML: 1, AMC: 18, AMR: 1, ST: 1,
    }),
    'DM,M/AM(C)',
  );
  assert.equal(
    formatFmPositionText({
      GK: 1, DL: 1, DC: 1, DR: 1, WBL: 1, WBR: 1, DM: 1, ML: 1, MC: 1, MR: 1, AML: 18, AMC: 1, AMR: 20, ST: 16,
    }),
    'AM(RL),ST',
  );
});

test('detectFmFileHeader identifies .fm saves, zstd headers, JSON, HTML, CSV, and RTF exports', () => {
  assert.equal(detectFmFileHeader(new Uint8Array([0x28, 0xb5, 0x2f, 0xfd]), 'career.fm'), 'fm_save');
  assert.equal(detectFmFileHeader(new Uint8Array([0x28, 0xb5, 0x2f, 0xfd]), 'unknown.bin'), 'fm_save');
  assert.equal(detectFmFileHeader(new TextEncoder().encode('{"players":[]}'), 'snap.json'), 'json_snapshot');
  assert.equal(detectFmFileHeader(new TextEncoder().encode('<html><table></table></html>'), 'squad.html'), 'html_export');
  assert.equal(detectFmFileHeader(new TextEncoder().encode('Name,Age\nTest,20'), 'squad.csv'), 'csv_export');
  assert.equal(detectFmFileHeader(new TextEncoder().encode('| Name | Age |'), 'squad.rtf'), 'rtf_export');
});

test('resolveNationName and resolveCompetitionName map standard FM DB IDs', () => {
  assert.equal(resolveNationName(765), 'England');
  assert.equal(resolveNationName(784), 'Netherlands');
  assert.equal(resolveNationName(757), 'Belgium');
  assert.equal(resolveNationName(793), 'Scotland');
  assert.equal(resolveNationName(999999), 'Nation #999999');
  assert.equal(resolveCompetitionName(null, 11), 'Premier League');
  assert.equal(resolveCompetitionName('Custom Cup', 11), 'Custom Cup');
});

test('normalizeImportedSavePayload maps fmsave extraction and strictly preserves null for missing facilities, coefficients, attributes, and match xG', () => {
  const raw = {
    ok: true,
    meta: {
      game: 'FM27',
      build: '27.1.0',
      knownBuild: true,
      saveName: 'Test_Save.fm',
      gameDate: '2026-09-14',
      fmsaveVersion: '0.14.1',
      totalPlayersInSave: 64210,
      totalStaffInSave: 14200,
      totalClubsInSave: 9800,
      managedSquadCount: 1,
      managedStaffCount: 1,
    },
    managedClub: {
      uid: 602,
      name: 'Arsenal',
      shortName: 'Arsenal',
      managerName: 'Bobby Dean',
    },
    clubs: [
      {
        uid: 602,
        uniqueId: 602,
        name: 'Arsenal',
        shortName: 'Arsenal',
        nationDbId: 765,
        reputation: 9100,
        isManaged: true,
        finances: {
          balance: 148500000,
          transferBudget: 72000000,
          wageBudgetWeekly: 4200000,
          wagePayrollWeekly: 3850000,
        },
      },
    ],
    players: [
      {
        uid: 28108498,
        uniqueId: 28108498,
        name: 'Bukayo Saka',
        age: 25,
        dob: '2001-09-05',
        heightCm: 178,
        nationDbId: 765,
        clubNationDbId: 765,
        clubUid: 602,
        club: 'Arsenal',
        playingClub: 'Arsenal',
        onLoan: false,
        ca: 176,
        pa: 184,
        salaryWeekly: 295000,
        estimatedValue: 140000000,
        contractStart: '2023-05-23',
        contractEnd: '2029-06-30',
        squadStatus: 'STAR_PLAYER',
        clauses: [{ kind: 'MINIMUM_FEE_RELEASE', value: 185000000 }],
        leftFoot: 20,
        rightFoot: 13,
        injured: false,
        positions: { gk: 1, dl: 14, dc: 1, dr: 1, wbl: 12, wbr: 1, dm: 1, ml: 14, mc: 1, mr: 16, aml: 15, amc: 13, amr: 20, st: 10 },
        attributes: { dribbling: 17, finishing: 15, passing: 16, acceleration: 17, pace: 16, professionalism: 17 },
      },
    ],
    staff: [
      {
        uid: 9101,
        name: 'Nicolas Jover',
        job: 'COACH',
        clubUid: 602,
        club: 'Arsenal',
        nationDbId: 769,
        age: 44,
        ca: 165,
        pa: 175,
        salaryWeekly: 22000,
        contractEnd: '2028-06-30',
        attributes: { setPieces: 20, tactical: 18, technical: 16, determination: 17, levelOfDiscipline: 16, motivating: 16 },
      },
    ],
    competitions: [{ id: 1, databaseId: 11, name: null, stageCount: 2 }],
    fixtures: [
      {
        date: '2026-09-09',
        kickOff: '15:00',
        competitionDbId: 11,
        homeClub: 'Arsenal',
        awayClub: 'Chelsea',
        venue: 'Emirates Stadium',
        status: 'Played',
        homeGoals: 2,
        awayGoals: 1,
      },
    ],
    tactics: [
      {
        name: 'Portable 4-3-3',
        styleName: 'Fluid Counter-Attack',
        mentality: 'POSITIVE',
        slots: [
          { number: 1, positions: ['GOALKEEPER'] },
          { number: 2, positions: ['DEFENDER_RIGHT'] },
          { number: 3, positions: ['DEFENDER_CENTRE'] },
          { number: 4, positions: ['DEFENDER_CENTRE'] },
          { number: 5, positions: ['DEFENDER_LEFT'] },
          { number: 6, positions: ['DEFENSIVE_MIDFIELDER'] },
          { number: 7, positions: ['MIDFIELDER_CENTRE'] },
          { number: 8, positions: ['MIDFIELDER_CENTRE'] },
          { number: 9, positions: ['ATTACKING_MIDFIELDER_RIGHT'] },
          { number: 10, positions: ['ATTACKING_MIDFIELDER_LEFT'] },
          { number: 11, positions: ['STRIKER_CENTRE'] },
        ],
      },
    ],
    warnings: [],
  };

  const normalized = normalizeImportedSavePayload(raw);
  assert.equal(normalized.snapshot.metadata.status, 'loaded');
  assert.equal(normalized.managedClubName, 'Arsenal');
  assert.equal(normalized.snapshot.metadata.gameDate, '2026-09-14');

  // Verify ZERO synthetic club facilities (never 14!) or synthetic coefficients
  const club = normalized.snapshot.clubs[0];
  assert.equal(club.balance, 148500000);
  assert.equal(club.trainingFacilities, null);
  assert.equal(club.youthFacilities, null);
  assert.equal(club.youthCoaching, null);
  assert.equal(club.youthRecruitment, null);
  assert.equal(club.corporateFacilities, null);
  assert.equal(club.coefficients, null);

  // Verify populated attributes & null preservation on missing attributes
  const player = normalized.snapshot.players[0];
  assert.equal(player.name, 'Bukayo Saka');
  assert.equal(player.nationality, 'England');
  assert.equal(player.wagePw, 295000);
  assert.equal(player.clauses[0].value, 185000000);
  assert.equal(player.attributes.professionalism, 17);
  assert.equal(player.attributes.long_throws, null);
  assert.equal(player.attributes.handling, null);

  // Verify staff null preservation on missing attributes
  const staff = normalized.snapshot.staff[0];
  assert.equal(staff.job, 'Coach');
  assert.equal(staff.nationality, 'France');
  assert.equal(staff.attributes.set_pieces, 20);
  assert.equal(staff.attributes.adaptability, null);

  // Verify played fixture created MatchLogEntry with null xG/possession (never fabricated!)
  assert.equal(normalized.snapshot.matchLogs.length, 1);
  assert.equal(normalized.snapshot.matchLogs[0].result, 'W');
  assert.equal(normalized.snapshot.matchLogs[0].score, '2 - 1');
  assert.equal(normalized.snapshot.matchLogs[0].xGFor, null);
  assert.equal(normalized.snapshot.matchLogs[0].possession, null);
  assert.equal(normalized.snapshot.matchLogs[0].passCompletion, null);
  assert.equal(normalized.snapshot.matchLogs[0].cccFor, null);

  // Verify dual-phase tactic slots (no legacy duty)
  assert.equal(normalized.tactics.length, 1);
  assert.equal(normalized.tactics[0].slots[0].inPossessionRole, 'Ball-Playing Goalkeeper');
  assert.equal(normalized.tactics[0].slots[0].outOfPossessionRole, 'Sweeper Keeper');
});

test('parseFmStructuredExport parses CSV/HTML/RTF without fabricating missing attributes and merges cleanly', () => {
  const html = `
    <html><body><table>
      <tr><th>Name</th><th>Age</th><th>Nat</th><th>Club</th><th>Position</th><th>CA</th><th>PA</th><th>Wage</th><th>Value</th></tr>
      <tr><td>Ethan Nwaneri</td><td>19</td><td>England</td><td>Arsenal</td><td>AM(RC)</td><td>142</td><td>178</td><td>£45,000</td><td>£38M</td></tr>
      <tr><td>Myles Lewis-Skelly</td><td>19</td><td>England</td><td>Arsenal</td><td>D/WB(L),DM</td><td>140</td><td>172</td><td>£35,000</td><td>£32M</td></tr>
    </table></body></html>
  `;
  const parsedHtml = parseFmStructuredExport(html, 'arsenal_squad.html');
  assert.equal(parsedHtml.format, 'HTML');
  assert.equal(parsedHtml.players.length, 2);
  assert.equal(parsedHtml.detectedClub, 'Arsenal');
  assert.equal(parsedHtml.players[0].name, 'Ethan Nwaneri');
  assert.equal(parsedHtml.players[0].wagePw, 45000);
  assert.equal(parsedHtml.players[0].estimatedValue, 38000000);
  // Missing attributes MUST remain null (never fabricated from CA!)
  assert.equal(parsedHtml.players[0].attributes.pace, null);
  assert.equal(parsedHtml.players[0].attributes.finishing, null);

  const statsPipe = [
    '| Name | Pos | Apps | Mins | Av Rat | Gls | Ast |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| Ethan Nwaneri | AM(RC) | 5 (2) | 410 | 7.38 | 3 | 2 |',
  ].join('\n');
  const parsedPipe = parseFmStructuredExport(statsPipe, 'stats.rtf');
  assert.equal(parsedPipe.format, 'RTF_TEXT');
  assert.equal(parsedPipe.exportType, 'FM_STATS_TABLE');
  assert.equal(parsedPipe.parsedPlayers.length, 1);

  const merged = mergeParsedPlayersIntoSquad(parsedHtml.players, parsedPipe.parsedPlayers);
  assert.equal(merged.matchedCount, 1);
  const updated = merged.updatedSquad.find((p) => p.name === 'Ethan Nwaneri');
  assert.equal(updated?.seasonStats?.goals, 3);
  assert.equal(updated?.seasonStats?.rating, 7.38);
  assert.equal(updated?.attributes.pace, null);
});
