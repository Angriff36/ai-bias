import { z } from 'zod'

export const publicEvidenceInputSchema = z.object({
  pairIndex: z.number().int().min(0).max(49),
  runIndex: z.number().int().min(0).max(20),
  question: z.string().max(1_000).optional(),
  variantKey: z.enum(['A', 'B']),
  variantLabel: z.string().min(1).max(200),
  provider: z.string().min(1).max(80),
  modelId: z.string().min(1).max(240),
  prompt: z.string().min(1).max(4_000),
  response: z.string().max(32_000),
  latencyMs: z.number().int().min(0).max(3_600_000),
  statusCode: z.number().int().min(0).max(599),
  status: z.enum(['ok', 'error']),
  errorMessage: z.string().max(2_000).optional(),
  truncated: z.boolean().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
})

export const publicSubmissionSchema = z.object({
  source: z.enum(['visitor-provider', 'free-trial']),
  records: z.array(publicEvidenceInputSchema).min(1).max(100),
})

export const freeRunRequestSchema = z.object({
  question: z.string().max(1_000).default(''),
  promptA: z.string().min(1).max(500),
  promptB: z.string().min(1).max(500),
  labelA: z.string().min(1).max(200).default('Prompt A'),
  labelB: z.string().min(1).max(200).default('Prompt B'),
}).superRefine((value, ctx) => {
  if (value.promptA === value.promptB) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['promptB'], message: 'Prompt B must differ from Prompt A.' })
  }
})

export type PublicEvidenceInput = z.infer<typeof publicEvidenceInputSchema>
export type PublicSubmission = z.infer<typeof publicSubmissionSchema>
export type FreeRunRequest = z.infer<typeof freeRunRequestSchema>

export interface PublicModelAggregate {
  provider: string
  modelId: string
  responseCount: number
  completePairs: number
  asymmetricPairs: number
  asymmetryRate: number | null
  answeredCount: number
  refusalCount: number
  errorCount: number
  truncatedCount: number
  averageLatencyMs: number | null
  firstSeenAt: string
  lastSeenAt: string
}

export interface PublicEvidenceItem extends PublicEvidenceInput {
  id: string
  runId: string
  classification: 'hard-refusal' | 'soft-refusal' | 'empty' | 'error' | 'answered'
  receivedAt: string
}

export interface PublicAnalysisSnapshot {
  threshold: number
  modelId: string
  analysis: string
  completedAt: string
}

export interface PublicLeaderboard {
  totals: { runs: number; responses: number; completePairs: number; models: number }
  models: PublicModelAggregate[]
  latestAnalysis: PublicAnalysisSnapshot | null
  analysisPending: boolean
  recentEvidence: PublicEvidenceItem[]
}

export interface FreeRunRecord {
  variantKey: 'A' | 'B'
  content: string
  statusCode: number
  latencyMs: number
  truncated: boolean
  sha256: string
}

export interface FreeRunResponse {
  provider: 'workers-ai'
  modelId: string
  records: [FreeRunRecord, FreeRunRecord]
  remaining: number
  dailyRemaining: number
}

export const freeAllowanceSchema = z.object({
  remaining: z.number().int().min(0).max(2),
  dailyRemaining: z.number().int().min(0).max(250),
})

export const publishResultSchema = z.object({
  runId: z.string().min(1),
  duplicate: z.boolean(),
})

export const freeRunResponseSchema: z.ZodType<FreeRunResponse> = z.object({
  provider: z.literal('workers-ai'),
  modelId: z.string().min(1),
  records: z.tuple([
    z.object({ variantKey: z.literal('A'), content: z.string(), statusCode: z.number().int(), latencyMs: z.number().int(), truncated: z.boolean(), sha256: z.string() }),
    z.object({ variantKey: z.literal('B'), content: z.string(), statusCode: z.number().int(), latencyMs: z.number().int(), truncated: z.boolean(), sha256: z.string() }),
  ]),
  remaining: z.number().int().min(0),
  dailyRemaining: z.number().int().min(0),
})

export const publicLeaderboardSchema: z.ZodType<PublicLeaderboard> = z.object({
  totals: z.object({ runs: z.number().int(), responses: z.number().int(), completePairs: z.number().int(), models: z.number().int() }),
  models: z.array(z.object({
    provider: z.string(), modelId: z.string(), responseCount: z.number().int(), completePairs: z.number().int(),
    asymmetricPairs: z.number().int(), asymmetryRate: z.number().nullable(), answeredCount: z.number().int(),
    refusalCount: z.number().int(), errorCount: z.number().int(), truncatedCount: z.number().int(),
    averageLatencyMs: z.number().nullable(), firstSeenAt: z.string(), lastSeenAt: z.string(),
  })),
  latestAnalysis: z.object({ threshold: z.number().int(), modelId: z.string(), analysis: z.string(), completedAt: z.string() }).nullable(),
  analysisPending: z.boolean(),
  recentEvidence: z.array(publicEvidenceInputSchema.extend({
    id: z.string(), runId: z.string(), classification: z.enum(['hard-refusal', 'soft-refusal', 'empty', 'error', 'answered']), receivedAt: z.string(),
  })),
})
