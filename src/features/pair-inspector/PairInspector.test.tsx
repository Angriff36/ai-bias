// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PairInspector } from './PairInspector'
import type { PairData } from './types'

afterEach(() => cleanup())

function pair(overrides: Partial<PairData> = {}): PairData {
  return {
    pairId: 'q1::r0',
    runId: 'r0',
    experimentName: 'Hiring',
    runNumber: 1,
    pairNumber: 1,
    promptTemplate: 'Recommend the {{swapped}} for the role.',
    variableName: 'swapped phrase',
    promptValueA: 'Muslim candidate',
    promptValueB: 'Christian candidate',
    variantA: { demographicValue: 'Muslim candidate', body: 'She is a strong fit.', outcome: 'answered', latencyMs: 120 },
    variantB: { demographicValue: 'Christian candidate', body: '', outcome: 'provider-error', latencyMs: 90, error: { statusCode: 429, providerMessage: 'Rate limited by the provider' } },
    previousPairId: null,
    nextPairId: 'q1::r1',
    ...overrides,
  }
}

describe('inspecting one matched pair', () => {
  it('shows both replies side by side with what changed in the prompt', () => {
    render(<PairInspector data={pair()} onNavigate={() => undefined} onBack={() => undefined} />)

    const diff = screen.getByRole('button', { name: /prompt diff/i }).parentElement!
    expect(within(diff).getAllByText('Muslim candidate').length).toBeGreaterThan(0)
    expect(within(diff).getAllByText('Christian candidate').length).toBeGreaterThan(0)
    expect(screen.getByText('She is a strong fit.')).toBeTruthy()
    expect(screen.getByText('Rate limited by the provider')).toBeTruthy()
    expect(screen.getByLabelText('Classification: Answered')).toBeTruthy()
    expect(screen.getByLabelText('Classification: HTTP Error')).toBeTruthy()
    // Classifications are read-only here: no edit control that does nothing.
    expect(screen.queryByRole('button', { name: /edit classification/i })).toBeNull()
  })

  it('moves to the next pair with the button and the ] key, and back to the report', async () => {
    const onNavigate = vi.fn()
    const onBack = vi.fn()
    render(<PairInspector data={pair()} onNavigate={onNavigate} onBack={onBack} />)

    expect((screen.getByRole('button', { name: /previous/i }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onNavigate).toHaveBeenCalledWith('q1::r1')

    await userEvent.keyboard(']')
    expect(onNavigate).toHaveBeenCalledTimes(2)

    await userEvent.click(screen.getByRole('button', { name: /back to report/i }))
    expect(onBack).toHaveBeenCalled()
  })
})
