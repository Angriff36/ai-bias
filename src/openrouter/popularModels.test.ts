import { describe, expect, it, vi } from 'vitest'
import { OpenRouterPopularModelsClient, POPULAR_MODEL_LIMIT } from './popularModels'

describe('OpenRouterPopularModelsClient', () => {
  it('returns the first 20 most-popular models from OpenRouter', async () => {
    const models = Array.from({ length: 25 }, (_, index) => ({
      id: `vendor/model-${index}`,
      name: `Model ${index}`,
    }))
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: models }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const client = new OpenRouterPopularModelsClient(fetcher)
    const result = await client.fetchTopModels()

    expect(fetcher).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models?sort=most-popular',
      expect.objectContaining({
        headers: {},
      }),
    )
    expect(result).toHaveLength(POPULAR_MODEL_LIMIT)
    expect(result[0]).toEqual({ id: 'vendor/model-0', name: 'Model 0' })
    expect(result[19]).toEqual({ id: 'vendor/model-19', name: 'Model 19' })
  })

  it('sends the OAuth key when available', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))

    await new OpenRouterPopularModelsClient(fetcher).fetchTopModels(5, {
      apiKey: 'session-openrouter-key',
    })

    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: 'Bearer session-openrouter-key' },
      }),
    )
  })

  it('throws when OpenRouter rejects the request', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 503 }))

    await expect(new OpenRouterPopularModelsClient(fetcher).fetchTopModels()).rejects.toThrow(
      'Could not load popular OpenRouter models.',
    )
  })
})
