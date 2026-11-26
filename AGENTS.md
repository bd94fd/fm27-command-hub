# AGENTS.md

## Working with this user

- The user does not code and does not want to be a relay between tools. Do not ask them to edit files, run commands, read stack traces, or paste code between assistants.
- Handle implementation, verification, commits, pushes, and PR updates end-to-end.
- Report in plain English: what changed, what it means for the app, and what the user needs to do. Usually that is nothing.
- Keep code snippets, raw logs, and low-level technical detail out of the main answer unless the user asks for them.
- Merge pull requests automatically once checks pass, unless the user says otherwise. Ask only for genuinely destructive actions such as deleting data, force-pushing, or rewriting history.
- The latest explicit instruction about which files to touch wins. Do not keep re-asking or re-raising files the user has already allowed or excluded.
- Treat file bans as scoped to the request that stated them, not permanent permissions. If the current message and a background task summary disagree, stop and ask which is current; do not let the background summary override the message.
- Python save-decoder files and cache busters are in scope by default. When a mapper change ships, bump every synced cache-buster reference in the same PR so phones do not keep the old decoder. A task-level instruction may exclude them; that exclusion does not carry into later tasks.
- Open pull requests as ready for review, not drafts, unless the user asks for a draft.
- Use the real save files already available in the workspace (`.agents_tmp/decoded/`, `.agents_tmp/uploads/`) for parity checks. Do not ask the user to decode or inspect saves manually.
- When the user describes a problem in plain language, translate it into the technical investigation yourself. Do not require them to diagnose it first.

## Decode performance priorities

- Full Sync on the user's phone is the primary path. Server decoding is a backup, not the default goal.
- When asked to speed up Full Sync, optimise the phone/browser Pyodide decoder first. A server-only change is not an answer; state which path changed and whether the phone improved.
- Phones default to `On this phone` decoding without uploading. Server upload is opt-in. Do not silently prefer the server on mobile.
- Free Render is CPU-limited. Do not suggest paid hosting unless the user asks, and do not present desktop or server timings as proof of phone speed.
- If the change was not measured on a real phone, say so plainly.

## Start-of-task gate

- Before planning or changing code, read `ROADMAP.md`, `TOOLING-WATCHLIST.md`, and the available skill/MCP list.
- Name the applicable skills and MCP servers in one line, and invoke every matching skill. If none applies, say why once.
- Prefer an installed skill or MCP tool over an ad-hoc script when it covers the job. If a missing tool would clearly help, add it to `TOOLING-WATCHLIST.md` with the roadmap item, source, licence and risk.
- Every PR body and final summary includes `Skills applied:` and `MCP checked:` lines.

## Skills

- Before changing code, run a skill check: name the skills that apply and invoke them. Do not silently skip a matching skill.
- Save data, Analyst, staff, finances, or decoder work: use `fm27-data-parity`. Before changing a core field, read `docs/data-parity-contract-map.md` and update its row in the same change.
- Backup, restore, fixture or re-sync work: use `fm27-save-safety`.
- Real-save regression work: use `fm27-save-safety` and `docs/real-save-regression.md`. Never commit `.fm` files or decoded payloads; keep only the safe fingerprint manifest.
- Save-load speed, memory, bundle or performance-budget work: use `fm27-performance-audit`.
- Any screen, layout, or mobile change: use `fm27-ui-ux-review` and `web-design-guidelines`.
- Measured UI audit for contrast, tap targets, spacing or alignment: use `ui-ux-audit` as a supporting rubric after `fm27-ui-ux-review` and `accessibility`.
- Design critique, audit, polish, layout, adapt or anti-slop work: use `impeccable` after reading `.agents/skills/impeccable/FM27-SETUP.md`. Do not run its live mode or installer hooks without explicit approval.
- Accessibility or WCAG work: use `accessibility`.
- Lighthouse, Core Web Vitals or page quality work: use `web-quality-audit`, `performance` and `core-web-vitals`.
- Browser automation, screenshots or end-to-end checks: use `playwright-skill`.
- GitHub repository, PR, issue or workflow work: use `github` and `github-actions`.
- Security, privacy, secrets or data handling: use `security` and `best-practices`.
- Feature planning before code: use `prd`.
- Release notes or changelogs: use `release-notes`.
- Before pushing or merging a code change: use `fm27-release-check`.
- User-visible behavior changes: use `qa-changes` to exercise the real app, not just the test suite.
- Multi-file cleanup or refactor: use `code-simplifier`.
- Explaining a technical topic to the user: use `show-me` for a small visual, and `plain-english-content` for the prose.
- Engineering explanations and design discussion: use `technical-writing`.
- A recurring fix or workflow: use `skill-creator` to capture it as a reusable skill.
- Updating project memory or `AGENTS.md`: use `agent-memory`.
- Before searching for a new tool or skill, read `TOOLING-WATCHLIST.md`. When you find a useful candidate, add it there with the roadmap item, source, licence and risk. Do not search for the same thing twice.
- Do not invoke unrelated skills just to fill the list. Say which skills apply and why the others do not.
- Priority when instructions conflict: latest explicit user instruction, then this file, then the task-specific skill, then general guidance. State the conflict once and record any partial work.
- Every PR body and final summary includes a short `Skills applied:` line.

## Planning

- `ROADMAP.md` is the only work queue. Before starting, name the roadmap item and its current status. Do not create a parallel numbered list in chat or the task tracker; task-tracker titles may only mirror roadmap items with the `Rxx` prefix.
- If a request does not map to a roadmap item, stop and ask whether to add it to `ROADMAP.md` before doing the work. Do not do adjacent "while I am here" work.
- Update the item status in `ROADMAP.md` in the same PR when work starts or finishes.
- Every PR title or body must include `Roadmap: Rxx`. Before suggesting a next step, read `ROADMAP.md` and name the next item by ID.
- Add new ideas to the right roadmap wave instead of keeping them only in chat.
