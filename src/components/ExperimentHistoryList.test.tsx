// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api, type ExperimentPage } from '../api'
import { ExperimentHistoryList } from './ExperimentHistoryList'

vi.mock('../api', () => ({
  api: {
    listExperiments: vi.fn(),
    listTargets: vi.fn(),
    cascadeCounts: vi.fn(),
    deleteExperiment: vi.fn(),
    importExperiment: vi.fn(),
  },
  ServerError: class ServerError extends Error {
    status = 500
  },
}))

vi.mock('../public/client', () => ({
  getFreeAllowance: vi.fn().mockResolvedValue({ remaining: 2, dailyRemaining: 250 }),
}))

const indexPage: ExperimentPage = {
  total: 1,
  summary: { experimentCount: 1, evidenceCount: 1482, modelCount: 3, runCount: 12 },
  rows: [{
    id: 8,
    name: 'Large racial framing audit',
    status: 'complete',
    asymmetry_level: 'none',
    created_at: '2026-08-20 12:00:00',
    last_run_at: '2026-08-25 12:00:00',
    variant_count: 120,
    pair_count: 60,
    run_count: 12,
    evidence_count: 1482,
    model_ids: ['gpt-5.6-luna', 'claude-opus-4-8', 'google/gemini-3.5-flash'],
    is_synthetic: false,
  }],
}

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState(null, '', '/#/experiments')
  Element.prototype.scrollIntoView = vi.fn()
  vi.mocked(api.listTargets).mockResolvedValue([])
  vi.mocked(api.listExperiments).mockResolvedValue(indexPage)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('experiments evidence dashboard', () => {
  it('leads with real research evidence instead of CRUD status columns', async () => {
    render(<ExperimentHistoryList />)

    expect(await screen.findByRole('heading', { name: 'Experiments' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'How to run experiments' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Evidence overview' }).textContent).toContain('1,482')
    expect(screen.getByRole('heading', { name: 'Large racial framing audit' })).toBeTruthy()
    expect(screen.getByText(/60 matched pairs/)).toBeTruthy()
    expect(screen.getByText(/3 models/)).toBeTruthy()
    expect(screen.getByText(/1,482 responses/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /view results/i }).getAttribute('href')).toBe('#/experiments/8')
    expect(screen.queryByText(/asymmetry:\s*none/i)).toBeNull()
  })

  it('keeps advanced filters collapsed until requested', async () => {
    render(<ExperimentHistoryList />)
    await screen.findByRole('heading', { name: 'Large racial framing audit' })

    expect(screen.queryByRole('group', { name: 'Advanced filters' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /^filters/i }))
    expect(screen.getByRole('group', { name: 'Advanced filters' })).toBeTruthy()
  })
})
