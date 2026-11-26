# Analyst grounding and citations

R13 makes the Analyst show where every factual answer came from. The prompt now requires a citation for every factual sentence, the response schema returns a source list, and each reply ends with a Grounded in footer.

## Prompt rules

`src/utils/analystCitations.ts` defines the exact UI labels the Analyst may cite:

- Hub · Live Club Snapshot
- Hub · Finances
- Hub · Data Quality
- Hub · Save Compatibility
- Hub · Journey
- Hub · Auto-Sync
- Squad · Roster
- Squad · Player Detail
- Squad · Best XI
- Squad · Tactical War Room
- Staff · Directory
- Staff · Staff Detail
- Transfers · Shortlist
- Transfers · Positional Depth
- Matches · Match Log
- Matches · Last Match Blueprint
- Tactics & Corners · Set Pieces
- Knowledge Base
- Analyst · Prior Conversation

The citation law in `buildAnalystCitationPromptRules` says every number, name, role, fixture, wage, finance figure, date, table position or decoded field needs an inline `[Section]` citation. Pure FM27 mechanics cite `Knowledge Base`; a fact from an earlier reply cites `Analyst · Prior Conversation`. A fact that is not in the save is written as “not exposed in this save” and the section that would hold it is cited. Never invent a value.

The chat response schema has `sourceCitations[]`. The server merges that list with any inline citations in `analysisMarkdown`, de-duplicates them and returns the result.

## Footer and copy

Each Analyst reply renders a footer:

> Grounded in
> [Hub · Finances] [Squad · Player Detail]

The same labels are appended to Copy reply and Copy Chat so exported transcripts keep their provenance.

## Offline mode

The deterministic offline briefing returns its own citations. The awaiting-save reply cites `Hub · Auto-Sync`; the full briefing cites `Hub · Live Club Snapshot`, `Squad · Roster`, `Squad · Best XI` and `Tactics & Corners · Set Pieces`.

## Limits

A citation is a label, not a proof. The prompt and schema require a source, and the UI shows it, but the existing FM27 warning checker still scans the response text for forbidden CA/PA and legacy role language. A future check can reject unknown labels at the server boundary.
