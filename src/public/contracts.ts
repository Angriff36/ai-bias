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
  continueRunId: z.string().uuid().optional(),
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

export interface PublicQuestionSummary {
  questionKey: string
  questionText: string
  runCount: number
  modelCount: number
  /** Stored answers on the A (reference) side of the question. */
  variantACount: number
  /** Stored answers on the B (comparison) side of the question. */
  variantBCount: number
  /** Every stored answer for the question, all groups together. */
  answerCount: number
  /** Group names (the swapped phrase values) in display order. */
  groupLabels: string[]
  lastSeenAt: string
}

export type PublicQuestionLayout = 'group' | 'pair'

export interface PublicQuestionAnswer {
  id: string
  runId: string
  /** Position inside the run: which matched question and which repeat. Rows on the question page align on these. */
  pairIndex: number
  runIndex: number
  provider: string
  modelId: string
  prompt: string
  response: string
  classification: PublicEvidenceItem['classification']
  receivedAt: string
}

/** One column on the question page: a group name and every answer it got. */
export interface PublicQuestionGroup {
  label: string
  prompt: string
  count: number
  answers: PublicQuestionAnswer[]
}

export interface PublicQuestionInstance {
  runId: string
  pairIndex: number
  runIndex: number
  provider: string
  modelId: string
  variantLabelA: string
  variantLabelB: string
  promptA: string
  promptB: string
  responseA: string
  responseB: string
  classificationA: PublicEvidenceItem['classification']
  classificationB: PublicEvidenceItem['classification']
  receivedAt: string
}

export interface PublicQuestionDetail {
  questionKey: string
  questionText: string
  runCount: number
  modelCount: number
  variantACount: number
  variantBCount: number
  answerCount: number
  /** 'group' = one template with the phrase swapped (columns). 'pair' = two hand-written prompts (side by side). */
  layout: PublicQuestionLayout
  groups: PublicQuestionGroup[]
  instances: PublicQuestionInstance[]
}

