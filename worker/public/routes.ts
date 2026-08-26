import { freeRunRequestSchema, generatedReportRequestSchema, publicSubmissionSchema } from '../../src/public/contracts'
import { scheduleAnalysis, type AiBindingLike, type ExecutionContextLike } from './analysis'
import type { D1DatabaseLike } from './d1'
import { quotaIdentity, runFreePair } from './freeRun'
import { PublicRepository } from './repository'
import { scheduleReportGeneration } from './reportGeneration'
import { renderReportHtml } from './reportHtml'
import { GeneratedReportRepository } from './reportRepository'

export interface PublicWorkerEnv {
  PUBLIC_DB: D1DatabaseLike
  AI: AiBindingLike
  QUOTA_HMAC_SECRET: string
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
    repository: Pick<PublicRepository, 'publish' | 'getLeaderboard' | 'getAllowance'>
    reportRepository: Pick<GeneratedReportRepository, 'claimRunReport' | 'claimGlobalReport' | 'listReports' | 'getReportDocument'>
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
  const reportSchedule = injected?.scheduleReport ?? ((reportId: string) => scheduleReportGeneration(env.AI, context, new GeneratedReportRepository(env.PUBLIC_DB), reportId))

  try {
    if (url.pathname === '/api/public/leaderboard' && request.method === 'GET') {
      const response = json(await repository.getLeaderboard())
      response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
      return response
    }
    if (url.pathname === '/api/public/reports' && request.method === 'GET') {
      const response = json({ reports: await reportRepository.listReports() })
      response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
      return response
    }
    if (url.pathname === '/api/public/reports' && request.method === 'POST') {
      const parsed = generatedReportRequestSchema.parse(await readJson(request))
      const claim = await reportRepository.claimRunReport(parsed.runId, new Date().toISOString())
      if (claim.kind === 'ineligible') {
        return json({ error: 'A full report requires at least 20 complete matched questions.', completeQuestions: claim.completeQuestions }, 422)
      }
      if (claim.kind === 'limited') return json({ error: 'The daily report-generation limit has been reached. Existing reports remain available.' }, 429)
      if (claim.kind === 'claimed') reportSchedule(claim.report.id)
      return json({ report: claim.report }, claim.kind === 'claimed' ? 202 : 200)
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
      for (const threshold of result.crossedResponseReportThresholds) {
        try {
          const claim = await reportRepository.claimGlobalReport(threshold, new Date().toISOString())
          if (claim.kind === 'claimed') reportSchedule(claim.report.id)
        } catch {
          // Evidence ingestion succeeds independently of report generation.
        }
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
