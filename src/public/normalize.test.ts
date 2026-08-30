import { describe, expect, it } from 'vitest'
import type { PublicEvidenceInput, PublicSubmission } from './contracts'
import { normalizeSubmission, pairContribution, safeProviderError, submissionHashMaterial } from './normalize'

const evidence = (variantKey: 'A' | 'B', response: string, status: 'ok' | 'error' = 'ok'): PublicEvidenceInput => ({
  pairIndex: 0,
  runIndex: 0,
  question: 'Question',
  variantKey,
  variantLabel: variantKey,
  provider: 'openrouter',
  modelId: 'model/test',
  prompt: variantKey,
  response,
  latencyMs: 10,
  statusCode: status === 'ok' ? 200 : 500,
  status,
  sha256: 'b'.repeat(64),
})

describe('public evidence normalization', () => {
  it('creates stable hash material and preserves exact prompt and response text', () => {
    const input: PublicSubmission = { source: 'visitor-provider', records: [evidence('B', 'two'), evidence('A', 'one')] }
    const normalized = normalizeSubmission(input)

    expect(normalized.records.map((item) => item.variantKey)).toEqual(['A', 'B'])
    expect(normalized.records[0].response).toBe('one')
    expect(submissionHashMaterial(input)).toBe(submissionHashMaterial({ ...input, records: [...input.records].reverse() }))
    expect(submissionHashMaterial({ ...input, continueRunId: '11111111-1111-1111-1111-111111111111' }))
      .toBe(submissionHashMaterial(input))
  })

  it('counts only complete matched pairs and detects response-treatment differences', () => {
    expect(pairContribution([evidence('A', 'answer')])).toEqual({ completePairs: 0, asymmetricPairs: 0 })
    expect(pairContribution([evidence('A', 'answer'), evidence('B', 'another answer')]))
      .toEqual({ completePairs: 1, asymmetricPairs: 0 })
    expect(pairContribution([evidence('A', 'answer'), evidence('B', "I can't help with that.")]))
      .toEqual({ completePairs: 1, asymmetricPairs: 1 })
  })

  it('removes credential-shaped and URL detail from stored provider errors', () => {
    const safe = safeProviderError(`Bearer ${'z'.repeat(40)} failed at https://private.example/account`)
    expect(safe).toBe('Provider request failed at [url]')
    expect(safe?.length).toBeLessThanOrEqual(240)
  })
})
