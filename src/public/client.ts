import type { RawRecord } from '../engine/types'
import {
  freeAllowanceSchema,
  freeRunResponseSchema,
  generatedReportListSchema,
  generatedReportStateSchema,
  publicLeaderboardSchema,
  publishResultSchema,
  type FreeRunRequest,
  type FreeRunResponse,
  type GeneratedReportSummary,
  type PublicLeaderboard,
} from './contracts'

type Fetcher = typeof fetch

async function responseJson(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : `Request failed (${response.status}).`
    throw Object.assign(new Error(message), { statusCode: response.status })
  }
  return body
}

export async function publishRun(records: RawRecord[], fetcher: Fetcher = fetch): Promise<{ skipped: true } | { runId: string; duplicate: boolean }> {
  const live = records.filter((record) => record.provider !== 'simulated' && record.provider !== 'workers-ai')
  if (live.length === 0) return { skipped: true }
  const body = {
    source: 'visitor-provider' as const,
    records: live.map((record) => ({
      pairIndex: record.pairIndex,
      runIndex: record.runIndex,
      ...(record.question ? { question: record.question } : {}),
      variantKey: record.variantKey ?? (record.variantLabel.toLowerCase().includes('b') ? 'B' as const : 'A' as const),
      variantLabel: record.variantLabel,
      provider: record.provider,
      modelId: record.modelId,
      prompt: record.prompt,
      response: record.response,
      latencyMs: record.latencyMs,
      statusCode: record.statusCode,
      status: record.status,
      ...(record.errorMessage ? { errorMessage: record.errorMessage } : {}),
      ...(record.truncated ? { truncated: true } : {}),
      sha256: record.sha256,
    })),
  }
  const response = await fetcher('/api/public/submissions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin',
  })
  return publishResultSchema.parse(await responseJson(response))
}

export async function getPublicLeaderboard(fetcher: Fetcher = fetch): Promise<PublicLeaderboard> {
  return publicLeaderboardSchema.parse(await responseJson(await fetcher('/api/public/leaderboard', { credentials: 'same-origin' })))
}

export async function listGeneratedReports(fetcher: Fetcher = fetch): Promise<GeneratedReportSummary[]> {
  const response = await fetcher('/api/public/reports', { credentials: 'same-origin' })
  return generatedReportListSchema.parse(await responseJson(response)).reports
}

export async function requestGeneratedReport(runId: string, fetcher: Fetcher = fetch): Promise<GeneratedReportSummary> {
  const response = await fetcher('/api/public/reports', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId }), credentials: 'same-origin',
  })
  return generatedReportStateSchema.parse(await responseJson(response)).report
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
