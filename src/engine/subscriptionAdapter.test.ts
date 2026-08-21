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
  it('refuses inference rather than answering through a coding agent', async () => {
    await expect(createSubscriptionExecutionAdapter(target).callModel(request)).rejects.toMatchObject({
      statusCode: 501,
    })
  })

  it('never reaches the subscription bridge, so no CLI process can start', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(createSubscriptionExecutionAdapter(target).callModel(request)).rejects.toBeTruthy()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not fall back to a paid API transport', async () => {
    const error = await createSubscriptionExecutionAdapter(target).callModel(request).catch((e) => e)
    expect(error.statusCode).toBe(501)
    expect(error.message).toContain('Add an API-key provider')
    expect(error).not.toHaveProperty('content')
  })
})
