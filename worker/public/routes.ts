import { freeRunRequestSchema, generatedReportRequestSchema, publicQuestionDetailSchema, publicSubmissionSchema } from '../../src/public/contracts'
import { scheduleAnalysis, type AiBindingLike, type ExecutionContextLike } from './analysis'
import type { D1DatabaseLike } from './d1'
import { quotaIdentity, runFreePair } from './freeRun'
import { PublicRepository } from './repository'
import { scheduleReportGeneration, generateReport } from './reportGeneration'
import { renderReportHtml } from './reportHtml'
import { GeneratedReportRepository } from './reportRepository'
import { createReportModelClient } from './reportModelClient'
import { CURATED_REPORTS } from './curatedReports'
import { readCachedReports, writeCachedReports } from './readCache'

const PUBLIC_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300'

export interface PublicWorkerEnv {
  PUBLIC_DB: D1DatabaseLike
  AI: AiBindingLike
  QUOTA_HMAC_SECRET: string
  OPENROUTER_API_KEY: string
}

const json = (body: unknown, status = 200, extraHeaders?: HeadersInit) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': status >= 400 ? 'no-store' : 'no-store', ...extraHeaders },
})

async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > 524_288) throw new Error('PAYLOAD_TOO_LARGE')
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) throw new Error('JSON_REQUIRED')
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > 524_288) throw new Error('PAYLOAD_TOO_LARGE')
  return JSON.parse(text)
}

export async function handlePublicApi(
  request: Request,
  env: PublicWorkerEnv,
  context: ExecutionContextLike,
  injected?: {
    repository: Pick<PublicRepository, 'publish' | 'getLeaderboard' | 'getQuestionDetail' | 'getAllowance'>
    reportRepository: Pick<GeneratedReportRepository, 'claimRunReport' | 'claimCurrentGlobalReport' | 'evaluateGlobalReportAfterPublish' | 'listReports' | 'getReportDocument'>
    quotaHash(request: Request, secret: string): Promise<{ hash: string; cookie?: string }>
    freeRunner: typeof runFreePair
    schedule(thresholds: number[]): void
    scheduleReport(reportId: string): void
  },
): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/public/')) return null
  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin) return json({ error: 'Cross-origin requests are not allowed.' }, 403)
  const repository = injected?.repository ?? new PublicRepository(env.PUBLIC_DB)
  const reportRepository = injected?.reportRepository ?? new GeneratedReportRepository(env.PUBLIC_DB)
  const quotaHash = injected?.quotaHash ?? quotaIdentity
  const reportSchedule = injected?.scheduleReport ?? ((reportId: string) => {
    const models = createReportModelClient(env.OPENROUTER_API_KEY, url.origin)
    scheduleReportGeneration(models, context, new GeneratedReportRepository(env.PUBLIC_DB), reportId)
  })

  try {
    if (url.pathname === '/api/public/leaderboard' && request.method === 'GET') {
      const response = json(await repository.getLeaderboard())
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
    if (url.pathname === '/api/public/reports' && request.method === 'GET') {
      const cached = readCachedReports()
      const reports = cached ?? [...CURATED_REPORTS, ...await reportRepository.listReports()]
      if (!cached) writeCachedReports(reports)
      const response = json({ reports })
      response.headers.set('Cache-Control', PUBLIC_CACHE_CONTROL)
      return response
    }
    if (url.pathname === '/api/public/reports' && request.method === 'POST') {
      const parsed = generatedReportRequestSchema.parse(await readJson(request))
      const now = new Date().toISOString()
      const claim = parsed.globalCohort != null
        ? await reportRepository.claimCurrentGlobalReport(now)
        : await reportRepository.claimRunReport(parsed.runId!, now)
      if (claim.kind === 'ineligible') {
        return json(parsed.globalCohort != null
          ? { error: 'Global reports require at least 10 reportable matched questions.', reportableQuestions: claim.reportableQuestions }
          : { error: 'A full report requires at least 20 complete matched questions.', completeQuestions: claim.completeQuestions }, 422)
      }
      if (claim.kind === 'not-due') {
        return json({ error: 'No material new evidence yet for another global report.', reportableQuestions: claim.reportableQuestions }, 200)
      }
      if (claim.kind === 'unchanged') return json({ report: claim.report }, 200)
      if (claim.kind === 'limited') return json({ error: 'The daily report-generation limit has been reached. Existing reports remain available.' }, 429)
      if (claim.kind === 'claimed') reportSchedule(claim.report.id)
      return json({ report: claim.report }, claim.kind === 'claimed' ? 202 : 200)
    }
    const regenerate = url.pathname.match(/^\/api\/public\/reports\/([0-9a-f-]{36})\/generate$/)
    if (regenerate && request.method === 'POST') {
      const now = new Date().toISOString()
      const reportId = regenerate[1]
      const report = await reportRepository.prepareReportGeneration(reportId, now)
      if (!report) return json({ error: 'Report not found or already complete.' }, 404)
      try {
        const models = createReportModelClient(env.OPENROUTER_API_KEY, url.origin)
        const source = await reportRepository.getReportEvidence(reportId)
        const document = await generateReport(models, source)
        await reportRepository.completeReport(reportId, document, now)
        return json({ report: { ...report, status: 'complete', title: document.narrative.title, responseCount: document.responseCount, completePairs: document.completePairs, modelCount: document.modelCount, completedAt: now } }, 200)
      } catch (error) {
        const code = error instanceof Error && error.message.includes('invalid') ? 'invalid-model-output' : 'generation-failed'
        await reportRepository.failReport(reportId, code)
        return json({ error: 'Report generation failed.', code }, 500)
      }
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
      const result = await repository.publish(parsed, new Date().toISOString())
      const runSchedule = injected?.schedule ?? ((thresholds: number[]) => scheduleAnalysis(env.AI, context, repository as PublicRepository, thresholds))
      if (result.crossedThresholds.length) runSchedule(result.crossedThresholds)
      try {
        const claim = await reportRepository.evaluateGlobalReportAfterPublish(new Date().toISOString())
        if (claim.kind === 'claimed') reportSchedule(claim.report.id)
      } catch {
        // Evidence ingestion succeeds independently of report generation.
      }
      return json({ runId: result.runId, duplicate: result.duplicate }, result.duplicate ? 200 : 201)
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
