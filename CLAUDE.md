REPORT WORKFLOW — NON-NEGOTIABLE

For any request involving generation, regeneration, comparison, or evaluation
of a report:

THE REPORT HTML IS THE DELIVERABLE.

Do not stop at:
- judge scores
- JSON
- metrics
- evaluation tables
- recommendations
- token/cost analysis
- intermediate artifacts

Unless the user explicitly asks for those instead.

If the user asks to evaluate another judge model and an existing accepted
report pipeline exists:

1. Run the requested judge model over the requested evidence.
2. Feed those scores into the EXISTING aggregation.
3. Run the EXISTING synthesis.
4. Run the EXISTING report renderer.
5. Produce the same normal HTML report format the site uses.
6. Give the user the report.

Do not redesign the pipeline.
Do not recommend whether the model is acceptable before the user sees the
rendered report unless explicitly asked.
Do not create alternative dashboards/tables/canvases.
Do not stop at JSON.

Once the requested report renders successfully, STOP.

If an execution mechanism fails:
- perform at most one focused diagnosis
- use the simplest already-proven fallback
- continue toward the report
- do not redesign infrastructure unless completion is impossible otherwise

The user's requested artifact outranks intermediate engineering analysis.

# === COGNILAYER (auto-generated, do not delete) ===

## CogniLayer v4 Active
Persistent memory + code intelligence is ON.
ON FIRST USER MESSAGE in this session, briefly tell the user:
  'CogniLayer v4 active — persistent memory is on. Type /cognihelp for available commands.'
Say it ONCE, keep it short, then continue with their request.

## Tools — HOW TO WORK

FIRST RUN ON A PROJECT:
When DNA shows "[new session]" or "[first session]":
1. Run /onboard — indexes project docs (PRD, README), builds initial memory
2. Run code_index() — builds AST index for code intelligence
Both are one-time. After that, updates are incremental.
If file_search or code_search return empty → these haven't been run yet.

UNDERSTAND FIRST (before making changes):
- memory_search(query) → what do we know? Past bugs, decisions, gotchas
- code_context(symbol) → how does the code work? Callers, callees, dependencies
- file_search(query) → search project docs (PRD, README) without reading full files
- code_search(query) → find where a function/class is defined
Use BOTH memory + code tools for complete picture. They are fast — call in parallel.

BEFORE RISKY CHANGES (mandatory):
- Renaming, deleting, or moving a function/class → code_impact(symbol) FIRST
- Changing a function's signature or return value → code_impact(symbol) FIRST
- Modifying shared utilities used across multiple files → code_impact(symbol) FIRST
- ALSO: memory_search(symbol) → check for related decisions or known gotchas
Both required. Structure tells you what breaks, memory tells you WHY it was built that way.

AFTER COMPLETING WORK:
- memory_write(content) → save important discoveries immediately
  (error_fix, gotcha, pattern, api_contract, procedure, decision)
- session_bridge(action="save", content="Progress: ...; Open: ...")
DO NOT wait for /harvest — session may crash.

SUBAGENT MEMORY PROTOCOL:
When spawning Agent tool for research or exploration:
- Include in prompt: synthesize findings into consolidated memory_write(content, type, tags="subagent,<task-topic>") facts
  Assign a descriptive topic tag per subagent (e.g. tags="subagent,auth-review", tags="subagent,perf-analysis")
- Do NOT write each discovery separately — group related findings into cohesive facts
- Write to memory as the LAST step before return, not incrementally — saves turns and tokens
- Each fact must be self-contained with specific details (file paths, values, code snippets)
- When findings relate to specific files, include domain and source_file for better search and staleness detection
- End each fact with 'Search: keyword1, keyword2' — keywords INSIDE the fact survive context compaction
- Record significant negative findings too (e.g. 'no rate limiting exists in src/api/' — prevents repeat searches)
- Return: actionable summary (file paths, function names, specific values) + what was saved + keywords for memory_search
- If MCP tools unavailable or fail → include key findings directly in return text as fallback
- Launch subagents as foreground (default) for reliable MCP access — user can Ctrl+B to background later
Why: without this protocol, subagent returns dump all text into parent context (40K+ tokens).
With protocol, findings go to DB and parent gets ~500 token summary + on-demand memory_search.

BEFORE DEPLOY/PUSH:
- verify_identity(action_type="...") → mandatory safety gate
- If BLOCKED → STOP and ask the user
- If VERIFIED → READ the target server to the user and request confirmation

## VERIFY-BEFORE-ACT
When memory_search returns a fact marked ⚠ STALE:
1. Read the source file and verify the fact still holds
2. If changed → update via memory_write
3. NEVER act on STALE facts without verification

## Process Management (Windows)
- NEVER use `taskkill //F //IM node.exe` — kills ALL Node.js INCLUDING Claude Code CLI!
- Use: `npx kill-port PORT` or find PID via `netstat -ano | findstr :PORT` then `taskkill //F //PID XXXX`

## Git Rules
- Commit often, small atomic changes. Format: "[type] what and why"
- commit = Tier 1 (do it yourself). push = Tier 3 (verify_identity).

## Project DNA: ai-bias
Stack: React 18.3.1, TypeScript, Tailwind CSS
Style: [unknown]
Structure: .aboardai, .codex, .fallow, .playwright-cli, .worktrees, .wrangler, data, docs
Deploy: [NOT SET]
Active: [new session]
Last: [first session]

## Last Session Bridge
[proactive bridge @ 99% context — saved before compacting]
Files (2):
  VISION.md (create)
  src/public/QuestionDetailPage.tsx (create)
Facts (6):
  [api_contract] ai-bias public API contract, complete (worker/public/routes.ts, verified 2026-08-29): GET /api/public/leaderboard; GET /
  [fact] ai-bias D1 schema (database ai-bias-public, worker/migrations/0001-0005, append-only): tables public_runs, public_eviden
  [command] ai-bias commands (package.json, CORRECTED 2026-08-29 after baseline): package manager is bun ONLY (packageManager bun@1.
  [client_rule] ai-bias client rules (AGENTS.md is canonical, README 'Rules the code keeps'): (1) a prompt for a model under test never 
  [task] ai-bias working-tree state at 2026-08-29 onboarding: main is pushed and live (latest commits 44f3f1e pool answers per qu
  [decision] ai-bias CONCLUSIONS PAGE definition (Ryan, 2026-08-29, VISION.md section 4): Conclusions is a CLAIMS BOARD, not a prompt
Manual bridge:
Progress: /onboard run 2026-08-29 — code index built (1166 symbols), memory corrected (commands, API contract with report generate/html routes, D1 schema, client rules, WIP state), identity card pre-filled (safety not locked). Main is pushed and live on ai-tests.com. Open: uncommitted wizard/engine WIP stays local; optional follow-ups: delete corrupt duplicate D1 rows; minimum-strength rule for homepage report selection.

# === END COGNILAYER ===
