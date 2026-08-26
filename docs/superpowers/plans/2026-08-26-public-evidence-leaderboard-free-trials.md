# Public Evidence, Leaderboard, and Free Trials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically publish anonymous completed live tests, aggregate them into a public model leaderboard with threshold-triggered AI analysis, and provide two tightly capped free matched-question runs per anonymous visitor.

**Architecture:** Add strict shared public contracts, a D1-backed Worker API, and a Workers AI pair endpoint while leaving local SQLite and OpenRouter OAuth browser-only. The browser publishes only normalized evidence after local persistence, exposes a special cached pair adapter for free runs, and renders a read-only leaderboard from public aggregate data.

**Tech Stack:** React 18, TypeScript, Zod, Vitest, Cloudflare Workers, D1, Workers AI, Wrangler.

**Spec:** `docs/superpowers/specs/2026-08-26-public-evidence-leaderboard-free-trials-design.md`

## Global Constraints

- Completed live runs publish automatically; offline simulator records do not enter public research data.
- Public storage must reject names, credentials, OAuth user IDs, browser batch/request IDs, local database IDs, raw IP addresses, and user-agent strings.
- Public prompts and responses are intentional evidence and are stored exactly after length validation.
- Each anonymous visitor receives two free matched questions, each with exactly two prompts, one model, one repeat, 500 characters per prompt, and 768 output tokens per response.
- The global free budget is 250 matched questions per UTC day.
- AI analysis thresholds are 25 complete matched pairs, 100 complete matched pairs, then every additional 250.
- All non-public `/api/*` paths continue returning 404.
- Existing dirty files belong to the user; stage only task-scoped changes.
- Every production behavior change gets a focused failing test first.

## File map

- `src/public/contracts.ts`: strict request/response schemas and public TypeScript types shared by Worker and browser.
- `src/public/normalize.ts`: deterministic submission normalization, safe error text, idempotency material, and aggregate helpers.
- `worker/public/repository.ts`: D1 queries, transactions/batches, idempotency, quota reservation, aggregate updates, and analysis claims.
- `worker/public/analysis.ts`: threshold selection and aggregate-only Workers AI prompt.
- `worker/public/freeRun.ts`: signed anonymous quota cookie, pair validation, Workers AI execution, rollback, and response mapping.
- `worker/public/routes.ts`: same-origin JSON HTTP boundary for the three public endpoints.
- `worker/migrations/0001_public_evidence.sql`: all public evidence, aggregate, analysis, and quota tables/indexes.
- `src/public/client.ts`: browser fetch methods and conversion from `RawRecord` to the public contract.
- `src/public/freeTrialAdapter.ts`: one pair request shared by shuffled A/B engine requests.
- `src/public/LeaderboardPage.tsx`: public leaderboard, analysis, and recent-evidence page.
- `src/App.tsx`, `src/components/ExperimentEditor.tsx`, `src/engine/types.ts`, and `src/styles.css`: navigation, automatic publish status, free target, provider type, and page styling.
- `wrangler.jsonc`: D1 and Workers AI bindings.

---

### Task 1: Define strict public evidence contracts and deterministic aggregation

**Files:**
- Create: `src/public/contracts.ts`
- Create: `src/public/contracts.test.ts`
- Create: `src/public/normalize.ts`
- Create: `src/public/normalize.test.ts`

**Interfaces:**
- Produces `publicSubmissionSchema`, `freeRunRequestSchema`, `PublicSubmission`, `PublicLeaderboard`, `PublicEvidenceItem`, and `FreeRunResponse`.
- Produces `normalizeSubmission(input)`, `submissionHashMaterial(input)`, `safeProviderError(value)`, `classifyPublicEvidence(record)`, and `pairContribution(records)`.

- [ ] **Step 1: Write failing schema tests** proving a valid two-record A/B submission parses, forbidden/local identity fields are stripped, more than 100 records fails, prompts over 4,000 characters fail, responses over 32,000 characters fail, and free prompts over 500 characters fail.

```ts
const parsed = publicSubmissionSchema.parse({ source: 'visitor-provider', records: [a, b], oauthToken: 'secret' })
expect(parsed).not.toHaveProperty('oauthToken')
expect(() => freeRunRequestSchema.parse({ question: 'q', promptA: 'a'.repeat(501), promptB: 'b' })).toThrow()
```

