# Explicit-Prompt Experiments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete-prompt JSON experiment import and make setup, execution, and reports understandable around matched questions.

**Architecture:** Validate a versioned import document in a pure client/server-shared module, persist imported questions and A/B prompts in dedicated tables, and make the execution engine consume those exact pair definitions. Present grouped question data in the UI while retaining a legacy fallback for existing template-based experiments and reports.

**Tech Stack:** React 18, TypeScript, Vitest, Playwright, sql.js migrations, existing local server-function pattern.

**Spec:** `docs/superpowers/specs/2026-08-20-json-experiment-ui-report-design.md`

## Global Constraints

- Complete prompts are immutable experiment inputs; never synthesize or replace imported prompts.
- JSON schema version is `1`; input limit is 2 MiB and 500 pairs.
- Imported experiments require two non-identical prompts per question.
- Existing dirty files belong to the user; only task-scoped files may be edited.
- Legacy template experiments and legacy reports must remain readable.
- Every production behavior change gets a failing test before implementation.

---

### Task 1: Add and validate the JSON import contract

**Files:**
- Create: `src/lib/experimentImport.ts`
- Create: `src/lib/experimentImport.test.ts`

**Interfaces:**
- Produces `ExperimentImportDocument`, `ExperimentImportPair`, `ImportIssue`, and `parseExperimentImport(raw: string): ImportParseResult`.
- `parseExperimentImport` enforces JSON parsing, schema version, required strings, pair count, unique IDs, complete A/B prompts, non-identical prompts, and default repeats.

- [ ] **Step 1: Write failing tests** for valid documents, malformed JSON, field paths, duplicate IDs, identical prompts, default repeats, and 2 MiB/500-pair limits.
- [ ] **Step 2: Run** `npm test -- src/lib/experimentImport.test.ts --run` and confirm the tests fail because the parser does not exist.
- [ ] **Step 3: Implement** the pure parser with deterministic, plain-language issues and no database/browser dependencies.
- [ ] **Step 4: Run** the focused test and confirm it passes.

### Task 2: Persist imported questions and prompts

**Files:**
- Modify: `src/db/migrations.ts`
- Modify: `src/server/functions.ts`
- Modify: `src/server/__tests__/run-persistence.test.ts`
- Create: `src/server/__tests__/experiment-import.test.ts`

**Interfaces:**
- Add `experiment_pairs`, `experiment_pair_variants`, and `experiments.default_repeats` in migration `0006`.
- Add `importExperiment(token, document)` and return imported `pairs` plus `default_repeats` from `getExperiment`.
- Keep the transaction atomic and owner-scoped.

- [ ] **Step 1: Write failing persistence tests** for successful import, owner isolation, pair ordering, exact prompt storage, default repeats, duplicate/invalid input rejection, and rollback on insert failure.
- [ ] **Step 2: Run** the focused server tests and confirm failure from missing tables/functionality.
- [ ] **Step 3: Implement** the migration and transactional import function; retain a non-executable compatibility template row for the existing schema.
- [ ] **Step 4: Extend** `ExperimentDetail` types and `getExperiment` to return pair definitions without breaking legacy template data.
- [ ] **Step 5: Run** the focused persistence tests and confirm they pass.

### Task 3: Make the execution engine pair-aware

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/executor.ts`
- Modify: `src/components/RunScreen.tsx`
- Modify: `src/components/ExperimentEditor.tsx`
- Modify: `src/engine/executor.test.ts`

**Interfaces:**
- Add `RunPair` with exact `variantA` and `variantB` prompt definitions.
- Add pair ID/question/variant key fields to `RunRequest` and `RawRecord`.
- Change `buildRunQueue` to consume `RunPair[]` for imported experiments; preserve a clearly labeled legacy fallback only for old experiments.

- [ ] **Step 1: Write failing tests** proving queue count, source order, labels, question identity, and byte-preserved A/B prompts.
- [ ] **Step 2: Run** the focused engine test and confirm the current placeholder-based queue fails.
- [ ] **Step 3: Implement** pair-aware queue generation and raw-record propagation.
- [ ] **Step 4: Wire** imported pair definitions from `ExperimentEditor` into `RunScreen`; block imported runs with missing pair definitions.
- [ ] **Step 5: Run** engine and persistence tests together.

### Task 4: Add the JSON import experience

**Files:**
- Create: `src/components/ImportExperimentDialog.tsx`
- Modify: `src/components/ExperimentHistoryList.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `experiment-run.spec.ts`