export interface PublicEvidenceItem extends PublicEvidenceInput {
  id: string
  runId: string
  /** Original pair index within the submitting run; preserved when cohort remapping rewrites pairIndex. */
  sourcePairIndex?: number
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
  totals: { runs: number; responses: number; completePairs: number; models: number; questions: number }
  topQuestions: PublicQuestionSummary[]
  models: PublicModelAggregate[]
  latestAnalysis: PublicAnalysisSnapshot | null
  analysisPending: boolean
  latestReport: GeneratedReportSummary | null
  reportPending: boolean
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

export const reportEditorialSectionSchema = z.object({
  kind: z.enum(['finding', 'case-study', 'counterexample', 'consistency', 'safety']),
  heading: z.string().min(1).max(240),
  paragraphs: z.array(z.string().min(1).max(3_000)).min(1).max(6),
  pairSampleIds: z.array(z.string().min(1).max(500)).max(8).optional(),
}).strict()

export type ReportEditorialSection = z.infer<typeof reportEditorialSectionSchema>

export const reportNarrativeSchema = z.object({
  title: z.string().min(1).max(180),
  subtitle: z.string().min(1).max(400),
  executiveSummary: z.string().min(1).max(8_000),
  keyFindings: z.array(z.string().min(1).max(1_500)).min(1).max(10),
  methodology: z.string().min(1).max(5_000),
  limitations: z.array(z.string().min(1).max(1_500)).min(1).max(10),
  sections: z.array(reportEditorialSectionSchema).min(1).max(12).optional(),
}).strict()

export type ReportNarrative = z.infer<typeof reportNarrativeSchema>

const dimensionScoresSchema = z.object({
  dangerFraming: z.number().int().min(0).max(3),
  sympathy: z.number().int().min(0).max(3),
  skepticism: z.number().int().min(0).max(3),
  collectiveBlame: z.number().int().min(0).max(3),
  moralCondemnation: z.number().int().min(0).max(3),
  antiStereotyping: z.number().int().min(0).max(3),
  acknowledgesDiscrimination: z.number().int().min(0).max(3),
}).strict()

export interface GeneratedReportModelSummary {
  provider: string
  modelId: string
  responses: number
  completePairs: number
  refusals: number
  errors: number
  truncated: number
}

export interface DimensionScores {
  dangerFraming: number
  sympathy: number
  skepticism: number
  collectiveBlame: number
  moralCondemnation: number
  antiStereotyping: number
  acknowledgesDiscrimination: number
}

export interface GeneratedReportPairScore {
  pairSampleId: string
  variantAEvidenceId: string
  variantBEvidenceId: string
  pairIndex: number
  runIndex: number
  provider: string
  modelId: string
  variantA: DimensionScores
  variantB: DimensionScores
  note: string
  direction: 'A' | 'B' | 'even'
  magnitude: number
}

export interface GeneratedReportSummary {
  id: string
  scope: 'run' | 'global'
  status: 'pending' | 'complete' | 'failed'
  title: string | null
  responseCount: number
  completePairs: number
  modelCount: number
  createdAt: string
  completedAt: string | null
  /** For a report still being made: how many question-model analyses are complete. */
  progress?: { completedAnalyses: number; expectedAnalyses: number }
  /** Why a stopped report stopped, when the server recorded a reason. */
  errorCode?: string | null
}

export interface GeneratedReportDocument {
  schemaVersion: 1
  id: string
  scope: 'run' | 'global'
  generatedAt: string
  scoringModelId: string
  synthesisModelId: string
  responseCount: number
  completePairs: number
  modelCount: number
  narrative: ReportNarrative
  models: GeneratedReportModelSummary[]
  pairScores: GeneratedReportPairScore[]
  evidence: PublicEvidenceItem[]
}

export const generatedReportSummarySchema: z.ZodType<GeneratedReportSummary> = z.object({
  id: z.string(), scope: z.enum(['run', 'global']), status: z.enum(['pending', 'complete', 'failed']),
  title: z.string().nullable(), responseCount: z.number().int().min(0), completePairs: z.number().int().min(0),
  modelCount: z.number().int().min(0), createdAt: z.string(), completedAt: z.string().nullable(),
  progress: z.object({ completedAnalyses: z.number().int().min(0), expectedAnalyses: z.number().int().min(0) }).optional(),
  errorCode: z.string().nullable().optional(),
})

export const generatedReportDocumentSchema: z.ZodType<GeneratedReportDocument> = z.object({
  schemaVersion: z.literal(1), id: z.string(), scope: z.enum(['run', 'global']), generatedAt: z.string(),
  scoringModelId: z.string(), synthesisModelId: z.string(), responseCount: z.number().int().min(0),
  completePairs: z.number().int().min(0), modelCount: z.number().int().min(0), narrative: reportNarrativeSchema,
  models: z.array(z.object({
    provider: z.string(), modelId: z.string(), responses: z.number().int().min(0), completePairs: z.number().int().min(0),
    refusals: z.number().int().min(0), errors: z.number().int().min(0), truncated: z.number().int().min(0),
  })),
  pairScores: z.array(z.object({
    pairSampleId: z.string().min(1),
    variantAEvidenceId: z.string().min(1),
    variantBEvidenceId: z.string().min(1),
    pairIndex: z.number().int().min(0), runIndex: z.number().int().min(0), provider: z.string(), modelId: z.string(),
    variantA: dimensionScoresSchema, variantB: dimensionScoresSchema, note: z.string(),
    direction: z.enum(['A', 'B', 'even']), magnitude: z.number().int().min(0).max(21),
  })),
  evidence: z.array(publicEvidenceInputSchema.extend({
    id: z.string(), runId: z.string(), sourcePairIndex: z.number().int().min(0).max(49).optional(),
    classification: z.enum(['hard-refusal', 'soft-refusal', 'empty', 'error', 'answered']), receivedAt: z.string(),
  })),
})

export const generatedReportListSchema = z.object({ reports: z.array(generatedReportSummarySchema) })
export const generatedReportStateSchema = z.object({ report: generatedReportSummarySchema })
export const generatedReportRequestSchema = z.object({
  runId: z.string().min(1).max(100).optional(),
  globalCohort: z.literal('current').optional(),
  /** A person-chosen set of leaderboard question keys to report on. */
  questionKeys: z.array(z.string().trim().min(1).max(1_000)).min(1).max(100).optional(),
}).strict().refine((value) => [value.runId, value.globalCohort, value.questionKeys].filter(Boolean).length === 1, {
  message: 'Provide exactly one of runId, globalCohort, or questionKeys.',
})

export interface PublicClaimReportRef {
  id: string
  title: string | null
}

/** A person-written claim about the AI, with its answer computed from the evidence. */
export interface PublicClaim {
  id: string
  text: string
  questionKeys: string[]
  createdAt: string
  /** Answers studied across the attached questions. */
  testCount: number
  /** Share of studied answers that were real answers (not refusals, errors, or empty). 0-100. */
  matchRate: number | null
  /** The judge model's verdict: mean 0–1 gap between the two sides of every judged pair on the seven report dimensions. Null until a report has scored the questions. */
  biasScore: number | null
  models: string[]
  lastSeenAt: string | null
  reports: PublicClaimReportRef[]
}

export const publicClaimSchema: z.ZodType<PublicClaim> = z.object({
  id: z.string(),
  text: z.string(),
  questionKeys: z.array(z.string()),
  createdAt: z.string(),
  testCount: z.number().int().min(0),
  matchRate: z.number().min(0).max(100).nullable(),
  biasScore: z.number().min(0).max(1).nullable(),
  models: z.array(z.string()),
  lastSeenAt: z.string().nullable(),
  reports: z.array(z.object({ id: z.string(), title: z.string().nullable() })),
})

export const publicClaimListSchema = z.object({ claims: z.array(publicClaimSchema) })

export const publicClaimRequestSchema = z.object({
  text: z.string().trim().min(12).max(300),
  questionKeys: z.array(z.string().trim().min(1).max(1_000)).min(1).max(100),
}).strict()

export type PublicClaimRequest = z.infer<typeof publicClaimRequestSchema>

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

export const publicQuestionSummarySchema: z.ZodType<PublicQuestionSummary> = z.object({
  questionKey: z.string(),
  questionText: z.string(),
  runCount: z.number().int().min(0),
  modelCount: z.number().int().min(0),
  variantACount: z.number().int().min(0),
  variantBCount: z.number().int().min(0),
  answerCount: z.number().int().min(0),
  groupLabels: z.array(z.string()),
  lastSeenAt: z.string(),
})

const classificationSchema = z.enum(['hard-refusal', 'soft-refusal', 'empty', 'error', 'answered'])

// Older API responses lack the run position; treat them as position 0 so the page still renders.
export const publicQuestionAnswerSchema: z.ZodType<PublicQuestionAnswer, z.ZodTypeDef, unknown> = z.object({
  id: z.string(),
  runId: z.string(),
  pairIndex: z.number().int().min(0).optional().transform((value) => value ?? 0),
  runIndex: z.number().int().min(0).optional().transform((value) => value ?? 0),
  provider: z.string(),
  modelId: z.string(),
  prompt: z.string(),
  response: z.string(),
  classification: classificationSchema,
  receivedAt: z.string(),
})

export const publicQuestionGroupSchema: z.ZodType<PublicQuestionGroup, z.ZodTypeDef, unknown> = z.object({
  label: z.string(),
  prompt: z.string(),
  count: z.number().int().min(0),
  answers: z.array(publicQuestionAnswerSchema),
})

export const publicQuestionInstanceSchema: z.ZodType<PublicQuestionInstance> = z.object({
  runId: z.string(),
  pairIndex: z.number().int().min(0),
  runIndex: z.number().int().min(0),
  provider: z.string(),
  modelId: z.string(),
  variantLabelA: z.string(),
  variantLabelB: z.string(),
  promptA: z.string(),
  promptB: z.string(),
  responseA: z.string(),
  responseB: z.string(),
  classificationA: z.enum(['hard-refusal', 'soft-refusal', 'empty', 'error', 'answered']),
  classificationB: z.enum(['hard-refusal', 'soft-refusal', 'empty', 'error', 'answered']),
  receivedAt: z.string(),
})

export const publicQuestionDetailSchema: z.ZodType<PublicQuestionDetail, z.ZodTypeDef, unknown> = z.object({
  questionKey: z.string(),
  questionText: z.string(),
  runCount: z.number().int().min(0),
  modelCount: z.number().int().min(0),
  variantACount: z.number().int().min(0),
  variantBCount: z.number().int().min(0),
  answerCount: z.number().int().min(0),
  layout: z.enum(['group', 'pair']),
  groups: z.array(publicQuestionGroupSchema),
  instances: z.array(publicQuestionInstanceSchema),
})

export const publicLeaderboardSchema: z.ZodType<PublicLeaderboard> = z.object({
  totals: z.object({ runs: z.number().int(), responses: z.number().int(), completePairs: z.number().int(), models: z.number().int(), questions: z.number().int() }),
  topQuestions: z.array(publicQuestionSummarySchema),
  models: z.array(z.object({
    provider: z.string(), modelId: z.string(), responseCount: z.number().int(), completePairs: z.number().int(),
    asymmetricPairs: z.number().int(), asymmetryRate: z.number().nullable(), answeredCount: z.number().int(),
    refusalCount: z.number().int(), errorCount: z.number().int(), truncatedCount: z.number().int(),
    averageLatencyMs: z.number().nullable(), firstSeenAt: z.string(), lastSeenAt: z.string(),
  })),
  latestAnalysis: z.object({ threshold: z.number().int(), modelId: z.string(), analysis: z.string(), completedAt: z.string() }).nullable(),
  analysisPending: z.boolean(),
  latestReport: generatedReportSummarySchema.nullable(),
  reportPending: z.boolean(),
  recentEvidence: z.array(publicEvidenceInputSchema.extend({
    id: z.string(), runId: z.string(), classification: z.enum(['hard-refusal', 'soft-refusal', 'empty', 'error', 'answered']), receivedAt: z.string(),
  })),
})
