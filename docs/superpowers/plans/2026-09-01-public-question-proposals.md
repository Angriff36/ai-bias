# Public Question Proposals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add free public question proposals and let any visitor fund an exact proposal with their own connected OpenRouter account.

**Architecture:** Store proposals separately in D1, expose them through focused public endpoints, and reconcile their answered state only after complete public A/B evidence is published. Reuse the matched-prompt builder for submission and the existing local experiment/OpenRouter execution path for sponsorship.

**Tech Stack:** React, TypeScript, Zod, Cloudflare Worker, D1, Vitest, browser-local SQLite, OpenRouter OAuth.

**Spec:** `docs/superpowers/specs/2026-09-01-public-question-proposals-design.md`

## Global Constraints

- Proposals never create placeholder evidence or invoke models.
- Funders use only their own browser-held OpenRouter credential.
- Exact proposer-defined prompts, labels, and canonical question text survive funding handoff.
- Only a complete published A/B comparison marks a proposal answered.
- Do not change report generation, claim adjudication, or Queue execution.

---

### Task 1: Proposal contracts and D1 persistence

**Files:**
- Create: `worker/migrations/0012_question_proposals.sql`
- Create: `worker/public/questionProposalRepository.ts`
- Create: `worker/public/questionProposalRepository.test.ts`
- Modify: `src/public/contracts.ts`

**Interfaces:**
- Produces `PublicQuestionProposal`, `PublicQuestionProposalRequest`, their Zod schemas, and `QuestionProposalRepository.create/list/get/reconcileRun`.

- [ ] Write repository tests for creation, canonical duplicate return, unanswered filtering, exact pair retention, partial-run rejection, and complete-run reconciliation.
- [ ] Run `bun run test -- worker/public/questionProposalRepository.test.ts` and confirm RED because the migration/repository/contracts do not exist.
- [ ] Add the append-only migration and strict proposal schemas. Validate one canonical question across all pairs and retain exact pair prompts/labels.
- [ ] Implement D1 mapping, duplicate lookup by normalized question key, unanswered listing, detail lookup, and idempotent complete-pair reconciliation.
- [ ] Re-run the focused repository test and confirm GREEN.

### Task 2: Public proposal API and cache boundaries

**Files:**
- Modify: `worker/public/routes.ts`
- Modify: `worker/public/routes.test.ts`
- Modify: `worker/public/edgeCache.ts`
- Modify: `worker/public/edgeCache.test.ts`
- Modify: `src/public/client.ts`
- Modify: `src/public/client.test.ts`

**Interfaces:**
- Consumes proposal schemas/repository from Task 1.
- Produces `listQuestionProposals`, `getQuestionProposal`, and `createQuestionProposal` browser clients.

- [ ] Write route/client tests proving GET list/detail, POST creation without model execution, duplicate idempotency, cache invalidation, and post-publication reconciliation.
- [ ] Run the focused files and confirm RED on missing endpoints.
- [ ] Add injected proposal-repository support to `handlePublicApi`, implement the three endpoints, and reconcile the published run after repository publication.
- [ ] Add only successful proposal GETs to edge caching and invalidate them after proposal POST/evidence publication.
- [ ] Add schema-validated browser clients and cache invalidation.
- [ ] Re-run focused API/cache/client tests and confirm GREEN.

### Task 3: Proposal-mode matched prompt builder

**Files:**
- Modify: `src/wizard/NewBiasTestWizard.tsx`
- Modify: `src/wizard/NewBiasTestWizard.test.tsx`
- Create: `src/public/QuestionProposalComposer.tsx`
- Create: `src/public/QuestionProposalComposer.test.tsx`

**Interfaces:**
- Consumes `createQuestionProposal`.
- Produces a composer callback returning the stored proposal while reusing the exact `WizardResult.pairs`.

- [ ] Write component tests proving proposal mode says `Publish unanswered question`, calls only proposal creation, retains every exact prompt/group, and keeps input on a failed POST.
- [ ] Run the focused component tests and confirm RED.
- [ ] Add a `purpose: 'experiment' | 'proposal'` presentation prop to the wizard without changing its pair construction.
- [ ] Wrap proposal mode in `QuestionProposalComposer`, map `WizardResult` to the public request, and display success/retry states.
- [ ] Re-run focused tests and confirm GREEN.

### Task 4: Answered/Unanswered public experience

**Files:**
- Modify: `src/public/LeaderboardPage.tsx`
- Modify: `src/public/LeaderboardPage.test.tsx`
- Modify: `src/public/conclusions.css`

**Interfaces:**
- Consumes proposal list/create clients and composer from Tasks 2-3.
- Produces public Answered/Unanswered tabs and proposal funding actions.

- [ ] Write UI tests proving Answered preserves the leaderboard, Unanswered lists exact groups, Submit opens free proposal mode, and funding records the proposal handoff without making a provider request.
- [ ] Run the focused page test and confirm RED.
- [ ] Add accessible Answered/Unanswered tabs, unanswered proposal rows/cards, empty/loading/error states, and `Fund with OpenRouter` actions consistent with the existing restrained evidence-led visual language.
- [ ] Re-run the focused page test and confirm GREEN.

### Task 5: Exact local funding handoff

**Files:**
- Create: `src/public/questionProposalFunding.ts`
- Create: `src/public/questionProposalFunding.test.ts`
- Modify: `src/components/ExperimentHistoryList.tsx`
- Modify: `src/components/ExperimentHistoryList.test.tsx`

**Interfaces:**
- Consumes `PublicQuestionProposal`.
- Produces `PENDING_QUESTION_PROPOSAL_KEY`, `proposalImportDocument(proposal)`, and exact-once session handoff into `api.importExperiment`.

- [ ] Write tests proving the generated import document preserves sampling mode, canonical question, prompt text, and labels; repeat navigation does not create duplicate local experiments.
- [ ] Run focused tests and confirm RED.
- [ ] Store the proposal on Fund, consume it once in Experiments, import with the existing schema, remember proposal-to-experiment mapping in session storage, and navigate directly to the run workspace.
- [ ] Re-run focused funding/history tests and confirm GREEN.

### Task 6: Cross-cutting verification

**Files:**
- Modify only defects demonstrated by the gates.

- [ ] Run all touched focused tests.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.
- [ ] Run `bun run build`.
- [ ] Run `node scripts/verify-public-build.mjs` and `git diff --check`.
- [ ] Use the production build in a real browser to submit a mocked proposal, view it under Unanswered, fund it into the exact local experiment, and verify responsive desktop/mobile layout.
- [ ] Commit the scoped implementation with `[feat] add community-funded question proposals`; do not include unrelated files.
