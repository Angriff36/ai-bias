/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ConclusionsPage } from './ConclusionsPage'

describe('ConclusionsPage', () => {
  it('stays empty and sends the visitor to top questions', async () => {
    window.location.hash = '#/conclusions'
    render(<ConclusionsPage />)
    expect(screen.getByRole('heading', { name: 'Conclusions' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'No conclusions yet' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Question \d+/ })).toBeNull()
    expect(screen.queryByText('questions tracked')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Open Top Questions' }))
    expect(window.location.hash).toBe('#/leaderboard')
  })
})
