# AI Bias Lab

A privacy-first research tool that measures AI bias. You write one prompt, the app
swaps a demographic phrase to make a matched pair, sends both prompts to real
models, and stores every reply as evidence.

## Run it

One command builds the Cloudflare Worker site and starts it locally:

    npm start

Then open the URL Wrangler prints, normally <http://localhost:8787>.

- Experiments, reports, and evidence stay in this browser's IndexedDB storage.
- The Cloudflare Worker serves static files and rejects `/api/*`; it has no application database.
- Model requests go directly from the browser to OpenRouter.
- An OpenRouter OAuth credential is kept only for the current browser-tab session.

### OpenRouter

1. Open **Providers** and click **Connect OpenRouter**.
2. Authorize AI Bias Lab through OpenRouter's OAuth screen.
3. Add an OpenRouter model ID and select it when configuring an experiment run.

OpenRouter model IDs use names such as `openai/gpt-4o-mini` or
`anthropic/claude-3.5-sonnet`. Do not choose embedding, image, audio, or
moderation-only models for a text bias run.

## Develop

    npm run dev          # live-editing site on http://localhost:5173
    npm test             # unit and component tests
    npm run typecheck    # every TypeScript source and test file

## Rules the code keeps

1. A prompt for a model under test never runs through a coding-agent CLI.
2. A model request carries exactly the variant prompt as one user message: no
   system prompt, no tools, no repository context.
3. Simulated answers are never the default and never look like real ones.
4. An empty or cut-off model reply is never shown as a complete answer.
5. No raw error text reaches the screen; every failure says what to do next.
