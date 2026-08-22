/**
 * Server-side provider adapter contract.
 *
 * In production (Bolt), these modules run in server functions only.
 * API keys are read from Bolt server-side secrets — never serialized to the browser.
 * In this dev build the key store is module-level (never echoed in responses).
 */

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom'

export interface AdapterConfig {
  provider: ProviderId
  modelId: string
  endpointUrl?: string
  headers?: Record<string, string>
}

export interface CallModelResult {
  content: string
  modelId: string
  provider: ProviderId
  latencyMs: number
  /** True when the provider stopped at its length limit, so the reply is incomplete. */
  truncated?: boolean
}

export interface DiscoverModelsResult {
  models: string[]
}

export interface AdapterError {
  kind: 'auth' | 'timeout' | 'not_found' | 'unknown'
  statusCode?: number
  message: string
}

export function isAdapterError(e: unknown): e is AdapterError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'kind' in e &&
    'message' in e
  )
}

export function friendlyError(e: AdapterError): string {
  switch (e.kind) {
    case 'auth':
      return 'Invalid API key. Check your credentials and try again.'
    case 'timeout':
      return 'Connection timed out. Check the endpoint URL and retry.'
    case 'not_found':
      return 'Model not found on this provider. Use Discover Models to refresh.'
    default:
      return e.statusCode != null
        ? `Error ${e.statusCode}. Check your configuration and retry.`
        : 'An unexpected error occurred. Check your configuration and retry.'
  }
}

export interface ProviderAdapter {
  callModel(prompt: string, config: AdapterConfig, apiKey: string, signal?: AbortSignal): Promise<CallModelResult>
  discoverModels(config: AdapterConfig, apiKey: string, signal?: AbortSignal): Promise<DiscoverModelsResult>
  testConnection(config: AdapterConfig, apiKey: string, signal?: AbortSignal): Promise<void>
}
