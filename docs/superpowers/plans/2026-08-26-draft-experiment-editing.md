# Draft Experiment Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user edit an unrun experiment's exact matched prompts directly from the Run experiment screen without changing its ID.

**Architecture:** Add one owner-scoped transactional `updateDraftExperiment` server function that rejects experiments with any run batch, then reuse `NewBiasTestWizard` in edit mode. `ExperimentEditor` exposes the action in the Run experiment header and reloads the same experiment after save.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, sql.js browser persistence.

**Spec:** Bounded design approved in chat on 2026-08-26; action location clarified by the Run experiment screenshot.

## Global Constraints

- Show the action on the Run experiment screen beside the Draft status.
- Preserve the experiment ID and replace the editable definition atomically.
- Reject updates after any run batch exists, even if the UI is bypassed.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Transactional draft-definition update

**Files:**
- Modify: `src/server/functions.ts`
- Modify: `src/browser/api.ts`
- Modify: `server/api.ts`
- Modify: `src/api.ts`
- Test: `src/server/__tests__/draft-experiment-edit.test.ts`

**Interfaces:**
- Produces: `DraftExperimentUpdate { name: string; description?: string; repeats: number; pairs: ExperimentImportPair[] }`
- Produces: `updateDraftExperiment(token: string | null, id: number, input: DraftExperimentUpdate): ExperimentDetail`
- Error: `ServerError(409, 'This experiment cannot be edited after a run has been created.')`

- [ ] **Step 1: Write the failing persistence tests**

Create a real database-backed test that imports a two-pair draft, calls `updateDraftExperiment`, and asserts the same ID now returns the new name, description, repeats, and exact prompts. Add a second test that creates a run batch through `completeOfflineRun` and expects status 409 without changing any stored prompts.

- [ ] **Step 2: Verify the tests fail for the missing function**

Run: `npm test -- src/server/__tests__/draft-experiment-edit.test.ts`

Expected: FAIL because `updateDraftExperiment` is not exported.

- [ ] **Step 3: Implement the minimal transaction**

Parse the update through the existing explicit-prompt import contract, verify ownership, query `COUNT(*) FROM run_batches`, and inside `withTransaction` update experiment metadata, delete/recreate templates and explicit pairs, and preserve the experiment row ID. Call `persist()` only after the transaction succeeds.

- [ ] **Step 4: Wire browser and local RPC APIs**

Expose `updateDraftExperiment(id, input)` through `createBrowserApi`, local RPC, and public TypeScript exports without changing unrelated endpoints.

- [ ] **Step 5: Verify persistence tests pass**

Run: `npm test -- src/server/__tests__/draft-experiment-edit.test.ts`

Expected: PASS.

### Task 2: Reusable wizard edit mode

**Files:**
- Modify: `src/wizard/NewBiasTestWizard.tsx`
- Modify: `src/wizard/NewBiasTestWizard.test.tsx`

**Interfaces:**
- Add prop: `initialValue?: WizardResult`
- Add prop: `mode?: 'create' | 'edit'`
- Existing `onCreate(result)` remains the submit boundary and returns the preserved experiment ID in edit mode.

- [ ] **Step 1: Write the failing component test**

Render the wizard with `mode="edit"` and an `initialValue` containing Prompt 1 plus two matched prompts. Assert it opens on `Create matched prompts`, shows all three exact prompts, labels the primary button `Save changes`, and submits the edited prompt without creating a second definition.

- [ ] **Step 2: Verify the test fails**

Run: `npm test -- src/wizard/NewBiasTestWizard.test.tsx`

Expected: FAIL because edit props and populated variants are absent.

- [ ] **Step 3: Implement edit initialization and copy**

Initialize variants from `initialValue.pairs`: Prompt 1 is the first `variantA.prompt`, and subsequent prompts are each `variantB.prompt`. Initialize name and description, start at step 1 for edit mode, render `EDIT EXPERIMENT`, and change submit progress/copy to `Saving...` / `Save changes` while preserving creation behavior.

- [ ] **Step 4: Verify wizard tests pass**

Run: `npm test -- src/wizard/NewBiasTestWizard.test.tsx`

Expected: PASS.

### Task 3: Put Edit prompts on the Run experiment screen

**Files:**
- Modify: `src/components/ExperimentEditor.tsx`
- Modify: `src/components/ExperimentEditor.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `WorkspaceView` adds `edit`.
- The visible action is `Edit prompts` and is available only when `experiment.run_count === 0`.

- [ ] **Step 1: Write the failing UI test**

Open a draft experiment, enter the Run experiment screen, assert `Edit prompts` appears in the page header, click it, edit Prompt 2, save, and assert the Run screen returns with the changed exact prompt. Add a fixture with `run_count: 1` and assert the action is absent.

- [ ] **Step 2: Verify the UI test fails**

Run: `npm test -- src/components/ExperimentEditor.test.tsx`

Expected: FAIL because the Run header has no edit action.

- [ ] **Step 3: Implement the Run-header action**

Render a compact header action beside `StatusBadge`. In `edit` view, render `NewBiasTestWizard` with the current exact prompt definition and call `api.updateDraftExperiment`. On success, replace local experiment state and return to `run`; on failure, keep the wizard open with its existing error treatment.

- [ ] **Step 4: Verify focused and full gates**

Run: `npm test -- src/components/ExperimentEditor.test.tsx src/wizard/NewBiasTestWizard.test.tsx src/server/__tests__/draft-experiment-edit.test.ts`

Run: `npm run typecheck && npm test && npm run verify:public`

Expected: all commands exit 0.

- [ ] **Step 5: Commit only draft-edit files**

Commit message: `feat: edit draft prompts from run screen`

