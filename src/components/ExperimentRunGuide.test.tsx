// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ExperimentRunGuide } from './ExperimentRunGuide'

vi.mock('../public/client', () => ({
  getFreeAllowance: vi.fn(),
}))

import { getFreeAllowance } from '../public/client'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ExperimentRunGuide', () => {
  it('explains free starter runs and OpenRouter setup', async () => {
    vi.mocked(getFreeAllowance).mockResolvedValue({ remaining: 2, dailyRemaining: 250 })

    render(<ExperimentRunGuide />)

    expect(screen.getByRole('heading', { name: 'How to run experiments' })).toBeTruthy()
    expect(await screen.findByText(/2 free matched questions/i)).toBeTruthy()
    expect(screen.getByText(/Free starter model/i)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Connect OpenRouter for live models' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /go to providers/i }).getAttribute('href')).toBe('#/targets')
  })

  it('shows when free allowance is exhausted', async () => {
    vi.mocked(getFreeAllowance).mockResolvedValue({ remaining: 0, dailyRemaining: 250 })

    render(<ExperimentRunGuide />)

    expect(await screen.findByText(/two free matched questions have been used/i)).toBeTruthy()
  })
})
