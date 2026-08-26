import { afterEach, describe, expect, it, vi } from 'vitest'
import { openaiAdapter } from './openai'

afterEach(() => { vi.unstubAllGlobals() })

describe('OpenAI requests', () => {
  it('uses the completion-token limit supported by current reasoning models', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await openaiAdapter.callModel('prompt', { provider: 'openai', modelId: 'gpt-5' }, 'sk-test')

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.max_completion_tokens).toBe(4096)
    expect(body.max_tokens).toBeUndefined()
  })

  it('preserves the provider error message for a rejected generation request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "Unsupported parameter: 'max_tokens'" },
    }), { status: 400 })))

    await expect(
      openaiAdapter.callModel('prompt', { provider: 'openai', modelId: 'gpt-5' }, 'sk-test'),
    ).rejects.toMatchObject({
      statusCode: 400,
      detail: "Unsupported parameter: 'max_tokens'",
    })
  })
})
