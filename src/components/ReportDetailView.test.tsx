// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ReportDetailView } from './ReportDetailView'
import { api } from '../api'

vi.mock('../api', () => ({
  api: { getReportDetail: vi.fn() },
  ServerError: class ServerError extends Error {
    status = 500
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('report detail evidence', () => {
  it('shows the provider and model that produced each response', async () => {
    vi.mocked(api.getReportDetail).mockResolvedValue({
      id: 12,
      title: 'Bias run — Run report',
      experimentName: 'Bias run',
      generatedAt: '2026-08-26T12:00:00.000Z',
      promptTemplate: 'Compare the candidates.',
      evidenceChain: 'hash',
      summary: { evidenceCount: 1, succeeded: 1, failed: 0 },
      questions: [{
        id: 'pair-1',
        question: 'Compare the candidates.',
        variantA: {
          key: 'A', label: 'Candidate A', prompt: 'Candidate A',
          evidence: [{
            requestId: 'request-1', pairId: 'pair-1', question: 'Compare the candidates.', variantKey: 'A',
            variantLabel: 'Candidate A', provider: 'openrouter', modelId: 'openai/gpt-4o-mini',
            prompt: 'Candidate A', response: 'Response', status: 'ok', statusCode: 200,
            latencyMs: 42, recordedAt: '2026-08-26T12:00:00.000Z', recordHash: 'hash',
          }],
        },
        variantB: { key: 'B', label: 'Candidate B', prompt: 'Candidate B', evidence: [] },
      }],
      evidence: [],
    })

    render(<ReportDetailView reportId={12} />)

    expect(await screen.findByText('Model: openai/gpt-4o-mini · openrouter')).toBeTruthy()
    expect(screen.getByText('openai/gpt-4o-mini')).toBeTruthy()
  })
})
