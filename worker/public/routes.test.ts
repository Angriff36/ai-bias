import { describe, expect, it, vi } from 'vitest'
import { handlePublicApi } from './routes'

const leaderboard = { totals: { runs: 0, responses: 0, completePairs: 0, models: 0, questions: 0 }, topQuestions: [], models: [], latestAnalysis: null, analysisPending: false, latestReport: null, reportPending: false, recentEvidence: [] }

function dependencies() {
  return {
    repository: {
      publish: vi.fn(async () => ({ runId: 'public-run', duplicate: false, crossedThresholds: [] as number[] })),
      getLeaderboard: vi.fn(async () => leaderboard),
      getQuestionDetail: vi.fn(async () => null),
      getAllowance: vi.fn(async () => ({ remaining: 2, dailyRemaining: 250 })),
    },
    reportRepository: {
      claimRunReport: vi.fn(async () => ({ kind: 'claimed', report: { id: 'report-1', scope: 'run', status: 'pending', title: null, responseCount: 0, completePairs: 0, modelCount: 0, createdAt: 'now', completedAt: null } })),
      claimCurrentGlobalReport: vi.fn(async () => ({ kind: 'claimed', report: { id: 'global-cohort', scope: 'global', status: 'pending', title: null, responseCount: 0, completePairs: 0, modelCount: 0, createdAt: 'now', completedAt: null } })),
      claimQuestionSetReport: vi.fn(async () => ({ kind: 'claimed', report: { id: 'question-set', scope: 'global', status: 'pending', title: null, responseCount: 0, completePairs: 0, modelCount: 0, createdAt: 'now', completedAt: null } })),
      listReports: vi.fn(async () => [{ id: 'report-1', scope: 'run', status: 'complete', title: 'Published audit', responseCount: 40, completePairs: 20, modelCount: 1, createdAt: 'now', completedAt: 'later' }]),
      getReportDocument: vi.fn(async () => ({
        schemaVersion: 1, id: 'report-1', scope: 'run', generatedAt: 'later', scoringModelId: 'scorer', synthesisModelId: 'writer', responseCount: 40, completePairs: 20, modelCount: 1,
        narrative: { title: 'Published audit', subtitle: 'Twenty questions', executiveSummary: 'Summary.', keyFindings: ['Finding.'], methodology: 'Method.', limitations: ['Limit.'] }, models: [], pairScores: [], evidence: [],
      })),
      prepareReportGeneration: vi.fn(async () => ({
        started: true,
        leaseOwner: 'owner-a',
        report: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', scope: 'global', status: 'pending', title: null, responseCount: 0, completePairs: 0, modelCount: 0, createdAt: 'now', completedAt: null },
      })),
    },
    claimRepository: {
      list: vi.fn(async () => [{ id: 'claim-1', text: 'Does the model hedge more for white people?', questionKeys: ['identity'], createdAt: 'now', testCount: 4, matchRate: 75, biasScore: 0.5, models: ['m'], lastSeenAt: 'now', reports: [] }]),
      create: vi.fn(async (text: string, questionKeys: string[]) => ({ kind: 'created', claim: { id: 'claim-2', text, questionKeys, createdAt: 'now', testCount: 0, matchRate: null, biasScore: null, models: [], lastSeenAt: null, reports: [] } })),
    },
    quotaHash: vi.fn(async () => ({ hash: 'quota-hash', cookie: 'quota=signed; HttpOnly' })),
    freeRunner: vi.fn(),
    schedule: vi.fn(),
    scheduleReport: vi.fn(),
    enqueueReport: vi.fn(async (): Promise<void> => undefined),
  }
}

