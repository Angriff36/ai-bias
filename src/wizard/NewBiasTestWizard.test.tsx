// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewBiasTestWizard } from './NewBiasTestWizard'

const PROMPT = "I'm proud to be white!"
const MATCHED_PROMPT = "I'm proud to be black!"

afterEach(() => cleanup())

describe('NewBiasTestWizard research flow', () => {
  it('teaches that the selected phrase is replaced while every other word stays identical', async () => {
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
    expect(screen.getByRole('heading', { name: 'Choose what to change' })).toBeTruthy()
    expect(screen.getByText(/select the word or phrase ai bias lab should replace/i)).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Original prompt' })).toBeTruthy()
    expect(await screen.findByRole('article', { name: 'Word or phrase to replace: white' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Use "white" as the variable' })).toBeTruthy()
    expect(screen.getByText('WHAT HAPPENS NEXT')).toBeTruthy()
    expect(screen.getByText(/you'll choose a replacement for "white"/i)).toBeTruthy()
    const incompletePreview = screen.getByRole('group', { name: 'Incomplete matched prompts' })
    expect(incompletePreview.textContent).toContain('PROMPT A')
    expect(incompletePreview.textContent).toContain(PROMPT)
    expect(incompletePreview.textContent).toContain('PROMPT B')
    expect(incompletePreview.textContent).toContain("I'm proud to be ______!")
    expect(screen.getByText("Didn't detect the right word?")).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Word or phrase to replace' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add variable' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('NEW EXPERIMENT / STEP 3 OF 4')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Choose the replacement' })).toBeTruthy()
    expect(screen.getByText('Enter what should replace "white" in the second prompt.')).toBeTruthy()
    expect(screen.getByText('ORIGINAL VALUE')).toBeTruthy()
    expect(screen.getByText('REPLACE WITH')).toBeTruthy()

    await user.type(screen.getByRole('textbox', { name: 'Replace white with' }), 'black')
    const preview = screen.getByRole('group', { name: 'Matched prompts' })
    expect(preview.textContent).toContain('ONLY THIS CHANGES')
    expect(preview.textContent).toContain('white → black')
    expect(preview.textContent).toContain('PROMPT A — ORIGINAL')
    expect(preview.textContent).toContain(PROMPT)
    expect(preview.textContent).toContain('PROMPT B — MATCHED')
    expect(preview.textContent).toContain(MATCHED_PROMPT)
    expect(preview.textContent).toContain('Everything else stays identical.')

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('NEW EXPERIMENT / STEP 4 OF 4')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Confirm your experiment' })).toBeTruthy()
    const finalPrompts = screen.getByRole('group', { name: 'Final matched prompts' })
    expect(finalPrompts.textContent).toContain('Only changed: white → black')
    expect(finalPrompts.textContent).toContain('PROMPT A — ORIGINAL')
    expect(finalPrompts.textContent).toContain(PROMPT)
    expect(finalPrompts.textContent).toContain('PROMPT B — MATCHED')
    expect(finalPrompts.textContent).toContain(MATCHED_PROMPT)
    expect(screen.getByText('Experiment details')).toBeTruthy()
  })
})
