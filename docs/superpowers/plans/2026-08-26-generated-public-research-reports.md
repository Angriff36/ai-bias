# Generated Public Research Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce cached, evidence-backed standalone research reports on request for 20-question runs and automatically every 200 public responses.

**Architecture:** Extend D1 with durable report and pair-score rows, build bounded scoring/synthesis jobs on Workers AI, render validated structured documents through a fixed escaped HTML template, and expose report discovery/generation in the existing public leaderboard flow.

**Tech Stack:** Cloudflare Workers, D1, Workers AI, React 18, TypeScript, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-generated-public-research-reports-design.md`

## Global Constraints

- Run reports require 20 complete matched questions.
- Global reports are claimed at 200, 400, 600, and subsequent 200-response watermarks.
- Synthesis output is capped at 4,096 tokens.
- The AI never emits final HTML; all dynamic content is escaped by a fixed renderer.
- No OpenRouter token, API key, identity, IP, or private browser data enters report storage or prompts.
- Evidence ingestion remains successful when report generation fails.

---

### Task 1: Report contracts, thresholds, and D1 migration

**Files:**
- Create: `worker/migrations/0002_generated_reports.sql`
- Create: `worker/public/reportTypes.ts`
- Create: `worker/public/reportThresholds.ts`
- Create: `worker/public/reportThresholds.test.ts`
- Modify: `src/public/contracts.ts`

**Interfaces:**
- Produces: `responseReportThresholdsCrossed(before: number, after: number): number[]`
- Produces: public `GeneratedReportSummary`, `GeneratedReportDocument`, and `GeneratedReportState` contracts plus strict Zod response schemas.

- [ ] **Step 1: Write failing threshold and schema tests**

Assert literal crossings `199->200=[200]`, `200->399=[]`, and `399->401=[400]`. Assert report schemas reject credential-shaped unknown fields and invalid section/score ranges.

- [ ] **Step 2: Verify RED**

Run: `npm test -- worker/public/reportThresholds.test.ts`

Expected: FAIL because report contracts and threshold function do not exist.

- [ ] **Step 3: Add migration and minimal contracts**

Create `generated_reports` and `report_pair_scores` exactly as specified, including uniqueness for run IDs, global watermarks, and evidence hashes. Add strict report state/document schemas and the recurring threshold function.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- worker/public/reportThresholds.test.ts`

Expected: PASS.

### Task 2: Repository claims and evidence dossiers

**Files:**
- Create: `worker/public/reportRepository.ts`
- Create: `worker/public/reportRepository.test.ts`
- Modify: `worker/public/repository.ts`

**Interfaces:**
- Produces: `claimRunReport(runId, now)`, `claimGlobalReport(watermark, now)`, `getReportEvidence(reportId)`, `completeReport(reportId, document, scores, now)`, `failReport(reportId, code)`, `listReports()`, and `getReport(id)`.
- `PublicRepository.publish` additionally returns `crossedResponseReportThresholds: number[]`.

- [ ] **Step 1: Write failing repository tests**

Use the existing D1 statement fake pattern to assert run eligibility counts unique complete pair indices, duplicate claims return the original row, global claims use response watermarks, ordered evidence builds stable hashes, and failures remain retryable without duplicate rows.

- [ ] **Step 2: Verify RED**

Run: `npm test -- worker/public/reportRepository.test.ts`

Expected: FAIL because report repository methods do not exist.

- [ ] **Step 3: Implement bounded D1 queries and claims**

Keep report SQL in `reportRepository.ts`. Select only public evidence fields, sort deterministically, require both A and B records, cap model-input excerpts while retaining full evidence references, and update submission response-threshold crossings from the actual public response count.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- worker/public/reportRepository.test.ts worker/public/repository.test.ts`

Expected: PASS.

### Task 3: Scoring, synthesis, and safe HTML rendering

**Files:**
- Create: `worker/public/reportGeneration.ts`
- Create: `worker/public/reportGeneration.test.ts`
- Create: `worker/public/reportHtml.ts`
- Create: `worker/public/reportHtml.test.ts`

**Interfaces:**
- Produces: `scheduleReportGeneration(ai, context, repository, reportId): void`
- Produces: `renderReportHtml(document: GeneratedReportDocument): string`
- Models: 8B fast scorer, 70B synthesis, `max_tokens: 4096` for synthesis.

- [ ] **Step 1: Write failing generation and injection tests**

Assert scoring prompts contain exact A/B evidence but no credential fields, synthesis receives validated scores and aggregates, `max_tokens` equals 4096, malformed model JSON fails safely, and `<script>`, event attributes, and model-supplied tags appear escaped in rendered HTML.

- [ ] **Step 2: Verify RED**

Run: `npm test -- worker/public/reportGeneration.test.ts worker/public/reportHtml.test.ts`

Expected: FAIL because generation and renderer modules do not exist.

- [ ] **Step 3: Implement bounded generation**

Batch matched pairs, validate scorer JSON with Zod, compute deterministic aggregate tables and rank order in code, call synthesis once, validate the final structured document, and persist scores/document. On error call `failReport` with a safe category.

- [ ] **Step 4: Implement fixed standalone renderer**

Render the approved editorial sections, table of contents, KPI strip, model comparisons, refusal analysis, ranked expandable evidence, methodology, and limitations. Escape text and attributes with dedicated helpers and include no remote scripts.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- worker/public/reportGeneration.test.ts worker/public/reportHtml.test.ts`

