import { afterEach, describe, expect, it, vi } from 'vitest'
import { anthropicAdapter } from './anthropic'
import { openaiAdapter } from './openai'
import { googleAdapter } from './google'
import { openrouterAdapter } from './openrouter'

function respond(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('location', { origin: 'http://localhost' })
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

/**
 * A reply the provider stops at its length limit is incomplete. It is kept
 * (it is still evidence) but flagged, so it is never read as a full answer.
 */
describe('replies cut off at the length limit', () => {
  it('OpenAI: asks for a generous limit and flags finish_reason "length"', async () => {
    const fetchMock = respond({ choices: [{ message: { content: 'Half an ans' }, finish_reason: 'length' }] })

    const result = await openaiAdapter.callModel('prompt', { provider: 'openai', modelId: 'gpt-4o' }, 'sk-test')

    expect(result.truncated).toBe(true)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.max_tokens).toBeGreaterThanOrEqual(4096)
  })

  it('OpenAI: a complete reply is not flagged', async () => {
    respond({ choices: [{ message: { content: 'A whole answer.' }, finish_reason: 'stop' }] })
    const result = await openaiAdapter.callModel('prompt', { provider: 'openai', modelId: 'gpt-4o' }, 'sk-test')
    expect(result.truncated).toBe(false)
  })

  it('Anthropic: asks for a generous limit and flags stop_reason "max_tokens"', async () => {
    const fetchMock = respond({ content: [{ type: 'text', text: 'Half an ans' }], stop_reason: 'max_tokens' })

    const result = await anthropicAdapter.callModel('prompt', { provider: 'anthropic', modelId: 'claude-sonnet-4-6' }, 'sk-ant')

    expect(result.truncated).toBe(true)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.max_tokens).toBeGreaterThanOrEqual(4096)
  })

  it('Gemini: flags finishReason "MAX_TOKENS"', async () => {
    respond({ candidates: [{ content: { parts: [{ text: 'Half an ans' }] }, finishReason: 'MAX_TOKENS' }] })
    const result = await googleAdapter.callModel('prompt', { provider: 'google', modelId: 'gemini-2.0-flash' }, 'AIza')
    expect(result.truncated).toBe(true)
  })

  it('OpenRouter: flags finish_reason "length"', async () => {
    respond({ choices: [{ message: { content: 'Half an ans' }, finish_reason: 'length' }] })
    const result = await openrouterAdapter.callModel('prompt', { provider: 'openrouter', modelId: 'x/y' }, 'sk-or')
    expect(result.truncated).toBe(true)
  })
})
