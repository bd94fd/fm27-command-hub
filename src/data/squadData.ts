import { PlayerRecord } from '../types/fm27';
export { inferFm27Roles } from '../utils/fm27RoleMatcher';

/**
 * Clean baseline metadata before a .fm save or CSV export is imported.
 * Conforms to zero-fake-data architecture rules with '--' placeholders.
 */
export const EMPTY_CLUB_META = {
  clubName: 'Awaiting .fm Save',
  nickname: '--',
  matricule: 0,
  manager: '--',
  division: '--',
  stadium: '--',
  saveDate: 'Awaiting .fm Save',
  nextFixture: '--',
  leaguePosition: '--',
  cumulativeLeagueXg: '--',
  balance: '--',
  wageSpend: '--',
  boardConfidence: '--',
  takeoverStatus: '--',
  primaryTactic: '--',
};

/**
 * Zero pre-loaded mock squad players.
 * The app boots cleanly with an empty squad database awaiting a live .fm save
 * or FM27 CSV/HTML export.
 */
export const SQUAD_PLAYERS: PlayerRecord[] = [];
