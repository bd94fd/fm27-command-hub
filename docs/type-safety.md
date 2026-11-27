# Type safety and runtime validation (R39)

The app has one rule: data the app creates is typed, and data from outside is
checked before it is trusted. TypeScript cannot see across a network call or a
`localStorage` read, so those edges get an explicit parser.

## The edges

| Edge | What arrives | Where it is checked |
| --- | --- | --- |
| Analyst chat answer | Model output over `/api/fm27/tactical-chat` | `parseAnalystChatResponse` (`src/utils/analystResponse.ts`) |
| Decoded save | `fsmave` payload from the phone or the server | `validateDecodedFmSave` and the hydrator (`src/utils/fmSaveHydrator.ts`) |
| Uploaded save file | `.fm`, `.json`, CSV, HTML | `src/utils/fmFileImporter.ts` |
| Persisted app state | `localStorage` JSON | Each store validates its own schema on read: `fmStorage`, `chatStorage`, `contractPlan`, `transferPlan`, `fm27BuildMemory`, `viewPreferences`, `squadViewHelpers`, `progressionDiff` |
| Shared read-only link | Address hash | `src/utils/shareSummary.ts` |
| API errors and HTML pages | Proxy and gateway responses | `src/utils/apiResponse.ts` |

When a new edge appears, add a parser next to it and a test that feeds it
garbage. Do not cast the parsed value and hope.

## The Analyst answer

The chat answer is the one place where a language model writes into the app: it
can add a match to the Match Log, change a player's role, condition or note, and
set the save date. Before R39 that answer was typed `any` and read with ad-hoc
`typeof` checks spread across a component that has since been split (see `docs/component-map.md`).

`parseAnalystChatResponse` now narrows every field and returns a typed
`AnalystChatResponse`:

- `analysisMarkdown` must be a string, otherwise the turn carries an empty
  string and the UI shows its normal fallback.
- A player update is kept only when it has a non-empty `name` and a string
  `notes`. Everything else is dropped, and the drop is counted.
- `status` must be one of Starter, Rotation, Injured, Surplus or Youth. Any
  other word is dropped rather than written into the squad.
- `condition` is clamped to 1–100, and goals, assists and minutes are clamped to
  zero or more. A non-finite number is dropped, never shown as `NaN`.
- A match is accepted only with a non-empty `opponent` and `score`. `venue`
  becomes `H` or `A`, and `result` becomes `W`, `D` or `L`.
- Missing optional numbers stay `null`, so the app prints `--` rather than a
  made-up zero.
- Every repair is listed in `issues`. The component logs one warning when the
  list is not empty, which makes model drift visible instead of silent.

`src/utils/analystResponse.test.ts` covers the happy path, a non-object answer,
dropped updates, a bad status, a clamped condition, a match with no opponent or
score, and a `playerUpdates` that is not an array.

## Compiler settings

`tsconfig.json` turns on the checks that catch the mistakes a reviewer misses:

| Flag | Catches |
| --- | --- |
| `strict` | Null and undefined access, implicit any |
| `noUnusedLocals` | Dead imports and dead locals |
| `noUnusedParameters` | Parameters left behind by a refactor |
| `noImplicitOverride` | A subclass method that silently shadows its base class |
| `noFallthroughCasesInSwitch` | A `case` that falls into the next one |
| `forceConsistentCasingInFileNames` | Imports that break on Linux CI but not on macOS |

`src/utils/typeSafety.test.ts` fails if any of these are switched off, or if a
source file uses `any` again. There are no `any` usages in `src/` or `server/`
today.

## Where `unknown` is the right answer

Some values genuinely have no static type: the decoded save before hydration,
the `localStorage` blob before a schema check, the model answer before parsing.
Those are typed `unknown` and narrowed by a parser. `as unknown as T` is still
allowed in a handful of places where a decoded field is mapped to a UI record;
each one is a deliberate shortcut and should be replaced by a real check when
that field gets a parser.
