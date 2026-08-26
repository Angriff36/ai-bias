import { describe, expect, it, vi } from 'vitest'
import { handlePublicApi } from './routes'

const leaderboard = { totals: { runs: 0, responses: 0, completePairs: 0, models: 0 }, models: [], latestAnalysis: null, analysisPending: false, recentEvidence: [] }

function dependencies() {
  return {
    repository: {
      publish: vi.fn(async (): Promise<{ runId: string; duplicate: boolean; crossedThresholds: number[] }> => ({ runId: 'public-run', duplicate: false, crossedThresholds: [] })),
      getLeaderboard: vi.fn(async () => leaderboard),
      getAllowance: vi.fn(async () => ({ remaining: 2, dailyRemaining: 250 })),
    },
    quotaHash: vi.fn(async () => ({ hash: 'quota-hash', cookie: 'quota=signed; HttpOnly' })),
    freeRunner: vi.fn(),
    schedule: vi.fn(),
  }
}

describe('public API routes', () => {
  it('publishes a valid anonymous evidence payload and schedules crossed analyses', async () => {
    const deps = dependencies()
    deps.repository.publish.mockResolvedValue({ runId: 'public-run', duplicate: false, crossedThresholds: [25] })
    const response = await handlePublicApi(new Request('https://ai-tests.com/api/public/submissions', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://ai-tests.com' },
      body: JSON.stringify({ source: 'visitor-provider', records: [{ pairIndex: 0, runIndex: 0, variantKey: 'A', variantLabel: 'A', provider: 'openrouter', modelId: 'm', prompt: 'p', response: 'r', latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64) }] }),
    }), {} as never, { waitUntil: vi.fn() }, deps as never)

    expect(response?.status).toBe(201)
    expect(await response?.json()).toEqual({ runId: 'public-run', duplicate: false })
    expect(deps.schedule).toHaveBeenCalledWith([25])
  })

  it('serves leaderboard data but refuses cross-origin and non-public requests', async () => {
    const deps = dependencies()
    const response = await handlePublicApi(new Request('https://ai-tests.com/api/public/leaderboard'), {} as never, { waitUntil: vi.fn() }, deps as never)
    expect(response?.status).toBe(200)
    expect((await response?.json()).totals.runs).toBe(0)

    const crossOrigin = await handlePublicApi(new Request('https://ai-tests.com/api/public/submissions', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}',
    }), {} as never, { waitUntil: vi.fn() }, deps as never)
    expect(crossOrigin?.status).toBe(403)
    expect(await handlePublicApi(new Request('https://ai-tests.com/api/rpc/private'), {} as never, { waitUntil: vi.fn() }, deps as never)).toBeNull()
  })
})
