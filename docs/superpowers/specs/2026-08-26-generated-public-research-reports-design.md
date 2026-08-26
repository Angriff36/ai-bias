# Generated Public Research Reports Design

**Date:** 2026-08-26

## Goal

Generate publication-style research reports from the anonymous evidence already stored by `ai-tests.com`. A visitor can request a report for a sufficiently large completed run, and the public leaderboard automatically receives a new global report after each additional 200 model responses. Reports remain reproducible, evidence-backed, downloadable as standalone HTML, and inexpensive enough to run without using visitor credentials.

The visual and editorial reference is `C:\Users\Ryan\Downloads\report (2).html`: headline narrative, methodology, headline metrics, model comparisons, consistency and refusal analysis, strongest matched-prompt findings, ranked expandable evidence, and explicit limitations.

## Product rules

- A run-specific report becomes eligible at 20 complete matched questions.
- Eligible run reports are generated only when requested. Repeated requests for unchanged evidence return the existing report.
- A global report is generated automatically whenever the public evidence total crosses another 200-response watermark: 200, 400, 600, and so on.
- A report uses only anonymous public evidence. It never receives or records a visitor name, OpenRouter identity, OAuth token, API key, IP address, local experiment ID, or private browser database content.
- Report generation uses the site's Cloudflare Workers AI binding, never the visitor's OpenRouter credits.
- Reports are explicitly labeled as model-assisted analysis. They distinguish observed measurements from interpretation and do not claim that any model is globally the "most biased."
- A failed report job never blocks evidence ingestion, local report persistence, leaderboard reads, or later retry.

## Report contents

Each report uses a fixed publication template with these sections when the available evidence supports them:

1. Research title, evidence date, tested models, and response count.
2. Executive finding with careful sample-size language.
3. Headline metrics: responses, complete matched questions, models, repeats, refusal counts, truncations, and measured response differences.
4. Method: how matched prompts were formed, how evidence was grouped, the scoring rubric, and the report-generation model versions.
5. Model-by-model comparison with sample size alongside every rate or score.
6. Cross-model consistency and disagreement.
7. Refusal, error, and truncation analysis.
8. Strongest measured matched-prompt differences with scoring notes and representative excerpts.
9. Every included matched question, ranked deterministically, with expandable per-model scores and raw Prompt A / Prompt B evidence.
10. Limitations and statements the evidence does not establish.

Sections with insufficient evidence are omitted or shown as quiet absence states. The system does not fabricate metrics, comparisons, or findings to fill the template.

## Architecture

Report generation is a durable Worker-side pipeline with four isolated stages:

1. **Eligibility and claim** validates the requested run or global response watermark and atomically creates one report job for one immutable evidence snapshot.
2. **Evidence dossier** queries D1 and produces deterministic statistics, pair groupings, safe excerpts, and bounded scoring batches.
3. **Model-assisted scoring and synthesis** scores matched evidence into a strict internal schema and writes the narrative sections from those scores and aggregates.
4. **Fixed rendering** escapes every dynamic value and renders the structured report through a controlled HTML template. The AI model never emits the final HTML.

The report's full raw evidence is appended directly from D1 by the renderer. Raw responses therefore do not consume synthesis output tokens and cannot introduce executable markup.

## D1 data model

### `generated_reports`

One row per immutable generated report:

- `id TEXT PRIMARY KEY`: server-generated UUID
- `scope TEXT NOT NULL CHECK(scope IN ('run','global'))`
- `public_run_id TEXT NULL`: populated for a run report
- `response_watermark INTEGER NULL`: populated for a global report
- `evidence_hash TEXT UNIQUE NOT NULL`: SHA-256 over ordered evidence IDs and hashes plus report schema version
- `status TEXT NOT NULL CHECK(status IN ('pending','complete','failed'))`
- `scoring_model_id TEXT NOT NULL`
- `synthesis_model_id TEXT NOT NULL`
- `report_schema_version INTEGER NOT NULL`
- `structured_json TEXT NULL`: validated report document
- `error_code TEXT NULL`: safe internal category, never provider credentials or raw exception text
- `created_at TEXT NOT NULL`
- `completed_at TEXT NULL`

A uniqueness constraint covers run scope and public run ID. A separate uniqueness constraint covers global scope and response watermark. An unchanged report cannot be billed twice.

### `report_pair_scores`

One row per report, model, matched question, and repeat:

- report ID, public run ID, pair index, run index, provider, and model ID
- deterministic references to Prompt A and Prompt B evidence rows
- validated numeric dimension scores and direction
- refusal/error/truncation observations derived from stored evidence
- bounded model scoring note

The table makes the report explainable and allows the renderer to rebuild a standalone report without calling Workers AI again.

## Scoring and synthesis

The first implementation uses `@cf/meta/llama-3.1-8b-instruct-fp8-fast` for bounded pair scoring and `@cf/meta/llama-3.3-70b-instruct-fp8-fast` for final synthesis. Model IDs are persisted with every report so historical reports remain attributable if the configured models change.

Pair scoring uses a versioned rubric covering only observable response characteristics:

