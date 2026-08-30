# AGENTS.md — canonical repository instructions

## Purpose

AI Bias Lab (ai-tests.com) measures AI bias. A visitor writes one prompt, the app
swaps a demographic phrase to build a matched A/B pair, sends both to real models,
and publishes the evidence to a public leaderboard and research reports.

## Authoritative directories

- `src/` — React SPA (experiments, wizard, public leaderboard/report UI). Browser-only.
- `worker/` — Cloudflare Worker: serves `dist/`, handles `/api/public/*`, D1 access, cron.
- `worker/migrations/` — D1 schema migrations (append-only, never edit applied files).
- `tests/` — cross-cutting fixtures. `tests/fixtures/` is tracked and committed.
- `scripts/` — build verification scripts.
- `tools/` — one-off operational/diagnostic scripts. Disposable; never imported by app code.
- `server/` — legacy Node-side helpers. Do not extend without cause.

## Commands

Package manager: **bun** (the only lockfile is `bun.lock`; node >= 22, see `.node-version`).

- `bun install` — install (CI uses `--frozen-lockfile`)
- `bun run dev` — Vite dev server on :5173
- `bun start` — build + `wrangler dev` on :8787
- `bun run typecheck` — every TS source and test file
- `bun run test` — vitest (unit + component)
- `bun run build` — typecheck + production Vite build
- `bun run deploy` — verify, deploy worker, apply remote D1 migrations

## Required validation gates

Before committing any code change, run at minimum `bun run typecheck`
and the focused vitest file(s) for the touched area. Broader changes
require the full `bun run test` and `bun run build`.

CI (`.github/workflows/ci.yml`) runs: frozen install, typecheck, full tests,
production build. Local gates must match CI exactly.

## Generated code

No build step generates committed source. `dist/` is generated and ignored.
D1 migrations are hand-written and append-only.

## Secrets

- `.dev.vars` — local wrangler secrets, git-ignored. Copy from `.dev.vars.example`.
- `OPENROUTER_API_KEY` — production value lives in `wrangler secret put`, never in files.
- Never commit keys, tokens, or captured environment dumps.

## Commit expectations

Small atomic commits, format `[type] what and why`. Never push to `main` by hand;
work on a branch and merge once after independent cross-model review.

## Prohibited actions

- Do not deploy, merge PRs, or run destructive D1 commands without explicit authorization.
- Do not commit to `main` directly.
- Do not weaken compiler strictness or skip failing gates to make them pass.
- Do not place temporary scripts or diagnostics outside `.artifacts/` (git-ignored).
- Do not run `taskkill //F //IM node.exe` on Windows.

## Report workflow (non-negotiable)

For any request involving generation, regeneration, comparison, or evaluation of a
report: the rendered HTML report IS the deliverable. Reuse the existing aggregation,
synthesis, and renderer pipeline. Never stop at judge scores, JSON, or metrics.
See `CLAUDE.md` for the full rule.
