import { describe, expect, it } from 'vitest'
import { createRoutingAdapter, type RunTarget } from './adapter'
import type { RunRequest } from './types'

function target(modelId: string, content: string): RunTarget {
  return {
    id: modelId,
    label: modelId,
    provider: 'openai',
    modelId,
    adapter: {
      async callModel() {
        return { content, statusCode: 200, latencyMs: 1, provider: 'openai' as const, modelId }
      },
    },
  }
}

function request(modelId: string): RunRequest {
  return {
    id: 'r1', batchId: 'b1', pairIndex: 0, runIndex: 0,
    variantLabel: 'A', prompt: 'p', provider: 'openai', modelId,
  }
}

describe('createRoutingAdapter', () => {
  it('sends each request to the adapter of its own model', async () => {
    const routing = createRoutingAdapter([target('gpt-4o', 'from gpt'), target('sonnet', 'from sonnet')])
    await expect(routing.callModel(request('gpt-4o'))).resolves.toMatchObject({ content: 'from gpt' })
    await expect(routing.callModel(request('sonnet'))).resolves.toMatchObject({ content: 'from sonnet' })
  })

  it('fails one request clearly when its model is not configured', async () => {
    const routing = createRoutingAdapter([target('gpt-4o', 'x')])
    await expect(routing.callModel(request('missing'))).rejects.toMatchObject({
      statusCode: 400,
      message: 'No provider configured for missing',
    })
  })
})
