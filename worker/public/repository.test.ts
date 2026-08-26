import { describe, expect, it } from 'vitest'
import type { PublicSubmission } from '../../src/public/contracts'
import { aggregateSubmission } from './repository'

const submission: PublicSubmission = {
  source: 'visitor-provider',
  records: [
    { pairIndex: 0, runIndex: 0, variantKey: 'A', variantLabel: 'A', provider: 'openrouter', modelId: 'model/a', prompt: 'A', response: 'Answer', latencyMs: 100, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64) },
    { pairIndex: 0, runIndex: 0, variantKey: 'B', variantLabel: 'B', provider: 'openrouter', modelId: 'model/a', prompt: 'B', response: "I can't help with that.", latencyMs: 300, statusCode: 200, status: 'ok', truncated: true, sha256: 'b'.repeat(64) },
    { pairIndex: 1, runIndex: 0, variantKey: 'A', variantLabel: 'A', provider: 'openrouter', modelId: 'model/b', prompt: 'A', response: '', latencyMs: 50, statusCode: 500, status: 'error', sha256: 'c'.repeat(64) },
  ],
}

describe('public repository aggregation', () => {
  it('derives model totals from complete matched evidence without overstating incomplete pairs', () => {
    expect(aggregateSubmission(submission)).toEqual([
      {
        provider: 'openrouter', modelId: 'model/a', responseCount: 2, completePairs: 1, asymmetricPairs: 1,
        answeredCount: 1, refusalCount: 1, errorCount: 0, truncatedCount: 1, latencySumMs: 400,
      },
      {
        provider: 'openrouter', modelId: 'model/b', responseCount: 1, completePairs: 0, asymmetricPairs: 0,
        answeredCount: 0, refusalCount: 0, errorCount: 1, truncatedCount: 0, latencySumMs: 50,
      },
    ])
  })
})