Expected: PASS.

### Task 4: Public report routes and automatic scheduling

**Files:**
- Modify: `worker/public/routes.ts`
- Modify: `worker/public/routes.test.ts`
- Modify: `worker/router.ts`

**Interfaces:**
- Adds: `POST /api/public/reports`, `GET /api/public/reports`, `GET /api/public/reports/:id`, and `GET /api/public/reports/:id.html`.

- [ ] **Step 1: Write failing route tests**

Assert below-threshold run requests return 422, eligible claims return 202 or cached 200, cross-origin POST is refused, report list/document reads work, HTML uses `text/html` plus CSP/nosniff/no-referrer headers, and submissions schedule every crossed response watermark without blocking their 201 response.

- [ ] **Step 2: Verify RED**

Run: `npm test -- worker/public/routes.test.ts`

Expected: FAIL because report routes are absent.

- [ ] **Step 3: Implement routes and `waitUntil` scheduling**

Keep all mutations same-origin, use strict JSON bodies, return safe stable error messages, and route HTML before the SPA asset fallback. Schedule run and global report jobs only after their claims succeed.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- worker/public/routes.test.ts worker/router.test.ts`

Expected: PASS.

### Task 5: Browser report discovery and on-demand run action

**Files:**
- Modify: `src/public/client.ts`
- Modify: `src/public/LeaderboardPage.tsx`
- Modify: `src/public/LeaderboardPage.test.tsx`
- Create: `src/public/GeneratedReportPage.tsx`
- Create: `src/public/GeneratedReportPage.test.tsx`
- Modify: `src/components/ExperimentEditor.tsx`
- Modify: `src/components/ExperimentEditor.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Adds client calls `listGeneratedReports`, `getGeneratedReport`, and `requestGeneratedReport(runId)`.
- Adds route `#/leaderboard/reports/:id` and a standalone HTML link.

- [ ] **Step 1: Write failing component tests**

Assert the Leaderboard lists completed reports with evidence/model metadata, the report route renders headline/method/findings/evidence, and a freshly published run with at least 20 complete matched questions shows `Generate full report` with pending/ready/retry states.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/public/LeaderboardPage.test.tsx src/public/GeneratedReportPage.test.tsx src/components/ExperimentEditor.test.tsx`

Expected: FAIL because report UI and run action are absent.

- [ ] **Step 3: Implement the report UI**

Use the existing research/editorial language, keep exact prompts and readable evidence primary, avoid fake analytics, and link to the safe standalone HTML publication.

- [ ] **Step 4: Verify focused tests and full gate**

Run: `npm test -- src/public/LeaderboardPage.test.tsx src/public/GeneratedReportPage.test.tsx src/components/ExperimentEditor.test.tsx worker/public/reportGeneration.test.ts worker/public/reportHtml.test.ts worker/public/routes.test.ts`

Run: `npm run typecheck && npm test && npm run verify:public`

Expected: all commands exit 0.

### Task 6: D1 migration, deployment, and live verification

**Files:**
- Modify: `README.md` only if operational commands or thresholds need documentation.

- [ ] **Step 1: Apply the D1 migration**

Run: `npx wrangler d1 migrations apply ai-bias-public --remote`

Expected: migration `0002_generated_reports.sql` applies successfully.

- [ ] **Step 2: Deploy the verified Worker**

Run: `npm run deploy`

Expected: deployment exits 0 and reports the `ai-tests.com` custom domain.

- [ ] **Step 3: Verify live routes and UI**

Check `GET https://ai-tests.com/api/public/reports`, open the Leaderboard in a real browser, verify the report empty/list state, confirm the Run experiment Edit prompts action, and ensure no credential-shaped values appear in downloaded HTML or public JSON.

- [ ] **Step 4: Commit implementation files only**

Commit message: `feat: generate public research reports`

