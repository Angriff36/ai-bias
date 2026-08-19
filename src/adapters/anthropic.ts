import type { CallModelResult, DiscoverModelsResult, ProviderAdapter } from './types'
import { classifyHttpError } from './util'

const BASE = 'https://api.anthropic.com/v1'
const VERSION = '2023-06-01'

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
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    }).catch(() => { throw { kind: 'timeout', message: 'fetch failed' } })

    if (!res.ok) throw classifyHttpError(res.status)
    const json = await res.json() as { content?: { text?: string }[] }
    return {
      content: json.content?.[0]?.text ?? '',
      modelId: config.modelId,
      provider: 'anthropic',
      latencyMs: Date.now() - start,
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
      // Auth failures must surface — no silent fallback
      if (res.status === 401 || res.status === 403) throw classifyHttpError(res.status)
      // Curated static list is the officially documented approach when the
      // list endpoint is unavailable — never proxy through an aggregator.
      return {
        models: KNOWN_MODELS.map((id) => ({ id })),
        source: 'static',
      }
    }
    const json = await res.json() as { data?: { id: string; display_name?: string }[] }
    return {
      models: (json.data ?? [])
        .map((m) => ({ id: m.id, ...(m.display_name ? { name: m.display_name } : {}) }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      source: 'live',
    }
  },

  async testConnection(config, apiKey, signal): Promise<void> {
    await this.discoverModels(config, apiKey, signal)
  },
}
