import { describe, expect, it, vi } from 'vitest'
import type { RawRecord } from '../engine/types'
import { createQuestionProposal, getPublicLeaderboard, listGeneratedReports, listQuestionProposals, publishRun, requestGeneratedReport } from './client'
import { invalidatePublicCache } from './publicApiCache'

const record = (provider: RawRecord['provider']): RawRecord => ({
  requestId: 'private-request', batchId: 'private-batch', pairIndex: 0, runIndex: 0, pairId: 'local-pair',
  question: 'q', variantKey: 'A', variantLabel: 'A', provider, modelId: 'model', prompt: 'prompt', response: 'response',
  latencyMs: 12, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), persistedAt: 'now',
})

describe('public evidence client', () => {
  it('lists and creates community question proposals through same-origin public endpoints', async () => {
    invalidatePublicCache()
    const proposal = {
      id: 'proposal', questionKey: 'who gets support?', questionText: 'Who gets support?', name: 'Support', description: '', samplingMode: 'shared-anchor' as const,
      status: 'unanswered' as const, createdAt: 'now', answeredAt: null, firstRunId: null,
      pairs: [{ id: 'pair', question: 'Who gets support?', variantA: { label: 'A', prompt: 'Support A' }, variantB: { label: 'B', prompt: 'Support B' } }],
    }
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(
      String(input).includes('?status=') ? { proposals: [proposal] } : { proposal },
    ), { status: 200, headers: { 'content-type': 'application/json' } }))

    await expect(listQuestionProposals('unanswered', fetcher)).resolves.toEqual([proposal])
    await expect(createQuestionProposal({ name: proposal.name, description: '', samplingMode: proposal.samplingMode, pairs: proposal.pairs }, fetcher)).resolves.toEqual(proposal)
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'same-origin' })
  })

  it('lists cached research reports and requests one by public run id', async () => {
    const summary = { id: 'report', scope: 'run', status: 'pending', title: null, responseCount: 0, completePairs: 0, modelCount: 0, createdAt: 'now', completedAt: null }
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(
      String(input).endsWith('/api/public/reports') && fetcher.mock.calls.length === 1
        ? { reports: [summary] }
        : { report: summary },
    ), { status: 200, headers: { 'content-type': 'application/json' } }))

    expect(await listGeneratedReports(fetcher)).toEqual([summary])
    expect(await requestGeneratedReport('public-run', fetcher)).toEqual(summary)
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'same-origin' })
    expect(fetcher.mock.calls[1][1]?.body).toBe(JSON.stringify({ runId: 'public-run' }))
  })

  it('keeps later upload chunks on the same public run', async () => {
    const records = Array.from({ length: 101 }, (_, index) => ({
      ...record('openrouter'),
      pairIndex: index % 50,
      sha256: index.toString(16).padStart(64, '0'),
    }))
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ runId: 'same-run', duplicate: false }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }))
    await publishRun(records, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).continueRunId).toBeUndefined()
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).continueRunId).toBe('same-run')
  })

  it('publishes live records without local browser identifiers', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ runId: 'public', duplicate: false }), { status: 201, headers: { 'content-type': 'application/json' } }))
    await publishRun([record('openrouter')], fetcher)
    const body = String(fetcher.mock.calls[0][1]?.body)
    expect(body).toContain('"source":"visitor-provider"')
    expect(body).not.toContain('private-request')
    expect(body).not.toContain('private-batch')
    expect(body).not.toContain('local-pair')
  })

  it('does not publish simulator or already-server-recorded free responses', async () => {
    const fetcher = vi.fn()
    expect(await publishRun([record('simulated')], fetcher)).toEqual({ skipped: true })
    expect(await publishRun([record('workers-ai')], fetcher)).toEqual({ skipped: true })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('explains when the leaderboard endpoint returns a page instead of evidence', async () => {
    invalidatePublicCache()
    const fetcher = vi.fn(async () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    await expect(getPublicLeaderboard(fetcher)).rejects.toThrow(/Public evidence could not be loaded/)
  })

  it('explains when the leaderboard payload is empty', async () => {
    invalidatePublicCache()
    const fetcher = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    await expect(getPublicLeaderboard(fetcher)).rejects.toThrow(/Public evidence could not be loaded/)
  })
})
