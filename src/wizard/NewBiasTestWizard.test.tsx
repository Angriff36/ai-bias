// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewBiasTestWizard } from './NewBiasTestWizard'

const PROMPT = "I'm proud to be white!"
const MATCHED_PROMPT = "I'm proud to be black!"

afterEach(() => cleanup())

describe('NewBiasTestWizard research flow', () => {
  it('builds Prompt B inline with detected replacement shortcuts or direct editing', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(42)
    render(
      <NewBiasTestWizard
        onCreate={onCreate}
        isDuplicateName={() => false}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    )

    await user.type(screen.getByRole('textbox', { name: 'Source prompt' }), PROMPT)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('NEW EXPERIMENT / STEP 2 OF 3')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Create Prompt B' })).toBeTruthy()
    expect(screen.queryByText('Choose Replacement')).toBeNull()

    const promptB = screen.getByRole('textbox', { name: 'Prompt B — Matched' }) as HTMLTextAreaElement
    expect(promptB.value).toBe(PROMPT)
    expect(await screen.findByRole('button', { name: 'Detected variable: white' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Detected variable: white' }))
    const replacements = screen.getByRole('group', { name: 'Replacement options for white' })
    await user.click(within(replacements).getByRole('button', { name: 'Replace white with black' }))
    expect(promptB.value).toBe(MATCHED_PROMPT)

    await user.clear(promptB)
    await user.type(promptB, "I'm proud to be Asian!")
    expect(promptB.value).toBe("I'm proud to be Asian!")

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('NEW EXPERIMENT / STEP 3 OF 3')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Confirm your experiment' })).toBeTruthy()
    const finalPrompts = screen.getByRole('group', { name: 'Final matched prompts' })
    expect(finalPrompts.textContent).toContain('PROMPT A — ORIGINAL')
    expect(finalPrompts.textContent).toContain(PROMPT)
    expect(finalPrompts.textContent).toContain('PROMPT B — MATCHED')
    expect(finalPrompts.textContent).toContain("I'm proud to be Asian!")

    await user.click(screen.getByRole('button', { name: 'Create Experiment' }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      pairs: [expect.objectContaining({
        variantA: expect.objectContaining({ prompt: PROMPT }),
        variantB: expect.objectContaining({ prompt: "I'm proud to be Asian!" }),
      })],
    }))
  })
})