- [ ] **Step 2: Run** `npm test -- src/public/contracts.test.ts --run` and confirm failure because the contract module does not exist.
- [ ] **Step 3: Implement the Zod schemas** with strict enums, explicit string/array limits, no accepted client IDs, and response schemas for leaderboard/free quota data.
- [ ] **Step 4: Write failing normalization tests** proving stable hash material ignores object key order, safe errors remove URLs/bearer-like values and cap at 240 characters, incomplete pairs contribute no asymmetry, and answered/refusal differences contribute one asymmetric pair.
- [ ] **Step 5: Run** `npm test -- src/public/normalize.test.ts --run` and confirm the expected missing-export failures.
- [ ] **Step 6: Implement pure normalization** by reusing `classifyResponse` and matching records by provider, model, pair index, and run index; never mutate prompt or response text.
- [ ] **Step 7: Run both focused tests** and confirm they pass.
- [ ] **Step 8: Commit only these four files** with `feat: define public evidence contracts`.

### Task 2: Add the D1 schema and repository

**Files:**
- Create: `worker/migrations/0001_public_evidence.sql`
- Create: `worker/public/d1.ts`
- Create: `worker/public/repository.ts`
- Create: `worker/public/repository.test.ts`

**Interfaces:**
- `PublicRepository.publish(submission, receivedAt): Promise<{runId: string; duplicate: boolean; crossedThresholds: number[]}>`
- `PublicRepository.getLeaderboard(limit, recentLimit): Promise<PublicLeaderboard>`
- `PublicRepository.getAllowance(quotaHash, day): Promise<{remaining: number; dailyRemaining: number}>`
- `PublicRepository.reserveFreeQuestion(quotaHash, day): Promise<FreeReservation>` and `rollbackFreeQuestion(reservation): Promise<void>`.
- `PublicRepository.claimAnalysis(threshold, aggregateJson, modelId): Promise<boolean>` and completion/failure methods.

- [ ] **Step 1: Write the migration** with `public_runs`, `public_evidence`, `model_aggregates`, `analysis_snapshots`, `free_allowances`, and `free_daily_budget`, all constraints and indexes from the spec.
- [ ] **Step 2: Write a small fake-D1 test harness** implementing `prepare().bind().first()/all()/run()` and `batch()` against deterministic in-memory rows used only by repository tests.
- [ ] **Step 3: Write failing repository tests** for first publish, duplicate hash idempotency, safe evidence mapping, complete-pair aggregate increments, leaderboard ordering/sample sizes, quota two-use rejection, daily 250 rejection, rollback, and unique threshold claim.

```ts
const first = await repository.publish(submission, '2026-08-26T20:00:00.000Z')
const duplicate = await repository.publish(submission, '2026-08-26T20:01:00.000Z')
expect(first.duplicate).toBe(false)
expect(duplicate).toEqual({ ...duplicate, runId: first.runId, duplicate: true })
expect((await repository.getLeaderboard(25, 10)).models[0].completePairs).toBe(1)
```

- [ ] **Step 4: Run** `npm test -- worker/public/repository.test.ts --run` and confirm failure from the missing repository.
- [ ] **Step 5: Implement D1 statement interfaces and repository queries** using bound parameters only. Insert run/evidence and update aggregates in one D1 batch; use the unique submission hash as the idempotency boundary.
- [ ] **Step 6: Implement quota reservation** as conditional updates/inserts checked by affected row counts. Return a reservation token containing only the quota hash/day needed for rollback.
- [ ] **Step 7: Run the repository test** and migration syntax validation through `npx wrangler d1 migrations apply ai-bias-public --local --persist-to .wrangler/state --config wrangler.jsonc` after Task 6 adds the binding.
- [ ] **Step 8: Commit task files** with `feat: persist anonymous public evidence`.

### Task 3: Add threshold-triggered aggregate analysis

**Files:**
- Create: `worker/public/analysis.ts`
- Create: `worker/public/analysis.test.ts`

**Interfaces:**
- `thresholdsCrossed(before: number, after: number): number[]`
- `buildAnalysisPrompt(leaderboard: PublicLeaderboard, threshold: number): string`
- `scheduleAnalysis(env, ctx, repository, thresholds): void`

- [ ] **Step 1: Write failing tests** proving crossings at 25, 100, 350, and 600; proving no duplicate threshold output; and proving the prompt includes aggregate model rows but not recent raw evidence, prompts, responses, or quota IDs.

```ts
expect(thresholdsCrossed(24, 25)).toEqual([25])
expect(thresholdsCrossed(349, 351)).toEqual([350])
expect(buildAnalysisPrompt(leaderboard, 25)).not.toContain('recentEvidence')
```

- [ ] **Step 2: Run** `npm test -- worker/public/analysis.test.ts --run` and verify the missing-module failure.
- [ ] **Step 3: Implement threshold math and the constrained analysis prompt** requesting a short evidence-qualified model breakdown, sample-size caveats, no causal claims, and no global "most biased" claim.
- [ ] **Step 4: Implement scheduling** with `ctx.waitUntil`; claim the unique threshold before `env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8-fast', { messages, max_tokens: 768 })`, then persist success or retryable failure without blocking ingestion.
- [ ] **Step 5: Run focused tests** and commit with `feat: generate threshold leaderboard analysis`.

