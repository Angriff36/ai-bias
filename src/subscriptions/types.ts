export type SubscriptionProvider = 'claude' | 'codex' | 'gemini'

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

export interface SubscriptionLoginOperation {
  id: string
  provider: SubscriptionProvider
  state: 'running' | 'complete' | 'failed'
  message?: string
  status?: SubscriptionStatus
}
