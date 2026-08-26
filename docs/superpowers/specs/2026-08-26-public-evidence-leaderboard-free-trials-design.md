# Public Evidence, Leaderboard, and Free Trials Design

**Date:** 2026-08-26

## Goal

Turn `ai-tests.com` into a shared research product: every completed live test is logged anonymously, public evidence is aggregated into a model leaderboard, model-level AI analysis is refreshed at evidence thresholds, and first-time visitors can run two small matched-prompt questions without supplying provider credentials.

## Product rules

- Completed live runs publish automatically. There is no opt-out control.
- Public records include the exact prompts, model responses, provider/model identifiers, latency, HTTP status, truncation state, evidence hash, and server receipt time.
- Public records never include names, OpenRouter OAuth tokens, API keys, OpenRouter user IDs, local experiment IDs, browser batch IDs, request IDs, raw IP addresses, or local database contents.
- The private browser SQLite workspace remains the source of truth for experiments and private reports. Public D1 storage is a separate evidence projection.
- Failed model requests may be recorded as evidence, but only complete A/B matched pairs are included in asymmetry statistics and AI analysis.
- The public page is called **Leaderboard** and is available at `#/leaderboard`.

## Architecture

The Cloudflare Worker gains three narrowly scoped `/api/public/*` capabilities while retaining a 404 for every other API path:

1. `POST /api/public/submissions` validates and stores an anonymous completed run in D1.
2. `GET /api/public/leaderboard` returns indexed aggregate rows, the latest threshold analysis, and recent evidence.
3. `POST /api/public/free-run` executes one A/B matched question through a Workers AI binding, reserves quota before inference, stores both results through the same public evidence path, and returns the records for local persistence.

The browser submits a public run only after the existing local `completeOfflineRun` operation succeeds. Submission failure never destroys the local report. The UI reports that local evidence is safe and retries the anonymous publish once during the current session.

## D1 data model

### `public_runs`

One row per published browser run:

- `id TEXT PRIMARY KEY`: server-generated UUID
- `submission_hash TEXT UNIQUE NOT NULL`: SHA-256 over the normalized evidence payload for idempotency
- `source TEXT NOT NULL CHECK(source IN ('visitor-provider','free-trial'))`
- `created_at TEXT NOT NULL`
- `record_count INTEGER NOT NULL`
- `complete_pair_count INTEGER NOT NULL`

### `public_evidence`

One row per model response:

- server run ID and stable server evidence ID
- pair index, optional public question text, variant key/label
- provider and model ID
- exact prompt and response
- latency, status code, status, error message limited to safe provider text, truncation flag
- client evidence SHA-256 and receipt time
- deterministic response classification computed by the Worker

Indexes cover `(model_id, created_at)`, `(run_id, pair_index)`, and `(status, model_id)`.

### `model_aggregates`

One row per provider/model, recomputed transactionally from newly inserted complete matched pairs:

- response count, complete pair count, answered/refusal/error/truncation counts
- asymmetric pair count and asymmetric pair rate
- average latency and first/last evidence timestamps

Leaderboard order is complete matched-pair evidence descending, then asymmetry rate descending. The interface does not claim that a model is globally "most biased"; it labels the measured field **Observed asymmetric response rate** and always shows sample size.

### `analysis_snapshots`

One row for each reached global complete-pair threshold, with a unique threshold:

- threshold, aggregate input JSON, Workers AI model ID, generated analysis text, status, created/completed timestamps

Thresholds are 25 complete matched pairs, 100 complete matched pairs, and every additional 250 pairs. After a submission crosses a threshold, the Worker claims the unique snapshot row and uses `waitUntil` to generate analysis. Failed generation remains retryable on the next submission.

Workers AI receives aggregate model statistics only. It does not receive raw visitor prompts, responses, credentials, identifiers, or network metadata for leaderboard analysis.

### `free_allowances` and `free_daily_budget`

