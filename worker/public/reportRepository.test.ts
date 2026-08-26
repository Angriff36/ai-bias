import { describe, expect, it } from 'vitest'
import type { PublicEvidenceItem } from '../../src/public/contracts'
import { completeQuestionCount, reportEvidenceHashMaterial, summarizeReportModels } from './reportRepository'

const record = (overrides: Partial<PublicEvidenceItem>): PublicEvidenceItem => ({
  id: 'evidence-a', runId: 'run-a', pairIndex: 0, runIndex: 0, variantKey: 'A', variantLabel: 'Prompt A',
  provider: 'openrouter', modelId: 'model/a', prompt: 'Prompt A', response: 'Answered', latencyMs: 10,
  statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), classification: 'answered', receivedAt: '2026-08-26T00:00:00.000Z',
  ...overrides,
})

describe('generated report evidence preparation', () => {
  it('counts a question only when one model repeat has both variants', () => {
    const evidence = [
      record({ id: 'a0', pairIndex: 0, variantKey: 'A' }),
      record({ id: 'b0', pairIndex: 0, variantKey: 'B' }),
      record({ id: 'a1', pairIndex: 1, variantKey: 'A' }),
      record({ id: 'b1-other-model', pairIndex: 1, variantKey: 'B', modelId: 'model/b' }),
    ]
    expect(completeQuestionCount(evidence)).toBe(1)
  })

  it('summarizes refusal, error, truncation, and complete-pair evidence per model', () => {
    const evidence = [
      record({ id: 'a', variantKey: 'A' }),
      record({ id: 'b', variantKey: 'B', classification: 'hard-refusal', truncated: true }),
      record({ id: 'c', pairIndex: 1, modelId: 'model/b', status: 'error', classification: 'error' }),
    ]
    expect(summarizeReportModels(evidence)).toEqual([
      { provider: 'openrouter', modelId: 'model/a', responses: 2, completePairs: 1, refusals: 1, errors: 0, truncated: 1 },
      { provider: 'openrouter', modelId: 'model/b', responses: 1, completePairs: 0, refusals: 0, errors: 1, truncated: 0 },
    ])
  })

  it('uses ordered evidence hashes for a stable versioned snapshot identity', () => {
    const a = record({ id: 'z', sha256: 'b'.repeat(64) })
    const b = record({ id: 'a', sha256: 'a'.repeat(64) })
    expect(reportEvidenceHashMaterial([a, b])).toBe('report-schema:1\na:' + 'a'.repeat(64) + '\nz:' + 'b'.repeat(64))
    expect(reportEvidenceHashMaterial([b, a])).toBe(reportEvidenceHashMaterial([a, b]))
  })
})
