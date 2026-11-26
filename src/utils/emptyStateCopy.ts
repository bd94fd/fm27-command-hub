/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * What each tab says when there is no save, and what the reader should do next.
 * One place, so every tab explains itself the same way.
 */

export type EmptyStateId =
  | 'squad'
  | 'tactics'
  | 'setpieces'
  | 'recruitment'
  | 'matches'
  | 'matchPrep'
  | 'staff';

export interface EmptyStateCopy {
  /** What is missing, in the reader's words. */
  title: string;
  /** What appears here once the save is imported. */
  detail: string;
}

export const EMPTY_STATES: Record<EmptyStateId, EmptyStateCopy> = {
  squad: {
    title: 'No squad loaded yet',
    detail:
      'Import your save and every player appears here with ratings, attributes, minutes and contract dates. Nothing is invented when a save is missing.',
  },
  tactics: {
    title: 'No team sheet loaded yet',
    detail:
      'Import your save to load the eleven you used last, the roles you gave them, and the shape you can change from here.',
  },
  setpieces: {
    title: 'No set-piece takers yet',
    detail:
      'Import your save and the Hub ranks your best corner and free-kick takers, then fits the training week around your fixtures.',
  },
  recruitment: {
    title: 'No transfer advice yet',
    detail:
      'Import your save to see who is out of contract, who is paid too much, and which positions are thin.',
  },
  matches: {
    title: 'No matches loaded yet',
    detail:
      'Import your save to see results, scorers and form, and to plan for the next fixture.',
  },
  matchPrep: {
    title: 'No fixture loaded yet',
    detail:
      'Import your save to see the next opponent, the league table and the notes for matchday.',
  },
  staff: {
    title: 'No staff loaded yet',
    detail:
      'Import your save to see coaches, scouts and medical staff with their ratings, workload and contract end dates.',
  },
};

/** The one action offered by an empty state. It opens the Hub, where the file is chosen. */
export const EMPTY_STATE_ACTION = 'Open the Hub to import';

export const EMPTY_STATE_ACTION_HINT =
  'Choose Import .fm Save File there. If you cannot find the file, the Hub lists the usual folders.';
