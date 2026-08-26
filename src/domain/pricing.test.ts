import { describe, expect, it } from 'vitest'
import { estimateRunCost, estimateTokens, ESTIMATED_OUTPUT_TOKENS } from './pricing'

describe('run cost estimates', () => {
  it('estimates prompt tokens from text length using a transparent approximation', () => {
    expect(estimateTokens('123456789')).toBe(3)
    expect(estimateTokens('')).toBe(1)
  })

  it('sums priced targets and reports targets without pricing separately', () => {
    const estimate = estimateRunCost({
      promptTexts: ['a'.repeat(400), 'b'.repeat(800)],
      repeats: 2,
      targetPricings: [
        { promptPerToken: 0.000001, completionPerToken: 0.000002 },
        undefined,
      ],
    })

    expect(estimate.requests).toBe(8)
    expect(estimate.promptTokens).toBe(300)
    expect(estimate.completionTokens).toBe(2 * ESTIMATED_OUTPUT_TOKENS)
    expect(estimate.pricedTargets).toBe(1)
    expect(estimate.unpricedTargets).toBe(1)
    expect(estimate.estimatedCost).toBeCloseTo(
      (300 * 2) * 0.000001 + (2 * ESTIMATED_OUTPUT_TOKENS * 2) * 0.000002,
    )
  })
})
