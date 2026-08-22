# AI Bias Lab

A local research tool that measures AI bias. You write one prompt, the app
swaps a demographic phrase to make a matched pair, sends both prompts to real
models, and stores every reply as evidence.

## Run it

One command builds the page and starts the app:

    npm start

Then open <http://localhost:4180>.

- The app is one local program. It answers only this computer.
- Your data is one file: `data/ai-bias.sqlite`. Back it up by copying it.
- Provider API keys stay in your browser, not in that file.
- To use another port: `PORT=5000 npm start`.

`npm run serve` starts the app without rebuilding (after a previous build).

## Develop

    npm run dev          # live-editing dev server on http://localhost:5173, same data file
    npm test             # unit and component tests
    npm run typecheck    # every file in src/, tests/ and server/

## Rules the code keeps

1. A prompt for a model under test never runs through a coding-agent CLI.
2. A model request carries exactly the variant prompt as one user message: no
   system prompt, no tools, no repository context.
3. Simulated answers are never the default and never look like real ones.
4. An empty or cut-off model reply is never shown as a complete answer.
5. No raw error text reaches the screen; every failure says what to do next.
