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

describe('SubscriptionProviderRegistry calls', () => {
  it('runs Claude without tools or inherited Anthropic overrides and parses its result', async () => {
    const runner = new FakeRunner(() => ok(JSON.stringify({ result: 'Claude answer', is_error: false })))
    const registry = new SubscriptionProviderRegistry(runner, {
      PATH: 'bin',
      ANTHROPIC_API_KEY: 'must-not-leak',
      ANTHROPIC_BASE_URL: 'https://alternate.example',
    })

    await expect(registry.call({
      provider: 'claude',
      modelId: 'sonnet',
      prompt: "prompt with 'quotes'",
    })).resolves.toMatchObject({ provider: 'claude', modelId: 'sonnet', content: 'Claude answer' })

    expect(runner.calls[0]).toMatchObject({
      command: 'claude',
      stdin: "prompt with 'quotes'",
      env: { PATH: 'bin' },
    })
    expect(runner.calls[0].args).toEqual([
      '-p', '--output-format', 'json', '--no-session-persistence', '--safe-mode',
      '--tools', '', '--max-turns', '1', '--model', 'sonnet',
    ])
  })

  it('runs Codex ephemerally in read-only mode and parses the final agent message', async () => {
    const stdout = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
      JSON.stringify({ type: 'item.completed', item: { id: 'item-1', type: 'agent_message', text: 'Codex answer' } }),
    ].join('\n')
    const runner = new FakeRunner(() => ok(stdout))
    const registry = new SubscriptionProviderRegistry(runner, { PATH: 'bin', OPENAI_API_KEY: 'must-not-leak' })

    await expect(registry.call({ provider: 'codex', modelId: 'default', prompt: 'hello' }))
      .resolves.toMatchObject({ provider: 'codex', modelId: 'default', content: 'Codex answer' })

    expect(runner.calls[0].env).toEqual({ PATH: 'bin' })
    expect(runner.calls[0].stdin).toBe('hello')
    expect(runner.calls[0].args).toEqual([
      'exec', '--json', '--sandbox', 'read-only', '--ephemeral', '--ignore-user-config',
      '--ignore-rules', '--skip-git-repo-check', '-',
    ])
  })

  it('returns a safe error without leaking raw provider diagnostics', async () => {
    const runner = new FakeRunner(() => ({
      exitCode: 1,
      stdout: '',
      stderr: 'token sk-secret-value rejected at C:\\Users\\Ryan\\private-file',
    }))
    const registry = new SubscriptionProviderRegistry(runner, { PATH: 'bin' })

    await expect(registry.call({ provider: 'codex', modelId: 'default', prompt: 'hello' }))
      .rejects.toEqual({ statusCode: 502, message: 'ChatGPT subscription request failed. Check sign-in and model availability.' })
  })
})