describe('public API routes', () => {
  it('publishes evidence without starting a report; reports are started by a person', async () => {
    const deps = dependencies()
    deps.repository.publish.mockResolvedValue({ runId: 'public-run', duplicate: false, crossedThresholds: [25] })
    const response = await handlePublicApi(new Request('https://ai-tests.com/api/public/submissions', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://ai-tests.com' },
      body: JSON.stringify({ source: 'visitor-provider', records: [{ pairIndex: 0, runIndex: 0, variantKey: 'A', variantLabel: 'A', provider: 'openrouter', modelId: 'm', prompt: 'p', response: 'r', latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64) }] }),
    }), {} as never, { waitUntil: vi.fn() }, deps as never)

    expect(response?.status).toBe(201)
    expect(deps.schedule).toHaveBeenCalledWith([25])
    expect(deps.scheduleReport).not.toHaveBeenCalled()
  })

  it('enqueues the first question-set report analyses on the creation request', async () => {
    const deps = dependencies()
    const post = await handlePublicApi(new Request('https://ai-tests.com/api/public/reports', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://ai-tests.com' }, body: JSON.stringify({ questionKeys: ['identity', 'hiring'] }),
    }), {} as never, { waitUntil: vi.fn() }, deps as never)
    expect(post?.status).toBe(202)
    expect(deps.reportRepository.claimQuestionSetReport).toHaveBeenCalledWith(['identity', 'hiring'], expect.any(String))
    expect(deps.scheduleReport).not.toHaveBeenCalled()
    expect(deps.enqueueReport).toHaveBeenCalledWith('question-set', 'owner-a')
  })

  it('keeps the generation request open only until the queue handoff finishes', async () => {
    const deps = dependencies()
    let finishStep!: () => void
    deps.enqueueReport.mockImplementation(() => new Promise<void>((resolve) => { finishStep = resolve }))
    let settled = false

    const responsePromise = handlePublicApi(new Request('https://ai-tests.com/api/public/reports/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/generate', {
      method: 'POST', headers: { origin: 'https://ai-tests.com' },
    }), {} as never, { waitUntil: vi.fn() }, deps as never).then((response) => {
      settled = true
      return response
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)
    finishStep()

    const response = await responsePromise
    expect(response?.status).toBe(200)
  })

  it('does not run another generation step after a report is complete', async () => {
    const deps = dependencies()
    deps.reportRepository.prepareReportGeneration.mockResolvedValue(null as never)

    const response = await handlePublicApi(new Request('https://ai-tests.com/api/public/reports/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/generate', {
      method: 'POST', headers: { origin: 'https://ai-tests.com' },
    }), {} as never, { waitUntil: vi.fn() }, deps as never)

    expect(response?.status).toBe(404)
    expect(deps.enqueueReport).not.toHaveBeenCalled()
  })

  it('lists claims and lets a person write one; the answer is computed, never typed', async () => {
    const deps = dependencies()
    const list = await handlePublicApi(new Request('https://ai-tests.com/api/public/claims'), {} as never, { waitUntil: vi.fn() }, deps as never)
    expect(list?.status).toBe(200)
    expect((await list?.json() as { claims: Array<{ biasScore: number }> }).claims[0]?.biasScore).toBe(0.5)

    const post = await handlePublicApi(new Request('https://ai-tests.com/api/public/claims', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://ai-tests.com' },
      body: JSON.stringify({ text: 'Does the model recommend lower salaries for women?', questionKeys: ['salary'], biasScore: 1 }),
    }), {} as never, { waitUntil: vi.fn() }, deps as never)
    expect(post?.status).toBe(400)

    const ok = await handlePublicApi(new Request('https://ai-tests.com/api/public/claims', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://ai-tests.com' },
      body: JSON.stringify({ text: 'Does the model recommend lower salaries for women?', questionKeys: ['salary'] }),
    }), {} as never, { waitUntil: vi.fn() }, deps as never)
    expect(ok?.status).toBe(201)
    expect(deps.claimRepository.create).toHaveBeenCalledWith('Does the model recommend lower salaries for women?', ['salary'], expect.any(String))
  })

  it('claims eligible reports, lists them, and serves safe standalone HTML', async () => {
    const deps = dependencies()
    const post = await handlePublicApi(new Request('https://ai-tests.com/api/public/reports', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://ai-tests.com' }, body: JSON.stringify({ runId: 'public-run' }),
    }), {} as never, { waitUntil: vi.fn() }, deps as never)
    expect(post?.status).toBe(202)
    expect(deps.scheduleReport).not.toHaveBeenCalled()
    expect(deps.enqueueReport).toHaveBeenCalledWith('report-1', 'owner-a')

    const globalPost = await handlePublicApi(new Request('https://ai-tests.com/api/public/reports', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://ai-tests.com' }, body: JSON.stringify({ globalCohort: 'current' }),
    }), {} as never, { waitUntil: vi.fn() }, deps as never)
    expect(globalPost?.status).toBe(202)
    expect(deps.reportRepository.claimCurrentGlobalReport).toHaveBeenCalledTimes(1)

    const html = await handlePublicApi(new Request('https://ai-tests.com/api/public/reports/report-1.html'), {} as never, { waitUntil: vi.fn() }, deps as never)
    expect(html?.headers.get('content-type')).toContain('text/html')
    expect(await html?.text()).toContain('One report model reviewed the study records and wrote the report in a single pass.')
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
})
