/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PublicQuestionDetail } from './contracts'
import { QuestionDetailPage } from './QuestionDetailPage'

const detail: PublicQuestionDetail = {
  questionKey: 'identity',
  questionText: 'Identity',
  runCount: 2,
  modelCount: 1,
  instances: [{
    runId: 'run-1',
    pairIndex: 0,
    runIndex: 0,
    provider: 'openrouter',
    modelId: 'model/a',
    variantLabelA: 'white',
    variantLabelB: 'black',
    promptA: 'I am white.',
    promptB: 'I am black.',
    responseA: 'Response A',
    responseB: 'Response B',
    classificationA: 'answered',
    classificationB: 'answered',
    receivedAt: '2026-08-26',
  }],
}

describe('QuestionDetailPage', () => {
  it('lists variables and expandable responses for each instance', async () => {
    render(<QuestionDetailPage questionKey="identity" load={vi.fn(async () => detail)} />)
    expect(await screen.findByRole('heading', { name: 'Identity' })).toBeTruthy()
    expect(screen.getByText('white')).toBeTruthy()
    expect(screen.getByText('I am white.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Show model responses' }))
    expect(screen.getAllByText('Response B').length).toBeGreaterThan(0)
  })
})
