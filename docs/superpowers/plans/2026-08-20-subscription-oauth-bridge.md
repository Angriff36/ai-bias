# Subscription OAuth Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run AI Bias Lab experiments through locally authenticated Claude, ChatGPT/Codex, and Gemini subscription sessions without browser-stored OAuth tokens or required API keys.

**Architecture:** A same-origin Vite middleware bridge detects official provider CLIs, starts supported login flows, and executes bounded non-interactive prompts. The React app consumes a typed subscription client and adapts subscription targets into the existing run engine while retaining API-key targets under Advanced settings.

**Tech Stack:** TypeScript, Node child processes, Vite middleware, React 18, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-08-20-subscription-oauth-bridge-design.md`

## Global Constraints

- OAuth credentials remain owned by official provider CLIs and never enter browser storage or HTTP responses.
- Bridge routes accept loopback, same-origin traffic only; state-changing bodies are JSON and schema-validated.
- Subscription execution removes conflicting API-key, alternate-endpoint, and Claude model-remapping environment variables.
- CLI prompts/models are spawn arguments or stdin, never interpolated into shell commands.
- Subscription targets run with concurrency `1`; API-key and simulated targets retain existing behavior.
- Existing targets without `authMode` resolve to `api-key`; OpenRouter and Custom HTTP remain API-key-only.
- Implementation follows failing-test-first red-green TDD.

---

### Task 1: Subscription target model and browser client

**Files:**
- Modify: `src/store/targetStore.ts`
- Create: `src/subscriptions/types.ts`
- Create: `src/subscriptions/client.ts`
- Test: `src/subscriptions/client.test.ts`
- Test: `src/store/targetStore.test.ts`

**Interfaces:**
- Produces: `SubscriptionProvider = 'claude' | 'codex' | 'gemini'`
- Produces: `SubscriptionStatus`, `SubscriptionCallResult`, `getSubscriptionStatuses()`, `startSubscriptionLogin()`, `getSubscriptionLogin()`, `callSubscription()`
- Produces: `TargetAuthMode`, `targetAuthMode(target)`, and optional `TargetConfig.authMode`

- [ ] **Step 1: Write failing tests** proving missing target auth modes migrate to `api-key`, subscription targets retain `subscription`, and the client sends/normalizes status and call requests.

```ts
expect(targetAuthMode({ ...target, authMode: undefined })).toBe('api-key')
expect(targetAuthMode({ ...target, authMode: 'subscription' })).toBe('subscription')
await expect(callSubscription({ provider: 'codex', modelId: 'default', prompt: 'hello' }))
  .resolves.toMatchObject({ provider: 'codex', content: 'answer' })
```

- [ ] **Step 2: Run the focused tests and verify RED.**

Run: `npm test -- src/store/targetStore.test.ts src/subscriptions/client.test.ts`

Expected: FAIL because the auth-mode and subscription-client APIs do not exist.

- [ ] **Step 3: Implement the minimal typed model and fetch client.** Fetch errors must normalize `{ statusCode, message }`; an aborted browser request must remain an `AbortError`.

- [ ] **Step 4: Run the focused tests and verify GREEN.**

Run: `npm test -- src/store/targetStore.test.ts src/subscriptions/client.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add src/store/targetStore.ts src/store/targetStore.test.ts src/subscriptions/types.ts src/subscriptions/client.ts src/subscriptions/client.test.ts
git commit -m "[feat] add subscription target contracts"
```

### Task 2: Secure CLI status and execution core

**Files:**
- Create: `server/subscriptions/types.ts`
- Create: `server/subscriptions/environment.ts`
- Create: `server/subscriptions/process-runner.ts`
- Create: `server/subscriptions/providers.ts`
- Test: `server/subscriptions/environment.test.ts`
- Test: `server/subscriptions/providers.test.ts`

**Interfaces:**
- Produces: `sanitizeSubscriptionEnv(provider, sourceEnv)`
- Produces: injectable `ProcessRunner.run({ command, args, stdin, cwd, env, timeoutMs, signal })`
- Produces: `SubscriptionProviderRegistry.status()`, `.login(provider)`, and `.call(input, signal)`

- [ ] **Step 1: Write failing tests** for credential-variable removal, safe argument arrays, Claude/Codex/Gemini status parsing, normalized output, timeout, and abort.

```ts
expect(sanitizeSubscriptionEnv('claude', { ANTHROPIC_API_KEY: 'secret', PATH: 'bin' }))
  .toEqual({ PATH: 'bin' })
