import type { CallModelResult, DiscoverModelsResult, ProviderAdapter } from './types'
import { classifyHttpError, emptyResponseError } from './util'

const BASE = 'https://api.openai.com/v1'
/** High enough that a normal answer is never cut; a reply that still hits it is flagged. */
const MAX_OUTPUT_TOKENS = 4096

async function throwOpenAIError(res: Response): Promise<never> {
  const classified = classifyHttpError(res.status)
  try {
    const json = await res.json() as { error?: { message?: unknown } }
    const detail = json.error?.message
    if (typeof detail === 'string' && detail.trim()) {
      throw { ...classified, detail: detail.trim() }
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'kind' in error) throw error
  }
  throw classified
}

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
        max_completion_tokens: MAX_OUTPUT_TOKENS,
      }),
    }).catch(() => { throw { kind: 'timeout', message: 'fetch failed' } })

    if (!res.ok) await throwOpenAIError(res)
    const json = await res.json() as {
      choices?: { message?: { content?: string | null }; finish_reason?: string }[]
    }
    const content = (json.choices?.[0]?.message?.content ?? '').trim()
    if (!content) throw emptyResponseError(json.choices?.[0]?.finish_reason)
    return {
      content,
      modelId: config.modelId,
      provider: 'openai',
      latencyMs: Date.now() - start,
      truncated: json.choices?.[0]?.finish_reason === 'length',
    }
  },

  async discoverModels(_config, apiKey, signal): Promise<DiscoverModelsResult> {
    const res = await fetch(`${BASE}/models`, {
      signal,
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => { throw { kind: 'timeout', message: 'fetch failed' } })

    if (!res.ok) await throwOpenAIError(res)
    const json = await res.json() as { data?: { id: string }[] }
    return { models: (json.data ?? []).map((m) => m.id).sort() }
  },

  async testConnection(config, apiKey, signal): Promise<void> {
    await this.discoverModels(config, apiKey, signal)
  },
}
