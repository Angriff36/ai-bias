/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PublicClaim, PublicLeaderboard } from './contracts'
import { ClaimDetailPage } from './ClaimDetailPage'

const claim: PublicClaim = {
  id: 'claim-1', text: 'Do models favor White men?', questionKeys: ['hiring'], createdAt: '2026-09-01',
  testCount: 8, matchRate: 100, biasScore: 0.42, models: ['model-a', 'model-b'], lastSeenAt: '2026-09-01',
  reports: [{ id: 'report-1', title: 'Hiring audit' }], evaluationStatus: 'complete', verdict: 'partially_supported', confidence: 82,
  answer: 'Yes for Model A, but Model B did not show the same pattern.', reasoning: 'The evidence is mixed across models.',
  supportingFindings: [],
  counterFindings: [{
    questionKey: 'hiring', question: 'Recommend a candidate.', direction: 'toward Black relative to White',
    explanation: 'Across all four judged pairs, the question-level result points away from White.', judgedPairCount: 4,
    evidenceIds: ['a', 'b', 'c', 'd'],
    modelEvidence: [
      { model: 'model-a', direction: 'toward Black relative to White', relationship: 'supports', pairCount: 3, evidenceIds: ['a', 'b'] },
      { model: 'model-b', direction: 'toward White relative to Black', relationship: 'counterexample', pairCount: 1, evidenceIds: ['c', 'd'] },
    ],
  }],
  modelFindings: [
    { model: 'model-a', verdict: 'supported', explanation: 'Consistent support.', supportingPairCount: 2, counterPairCount: 0 },
    { model: 'model-b', verdict: 'not_supported', explanation: 'No consistent support.', supportingPairCount: 0, counterPairCount: 2 },
  ],
  coverage: { selectedQuestions: 1, questionsWithJudgedEvidence: 1, models: 2, judgedPairs: 4 }, evaluatedAt: '2026-09-01',
}

const leaderboard: PublicLeaderboard = {
  totals: { runs: 1, responses: 8, completePairs: 4, models: 2, questions: 1 },
  topQuestions: [{ questionKey: 'hiring', questionText: 'Recommend a candidate.', runCount: 4, modelCount: 2, variantACount: 4, variantBCount: 4, answerCount: 8, groupLabels: ['White', 'Black'], lastSeenAt: '2026-09-01' }],
  models: [], latestAnalysis: null, analysisPending: false, latestReport: null, reportPending: false, recentEvidence: [],
}

describe('ClaimDetailPage', () => {
  it('makes the claim answer dominant and presents support, counterevidence, models, questions, and reports', async () => {
    render(<ClaimDetailPage claimId="claim-1" loadClaims={vi.fn(async () => [claim])} load={vi.fn(async () => leaderboard)} />)

    expect(await screen.findByRole('heading', { name: 'Do models favor White men?' })).toBeTruthy()
    expect(screen.getByText('PARTIALLY SUPPORTED')).toBeTruthy()
    expect(screen.getByText('Yes for Model A, but Model B did not show the same pattern.')).toBeTruthy()
    expect(screen.getByText('Confidence 82%')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Supporting evidence' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Counterevidence' })).toBeTruthy()
    expect(screen.getByText('2 models · 4 judged pairs')).toBeTruthy()
    expect(screen.getByText('toward Black relative to White')).toBeTruthy()
    expect(screen.getByText('Counterexample')).toBeTruthy()
    expect(screen.getAllByText('model-b').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('heading', { name: 'Model breakdown' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Questions used' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Hiring audit' }).getAttribute('href')).toBe('/api/public/reports/report-1.html')
    expect(screen.queryByText(/bias score/i)).toBeNull()
  })
})
