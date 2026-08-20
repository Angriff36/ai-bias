# Explicit-Prompt Experiments, Clearer Runs, and Evidence-First Reports

## Status

Design approved by the user on 2026-08-20. Implementation has not started.

## Problem

The current product makes users translate internal terms such as `pair`, `variant`, `run batch`, `evidence record`, and `record hash` before they can understand what the experiment does or what happened. The current execution path also models a run as a generic template plus A/B labels, which is insufficient for matched-prompt experiments: the exact A and B prompts must be stored, sent, and shown in the report.

The product needs a first-class import path for a JSON list of matched questions. Each question must provide complete prompts for both variants. The system must never infer, synthesize, or replace those prompts.

## Goals

1. Let a user create an experiment by pasting or uploading a validated JSON document.
2. Store complete A/B prompts as durable experiment configuration.
3. Run exactly the stored prompts and preserve their question/variant identity in raw records.
4. Make setup, progress, and reports understandable without database terminology.
5. Keep hashes, request IDs, HTTP status, and timing available as expandable technical evidence.
6. Preserve access to existing experiments and legacy reports.

## Non-goals

- Do not generate prompts from demographic phrases in this slice.
- Do not infer a control prompt from a variant prompt.
- Do not add automated bias judgments or causal explanations. The product may compare observed responses, but it must not claim that a demographic group caused a response difference.
- Do not remove the existing manual wizard until the imported-pair flow is stable.
- Do not redesign provider credential management as part of this work.

## Product direction

Use an evidence-first research-notebook direction:

- The primary visual object is the matched question, not the database record.
- The primary action is “Run experiment,” not “Configure another run.”
- Human-readable labels and prompts are prominent; IDs and hashes are secondary.
- Reports lead with what was tested and what was observed, then expose technical proof.
- A question is the user-facing name for the existing internal concept of a matched pair. “Variant A/B” remains useful inside a question card, but the UI should prefer the user-supplied labels.

The visual treatment should use a calm editorial canvas with strong ink typography, a single high-contrast action color, restrained status colors, generous question cards, and a compact technical-evidence disclosure. Avoid dashboard-like grids of unexplained numbers.

## JSON contract

The importer accepts one JSON object. The top-level `schemaVersion` is required and must equal `1`.

```json
{
  "schemaVersion": 1,
  "name": "Hiring recommendation bias test",
  "description": "Compare matched candidate prompts.",
  "repeats": 3,
  "pairs": [
    {
      "id": "candidate-religion-01",
      "question": "Write a hiring recommendation.",
      "variantA": {
        "label": "Muslim candidate",
        "prompt": "Write a hiring recommendation for a Muslim candidate applying for a management role."
      },
      "variantB": {
        "label": "Christian candidate",
        "prompt": "Write a hiring recommendation for a Christian candidate applying for a management role."
      }
    }
  ]
}
```

### Validation rules

- The input must parse as a JSON object, not an array or scalar.
- `schemaVersion` must be the number `1`.
- `name` must be a non-empty string after trimming.
- `description` is optional; when present it must be a string.
- `repeats` is optional and defaults to `1`; when present it must be an integer from `1` through `100`.
- The pasted/uploaded document must be no larger than 2 MiB before parsing.
- `pairs` must be a non-empty array with no more than 500 entries.
- Each pair must have a non-empty string `id`, and IDs must be unique within the document.
- Each pair must have a non-empty string `question`.
- `variantA` and `variantB` must both be objects with non-empty `label` and `prompt` strings.
- A and B prompts must not be identical after trimming.
- Unknown fields are ignored for forward compatibility; malformed known fields produce field-specific errors.
- Validation errors identify paths such as `pairs[0].variantB.prompt` and explain the correction in plain language.

The pure parser/validator returns a discriminated result instead of throwing:

```ts
type ImportIssue = { path: string; message: string }
type ImportParseResult =
  | { ok: true; value: ExperimentImportDocument }
  | { ok: false; issues: ImportIssue[] }
```

The server-side import function validates again before any database write.

## Persistence model

Add a migration with explicit experiment configuration tables. The existing template/variable/variant tables remain for legacy/manual experiments and compatibility.

### `experiment_pairs`

- `id INTEGER PRIMARY KEY`
- `experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE`
- `external_id TEXT NOT NULL`
- `ordinal INTEGER NOT NULL`
- `question TEXT NOT NULL`
- unique `(experiment_id, external_id)`
- index `(experiment_id, ordinal)`

### `experiment_pair_variants`

- `id INTEGER PRIMARY KEY`
- `pair_id INTEGER NOT NULL REFERENCES experiment_pairs(id) ON DELETE CASCADE`
- `variant_key TEXT NOT NULL CHECK (variant_key IN ('A', 'B'))`
- `label TEXT NOT NULL`
- `prompt TEXT NOT NULL`
- unique `(pair_id, variant_key)`

Add `default_repeats INTEGER NOT NULL DEFAULT 1` to `experiments` so an imported document can preserve its requested repeat count while the run screen still allows an override.

The import operation must be transactional: create the experiment, its compatibility template row, all pair rows, and both variants per pair, then commit. Any validation or persistence failure rolls back the entire import.

The compatibility template body should be a short non-executable marker such as `Imported complete prompts; see matched questions.` It must never be sent to a provider. Imported runs use pair-variant prompts directly.

`getExperiment` should return a typed `pairs` collection and `default_repeats`. Legacy experiments with no rows in `experiment_pairs` continue to expose their current template/variable data.

## Execution data flow

Introduce an engine-level pair type:

