import type { CallModelResult, DiscoverModelsResult, ProviderAdapter } from './types'
import { classifyHttpError, emptyResponseError, joinTextBlocks } from './util'

const BASE = 'https://api.anthropic.com/v1'
const VERSION = '2023-06-01'
/** High enough that a normal answer is never cut; a reply that still hits it is flagged. */
const MAX_OUTPUT_TOKENS = 4096

const KNOWN_MODELS = [
  'claude-fable-5',
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]

export const anthropicAdapter: ProviderAdapter = {
  async callModel(prompt, config, apiKey, signal): Promise<CallModelResult> {
    const start = Date.now()
    const res = await fetch(`${BASE}/messages`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: config.modelId,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    }).catch(() => { throw { kind: 'timeout', message: 'fetch failed' } })

    if (!res.ok) throw classifyHttpError(res.status)
    const json = await res.json() as { content?: unknown; stop_reason?: unknown }
    // Thinking-capable models put a reasoning block first; take every text block.
    const content = joinTextBlocks(json.content, (block) => (block.type === 'text' ? block.text : ''))
    if (!content) throw emptyResponseError(json.stop_reason)
    return {
      content,
      modelId: config.modelId,
      provider: 'anthropic',
      latencyMs: Date.now() - start,
      truncated: json.stop_reason === 'max_tokens',
    }
  },

  async discoverModels(_config, apiKey, signal): Promise<DiscoverModelsResult> {
    const res = await fetch(`${BASE}/models`, {
      signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    }).catch(() => { throw { kind: 'timeout', message: 'fetch failed' } })

    if (!res.ok) {
      // Fallback to known models on auth failure so UI is usable
      if (res.status === 401 || res.status === 403) throw classifyHttpError(res.status)
      return { models: KNOWN_MODELS }
    }
    const json = await res.json() as { data?: { id: string }[] }
    return { models: (json.data ?? []).map((m) => m.id).sort() }
  },

  async testConnection(config, apiKey, signal): Promise<void> {
    await this.discoverModels(config, apiKey, signal)
  },
}
