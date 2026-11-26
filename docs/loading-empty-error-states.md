# Loading, empty and error states

R23. What every tab tells you before a save is loaded, and what it tells you when something goes wrong.

## What was wrong

Seven tabs each wrote their own empty state. They were similar in shape but not in words, and some of them assumed you already knew the app:

- Headings followed one pattern, "Awaiting .fm Save — <feature name>", so the first thing you read was a state you did not recognise followed by a feature you had never used.
- The bodies used shorthand: "dual-phase In-Possession / Out-of-Possession roles", "Rest-Defense Matrix", "Dynamic Corners & Training Periodisation", "FM27 rating matrix", "Set-Piece Aerial Threats (Jumping Reach + Heading)", "62'/75' substitution script".
- The recruitment one contained literal backticks, so `` `.fm` `` appeared on screen with stray punctuation.
- Every one of them ended by telling you to go to the Hub tab. None of them took you there.
- None said what would appear once the save loaded, so an empty tab looked like a broken tab rather than an unopened one.

## What they say now

One shared panel, `src/components/EmptyStatePanel.tsx`, and one set of words, `src/utils/emptyStateCopy.ts`. Each tab gets a heading that names what is missing, one or two lines about what will appear, and the same action.

| Tab | Heading | What it promises |
| --- | --- | --- |
| Squad | No squad loaded yet | Every player with ratings, attributes, minutes and contract dates |
| Tactics, pitch | No team sheet loaded yet | The eleven you used last, their roles, the shape you can change |
| Tactics, corners and training | No set-piece takers yet | Best corner and free-kick takers, training built around fixtures |
| Tactics, match prep | No fixture loaded yet | Next opponent, league table, matchday notes |
| Transfers | No transfer advice yet | Who is out of contract, who is overpaid, thin positions |
| Matches | No matches loaded yet | Results, scorers, form, the next fixture |
| Staff | No staff loaded yet | Coaches, scouts and medical staff with ratings, workload and contract ends |

The action is "Open the Hub to import", with one line under it saying to choose Import .fm Save File there and that the usual folders are listed in the Hub. It calls the same navigation the first-run screen uses, so the reader lands on the Hub with the import button in front of them.

The matches log header also lost its "Awaiting .fm Save —" subtitle. It now says "No save loaded yet. Import your save to fill in results and scorers."

## Loading and error states

These were already in decent shape and I did not rebuild them.

Loading: a save in progress shows a dedicated progress card with the current step, bytes uploaded, elapsed time, pause, resume, cancel, and a "decode on this phone instead" fallback. It also holds a wake lock and warns before you close the tab. All of that stays.

Error: the message for a file the app cannot read was "Make sure it is a valid FM26/FM27 .fm save file", which tells you the diagnosis but not what to do. It now says to check the file is a Football Manager 27 (or 26) save, try again, and wait if the game is still saving.

## Verification

Phone, 390×844, production build, service worker cleared. Walked each tab with no save:

- Squad, Transfers, Tactics (pitch, corners, match prep), Matches and Staff each show the shared panel.
- The action button measures 44px and appears once per tab.
- Tapping the action on Staff goes to `?tab=sync&panel=analyst`, the Hub with the import button on screen.
- No horizontal overflow on any tab.

Automated: `npm test` 547 pass, 0 fail. `src/utils/emptyStateCopy.test.ts` checks the copy lengths, that every state says what will appear and that nothing is invented, that the old shorthand and leftover markup are gone, that each of the seven components renders the shared panel, and that the five top-level tabs are wired to the Hub through the shared navigation. `npx tsc --noEmit` clean. `npm run ui:audit` PASS at 390×844 and 1920×1080.

## What I left alone, on purpose

- The Tactics sub-tab label still reads "Playbook v2.0", and the Staff sheet status badge still reads "Awaiting .fm Save". Those are navigation and status labels, not empty-state prose, and the string "Awaiting .fm Save" is also used inside the code as a sentinel for an unset club name. Changing labels is a separate job with its own risk.
- Chat error messages elsewhere in the Hub (clipboard, image parse) were already specific and left as they were.
- The AI debrief panel on a match already explains when it falls back to the local engine.
