import { describe, expect, it } from 'vitest'
import type { RawRecord } from '../engine/types'
import { PUBLIC_SUBMIT_CHUNK_BYTES, PublicSubmissionChunks, truncateForPublication } from './publishChunks'

function record(index: number, response: string): RawRecord {
  return {
    requestId: `r${index}`,
    batchId: 'batch',
    pairIndex: index,
    runIndex: 0,
    variantLabel: 'A',
    provider: 'openrouter',
    modelId: 'model',
    prompt: 'prompt',
    response,
    latencyMs: 1,
    statusCode: 200,
    status: 'ok',
    sha256: 'a'.repeat(64),
    persistedAt: 'now',
  }
}

describe('PublicSubmissionChunks', () => {
  it('rehashes truncated evidence so the stored hash describes the published text', async () => {
    const long = 'x'.repeat(40_000)
    const [truncated, intact] = await truncateForPublication([
      record(0, long),
      record(1, 'short answer'),
    ])
    expect(truncated.response.length).toBe(32_000)
    expect(truncated.truncated).toBe(true)
    expect(truncated.sha256).not.toBe('a'.repeat(64))
    const digest = await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(`${'model'} ${'prompt'} ${'x'.repeat(32_000)}`))
    const expected = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(truncated.sha256).toBe(expected)
    expect(intact.sha256).toBe('a'.repeat(64))
    expect(intact.truncated).toBeUndefined()
  })

  it('splits a huge run so each upload stays under the public size cap', () => {
    const bulky = 'x'.repeat(80_000)
    const records = Array.from({ length: 20 }, (_, index) => record(index, bulky))
    const chunks = PublicSubmissionChunks.split(records)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      const bytes = new TextEncoder().encode(JSON.stringify({
        source: 'visitor-provider',
        records: PublicSubmissionChunks.payload(chunk),
      })).length
      expect(bytes).toBeLessThanOrEqual(PUBLIC_SUBMIT_CHUNK_BYTES)
    }
  })

  it('caps each upload at 100 responses', () => {
    const records = Array.from({ length: 150 }, (_, index) => record(index, 'ok'))
    const chunks = PublicSubmissionChunks.split(records)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(100)
    expect(chunks[1]).toHaveLength(50)
  })

  it('skips simulator rows', () => {
    expect(PublicSubmissionChunks.split([{ ...record(0, 'ok'), provider: 'simulated' }])).toEqual([])
  })
})
