import { freeRunRequestSchema, generatedReportRequestSchema, publicClaimRequestSchema, publicQuestionDetailSchema, publicQuestionProposalRequestSchema, publicSubmissionSchema } from '../../src/public/contracts'
import { scheduleAnalysis, type AiBindingLike, type ExecutionContextLike } from './analysis'
import type { D1DatabaseLike } from './d1'
import { quotaIdentity, runFreePair } from './freeRun'
import { PublicRepository } from './repository'
import { renderReportHtml } from './reportHtml'
import { GeneratedReportRepository } from './reportRepository'
import { enqueueReportAnalyses, type ReportQueueProducer } from './reportQueue'
import { CURATED_REPORTS } from './curatedReports'
import { invalidateCachedReports, readCachedReports, writeCachedReports } from './readCache'
import { ClaimRepository } from './claimRepository'
import type { ClaimListOptions } from './claimRepository'
import { createOpenRouterClaimEvaluator } from './claimAdjudication'
import { QuestionProposalRepository } from './questionProposalRepository'

const PUBLIC_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300'

export interface PublicWorkerEnv {
  PUBLIC_DB: D1DatabaseLike
  AI: AiBindingLike
  QUOTA_HMAC_SECRET: string
  OPENROUTER_API_KEY: string
  REPORT_GENERATION_QUEUE: ReportQueueProducer
}

const json = (body: unknown, status = 200, extraHeaders?: HeadersInit) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': status >= 400 ? 'no-store' : 'no-store', ...extraHeaders },
})

async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > 1_048_576) throw new Error('PAYLOAD_TOO_LARGE')
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) throw new Error('JSON_REQUIRED')
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > 1_048_576) throw new Error('PAYLOAD_TOO_LARGE')
  return JSON.parse(text)
}

