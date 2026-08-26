import { describe, expect, it, vi } from 'vitest'
import { handlePublicApi } from './routes'

const leaderboard = { totals: { runs: 0, responses: 0, completePairs: 0, models: 0 }, models: [], latestAnalysis: null, analysisPending: false, recentEvidence: [] }

function dependencies() {
  return {
    repository: {
      publish: vi.fn(async () => ({ runId: 'public-run', duplicate: false, crossedThresholds: [] as number[], crossedResponseReportThresholds: [] as number[] })),
      getLeaderboard: vi.fn(async () => leaderboard),
      getAllowance: vi.fn(async () => ({ remaining: 2, dailyRemaining: 250 })),
    },
    reportRepository: {
      claimRunReport: vi.fn(async () => ({ kind: 'claimed', report: { id: 'report-1', scope: 'run', status: 'pending', title: null, responseCount: 0, completePairs: 0, modelCount: 0, createdAt: 'now', completedAt: null } })),
      claimGlobalReport: vi.fn(async () => ({ kind: 'claimed', report: { id: 'global-200', scope: 'global', status: 'pending', title: null, responseCount: 0, completePairs: 0, modelCount: 0, createdAt: 'now', completedAt: null } })),
      listReports: vi.fn(async () => [{ id: 'report-1', scope: 'run', status: 'complete', title: 'Published audit', responseCount: 40, completePairs: 20, modelCount: 1, createdAt: 'now', completedAt: 'later' }]),
      getReportDocument: vi.fn(async () => ({
        schemaVersion: 1, id: 'report-1', scope: 'run', generatedAt: 'later', scoringModelId: 'scorer', synthesisModelId: 'writer', responseCount: 40, completePairs: 20, modelCount: 1,
        narrative: { title: 'Published audit', subtitle: 'Twenty questions', executiveSummary: 'Summary.', keyFindings: ['Finding.'], methodology: 'Method.', limitations: ['Limit.'] }, models: [], pairScores: [], evidence: [],
      })),
    },
    quotaHash: vi.fn(async () => ({ hash: 'quota-hash', cookie: 'quota=signed; HttpOnly' })),
    freeRunner: vi.fn(),
    schedule: vi.fn(),
    scheduleReport: vi.fn(),
  }
}

describe('public API routes', () => {
  it('publishes a valid anonymous evidence payload and schedules crossed analyses', async () => {
    const deps = dependencies()
    deps.repository.publish.mockResolvedValue({ runId: 'public-run', duplicate: false, crossedThresholds: [25], crossedResponseReportThresholds: [200] })
    const response = await handlePublicApi(new Request('https://ai-tests.com/api/public/submissions', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://ai-tests.com' },
      body: JSON.stringify({ source: 'visitor-provider', records: [{ pairIndex: 0, runIndex: 0, variantKey: 'A', variantLabel: 'A', provider: 'openrouter', modelId: 'm', prompt: 'p', response: 'r', latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64) }] }),
    }), {} as never, { waitUntil: vi.fn() }, deps as never)

    expect(response?.status).toBe(201)
    expect(await response?.json()).toEqual({ runId: 'public-run', duplicate: false })
    expect(deps.schedule).toHaveBeenCalledWith([25])
    expect(deps.reportRepository.claimGlobalReport).toHaveBeenCalledWith(200, expect.any(String))
    expect(deps.scheduleReport).toHaveBeenCalledWith('global-200')
  })

  it('claims eligible reports, lists them, and serves safe standalone HTML', async () => {
    const deps = dependencies()
    const post = await handlePublicApi(new Request('https://ai-tests.com/api/public/reports', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://ai-tests.com' }, body: JSON.stringify({ runId: 'public-run' }),
    }), {} as never, { waitUntil: vi.fn() }, deps as never)
    expect(post?.status).toBe(202)
    expect(deps.scheduleReport).toHaveBeenCalledWith('report-1')

    const list = await handlePublicApi(new Request('https://ai-tests.com/api/public/reports'), {} as never, { waitUntil: vi.fn() }, deps as never)
    expect((await list?.json()).reports[0].title).toBe('Published audit')

    const html = await handlePublicApi(new Request('https://ai-tests.com/api/public/reports/report-1.html'), {} as never, { waitUntil: vi.fn() }, deps as never)
    expect(html?.headers.get('content-type')).toContain('text/html')
    expect(html?.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(await html?.text()).toContain('The headline numbers')
  })

  it('explains the 20-question minimum for an ineligible report request', async () => {
    const deps = dependencies()
    deps.reportRepository.claimRunReport.mockResolvedValue({ kind: 'ineligible', completeQuestions: 7 } as never)
    const response = await handlePublicApi(new Request('https://ai-tests.com/api/public/reports', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: 'short-run' }),
    }), {} as never, { waitUntil: vi.fn() }, deps as never)
    expect(response?.status).toBe(422)
    expect(await response?.json()).toEqual({ error: 'A full report requires at least 20 complete matched questions.', completeQuestions: 7 })
  })

  it('caps new report jobs while keeping cached report reads available', async () => {
    const deps = dependencies()
    deps.reportRepository.claimRunReport.mockResolvedValue({ kind: 'limited' } as never)
    const response = await handlePublicApi(new Request('https://ai-tests.com/api/public/reports', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: 'eligible-run' }),
    }), {} as never, { waitUntil: vi.fn() }, deps as never)
    expect(response?.status).toBe(429)
    expect(deps.scheduleReport).not.toHaveBeenCalled()
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
