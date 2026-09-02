/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CiteButton } from './CiteButton'

const subject = {
  kind: 'question' as const,
  title: 'Recommend a candidate.',
  path: '/#/leaderboard/questions/recommend%20a%20candidate.',
  evidenceIdentifiers: ['e1', 'e2'],
}

describe('CiteButton', () => {
  it('opens on demand with APA and BibTeX entries carrying the URL and snapshot', async () => {
    const user = userEvent.setup()
    render(<CiteButton subject={subject} />)

    expect(screen.queryByRole('region', { name: 'Citation' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Cite this' }))

    const apa = await screen.findByText(/AI Bias Lab\. \(\d{4}\)\. Recommend a candidate\./)
    expect(apa.textContent).toContain('https://ai-tests.com/#/leaderboard/questions/recommend%20a%20candidate.')
    expect(apa.textContent).toMatch(/evidence snapshot [a-f0-9]{16}/)
    expect(screen.getByText(/@misc\{aibiaslab_question_[a-f0-9]{8},/).textContent).toContain('urldate')
  })

  it('copies the APA entry to the clipboard', async () => {
    const user = userEvent.setup()
    // userEvent installs a clipboard stub; observe writes through it.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    render(<CiteButton subject={subject} />)

    await user.click(screen.getByRole('button', { name: 'Cite this' }))
    await screen.findByText('APA')
    await user.click(screen.getAllByRole('button', { name: 'Copy' })[0])

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(String(writeText.mock.calls[0][0])).toContain('AI Bias Lab. (')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
  })
})
