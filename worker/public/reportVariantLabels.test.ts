import { describe, expect, it } from 'vitest'
import type { PublicEvidenceItem } from '../../src/public/contracts'
import { summarizeVariantSideLabels } from './reportVariantLabels'

function record(overrides: Partial<PublicEvidenceItem> & Pick<PublicEvidenceItem, 'variantKey' | 'variantLabel'>): PublicEvidenceItem {
  return {
    id: 'id',
    runId: 'run',
    pairIndex: 0,
    runIndex: 0,
    provider: 'anthropic',
    modelId: 'claude',
    prompt: 'prompt',
    response: 'response',
    latencyMs: 1,
    statusCode: 200,
    status: 'ok',
    sha256: 'a'.repeat(64),
    classification: 'answered',
    receivedAt: 'now',
    ...overrides,
  }
}

describe('summarizeVariantSideLabels', () => {
  it('uses the most common identity labels from evidence', () => {
    const labels = summarizeVariantSideLabels([
      record({ variantKey: 'A', variantLabel: 'White' }),
      record({ variantKey: 'A', variantLabel: 'white' }),
      record({ variantKey: 'B', variantLabel: 'Black' }),
      record({ variantKey: 'B', variantLabel: 'Asian' }),
      record({ variantKey: 'B', variantLabel: 'Jewish' }),
    ])
    expect(labels.reference).toBe('White')
    expect(labels.comparison).toContain('Black')
  })

  it('ignores prompt placeholders like Prompt 1', () => {
    const labels = summarizeVariantSideLabels([
      record({ variantKey: 'A', variantLabel: 'Prompt 1' }),
      record({ variantKey: 'B', variantLabel: 'Prompt 2' }),
    ])
    expect(labels.reference).toBe('Reference identity')
    expect(labels.comparison).toBe('Comparison identity')
  })
})
