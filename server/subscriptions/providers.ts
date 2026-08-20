import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { sanitizeSubscriptionEnv } from './environment'
import { NodeProcessRunner } from './process-runner'
import type {
  ProcessRunResult,
  ProcessRunner,
  SafeSubscriptionError,
  SubscriptionCallInput,
  SubscriptionCallResult,
  SubscriptionProvider,
  SubscriptionStatus,
} from './types'

const META: Record<SubscriptionProvider, {
  label: string
  command: string
  installCommand: string
  loginCommand: string
}> = {
  claude: {
    label: 'Claude',
    command: 'claude',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    loginCommand: 'claude auth login',
  },
  codex: {
    label: 'ChatGPT',
    command: 'codex',
    installCommand: 'npm install -g @openai/codex',
    loginCommand: 'codex login',
  },
  gemini: {
    label: 'Google Gemini',
    command: 'gemini',
    installCommand: 'npm install -g @google/gemini-cli',
    loginCommand: 'gemini',
  },
}

const PROVIDERS: SubscriptionProvider[] = ['claude', 'codex', 'gemini']

export class SubscriptionProviderRegistry {
  constructor(
    private readonly runner: ProcessRunner = new NodeProcessRunner(),
    private readonly sourceEnv: NodeJS.ProcessEnv = process.env,
    private readonly homeDirectory: string = os.homedir(),
  ) {}

  status(): Promise<SubscriptionStatus[]> {
    return Promise.all(PROVIDERS.map((provider) => this.statusFor(provider)))
  }

  async statusFor(provider: SubscriptionProvider): Promise<SubscriptionStatus> {
    const meta = META[provider]
    const env = sanitizeSubscriptionEnv(provider, this.sourceEnv)
    const version = await this.runner.run({
      command: meta.command,
      args: ['--version'],
      env,
      timeoutMs: 5_000,
      allowWindowsCommandShim: true,
    })
    if (version.launchErrorCode || version.exitCode !== 0) {
      return this.baseStatus(provider, false, false)
    }

    let authenticated = false
    if (provider === 'claude') {
      const auth = await this.runner.run({
        command: meta.command,
        args: ['auth', 'status', '--json'],
        env,
        timeoutMs: 5_000,
        allowWindowsCommandShim: true,
      })
      authenticated = parseClaudeAuth(auth)
    } else if (provider === 'codex') {
      const auth = await this.runner.run({
        command: meta.command,
        args: ['login', 'status'],
        env,
        timeoutMs: 5_000,
        allowWindowsCommandShim: true,
      })
      authenticated = auth.exitCode === 0 && /logged in using chatgpt/i.test(`${auth.stdout}\n${auth.stderr}`)
    } else {
      authenticated = await this.hasGeminiOauth()
    }

    return {
      ...this.baseStatus(provider, true, authenticated),
      version: firstLine(version.stdout || version.stderr),
    }
  }

  async login(provider: SubscriptionProvider, signal?: AbortSignal): Promise<SubscriptionStatus> {
    if (provider === 'gemini') {
      throw safeError(409, 'Run "gemini" in a terminal and choose Sign in with Google, then refresh status.')
    }
    const meta = META[provider]
    const args = provider === 'claude' ? ['auth', 'login'] : ['login']
    const result = await this.runner.run({
      command: meta.command,
      args,
      env: sanitizeSubscriptionEnv(provider, this.sourceEnv),
      timeoutMs: 5 * 60_000,
      signal,
      allowWindowsCommandShim: true,
    })
    if (result.launchErrorCode === 'ENOENT') throw safeError(503, `${meta.label} CLI is not installed.`)
    if (result.exitCode !== 0) throw safeError(401, `${meta.label} subscription sign-in did not complete.`)
    return this.statusFor(provider)
  }

  async call(input: SubscriptionCallInput, signal?: AbortSignal): Promise<SubscriptionCallResult> {
    const startedAt = Date.now()
    const result = await this.runner.run(this.callOptions(input, signal))
    if (result.launchErrorCode === 'ENOENT') throw safeError(503, `${META[input.provider].label} CLI is not installed.`)
    if (result.timedOut) throw safeError(504, `${META[input.provider].label} subscription request timed out.`)
    if (result.outputLimitExceeded) throw safeError(502, `${META[input.provider].label} returned too much output.`)
    if (result.exitCode !== 0) {
      throw safeError(502, `${META[input.provider].label} subscription request failed. Check sign-in and model availability.`)
    }

    const content = parseContent(input.provider, result)
    if (!content) throw safeError(502, `${META[input.provider].label} returned no usable response.`)
    return {
      provider: input.provider,
      modelId: input.modelId,
      content,
      latencyMs: Date.now() - startedAt,
    }
  }

