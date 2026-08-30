import { describe, expect, it } from 'vitest'
import { UnsavedRunRecovery } from './unsavedRunRecovery'
import type { RawRecord } from './types'

function record(batchId: string, requestId: string): RawRecord {
  return {
    requestId,
    batchId,
    pairIndex: 0,
    runIndex: 0,
    variantLabel: 'A',
    provider: 'openrouter',
    modelId: 'test',
    prompt: 'p',
    response: 'r',
    latencyMs: 1,
    statusCode: 200,
    status: 'ok',
    sha256: 'a'.repeat(64),
    persistedAt: '2026-08-29T00:00:00.000Z',
  }
}

describe('UnsavedRunRecovery', () => {
  it('picks the largest batch still in this browser', () => {
    const batch = UnsavedRunRecovery.latestBatch([
      record('old', '1'),
      record('huge', '2'),
      record('huge', '3'),
      record('huge', '4'),
    ])
    expect(batch).toHaveLength(3)
    expect(batch.every((row) => row.batchId === 'huge')).toBe(true)
  })

  it('offers a save only when this browser has more finished responses than the experiment', () => {
    expect(UnsavedRunRecovery.shouldOffer([record('a', '1')], 0)).toBe(true)
    expect(UnsavedRunRecovery.shouldOffer([record('a', '1')], 1)).toBe(false)
    expect(UnsavedRunRecovery.shouldOffer([], 0)).toBe(false)
  })
})
