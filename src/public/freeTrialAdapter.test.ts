import { describe, expect, it, vi } from 'vitest'
import type { RunPair, RunRequest } from '../engine/types'
import type { FreeRunResponse } from './contracts'
import { createFreeTrialAdapter } from './freeTrialAdapter'

const pair: RunPair = { id: 'p1', question: 'q', variantA: { key: 'A', label: 'A', prompt: 'Prompt A' }, variantB: { key: 'B', label: 'B', prompt: 'Prompt B' } }
const request = (variantKey: 'A' | 'B'): RunRequest => ({
  id: variantKey, batchId: 'batch', pairIndex: 0, runIndex: 0, pairId: 'p1', question: 'q', variantKey,
  variantLabel: variantKey, prompt: `Prompt ${variantKey}`, provider: 'workers-ai', modelId: 'free-model',
})

describe('free trial adapter', () => {
  it('shares one pair request across shuffled concurrent A/B execution', async () => {
    const runPair = vi.fn(async (): Promise<FreeRunResponse> => ({
      provider: 'workers-ai' as const, modelId: 'free-model', remaining: 1, dailyRemaining: 249,
      records: [
        { variantKey: 'A' as const, content: 'Answer A', statusCode: 200, latencyMs: 20, truncated: false, sha256: 'a' },
        { variantKey: 'B' as const, content: 'Answer B', statusCode: 200, latencyMs: 21, truncated: true, sha256: 'b' },
      ],
    }))
    const adapter = createFreeTrialAdapter([pair], { runPair })
    const [b, a] = await Promise.all([adapter.callModel(request('B')), adapter.callModel(request('A'))])
    expect(runPair).toHaveBeenCalledOnce()
    expect(a.content).toBe('Answer A')
    expect(b.content).toBe('Answer B')
    expect(b.truncated).toBe(true)
  })

  it('rejects repeats because free use is one matched run per question', async () => {
    const adapter = createFreeTrialAdapter([pair], { runPair: vi.fn() })
    await expect(adapter.callModel({ ...request('A'), runIndex: 1 })).rejects.toMatchObject({ statusCode: 400 })
  })
})
