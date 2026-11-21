# FM27 Command Hub — Workspace Rules

## Environment & Dependency Installation
- Whenever installing npm packages in a fresh sandbox/container and `npm ci` or plain `npm install` hits peer-dependency conflicts (`ERESOLVE`), immediately run `npm install --legacy-peer-deps` instead of retrying plain install commands.
