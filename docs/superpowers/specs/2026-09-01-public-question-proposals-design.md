# Public Question Proposals and Sponsorship

## Goal

Anyone can publish a proposed matched-bias question without paying for model inference. Proposed questions appear under an Unanswered tab. Any visitor, including the site owner, can fund an exact proposal by running it from their browser through their connected OpenRouter account. The first published complete matched comparison moves the proposal to Answered automatically.

## Product rules

- The proposer defines the canonical question, exact prompts, and comparison-group labels.
- Proposal submission does not require an API key and does not invoke a model.
- Funding is never pooled and AI Bias Lab never receives money or OpenRouter credentials.
- A funder selects models and repetitions in the existing experiment workspace; requests go directly from that browser to OpenRouter.
- Proposals and evidence remain separate records. Placeholder evidence is prohibited.
- A proposal becomes answered only after the public evidence store contains a complete A/B comparison for its canonical question key.
- Answered questions remain fundable so additional models and repetitions can strengthen the evidence.
- Duplicate proposal submissions for the same canonical question return the existing proposal rather than creating duplicate cards.

## Data model

Migration `0012_question_proposals.sql` creates `question_proposals`:

- `id TEXT PRIMARY KEY`
- `question_key TEXT NOT NULL UNIQUE`
- `question_text TEXT NOT NULL`
- `name TEXT NOT NULL`
- `description TEXT NOT NULL DEFAULT ''`
- `sampling_mode TEXT NOT NULL`
- `pairs_json TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `answered_at TEXT`
- `first_run_id TEXT`

`pairs_json` stores the exact existing `ComparisonPair` shape. Every pair in one proposal must have the same normalized canonical question. Variant labels and prompts are retained byte-for-byte after surrounding whitespace normalization.

## Server API

- `GET /api/public/question-proposals?status=unanswered` returns unanswered proposals newest first.
- `GET /api/public/question-proposals/:id` returns one proposal for funding.
- `POST /api/public/question-proposals` validates and creates a proposal without running inference. Duplicate canonical questions return the existing record.
- Same-origin checks and the existing JSON size boundary apply.
- Public GET responses use the existing short public cache policy. Proposal creation and evidence publication invalidate proposal and leaderboard caches.

After `/api/public/submissions` successfully publishes evidence, the proposal repository reconciles that run. It marks matching proposals answered only when the run contains both A and B for the same question, pair position, repetition, provider, and model. Retried publication is idempotent.

## Browser flow

Top Questions contains Answered and Unanswered tabs. Answered preserves the current leaderboard. Unanswered displays proposal count, exact group chips, creation time, optional description, and a `Fund with OpenRouter` action.

`Submit a Prompt` opens the existing matched-prompt builder in proposal mode. Proposal mode changes the heading and final action copy but reuses phrase detection, group derivation, canonical `[group]` questions, and exact pair construction. Completion posts the proposal instead of creating evidence or invoking a model.

Funding stores the selected proposal in session storage and opens the private Experiments area. A focused handoff imports the proposal as a local experiment exactly once, then navigates to its existing run workspace. The existing provider selector, pricing estimate, repetitions, direct OpenRouter execution, local persistence, and public evidence publication remain the execution path. The proposal prompts are not rewritten during handoff.

Question detail pages keep allowing more evidence through the existing experiment workflow. No report-generation, report-rendering, claim-adjudication, or Queue behavior changes.

## Failure behavior

- Invalid or internally inconsistent proposals return HTTP 400.
- Duplicate proposals return HTTP 200 with the existing proposal.
- Temporary public-service failures leave the local builder contents intact and expose Retry.
- Funding import failures keep the proposal identifier in session storage and expose Retry; they never create evidence.
- A partial or failed model run does not mark a proposal answered.

## Verification

Focused tests prove free proposal creation invokes no provider, duplicate canonical questions merge, unanswered listing excludes answered proposals, partial evidence does not answer a proposal, complete evidence does, funding imports exact prompts/groups, OpenRouter credentials remain browser-only, and the Answered/Unanswered UI transitions correctly. Required repository gates remain typecheck, full tests, and production build for this cross-cutting change.
