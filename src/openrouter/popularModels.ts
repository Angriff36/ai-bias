const MODELS_URL = 'https://openrouter.ai/api/v1/models'
export const POPULAR_MODEL_LIMIT = 20

export interface OpenRouterModelChoice {
  id: string
  name: string
}

export class OpenRouterPopularModelsClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async fetchTopModels(
    limit = POPULAR_MODEL_LIMIT,
    input?: { apiKey?: string; signal?: AbortSignal },
  ): Promise<OpenRouterModelChoice[]> {
    const url = new URL(MODELS_URL)
    url.searchParams.set('sort', 'most-popular')

    const headers: Record<string, string> = {}
    if (input?.apiKey?.trim()) headers.Authorization = `Bearer ${input.apiKey.trim()}`

    const response = await this.fetcher(url.toString(), {
      signal: input?.signal,
      headers,
    })
    if (!response.ok) throw new Error('Could not load popular OpenRouter models.')

    const json = await response.json() as {
      data?: { id?: unknown; name?: unknown }[]
    }
    return (json.data ?? [])
      .map((model) => ({
        id: typeof model.id === 'string' ? model.id.trim() : '',
        name: typeof model.name === 'string' ? model.name.trim() : '',
      }))
      .filter((model) => model.id.length > 0)
      .slice(0, limit)
      .map((model) => ({
        id: model.id,
        name: model.name || model.id,
      }))
  }
}

export async function fetchPopularOpenRouterModels(
  limit = POPULAR_MODEL_LIMIT,
  input?: { apiKey?: string; signal?: AbortSignal; fetcher?: typeof fetch },
): Promise<OpenRouterModelChoice[]> {
  const client = new OpenRouterPopularModelsClient(input?.fetcher ?? fetch)
  return client.fetchTopModels(limit, input)
}
