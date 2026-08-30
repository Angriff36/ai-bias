import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenRouterReportModel } from './reportModelClient'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('OpenRouter report model', () => {
  it('uses a JSON object from reasoning when GLM returns no content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: null, reasoning: 'analysis complete\n{"scores":[]}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const client = new OpenRouterReportModel('key', 'https://ai-tests.com')

    await expect(client.complete('z-ai/glm-5.3-flash', 'score', 8192, { jsonObject: true }))
      .resolves.toBe('{"scores":[]}')
  })

  it('aborts an OpenRouter request at the caller-provided timeout', async () => {
    vi.useFakeTimers()
    const observed: { signal?: AbortSignal } = {}
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      observed.signal = init?.signal as AbortSignal
      return new Promise<Response>(() => undefined)
    }))
    const client = new OpenRouterReportModel('key', 'https://ai-tests.com')

    void client.complete('z-ai/glm-5.3-flash', 'score', 8192, { jsonObject: true, timeoutMs: 25 })
    await vi.advanceTimersByTimeAsync(24)
    expect(observed.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(observed.signal?.aborted).toBe(true)
  })
})
