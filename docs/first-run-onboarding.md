# First-run onboarding

R22. What a new user sees before any save is loaded, and why.

## The problem

The Hub's first screen used to be a pitch. It described features in the app's own shorthand: "dual-phase IP/OOP pitch builder", "Playbook v2.0", "500-target Club DNA scouting", "Fast Sync (Quick Preview)", "Server backup uploads the save to Render". Three feature cards took most of the height.

A first-time user finished that screen knowing the app had features but not knowing three things they needed to act:

1. Where the .fm file is on their computer.
2. What happens after they import, and how long it takes.
3. What to look at first once it loads.

It also made a privacy claim that could be wrong on screen: the intro said the file stays on your device while the decode choice was set to server on a desktop, and the option labelled "recommended" was often not the selected one.

## What it says now

The order is: what this is, the import button, then the detail.

- Title and one line: the Hub reads your FM27 save and turns it into squad ratings, an XI builder, contract warnings and a tactical analyst. You choose whether the file is decoded on your device or on the server.
- Import button, 48px tall, above the fold on a phone.
- Where is my save file: collapsed by default. Opens to the Windows and Mac folders, ending at the games folder, plus a line about Game Pass and custom installs and searching for files ending in .fm.
- What happens next, numbered 1 to 3: find the .fm save, import it, wait for the sync. Each step says what the user does or sees, in plain words.
- The decode choice: two equal buttons, the selected one filled with a tick. The line under it explains the current choice and when to pick the other. On-device: your browser decodes it and the file is never uploaded. Server backup: the file is uploaded, decoded on the server and deleted afterwards.
- Fast Sync: a labelled row that says what it does. It shows the main numbers straight away and fills the long lists in the background.
- After it loads, start with: three tappable lines that go to the tabs they describe, Squad ratings, Tactics for the XI, Transfers for contracts.

Copy lives in `src/utils/onboardingCopy.ts`, not in the layout, so it can be read and tested on its own.

## Fixed while here

- The decode buttons now show which one is active with a filled style and a tick. Before, the selected option was the lighter pill and the recommended option looked disabled.
- Removed "(recommended)" from the local decode label. On a desktop the default is server backup, so the label contradicted the preselection. The helper sentence now explains the trade-off instead of the tag.
- The intro no longer claims the file stays on the device regardless of the choice.
- The second decode control further down the Hub said "On-device decode (recommended)" for the same reason. It now says "On-device decode".

## Verification

Phone, 390×844, production build, service worker cleared:

- First screen shows the title, the intro, the import button and the save-file disclosure above the fold.
- The disclosure opens and shows both folders.
- The first-run tasks are visible below, and tapping Build your best XI opens Tactics at Pitch XI (`?tab=tactics&panel=pitch`).

Desktop, 1280×900: the same content in a 576px column, nothing stretched or clipped.

Automated: `src/utils/onboardingCopy.test.ts` checks step order, length limits, the save folders, that the copy mentions the file, the decode choice and the upload behaviour, that it avoids the old shorthand, and that every first task points at a tab that exists. `npm run ui:audit` passes at both viewports.

One honest note: the live browser was a desktop user agent at phone width, so the screenshots show the desktop default of server backup and the "On this device" label. The phone label and the phone default of on-device decoding are covered by unit tests, not by a phone-user-agent screenshot.

## Limits

- The folders are the default install locations. Game Pass, OneDrive-synced documents and custom installs put the save elsewhere, which is why the fallback line tells the user to search for .fm files.
- The onboarding shows while no save is loaded. It has no "do not show again", because a user with no save is exactly the user who needs it. Once a save loads the hero collapses to the compact header.
- Empty states on the other tabs still use older wording. That is R23, not this item.