export async function handlePublicApi(
  request: Request,
  env: PublicWorkerEnv,
  context: ExecutionContextLike,
  injected?: {
    repository: Pick<PublicRepository, 'publish' | 'getLeaderboard' | 'getQuestionDetail' | 'getAllowance' | 'getQuestionTimeline' | 'getModelTimeline'>
    reportRepository: Pick<GeneratedReportRepository, 'claimRunReport' | 'claimCurrentGlobalReport' | 'claimQuestionSetReport' | 'listReports' | 'getReportDocument' | 'prepareReportGeneration'>
    claimRepository?: Pick<ClaimRepository, 'create'> & {
      list(options?: ClaimListOptions): ReturnType<ClaimRepository['list']>
    }
    questionProposalRepository?: Pick<QuestionProposalRepository, 'create' | 'list' | 'get' | 'reconcilePublishedRun'>
    quotaHash(request: Request, secret: string): Promise<{ hash: string; cookie?: string }>
    freeRunner: typeof runFreePair
    schedule(thresholds: number[]): void
    enqueueReport?(reportId: string, leaseOwner: string): Promise<void>
  },
): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/public/')) return null
  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin) return json({ error: 'Cross-origin requests are not allowed.' }, 403)
  const repository = injected?.repository ?? new PublicRepository(env.PUBLIC_DB)
  const reportRepository = injected?.reportRepository ?? new GeneratedReportRepository(env.PUBLIC_DB)
  const claimRepository = injected?.claimRepository ?? new ClaimRepository(
    env.PUBLIC_DB,
    createOpenRouterClaimEvaluator(env.OPENROUTER_API_KEY, url.origin),
  )
  const questionProposalRepository = injected?.questionProposalRepository ?? new QuestionProposalRepository(env.PUBLIC_DB)
  const quotaHash = injected?.quotaHash ?? quotaIdentity
  const enqueueReport = injected?.enqueueReport ?? (async (reportId: string, leaseOwner: string) => {
    await enqueueReportAnalyses(env.REPORT_GENERATION_QUEUE, reportRepository as GeneratedReportRepository, reportId, leaseOwner)
  })
  const runClaimedReport = async (reportId: string, now: string) => {
    const prepared = await reportRepository.prepareReportGeneration(reportId, now)
    if (prepared?.started && prepared.leaseOwner) await enqueueReport(reportId, prepared.leaseOwner)
    return (await reportRepository.listReports()).find((report) => report.id === reportId) ?? prepared?.report
  }

  try {
    if (url.pathname === '/api/public/leaderboard' && request.method === 'GET') {
      const response = json(await repository.getLeaderboard())
      response.headers.set('Cache-Control', PUBLIC_CACHE_CONTROL)
      return response
    }
    if (url.pathname === '/api/public/question-proposals' && request.method === 'GET') {
      const status = url.searchParams.get('status') === 'answered' ? 'answered' : 'unanswered'
      const response = json({ proposals: await questionProposalRepository.list(status) })
      response.headers.set('Cache-Control', PUBLIC_CACHE_CONTROL)
      return response
    }
    if (url.pathname === '/api/public/question-proposals' && request.method === 'POST') {
      const parsed = publicQuestionProposalRequestSchema.parse(await readJson(request))
      const created = await questionProposalRepository.create(parsed, new Date().toISOString())
      return json({ proposal: created.proposal }, created.kind === 'duplicate' ? 200 : 201)
    }
    const proposalDetail = url.pathname.match(/^\/api\/public\/question-proposals\/([0-9a-f-]{36})$/)
    if (proposalDetail && request.method === 'GET') {
      const proposal = await questionProposalRepository.get(proposalDetail[1])
      if (!proposal) return json({ error: 'Question proposal not found.' }, 404)
      const response = json({ proposal })
      response.headers.set('Cache-Control', PUBLIC_CACHE_CONTROL)
      return response
    }
    const questionDetail = url.pathname.match(/^\/api\/public\/questions\/([^/]+)$/)
    if (questionDetail && request.method === 'GET') {
      const detail = await repository.getQuestionDetail(decodeURIComponent(questionDetail[1]))
      if (!detail) return json({ error: 'Question not found.' }, 404)
      const response = json({ question: publicQuestionDetailSchema.parse(detail) })
      response.headers.set('Cache-Control', PUBLIC_CACHE_CONTROL)
      return response
    }
    if (url.pathname === '/api/public/behavior-timeline' && request.method === 'GET') {
      const questionKey = url.searchParams.get('questionKey')?.trim() ?? ''
      const provider = url.searchParams.get('provider')?.trim() ?? ''
      const modelId = url.searchParams.get('modelId')?.trim() ?? ''
      const modelScope = provider !== '' && modelId !== ''
      if (questionKey !== '' === modelScope) {
        return json({ error: 'Provide either questionKey, or provider and modelId.' }, 400)
      }
      if (questionKey.length > 1_000 || provider.length > 80 || modelId.length > 240) {
        return json({ error: 'The requested scope is too long.' }, 400)
      }
      const timeline = modelScope
        ? await repository.getModelTimeline(provider, modelId)
        : await repository.getQuestionTimeline(questionKey)
      if (!timeline) return json({ error: 'No stored answers match this scope.' }, 404)
      const response = json({ timeline })
      response.headers.set('Cache-Control', PUBLIC_CACHE_CONTROL)
      return response
    }
    if (url.pathname === '/api/public/reports' && request.method === 'GET') {
      const cached = readCachedReports()
      const reports = cached ?? [...CURATED_REPORTS, ...await reportRepository.listReports()]
      if (!cached) writeCachedReports(reports)
      const response = json({ reports })
      response.headers.set('Cache-Control', reports.some((report) => report.status !== 'complete') ? 'no-store' : PUBLIC_CACHE_CONTROL)
      return response
    }
    if (url.pathname === '/api/public/reports' && request.method === 'POST') {
      const parsed = generatedReportRequestSchema.parse(await readJson(request))
      const now = new Date().toISOString()
      if (parsed.questionKeys) {
        const claim = await reportRepository.claimQuestionSetReport(parsed.questionKeys, now)
        if (claim.kind === 'ineligible') return json({ error: 'None of the chosen questions has a complete matched pair to report on yet.' }, 422)
        if (claim.kind === 'limited') return json({ error: 'The daily report-generation limit has been reached. Existing reports remain available.' }, 429)
        invalidateCachedReports()
        const report = claim.kind === 'claimed' ? await runClaimedReport(claim.report.id, now) : claim.report
        return json({ report: report ?? claim.report }, claim.kind === 'claimed' ? 202 : 200)
      }
      const claim = parsed.globalCohort != null
        ? await reportRepository.claimCurrentGlobalReport(now)
        : await reportRepository.claimRunReport(parsed.runId!, now)
      if (claim.kind === 'ineligible') {
        if (parsed.globalCohort != null) {
          const global = claim as Extract<typeof claim, { kind: 'ineligible'; reportableQuestions: number }>
          return json({ error: 'Global reports require at least 10 reportable matched questions.', reportableQuestions: global.reportableQuestions }, 422)
        }
        const run = claim as Extract<typeof claim, { kind: 'ineligible'; completeQuestions: number }>
        return json({ error: 'A full report requires at least 20 complete matched questions.', completeQuestions: run.completeQuestions }, 422)
      }
      if (claim.kind === 'not-due') {
        return json({ error: 'No material new evidence yet for another global report.', reportableQuestions: claim.reportableQuestions }, 200)
      }
      if (claim.kind === 'unchanged') return json({ report: claim.report }, 200)
      if (claim.kind === 'limited') return json({ error: 'The daily report-generation limit has been reached. Existing reports remain available.' }, 429)
      invalidateCachedReports()
      const report = claim.kind === 'claimed' ? await runClaimedReport(claim.report.id, now) : claim.report
      return json({ report: report ?? claim.report }, claim.kind === 'claimed' ? 202 : 200)
    }
    const regenerate = url.pathname.match(/^\/api\/public\/reports\/([0-9a-f-]{36})\/generate$/)
    if (regenerate && request.method === 'POST') {
      const now = new Date().toISOString()
      const reportId = regenerate[1]
      const prepared = await reportRepository.prepareReportGeneration(reportId, now)
      invalidateCachedReports()
      if (!prepared) return json({ error: 'Report not found or already complete.' }, 404)
      if (prepared.started && prepared.leaseOwner) {
        await enqueueReport(reportId, prepared.leaseOwner)
      }
      const report = (await reportRepository.listReports()).find((item) => item.id === reportId) ?? prepared.report
      return json({ report })
    }
    const reportHtml = url.pathname.match(/^\/api\/public\/reports\/([A-Za-z0-9-]+)\.html$/)
    if (reportHtml && request.method === 'GET') {
      const document = await reportRepository.getReportDocument(reportHtml[1])
      if (!document) return json({ error: 'Report not found.' }, 404)
      return new Response(renderReportHtml(document), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'",
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
    const reportDocument = url.pathname.match(/^\/api\/public\/reports\/([A-Za-z0-9-]+)$/)
    if (reportDocument && request.method === 'GET') {
      const document = await reportRepository.getReportDocument(reportDocument[1])
      return document ? json({ report: document }) : json({ error: 'Report not found.' }, 404)
    }
    if (url.pathname === '/api/public/submissions' && request.method === 'POST') {
      const parsed = publicSubmissionSchema.parse(await readJson(request))
      if (parsed.source !== 'visitor-provider') return json({ error: 'Free-trial evidence is recorded by the server.' }, 400)
      const receivedAt = new Date().toISOString()
      const result = await repository.publish(parsed, receivedAt)
      await questionProposalRepository.reconcilePublishedRun(result.runId, receivedAt)
      const runSchedule = injected?.schedule ?? ((thresholds: number[]) => scheduleAnalysis(env.AI, context, repository as PublicRepository, thresholds))
      if (result.crossedThresholds.length) runSchedule(result.crossedThresholds)
      // Reports are started by a person (VISION.md §5); publishing never starts one.
      return json({ runId: result.runId, duplicate: result.duplicate }, result.duplicate ? 200 : 201)
    }
    if (url.pathname === '/api/public/claims' && request.method === 'GET') {
      const claims = await claimRepository.list({ deferEvaluation: (run) => context.waitUntil(run()) })
      return json({ claims }, 200, { 'Cache-Control': PUBLIC_CACHE_CONTROL })
    }
    if (url.pathname === '/api/public/claims' && request.method === 'POST') {
      const parsed = publicClaimRequestSchema.parse(await readJson(request))
      const created = await claimRepository.create(parsed.text, parsed.questionKeys, new Date().toISOString())
      if (created.kind === 'limited') return json({ error: 'The daily limit for new claims has been reached. Try again tomorrow.' }, 429)
      return json({ claim: created.claim }, created.kind === 'duplicate' ? 200 : 201)
    }
    if (url.pathname === '/api/public/free-run' && request.method === 'GET') {
      const identity = await quotaHash(request, env.QUOTA_HMAC_SECRET)
      const body = await repository.getAllowance(identity.hash, new Date().toISOString().slice(0, 10))
      return json(body, 200, identity.cookie ? { 'Set-Cookie': identity.cookie } : undefined)
    }
    if (url.pathname === '/api/public/free-run' && request.method === 'POST') {
      const parsed = freeRunRequestSchema.parse(await readJson(request))
      const identity = await quotaHash(request, env.QUOTA_HMAC_SECRET)
      const runner = injected?.freeRunner ?? runFreePair
      const result = await runner(parsed, identity.hash, env.AI, repository as PublicRepository)
      return json(result.body, result.status, identity.cookie ? { 'Set-Cookie': identity.cookie } : undefined)
    }
    return json({ error: 'Not found.' }, 404)
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Request body must be valid JSON.' }, 400)
    if (error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE') return json({ error: 'Request body is too large.' }, 413)
    if (error instanceof Error && error.message === 'JSON_REQUIRED') return json({ error: 'Content-Type must be application/json.' }, 415)
    if (error && typeof error === 'object' && 'issues' in error) return json({ error: 'The public evidence payload is invalid.', issues: error.issues }, 400)
    return json({ error: 'The public evidence service is temporarily unavailable.' }, 503)
  }
}
