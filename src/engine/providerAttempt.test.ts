import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderAdapter } from './adapter'
import { createBatchExecutor } from './executor'
import { ProviderAttempt } from './providerAttempt'
import { ProviderRetryPolicy } from './providerRetry'
import type { RawRecord, RunRequest } from './types'

vi.mock('./db', () => ({
  persistRawRecord: vi.fn(async (record: Omit<RawRecord, 'sha256' | 'persistedAt'>) => ({
    ...record,
    sha256: 'a'.repeat(64),
    persistedAt: '2026-08-29T00:00:00.000Z',
  })),
}))

const request: RunRequest = {
  id: 'req-1',
  batchId: 'batch-1',
  pairIndex: 0,
  pairId: 'pair-1',
  question: 'q',
  variantKey: 'A',
  variantLabel: 'A',
  runIndex: 0,
  provider: 'simulated',
  modelId: 'sim-1',
  prompt: 'hello',
}

function hangUntilAborted(): ProviderAdapter {
  return {
    callModel: (_req, signal) => new Promise((_, reject) => {
      const fail = () => reject(new DOMException('Aborted', 'AbortError'))
      if (signal?.aborted) return fail()
      signal?.addEventListener('abort', fail, { once: true })
    }),
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ProviderRetryPolicy', () => {
  it('retries 429s and then stops', () => {
    const policy = new ProviderRetryPolicy(3, 1_000)
    const rateLimit = { statusCode: 429, message: 'slow down' }
    expect(policy.shouldRetry(rateLimit, 0)).toBe(true)
    expect(policy.shouldRetry(rateLimit, 3)).toBe(false)
    expect(policy.shouldRetry({ statusCode: 500, message: 'down' }, 0)).toBe(false)
    expect(policy.delayMs(rateLimit, 0)).toBe(1_000)
    expect(policy.delayMs({ statusCode: 429, message: 'wait', retryAfterMs: 5_000 }, 0)).toBe(5_000)
  })
})

describe('ProviderAttempt', () => {
  it('waits and retries a 429 until the model answers', async () => {
    vi.useFakeTimers()
    let calls = 0
    const adapter: ProviderAdapter = {
      async callModel() {
        calls += 1
        if (calls < 3) throw { statusCode: 429, message: 'rate limited' }
        return { content: 'ok', statusCode: 200, latencyMs: 4, provider: 'simulated', modelId: 'sim-1' }
      },
    }
    const run = new ProviderAttempt(adapter, new AbortController().signal, 5_000).run(request)
    await vi.advanceTimersByTimeAsync(8_000)
    await expect(run).resolves.toEqual({
      kind: 'ok',
      result: expect.objectContaining({ content: 'ok' }),
    })
    expect(calls).toBe(3)
  })

  it('fails a hung call so the rest of the run can continue', async () => {
    vi.useFakeTimers()
    const run = new ProviderAttempt(hangUntilAborted(), new AbortController().signal, 50).run(request)
    await vi.advanceTimersByTimeAsync(60)
    await expect(run).resolves.toMatchObject({
      kind: 'failed',
      failure: { statusCode: 408 },
    })
  })

  it('leaves a cancelled call unrecorded', async () => {
    const cancel = new AbortController()
    const run = new ProviderAttempt(hangUntilAborted(), cancel.signal, 5_000).run(request)
    cancel.abort()
    await expect(run).resolves.toEqual({ kind: 'cancelled' })
  })
})

describe('createBatchExecutor rate-limit handling', () => {
  it('records a timeout as a failed cell and finishes the batch', async () => {
    vi.useFakeTimers()
    const cells: Array<{ requestId: string; state: string }> = []
    const done = new Promise<void>((resolve) => {
      const executor = createBatchExecutor(
        [{ ...request, id: 'hung' }],
        hangUntilAborted(),
        {
          onCell(status) { cells.push({ requestId: status.requestId, state: status.state }) },
          onRecord() {},
          onFailureStreak() {},
          onDone() { resolve() },
        },
        { timeoutMs: 40 },
      )
      executor.start()
    })
    await vi.advanceTimersByTimeAsync(80)
    await done
    expect(cells).toEqual(expect.arrayContaining([
      { requestId: 'hung', state: 'in-flight' },
      { requestId: 'hung', state: 'failed' },
    ]))
  })
})
