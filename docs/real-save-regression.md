# Real-save regression set

The real-save guard runs the production decoder against local `.fm` files and compares a safe fingerprint. It catches drift that synthetic unit tests miss without putting a save file or decoded payload in Git.

## What is stored

`tests/fixtures/real-saves/manifest.json` stores only:

- file name, byte size, and SHA-256;
- FM build, game date, and layout compatibility status;
- section counts and extraction totals;
- hashes of players, staff, targets, matches, tactics, training, finances, and the other decoded sections.

It never stores player names, staff names, club names, manager names, raw attributes, or the decoded payload. The hashes are one-way.

The local corpus currently covers three saves from one club, including FM27 `27.1.0` and `27.0.1` builds. Add a second club when a save is available. The files stay in `.agents_tmp/uploads/` or in the directory named by `FM27_REAL_SAVE_DIR`.

## Run locally

Install the pinned decoder dependency in a throwaway environment:

```bash
python3 -m venv /tmp/fm27-fmsave
/tmp/fm27-fmsave/bin/pip install fmsave==0.14.5
```

Run the guard against the default local folder:

```bash
/tmp/fm27-fmsave/bin/python -m unittest tests.python.test_real_save_regression -v
```

`npm run test:python` also runs the manifest self-check and skips the corpus test when fmsave is not installed. `npm run test:real-saves` is a shortcut for the direct test, but it uses the active `python3`, so run it from the fmsave environment when you want the corpus to run.

Or point it at another folder:

```bash
FM27_REAL_SAVE_DIR=/path/to/saves \
  /tmp/fm27-fmsave/bin/python -m unittest tests.python.test_real_save_regression -v
```

Set `FM27_REAL_SAVE_REQUIRED=1` to turn a missing folder, missing file, or missing fmsave install into a failure instead of a skip. `FM27_REAL_SAVE_TIMEOUT_SEC` changes the per-save timeout from its 600-second default. `FM27_REAL_SAVE_MANIFEST` points at a temporary manifest when you want to prove a known-bad control fails.

## Update the manifest

Only update the manifest after an intentional decoder change. Run the generator with an interpreter that has fmsave 0.14.5 installed:

```bash
/tmp/fm27-fmsave/bin/python scripts/real-save-manifest.py \
  --save-dir .agents_tmp/uploads \
  --output tests/fixtures/real-saves/manifest.json
```

Review the manifest diff before committing it. A changed hash is a signal, not an automatic approval.

## CI

The `real-save-regression` job is opt-in because a hosted runner does not have the private save corpus. Configure both repository variables:

- `FM27_REAL_SAVE_DIR`: the absolute save directory on the runner.
- `FM27_REAL_SAVE_RUNNER`: the runner label that has that directory.

The job installs the pinned fmsave version, sets `FM27_REAL_SAVE_REQUIRED=1`, and runs the same test. When either variable is unset, the job is skipped. This keeps the repository free of save data and avoids a false green from an empty corpus.

## Privacy and failure output

The test prints file names, counts, totals, and hashes only. It does not print decoded player or staff data. A failure lists the fingerprint path that changed, such as `fingerprint.extractionManifest.staff`, so the cause is visible without exposing the save.
