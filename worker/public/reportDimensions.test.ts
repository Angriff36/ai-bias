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
