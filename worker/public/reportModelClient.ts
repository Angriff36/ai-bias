export interface ReportModelClient {
  complete(modelId: string, prompt: string, maxTokens: number): Promise<string>
}

export class OpenRouterReportModel implements ReportModelClient {
  constructor(
    private readonly apiKey: string,
    private readonly siteOrigin: string,
  ) {}

  async complete(modelId: string, prompt: string, maxTokens: number): Promise<string> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
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
      }),
    })
    if (!response.ok) {
      throw new Error(`OpenRouter request failed (${response.status}).`)
    }
    const json = await response.json() as {
      choices?: { message?: { content?: string | null } }[]
    }
    const content = json.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('OpenRouter returned no report text.')
    return content
  }
}

export function createReportModelClient(apiKey: string | undefined, siteOrigin: string): ReportModelClient {
  if (!apiKey?.trim()) throw new Error('OPENROUTER_API_KEY is not configured.')
  return new OpenRouterReportModel(apiKey.trim(), siteOrigin)
}
