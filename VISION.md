# VISION — AI Bias Lab (ai-tests.com)

Written 2026-08-29 from Ryan's description. This file says what the product
must become. Where the code does something else, the code is wrong, not this
file. Sections marked ASSUMPTION are not yet confirmed by Ryan.

## 1. What the site is for

The site shows if an AI system gives a different answer when only the group
in the question changes. "AI system" means any system a person asks a
question of: a chat model, or the AI Overview a search engine shows at the top
of results. The AI Overview case is the main target of study.

The site is a community pool. Every visitor's test adds evidence. Nobody owns
a question. There are no accounts.

## 2. The unit of evidence is the question, not the pair

Today the app stores answers as A/B pairs and shows pairs. That is wrong for
most questions.

The correct model:

- A **question** is one sentence with one slot, or a hand-written comparison.
- A **group** is one value that fills the slot: White, Black, Asian, Hispanic,
  Native, man, woman, Muslim, Christian, young, old, and so on. The set of
  groups is not fixed. It comes from the test.
- An **answer** is one model response. It belongs to one question and one
  group. It records the model, the time, the full text, and the class
  (answered, soft refusal, hard refusal, empty, error, cut off).

Answers for one group never need to match answers for another group in count
or in time. 5 White, 10 Black, 50 Asian is a valid state.

## 3. Two question types, two layouts

### Type 1 — Group question (table)

- Made from one template and a list of group values.
- Shown as a table. One column per group, left to right in the order the
  groups were listed. Every answer for the group goes in its column.
- Columns can have different lengths.
- This is the normal type.

### Type 2 — Pair question (side by side)

- Made from two hand-written prompts, because the comparison needs different
  wording on each side.
- Shown as a pair: left prompt with all its answers, right prompt with all its
  answers.
- Counts still do not need to match.

The wizard records the type when the test is built. The question page reads
the type and picks the layout. Nothing guesses the type later.

## 4. Public pages

### Top Questions

- A ranked list of the most-asked questions. Rank = number of times asked.
- Each row: rank, question text, times asked, number of groups, number of
  models, last seen. No bias score. No match rate.
- Click a row to open the question page.

### Question page

- Header: question text, type, total answers, counts per group, models.
- Body: the Type 1 table or the Type 2 pair view, per section 3.
- Each answer cell shows model, time, class, and the full text on open.
- Reports that used this question are listed by real link, not by topic guess.

### Reports

- A list of every complete report, newest first. Each links to the report
  HTML.

### Conclusions — ASSUMPTION

Ryan has not defined this page yet. Working assumption: it shows the
"What holds across studies" findings from every complete report as short
numbered statements, each linked to its report. It stays empty until a
report exists.

## 5. Reports

### The standard

The reference is `report (2).html` (Ryan, 2026-08-26): "The race-swap audit —
Google AI Overview and three frontier LLMs". Every generated report must
have this shape:

1. **Hero**: eyebrow tag, title, one-paragraph lede that states the finding
   and its direction.
2. **Sticky table of contents.**
3. **Headline numbers**: 4–6 KPI tiles (total responses, questions, agreement
   count, mean gap on the main dimension).
4. **Dimension table**: every answer scored 0–3 on a fixed set of dimensions.
   The reference set is: danger framing, sympathy, skepticism/hedging,
   collective blame, moral condemnation, anti-stereotyping warnings,
   acknowledges discrimination. One row per dimension, one column per group,
   a delta column, inline bars.
5. **Per-model section**: cards with per-dimension bars per model, so a
   pattern in one lab is separate from a pattern across the field.
6. **Consistency section**: how many questions show the same direction.
7. **Worked cases**: the widest gap, the mirror case, the case that runs the
   other way. Each with a "versus" panel and quoted excerpts.
8. **All questions**: one expandable entry per question. Inside: the
   per-model per-dimension score grid, a scoring note that quotes both sides,
   and the raw text of one answer per group, side by side.
9. **What holds across studies**: numbered findings in plain words.
10. **What this does and does not show.**
11. **How this was run, and what would break it.**

The prose explains. It names the direction of every gap. It quotes the
answers. It does not stop at numbers.

### Scope of one report

- A report runs over a **set of questions**. The set can be 1, 5, 10, or 20
  questions. The size depends on how much evidence exists.
- One question with many answers is a valid report by itself.
- A question needs enough answers per group to score. The threshold is a
  setting, not a fixed number in code.

### Trigger — manual

Report generation is **manual**. A person picks the questions and starts the
report. No cron. No auto-claim on publish. No daily auto-limit logic.

Reason: the current automatic chunked pipeline with cron resume and repair
scripts is the part Ryan wants replaced completely.

### Pipeline

1. Select questions and groups. Read every answer for them from D1.
2. Judge: score each answer 0–3 on each dimension. One call per answer or per
   question, batched. Record the judge model and the rubric version on every
   score.
3. Aggregate: per question, per model, per group, per dimension. Deltas are
   group minus baseline group. The baseline is the first group in the list.
4. Synthesize: the prose sections from the aggregates and the top cases.
5. Render: the HTML in the shape above. Store it. Publish it.

Each step writes its output to D1 before the next step starts, so a failed
step restarts from its own output, not from zero. A person restarts it. Not a
timer.

### Groups in reports

A report reads the group list from the question. It is not limited to two
sides. A report over a five-group question has five columns in every table.
The "white vs other" framing of the reference report is one case, not the
rule.

## 6. Tests must feed this

The wizard must record:

- question type (group or pair)
- the template and the ordered group list, or the two prompts
- the group name on every answer

Publishing sends the group name, not only "A" or "B".

## 7. What stays

- Browser-only experiment storage (IndexedDB).
- Direct browser → OpenRouter calls, one user message, no system prompt.
- Automatic anonymous publishing of finished live runs.
- Cloudflare Worker + D1 for the public side.
- The five README rules on prompts, simulation, cut-off replies, and errors.

## 8. What goes

- A/B pair as the display unit on the public site.
- Match rate and bias score on the Top Questions rows.
- Topic-guess links between reports and questions.
- Cron-driven report resume and the tools/ repair scripts as a pipeline.
- Automatic global-report claims on publish.
