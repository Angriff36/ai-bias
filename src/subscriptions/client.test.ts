import { afterEach, describe, expect, it, vi } from 'vitest'
import { callSubscription, getSubscriptionStatuses, startSubscriptionLogin } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('subscription client', () => {
  it('returns provider status from the local bridge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      providers: [{
        provider: 'codex',
        label: 'ChatGPT',
        installed: true,
        authenticated: true,
        authMethod: 'oauth',
        loginCommand: 'codex login',
        installCommand: 'npm install -g @openai/codex',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    await expect(getSubscriptionStatuses()).resolves.toEqual([
      expect.objectContaining({ provider: 'codex', authenticated: true }),
    ])
  })

  it('sends a subscription prompt as JSON and returns normalized content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      provider: 'codex',
      modelId: 'default',
      content: 'answer',
      latencyMs: 42,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(callSubscription({
      provider: 'codex',
      modelId: 'default',
      prompt: "prompt with 'quotes'",
    })).resolves.toEqual({
      provider: 'codex',
      modelId: 'default',
      content: 'answer',
      latencyMs: 42,
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/subscriptions/call', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'codex', modelId: 'default', prompt: "prompt with 'quotes'" }),
    }))
  })

  it('normalizes safe bridge errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'ChatGPT subscription sign-in is required.',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } })))

    await expect(startSubscriptionLogin('codex')).rejects.toEqual({
      statusCode: 401,
      message: 'ChatGPT subscription sign-in is required.',
    })
  })
})
