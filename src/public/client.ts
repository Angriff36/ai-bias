import type { RawRecord } from '../engine/types'
import {
  freeAllowanceSchema,
  freeRunResponseSchema,
  generatedReportListSchema,
  generatedReportStateSchema,
  publicClaimListSchema,
  publicClaimSchema,
  publicLeaderboardSchema,
  publicQuestionDetailSchema,
  publishResultSchema,
  type FreeRunRequest,
  type FreeRunResponse,
  type GeneratedReportSummary,
  type PublicClaim,
  type PublicClaimRequest,
  type PublicLeaderboard,
  type PublicQuestionDetail,
} from './contracts'
import { invalidatePublicCache, readPublicCache, writePublicCache } from './publicApiCache'
import { PublicSubmissionChunks, truncateForPublication } from './publishChunks'

type Fetcher = typeof fetch

const PUBLIC_UNAVAILABLE = 'Public evidence could not be loaded. Refresh the page, or run the full local site with npm start.'

async function responseJson(response: Response): Promise<unknown> {
  const text = await response.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    throw Object.assign(new Error(response.ok ? PUBLIC_UNAVAILABLE : `Request failed (${response.status}).`), { statusCode: response.status })
  }
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : `Request failed (${response.status}).`
    throw Object.assign(new Error(message), { statusCode: response.status })
  }
  return body
}

function readPublicPayload<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new Error(PUBLIC_UNAVAILABLE)
  return parsed.data
}

export async function publishRun(records: RawRecord[], fetcher: Fetcher = fetch): Promise<{ skipped: true } | { runId: string; duplicate: boolean }> {
  const chunks = PublicSubmissionChunks.split(await truncateForPublication(records))
  if (chunks.length === 0) return { skipped: true }
  try {
    let last = { runId: '', duplicate: false }
    for (const chunk of chunks) {
      const response = await fetcher('/api/public/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'visitor-provider',
          records: PublicSubmissionChunks.payload(chunk),
          ...(last.runId ? { continueRunId: last.runId } : {}),
        }),
        credentials: 'same-origin',
      })
      last = publishResultSchema.parse(await responseJson(response))
    }
    return last
  } finally {
    invalidatePublicCache('leaderboard')
    invalidatePublicCache('reports')
    invalidatePublicCache('question:')
  }
}

export async function getPublicLeaderboard(fetcher: Fetcher = fetch): Promise<PublicLeaderboard> {
  const cached = readPublicCache<PublicLeaderboard>('leaderboard')
  if (cached?.status === 'fresh') return cached.data
  const data = readPublicPayload(publicLeaderboardSchema, await responseJson(await fetcher('/api/public/leaderboard', { credentials: 'same-origin' })))
  writePublicCache('leaderboard', data)
  return data
}

export async function getPublicQuestionDetail(questionKey: string, fetcher: Fetcher = fetch): Promise<PublicQuestionDetail> {
  const cacheKey = `question:${questionKey}`
  const cached = readPublicCache<PublicQuestionDetail>(cacheKey)
  if (cached?.status === 'fresh') return cached.data
  const response = await fetcher(`/api/public/questions/${encodeURIComponent(questionKey)}`, { credentials: 'same-origin' })
  const body = await responseJson(response) as { question?: PublicQuestionDetail }
  const detail = publicQuestionDetailSchema.parse(body.question)
  writePublicCache(cacheKey, detail)
  return detail
}

export async function listGeneratedReports(fetcher: Fetcher = fetch): Promise<GeneratedReportSummary[]> {
  const cached = readPublicCache<GeneratedReportSummary[]>('reports')
  if (cached?.status === 'fresh') return cached.data
  const response = await fetcher('/api/public/reports', { credentials: 'same-origin' })
  const reports = generatedReportListSchema.parse(await responseJson(response)).reports
  writePublicCache('reports', reports)
  return reports
}

export async function requestGeneratedReport(runId: string, fetcher: Fetcher = fetch): Promise<GeneratedReportSummary> {
  const response = await fetcher('/api/public/reports', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId }), credentials: 'same-origin',
  })
  return generatedReportStateSchema.parse(await responseJson(response)).report
}

/** Start a report over a person-chosen set of leaderboard questions. */
export async function requestQuestionSetReport(questionKeys: string[], fetcher: Fetcher = fetch): Promise<GeneratedReportSummary> {
  const response = await fetcher('/api/public/reports', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionKeys }), credentials: 'same-origin',
  })
  invalidatePublicCache('reports')
  return generatedReportStateSchema.parse(await responseJson(response)).report
}

export async function listClaims(fetcher: Fetcher = fetch): Promise<PublicClaim[]> {
  const cached = readPublicCache<PublicClaim[]>('claims')
  if (cached?.status === 'fresh') return cached.data
  const response = await fetcher('/api/public/claims', { credentials: 'same-origin' })
  const claims = publicClaimListSchema.parse(await responseJson(response)).claims
  writePublicCache('claims', claims)
  return claims
}

export async function createClaim(input: PublicClaimRequest, fetcher: Fetcher = fetch): Promise<PublicClaim> {
  const response = await fetcher('/api/public/claims', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), credentials: 'same-origin',
  })
  const body = await responseJson(response) as { claim?: unknown }
  invalidatePublicCache('claims')
  return publicClaimSchema.parse(body.claim)
}

export async function getFreeAllowance(fetcher: Fetcher = fetch): Promise<{ remaining: number; dailyRemaining: number }> {
  return freeAllowanceSchema.parse(await responseJson(await fetcher('/api/public/free-run', { credentials: 'same-origin' })))
}

export async function runFreePair(input: FreeRunRequest, fetcher: Fetcher = fetch): Promise<FreeRunResponse> {
  const response = await fetcher('/api/public/free-run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), credentials: 'same-origin',
  })
  return freeRunResponseSchema.parse(await responseJson(response))
}