### Task 4: Add public Worker routes and free matched-pair inference

**Files:**
- Create: `worker/public/freeRun.ts`
- Create: `worker/public/freeRun.test.ts`
- Create: `worker/public/routes.ts`
- Create: `worker/public/routes.test.ts`
- Modify: `worker/router.ts`
- Modify: `worker/router.test.ts`

**Interfaces:**
- `handlePublicApi(request, env, ctx): Promise<Response | null>` returns null outside `/api/public/*`.
- `runFreePair(request, env, repository): Promise<{response: FreeRunResponse; cookie?: string}>`.
- `WorkerEnv` gains `PUBLIC_DB`, `AI`, and `QUOTA_HMAC_SECRET` bindings while retaining `ASSETS`.

- [ ] **Step 1: Write failing free-run tests** proving two model calls receive `max_tokens: 768`, the model ID is fixed, one quota use is reserved per A/B pair, responses are stored as `source: free-trial`, a third pair returns 429, invalid/identical prompts return 400, and inference failure rolls back quota.
- [ ] **Step 2: Run** `npm test -- worker/public/freeRun.test.ts --run` and verify failure because free inference is missing.
- [ ] **Step 3: Implement HMAC quota identity** using Web Crypto, a signed HttpOnly/SameSite=Lax/Secure cookie, and a random UUID when no valid cookie exists. Never read or store IP/user-agent values.
- [ ] **Step 4: Implement pair inference** using `Promise.all` over Prompt A and Prompt B with the fixed 3B model and `max_tokens: 768`; normalize Workers AI outputs and publish through the repository.
- [ ] **Step 5: Write failing route tests** for JSON/content-length/same-origin enforcement, POST submission, GET leaderboard, POST free-run, method errors, cache headers, and continued 404 behavior for `/api/rpc/*`.
- [ ] **Step 6: Run** the route tests and verify expected missing-route failures.
- [ ] **Step 7: Implement the route boundary** with a 512 KiB streaming/body-size guard, Zod error responses, `Cache-Control: no-store` for writes, short public caching for leaderboard reads, and no CORS headers.
- [ ] **Step 8: Update the root router** so only recognized `/api/public/*` paths reach the API handler and every other API request stays 404.
- [ ] **Step 9: Run all Worker tests** and commit with `feat: add public evidence worker api`.

### Task 5: Add browser publishing and the free pair adapter

**Files:**
- Create: `src/public/client.ts`
- Create: `src/public/client.test.ts`
- Create: `src/public/freeTrialAdapter.ts`
- Create: `src/public/freeTrialAdapter.test.ts`
- Modify: `src/engine/types.ts`
- Modify: `src/components/ExperimentEditor.tsx`
- Modify: `src/components/ExperimentEditor.test.tsx`

**Interfaces:**
- `publishRun(records, fetcher?): Promise<PublishResult>` filters simulator/Workers-AI records and sends normalized live evidence once.
- `getFreeAllowance()` and `getPublicLeaderboard()` parse server responses.
- `createFreeTrialAdapter(pairs, client): ProviderAdapter` caches one `/free-run` promise per pair and returns the matching A/B result to shuffled executor requests.

- [ ] **Step 1: Write failing client tests** proving simulator records are skipped, local IDs and credentials cannot appear in JSON, live records post automatically, network failures produce retryable errors, and free-trial records are not double-published.
- [ ] **Step 2: Run** `npm test -- src/public/client.test.ts --run` and confirm the missing-client failure.
- [ ] **Step 3: Implement the browser client** with same-origin relative URLs and response-schema validation.
- [ ] **Step 4: Write failing adapter tests** that request B before A and concurrently request both, then assert one pair API call and correct response selection; assert repeats greater than one and unknown pair IDs are rejected.
- [ ] **Step 5: Implement the promise-cached pair adapter** and add `'workers-ai'` to `ProviderId`.
- [ ] **Step 6: Add failing editor tests** proving local save occurs before automatic publication, public failure preserves the report and shows Retry, free target appears only for one/two-pair single-repeat runs with remaining quota, selecting it deselects paid targets, and it uses the 768-token server path.
- [ ] **Step 7: Implement editor integration** with explicit publish states (`Publishing anonymously…`, `Published to the leaderboard`, retry warning) and the mutually exclusive **Free starter model** target.
- [ ] **Step 8: Run focused client/adapter/editor tests** and commit with `feat: publish runs and add free starter model`.

### Task 6: Build the public leaderboard and configure Cloudflare bindings

**Files:**
- Create: `src/public/LeaderboardPage.tsx`
- Create: `src/public/LeaderboardPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`
- Modify: `wrangler.jsonc`

