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

  /**
   * Model inference over a subscription is NOT supported.
   *
   * The provider CLIs are coding agents. Running a prompt through them starts
   * an agent session that inherits the working directory, repository files,
   * CLAUDE.md / AGENTS.md instructions, and a tool loop. The answer then
   * reflects the agent, not the model under test, so it is not valid bias
   * evidence. No documented direct model endpoint exists for these
   * subscription tokens, so the provider is marked unsupported instead of
   * returning a contaminated response.
   */
  call(input: SubscriptionCallInput): Promise<SubscriptionCallResult> {
    return Promise.reject(unsupportedInference(input.provider))
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
      supportsInference: false,
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

export function unsupportedInference(provider: SubscriptionProvider): SafeSubscriptionError {
  return safeError(
    501,
    `${META[provider].label} subscription sign-in cannot run a bias test. Its CLI is a coding agent, ` +
    'so the answer would carry repository and tool context instead of the raw model response. ' +
    'Add an API-key provider for this model instead.',
  )
}

function safeError(statusCode: number, message: string): SafeSubscriptionError {
  return { statusCode, message }
}

function firstLine(value: string): string | undefined {
  const line = value.trim().split(/\r?\n/)[0]
  return line || undefined
}
