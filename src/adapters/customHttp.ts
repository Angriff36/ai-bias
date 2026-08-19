import type { CallModelResult, DiscoverModelsResult, ProviderAdapter } from './types'
import { classifyHttpError } from './util'

export const customHttpAdapter: ProviderAdapter = {
  async callModel(prompt, config, apiKey, signal): Promise<CallModelResult> {
    if (!config.endpointUrl) throw { kind: 'unknown', message: 'No endpoint URL configured.' }
    const start = Date.now()
    const res = await fetch(`${config.endpointUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(config.headers ?? {}),
      },
      body: JSON.stringify({
        model: config.modelId,
        messages: [{ role: 'user', content: prompt }],
      }),
    }).catch(() => { throw { kind: 'timeout', message: 'fetch failed' } })

    if (!res.ok) throw classifyHttpError(res.status)
    const json = await res.json() as { choices?: { message?: { content?: string } }[] }
    return {
      content: json.choices?.[0]?.message?.content ?? '',
      modelId: config.modelId,
      provider: 'custom',
      latencyMs: Date.now() - start,
    }
  },

  async discoverModels(config, apiKey, signal): Promise<DiscoverModelsResult> {
    if (!config.endpointUrl) return { models: [] }
    const res = await fetch(`${config.endpointUrl}/models`, {
      signal,
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(config.headers ?? {}),
      },
    }).catch(() => { throw { kind: 'timeout', message: 'fetch failed' } })

    if (!res.ok) throw classifyHttpError(res.status)
    const json = await res.json() as { data?: { id: string }[] } | { models?: { name: string }[] }
    const list =
      'data' in json ? (json.data ?? []).map((m) => m.id) :
      'models' in json ? (json.models ?? []).map((m) => m.name) :
      []
    return { models: list.sort() }
  },

  async testConnection(config, apiKey, signal): Promise<void> {
    if (!config.endpointUrl) throw { kind: 'unknown', message: 'No endpoint URL configured.' }
    const res = await fetch(`${config.endpointUrl}/models`, {
      signal,
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(config.headers ?? {}),
      },
    }).catch(() => { throw { kind: 'timeout', message: 'fetch failed' } })
    if (!res.ok) throw classifyHttpError(res.status)
  },
}
