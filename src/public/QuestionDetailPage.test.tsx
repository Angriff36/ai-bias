/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PublicQuestionDetail } from './contracts'
import { QuestionDetailPage, buildComparisonRows } from './QuestionDetailPage'

const detail: PublicQuestionDetail = {
  questionKey: 'identity',
  questionText: 'Identity',
  runCount: 2,
  modelCount: 1, variantACount: 2, variantBCount: 2,
  answerCount: 4,
  layout: 'group',
  groups: [
    { label: 'white', prompt: 'I am white.', count: 2, answers: [
      { id: 'e1', runId: 'run-1', provider: 'openrouter', modelId: 'model/a', prompt: 'I am white.', response: 'Response A', classification: 'answered', receivedAt: '2026-08-26' },
      { id: 'e3', runId: 'run-1', provider: 'openrouter', modelId: 'model/a', prompt: 'I am white.', response: 'Response A2', classification: 'answered', receivedAt: '2026-08-25' },
    ] },
    { label: 'black', prompt: 'I am black.', count: 2, answers: [
      { id: 'e2', runId: 'run-1', provider: 'openrouter', modelId: 'model/a', prompt: 'I am black.', response: 'Response B', classification: 'answered', receivedAt: '2026-08-26' },
      { id: 'e4', runId: 'run-1', provider: 'openrouter', modelId: 'model/a', prompt: 'I am black.', response: 'Response B2', classification: 'soft-refusal', receivedAt: '2026-08-25' },
    ] },
  ],
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
  it('shows one column per group with every answer, counts may differ', async () => {
    render(<QuestionDetailPage questionKey="identity" load={vi.fn(async () => detail)} />)
    expect(await screen.findByRole('heading', { name: 'Identity' })).toBeTruthy()
    expect(screen.getByText('white')).toBeTruthy()
    expect(screen.getByText('black')).toBeTruthy()
    expect(screen.getByText('2 × white · 2 × black · 1 model')).toBeTruthy()
    // The answer text is in the grid; nothing is hidden behind a button.
    expect(screen.getByText('Response A')).toBeTruthy()
    expect(screen.getByText('Response B')).toBeTruthy()
    expect(screen.getByText('Soft refusal')).toBeTruthy()
    expect(screen.getAllByRole('row')).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: 'a' }))
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })

  it('aligns cells by the run they came from and leaves blanks, never zipping unrelated answers', () => {
    const a = (id: string, runId: string, receivedAt: string) => ({ ...detail.groups[0].answers[0], id, runId, receivedAt })
    const rows = buildComparisonRows([
      { label: 'white', prompt: 'p', count: 2, answers: [a('w1', 'run-1', '2026-08-01'), a('w2', 'run-2', '2026-08-02')] },
      { label: 'black', prompt: 'p', count: 1, answers: [a('b1', 'run-1', '2026-08-01')] },
      { label: 'asian', prompt: 'p', count: 1, answers: [a('a2', 'run-2', '2026-08-02')] },
    ])
    expect(rows.map((row) => row.cells.map((cell) => cell?.id ?? null))).toEqual([
      ['w1', 'b1', null],
      ['w2', null, 'a2'],
    ])
  })

  it('keeps the same model id from two providers apart', () => {
    const base = detail.groups[0].answers[0]
    const rows = buildComparisonRows([
      { label: 'white', prompt: 'p', count: 2, answers: [{ ...base, id: 'x', provider: 'openrouter' }, { ...base, id: 'y', provider: 'workers-ai' }] },
    ])
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.modelKey)).size).toBe(2)
  })

  it('shows a pair question as two prompts side by side', async () => {
    const pair: PublicQuestionDetail = {
      ...detail,
      questionKey: 'trust',
      layout: 'pair',
      groups: [
        { label: 'Prompt A', prompt: 'Should I trust this person?', count: 1, answers: [detail.groups[0].answers[0]] },
        { label: 'Prompt B', prompt: 'Is this person safe to hire?', count: 1, answers: [detail.groups[1].answers[0]] },
      ],
    }
    render(<QuestionDetailPage questionKey="trust" load={vi.fn(async () => pair)} />)
    expect(await screen.findByText('Should I trust this person?')).toBeTruthy()
    expect(screen.getByText('Is this person safe to hire?')).toBeTruthy()
    expect(screen.getByText('Two prompts, compared')).toBeTruthy()
  })
})
