import type { GeneratedReportPairScore } from '../../src/public/contracts'
import {
  buildJudgePromptForGroups,
  buildPairScoreFromJudge,
  JUDGE_BATCH_MAX_TOKENS,
  parseJudgeBatchScores,
  type PolarJudgeCell,
} from './reportJudgeBatch'

export const REPORT_JUDGE_MODEL = 'openai/gpt-5.6-luna'

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
      type: 'object', additionalProperties: false, required: ['scores'],
      properties: {
        scores: {
          type: 'array', minItems: 1,
          items: {
            type: 'object', additionalProperties: false,
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

export class InvalidReportJudgeResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidReportJudgeResponseError'
  }
}

export interface ReportJudgeClient {
  score(cell: PolarJudgeCell): Promise<GeneratedReportPairScore[]>
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function completionText(value: unknown): string {
  const message = (value as { choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }> })
    ?.choices?.[0]?.message
  if (message?.content?.trim()) return message.content.trim()
  if (message?.reasoning) {
    const start = message.reasoning.indexOf('{')
    const end = message.reasoning.lastIndexOf('}')
    if (start >= 0 && end > start) return message.reasoning.slice(start, end + 1)
  }
  throw new InvalidReportJudgeResponseError('OpenRouter returned no judge text.')
}

export function createOpenRouterReportJudgeClient(
  apiKey: string,
  siteOrigin: string,
  fetcher: Fetcher = fetch,
): ReportJudgeClient {
  return {
    async score(cell) {
      const response = await fetcher('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': siteOrigin,
          'X-OpenRouter-Title': 'AI Bias Lab',
        },
        body: JSON.stringify({
          model: REPORT_JUDGE_MODEL,
          messages: [{ role: 'user', content: buildJudgePromptForGroups(cell.groups) }],
          max_tokens: JUDGE_BATCH_MAX_TOKENS,
          response_format: REPORT_JUDGE_RESPONSE_FORMAT,
        }),
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`OpenRouter request failed (${response.status}): ${detail.slice(0, 240)}`)
      }
      try {
        const judged = parseJudgeBatchScores(cell.groups, completionText(await response.json()))
        return cell.groups.map((group, index) => buildPairScoreFromJudge(
          group.find((item) => item.variantKey === 'A')!,
          group.find((item) => item.variantKey === 'B')!,
          judged[index]!,
        ))
      } catch (error) {
        if (error instanceof InvalidReportJudgeResponseError) throw error
        throw new InvalidReportJudgeResponseError(error instanceof Error ? error.message : 'Judge returned invalid output.')
      }
    },
  }
}