  private callOptions(input: SubscriptionCallInput, signal?: AbortSignal) {
    const meta = META[input.provider]
    const env = sanitizeSubscriptionEnv(input.provider, this.sourceEnv)
    const modelArgs = input.modelId && input.modelId !== 'default' ? ['--model', input.modelId] : []
    if (input.provider === 'claude') {
      return {
        command: meta.command,
        args: [
          '-p', '--output-format', 'json', '--no-session-persistence', '--safe-mode',
          '--tools', '', '--max-turns', '1', ...modelArgs,
        ],
        stdin: input.prompt,
        env,
        timeoutMs: 120_000,
        signal,
        allowWindowsCommandShim: true,
      }
    }
    if (input.provider === 'codex') {
      return {
        command: meta.command,
        args: [
          'exec', '--json', '--sandbox', 'read-only', '--ephemeral', '--ignore-user-config',
          '--ignore-rules', '--skip-git-repo-check', ...modelArgs, '-',
        ],
        stdin: input.prompt,
        env,
        timeoutMs: 120_000,
        signal,
        allowWindowsCommandShim: true,
      }
    }
    return {
      command: meta.command,
      args: ['--output-format', 'stream-json', ...modelArgs, '--sandbox', 'false', '--approval-mode', 'default', '--prompt', ''],
      stdin: input.prompt,
      env: { ...env, GEMINI_TELEMETRY_ENABLED: 'false' },
      timeoutMs: 120_000,
      signal,
      allowWindowsCommandShim: true,
    }
  }

  private baseStatus(
    provider: SubscriptionProvider,
    installed: boolean,
    authenticated: boolean,
  ): SubscriptionStatus {
    const meta = META[provider]
    return {
      provider,
      label: meta.label,
      installed,
      authenticated,
      authMethod: authenticated ? 'oauth' : 'none',
      loginCommand: meta.loginCommand,
      installCommand: meta.installCommand,
    }
  }

  private async hasGeminiOauth(): Promise<boolean> {
    try {
      const raw = await readFile(path.join(this.homeDirectory, '.gemini', 'settings.json'), 'utf8')
      const settings = JSON.parse(raw) as { security?: { auth?: { selectedType?: unknown } } }
      const selected = settings.security?.auth?.selectedType
      return typeof selected === 'string' && (/oauth/i.test(selected) || /login[-_ ]?with[-_ ]?google/i.test(selected))
    } catch {
      return false
    }
  }
}

function parseClaudeAuth(result: ProcessRunResult): boolean {
  if (result.exitCode !== 0) return false
  try {
    const parsed = JSON.parse(result.stdout) as { loggedIn?: unknown; authMethod?: unknown; apiProvider?: unknown }
    return parsed.loggedIn === true &&
      (parsed.authMethod === 'oauth_token' || parsed.authMethod === 'claude.ai') &&
      parsed.apiProvider === 'firstParty'
  } catch {
    return false
  }
}

function parseContent(provider: SubscriptionProvider, result: ProcessRunResult): string {
  if (provider === 'claude') {
    try {
      const parsed = JSON.parse(result.stdout) as { result?: unknown; is_error?: unknown }
      return parsed.is_error === false && typeof parsed.result === 'string' ? parsed.result.trim() : ''
    } catch {
      return ''
    }
  }

  const lines = result.stdout.split(/\r?\n/).filter(Boolean)
  let content = ''
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as {
        type?: unknown
        role?: unknown
        content?: unknown
        item?: { type?: unknown; text?: unknown }
      }
      if (provider === 'codex' && event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') {
        content = event.item.text
      }
      if (provider === 'gemini' && event.type === 'message' && event.role === 'assistant' && typeof event.content === 'string') {
        content += event.content
      }
    } catch {
      // Ignore non-JSON diagnostics; only structured assistant events are accepted.
    }
  }
  return content.trim()
}

function safeError(statusCode: number, message: string): SafeSubscriptionError {
  return { statusCode, message }
}

function firstLine(value: string): string | undefined {
  const line = value.trim().split(/\r?\n/)[0]
  return line || undefined
}
