# AGENTS.md

## Working with this user

- The user does not code and does not want to be a relay between tools. Do not ask them to edit files, run commands, read stack traces, or paste code between assistants.
- Handle implementation, verification, commits, pushes, and PR updates end-to-end.
- Report in plain English: what changed, what it means for the app, and what the user needs to do. Usually that is nothing.
- Keep code snippets, raw logs, and low-level technical detail out of the main answer unless the user asks for them.
- Ask only when there is a real product choice, missing access to a save/file, or an irreversible action such as merging or deleting data. Otherwise choose the safest sensible default and say what was chosen.
- Use the real save files already available in the workspace (`.agents_tmp/decoded/`, `.agents_tmp/uploads/`) for parity checks. Do not ask the user to decode or inspect saves manually.
- When the user describes a problem in plain language, translate it into the technical investigation yourself. Do not require them to diagnose it first.
