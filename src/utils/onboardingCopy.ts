/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * First-run words. Kept out of the component so the copy can be read, tested and
 * changed without touching layout, and so a plain-English check is possible.
 */

import type { NavTab } from './navigationUrl';

export const ONBOARDING_TITLE = 'Start with your save file';

export const ONBOARDING_INTRO =
  'The Hub reads your Football Manager 27 save and turns it into squad ratings, an XI builder, contract warnings and a tactical analyst. You choose whether the file is decoded on your device or on the server.';

export interface SaveFileLocation {
  platform: string;
  path: string;
}

export const SAVE_FILE_LOCATIONS: SaveFileLocation[] = [
  {
    platform: 'Windows',
    path: 'Documents → Sports Interactive → Football Manager 27 → games',
  },
  {
    platform: 'Mac',
    path: 'Library → Application Support → Sports Interactive → Football Manager 27 → games',
  },
];

export const SAVE_FILE_FALLBACK =
  'Game Pass and custom installs can keep the folder somewhere else. Search your drive for files ending in .fm.';

export interface OnboardingStep {
  id: 'find' | 'import' | 'wait';
  title: string;
  body: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'find',
    title: 'Find your .fm save',
    body: 'Load the game and save it once in Football Manager 27. The usual folders are in the list above.',
  },
  {
    id: 'import',
    title: 'Import it here',
    body: 'Choose Import .fm Save File, then pick the save. A small save appears in a few seconds and a big one takes longer.',
  },
  {
    id: 'wait',
    title: 'Wait for the sync',
    body: 'The screen fills in panel by panel as it decodes, so you can keep this screen open.',
  },
];

export const DECODE_HELP = {
  local:
    'Your browser decodes the save and the file is never uploaded. Pick this on a phone, or when you would rather not send the file.',
  server:
    'The file is uploaded, decoded on the server and deleted afterwards. This suits big saves and older devices.',
} as const;

export const FAST_SYNC_HELP =
  'Shows the main numbers straight away and fills the long lists in the background.';

export interface FirstTask {
  id: string;
  label: string;
  hint: string;
  tab: NavTab;
}

export const FIRST_TASKS: FirstTask[] = [
  {
    id: 'ratings',
    label: 'See who is in form',
    hint: 'Squad ratings, durability and minutes per goal.',
    tab: 'squad',
  },
  {
    id: 'xi',
    label: 'Build your best XI',
    hint: 'Shape, roles and dead-ball takers that fit your squad.',
    tab: 'tactics',
  },
  {
    id: 'contracts',
    label: 'Sort out contracts',
    hint: 'Who to keep, who to sell, and who leaves for nothing.',
    tab: 'recruitment',
  },
];
