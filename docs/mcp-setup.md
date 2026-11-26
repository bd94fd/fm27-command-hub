# Browser and MCP tooling setup

Last updated: 26 November 2026.

## What is configured

MCP servers are stored in the OpenHands account settings, not in a repository
file. Two stdio servers are enabled for new conversations:

| Name | Package | Use it for | Runtime flags |
| --- | --- | --- | --- |
| `playwright` | `@playwright/mcp@0.0.86` | Live UI inspection, clicking, screenshots and browser console checks. | `--headless --isolated --executable-path /usr/bin/chromium --no-sandbox` |
| `chrome-devtools` | `chrome-devtools-mcp@1.14.0` | Performance traces, long tasks, memory and network diagnostics. | `--headless --isolated --executablePath /usr/bin/chromium --chromeArg=--no-sandbox --no-performance-crux --usageStatistics=false` |

Both were smoke-tested by starting the server and listing tools. Playwright
returned 25 tools; Chrome DevTools returned its tool list normally.

MCP changes apply only to conversations started after the change. A running
conversation cannot pick up a new server.

## Which tool to use

1. **Playwright MCP** — when the agent needs to see or interact with the live
   page. Examples: check a modal, click through a mobile flow, read console
   errors, take a screenshot.
2. **Chrome DevTools MCP** — when the question is performance. Examples: trace
   the save decode, find long tasks, inspect memory, record network activity.
3. **Playwright skill** (`.agents/skills/playwright-skill`) — when the check must
   be repeatable in a script or CI-like run. Examples: the 360px overflow audit,
   tap-target checks, a fixed screenshot set.
4. **Built-in browser tools** — fallback only when neither MCP server is exposed.

Do not use the MCP server and the skill for the same check in one pass. Pick the
one that matches the job.

## Verify in a new conversation

- The tool list should contain Playwright tools such as `browser_navigate` and
  `browser_take_screenshot`.
- The tool list should contain Chrome DevTools tools such as
  `performance_start_trace` and `take_snapshot`.
- Every PR and final summary must state `MCP checked:` with the result. Example:
  `MCP checked: playwright, chrome-devtools available`.

If the tools are absent, do not pretend they exist. Use the Playwright skill and
record the missing server once.

## If a server is missing

In Agent Canvas, open `Customize > MCP Servers`, add or enable the server, then
start a new conversation. Use the command and arguments from the table above.

The Chromium path is `/usr/bin/chromium` in the current sandbox image. If that
path changes, update the MCP configuration rather than hard-coding a different
browser in test scripts.

## If Chrome DevTools fails to launch its browser

Symptom: the tools are listed, but every call fails with
`Protocol error (Target.setDiscoverTargets): Target closed`. That is Chromium
exiting at start, not a missing tool.

Cause in this sandbox: Chromium cannot create a sandbox as root. Verified
directly on 26 November 2026:

- `/usr/bin/chromium --headless --dump-dom about:blank` exits 1 with
  `No usable sandbox!`;
- the same command with `--no-sandbox` exits 0.

Fix: pass the flag to Chrome through the server, because the server launches the
browser itself. Use `--chromeArg=--no-sandbox` in the server arguments, which is
now part of the recommended command in the table above. Playwright already had
`--no-sandbox`; Chrome DevTools did not, which is why only one of the two worked.

Applying it needs the account-level MCP settings plus a new conversation, since
a running conversation cannot reload its MCP servers.

## Safety

- Both servers run headless and use an isolated browser profile.
- Playwright file access is restricted to the workspace by default.
- Chrome DevTools file access is restricted to the OS temp directory because the
  client does not request MCP roots.
- Chrome DevTools sends no trace URLs to the CrUX API (`--no-performance-crux`)
  and has usage statistics disabled.
- Do not expose save files, tokens or personal data to either browser server
  beyond what the task needs.