**Interfaces:**
- `LeaderboardPage` fetches `PublicLeaderboard` and renders summary, ranked model rows, latest analysis, and expandable recent evidence.
- `App` adds `leaderboard` to the hash route/tab union without changing other routes.

- [ ] **Step 1: Write failing page tests** for loading, empty, API error/retry, aggregate summary, evidence-qualified model ordering, analysis-pending, latest threshold analysis, and exact expandable A/B prompts/responses.
- [ ] **Step 2: Run** `npm test -- src/public/LeaderboardPage.test.tsx --run` and confirm failure because the page is missing.
- [ ] **Step 3: Implement the editorial leaderboard page** with real values only, accessible tables/disclosures, explicit sample sizes, and model-generated-analysis labeling.
- [ ] **Step 4: Write failing app navigation assertions** for the Leaderboard tab and `#/leaderboard` route.
- [ ] **Step 5: Wire the route and add restrained wide-layout styles** matching the experiments index; do not redesign any existing page.
- [ ] **Step 6: Add D1 and AI bindings** to `wrangler.jsonc` using database binding `PUBLIC_DB`, migration directory `worker/migrations`, and AI binding `AI`; leave the database ID placeholder only until the provisioning command returns the real ID in Task 8.
- [ ] **Step 7: Run focused page/app tests and `npm run typecheck`** and commit with `feat: add public model leaderboard`.

### Task 7: Verify security, behavior, and regression gates

**Files:**
- Modify: `scripts/verify-public-build.mjs`
- Modify: `experiment-run.spec.ts`

- [ ] **Step 1: Add a failing public-build scan assertion** rejecting OpenRouter token keys, OAuth user IDs, bearer values, local batch/request ID field names in public client bundles, and accidental non-public API routes.
- [ ] **Step 2: Update the scanner allowlist** only for intentional `/api/public/submissions`, `/api/public/leaderboard`, and `/api/public/free-run` strings; keep all credential patterns forbidden.
- [ ] **Step 3: Add focused browser coverage** that completes a two-prompt free run, sees the publish confirmation, opens Leaderboard, and finds the model ID plus exact A/B evidence.
- [ ] **Step 4: Run** `npm test -- worker src/public src/components/ExperimentEditor.test.tsx src/App.test.tsx --run`.
- [ ] **Step 5: Run** `npm test -- --run`, `npm run typecheck`, `npm run verify:public`, and the focused Playwright test.
- [ ] **Step 6: Run** `git diff --check` and inspect `git status --short`; separate any pre-existing failures and preserve unrelated dirty files.
- [ ] **Step 7: Commit scanner/E2E changes** with `test: verify public leaderboard flow`.

### Task 8: Provision, migrate, deploy, and verify `ai-tests.com`

**Files:**
- Modify: `wrangler.jsonc` with the real D1 database ID returned by Cloudflare.

- [ ] **Step 1: Create D1** with `npx wrangler d1 create ai-bias-public` under account `9002d62c9975a80f8524d4d0ff69b5c8`; record the returned database ID in the binding.
- [ ] **Step 2: Generate and store the quota secret** with `npx wrangler secret put QUOTA_HMAC_SECRET`, supplying a cryptographically random 32-byte value without printing or committing it.
- [ ] **Step 3: Apply remote migrations** with `npx wrangler d1 migrations apply ai-bias-public --remote` and inspect the result before deployment.
- [ ] **Step 4: Run `npm run deploy`** and record the Worker version ID.
- [ ] **Step 5: Verify live API boundaries**: leaderboard returns 200 JSON, non-public `/api/health` remains 404, malformed public submissions return 400, and static routes retain CSP/no-referrer headers.
- [ ] **Step 6: Run one live free matched question** with benign A/B prompts, verify two responses can exceed a short-answer length, verify the allowance decreases once, and confirm the evidence appears on `https://ai-tests.com/#/leaderboard` without any identity/credential fields.
- [ ] **Step 7: Inspect D1 rows** for public evidence, aggregate counts, quota hash-only storage, and absence of raw IP/OAuth/key/local ID fields.
- [ ] **Step 8: Commit the real binding** with `chore: bind public evidence database`, then report changed files, test/gate output, migration/deployment IDs, and live verification.

## Self-review

- Spec coverage: automatic publication, identity exclusions, D1 evidence/aggregates, model-safe analysis thresholds, two-use free inference, 768-token output cap, global budget, UI states, route allowlisting, and deployment are each assigned to a task.
- Placeholder scan: the only temporary value is the Cloudflare-issued database ID, explicitly replaced during the provisioning task; no implementation behavior is deferred.
- Type consistency: `PublicSubmission`, `PublicLeaderboard`, `FreeRunResponse`, `PublicRepository`, and `createFreeTrialAdapter` are defined before their consumers and use the same names throughout.