- A signed, HttpOnly, SameSite=Lax anonymous cookie contains a random quota ID.
- D1 stores only an HMAC-derived quota hash, use count, and timestamps.
- Raw IP addresses and user-agent strings are never stored.
- A D1 reservation occurs before inference so concurrent requests cannot exceed either limit.
- Each anonymous visitor receives exactly two free matched questions.
- The site-wide free allowance is 250 matched questions per UTC day. Capacity fails closed with a clear message; the Worker never falls back to a visitor credential.

## Free-run limits

- Exactly one A/B matched question per request.
- Maximum two free questions per anonymous quota ID.
- Exactly one Workers AI model and one repeat.
- Each prompt is 1 to 500 Unicode characters.
- The two prompts must differ and each response is capped at 768 output tokens.
- Inference uses `@cf/meta/llama-3.2-3b-instruct` through the `AI` Worker binding.
- The browser exposes **Free starter model** as a run target only when the selected experiment has at most two matched questions and repeats equals one. It explains the limits before starting.
- Larger experiments continue to require the visitor's own OpenRouter OAuth credits.

At Cloudflare's current published token rates, the hard maximum for four 500-character inputs and four 768-token outputs is still only a fraction of a cent per visitor. The 250-question daily application ceiling also leaves room inside the account-level Workers AI allocation for threshold analysis.

## Submission validation and safety

- Same-origin requests only; no permissive CORS headers.
- JSON content type is mandatory.
- Submission body limit is 512 KiB, at most 100 evidence records, at most 50 matched pairs, and prompt/response fields have explicit length limits.
- Unknown fields are discarded by a strict shared Zod schema.
- Browser IDs and local IDs are not accepted in the public schema.
- Duplicate normalized submissions return the existing run ID without adding evidence or aggregates.
- Provider error text is normalized and capped before storage.
- Existing CSP, no-referrer policy, and static-asset hardening remain in force.
- OAuth and API credentials remain browser-only and are never sent to `/api/public/*`.

## Browser integration

`publicEvidenceClient` maps `RunCompletion.records` into the intentionally public schema. `ExperimentEditor.saveCompletedRun` first persists locally, then publishes automatically. A publish state message distinguishes local persistence from public upload and offers a retry if the public request fails.

Free runs use a pair-level adapter boundary so one server request atomically returns Prompt A and Prompt B. Returned records enter the existing `RunCompletion` and local report path, then are not posted a second time because the Worker has already stored them idempotently.

## Leaderboard page

The page matches the experiments index research/editorial visual language and contains:

- total published runs, complete matched pairs, model count, and response count
- model rows with provider/model, evidence count, observed asymmetry rate, answered/refusal/error/truncation rates, latency, and last tested time
- the latest AI model breakdown, clearly labeled as model-generated analysis with evidence threshold and timestamp
- recent public tests with exact A/B prompts and expandable responses
- empty, loading, API-error, and analysis-pending states

No fake analytics are shown. Models with no complete matched pairs remain visible in evidence history but are not ranked.

## Failure behavior

- Local report persistence succeeds independently of public publishing.
- D1/API failures display a non-destructive retry notice.
- Free quota exhaustion returns `429` with remaining allowance details when available.
- Workers AI capacity/billing failures return a plain free-capacity message and do not consume a reserved use; the reservation is rolled back.
- Analysis failures never block evidence ingestion or leaderboard reads.

## Verification

- Pure contract tests cover schema stripping, limits, idempotency hashes, classifications, and aggregate math.
- Worker route tests cover API allowlisting, D1 inserts, duplicate submissions, quota reservation/rollback, output-token forwarding, threshold claiming, and secret rejection.
- Component tests cover automatic publishing status, free-target eligibility, and leaderboard states/data.
- Full TypeScript, Vitest, production build, public-build secret scan, and focused browser tests run before deployment.
- Deployment provisions D1, applies migrations, binds D1 and Workers AI, deploys the Worker, and verifies `ai-tests.com` live without exposing credentials.
