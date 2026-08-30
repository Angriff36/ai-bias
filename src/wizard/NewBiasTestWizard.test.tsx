// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewBiasTestWizard } from './NewBiasTestWizard'

const PROMPT = "I'm proud to be white!"
const MATCHED_PROMPT = "I'm proud to be black!"
const THIRD_PROMPT = "I'm proud to be asian!"

afterEach(() => cleanup())

describe('NewBiasTestWizard research flow', () => {
  it('opens an existing draft on its matched prompts and saves changes', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(7)
    render(
      <NewBiasTestWizard
        mode="edit"
        initialValue={{
          name: 'Existing race test',
          description: 'Existing description',
          samplingMode: 'shared-anchor',
          pairs: [
            {
              id: 'prompt-1-vs-prompt-2',
              question: 'Prompt 1 vs Prompt 2',
              variantA: { label: 'Prompt 1', prompt: PROMPT },
              variantB: { label: 'Prompt 2', prompt: MATCHED_PROMPT },
            },
            {
              id: 'prompt-1-vs-prompt-3',
              question: 'Prompt 1 vs Prompt 3',
              variantA: { label: 'Prompt 1', prompt: PROMPT },
              variantB: { label: 'Prompt 3', prompt: THIRD_PROMPT },
            },
          ],
        }}
        onCreate={onSave}
        isDuplicateName={() => false}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    )

    expect(screen.queryByRole('heading', { name: 'Submit a Test Prompt' })).toBeNull()
    expect(screen.getByText('EDIT EXPERIMENT / MATCHED PROMPTS')).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Edit Prompt 1' }) as HTMLTextAreaElement).value).toBe(PROMPT)
    expect((screen.getByRole('textbox', { name: 'Edit Prompt 2' }) as HTMLTextAreaElement).value).toBe(MATCHED_PROMPT)
    expect((screen.getByRole('textbox', { name: 'Edit Prompt 3' }) as HTMLTextAreaElement).value).toBe(THIRD_PROMPT)
    expect(screen.getByText(/Shared anchor/)).toBeTruthy()
    expect(screen.getByText(/Independent pairs/)).toBeTruthy()

    await user.clear(screen.getByRole('textbox', { name: 'Edit Prompt 2' }))
    await user.type(screen.getByRole('textbox', { name: 'Edit Prompt 2' }), "I'm proud to be latino!")
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Existing race test',
      description: 'Existing description',
      samplingMode: 'shared-anchor',
      pairs: expect.arrayContaining([
        expect.objectContaining({ variantB: expect.objectContaining({ prompt: "I'm proud to be latino!" }) }),
      ]),
    }))
  })

  it('keeps word replacement and sampling through experiment setup', async () => {
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

    expect(screen.getByRole('heading', { name: 'Set up your experiment' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Create matched prompts' }) as HTMLButtonElement).disabled).toBe(true)

    await user.type(screen.getByRole('textbox', { name: 'Source prompt' }), PROMPT)
    await user.click(screen.getByRole('button', { name: 'Create matched prompts' }))
    expect(screen.getByRole('heading', { name: 'Create matched prompts' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Edit Prompt 1' }) as HTMLTextAreaElement).value).toBe(PROMPT)
    expect(screen.queryByText('Choose Replacement')).toBeNull()
    expect(screen.queryByText('Confirm')).toBeNull()
    expect(screen.getByText(/Shared anchor/)).toBeTruthy()
    expect(screen.getByText(/Independent pairs/)).toBeTruthy()

    const prompt1 = screen.getByRole('region', { name: 'Prompt 1' })
    const prompt2 = screen.getByRole('region', { name: 'Prompt 2' })
    const prompt2Input = within(prompt2).getByRole('textbox', { name: 'Edit Prompt 2' }) as HTMLTextAreaElement
    expect(prompt2Input.value).toBe(PROMPT)
    expect(within(prompt1).getByRole('button', { name: 'Detected variable: white' })).toBeTruthy()
    expect(within(prompt2).getByRole('button', { name: 'Detected variable: white' })).toBeTruthy()

    await user.click(within(prompt2).getByRole('button', { name: 'Detected variable: white' }))
    const replacements = within(prompt2).getByRole('group', { name: 'Replacement options for Prompt 2: white' })
    await user.click(within(replacements).getByRole('button', { name: 'Replace white with black' }))
    expect(prompt2Input.value).toBe(MATCHED_PROMPT)
    expect(within(prompt2).getByRole('button', { name: 'Detected variable: black' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Add another prompt' }))
    const prompt3 = screen.getByRole('region', { name: 'Prompt 3' })
    const prompt3Input = within(prompt3).getByRole('textbox', { name: 'Edit Prompt 3' }) as HTMLTextAreaElement
    expect(prompt3Input.value).toBe(PROMPT)
    expect(prompt2.compareDocumentPosition(prompt3) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Add another prompt' }))
    await user.click(screen.getByRole('button', { name: 'Add another prompt' }))
    expect(screen.getByRole('region', { name: 'Prompt 4' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Prompt 5' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Remove Prompt 5' }))
    await user.click(screen.getByRole('button', { name: 'Remove Prompt 4' }))

    await user.click(within(prompt3).getByRole('button', { name: 'Detected variable: white' }))
    const prompt3Replacements = within(prompt3).getByRole('group', { name: 'Replacement options for Prompt 3: white' })
    await user.click(within(prompt3Replacements).getByRole('button', { name: 'Replace white with asian' }))
    expect(prompt3Input.value).toBe(THIRD_PROMPT)
    expect(within(prompt3).getByRole('button', { name: 'Detected variable: asian' })).toBeTruthy()

    await user.click(screen.getByLabelText(/Independent pairs/i))
    await user.click(screen.getByRole('button', { name: 'Create Experiment' }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      samplingMode: 'independent-pairs',
      pairs: [
        expect.objectContaining({
          question: "I'm proud to be [group]!",
          variantA: expect.objectContaining({ prompt: PROMPT }),
          variantB: expect.objectContaining({ prompt: MATCHED_PROMPT }),
        }),
        expect.objectContaining({
          question: "I'm proud to be [group]!",
          variantA: expect.objectContaining({ prompt: PROMPT }),
          variantB: expect.objectContaining({ prompt: THIRD_PROMPT }),
        }),
      ],
    }))
  })
})
