import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenRouterReportModel } from './reportModelClient'

afterEach(() => vi.restoreAllMocks())

describe('OpenRouter report model', () => {
  it('uses a JSON object from reasoning when GLM returns no content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: null, reasoning: 'analysis complete\n{"scores":[]}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const client = new OpenRouterReportModel('key', 'https://ai-tests.com')

    await expect(client.complete('z-ai/glm-5.3-flash', 'score', 8192, { jsonObject: true }))
      .resolves.toBe('{"scores":[]}')
  })
})
