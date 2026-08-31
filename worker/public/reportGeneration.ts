import {
  generatedReportDocumentSchema,
  reportNarrativeSchema,
  type GeneratedReportDocument,
  type GeneratedReportPairScore,
} from '../../src/public/contracts'
import { groupCompleteMatchedSamples } from './matchedSampleIdentity'
import { analyzeReportEvidence } from './reportExperimentAnalysis'
import { RetryableReportCheckpointError, scoreAllPairsWithJudge } from './reportJudgeBatch'
import type { ReportModelClient } from './reportModelClient'
import type { GeneratedReportRepository } from './reportRepository'
import { buildSynthesisPrompt } from './reportSynthesisPrompt'

interface ReportSource {
  row: {
    id: string
    scope: 'run' | 'global'
    scoringModelId: string
    synthesisModelId: string
  }
  evidence: Parameters<typeof analyzeReportEvidence>[0]
}

interface ReportGenerationRepository {
  getReportEvidence(reportId: string): Promise<ReportSource>
  completeReport(reportId: string, document: GeneratedReportDocument, now: string, leaseOwner: string): Promise<void>
  failReport(reportId: string, code: string, leaseOwner: string): Promise<void>
  loadPairScores?(reportId: string): Promise<GeneratedReportPairScore[]>
  upsertPairScores?(reportId: string, scores: GeneratedReportPairScore[], leaseOwner: string): Promise<void>
  touchReportGeneration(reportId: string, now: string, leaseOwner: string): Promise<void>
  releaseReportGeneration?(reportId: string, leaseOwner: string): Promise<void>
}

export interface GenerateReportOptions {
  existingPairScores?: GeneratedReportPairScore[]
  deadlineMs?: number
  onCheckpoint?: (pairScores: GeneratedReportPairScore[]) => Promise<void> | void
  deferSynthesisAfterScoring?: boolean
}

export type GenerateReportResult = GeneratedReportDocument | { status: 'partial'; pairScores: GeneratedReportPairScore[] }

export const REPORT_GENERATION_BUDGET_MS = 25_000
export const REPORT_PERSISTENCE_RESERVE_MS = 2_000
export const REPORT_GENERATION_HEARTBEAT_MS = 30_000

class InvalidModelOutput extends Error {}

function parseJson(value: string): unknown {
  const text = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new InvalidModelOutput('Report model returned invalid JSON.')
  try { return JSON.parse(text.slice(start, end + 1)) } catch { throw new InvalidModelOutput('Report model returned invalid JSON.') }
}

function existingScoreMap(scores: GeneratedReportPairScore[] | undefined): Map<string, GeneratedReportPairScore> {
  return new Map((scores ?? []).map((score) => [score.pairSampleId, score]))
}

export async function generateReport(
  synthesisModels: ReportModelClient,
  source: ReportSource,
  judgeModels: ReportModelClient,
  options?: GenerateReportOptions,
): Promise<GenerateReportResult> {
  const completeGroups = groupCompleteMatchedSamples(source.evidence)
  if (completeGroups.length === 0) throw new InvalidModelOutput('No complete evidence groups.')
  const existingScores = existingScoreMap(options?.existingPairScores)
  const scoringWasComplete = existingScores.size >= completeGroups.length
  const modelDeadlineMs = options?.deadlineMs == null ? undefined : options.deadlineMs - REPORT_PERSISTENCE_RESERVE_MS
  const judged = await scoreAllPairsWithJudge(judgeModels, source.row.scoringModelId, source.evidence, {
    existingScores,
    shouldStop: modelDeadlineMs == null ? undefined : () => Date.now() >= modelDeadlineMs,
    deadlineMs: modelDeadlineMs,
    onCheckpoint: options?.onCheckpoint,
  })
  if (!judged.complete || (options?.deferSynthesisAfterScoring && !scoringWasComplete)) {
    return { status: 'partial', pairScores: judged.pairScores }
  }

  const analysis = analyzeReportEvidence(source.evidence, judged.pairScores)
  const synthesisTimeoutMs = modelDeadlineMs == null ? undefined : Math.max(1, modelDeadlineMs - Date.now())
  const raw = await synthesisModels.complete(
    source.row.synthesisModelId,
    buildSynthesisPrompt(source, analysis),
    4096,
    { jsonObject: true, ...(synthesisTimeoutMs != null ? { timeoutMs: synthesisTimeoutMs } : {}) },
  )
  const narrative = reportNarrativeSchema.safeParse(parseJson(raw))
  if (!narrative.success || !narrative.data.sections?.length) {
    throw new InvalidModelOutput('Report model returned an invalid report narrative.')
  }
  const document: GeneratedReportDocument = {
    schemaVersion: 1,
    id: source.row.id,
    scope: source.row.scope,
    generatedAt: new Date().toISOString(),
    scoringModelId: source.row.scoringModelId,
    synthesisModelId: source.row.synthesisModelId,
    responseCount: analysis.responseCount,
    completePairs: analysis.uniqueQuestionCount,
    modelCount: analysis.models.length,
    narrative: narrative.data,
    models: analysis.models,
    pairScores: analysis.pairScores,
    evidence: source.evidence,
  }
  const validated = generatedReportDocumentSchema.safeParse(document)
  if (!validated.success) throw new InvalidModelOutput('Generated report did not match the report schema.')
  return validated.data
}

