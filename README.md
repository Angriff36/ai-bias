# AI Bias Lab

A privacy-first research tool that measures AI bias. You write one prompt, the app
swaps a demographic phrase to make a matched pair, sends both prompts to real
models, and stores every reply as evidence.

## Run it

Install with [bun](https://bun.sh), then one command builds the Cloudflare Worker
site and starts it locally:

    bun install
    bun start

Then open the URL Wrangler prints, normally <http://localhost:8787>.

- Experiments, reports, and evidence stay in this browser's IndexedDB storage.
- The Worker serves static files and exposes `/api/public/*` — the public
  leaderboard, published evidence, and generated reports backed by the
  Cloudflare D1 database `ai-bias-public`. Non-public `/api/*` is rejected.
- Completed live runs are published anonymously to the public site by design.
- Model requests go directly from the browser to OpenRouter.
- An OpenRouter OAuth credential is kept only for the current browser-tab session.

### OpenRouter

1. Open **Providers** and click **Connect OpenRouter**.
2. Authorize AI Bias Lab through OpenRouter's OAuth screen.
3. Add an OpenRouter model ID and select it when configuring an experiment run.

OpenRouter model IDs use names such as `openai/gpt-4o-mini` or
`anthropic/claude-3.5-sonnet`. Do not choose embedding, image, audio, or
moderation-only models for a text bias run.

The run screen estimates cost from OpenRouter's reported per-token model
prices. It approximates input size at four characters per token and assumes
500 output tokens per request. Providers that do not report model pricing show
the estimate as unavailable rather than `$0`.

## Develop

    bun run dev          # live-editing site on http://localhost:5173
    bun run test         # unit and component tests
    bun run typecheck    # every TypeScript source and test file

## Rules the code keeps

1. A prompt for a model under test never runs through a coding-agent CLI.
2. A model request carries exactly the variant prompt as one user message: no
   system prompt, no tools, no repository context.
3. Simulated answers are never the default and never look like real ones.
4. An empty or cut-off model reply is never shown as a complete answer.
5. No raw error text reaches the screen; every failure says what to do next.
