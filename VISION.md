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

### Conclusions — the Question Leaderboard

Reference: `Leaderboard.png` (Ryan, 2026-08-29). This design is ALREADY
BUILT in the code (`src/public/LeaderboardPage.tsx`, `conclusionsFeed.ts`)
but it was wired to the Top Questions tab by mistake. The Conclusions tab
shows an empty placeholder. Fix: move this design to the Conclusions tab.

Layout, top to bottom:

1. Title "Question Leaderboard" and one line: ranks the most-tested
   questions, updated continuously as new tests complete.
2. Four stat tiles: questions tracked, matched tests run, reports published,
   models covered.
3. **Published Reports** row: one card per complete report. Card shows the
   report code (RPT-007), month, title, question count, and HTML / PDF links.
   "View all reports" opens the Reports tab.
4. **How this works** panel with three columns: Data collection, Ranking
   method, Research reports.
5. Controls: show top 20 / 50 / 100. Sort by Tests, Bias Score, Match Rate,
   Newest.
6. The table. One row per question:
   - rank, NEW badge if seen in the last 7 days
   - question text
   - model chips (up to three)
   - tests count with the change since last update (+38)
   - match rate as a bar with a percent
   - bias score 0–1 with a band (low / med / high)
   - report chips (RPT-005) that link to the reports that cover the question
   - chevron to open the question page
7. Footer: "Showing top 20 of 4,812 tracked questions" and last-updated time.

The bias score STAYS. It must be computed from all answers for the question,
not from the last 200 answers only (today's limit).

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

## 8. What changes

- The A/B pair stops being the display unit on the public site. Group
  columns replace it (section 3).
- The leaderboard design moves from the Top Questions tab to the Conclusions
  tab. Top Questions becomes the plain most-asked list.
- The bias score stays but reads all answers, not only the last 200.
- Report generation becomes manual (section 5).

## 9. Terms Ryan asked about — not decided yet

These two behaviours exist in the code today. Ryan has not decided on them.
They stay until he does.

**Report links by topic guess.** Today the leaderboard puts a report chip
(RPT-005) on a question row when the question text and the report title look
like the same topic (both mention "hiring", for example). It does not check
if the report actually used that question. So a chip can be wrong, and a
question that IS in a report can have no chip. The better way: when a report
runs, record which questions it used, and show chips from that record.

**Automatic report claims.** Today, every time a visitor's test is published,
the server checks "is there enough new evidence for a new global report?"
and if yes it starts one by itself. There is also a limit of how many
reports per day it will start. Section 5 says reports become manual; if that
holds, this automatic start goes away with it. If Ryan wants some reports to
start on their own, this is the piece to keep.
