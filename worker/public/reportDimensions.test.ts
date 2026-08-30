import { describe, expect, it } from 'vitest'
import { aggregateDimensionScores, dimensionDelta } from './reportDimensions'
import type { GeneratedReportPairScore } from '../../src/public/contracts'

const base = {
  dangerFraming: 1,
  sympathy: 1,
  skepticism: 1,
  collectiveBlame: 0,
  moralCondemnation: 0,
  antiStereotyping: 0,
  acknowledgesDiscrimination: 1,
}

describe('reportDimensions', () => {
  it('aggregates pooled and per-model dimension means', () => {
    const pairScores: GeneratedReportPairScore[] = [{
      pairSampleId: 'run-1\u0000q\u00000\u0000openai\u0000gpt',
      variantAEvidenceId: 'a1',
      variantBEvidenceId: 'b1',
      pairIndex: 0, runIndex: 0, provider: 'openai', modelId: 'gpt', note: 'note',
      variantA: base, variantB: { ...base, sympathy: 3 }, direction: 'B', magnitude: 2,
    }]
    const { pooled, byModel } = aggregateDimensionScores(pairScores)
    expect(pooled.pairCount).toBe(1)
    expect(pooled.variantB.sympathy).toBe(3)
    expect(byModel[0]?.modelId).toBe('gpt')
    expect(dimensionDelta(1, 3)).toBe(2)
  })
})

describe('aggregateDimensionScoresByGroup', () => {
  it('averages per group name so a five-group question gets five columns', async () => {
    const { aggregateDimensionScoresByGroup } = await import('./reportDimensions')
    const evidenceRow = (id: string, variantKey: 'A' | 'B', variantLabel: string) => ({
      id, runId: 'run', pairIndex: 0, runIndex: 0, question: 'Q', variantKey, variantLabel, provider: 'p', modelId: 'm', prompt: 'x', response: 'y',
      latencyMs: 1, statusCode: 200, status: 'ok' as const, sha256: 'a'.repeat(64), classification: 'answered' as const, receivedAt: 'now',
    })
    const score = (a: string, b: string, sympathy: number): GeneratedReportPairScore => ({
      pairSampleId: `${a}-${b}`, variantAEvidenceId: a, variantBEvidenceId: b, pairIndex: 0, runIndex: 0, provider: 'p', modelId: 'm',
      variantA: base, variantB: { ...base, sympathy }, note: '', direction: 'B', magnitude: 1,
    })
    const evidence = [evidenceRow('w1', 'A', 'White'), evidenceRow('b1', 'B', 'Black'), evidenceRow('a1', 'B', 'Asian'), evidenceRow('a2', 'B', 'Asian')]
    const groups = aggregateDimensionScoresByGroup([score('w1', 'b1', 3), score('w1', 'a1', 2), score('w1', 'a2', 0)], evidence)
    expect(groups.map((group) => group.label)).toEqual(['White', 'Black', 'Asian'])
    expect(groups[0]?.pairCount).toBe(3)
    expect(groups[1]?.scores.sympathy).toBe(3)
    expect(groups[2]?.scores.sympathy).toBe(1)
  })
})
