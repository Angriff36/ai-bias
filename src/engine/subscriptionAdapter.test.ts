import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSubscriptionExecutionAdapter } from './subscriptionAdapter'
import type { RunRequest } from './types'
import type { TargetConfig } from '../store/targetStore'

const target: TargetConfig = {
  id: 'subscription-codex',
  name: 'ChatGPT subscription',
  provider: 'openai',
  modelId: 'default',
  authMode: 'subscription',
}

const request: RunRequest = {
  id: 'request-1',
  batchId: 'batch-1',
  pairIndex: 0,
  runIndex: 0,
  variantLabel: 'A',
  prompt: 'test prompt',
  provider: 'openai',
  modelId: 'default',
}

afterEach(() => vi.unstubAllGlobals())

describe('createSubscriptionExecutionAdapter', () => {
  it('calls the local subscription bridge instead of requiring an API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      provider: 'codex',
      modelId: 'default',
      content: 'subscription answer',
      latencyMs: 31,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createSubscriptionExecutionAdapter(target).callModel(request)).resolves.toEqual({
      content: 'subscription answer',
      statusCode: 200,
      latencyMs: 31,
      provider: 'openai',
      modelId: 'default',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/subscriptions/call', expect.objectContaining({
      body: JSON.stringify({ provider: 'codex', modelId: 'default', prompt: 'test prompt' }),
    }))
  })

  it('preserves a safe bridge failure for the experiment engine', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'ChatGPT subscription sign-in is required.',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } })))

    await expect(createSubscriptionExecutionAdapter(target).callModel(request)).rejects.toEqual({
      statusCode: 401,
      message: 'ChatGPT subscription sign-in is required.',
    })
  })
})
