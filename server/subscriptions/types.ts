export type SubscriptionProvider = 'claude' | 'codex' | 'gemini'

export interface ProcessRunOptions {
  command: string
  args: string[]
  stdin?: string
  cwd?: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
  signal?: AbortSignal
}

export interface ProcessRunResult {
  exitCode: number | null
  stdout: string
  stderr: string
  launchErrorCode?: string
  timedOut?: boolean
  outputLimitExceeded?: boolean
}

export interface ProcessRunner {
  run(options: ProcessRunOptions): Promise<ProcessRunResult>
}

export interface SubscriptionStatus {
  provider: SubscriptionProvider
  label: string
  installed: boolean
  authenticated: boolean
  authMethod: 'oauth' | 'none'
  version?: string
  loginCommand: string
  installCommand: string
  message?: string
}

export interface SubscriptionCallInput {
  provider: SubscriptionProvider
  modelId: string
  prompt: string
}

export interface SubscriptionCallResult {
  provider: SubscriptionProvider
  modelId: string
  content: string
  latencyMs: number
}

export interface SafeSubscriptionError {
  statusCode: number
  message: string
}
