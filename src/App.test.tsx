/** @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const completeOAuth = vi.hoisted(() => vi.fn())
const listGeneratedReports = vi.hoisted(() => vi.fn())
const getPublicLeaderboard = vi.hoisted(() => vi.fn())
const health = vi.hoisted(() => vi.fn())

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
      health,
      listReports: vi.fn().mockResolvedValue([]),
    },
  }
})

vi.mock('./public/client', () => ({
  getPublicLeaderboard,
  listGeneratedReports,
  listClaims: vi.fn().mockResolvedValue([]),
  listQuestionProposals: vi.fn().mockResolvedValue([]),
  createQuestionProposal: vi.fn(),
  createClaim: vi.fn(),
  requestQuestionSetReport: vi.fn(),
}))

describe('application navigation', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.useRealTimers()
    completeOAuth.mockReset()
    completeOAuth.mockResolvedValue({ connected: false, returnHash: '' })
    listGeneratedReports.mockReset()
    getPublicLeaderboard.mockReset()
    health.mockReset()
    health.mockResolvedValue({ ok: true, schemaVersion: 10, runtime: 'browser-local' })
    getPublicLeaderboard.mockResolvedValue({
      totals: { runs: 0, responses: 0, completePairs: 0, models: 0, questions: 0 },
      topQuestions: [], models: [], latestAnalysis: null, analysisPending: false, latestReport: null, reportPending: false, recentEvidence: [],
    })
    listGeneratedReports.mockResolvedValue([
      {
        id: 'race-swap-audit-2026-08-26', scope: 'global', status: 'complete',
        title: 'The race-swap audit — Google AI Overview and three frontier LLMs',
        responseCount: 1450, completePairs: 125, modelCount: 4,
        createdAt: '2026-08-26T10:50:25.000Z', completedAt: '2026-08-26T10:50:25.000Z',
      },
    ])
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

  it('does not prefetch the unrelated leaderboard while opening Reports', async () => {
    render(<App />)

    await screen.findByRole('heading', { name: 'Reports' })
    expect(getPublicLeaderboard).not.toHaveBeenCalled()
  })

  it('opens a public route without initializing the private SQL workspace', async () => {
    window.history.replaceState({}, '', '/#/conclusions')
    window.location.hash = '#/conclusions'

    render(<App />)

    await screen.findByRole('heading', { name: 'Conclusions' })
    expect(health).not.toHaveBeenCalled()
  })

  it('polls pending report status without invoking report generation', async () => {
    vi.useFakeTimers()
    listGeneratedReports.mockResolvedValue([
      {
        id: 'pending-report', scope: 'global', status: 'pending',
        title: 'Pending report', responseCount: 0, completePairs: 0, modelCount: 0,
        progress: { completedAnalyses: 6, expectedAnalyses: 12 },
        createdAt: '2026-08-30T15:00:00.000Z', completedAt: null,
      },
    ])
    let unmount: () => void = () => undefined
    await act(async () => {
      unmount = render(<App />).unmount
    })
    expect(screen.getByText(/6 of 12 analyses complete/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    expect(listGeneratedReports).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(listGeneratedReports).toHaveBeenCalledTimes(2)
    await act(async () => {
      unmount()
      await vi.advanceTimersByTimeAsync(100_000)
    })
  })

  it('stops report polling when every report is complete', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<App />) })

    expect(listGeneratedReports).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(listGeneratedReports).toHaveBeenCalledTimes(1)
  })

  it('refreshes a changing pending list through GET polling only', async () => {
    vi.useFakeTimers()
    const reportA = {
      id: 'pending-a', scope: 'global', status: 'pending', title: 'Pending A',
      responseCount: 0, completePairs: 0, modelCount: 0,
      progress: { completedAnalyses: 1, expectedAnalyses: 2 },
      createdAt: '2026-08-30T15:00:00.000Z', completedAt: null,
    }
    const reportB = {
      ...reportA,
      id: 'pending-b',
      title: 'Pending B',
    }
    listGeneratedReports
      .mockResolvedValueOnce([reportA, reportB])
      .mockResolvedValue([reportB])

    await act(async () => {
      render(<App />)
    })
    expect(listGeneratedReports).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(listGeneratedReports).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Pending A')).toBeNull()
  })

  it('clears a transient status error after the next successful poll', async () => {
    vi.useFakeTimers()
    const pending = {
      id: 'pending-report', scope: 'global', status: 'pending', title: null,
      responseCount: 0, completePairs: 0, modelCount: 0,
      progress: { completedAnalyses: 0, expectedAnalyses: 20 },
      createdAt: '2026-08-30T15:00:00.000Z', completedAt: null,
    }
    listGeneratedReports.mockResolvedValue([pending])
    listGeneratedReports.mockRejectedValueOnce(new Error('Request failed (503).')).mockResolvedValue([pending])

    await act(async () => { render(<App />) })
    expect(screen.getByRole('alert').textContent).toContain('Request failed (503).')

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/0 of 20 analyses complete/)).toBeTruthy()
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
