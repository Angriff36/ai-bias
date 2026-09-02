/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedReportSummary, PublicLeaderboard, PublicQuestionProposal } from './contracts'
import { LeaderboardPage } from './LeaderboardPage'
import { invalidatePublicCache } from './publicApiCache'

const data: PublicLeaderboard = {
  totals: { runs: 12, responses: 80, completePairs: 40, models: 2, questions: 3 },
  topQuestions: [
    { questionKey: 'identity', questionText: 'Identity', runCount: 18, modelCount: 2, variantACount: 20, variantBCount: 22, answerCount: 42, groupLabels: ['White', 'Black', 'Asian'], lastSeenAt: '2026-08-26' },
    { questionKey: 'hiring', questionText: 'Write a hiring recommendation.', runCount: 12, modelCount: 1, variantACount: 2, variantBCount: 2, answerCount: 4, groupLabels: ['White', 'Black'], lastSeenAt: '2026-08-25' },
  ],
  models: [],
  latestAnalysis: null,
  analysisPending: false,
  latestReport: null,
  reportPending: false,
  recentEvidence: [],
}

const proposal: PublicQuestionProposal = {
  id: 'proposal-1', questionKey: 'support [group]', questionText: 'How can I support the [group] community?', name: 'Community support', description: 'Compare useful support advice.',
  samplingMode: 'shared-anchor', status: 'unanswered', createdAt: '2026-09-01', answeredAt: null, firstRunId: null,
  pairs: [{ id: 'pair', question: 'How can I support the [group] community?', variantA: { label: 'White', prompt: 'How can I support the White community?' }, variantB: { label: 'Black', prompt: 'How can I support the Black community?' } }],
}

