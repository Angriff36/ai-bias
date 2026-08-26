import { describe, expect, it, vi } from 'vitest'
import type { PublicSubmission } from '../../src/public/contracts'
import { runFreePair } from './freeRun'

function repository(available = true) {
  return {
    reserveFreeQuestion: vi.fn(async () => available ? ({ quotaHash: 'hash', day: '2026-08-26' }) : null),
    rollbackFreeQuestion: vi.fn(async () => undefined),
    publish: vi.fn(async (_submission: PublicSubmission) => ({ runId: 'run-1', duplicate: false, crossedThresholds: [] as number[] })),
    getAllowance: vi.fn(async () => ({ remaining: available ? 1 : 0, dailyRemaining: available ? 249 : 0 })),
  }
}

describe('free matched-pair inference', () => {
  it('charges one allowance and gives both responses the 768-token ceiling', async () => {
    const repo = repository()
    const ai = { run: vi.fn(async (_model: string, input: Record<string, unknown>) => ({ response: `long response ${JSON.stringify(input).length}`, finish_reason: 'stop' })) }
    const result = await runFreePair(
      { question: 'q', promptA: 'Prompt A', promptB: 'Prompt B', labelA: 'A', labelB: 'B' },
      'quota-hash', ai, repo, new Date('2026-08-26T17:00:00Z'),
    )

    expect(result.status).toBe(200)
    expect(ai.run).toHaveBeenCalledTimes(2)
    expect(ai.run.mock.calls.every((call) => call[1]?.max_tokens === 768)).toBe(true)
    expect(repo.reserveFreeQuestion).toHaveBeenCalledTimes(1)
    expect(repo.publish.mock.calls[0][0].source).toBe('free-trial')
    expect('records' in result.body ? result.body.records.map((record) => record.variantKey) : []).toEqual(['A', 'B'])
  })

  it('returns 429 without inference when the visitor or daily allowance is exhausted', async () => {
    const repo = repository(false)
    const ai = { run: vi.fn() }
    const result = await runFreePair(
      { question: 'q', promptA: 'A', promptB: 'B', labelA: 'A', labelB: 'B' },
      'quota-hash', ai, repo, new Date('2026-08-26T17:00:00Z'),
    )
    expect(result.status).toBe(429)
    expect(ai.run).not.toHaveBeenCalled()
  })

  it('rolls back the reserved use when Workers AI fails', async () => {
    const repo = repository()
    const ai = { run: vi.fn(async () => { throw new Error('capacity') }) }
    const result = await runFreePair(
      { question: 'q', promptA: 'A', promptB: 'B', labelA: 'A', labelB: 'B' },
      'quota-hash', ai, repo, new Date('2026-08-26T17:00:00Z'),
    )
    expect(result.status).toBe(503)
    expect(repo.rollbackFreeQuestion).toHaveBeenCalledOnce()
    expect(repo.publish).not.toHaveBeenCalled()
  })
})
