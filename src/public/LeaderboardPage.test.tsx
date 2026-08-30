/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedReportSummary, PublicLeaderboard } from './contracts'
import { LeaderboardPage } from './LeaderboardPage'
import { invalidatePublicCache } from './publicApiCache'

const data: PublicLeaderboard = {
  totals: { runs: 12, responses: 80, completePairs: 40, models: 2, questions: 3 },
  topQuestions: [
    { questionKey: 'identity', questionText: 'Identity', runCount: 18, modelCount: 2, variantACount: 2, variantBCount: 2, lastSeenAt: '2026-08-26' },
    { questionKey: 'hiring', questionText: 'Write a hiring recommendation.', runCount: 12, modelCount: 1, variantACount: 2, variantBCount: 2, lastSeenAt: '2026-08-25' },
  ],
  models: [],
  latestAnalysis: null,
  analysisPending: false,
  latestReport: { id: 'report-aggregate', scope: 'global', status: 'complete', title: 'The public evidence audit', responseCount: 200, completePairs: 100, modelCount: 3, createdAt: '2026-08-26', completedAt: '2026-08-26' },
  reportPending: false,
  recentEvidence: [],
}

const reports: GeneratedReportSummary[] = [
  { id: 'report-aggregate', scope: 'global', status: 'complete', title: 'The public evidence audit', responseCount: 200, completePairs: 100, modelCount: 3, createdAt: '2026-08-26', completedAt: '2026-08-26' },
]

describe('LeaderboardPage', () => {
  beforeEach(() => {
    invalidatePublicCache()
    window.location.hash = '#/leaderboard'
  })

  it('shows ranked questions, report cards, and question links', async () => {
    render(<LeaderboardPage load={vi.fn(async () => data)} loadReports={vi.fn(async () => reports)} />)
    expect(await screen.findByRole('heading', { name: 'Top Questions' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'How this works' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Identity/ }).getAttribute('href')).toBe('#/leaderboard/questions/identity')
    expect(screen.getByRole('link', { name: /The public evidence audit/ }).getAttribute('href')).toBe('/api/public/reports/report-aggregate.html')
    expect(screen.getByText('questions tracked')).toBeTruthy()
  })

  it('opens the experiment workspace from submit a prompt', async () => {
    render(<LeaderboardPage load={vi.fn(async () => data)} loadReports={vi.fn(async () => [])} />)
    await screen.findByRole('heading', { name: 'Top Questions' })
    await userEvent.click(screen.getByRole('button', { name: 'Submit a Prompt' }))
    expect(window.location.hash).toBe('#/experiments')
  })

  it('limits the list to 20, 50, or 100 questions', async () => {
    const many: PublicLeaderboard = {
      ...data,
      totals: { ...data.totals, questions: 25 },
      topQuestions: Array.from({ length: 25 }, (_, index) => ({
        questionKey: `q-${index}`,
        questionText: `Question ${index}`,
        runCount: 25 - index,
        modelCount: 1, variantACount: 2, variantBCount: 2,
        lastSeenAt: '2026-08-26',
      })),
    }
    render(<LeaderboardPage load={vi.fn(async () => many)} loadReports={vi.fn(async () => [])} />)
    expect(await screen.findByRole('button', { name: 'Show top 20', pressed: true })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /Question \d+/ })).toHaveLength(20)
    await userEvent.click(screen.getByRole('button', { name: 'Show top 50' }))
    expect(screen.getAllByRole('link', { name: /Question \d+/ })).toHaveLength(25)
  })

  it('offers a retry when the public evidence service fails', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(data)
    render(<LeaderboardPage load={load} loadReports={vi.fn(async () => [])} />)
    expect((await screen.findByRole('alert')).textContent).toContain('offline')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('link', { name: /Identity/ })).toBeTruthy()
  })
})
