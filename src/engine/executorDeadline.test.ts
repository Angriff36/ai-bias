import { describe, expect, it, vi } from 'vitest'
import { createBatchExecutor, REQUEST_DEADLINE_MS } from './executor'
import type { CellStatus, RunRequest } from './types'

vi.mock('./db', () => ({ persistRawRecord: vi.fn(async (record: unknown) => ({ id: 1, ...(record as object) })) }))

const request = {
  id: 'r1', batchId: 'b', pairIndex: 0, runIndex: 0, provider: 'openrouter', modelId: 'm', prompt: 'p', variantKey: 'A', variantLabel: 'white',
} as unknown as RunRequest

describe('request deadline', () => {
  it('marks a request that never answers as failed after the deadline', async () => {
    vi.useFakeTimers()
    const cells: CellStatus[] = []
    const executor = createBatchExecutor([request], {
      callModel: (_req, signal) => new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
    }, { onCell: (cell) => cells.push(cell), onDone: () => {}, onRecord: () => {}, onFailureStreak: () => {} } as never)
    executor.start()
    await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS + 10)
    const last = cells.at(-1)
    expect(last?.state).toBe('failed')
    expect(last?.errorMessage).toContain('No answer within')
    vi.useRealTimers()
  })
})
