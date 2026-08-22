// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ObservationsPanel } from './ObservationsPanel'

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('recording a manual observation', () => {
  it('refuses an observation with no product name and says why', async () => {
    render(<ObservationsPanel />)

    await userEvent.type(screen.getByLabelText(/prompt you entered/i), 'Tell me a joke')
    await userEvent.click(screen.getByRole('button', { name: /record observation/i }))

    expect(screen.getByRole('alert').textContent).toMatch(/name the ai product/i)
    expect(screen.queryByTestId('observation-item')).toBeNull()
  })

  it('stores the observation, shows its hash, and survives a reload', async () => {
    const { unmount } = render(<ObservationsPanel />)

    await userEvent.type(screen.getByLabelText(/ai product tested/i), 'ChatGPT')
    await userEvent.type(screen.getByLabelText(/prompt you entered/i), 'Write a bio for Aaliyah')
    await userEvent.type(screen.getByLabelText(/ai response you observed/i), 'Aaliyah is an engineer.')
    await userEvent.click(screen.getByLabelText(/soft refusal/i))
    await userEvent.click(screen.getByRole('button', { name: /record observation/i }))

    const item = await screen.findByTestId('observation-item')
    expect(within(item).getByText(/soft refusal/i)).toBeTruthy()
    expect(within(item).getByText(/consumer-ui/)).toBeTruthy()
    expect(within(item).getByText(/manual/)).toBeTruthy()
    const hash = within(item).getByTestId('evidence-hash').textContent ?? ''
    expect(hash).toMatch(/hash: [0-9a-f]{64}/)
    expect(screen.getByRole('status').textContent).toContain(hash.replace('hash: ', ''))

    // The form is cleared for the next observation.
    expect((screen.getByLabelText(/prompt you entered/i) as HTMLTextAreaElement).value).toBe('')

    unmount()
    render(<ObservationsPanel />)
    expect(screen.getAllByTestId('observation-item')).toHaveLength(1)
  })
})
