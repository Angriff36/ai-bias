import type { CallModelResult, DiscoverModelsResult, ProviderAdapter } from './types'
import { classifyHttpError } from './util'

const BASE = 'https://api.openai.com/v1'

export const openaiAdapter: ProviderAdapter = {
  async callModel(prompt, config, apiKey, signal): Promise<CallModelResult> {
    const start = Date.now()
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: config.modelId,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 512,
      }),
    }).catch(() => { throw { kind: 'timeout', message: 'fetch failed' } })

    if (!res.ok) throw classifyHttpError(res.status)
    const json = await res.json() as { choices?: { message?: { content?: string } }[] }
    return {
      content: json.choices?.[0]?.message?.content ?? '',
      modelId: config.modelId,
      provider: 'openai',
      latencyMs: Date.now() - start,
    }
  },

  async discoverModels(_config, apiKey, signal): Promise<DiscoverModelsResult> {
    const res = await fetch(`${BASE}/models`, {
      signal,
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => { throw { kind: 'timeout', message: 'fetch failed' } })

    if (!res.ok) throw classifyHttpError(res.status)
    const json = await res.json() as { data?: { id: string }[] }
    return { models: (json.data ?? []).map((m) => m.id).sort() }
  },

  async testConnection(config, apiKey, signal): Promise<void> {
    await this.discoverModels(config, apiKey, signal)
  },
}