- danger or extremism framing
- sympathy or validation
- skepticism or evidentiary burden
- collective blame
- moral condemnation
- anti-stereotyping warnings
- acknowledgement of discrimination
- refusal or deflection

Each dimension is scored identically for both variants. The model must provide bounded numeric values and a short evidence note. The Worker validates ranges and structure; invalid batches retry once, then fail the job safely.

Synthesis receives only deterministic aggregates, validated pair scores, selected bounded excerpts, and method metadata. It receives instructions to separate observation from hypothesis, identify contradictory evidence, state sample-size limitations, and avoid causal or global-ranking claims.

The narrative output cap is 4,096 tokens. Pair scoring is batched with explicit input and output limits so unusually long visitor-funded responses cannot create unbounded cost.

## Cost controls

- Run reports require at least 20 complete matched questions.
- Global reports occur only at 200-response watermarks.
- Evidence hashes and unique claims prevent duplicate generation.
- Only the strongest, weakest, and disagreement examples enter synthesis; all raw evidence is rendered without model processing.
- Scoring batches truncate excerpts for model input while the downloadable report still shows the stored response.
- A hard per-report input budget and 4,096-token synthesis cap bound the maximum bill.
- A Worker-side daily report-job ceiling prevents denial-of-wallet traffic. Cached reports remain readable after the ceiling is reached.

At current Cloudflare rates, the expected cost is approximately $0.01-$0.03 for a 20-question run report and $0.03-$0.10 for a 200-response global report, depending primarily on response length. These are operating estimates, not billing guarantees; the configured limits, persisted usage metadata, and Cloudflare dashboard remain the source of truth.

## API and routing

The Cloudflare Worker adds only these public report routes:

- `POST /api/public/reports` with `{ runId }`: validate a public run, return `422` below 20 complete matched questions, claim or return its cached report, and schedule generation with `waitUntil`.
- `GET /api/public/reports`: list completed reports with scope, evidence totals, models, title, timestamp, and public URL.
- `GET /api/public/reports/:id`: return the validated structured report document and generation metadata.
- `GET /api/public/reports/:id.html`: return the escaped standalone HTML publication with a restrictive content security policy.

The existing submission route checks whether the inserted evidence crossed one or more 200-response watermarks. It atomically claims each crossed global report and schedules generation. Duplicate submissions do not trigger reports.

All report routes remain same-origin except the read-only HTML permalink, which may be linked publicly but never enables credentials, cookies, or cross-origin mutation.

## Browser experience

The Leaderboard page gains a **Research reports** section that lists completed global and run reports. Each item exposes its evidence size, models, generated date, and a clear **Read report** action.

After a live run is anonymously published, the experiment screen shows:

- **Generate full report** when its public run contains at least 20 complete matched questions.
- A quiet explanation of the 20-question minimum when it is not eligible.
- Pending, failed-with-retry, and ready states without interfering with the locally persisted run report.

The publication page follows the editorial style of the supplied reference: wide readable measure, strong serif headlines, restrained red evidence accents, compact tables, sticky section navigation where practical, and expandable evidence rows. It remains responsive, keyboard accessible, and printable.

## Security and privacy

- The report service queries only D1 public evidence and aggregate tables.
- OAuth tokens and API keys are neither accepted by report schemas nor available to the report generator.
- All AI-produced structured text is validated, length-limited, and escaped before HTML rendering.
- Raw response HTML is displayed as text. Scripts, event attributes, links, and model-supplied markup are never trusted.
- Standalone HTML receives a restrictive CSP, `X-Content-Type-Options: nosniff`, and a no-referrer policy.
- Public report IDs are random UUIDs. Enumeration exposes only evidence already intentionally published on the leaderboard.

## Failure behavior

- If scoring or synthesis fails, the job becomes `failed` with a safe error category and can be retried without creating a second report row.
- If a report is requested while pending, the API returns that pending report rather than starting another job.
- If an eligible run has incomplete A/B evidence after normalization, the API explains that no report can be generated from it.
- A global report claim is transactional with its response watermark but generation is asynchronous; crossed watermarks are not lost when multiple submissions arrive concurrently.
- Model deprecation is handled by changing the configured model for future jobs. Completed reports preserve their original model IDs and structured document.

## Verification

- Unit tests cover eligibility, 200-response threshold crossing, evidence hashing, scoring schema validation, deterministic ranking, escaping, and cost/input caps.
- Repository tests cover atomic claims, duplicate requests, failed-job retry, report reconstruction, and ordered evidence queries.
- Worker route tests cover same-origin mutation, public reads, minimum evidence errors, pending/cached behavior, automatic scheduling, response headers, and credential-shaped-field rejection.
- Component tests cover report eligibility, request/pending/ready/error states, report listing, and publication rendering.
- The report HTML is opened in a real browser and checked at desktop and mobile widths, including keyboard expansion, print layout, and script-injection fixtures.
- Full TypeScript, Vitest, production build, public secret scan, D1 migration, deployment, and live `ai-tests.com` smoke checks run before completion is reported.
