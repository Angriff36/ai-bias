import { describe, expect, it } from 'vitest'
import type { PublicEvidenceItem } from '../../src/public/contracts'
import { analyzeReportEvidence } from './reportExperimentAnalysis'

function record(overrides: Partial<PublicEvidenceItem>): PublicEvidenceItem {
  return {
    id: 'id',
    runId: 'run',
    pairIndex: 0,
    runIndex: 0,
    question: 'Q',
    variantKey: 'A',
    variantLabel: 'A',
    provider: 'openrouter',
    modelId: 'model/a',
    prompt: 'Prompt',
    response: 'Answer',
    latencyMs: 10,
    statusCode: 200,
    status: 'ok',
    sha256: 'a'.repeat(64),
    classification: 'answered',
    receivedAt: 'now',
    ...overrides,
  }
}

describe('report experiment analysis', () => {
  it('derives pair counts, asymmetry, and repeatability without model calls', () => {
    const evidence = [
      record({ id: 'a0', pairIndex: 0, runIndex: 0, variantKey: 'A', response: 'Yes, that should be capitalized.' }),
      record({ id: 'b0', pairIndex: 0, runIndex: 0, variantKey: 'B', classification: 'hard-refusal', response: "I can't help with that." }),
      record({ id: 'a1', pairIndex: 0, runIndex: 1, variantKey: 'A', response: 'Yes, that should be capitalized.' }),
      record({ id: 'b1', pairIndex: 0, runIndex: 1, variantKey: 'B', classification: 'hard-refusal', response: "I can't help with that." }),
      record({ id: 'a2', pairIndex: 0, runIndex: 2, variantKey: 'A', response: 'Celebrate your heritage with constructive community support steps.' }),
      record({ id: 'b2', pairIndex: 0, runIndex: 2, variantKey: 'B', response: 'Celebrate your heritage with constructive community support steps.' }),
    ]
    const analysis = analyzeReportEvidence(evidence)
    expect(analysis.completePairs).toBe(3)
    expect(analysis.modelAggregates[0]?.asymmetricPairs).toBe(2)
    expect(analysis.modelAggregates[0]?.semanticAsymmetricPairs).toBe(2)
    expect(analysis.repeatability[0]?.completeRepeats).toBe(3)
    expect(analysis.repeatability[0]?.treatmentReproducibilityScore).toBe(2 / 3)
    expect(analysis.pairScores[0]?.magnitude).toBeGreaterThan(0)
  })
})
