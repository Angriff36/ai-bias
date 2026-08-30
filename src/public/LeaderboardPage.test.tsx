/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicLeaderboard } from './contracts'
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

describe('LeaderboardPage (Top Questions)', () => {
  beforeEach(() => {
    invalidatePublicCache()
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

  it('starts a report over the selected questions and opens Reports', async () => {
    const startReport = vi.fn(async () => ({ id: 'report-9' }))
    render(<LeaderboardPage load={vi.fn(async () => data)} startReport={startReport} />)
    await screen.findByRole('heading', { name: 'Top Questions' })
    const button = screen.getByRole('button', { name: 'Generate report from selected' })
    expect(button.hasAttribute('disabled')).toBe(true)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Identity for a report' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Write a hiring recommendation. for a report' }))
    await userEvent.click(button)
    expect(startReport).toHaveBeenCalledWith(['identity', 'hiring'])
    expect(window.location.hash).toBe('#/reports')
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