**Interfaces:**
- The dialog accepts pasted text or a `.json` file, preserves invalid input, displays field-path errors, previews valid counts/prompts, downloads an example document, and calls `importExperiment` only after validation.
- The creation chooser exposes `Create manually` and `Import JSON`.

- [ ] **Step 1: Add a failing browser test** for chooser labels, valid preview, invalid input retention, file upload, and create action.
- [ ] **Step 2: Run** the focused browser test and confirm failure from the missing dialog.
- [ ] **Step 3: Implement** the dialog and example-download helper using the pure parser.
- [ ] **Step 4: Add** the editorial question-card preview styling and accessible labels.
- [ ] **Step 5: Run** focused UI tests and typecheck.

### Task 5: Reframe experiment overview, setup, and progress

**Files:**
- Modify: `src/components/ExperimentEditor.tsx`
- Modify: `src/components/RunScreen.tsx`
- Modify: `src/components/ProgressGrid.tsx`
- Modify: `src/PairInspector.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Imported experiments show question count, default repeats, readiness, searchable question cards, exact request count, and target/model before starting.
- Progress uses “Question N of M”; internal pair/request IDs remain secondary technical metadata.

- [ ] **Step 1: Add failing UI assertions** to the existing experiment flow for question-first copy and exact prompt inspection.
- [ ] **Step 2: Run** the targeted Playwright test and confirm the old copy/structure fails.
- [ ] **Step 3: Implement** the overview/setup/progress copy and question cards without changing provider credential behavior.
- [ ] **Step 4: Run** the targeted Playwright test and confirm it passes.

### Task 6: Group reports around questions and expose technical evidence secondarily

**Files:**
- Modify: `src/server/functions.ts`
- Modify: `src/components/ReportDetailView.tsx`
- Modify: `src/components/ReportExportMenu.tsx`
- Modify: `src/styles.css`
- Modify: `src/server/__tests__/run-persistence.test.ts`
- Modify: `src/server/__tests__/report-exactness.test.ts`

**Interfaces:**
- Report persistence stores a versioned pair snapshot plus raw evidence.
- `getReportDetail` returns grouped `ReportQuestion` objects with exact A/B prompts and evidence, while retaining a legacy flat-evidence fallback.
- Technical metadata is hidden under an accessible disclosure; JSON export uses explicit pairs plus evidence.

- [ ] **Step 1: Write failing tests** for grouped report data, source order, exact prompts, incomplete/failed states, legacy fallback, and export shape.
- [ ] **Step 2: Run** focused report tests and confirm failure against the current flat report model.
- [ ] **Step 3: Implement** versioned report snapshots and grouped API mapping.
- [ ] **Step 4: Replace** the flat table with question cards containing prompt/response comparisons and an expandable technical-evidence section.
- [ ] **Step 5: Run** server report tests and the report component tests.

### Task 7: Verify the complete imported experiment flow

**Files:**
- Modify: `experiment-run.spec.ts`

- [ ] **Step 1: Add an end-to-end test** that imports the example JSON, previews two questions, creates the experiment, runs it offline, and opens the grouped report.
- [ ] **Step 2: Add a provider interception assertion** that the exact imported A or B prompt is sent unchanged.
- [ ] **Step 3: Run** `npm test -- --run`, `npm run typecheck`, `npm run build`, and `npm run test:e2e -- experiment-run.spec.ts`.
- [ ] **Step 4: Run** `git diff --check` and inspect `git status --short` to confirm unrelated dirty files remain preserved.
