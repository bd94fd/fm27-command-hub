# Security policy

## Supported versions

Only the latest commit on `main` is supported. The app is deployed continuously, so older builds are not patched separately.

## Reporting a vulnerability

Do not open a public issue with vulnerability details.

Use GitHub's private vulnerability reporting: open the repository **Security** tab and choose **Report a vulnerability**. If that button is not available, open a minimal issue asking for a private channel. Do not include exploit details, save files, API keys, tokens, or personal data in a public issue.

Please include:

- the affected app version or commit;
- the browser and device;
- clear reproduction steps;
- the impact you believe it has;
- any safe evidence, with secrets and save data removed.

Reports are handled on a best-effort basis. Confirmed issues are fixed on `main` and noted in the release notes when appropriate.

## Scope

This policy covers the FM27 Command Hub web app, its save-upload and decode path, its API routes, and the handling of save files and API keys.

The following are out of scope:

- Football Manager itself and its save format;
- issues caused by a modified or unsupported local build;
- reports that require access to someone else's account or data;
- denial-of-service testing against production.

## Safe handling

Never attach a real `.fm` save, API key, token, password, or personal data to a public issue. The repository ignores `.env*`, `*.fm`, backup archives, and export folders by default. If a secret is exposed, revoke it first, then report the exposure without repeating the value.
