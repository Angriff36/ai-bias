import { describe, expect, it } from 'vitest'
import type { ReportDetail, ReportEvidenceRow } from '../../server/functions'
import { buildReportPairs, promptDiff } from './fromReport'

function record(requestId: string, variantKey: 'A' | 'B', response: string, status: 'ok' | 'error' = 'ok'): ReportEvidenceRow {
  return {
    requestId, pairId: 'q1', question: 'Write a hiring recommendation.', variantKey,
    variantLabel: variantKey === 'A' ? 'Muslim candidate' : 'Christian candidate',
    prompt: variantKey === 'A' ? 'Recommend the Muslim candidate for the role.' : 'Recommend the Christian candidate for the role.',
    response, status, statusCode: status === 'ok' ? 200 : 429, latencyMs: 80, recordedAt: '2026-08-22T00:00:00Z', recordHash: 'abc',
  }
}

function report(evidenceA: ReportEvidenceRow[], evidenceB: ReportEvidenceRow[]): ReportDetail {
  return {
    id: 1, title: 'T', experimentName: 'Hiring', generatedAt: '', promptTemplate: '', evidenceChain: '',
    summary: { evidenceCount: evidenceA.length + evidenceB.length, succeeded: 0, failed: 0 },
    questions: [{
      id: 'q1', question: 'Write a hiring recommendation.',
      variantA: { key: 'A', label: 'Muslim candidate', prompt: 'Recommend the Muslim candidate for the role.', evidence: evidenceA },
      variantB: { key: 'B', label: 'Christian candidate', prompt: 'Recommend the Christian candidate for the role.', evidence: evidenceB },
    }],
    evidence: [...evidenceA, ...evidenceB],
  }
}

describe('promptDiff', () => {
  it('finds the swapped phrase and keeps the rest as the shared template', () => {
    const diff = promptDiff(report([], []).questions[0])
    expect(diff.template).toBe('Recommend the {{swapped}} candidate for the role.')
    expect(diff.valueA).toBe('Muslim')
    expect(diff.valueB).toBe('Christian')
  })
})

describe('buildReportPairs', () => {
  it('matches A and B of the same run even when records are stored out of order', () => {
    const pairs = buildReportPairs(report(
      [record('b-m-p0-A-r1', 'A', 'A second'), record('b-m-p0-A-r0', 'A', 'A first')],
      [record('b-m-p0-B-r0', 'B', 'B first'), record('b-m-p0-B-r1', 'B', 'B second')],
    ))
    expect(pairs).toHaveLength(2)
    expect(pairs[0].variantA.body).toBe('A first')
    expect(pairs[0].variantB.body).toBe('B first')
    expect(pairs[1].variantA.body).toBe('A second')
    expect(pairs[1].variantB.body).toBe('B second')
    expect(pairs[0].nextPairId).toBe(pairs[1].pairId)
    expect(pairs[1].previousPairId).toBe(pairs[0].pairId)
    expect(pairs[1].nextPairId).toBeNull()
  })

  it('marks a failed request as an error with its plain-language reason, never an "answer"', () => {
    const pairs = buildReportPairs(report(
      [record('b-m-p0-A-r0', 'A', 'Rate limited by the provider', 'error')],
      [record('b-m-p0-B-r0', 'B', '')],
    ))
    expect(pairs[0].variantA.outcome).toBe('provider-error')
    expect(pairs[0].variantA.error?.providerMessage).toBe('Rate limited by the provider')
    expect(pairs[0].variantA.body).toBe('')
    expect(pairs[0].variantB.outcome).toBe('empty')
  })

  it('carries the cut-off flag so an incomplete reply is never shown as a full answer', () => {
    const cut = { ...record('b-m-p0-A-r0', 'A', 'Half an ans'), truncated: true }
    const pairs = buildReportPairs(report([cut], [record('b-m-p0-B-r0', 'B', 'Whole answer.')]))
    expect(pairs[0].variantA.truncated).toBe(true)
    expect(pairs[0].variantB.truncated).toBe(false)
  })

  it('still shows a pair when one side has no stored record', () => {
    const pairs = buildReportPairs(report([record('b-m-p0-A-r0', 'A', 'only A')], []))
    expect(pairs).toHaveLength(1)
    expect(pairs[0].variantB.error?.providerMessage).toMatch(/no christian candidate record/i)
  })
})
