/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { GeneratedReportSummary, PublicLeaderboard } from './contracts'
import { LeaderboardPage } from './LeaderboardPage'

const data: PublicLeaderboard = {
  totals: { runs: 12, responses: 80, completePairs: 40, models: 2 },
  models: [{ provider: 'openrouter', modelId: 'model/a', responseCount: 60, completePairs: 30, asymmetricPairs: 6, asymmetryRate: 0.2, answeredCount: 48, refusalCount: 10, errorCount: 2, truncatedCount: 1, averageLatencyMs: 456, firstSeenAt: '2026-08-20', lastSeenAt: '2026-08-26' }],
  latestAnalysis: null,
  analysisPending: false,
  latestReport: { id: 'report-aggregate', scope: 'global', status: 'complete', title: 'The public evidence audit', responseCount: 200, completePairs: 100, modelCount: 3, createdAt: '2026-08-26', completedAt: '2026-08-26' },
  reportPending: false,
  recentEvidence: [
    { id: 'a', runId: 'run-1', pairIndex: 0, runIndex: 0, question: 'Identity', variantKey: 'A', variantLabel: 'white', provider: 'openrouter', modelId: 'model/a', prompt: 'I am white.', response: 'Response A', latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), classification: 'answered', receivedAt: '2026-08-26' },
    { id: 'b', runId: 'run-1', pairIndex: 0, runIndex: 0, question: 'Identity', variantKey: 'B', variantLabel: 'black', provider: 'openrouter', modelId: 'model/a', prompt: 'I am black.', response: 'Response B', latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'b'.repeat(64), classification: 'answered', receivedAt: '2026-08-26' },
  ],
}

describe('LeaderboardPage', () => {
  it('shows aggregate evidence, links to the dimension-scored report, and expandable exact results', async () => {
    const report: GeneratedReportSummary = { id: 'report-1', scope: 'global', status: 'complete', title: 'The public evidence audit', responseCount: 200, completePairs: 100, modelCount: 3, createdAt: '2026-08-26', completedAt: '2026-08-26' }
    render(<LeaderboardPage
      load={vi.fn(async () => data)}
      loadReports={vi.fn(async () => [report])}
    />)
    expect(await screen.findByRole('heading', { name: 'Model leaderboard' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Observed results' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Evidence interpretation' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Read the full research report/ }).getAttribute('href')).toBe('/api/public/reports/report-aggregate.html')
    expect(await screen.findByRole('heading', { name: 'Research reports' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Read report/ }).getAttribute('href')).toBe('/api/public/reports/report-1.html')
    await userEvent.click(screen.getByRole('button', { name: /Identity/ }))
    expect(screen.getByText('I am white.')).toBeTruthy()
    expect(screen.getByText('Response B')).toBeTruthy()
  })

  it('explains the threshold before an aggregate report is available', async () => {
    const belowThreshold: PublicLeaderboard = {
      ...data,
      totals: { ...data.totals, completePairs: 10 },
      models: [],
      latestReport: null,
      reportPending: false,
      recentEvidence: [],
    }
    render(<LeaderboardPage load={vi.fn(async () => belowThreshold)} loadReports={vi.fn(async () => [])} />)

    expect(await screen.findByRole('heading', { name: 'Evidence interpretation' })).toBeTruthy()
    expect(screen.getByText(/mature matched questions accumulate across multiple models/)).toBeTruthy()
  })

  it('offers a retry when the public evidence service fails', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(data)
    render(<LeaderboardPage load={load} />)
    expect((await screen.findByRole('alert')).textContent).toContain('offline')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('model/a')).toBeTruthy()
  })
})