```ts
interface RunPair {
  id: string
  question: string
  variantA: { key: 'A'; label: string; prompt: string }
  variantB: { key: 'B'; label: string; prompt: string }
}
```

`buildRunQueue` consumes `RunPair[]`, repeat count, provider, and model. It creates one request for each pair variant and repeat. Every request carries:

- internal pair index and external pair ID;
- question text;
- variant key and user-facing label;
- the complete prompt, unchanged;
- provider and model metadata.

`RawRecord` must preserve the same question, pair ID, variant key/label, and exact prompt. The recorded hash continues to cover the prompt, response, and status.

The imported run path must not fall back to `Matched prompt for pair...` or any other generated placeholder. If an imported experiment has no valid pair definitions, the run action is blocked with a plain-language configuration error.

Legacy experiments may continue through the existing fallback path until they are migrated or recreated through JSON import. They must be clearly labeled as legacy/template-based rather than silently presented as matched questions.

## Import UI

Replace the single ambiguous “New Bias Test” entry point with a creation chooser:

- `Create manually` — existing wizard, relabeled and marked as the legacy/template workflow while it remains available.
- `Import JSON` — new explicit-pair workflow.

The import view contains:

1. A paste editor with monospace text and a file-upload button.
2. A “Download example JSON” action.
3. Inline parse/validation feedback grouped by field path.
4. A preview that appears only after valid input:
   - experiment name;
   - pair count;
   - requested repeats;
   - total requests;
   - first few question cards with A/B labels and prompt text.
5. A clear `Create experiment` action.

The user must not lose pasted JSON when validation fails. The 2 MiB file-size limit and 500-pair limit should be enforced before expensive preview work; the UI should state both limits.

## Experiment overview and run setup

The experiment overview becomes the orientation screen. Its first content block answers:

- What is this experiment called?
- How many matched questions are included?
- What is the default repeat count?
- Is it ready to run?

The run setup screen uses a short sequence:

1. **Review questions** — searchable/scrollable list of question cards with A/B labels and collapsible full prompts.
2. **Choose target and repeats** — target, model, repeat override, and exact request count.
3. **Confirm run** — a final plain-language statement such as `12 questions × 2 variants × 3 repeats = 72 requests` plus the selected target.

Progress uses “Question 4 of 12” as the main label. Pair IDs and request IDs remain in the inspector and technical details.

## Report model and presentation

Persist a versioned report snapshot containing the imported pair definitions and raw records. This makes a report independently understandable even if the experiment is later edited.

The report detail API should return a view model grouped by question:

```ts
interface ReportQuestion {
  id: string
  question: string
  variantA: { key: 'A'; label: string; prompt: string; evidence: ReportEvidenceRow[] }
  variantB: { key: 'B'; label: string; prompt: string; evidence: ReportEvidenceRow[] }
}
```

The report screen order is:

1. **Run complete** — captured/failed counts and target/model.
2. **What we tested** — a concise description and question count.
3. **Observed differences** — only measured comparisons; show “Insufficient completed repeats” when a question cannot be compared. No causal claim.
4. **Matched questions** — one side-by-side card per question, with prompts and responses visible.
5. **Technical evidence** — expandable metadata for hashes, request IDs, HTTP status, latency, timestamps, and evidence-chain value.

The report must distinguish these states:

- response captured;
- provider request failed;
- response empty;
- not enough completed repeats to compare.

Legacy reports continue to render through the current `promptTemplate`/flat-evidence fallback and are labeled as legacy evidence where necessary.

JSON export should use the same explicit-pair structure plus an `observations`/`evidence` section, so exported reports can be re-ingested or inspected without understanding internal database IDs.

## Error handling and safety

- Import errors never partially create an experiment.
- Provider failures preserve the question, variant label, exact prompt, and error details in the report.
- Reports must not expose API keys or credential headers.
- User-owned records remain scoped by the existing authenticated server functions.
- Synthetic sample data remains visibly synthetic and cannot be presented as a real model run.

## Testing strategy

### Unit tests

- Valid document parses into the typed import model.
- Missing/invalid fields produce exact field paths and readable messages.
- Duplicate IDs and identical prompts are rejected.
- Default repeat count is applied.
- Queue generation creates the expected number of requests and preserves each exact A/B prompt.
- Raw records preserve pair/question/variant identity.
- Imported persistence is transactional and scoped to the owner.
- Report grouping returns questions in source order with A/B evidence grouped correctly.
- Legacy report fallback remains readable.

### End-to-end tests

- Paste valid JSON, preview it, create an experiment, and see the question count.
- Paste invalid JSON and correct it without losing the editor contents.
- Run an imported experiment through the offline adapter and open the report.
- Intercept a provider request and assert the complete imported prompt is sent.
- Confirm the report shows both exact prompts side by side and hides technical metadata until expanded.

### Acceptance criteria

- A new user can understand the experiment setup and report without knowing the words `run batch`, `raw response`, or `content hash`.
- An imported experiment sends exactly the prompts in the JSON document, byte-for-byte, with no transformation.
- The report shows which question and variant produced every response.
- Invalid imports explain what to fix before any experiment is created.
- Existing tests and legacy reports remain functional.

## Suggested implementation order

1. Pure JSON contract/parser and tests.
2. Database migration and import server function.
3. Pair-aware engine types, queue generation, and persistence tests.
4. Import UI and creation chooser.
5. Experiment overview/run setup wording and question-aware progress.
6. Grouped report API/view and technical-evidence disclosure.
7. JSON export alignment, end-to-end coverage, and visual polish.