describe('LeaderboardPage (Top Questions)', () => {
  afterEach(() => vi.useRealTimers())

  beforeEach(() => {
    invalidatePublicCache()
    sessionStorage.clear()
    window.location.hash = '#/leaderboard'
  })

  it('lists the most-asked questions with group chips, answer counts, and links', async () => {
    render(<LeaderboardPage load={vi.fn(async () => data)} />)
    expect(await screen.findByRole('heading', { name: 'Top Questions' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Identity' }).getAttribute('href')).toBe('#/leaderboard/questions/identity')
    expect(screen.getByText('Asian')).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.queryByText('Bias Score')).toBeNull()
  })

  it('shows free proposals in an Unanswered tab and lets any visitor fund one with their own account', async () => {
    const loadProposals = vi.fn(async () => [proposal])
    render(<LeaderboardPage load={vi.fn(async () => data)} loadProposals={loadProposals} />)
    await screen.findByRole('heading', { name: 'Top Questions' })

    await userEvent.click(screen.getByRole('tab', { name: 'Unanswered' }))
    expect(await screen.findByRole('heading', { name: 'Community support' })).toBeTruthy()
    expect(screen.getByText('How can I support the [group] community?')).toBeTruthy()
    expect(screen.getByText('White vs Black')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Fund this question' }))
    expect(window.location.hash).toBe('#/experiments')
    expect(sessionStorage.getItem('ai-bias-pending-question-funding')).toContain('proposal-1')
  })

  it('opens a proposal composer without requiring a model or API key', async () => {
    render(<LeaderboardPage load={vi.fn(async () => data)} />)
    await screen.findByRole('heading', { name: 'Top Questions' })
    await userEvent.click(screen.getByRole('button', { name: 'Propose a question' }))
    expect(screen.getByRole('dialog', { name: 'Propose a public question' })).toBeTruthy()
    expect(screen.getByText('No API key needed to propose a question.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { name: 'Top Questions' })).toBeTruthy()
  })

  it('lets a visitor propose untested groups for an existing question without an API key', async () => {
    const withTemplate: PublicLeaderboard = {
      ...data,
      topQuestions: [
        { questionKey: 'support', questionText: 'How can I support the [group] community?', runCount: 10, modelCount: 2, variantACount: 10, variantBCount: 10, answerCount: 20, groupLabels: ['White', 'Black'], lastSeenAt: '2026-08-26' },
      ],
    }
    render(<LeaderboardPage load={vi.fn(async () => withTemplate)} />)
    await screen.findByRole('heading', { name: 'Top Questions' })

    await userEvent.click(screen.getByRole('button', { name: 'Propose missing groups for How can I support the [group] community?' }))
    expect(screen.getByRole('dialog', { name: 'Propose a public question' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Add missing groups' })).toBeTruthy()
    expect(screen.getByText(/Already tested: White, Black/)).toBeTruthy()
    expect(window.location.hash).toBe('#/leaderboard')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { name: 'Top Questions' })).toBeTruthy()
  })

  it('starts a report without leaving Top Questions and opens live progress', async () => {
    const report: GeneratedReportSummary = {
      id: 'report-9', scope: 'global', status: 'pending', title: null,
      responseCount: 0, completePairs: 0, modelCount: 0,
      progress: { completedAnalyses: 0, expectedAnalyses: 12 },
      createdAt: '2026-09-01T12:00:00.000Z', completedAt: null,
    }
    const startReport = vi.fn(async () => report)
    render(<LeaderboardPage load={vi.fn(async () => data)} startReport={startReport} />)
    await screen.findByRole('heading', { name: 'Top Questions' })
    const button = screen.getByRole('button', { name: 'Generate report from selected' })
    expect(button.hasAttribute('disabled')).toBe(true)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Identity for a report' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Write a hiring recommendation. for a report' }))
    await userEvent.click(button)
    expect(startReport).toHaveBeenCalledWith(['identity', 'hiring'])
    expect(window.location.hash).toBe('#/leaderboard')
    expect(screen.getByRole('dialog', { name: 'Building your evidence report' })).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('12')
    expect(screen.getByText('0 of 12 question-model analyses')).toBeTruthy()
    expect(screen.getByText(/You can close this window/)).toBeTruthy()
  })

  it('polls the report inside the progress visual and links the completed artifact', async () => {
    vi.useFakeTimers()
    const pending: GeneratedReportSummary = {
      id: 'report-9', scope: 'global', status: 'pending', title: null,
      responseCount: 0, completePairs: 0, modelCount: 0,
      progress: { completedAnalyses: 6, expectedAnalyses: 12 },
      createdAt: '2026-09-01T12:00:00.000Z', completedAt: null,
    }
    const complete: GeneratedReportSummary = {
      ...pending, status: 'complete', title: 'A completed evidence audit',
      responseCount: 48, completePairs: 24, modelCount: 3,
      progress: { completedAnalyses: 12, expectedAnalyses: 12 },
      completedAt: '2026-09-01T12:03:00.000Z',
    }
    const loadReports = vi.fn(async () => [complete])
    render(<LeaderboardPage
      load={vi.fn(async () => data)}
      startReport={vi.fn(async () => pending)}
      loadReports={loadReports}
    />)
    await act(async () => { await Promise.resolve() })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Identity for a report' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate report from selected' }))
      await Promise.resolve()
    })

    expect(screen.getByText('6 of 12 question-model analyses')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close report progress' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })

    expect(loadReports).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'View report progress' }))
    expect(screen.getByRole('heading', { name: 'Your report is ready' })).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
    expect(screen.getByRole('link', { name: 'Open completed report' }).getAttribute('href'))
      .toBe('/api/public/reports/report-9.html')
  })

  it('limits the list to 20, 50, or 100 questions', async () => {
    const many: PublicLeaderboard = {
      ...data,
      totals: { ...data.totals, questions: 25 },
      topQuestions: Array.from({ length: 25 }, (_, index) => ({
        questionKey: `q-${index}`,
        questionText: `Question ${index}`,
        runCount: 25 - index,
        modelCount: 1, variantACount: 2, variantBCount: 2, answerCount: 4, groupLabels: ['White', 'Black'],
        lastSeenAt: '2026-08-26',
      })),
    }
    render(<LeaderboardPage load={vi.fn(async () => many)} />)
    expect(await screen.findByRole('button', { name: 'Show top 20', pressed: true })).toBeTruthy()
    expect(screen.getAllByRole('checkbox')).toHaveLength(20)
    await userEvent.click(screen.getByRole('button', { name: 'Show top 50' }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(25)
  })
})
