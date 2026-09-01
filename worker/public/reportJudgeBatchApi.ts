import type { GeneratedReportPairScore } from '../../src/public/contracts'
import {
  buildJudgePromptForGroups,
  buildPairScoreFromJudge,
  JUDGE_BATCH_MAX_TOKENS,
  parseJudgeBatchScores,
  type PolarJudgeCell,
} from './reportJudgeBatch'

export const OPENROUTER_BATCH_ENDPOINT = '/v1/chat/completions'

const dimensionSchema = { type: 'integer', minimum: 0, maximum: 3 } as const
const dimensionProperties = {
  dangerFraming: dimensionSchema,
  sympathy: dimensionSchema,
  skepticism: dimensionSchema,
  collectiveBlame: dimensionSchema,
  moralCondemnation: dimensionSchema,
  antiStereotyping: dimensionSchema,
  acknowledgesDiscrimination: dimensionSchema,
}
const dimensionKeys = Object.keys(dimensionProperties)

export const REPORT_JUDGE_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'report_judge_scores',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['scores'],
      properties: {
        scores: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['pairSampleId', 'variantA', 'variantB', 'note'],
            properties: {
              pairSampleId: { type: 'string', minLength: 1 },
              variantA: { type: 'object', additionalProperties: false, required: dimensionKeys, properties: dimensionProperties },
              variantB: { type: 'object', additionalProperties: false, required: dimensionKeys, properties: dimensionProperties },
              note: { type: 'string', minLength: 5, maxLength: 600 },
            },
          },
        },
      },
    },
  },
} as const

export interface OpenRouterJudgeBatchRequest {
  endpoint: typeof OPENROUTER_BATCH_ENDPOINT
  model: string
  requests: Array<{
    custom_id: string
    body: {
      model: string
      messages: Array<{ role: 'user'; content: string }>
      max_tokens: number
      response_format: typeof REPORT_JUDGE_RESPONSE_FORMAT
    }
  }>
}

export interface OpenRouterBatchResult {
  custom_id: string
  response?: {
    status_code?: number
    body?: unknown
    [key: string]: unknown
  } | null
  error?: unknown
  [key: string]: unknown
}

export interface OpenRouterBatch {
  id: string
  status: string
  results?: OpenRouterBatchResult[] | null
}

export interface OpenRouterJudgeBatchClient {
  submit(request: OpenRouterJudgeBatchRequest): Promise<OpenRouterBatch>
  retrieve(batchId: string): Promise<OpenRouterBatch>
}

async function cellDigest(cell: PolarJudgeCell): Promise<string> {
  const value = `${cell.question}\u0000${cell.provider}\u0000${cell.modelId}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].slice(0, 10).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function buildReportJudgeCustomId(reportId: string, cell: PolarJudgeCell): Promise<string> {
  return `${reportId}:${await cellDigest(cell)}`
}

export async function buildOpenRouterJudgeBatchRequest(
  reportId: string,
  modelId: string,
  cells: PolarJudgeCell[],
): Promise<OpenRouterJudgeBatchRequest> {
  const requests = await Promise.all(cells.map(async (cell) => ({
    custom_id: await buildReportJudgeCustomId(reportId, cell),
    body: {
      model: modelId,
      messages: [{ role: 'user' as const, content: buildJudgePromptForGroups(cell.groups) }],
      max_tokens: JUDGE_BATCH_MAX_TOKENS,
      response_format: REPORT_JUDGE_RESPONSE_FORMAT,
    },
  })))
  return { endpoint: OPENROUTER_BATCH_ENDPOINT, model: modelId, requests }
}

function completionContent(result: OpenRouterBatchResult): string {
  if (result.error) throw new Error('OpenRouter Batch entry failed.')
  const response = result.response
  if (!response || (response.status_code != null && response.status_code >= 400)) {
    throw new Error('OpenRouter Batch entry returned no successful response.')
  }
  const body = response.body ?? response
  if (!body || typeof body !== 'object') throw new Error('OpenRouter Batch entry returned no body.')
  const choices = (body as { choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }> }).choices
  const message = choices?.[0]?.message
  const content = message?.content?.trim()
  if (content) return content
  const reasoning = message?.reasoning
  if (reasoning) {
    const start = reasoning.indexOf('{')
    const end = reasoning.lastIndexOf('}')
    if (start >= 0 && end > start) return reasoning.slice(start, end + 1)
  }
  throw new Error('OpenRouter Batch entry returned no judge text.')
}

export function parseOpenRouterJudgeResult(
  cell: PolarJudgeCell,
  result: OpenRouterBatchResult,
): GeneratedReportPairScore[] {
  const judged = parseJudgeBatchScores(cell.groups, completionContent(result))
  return cell.groups.map((group, index) => {
    const variantA = group.find((item) => item.variantKey === 'A')!
    const variantB = group.find((item) => item.variantKey === 'B')!
    return buildPairScoreFromJudge(variantA, variantB, judged[index]!)
  })
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export function createOpenRouterJudgeBatchClient(
  apiKey: string,
  siteOrigin: string,
  fetcher: Fetcher = fetch,
): OpenRouterJudgeBatchClient {
  const request = async (url: string, init?: RequestInit): Promise<OpenRouterBatch> => {
    const response = await fetcher(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': siteOrigin,
        'X-OpenRouter-Title': 'AI Bias Lab',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`OpenRouter Batch request failed (${response.status}): ${detail.slice(0, 240)}`)
    }
    const batch = await response.json() as OpenRouterBatch
    if (!batch?.id || !batch.status) throw new Error('OpenRouter Batch returned an invalid response.')
    return batch
  }
  return {
    submit: (payload) => request('https://openrouter.ai/api/beta/batches', {
      method: 'POST', body: JSON.stringify(payload),
    }),
    retrieve: (batchId) => request(`https://openrouter.ai/api/beta/batches/${encodeURIComponent(batchId)}`, { method: 'GET' }),
  }
}