export async function processReportChunk(
  synthesisModels: ReportModelClient,
  repository: ReportGenerationRepository,
  reportId: string,
  judgeModels: ReportModelClient,
  leaseOwner: string,
): Promise<void> {
  const checkpointRepo = repository as GeneratedReportRepository
  await checkpointRepo.touchReportGeneration(reportId, new Date().toISOString(), leaseOwner)
  const source = await repository.getReportEvidence(reportId)
  const existingPairScores = checkpointRepo.loadPairScores ? await checkpointRepo.loadPairScores(reportId) : []
  const result = await generateReport(synthesisModels, source, judgeModels, {
    existingPairScores,
    deferSynthesisAfterScoring: true,
    onCheckpoint: checkpointRepo.upsertPairScores
      ? async (scores) => {
          await checkpointRepo.upsertPairScores!(reportId, scores, leaseOwner)
          await checkpointRepo.touchReportGeneration(reportId, new Date().toISOString(), leaseOwner).catch(() => undefined)
        }
      : undefined,
  })
  if ('status' in result) return
  await repository.completeReport(reportId, result, new Date().toISOString(), leaseOwner)
}

/**
 * Report model calls can outlive Cloudflare's 30-second waitUntil window.
 * Keep the HTTP request connected until this step and its checkpoints settle.
 */
export async function runReportGenerationStep(
  synthesisModels: ReportModelClient,
  repository: ReportGenerationRepository,
  reportId: string,
  judgeModels: ReportModelClient,
  leaseOwner: string,
): Promise<void> {
  const heartbeat = setInterval(() => {
    void repository.touchReportGeneration(reportId, new Date().toISOString(), leaseOwner).catch(() => undefined)
  }, REPORT_GENERATION_HEARTBEAT_MS)
  try {
    await processReportChunk(synthesisModels, repository, reportId, judgeModels, leaseOwner)
  } catch (error) {
    await handleReportChunkFailure(repository, reportId, error, leaseOwner)
  } finally {
    clearInterval(heartbeat)
    try {
      await repository.releaseReportGeneration?.(reportId, leaseOwner)
    } catch {
      // The lease expires on its own; do not replace a successful checkpoint or
      // completion with a cleanup-only D1 error.
    }
  }
}

export async function handleReportChunkFailure(
  repository: ReportGenerationRepository,
  reportId: string,
  error: unknown,
  leaseOwner: string,
): Promise<void> {
  const checkpointRepo = repository as GeneratedReportRepository
  const source = await repository.getReportEvidence(reportId)
  const expectedCount = groupCompleteMatchedSamples(source.evidence).length
  const scoredCount = await checkpointRepo.countPairScores(reportId)
  if (scoredCount >= expectedCount) {
    await checkpointRepo.touchReportGeneration(reportId, new Date().toISOString(), leaseOwner)
    return
  }
  const message = error instanceof Error ? error.message : 'generation-failed'
  if (error instanceof RetryableReportCheckpointError || /timed out|429|rate limit/i.test(message)) {
    await checkpointRepo.touchReportGeneration(reportId, new Date().toISOString(), leaseOwner)
    return
  }
  const code = error instanceof InvalidModelOutput ? 'invalid-model-output' : message.slice(0, 80)
  await repository.failReport(reportId, code, leaseOwner)
}
