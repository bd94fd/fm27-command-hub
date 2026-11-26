# Error reporting with redaction

R06 makes failures useful without collecting the save. A report contains the failure shape, the app and route, and a small allowlisted context. It never contains a save file, player or staff records, prompts, images or API keys.

## What is captured

Client reports are built in `src/utils/errorReport.ts`:

- Uncaught `window.error` and `unhandledrejection` events are captured by `installGlobalErrorReporting()` in `src/main.tsx`.
- React render failures are captured by `AppErrorBoundary` and can be copied with **Copy Error Report**.
- The report has a schema version, timestamp, app version, scope, route path, browser string, redacted error name/message/stack, and allowlisted context.
- The last report is kept in memory and on `window.__FM27_LAST_ERROR_REPORT__` for the current page. Nothing is written to disk.

The browser sends the redacted report to `POST /api/fm27/client-error`. The server re-redacts it and writes one structured JSON line to the server log. It never logs the request body.

## What is removed

`src/utils/errorRedaction.ts` is shared by the browser and the server. It removes:

- API keys, bearer/basic tokens, JWTs and provider tokens.
- `key=value` secrets such as `GEMINI_API_KEY`, `token`, `password` and `secret`.
- Email addresses, save filenames (`.fm`) and home-directory paths.
- Long base64 blobs.
- Quoted player, staff, manager and target names.
- Payload-shaped keys such as `body`, `payload`, `players`, `staff`, `squad`, `history`, `images`, `liveAppContext`, `importedFileContext` and `prompt`.

Free text cannot be perfect. The report deliberately omits the structured data that would carry names in bulk, and the server drops payload-shaped keys again before logging.

## Server failures

Every API response carries `X-Request-Id`. Server-side 5xx failures are logged as one JSON line with:

- request ID, method, path without query, status and duration;
- app version;
- redacted error name, message and stack.

The API response also includes the request ID, so a user can quote it in a report. Request bodies, save chunks, prompts and images are never logged.

## Using a report

1. Reproduce the failure.
2. In a crash screen, use **Copy Error Report**.
3. For a server error, quote the request ID shown in the response or in the server log.
4. Paste the report or request ID into the issue. Do not attach the save unless you deliberately choose to.

## Tests

- `src/utils/errorReport.test.ts` covers redaction, allowlisted context, formatting and the last-report handoff.
- `server/errorReporting.test.ts` covers server events, client re-redaction and payload omission.
- `server/routes.test.ts` covers the `client-error` endpoint and request ID.
