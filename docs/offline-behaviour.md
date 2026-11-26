# Offline behaviour

What FM27 Command Hub does with no signal, what it holds until the signal returns, and how it marks data as old. Roadmap R31.

Measured with `npm run offline:check` against the production build on an emulated Pixel 7, using the real 242 MB save: 28 checks, all green. The check drives Chromium over CDP, cuts the network with `Network.emulateNetworkConditions`, and reloads.

## The three answers

### Works with no signal

| Thing | How |
| --- | --- |
| Opening the app | The worker precaches the shell: 102 files, ~2 MB. A cold open offline still renders. |
| Every section | Squad, Tactics & Corners, Transfers, Matches and Staff all render from the save in IndexedDB. |
| The Analyst | Falls back to the local briefing engine, with a notice saying the answer is offline. |
| Backup export | Writes the file with no network. |
| Importing a `.fm` | Decodes on the phone with Pyodide. Since R31 the Pyodide runtime is in Cache Storage (`fm-pyodide`, 30 days, 80 entries), so this works on a device that has decoded once before, not only while the HTTP cache happens to hold it. |

### Held until the signal returns

| Thing | How |
| --- | --- |
| A server-side decode already uploading | The uploader pauses on the `offline` event and resumes on `online`, keeping the chunks it already sent. This existed before R31 and is covered by `fmSaveReader.resumable.test.ts`. |
| Nothing else | An Analyst question asked offline is answered offline. It is not queued and replayed, because a replay would arrive minutes later as a duplicate answer. |

### Marked as stale

The offline banner names the club, says the save is the copy on this device, and states the in-game date it was last updated:

> Offline mode — showing the KVV Zelzate save stored on this device, last updated in game on 11/08/2027. Nothing is being sent anywhere. AI Analyst will use instant offline briefings until signal returns.

## Two defects R31 fixed

**An offline server-route import said the save was broken.** Choosing "Server backup" with no signal ended in "This file is not a valid Football Manager (.fm) save file", which sends the user off to re-copy a file that is perfectly fine. The import now stops before uploading and says the file was not uploaded, next to a one-tap "Decode on this device" button that runs the same import through the phone decoder. Choosing the server route while offline also warns immediately, before a file is picked.

**The Analyst quoted fetch jargon.** "Analyst unavailable — Network error: Failed to fetch. Showing the local offline briefing instead." now reads "Analyst unavailable — no connection on this device." when the browser reports offline. A real server error while offline still reports the HTTP status, because that is not a signal problem.

## Limits

- Emulated offline, not a phone in a tunnel. Chrome DevTools sets `navigator.onLine` and blocks requests; a real phone can also have a captive portal that answers but returns nothing, which looks online to the app.
- The Pyodide cache is 30 days and 80 entries; a device unused for longer re-downloads the runtime, which needs one moment online.
- iOS Safari can evict Cache Storage under storage pressure. The banner still works, and the phone decoder falls back to the HTTP cache when it can.
- The server-route upload resume is covered by unit tests with a fake network target, not by this browser run, because the run has no server decoder to upload to.

## Running it

```bash
npm run build
PORT=12000 NODE_ENV=production npm start
npm run offline:check            # needs Chromium; starts one if none is running
npm run offline:check -- --save=/path/to/save.fm
```

It refuses to guess: a missing save, a missing service worker or a missing control fails the run rather than skipping.
