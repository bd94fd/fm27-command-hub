# Linting, formatting and releases

Last updated: 28 November 2026. Roadmap: R42.

## The local gate

Run these before pushing. CI runs the same commands in the `verify` job.

```sh
npm run lint          # TypeScript and oxlint
npm run format:check  # Prettier on scripts, server, workflows and configs
npm test              # 986 unit tests
npm run test:coverage # coverage floors
npm run build         # production bundle
npm run verify:precache
```

## Linting

`npm run lint` runs two checks:

1. `tsc --noEmit` for types, unused locals, unused parameters and the strict
   compiler flags recorded in `docs/type-safety.md`.
2. `oxlint src server scripts` for correctness rules that TypeScript does not
   express, such as an unused catch binding, an unsafe optional chain, or a
   regular expression with a needless escape.

`.oxlintrc.json` enables the `correctness` category only. Four `unicorn` rules
are switched off because they flag deliberate patterns: `new Array(n)` in
decoder tests, empty fallbacks in spreads that keep a shape readable, and two
style preferences. Style rules that do not catch a defect stay out of the gate;
code review and Prettier own style.

## Formatting

Prettier settings live in `.prettierrc.json`: 100 columns, single quotes,
trailing commas. `npm run format:write` applies them and `npm run format:check`
fails CI when the formatted surface drifts.

The formatted surface is deliberately scoped to:

- `.github/**/*.yml`
- `package.json`, `tsconfig.json`, `server.ts`, `vite.config.ts`
- `scripts/**/*.mjs`
- `server/**/*.ts`

`src/` is not in the format gate yet. A whole-tree reformat of the React app
would bury behavioural changes in a mechanical diff, and the repository does
not gain enough from it today. New `src/` files should still be written in the
same style by hand. A separate formatting pass can widen the scope later.

## Preview deploys

Vercel is connected to the repository. Every pull request gets a preview URL,
and the `Vercel` check appears on the PR. `main` deploys to production after a
merge. The repository does not keep a Vercel config file; the project settings
hold the build command and output directory.

## Releases

Releases are tag-driven. Push a tag that starts with `v`, for example:

```sh
git tag v1.2.3
git push origin v1.2.3
```

`.github/workflows/release.yml` then:

1. checks out the full history so the previous tag is visible,
2. runs `npm run lint`, `npm test` and `npm run build`,
3. builds release notes from the commits since the previous `v*` tag,
4. creates the GitHub release, or updates it if the tag is re-run.

Release notes are built by `src/utils/releaseNotes.ts` (tested directly) and
`scripts/release-notes.mjs` (reads git). Commit subjects are grouped into
Breaking changes, Added, Fixed, Changed and Maintenance. A PR number at the end
of the subject, such as `feat: add a filter (#150)`, becomes a link in the note.

To preview the notes locally:

```sh
npm run release:notes -- --version=v1.2.3 --output=/tmp/RELEASE_NOTES.md
```

Use `--from=<tag>` to choose the starting point, `--to=<ref>` for the end point
and `--repo-url=<url>` when the remote is not a GitHub HTTPS URL.

## Bundle budgets

R42 keeps the existing CI bundle summary and does not fail on size. Enforcing a
limit is R45, which owns the budget file and the performance measurement. The
watchlist already names `size-limit` and Lighthouse CI for that item.
