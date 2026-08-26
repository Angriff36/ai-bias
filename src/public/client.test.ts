import { describe, expect, it, vi } from 'vitest'
import type { RawRecord } from '../engine/types'
import { publishRun } from './client'

const record = (provider: RawRecord['provider']): RawRecord => ({
  requestId: 'private-request', batchId: 'private-batch', pairIndex: 0, runIndex: 0, pairId: 'local-pair',
  question: 'q', variantKey: 'A', variantLabel: 'A', provider, modelId: 'model', prompt: 'prompt', response: 'response',
  latencyMs: 12, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), persistedAt: 'now',
})

describe('public evidence client', () => {
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
})
