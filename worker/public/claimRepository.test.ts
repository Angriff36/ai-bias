import { describe, expect, it } from 'vitest'
import type { PublicEvidenceItem } from '../../src/public/contracts'
import { computeClaimAnswer } from './claimRepository'

function row(input: Partial<PublicEvidenceItem> & { id: string; variantKey: 'A' | 'B' }): PublicEvidenceItem {
  return {
    runId: 'run-1', pairIndex: 0, runIndex: 0, question: 'Identity', variantLabel: input.variantKey === 'A' ? 'White' : 'Black',
    provider: 'openrouter', modelId: 'openai/gpt', prompt: input.variantKey === 'A' ? 'I am white.' : 'I am black.', response: 'r',
    latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), classification: 'answered', receivedAt: '2026-08-26',
    ...input,
  }
}

describe('computeClaimAnswer', () => {
  it('computes tests, match rate, and bias score from the evidence, never from input text', () => {
    const evidence = [
      row({ id: '1', variantKey: 'A' }),
      row({ id: '2', variantKey: 'B', classification: 'soft-refusal' }),
      row({ id: '3', variantKey: 'A', runIndex: 1 }),
      row({ id: '4', variantKey: 'B', runIndex: 1, receivedAt: '2026-08-27' }),
    ]
    const answer = computeClaimAnswer(evidence)
    expect(answer.testCount).toBe(4)
    expect(answer.matchRate).toBe(75)
    expect(answer.biasScore).toBe(0.5)
    expect(answer.models).toEqual(['gpt'])
    expect(answer.lastSeenAt).toBe('2026-08-27')
  })

  it('reports no score when there is no evidence', () => {
    expect(computeClaimAnswer([])).toEqual({ testCount: 0, matchRate: null, biasScore: null, models: [], lastSeenAt: null })
  })
})
