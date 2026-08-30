import type { CallModelResult, DiscoverModelsResult, ModelPricing, ProviderAdapter } from './types'
import { classifyHttpError, emptyResponseError } from './util'

const BASE = 'https://openrouter.ai/api/v1'
const APP_TITLE = 'AI Bias Lab'

function appOrigin(): string {
  return typeof location !== 'undefined' ? location.origin : 'http://localhost'
}

async function throwOpenRouterError(res: Response): Promise<never> {
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

export const openrouterAdapter: ProviderAdapter = {
  async callModel(prompt, config, apiKey, signal): Promise<CallModelResult> {
    const start = Date.now()
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': appOrigin(),
        'X-OpenRouter-Title': APP_TITLE,
      },
      body: JSON.stringify({
        model: config.modelId,
        messages: [{ role: 'user', content: prompt }],
        // Room for reasoning plus a full answer; the executor's 90 s deadline is the real stop.
        max_tokens: 4000,
        // Answer, do not think first: reasoning made a flash model take 30–90 s per reply.
        reasoning: { enabled: false },
      }),
    }).catch(() => { throw { kind: 'timeout', message: 'fetch failed' } })

    if (!res.ok) await throwOpenRouterError(res)
    const json = await res.json() as {
      choices?: { message?: { content?: string | null }; finish_reason?: string }[]
    }
    const content = (json.choices?.[0]?.message?.content ?? '').trim()
    if (!content) throw emptyResponseError(json.choices?.[0]?.finish_reason)
    return {
      content,
      modelId: config.modelId,
      provider: 'openrouter',
      latencyMs: Date.now() - start,
      truncated: json.choices?.[0]?.finish_reason === 'length',
    }
  },

  async discoverModels(_config, apiKey, signal): Promise<DiscoverModelsResult> {
    const res = await fetch(`${BASE}/models`, {
      signal,
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => { throw { kind: 'timeout', message: 'fetch failed' } })

    if (!res.ok) await throwOpenRouterError(res)
    const json = await res.json() as {
      data?: { id: string; pricing?: { prompt?: string | number; completion?: string | number } }[]
    }
    const modelPricing: Record<string, ModelPricing> = {}
    for (const model of json.data ?? []) {
      const promptPerToken = Number(model.pricing?.prompt)
      const completionPerToken = Number(model.pricing?.completion)
      if (Number.isFinite(promptPerToken) && promptPerToken >= 0
        && Number.isFinite(completionPerToken) && completionPerToken >= 0) {
        modelPricing[model.id] = { promptPerToken, completionPerToken }
      }
    }
    return {
      models: (json.data ?? []).map((m) => m.id).sort(),
      modelPricing,
    }
  },

  async testConnection(config, apiKey, signal): Promise<void> {
    await this.discoverModels(config, apiKey, signal)
  },
}
