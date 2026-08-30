import type { AiBindingLike } from './analysis'

export interface ReportModelClient {
  complete(modelId: string, prompt: string, maxTokens: number, options?: { jsonObject?: boolean }): Promise<string>
}

function responseText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'response' in value && typeof value.response === 'string') {
    return value.response
  }
  throw new Error('Workers AI returned no text.')
}

export class WorkersAiReportModel implements ReportModelClient {
  constructor(private readonly ai: AiBindingLike) {}

  async complete(modelId: string, prompt: string, maxTokens: number, _options?: { jsonObject?: boolean }): Promise<string> {
    const result = await this.ai.run(modelId, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
    })
    return responseText(result).trim()
  }
}

export class OpenRouterReportModel implements ReportModelClient {
  constructor(
    private readonly apiKey: string,
    private readonly siteOrigin: string,
  ) {}

  async complete(modelId: string, prompt: string, maxTokens: number, options?: { jsonObject?: boolean }): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteOrigin,
          'X-OpenRouter-Title': 'AI Bias Lab',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          ...(options?.jsonObject ? { response_format: { type: 'json_object' } } : {}),
        }),
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`OpenRouter request failed (${response.status}): ${detail.slice(0, 240)}`)
      }
      const json = await response.json() as {
        choices?: { message?: { content?: string | null; reasoning?: string | null } }[]
      }
      const message = json.choices?.[0]?.message
      const content = message?.content?.trim()
      if (!content && message?.reasoning) {
        const start = message.reasoning.indexOf('{')
        const end = message.reasoning.lastIndexOf('}')
        if (start >= 0 && end > start) return message.reasoning.slice(start, end + 1)
      }
      if (!content) throw new Error('OpenRouter returned no report text.')
      return content
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenRouter request timed out for ${modelId}.`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function createReportModelClient(apiKey: string | undefined, siteOrigin: string): ReportModelClient {
  if (!apiKey?.trim()) throw new Error('OPENROUTER_API_KEY is not configured.')
  return new OpenRouterReportModel(apiKey.trim(), siteOrigin)
}
