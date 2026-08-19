/**
 * Adapter registry.
 *
 * Dispatches callModel / discoverModels / testConnection to the correct
 * provider adapter. In production (Bolt), this module runs server-side only.
 * API keys are injected by the server — never returned to the browser.
 */
import type { AdapterConfig, CallModelResult, DiscoverModelsResult, TestConnectionResult } from './types'
import { openaiAdapter } from './openai'
import { anthropicAdapter } from './anthropic'
import { googleAdapter } from './google'
import { openrouterAdapter } from './openrouter'
import { customHttpAdapter } from './customHttp'
import type { ProviderId } from './types'
import type { ProviderAdapter } from './types'

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
  openrouter: openrouterAdapter,
  custom: customHttpAdapter,
}

function getAdapter(provider: ProviderId): ProviderAdapter {
  return ADAPTERS[provider]
}

export async function callModel(
  prompt: string,
  config: AdapterConfig,
  apiKey: string,
  signal?: AbortSignal,
): Promise<CallModelResult> {
  return getAdapter(config.provider).callModel(prompt, config, apiKey, signal)
}

export async function discoverModels(
  config: AdapterConfig,
  apiKey: string,
  signal?: AbortSignal,
): Promise<DiscoverModelsResult> {
  return getAdapter(config.provider).discoverModels(config, apiKey, signal)
}

/**
 * Minimal ping through the provider adapter. Verifies both the credentials
 * and the configured model ID by issuing a tiny model call. The response
 * content is discarded — only pass/fail and latency leave this function.
 */
export async function testConnection(
  config: AdapterConfig,
  apiKey: string,
  signal?: AbortSignal,
): Promise<TestConnectionResult> {
  const result = await getAdapter(config.provider).callModel('ping', config, apiKey, signal)
  return { ok: true, latencyMs: result.latencyMs }
}
