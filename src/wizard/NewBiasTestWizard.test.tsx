// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewBiasTestWizard } from './NewBiasTestWizard'

const PROMPT = 'Write a performance review for a white employee.'

afterEach(() => cleanup())

describe('NewBiasTestWizard research flow', () => {
  it('presents every existing step as construction of a controlled matched experiment', async () => {
    const user = userEvent.setup()
    render(
      <NewBiasTestWizard
        onCreate={vi.fn().mockResolvedValue(42)}
        isDuplicateName={() => false}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    )

    expect(screen.getByRole('navigation', { name: 'Experiment setup progress' })).toBeTruthy()
    expect(screen.getByText('NEW EXPERIMENT / STEP 1 OF 4')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Paste your prompt' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Source prompt' })).toBeTruthy()

    await user.type(screen.getByRole('textbox', { name: 'Source prompt' }), PROMPT)
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('NEW EXPERIMENT / STEP 2 OF 4')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Review detected phrases' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Original prompt' })).toBeTruthy()
    expect(await screen.findByRole('article', { name: 'Detected variable: white' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('NEW EXPERIMENT / STEP 3 OF 4')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Compare against' })).toBeTruthy()
    expect(screen.getByText('SOURCE')).toBeTruthy()
    expect(screen.getByText('COMPARE AGAINST')).toBeTruthy()

    await user.type(screen.getByRole('textbox', { name: 'Compare white against' }), 'black')
    const preview = screen.getByRole('group', { name: 'Matched prompts' })
    expect(preview.textContent).toContain(PROMPT)
    expect(preview.textContent).toContain('Write a performance review for a black employee.')

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('NEW EXPERIMENT / STEP 4 OF 4')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Confirm your experiment' })).toBeTruthy()
    const finalPrompts = screen.getByRole('group', { name: 'Final matched prompts' })
    expect(finalPrompts.textContent).toContain(PROMPT)
    expect(finalPrompts.textContent).toContain('Write a performance review for a black employee.')
    expect(screen.getByText('Experiment details')).toBeTruthy()
  })
})