expect(fakeRunner.calls[0].args).toContain('--no-session-persistence')
expect(fakeRunner.calls[0].stdin).toBe("prompt with 'quotes'")
```

- [ ] **Step 2: Run the focused tests and verify RED.**

Run: `npm test -- server/subscriptions/environment.test.ts server/subscriptions/providers.test.ts`

Expected: FAIL because the server subscription modules do not exist.

- [ ] **Step 3: Implement the process runner and provider registry.** Use `spawn` with `shell: false`; resolve Windows command shims safely; cap output; use a 120-second timeout; parse only provider result fields; never include raw stderr in browser-facing errors.

- [ ] **Step 4: Run the focused tests and verify GREEN.**

Run: `npm test -- server/subscriptions/environment.test.ts server/subscriptions/providers.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add server/subscriptions
git commit -m "[feat] execute authenticated subscription CLIs"
```

### Task 3: Same-origin Vite bridge

**Files:**
- Create: `server/subscriptions/http.ts`
- Create: `server/subscriptions/vite-plugin.ts`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Test: `server/subscriptions/http.test.ts`

**Interfaces:**
- Consumes: `SubscriptionProviderRegistry`
- Produces: `createSubscriptionMiddleware(registry)` and `subscriptionBridgePlugin()`
- Mounts: `/api/subscriptions/status`, `/api/subscriptions/:provider/login`, `/api/subscriptions/login/:operationId`, `/api/subscriptions/call`

- [ ] **Step 1: Write failing HTTP tests** with an injected fake registry for loopback/origin enforcement, JSON content type, body validation, status, login polling, calls, and secret-safe failures.

```ts
const response = await request('/api/subscriptions/call', {
  remoteAddress: '127.0.0.1', origin: 'http://localhost:5199',
  body: { provider: 'codex', modelId: 'default', prompt: 'hello' },
})
expect(response).toMatchObject({ status: 200, body: { content: 'answer' } })
```

- [ ] **Step 2: Run the focused test and verify RED.**

Run: `npm test -- server/subscriptions/http.test.ts`

- [ ] **Step 3: Implement middleware and mount it in both `configureServer` and `configurePreviewServer`.** Reject non-loopback peers, mismatched origins, non-JSON mutations, unknown providers, prompts over 32,000 characters, and malformed models.

- [ ] **Step 4: Run focused tests plus typecheck and verify GREEN.**

Run: `npm test -- server/subscriptions/http.test.ts && npm run typecheck`

- [ ] **Step 5: Commit.**

```bash
git add server/subscriptions/http.ts server/subscriptions/http.test.ts server/subscriptions/vite-plugin.ts vite.config.ts tsconfig.json
git commit -m "[feat] expose local subscription bridge"
```

### Task 4: Subscription-first provider UI

**Files:**
- Create: `src/components/SubscriptionProviders.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/ProviderConfig.tsx`
- Modify: `src/styles.css`
- Test: `experiment-run.spec.ts`

**Interfaces:**
- Consumes: subscription client/status contracts and `TargetConfig.authMode`
- Produces: `SubscriptionProviders({ targets, onUseSubscription })`
- Existing `TargetsPanel` remains the API-key editor inside an Advanced disclosure.

- [ ] **Step 1: Add a failing Playwright test** that stubs connected Claude/Codex statuses, opens Providers, creates a subscription target without any API-key field, and sees the target labeled `Subscription`.

```ts
await expect(page.getByRole('heading', { name: 'Subscriptions' })).toBeVisible()
await page.getByRole('button', { name: 'Use ChatGPT subscription' }).click()
await expect(page.getByText('ChatGPT subscription')).toBeVisible()
await expect(page.getByLabel(/^API key/)).toHaveCount(0)
```

- [ ] **Step 2: Run that Playwright test and verify RED.**

Run: `npm run test:e2e -- experiment-run.spec.ts --grep "subscription target" --reporter=line`

- [ ] **Step 3: Implement the subscription cards, status refresh/login polling, target creation, Advanced API-key disclosure, truthful local-only messaging, and responsive styling.**

- [ ] **Step 4: Run the focused Playwright test and verify GREEN.**

Run: `npm run test:e2e -- experiment-run.spec.ts --grep "subscription target" --reporter=line`

- [ ] **Step 5: Commit.**

```bash
git add src/components/SubscriptionProviders.tsx src/App.tsx src/components/ProviderConfig.tsx src/styles.css experiment-run.spec.ts
git commit -m "[feat] make subscriptions the primary provider flow"
```

### Task 5: Subscription-backed experiment execution

**Files:**
- Create: `src/engine/subscriptionAdapter.ts`
- Modify: `src/components/ExperimentEditor.tsx`
- Modify: `src/components/RunScreen.tsx`
- Modify: `src/engine/executor.ts`
- Modify: `experiment-run.spec.ts`
- Test: `src/engine/subscriptionAdapter.test.ts`

**Interfaces:**
- Consumes: `callSubscription()`, `TargetConfig`, and engine `ProviderAdapter`
- Produces: `createSubscriptionExecutionAdapter(target)`
- Adds: optional `RunScreen.concurrency` passed to `createBatchExecutor`

- [ ] **Step 1: Write failing unit and browser tests** proving subscription targets call the bridge, API-key targets keep their adapter, the experiment button says **Start subscription run**, and subscription execution uses concurrency `1`.

```ts
const adapter = createSubscriptionExecutionAdapter(subscriptionTarget)
await expect(adapter.callModel(request)).resolves.toMatchObject({ provider: 'openai', content: 'answer' })
expect(executorOptions.concurrency).toBe(1)
```

- [ ] **Step 2: Run focused tests and verify RED.**

Run: `npm test -- src/engine/subscriptionAdapter.test.ts && npm run test:e2e -- experiment-run.spec.ts --grep "subscription run" --reporter=line`

- [ ] **Step 3: Implement adapter selection, auth-mode labels, concurrency plumbing, abort propagation, and subscription-specific troubleshooting copy.**

- [ ] **Step 4: Run focused tests and verify GREEN.**

Run: `npm test -- src/engine/subscriptionAdapter.test.ts && npm run test:e2e -- experiment-run.spec.ts --grep "subscription run" --reporter=line`

- [ ] **Step 5: Commit.**

```bash
git add src/engine/subscriptionAdapter.ts src/engine/subscriptionAdapter.test.ts src/components/ExperimentEditor.tsx src/components/RunScreen.tsx src/engine/executor.ts experiment-run.spec.ts
git commit -m "[feat] run experiments through subscriptions"
```

### Task 6: Full and live verification

**Files:**
- Modify only if verification exposes a defect in files owned by Tasks 1-5.

**Interfaces:**
- Verifies the complete specification against the committed implementation.

- [ ] **Step 1: Run all automated gates.**

Run: `npm run build && npm test && npm run test:e2e -- experiment-run.spec.ts --reporter=line`

- [ ] **Step 2: Verify the live localhost UI** shows Claude and ChatGPT connected, Gemini not installed, API keys under Advanced, and both subscription targets selectable.

- [ ] **Step 3: Execute one minimal real prompt through Claude and Codex, confirm nonempty content, and verify no provider API key/base URL is inherited.**

- [ ] **Step 4: Inspect git status and recent commits.**

Run: `git status --short --branch && git log -6 --oneline`

- [ ] **Step 5: Commit any verification-only correction, then rerun the full gate.**

```bash
git add server/subscriptions src/subscriptions src/store/targetStore.ts src/components/SubscriptionProviders.tsx src/App.tsx src/components/ProviderConfig.tsx src/components/ExperimentEditor.tsx src/components/RunScreen.tsx src/engine/subscriptionAdapter.ts src/engine/executor.ts src/styles.css experiment-run.spec.ts vite.config.ts tsconfig.json
git commit -m "[fix] correct subscription verification defect"
```
