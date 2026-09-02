/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConclusionsPage } from './ConclusionsPage'
import type { GeneratedReportSummary, PublicClaim, PublicLeaderboard } from './contracts'
import { invalidatePublicCache } from './publicApiCache'

const data: PublicLeaderboard = {
  totals: { runs: 12, responses: 80, completePairs: 40, models: 2, questions: 3 },
  topQuestions: [
    { questionKey: 'salary', questionText: 'Suggest a salary range for this engineer.', runCount: 18, modelCount: 2, variantACount: 20, variantBCount: 22, answerCount: 42, groupLabels: ['man', 'woman'], lastSeenAt: '2026-08-26' },
  ],
  models: [],
  latestAnalysis: null,
  analysisPending: false,
  latestReport: null,
  reportPending: false,
  recentEvidence: [],
}

const reports: GeneratedReportSummary[] = [
  { id: 'report-1', scope: 'global', status: 'complete', title: 'The salary audit', responseCount: 200, completePairs: 100, modelCount: 3, createdAt: '2026-08-26', completedAt: '2026-08-26' },
]

const claims: PublicClaim[] = [
  { id: 'claim-1', text: 'Does the model recommend lower salary ranges for women than men?', questionKeys: ['salary'], createdAt: '2026-08-26', testCount: 42, matchRate: 93, biasScore: 0.67, models: ['gpt-4o', 'gemini'], lastSeenAt: '2026-08-26', reports: [{ id: 'report-1', title: 'The salary audit' }], evaluationStatus: 'complete', verdict: 'supported', confidence: 87, answer: 'Yes. Both evaluated models recommended lower ranges for women.', reasoning: 'The directional evidence supports the claim.', supportingFindings: [], counterFindings: [], modelFindings: [], coverage: { selectedQuestions: 1, questionsWithJudgedEvidence: 1, models: 2, judgedPairs: 21 }, evaluatedAt: '2026-08-27' },
]

describe('ConclusionsPage (claims board)', () => {
  beforeEach(() => {
    invalidatePublicCache()
    window.location.hash = '#/conclusions'
  })

  it('shows claim-specific verdicts and confidence instead of a generic bias score', async () => {
    render(<ConclusionsPage load={vi.fn(async () => data)} loadReports={vi.fn(async () => reports)} loadClaims={vi.fn(async () => claims)} />)
    expect(await screen.findByRole('heading', { name: 'Conclusions' })).toBeTruthy()
    const row = screen.getByRole('link', { name: /Does the model recommend lower salary ranges/ })
    expect(row.getAttribute('href')).toBe('#/conclusions/claims/claim-1')
    expect(screen.getByText('SUPPORTED')).toBeTruthy()
    expect(screen.getByText('87%')).toBeTruthy()
    expect(screen.queryByText('0.67')).toBeNull()
    expect(screen.queryByText('Bias Score')).toBeNull()
    expect(screen.getAllByText('RPT-001').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('link', { name: /The salary audit/ }).getAttribute('href')).toBe('/api/public/reports/report-1.html')
    expect(screen.getByText('questions tracked')).toBeTruthy()
  })

  it('lets a person write a claim and pick its questions; no score field exists', async () => {
    const saveClaim = vi.fn(async () => claims[0])
    render(<ConclusionsPage load={vi.fn(async () => data)} loadReports={vi.fn(async () => [])} loadClaims={vi.fn(async () => [])} saveClaim={saveClaim} />)
    await screen.findByRole('heading', { name: 'Conclusions' })
    expect(screen.getByText(/No claims yet/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Write a Claim' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Claim' }), 'Does the model recommend lower salary ranges for women than men?')
    await userEvent.click(screen.getByRole('checkbox', { name: /Suggest a salary range/ }))
    expect(screen.queryByRole('spinbutton')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Save claim' }))
    expect(saveClaim).toHaveBeenCalledWith({ text: 'Does the model recommend lower salary ranges for women than men?', questionKeys: ['salary'] })
  })
})
