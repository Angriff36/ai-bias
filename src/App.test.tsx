/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const completeOAuth = vi.hoisted(() => vi.fn())

vi.mock('./openrouter/oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./openrouter/oauth')>()
  return { ...actual, completeOpenRouterOAuth: completeOAuth }
})

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      health: vi.fn().mockResolvedValue({
        ok: true,
        schemaVersion: 10,
        runtime: 'browser-local',
      }),
      listReports: vi.fn().mockResolvedValue([]),
    },
  }
})

vi.mock('./public/client', () => ({
  getPublicLeaderboard: vi.fn().mockResolvedValue({
    totals: { runs: 0, responses: 0, completePairs: 0, models: 0, questions: 0 },
    topQuestions: [], models: [], latestAnalysis: null, analysisPending: false, latestReport: null, reportPending: false, recentEvidence: [],
  }),
  listGeneratedReports: vi.fn().mockResolvedValue([
    {
      id: 'race-swap-audit-2026-08-26', scope: 'global', status: 'complete',
      title: 'The race-swap audit — Google AI Overview and three frontier LLMs',
      responseCount: 1450, completePairs: 125, modelCount: 4,
      createdAt: '2026-08-26T10:50:25.000Z', completedAt: '2026-08-26T10:50:25.000Z',
    },
  ]),
  listClaims: vi.fn().mockResolvedValue([]),
  createClaim: vi.fn(),
  requestQuestionSetReport: vi.fn(),
  continueReportGeneration: vi.fn(),
}))

describe('application navigation', () => {
  afterEach(cleanup)

  beforeEach(() => {
    completeOAuth.mockReset()
    completeOAuth.mockResolvedValue({ connected: false, returnHash: '' })
    window.history.replaceState({}, '', '/#/reports')
    window.location.hash = '#/reports'
  })

  it('does not expose a database administration screen', async () => {
    render(<App />)

    await screen.findByRole('tab', { name: 'Reports' })
    expect(screen.queryByRole('tab', { name: 'Admin' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset database' })).toBeNull()
  })

  it('exposes top questions and conclusions as primary public sections', async () => {
    window.history.replaceState({}, '', '/#/leaderboard')
    window.location.hash = '#/leaderboard'
    render(<App />)

    expect(await screen.findByRole('tab', { name: 'Top Questions' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Conclusions' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Top Questions' })).toBeTruthy()
  })

  it('shows the public research reports the same in every browser', async () => {
    window.history.replaceState({}, '', '/#/reports')
    window.location.hash = '#/reports'
    render(<App />)

    expect(await screen.findByRole('tab', { name: 'Reports' })).toBeTruthy()
    const link = await screen.findByRole('link', { name: /The race-swap audit/ })
    expect(link.getAttribute('href')).toBe('/api/public/reports/race-swap-audit-2026-08-26.html')
  })

  it('exposes an about section describing what is published and what stays private', async () => {
    window.history.replaceState({}, '', '/#/about')
    window.location.hash = '#/about'
    render(<App />)

    expect(await screen.findByRole('tab', { name: 'About' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'About AI Bias Lab' })).toBeTruthy()
    expect(screen.getByText(/Nothing else is collected, nothing is tracked, nothing is sold\./)).toBeTruthy()
  })

  it('completes the OpenRouter callback and removes the authorization code from the URL', async () => {
    completeOAuth.mockResolvedValue({ connected: true, returnHash: '#/providers' })
    window.history.replaceState({}, '', '/?code=one-time-code#/experiments')

    render(<App />)

    await waitFor(() => expect(completeOAuth).toHaveBeenCalledOnce())
    await screen.findByRole('heading', { name: 'Connect OpenRouter' })
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#/providers')
  })
})
