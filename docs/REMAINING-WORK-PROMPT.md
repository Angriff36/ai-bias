# Prompt: finish the AI Bias Lab app

Copy everything below the line into a new agent session.

---

Work in `C:\projects\ai-bias2\ai-bias` on branch `main`. Push when work passes; do not ask about git.

## What this app is

A local research tool that measures AI bias. The user writes one prompt, the app swaps a demographic word to make a matched pair, sends both prompts to real models, and stores the replies as evidence. The user is not a developer. Report in plain language, never in code or tooling terms, and never hand them an engineering decision to make.

Stack: React 18, TypeScript, Vite, sql.js in the browser, Vitest. Package manager: bun. Data lives in browser `localStorage`; there is no server.

## Invariants — never break these

These were each a real defect. Regressing any one produces invalid research data.

1. A prompt for a model under test must never run through a coding-agent CLI (`claude`, `codex`, `gemini`). Those sessions inherit the repository and tools, so the reply is not the model's. Subscription providers stay unsupported for inference.
2. A model request carries exactly `variant.prompt` as one user message: no system prompt, no tools, no repository context, no silent fallback to a different provider.
3. Simulated answers are never the default and never look like real ones. No model may be pre-selected on the run screen.
4. An empty model reply is a failure, not a successful observation.
5. No raw exception text, SQL, or stack detail reaches the screen. Every failure states what happened and what to do next.
6. No `catch {}` that leaves the user with a spinner, a silently reverted input, or a control that does nothing.

Tests already cover all six. Keep them passing.

## The state you are inheriting

Live screens, reachable from `src/App.tsx`: experiment list, experiment editor and run screen, providers, reports list and detail, admin, templates, and `#/preview`.

Roughly 100 further files are built but connected to nothing. **`tsc -b` only checks files reachable from `src/main.tsx`, so none of that code has ever been typechecked.** Use `npx tsc --noEmit -p tsconfig.all.json` for the honest check. It currently reports **94 errors across 19 files**.

The disconnected code splits three ways:

- **Genuinely new, needs connecting:** pair inspector, capture page, manual observation, blinded judge config.
- **Broken against APIs nobody wrote:** `EvidenceView` (9 errors, calls four database functions that do not exist), `ClassificationCorrection` (10), `MatchedPairMatrix` (24), `RerunBatchPanel` (needs `createRunBatch` and `hasActiveBatch`), `ReportExportMenu` (5), `mockData` (10).
- **Superseded duplicates, to delete:** `RunSetupScreen`, `OFATExperimentBuilder`, `PhraseDetectionWizard`, `LiveRunScreen`, `CustomHttpAdapterForm`, `features/report/ReportView`, `views/*`. Each duplicates a screen that already works. The user reviewed them at `#/preview` and rejected them.

## The work, in order

**1. Redesign the live screens.** This is the priority. The user's words: the UI works but is "dogshit". Six screens built by different agents with no shared design. Give them one visual language — consistent spacing, type scale, buttons, empty states, and error banners. Do not add features while doing this. Do not change the run engine, prompt handling, scoring, or report format.

**2. Delete the superseded duplicates** listed above, plus `#/preview` and `src/preview/`, once nothing imports them. Keep pure logic modules that have their own passing tests (`src/ofat.ts`, `src/workload.ts`).

**3. Connect the genuinely new features**, one per commit, each verified in the running app.

**4. Repair or delete the broken ones.** For each, decide whether the missing API is worth writing. `EvidenceView` needs real database functions; `RerunBatchPanel` largely duplicates the multi-model run that already exists and carries a stale hardcoded model list.

**5. Drive `tsconfig.all.json` to zero errors and make it the gate**, so disconnected code can never rot unseen again.

## How to verify

- `npx vitest run` — 271 tests, all passing. Never commit a red suite.
- `npx tsc -b` for the app graph, `npx tsc --noEmit -p tsconfig.all.json` for everything.
- jsdom and Testing Library are installed. UI behaviour must have a test that drives the component like a user; see `src/components/ProviderConfig.test.tsx`. Mounting `ExperimentEditor` in a test crashes the vitest worker on this machine — unsolved, worth fixing, since that is the highest-risk screen.
- Typecheck passing is not proof the screen works. Run the app and look at it.

## Working rules

- Read the file before changing it. Match the existing patterns.
- Smallest correct change. No refactors that were not asked for.
- Commit often in small pieces; push when tests and the gate pass.
- If a fix reveals a second problem, fix that too rather than reporting it back.
