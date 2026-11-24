---
trigger: glob
globs: "server.ts, server/**, Dockerfile, render.yaml, vite.config.ts, package.json, .github/**"
---

# Server, Gemini AI & Render Deployment Guardrails

- **Express 5 Named Splats:** This repo uses `express@5.x`. Always use `/{*splat}` and `/api/{*splat}` (never legacy `*` or `/api/*`). Register JSON 404 for `/api/{*splat}` BEFORE Vite/SPA HTML fallback, and ensure router-level error handlers return JSON (`413`/`400`) rather than HTML.
- **Security & Render Deployment:** Preserve `app.set('trust proxy', 1)`, Helmet security headers, HTTP gzip compression, rate limiting + optional `HUB_ACCESS_TOKEN` guard on AI & decode routes, the 2-stage `Dockerfile` (Python + `fmsave` in `/opt/fmsave-venv`), `render.yaml` (`PORT=8080`, `/api/health`), and PWA `NetworkFirst` worker/mapper/patcher caching.
- **Gemini AI Configuration (`server/config.ts`, `server/geminiService.ts`):**
  - Default models: `gemini-3.5-flash-lite` (Fast / Fallback) and `gemini-3.6-flash` (Deep). Never block active `3.6`/`3.8` prefixes in `RETIRED_MODEL_RE`; filter retired `1.*`, `2.0`, `2.5` prefixes only.
  - Preserve `45s` standard / `60s` Deep timeouts, `18,000`-char live context budget, 503/429 retry backoff, automatic Fast-model failover (~67% primary / ~33% Fast reserve), `response.text` getter (never `response.text()`), and strict `GEMINI_API_KEY` (zero `VITE_GEMINI_API_KEY` fallback).
  - Normalize multi-turn `/tactical-chat` history to strict `user`/`model` alternation before calling Gemini.
- **TypeScript Strict Mode:** Keep `"strict": true` in `tsconfig.json` with `dist` and `.agent` excluded.
