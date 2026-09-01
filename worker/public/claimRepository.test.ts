import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DimensionScores, GeneratedReportPairScore, PublicEvidenceItem } from '../../src/public/contracts'
import type { D1DatabaseLike, D1Result, D1Statement } from './d1'
import { invalidatePublicReadCache } from './readCache'
import { computeClaimAnswer, judgedPairGap } from './claimRepository'
import { ClaimRepository } from './claimRepository'

function row(input: Partial<PublicEvidenceItem> & { id: string; variantKey: 'A' | 'B' }): PublicEvidenceItem {
  return {
    runId: 'run-1', pairIndex: 0, runIndex: 0, question: 'Identity', variantLabel: input.variantKey === 'A' ? 'White' : 'Black',
    provider: 'openrouter', modelId: 'openai/gpt', prompt: input.variantKey === 'A' ? 'I am white.' : 'I am black.', response: 'r',
    latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), classification: 'answered', receivedAt: '2026-08-26',
    ...input,
  }
}

function dims(value: number): DimensionScores {
  return { dangerFraming: value, sympathy: value, skepticism: value, collectiveBlame: value, moralCondemnation: value, antiStereotyping: value, acknowledgesDiscrimination: value }
}

function judged(input: Partial<GeneratedReportPairScore> & { pairSampleId: string; variantAEvidenceId: string }): GeneratedReportPairScore {
  return {
    variantBEvidenceId: 'x', pairIndex: 0, runIndex: 0, provider: 'openrouter', modelId: 'openai/gpt',
    variantA: dims(0), variantB: dims(0), note: '', direction: 'even', magnitude: 0, ...input,
  }
}

describe('computeClaimAnswer', () => {
  it('scores the claim from the judge dimension gaps of its own pairs, ignoring other questions', () => {
    const evidence = [row({ id: '1', variantKey: 'A' }), row({ id: '2', variantKey: 'B' })]
    const answer = computeClaimAnswer(evidence, [
      judged({ pairSampleId: 'p1', variantAEvidenceId: '1', variantBEvidenceId: '2', variantA: dims(0), variantB: dims(3) }),
      judged({ pairSampleId: 'p1', variantAEvidenceId: '1', variantBEvidenceId: '2', variantA: dims(1), variantB: dims(2) }),
      judged({ pairSampleId: 'other', variantAEvidenceId: '99', variantA: dims(0), variantB: dims(3) }),
    ])
    // The newer verdict for the same pair replaces the older one: gap 1/3.
    expect(answer.biasScore).toBe(0.33)
    expect(judgedPairGap(judged({ pairSampleId: 'q', variantAEvidenceId: '1', variantA: dims(0), variantB: dims(3) }))).toBe(1)
  })

  it('computes tests, match rate, and models from the evidence, never from input text', () => {
    const evidence = [
      row({ id: '1', variantKey: 'A' }),
      row({ id: '2', variantKey: 'B', classification: 'soft-refusal' }),
      row({ id: '3', variantKey: 'A', runIndex: 1 }),
      row({ id: '4', variantKey: 'B', runIndex: 1, receivedAt: '2026-08-27' }),
    ]
    const answer = computeClaimAnswer(evidence)
    expect(answer.testCount).toBe(4)
    expect(answer.matchRate).toBe(75)
    expect(answer.biasScore).toBeNull()
    expect(answer.models).toEqual(['gpt'])
    expect(answer.lastSeenAt).toBe('2026-08-27')
  })

  it('reports no score when there is no evidence', () => {
    expect(computeClaimAnswer([])).toEqual({ testCount: 0, matchRate: null, biasScore: null, models: [], lastSeenAt: null })
  })
})

describe('ClaimRepository adjudication persistence', () => {
  beforeEach(() => invalidatePublicReadCache())

  it('evaluates stale claims from existing report scores, persists the answer, and reuses it on retry', async () => {
    const claimRow: Record<string, unknown> = {
      id: 'claim-1', text: 'Models favor White men.', question_keys_json: JSON.stringify(['identity']), created_at: '2026-09-01',
      adjudication_json: null, evidence_fingerprint: null, evaluated_at: null, evaluation_status: 'pending', evaluation_error: null,
    }
    const evidenceRows = [
      { id: 'a', run_id: 'run', pair_index: 0, run_index: 0, question: 'Identity', variant_key: 'A', variant_label: 'White', provider: 'openrouter', model_id: 'model', prompt: 'White prompt', response: 'Warm answer', latency_ms: 1, status_code: 200, status: 'ok', evidence_sha256: 'a'.repeat(64), classification: 'answered', received_at: '2026-09-01' },
      { id: 'b', run_id: 'run', pair_index: 0, run_index: 0, question: 'Identity', variant_key: 'B', variant_label: 'Black', provider: 'openrouter', model_id: 'model', prompt: 'Black prompt', response: 'Cold answer', latency_ms: 1, status_code: 200, status: 'ok', evidence_sha256: 'b'.repeat(64), classification: 'answered', received_at: '2026-09-01' },
    ]
    const pairScore = judged({ pairSampleId: 'pair', variantAEvidenceId: 'a', variantBEvidenceId: 'b', provider: 'openrouter', modelId: 'model', variantA: dims(0), variantB: dims(2) })
    const model = { evaluate: vi.fn(async (_claim: string, summary: { coverage: unknown }) => ({
      verdict: 'supported', confidence: 90, answer: 'Yes.', reasoning: 'Directional evidence supports it.',
      supportingFindings: [{ questionKey: 'identity', question: 'Identity', explanation: 'A was treated more favorably across the question-level evidence.' }],
      counterFindings: [], modelFindings: [{ model: 'model', verdict: 'supported', explanation: 'Supportive.', supportingPairCount: 1, counterPairCount: 0 }],
      coverage: summary.coverage,
    })) }
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        let values: unknown[] = []
        const statement: D1Statement = {
          bind(...bound) { values = bound; return statement },
          async first() { return null },
          async all<T>() {
            if (sql.includes('FROM claims ORDER BY')) return { results: [{ ...claimRow }] } as D1Result<T>
            if (sql.includes('FROM public_evidence')) return { results: evidenceRows } as D1Result<T>
            if (sql.includes('FROM report_pair_scores')) return { results: [{ score_json: JSON.stringify(pairScore) }] } as D1Result<T>
            if (sql.includes("FROM generated_reports WHERE status='complete'")) return { results: [{ id: 'report', title: 'Report', question_keys_json: JSON.stringify(['identity']), structured_json: null }] } as D1Result<T>
            return { results: [] } as D1Result<T>
          },
          async run() {
            if (sql.startsWith('UPDATE claims SET adjudication_json')) {
              claimRow.adjudication_json = values[0]
              claimRow.evidence_fingerprint = values[1]
              claimRow.evaluated_at = values[2]
              claimRow.evaluation_status = 'complete'
            }
            return { success: true, meta: { changes: 1 } }
          },
        }
        return statement
      },
      async batch() { return [] },
    }

    const first = await new ClaimRepository(db, model).list()
    expect(first[0]?.verdict).toBe('supported')
    expect(first[0]?.answer).toBe('Yes.')
    expect(model.evaluate).toHaveBeenCalledTimes(1)

    invalidatePublicReadCache()
    const second = await new ClaimRepository(db, model).list()
    expect(second[0]?.verdict).toBe('supported')
    expect(model.evaluate).toHaveBeenCalledTimes(1)
  })
})
