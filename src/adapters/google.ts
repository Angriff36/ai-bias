import type { CallModelResult, DiscoverModelsResult, ProviderAdapter } from './types'
import { classifyHttpError } from './util'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

export const googleAdapter: ProviderAdapter = {
  async callModel(prompt, config, apiKey, signal): Promise<CallModelResult> {
    const start = Date.now()
    const res = await fetch(
      `${BASE}/models/${config.modelId}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    ).catch(() => { throw { kind: 'timeout', message: 'fetch failed' } })

    if (!res.ok) throw classifyHttpError(res.status)
    const json = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    return {
      content: json.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      modelId: config.modelId,
      provider: 'google',
      latencyMs: Date.now() - start,
    }
  },

  async discoverModels(_config, apiKey, signal): Promise<DiscoverModelsResult> {
    const res = await fetch(`${BASE}/models?key=${apiKey}`, { signal }).catch(
      () => { throw { kind: 'timeout', message: 'fetch failed' } },
    )
    if (!res.ok) throw classifyHttpError(res.status)
    const json = await res.json() as { models?: { name: string }[] }
    return {
      models: (json.models ?? [])
        .map((m) => m.name.replace('models/', ''))
        .filter((id) => id.startsWith('gemini'))
        .sort(),
    }
  },

  async testConnection(config, apiKey, signal): Promise<void> {
    await this.discoverModels(config, apiKey, signal)
  },
}
