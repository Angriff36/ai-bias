/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { GeneratedReportSummary, PublicLeaderboard } from './contracts'
import { LeaderboardPage } from './LeaderboardPage'

const data: PublicLeaderboard = {
  totals: { runs: 12, responses: 80, completePairs: 40, models: 2 },
  models: [{ provider: 'openrouter', modelId: 'model/a', responseCount: 60, completePairs: 30, asymmetricPairs: 6, asymmetryRate: 0.2, answeredCount: 48, refusalCount: 10, errorCount: 2, truncatedCount: 1, averageLatencyMs: 456, firstSeenAt: '2026-08-20', lastSeenAt: '2026-08-26' }],
  latestAnalysis: { threshold: 25, modelId: 'analysis-model', analysis: 'Model A has the largest current sample.', completedAt: '2026-08-26' },
  analysisPending: false,
  recentEvidence: [
    { id: 'a', runId: 'run-1', pairIndex: 0, runIndex: 0, question: 'Identity', variantKey: 'A', variantLabel: 'white', provider: 'openrouter', modelId: 'model/a', prompt: 'I am white.', response: 'Response A', latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), classification: 'answered', receivedAt: '2026-08-26' },
    { id: 'b', runId: 'run-1', pairIndex: 0, runIndex: 0, question: 'Identity', variantKey: 'B', variantLabel: 'black', provider: 'openrouter', modelId: 'model/a', prompt: 'I am black.', response: 'Response B', latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'b'.repeat(64), classification: 'answered', receivedAt: '2026-08-26' },
  ],
}

describe('LeaderboardPage', () => {
  it('shows aggregate evidence, qualified model analysis, and expandable exact results', async () => {
    const report: GeneratedReportSummary = { id: 'report-1', scope: 'global', status: 'complete', title: 'The public evidence audit', responseCount: 200, completePairs: 100, modelCount: 3, createdAt: '2026-08-26', completedAt: '2026-08-26' }
    render(<LeaderboardPage
      load={vi.fn(async () => data)}
      loadReports={vi.fn(async () => [report])}
    />)
    expect(await screen.findByRole('heading', { name: 'Model leaderboard' })).toBeTruthy()
    expect(screen.getByText('Model breakdown')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Observed results' })).toBeTruthy()
    expect(screen.getByText('Model-generated analysis')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Evidence interpretation' })).toBeTruthy()
    expect(screen.getByText('Research publications')).toBeTruthy()
    expect(screen.getByText('Public evidence log')).toBeTruthy()
    expect(screen.getByText('40')).toBeTruthy()
    expect(screen.getByText('20.0%')).toBeTruthy()
    expect(screen.getByText('Model A has the largest current sample.')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Research reports' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Read report/ }).getAttribute('href')).toBe('/api/public/reports/report-1.html')
    await userEvent.click(screen.getByRole('button', { name: /Identity/ }))
    expect(screen.getByText('I am white.')).toBeTruthy()
    expect(screen.getByText('Response B')).toBeTruthy()
  })

  it('explains the 25-pair threshold before interpretation is available', async () => {
    const belowThreshold: PublicLeaderboard = {
      ...data,
      totals: { ...data.totals, completePairs: 10 },
      models: [],
      latestAnalysis: null,
      analysisPending: false,
      recentEvidence: [],
    }
    render(<LeaderboardPage load={vi.fn(async () => belowThreshold)} loadReports={vi.fn(async () => [])} />)

    expect(await screen.findByRole('heading', { name: 'Evidence interpretation' })).toBeTruthy()
    expect(screen.getByText('Analysis begins after 25 complete matched pairs.')).toBeTruthy()
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
