import { describe, expect, it } from 'vitest'
import { SubscriptionProviderRegistry } from './providers'
import type { ProcessRunOptions, ProcessRunResult, ProcessRunner } from './types'

class FakeRunner implements ProcessRunner {
  calls: ProcessRunOptions[] = []

  constructor(private readonly respond: (options: ProcessRunOptions) => ProcessRunResult | Promise<ProcessRunResult>) {}

  async run(options: ProcessRunOptions): Promise<ProcessRunResult> {
    this.calls.push(options)
    return this.respond(options)
  }
}

const ok = (stdout = '', stderr = ''): ProcessRunResult => ({ exitCode: 0, stdout, stderr })

describe('SubscriptionProviderRegistry status', () => {
  it('detects authenticated Claude and Codex sessions without exposing credentials', async () => {
    const runner = new FakeRunner(({ command, args }) => {
      if (command === 'claude' && args[0] === '--version') return ok('2.1.237 (Claude Code)')
      if (command === 'claude') return ok('{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}')
      if (command === 'codex' && args[0] === '--version') return ok('codex-cli 0.147.0')
      if (command === 'codex') return ok('Logged in using ChatGPT')
      return { exitCode: null, stdout: '', stderr: '', launchErrorCode: 'ENOENT' }
    })
    const registry = new SubscriptionProviderRegistry(runner, { PATH: 'bin' })

    await expect(registry.status()).resolves.toEqual([
      expect.objectContaining({ provider: 'claude', installed: true, authenticated: true, authMethod: 'oauth' }),
      expect.objectContaining({ provider: 'codex', installed: true, authenticated: true, authMethod: 'oauth' }),
      expect.objectContaining({ provider: 'gemini', installed: false, authenticated: false, authMethod: 'none' }),
    ])
  })

  it('recognizes Claude Max login while rejecting Claude API-key auth', async () => {
    const maxRunner = new FakeRunner(({ args }) => args[0] === '--version'
      ? ok('2.1.237 (Claude Code)')
      : ok('{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"max"}'))
    const apiKeyRunner = new FakeRunner(({ args }) => args[0] === '--version'
      ? ok('2.1.237 (Claude Code)')
      : ok('{"loggedIn":true,"authMethod":"api_key","apiProvider":"firstParty"}'))

    await expect(new SubscriptionProviderRegistry(maxRunner, { PATH: 'bin' }).statusFor('claude'))
      .resolves.toMatchObject({ authenticated: true, authMethod: 'oauth' })
    await expect(new SubscriptionProviderRegistry(apiKeyRunner, { PATH: 'bin' }).statusFor('claude'))
      .resolves.toMatchObject({ authenticated: false, authMethod: 'none' })
  })

  it('treats a CLI with a failed version check as unavailable', async () => {
    const runner = new FakeRunner(() => ({ exitCode: 1, stdout: '', stderr: 'not recognized' }))
    const registry = new SubscriptionProviderRegistry(runner, { PATH: 'bin' })

    await expect(registry.status()).resolves.toEqual([
      expect.objectContaining({ provider: 'claude', installed: false }),
      expect.objectContaining({ provider: 'codex', installed: false }),
      expect.objectContaining({ provider: 'gemini', installed: false }),
    ])
  })
})

describe('SubscriptionProviderRegistry inference', () => {
  const registry = (runner: FakeRunner) => new SubscriptionProviderRegistry(runner, { PATH: 'bin' })

  it('refuses model inference instead of running the coding-agent CLI', async () => {
    const runner = new FakeRunner(() => ok())

    await expect(
      registry(runner).call({ provider: 'claude', modelId: 'default', prompt: 'variant prompt' }),
    ).rejects.toMatchObject({ statusCode: 501 })
  })

  it('starts no process for any subscription provider', async () => {
    for (const provider of ['claude', 'codex', 'gemini'] as const) {
      const runner = new FakeRunner(() => ok())
      await registry(runner)
        .call({ provider, modelId: 'default', prompt: 'variant prompt' })
        .catch(() => undefined)
      expect(runner.calls).toHaveLength(0)
    }
  })

  it('explains why, without leaking the prompt or provider diagnostics', async () => {
    const runner = new FakeRunner(() => ok())
    const error = await registry(runner)
      .call({ provider: 'codex', modelId: 'default', prompt: 'secret variant prompt' })
      .catch((e) => e)

    expect(error.message).toContain('coding agent')
    expect(error.message).not.toContain('secret variant prompt')
  })

  it('reports every subscription provider as unusable for inference', async () => {
    const runner = new FakeRunner(({ args }) => args[0] === '--version' ? ok('1.0.0') : ok())
    const statuses = await registry(runner).status()

    expect(statuses.every((status) => status.supportsInference === false)).toBe(true)
  })
})
