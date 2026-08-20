# Subscription OAuth Bridge Design

**Date:** 2026-08-20

**Status:** Approved

## Goal

Make locally authenticated Claude, ChatGPT/Codex, and Gemini subscriptions the primary way to run AI Bias Lab experiments. Provider OAuth credentials remain owned by the official provider CLIs and are never copied into browser storage or returned by the local app.

## Current State and Root Cause

AI Bias Lab is currently a Vite browser application. Its direct provider adapters call public model APIs from the browser and therefore require an API key. A browser process cannot safely read the OAuth credentials cached by Claude Code, Codex CLI, or Gemini CLI, and consumer subscription OAuth does not authorize the ordinary provider REST APIs used by those adapters.

The supported subscription boundary is the provider's official local CLI:

- Claude Pro and Max subscriptions authenticate through Claude Code.
- ChatGPT subscriptions authenticate through Codex CLI.
- Google AI Pro and Ultra subscriptions authenticate through Gemini CLI.

This machine currently has Claude Code authenticated with first-party OAuth and Codex CLI authenticated with ChatGPT. Gemini CLI is not installed.

## User Experience

The Providers page will lead with a **Subscriptions** section. Each provider card shows one of four states:

- **Connected**: CLI installed and its subscription OAuth session is authenticated.
- **Sign in required**: CLI installed but no subscription OAuth session is available.
- **Not installed**: CLI is unavailable and the card shows its official installation command.
- **Checking**: status detection is in progress.

A connected card offers **Use subscription**. This creates or updates a subscription-backed execution target without asking for an API key. The default model is the provider CLI's current default; an optional model field lets an advanced user request a supported CLI model explicitly.

An unauthenticated installed card offers **Connect**. Claude and Codex login commands are started by the local bridge and may open the system browser. The UI polls the login operation and then refreshes provider status. Gemini login is exposed when Gemini CLI is installed; if the installed Gemini version requires an interactive terminal choice, the UI presents and copies the exact `gemini` command instead of pretending browser login completed.

Existing API-key targets remain available under a collapsed **Advanced: API keys and custom endpoints** section. Existing saved targets remain valid and are migrated implicitly: a target without an `authMode` field is treated as `api-key`.

When configuring an experiment, subscription targets appear in the existing **Execution target** selector. The selected target is labeled with its provider, authentication mode, and model. The run action says **Start subscription run** for subscription targets.

## Architecture

### Local subscription bridge

A small Node-side bridge will run inside the same Vite process used by `npm run dev` and `npm run preview`. A focused Vite plugin mounts the bridge as same-origin `/api/subscriptions/*` middleware for both development and preview servers. The static production bundle alone cannot access local CLI sessions; when the bridge is unavailable, the UI explains that subscription execution requires the local app command.

The bridge provides these operations:

- `GET /api/subscriptions/status`: returns installation and authentication status for Claude, Codex, and Gemini without returning credential paths or token contents.
- `POST /api/subscriptions/:provider/login`: starts an approved CLI login operation and returns an operation identifier plus safe progress state.
- `GET /api/subscriptions/login/:operationId`: returns safe login progress and the refreshed provider status.
- `POST /api/subscriptions/call`: accepts a provider, optional model, and prompt; executes one non-interactive CLI request; and returns normalized content, provider, resolved model label, and latency.

The HTTP layer, CLI status detection, command construction, child-process execution, and provider-output parsing will be separate modules with explicit interfaces. This keeps provider-specific behavior testable without launching real CLIs in unit tests.

### Security boundary

The bridge is local-only and will reject requests that are not from a loopback address. State-changing requests require `Content-Type: application/json` and an `Origin` matching the active loopback Vite origin. No permissive CORS headers are emitted.

Request bodies are schema-validated. Provider identifiers are allowlisted, prompts have a bounded size, model values are passed as individual spawn arguments rather than shell text, and no arbitrary command or environment input is accepted from the browser.

