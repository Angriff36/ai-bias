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
  models, last seen.
- Click a row to open the question page.

### Question page

- Header: question text, type, total answers, counts per group, models.
- Body: the Type 1 table or the Type 2 pair view, per section 3.
- Each answer cell shows model, time, class, and the full text on open.
- Reports that used this question are listed.

### Conclusions — the claims board

Reference: `Leaderboard.png` (Ryan, 2026-08-29).

Top Questions holds the evidence. Conclusions holds what the evidence proves.

A Conclusions row is NOT a prompt. It is a **research claim**, written as a
question about the AI:

- "Does the model treat names associated with different ethnic backgrounds
  differently when ranking job candidates?"
- "Does the model recommend lower salary ranges for women than men in
  otherwise identical negotiation scenarios?"
- "Does the model evaluate crime severity differently when the suspect's name
  implies a specific racial background?"

One claim is answered by many prompts from Top Questions. The page does not
ask a model anything new. It reads the answers that already exist and
concludes from them.

Rule: **a person writes the claim; the system writes the answer.** The
answer (score, verdict, numbers) is computed from the pooled evidence, never
typed by a person, so no person can tilt it.

Layout, top to bottom (as in the image):

1. Title and one line: ranks the claims by how much they have been tested,
   updated as new tests complete.
2. Four stat tiles: questions tracked, matched tests run, reports published,
   models covered.
3. **Published Reports** row: one card per complete report with code
   (RPT-007), month, title, question count, HTML / PDF links.
4. **How this works** panel: Data collection, Ranking method, Research
   reports.
5. Controls: show top 20 / 50 / 100. Sort by Tests, Bias Score, Match Rate,
   Newest.
6. The table. One row per claim:
   - rank, NEW badge if new in the last 7 days
   - the claim text
   - model chips: which models the evidence covers
   - tests: how many prompt answers were studied, with the change since last
     update (+38)
   - match rate: how solid the evidence is (share of usable answers)
   - bias score 0–1 with a band (low / med / high): how strongly the evidence
     supports the claim
   - report chips (RPT-005): the written reports that studied this claim
   - chevron: opens the claim page, which lists the prompts and answers behind
     it
7. Footer: "Showing top 20 of N claims" and last-updated time.

Status (2026-08-30): built. `src/public/ConclusionsPage.tsx` is the claims
board; `worker/public/claimRepository.ts` computes the answer. Claims are
stored in the D1 table `claims` (migration 0006).

How a prompt attaches to a claim (decided for now, manual, per Ryan's lean):
the person who writes the claim picks its questions from the Top Questions
list in the same form. The server keeps only the question keys; the score is
recomputed from the live evidence on every read. A later option is to let a
test author pick a claim when building the test.

### Reports

- A list of every complete report, newest first. Each links to the report
  HTML and PDF.

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

Report generation is **manual**. A person picks the questions on Top
Questions and presses "Generate report from selected". No cron. No auto-claim
on publish.

Status (2026-08-30): built. `POST /api/public/reports {questionKeys}` claims
the report; the every-minute cron and the publish-time auto-claim are removed.
A daily cap of 20 report starts stays as a cost guard only — anyone can start
a report and each one spends real judge-model money.

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

Status (2026-08-30): the judge step checkpoints every scored pair in D1.
While the Reports tab is open the browser asks the server for the next step
every 50 seconds; a Continue button does the same by hand. Nothing runs on a
server timer.

### Groups in reports

A report reads the group list from the question. It is not limited to two
sides. A report over a five-group question has five columns in every table.
The "white vs other" framing of the reference report is one case, not the
rule.

Status (2026-08-30): partly built. The overview gets a table with one score
column per group (delta = group minus reference). The judge still scores
answers as reference-vs-comparison pairs and the per-model cards and worked
cases still show two sides. Full N-group scoring is the next step.

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

## 8. What changes

- The A/B pair stops being the display unit on the public site. Group
  columns replace it (section 3).
- Conclusions becomes the claims board: person-written claims, system-computed
  answers. Its layout already exists on the Top Questions tab and moves.
  Top Questions becomes the plain most-asked prompt list.
- The bias score stays but reads all answers, not only the last 200.
- Report generation becomes manual (section 5).

## 9. Terms Ryan asked about

Both behaviours were replaced on 2026-08-30 while implementing sections 4-5;
the descriptions stay so the words mean something.

**Report links by topic guess.** The old leaderboard put a report chip
(RPT-005) on a row when the question text and the report title looked like
the same topic. Replaced: a claim now shows a chip only for reports that
actually scored one of its questions (`question_keys_json` on new reports;
the stored evidence on old ones).

**Automatic report claims.** The server used to start a global report by
itself whenever a publish crossed an evidence threshold, and a cron retried
pending reports every minute. Replaced: reports start only from the "Generate
report from selected" button (section 5). The daily cap of 20 starts stays as
a cost guard.
