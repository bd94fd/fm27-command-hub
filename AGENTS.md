# AGENTS.md

## Working with this user

- The user does not code and does not want to be a relay between tools. Do not ask them to edit files, run commands, read stack traces, or paste code between assistants.
- Handle implementation, verification, commits, pushes, and PR updates end-to-end.
- Report in plain English: what changed, what it means for the app, and what the user needs to do. Usually that is nothing.
- Keep code snippets, raw logs, and low-level technical detail out of the main answer unless the user asks for them.
- Merge pull requests automatically once checks pass, unless the user says otherwise. Ask only for genuinely destructive actions such as deleting data, force-pushing, or rewriting history.
- The latest explicit instruction about which files to touch wins. Do not keep re-asking or re-raising files the user has already allowed or excluded.
- Open pull requests as ready for review, not drafts, unless the user asks for a draft.
- Use the real save files already available in the workspace (`.agents_tmp/decoded/`, `.agents_tmp/uploads/`) for parity checks. Do not ask the user to decode or inspect saves manually.
- When the user describes a problem in plain language, translate it into the technical investigation yourself. Do not require them to diagnose it first.
