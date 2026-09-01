import { afterEach, describe, expect, it, vi } from 'vitest'
import { openrouterAdapter } from './openrouter'

afterEach(() => { vi.unstubAllGlobals() })

describe('OpenRouter requests', () => {
  it('sends the OpenRouter chat request with app attribution', async () => {
    vi.stubGlobal('location', { origin: 'http://localhost:5173' })
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await openrouterAdapter.callModel(
      'prompt',
      { provider: 'openrouter', modelId: 'openai/gpt-4o-mini' },
      'sk-or-v1-test',
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-or-v1-test',
          'HTTP-Referer': 'http://localhost:5173',
          'X-OpenRouter-Title': 'AI Bias Lab',
        },
      }),
    )

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: 'openai/gpt-4o-mini',
      reasoning: { exclude: true },
    })
  })

  it('preserves the provider error message for a rejected request', async () => {
    vi.stubGlobal('location', { origin: 'http://localhost:5173' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'No endpoints found for this model' },
    }), { status: 400 })))

    await expect(
      openrouterAdapter.callModel(
        'prompt',
        { provider: 'openrouter', modelId: 'unknown/model' },
        'sk-or-v1-test',
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      detail: 'No endpoints found for this model',
    })
  })

  it('returns per-token pricing from model discovery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: 'openai/gpt-4o-mini',
        pricing: { prompt: '0.00000015', completion: '0.0000006' },
      }],
    }), { status: 200 })))

    const result = await openrouterAdapter.discoverModels(
      { provider: 'openrouter', modelId: 'openai/gpt-4o-mini' },
      'sk-or-v1-test',
    )

    expect(result.modelPricing).toEqual({
      'openai/gpt-4o-mini': { promptPerToken: 0.00000015, completionPerToken: 0.0000006 },
    })
  })
})
