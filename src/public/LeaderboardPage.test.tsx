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
    { questionKey: 'identity', questionText: 'Identity', runCount: 18, modelCount: 2, lastSeenAt: '2026-08-26' },
    { questionKey: 'hiring', questionText: 'Write a hiring recommendation.', runCount: 12, modelCount: 1, lastSeenAt: '2026-08-25' },
  ],
  models: [],
  latestAnalysis: null,
  analysisPending: false,
  latestReport: { id: 'report-aggregate', scope: 'global', status: 'complete', title: 'The public evidence audit', responseCount: 200, completePairs: 100, modelCount: 3, createdAt: '2026-08-26', completedAt: '2026-08-26' },
  reportPending: false,
  recentEvidence: [],
}

describe('LeaderboardPage', () => {
  beforeEach(() => {
    invalidatePublicCache()
  })

  it('shows top questions, how-it-works guidance, and aggregate reports', async () => {
    const report: GeneratedReportSummary = { id: 'report-1', scope: 'global', status: 'complete', title: 'The public evidence audit', responseCount: 200, completePairs: 100, modelCount: 3, createdAt: '2026-08-26', completedAt: '2026-08-26' }
    render(<LeaderboardPage
      load={vi.fn(async () => data)}
      loadReports={vi.fn(async () => [report])}
    />)
    expect(await screen.findByRole('heading', { name: 'Question leaderboard' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'How this works' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Top questions' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Identity' }).getAttribute('href')).toBe('#/leaderboard/questions/identity')
    expect(screen.getByRole('link', { name: /Read the latest aggregate report/ }).getAttribute('href')).toBe('/api/public/reports/report-aggregate.html')
    expect(await screen.findByRole('heading', { name: 'Research reports' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Read report/ }).getAttribute('href')).toBe('/api/public/reports/report-1.html')
  })

  it('explains the threshold before an aggregate report is available', async () => {
    const belowThreshold: PublicLeaderboard = {
      ...data,
      totals: { ...data.totals, completePairs: 10, questions: 1 },
      topQuestions: [{ questionKey: 'identity', questionText: 'Identity', runCount: 4, modelCount: 1, lastSeenAt: '2026-08-26' }],
      latestReport: null,
      reportPending: false,
    }
    render(<LeaderboardPage load={vi.fn(async () => belowThreshold)} loadReports={vi.fn(async () => [])} />)

    expect(await screen.findByRole('heading', { name: 'Research reports' })).toBeTruthy()
    expect(screen.getByText(/generated automatically at certain thresholds/)).toBeTruthy()
  })

  it('offers a retry when the public evidence service fails', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(data)
    const loadReports = vi.fn().mockResolvedValue([])
    render(<LeaderboardPage load={load} loadReports={loadReports} />)
    expect((await screen.findByRole('alert')).textContent).toContain('offline')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('link', { name: 'Identity' })).toBeTruthy()
  })
})