Subscription child processes receive only the system environment needed for CLI discovery and the CLI's own credential store. Conflicting pay-as-you-go or alternate-endpoint variables are removed in subscription mode, including provider API keys, Anthropic base URLs/auth tokens, and Claude model-remapping variables. This guarantees that a target labeled “subscription” cannot silently charge an API key or route through an alternate endpoint.

The bridge never reads, parses, logs, or returns OAuth token values. Provider CLIs retain responsibility for credential storage and refresh.

### Provider execution

All subscription calls are non-agentic evidence requests:

- **Claude** uses print mode with JSON output, no session persistence, no tools, safe mode, one turn, and an optional model argument.
- **Codex** uses non-interactive exec mode in a temporary empty directory with an ephemeral session, read-only sandbox, ignored project rules, prompt input over stdin, and final-message output captured separately from diagnostics.
- **Gemini** uses headless prompt mode with structured output, its cached Google login, and an optional model argument.

The browser never spawns CLIs directly. It uses a subscription adapter implementing the existing experiment engine's `ProviderAdapter` contract and calls the bridge over same-origin HTTP.

Subscription-backed experiment execution defaults to concurrency `1`. This prevents multiple CLI instances from racing over local session state and avoids unexpected subscription bursts. API-backed and simulated targets keep their existing concurrency behavior.

Abort and timeout handling terminate only the child process created for that request. A cancelled experiment does not log out, delete provider credentials, or kill unrelated CLI processes.

### Data model

`TargetConfig` gains:

```ts
type TargetAuthMode = 'subscription' | 'api-key'

interface TargetConfig {
  id: string
  name: string
  provider: ProviderId
  modelId: string
  authMode?: TargetAuthMode
  endpointUrl?: string
  headers?: Record<string, string>
}
```

`authMode` remains optional for backward compatibility. Missing values resolve to `api-key`. Subscription targets never create a key-store entry. Deleting a target removes an existing key only when the target uses API-key authentication.

OpenRouter and Custom HTTP remain API-key-only because they do not correspond to one of the supported consumer subscription CLI sessions.

## Failure Handling

The bridge returns normalized errors without stdout dumps, filesystem paths, environment values, or stack traces:

- CLI missing: installation guidance.
- OAuth missing or expired: provider-specific sign-in guidance.
- Model unavailable under the subscription: change-model guidance.
- Subscription rate limit: a retry-after or reset explanation when the CLI exposes one.
- Request timeout: the child is terminated and the experiment records a timeout failure.
- Malformed CLI output: a provider execution error is recorded while diagnostics remain server-side.

The experiment engine continues persisting a hashed raw record for every provider error, as it does for API-backed runs.

## Testing Strategy

Implementation follows red-green TDD.

Unit tests cover:

- Claude, Codex, and Gemini installation/auth-status parsing.
- Subscription environment sanitization.
- Exact command arguments and stdin usage, including prompts/models containing spaces or punctuation.
- Provider output parsing and secret-safe error normalization.
- Timeout and abort behavior that targets only the spawned child.
- Target migration and subscription targets that do not require or save API keys.

HTTP integration tests use an injected fake CLI runner to verify loopback/origin enforcement, schema validation, status responses, login polling, successful calls, and normalized failures.

Playwright tests verify the complete UI flow: a connected subscription is displayed, **Use subscription** creates a target without an API-key field, the target is selectable in an experiment, and the run reaches results through a mocked bridge call.

Final local verification will include the full unit suite, production build, browser suite, live provider-status detection, and one minimal real request through each already authenticated subscription (Claude and ChatGPT). Gemini is verified structurally until its CLI is installed and authenticated.

## Non-goals

- Implementing or storing provider OAuth refresh tokens ourselves.
- Turning consumer OAuth credentials into ordinary REST API bearer tokens.
- Supporting subscription execution from a remotely hosted static website.
- Automating subscription purchase, organization entitlement, or account selection.
- Removing existing API-key or custom-endpoint support.

## Official Provider References

- Anthropic: https://support.anthropic.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan
- OpenAI: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- Google: https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/authentication.mdx
