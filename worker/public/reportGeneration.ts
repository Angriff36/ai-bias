import {
  generatedReportDocumentSchema,
  reportNarrativeSchema,
  type GeneratedReportDocument,
  type GeneratedReportPairScore,
} from '../../src/public/contracts'
import { buildPairSampleId, groupCompleteMatchedSamples } from './matchedSampleIdentity'
import { analyzeReportEvidence } from './reportExperimentAnalysis'
import { groupPolarJudgeCells, RetryableReportCheckpointError, type PolarJudgeCell } from './reportJudgeBatch'
import {
  buildOpenRouterJudgeBatchRequest,
  buildReportJudgeCustomId,
  parseOpenRouterJudgeResult,
  type OpenRouterJudgeBatchClient,
} from './reportJudgeBatchApi'
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
  loadJudgeBatch?(reportId: string): Promise<{ id: string; status: string; progress?: { completedAnalyses: number; expectedAnalyses: number } } | null>
  saveJudgeBatch?(reportId: string, batch: { id: string; status: string }, leaseOwner: string, progress?: { completedAnalyses: number; expectedAnalyses: number }): Promise<void>
  updateJudgeBatchStatus?(reportId: string, status: string, leaseOwner: string): Promise<void>
  updateReportAnalysisProgress?(reportId: string, progress: { completedAnalyses: number; expectedAnalyses: number }, leaseOwner: string): Promise<void>
  clearJudgeBatch?(reportId: string, leaseOwner: string): Promise<void>
  touchReportGeneration(reportId: string, now: string, leaseOwner: string): Promise<void>
  releaseReportGeneration?(reportId: string, leaseOwner: string): Promise<void>
}

export interface GenerateReportOptions {
  existingPairScores?: GeneratedReportPairScore[]
  deadlineMs?: number
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

const TERMINAL_BATCH_STATUSES = new Set(['completed', 'failed', 'cancelled', 'expired'])

function batchStatusName(status: string): string {
  return status.split(':', 1)[0] ?? status
}

function batchResultCursor(status: string): number {
  const match = status.match(/^completed:(\d+)$/)
  return match ? Number(match[1]) : 0
}

export async function generateReport(
  synthesisModels: ReportModelClient,
  source: ReportSource,
  _judgeModels: ReportModelClient,
  options?: GenerateReportOptions,
): Promise<GenerateReportResult> {
  const completeGroups = groupCompleteMatchedSamples(source.evidence)
  if (completeGroups.length === 0) throw new InvalidModelOutput('No complete evidence groups.')
  const existingScores = existingScoreMap(options?.existingPairScores)
  const modelDeadlineMs = options?.deadlineMs == null ? undefined : options.deadlineMs - REPORT_PERSISTENCE_RESERVE_MS
  if (completeGroups.some((group) => {
    const variantA = group.find((item) => item.variantKey === 'A')!
    return !existingScores.has(buildPairSampleId(variantA))
  })) return { status: 'partial', pairScores: [...existingScores.values()] }

  const pairScores = completeGroups.map((group) => {
    const variantA = group.find((item) => item.variantKey === 'A')!
    return existingScores.get(buildPairSampleId(variantA))!
  })
  const analysis = analyzeReportEvidence(source.evidence, pairScores)
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
  judgeBatches: OpenRouterJudgeBatchClient,
  leaseOwner: string,
): Promise<void> {
  const checkpointRepo = repository as GeneratedReportRepository
  await checkpointRepo.touchReportGeneration(reportId, new Date().toISOString(), leaseOwner)
  const active = await checkpointRepo.loadJudgeBatch?.(reportId) ?? null
  const batch = active ? await judgeBatches.retrieve(active.id) : null
  if (batch) {
    const remoteTotal = Number(batch.request_counts?.total ?? 0)
    if (remoteTotal > 0) {
      const completedAnalyses = active?.progress?.completedAnalyses ?? 0
      await checkpointRepo.updateReportAnalysisProgress?.(reportId, {
        completedAnalyses,
        expectedAnalyses: Math.max(active?.progress?.expectedAnalyses ?? 0, completedAnalyses + remoteTotal),
      }, leaseOwner)
    }
    if (!TERMINAL_BATCH_STATUSES.has(batch.status)) {
      await checkpointRepo.updateJudgeBatchStatus?.(reportId, batch.status, leaseOwner)
      return
    }
    if (batchStatusName(active!.status) !== batch.status) {
      await checkpointRepo.updateJudgeBatchStatus?.(reportId, `${batch.status}:0`, leaseOwner)
      return
    }
  }
  const source = await repository.getReportEvidence(reportId)
  const existingPairScores = checkpointRepo.loadPairScores ? await checkpointRepo.loadPairScores(reportId) : []
  const existingScores = existingScoreMap(existingPairScores)
  const judgeCells = groupPolarJudgeCells(source.evidence)
  const pendingCells = judgeCells.filter((cell) => cell.groups.some((group) => {
    const variantA = group.find((item) => item.variantKey === 'A')!
    return !existingScores.has(buildPairSampleId(variantA))
  }))
  const progress = {
    completedAnalyses: judgeCells.length - pendingCells.length,
    expectedAnalyses: judgeCells.length,
  }

  if (pendingCells.length > 0) {
    if (!active) {
      const created = await judgeBatches.submit(await buildOpenRouterJudgeBatchRequest(
        reportId, source.row.scoringModelId, pendingCells,
      ))
      await checkpointRepo.saveJudgeBatch?.(reportId, { id: created.id, status: created.status }, leaseOwner, progress)
      return
    }

    if (batch?.status !== 'completed') {
      await checkpointRepo.clearJudgeBatch?.(reportId, leaseOwner)
      return
    }

    const cursor = batchResultCursor(active.status)
    const result = batch.results?.[cursor]
    if (!result) {
      // Every returned entry has been handled. The next invocation either
      // submits only still-unscored failures or advances to synthesis.
      await checkpointRepo.clearJudgeBatch?.(reportId, leaseOwner)
      return
    }

    let cell: PolarJudgeCell | undefined
    for (const pendingCell of pendingCells) {
      if (await buildReportJudgeCustomId(reportId, pendingCell) === result.custom_id) {
        cell = pendingCell
        break
      }
    }
    if (cell) {
      try {
        const persisted = parseOpenRouterJudgeResult(cell, result)
        await checkpointRepo.upsertPairScores?.(reportId, persisted, leaseOwner)
        await checkpointRepo.updateReportAnalysisProgress?.(reportId, {
          completedAnalyses: progress.completedAnalyses + 1,
          expectedAnalyses: progress.expectedAnalyses,
        }, leaseOwner)
      } catch {
        // The cursor still advances; this cell remains unscored and is the only
        // work resubmitted after every result in this batch has been handled.
      }
    }
    await checkpointRepo.updateJudgeBatchStatus?.(reportId, `completed:${cursor + 1}`, leaseOwner)
    return
  }

  if (active) {
    await checkpointRepo.clearJudgeBatch?.(reportId, leaseOwner)
    return
  }
  const result = await generateReport(synthesisModels, source, synthesisModels, { existingPairScores })
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
  judgeBatches: OpenRouterJudgeBatchClient,
  leaseOwner: string,
): Promise<void> {
  const heartbeat = setInterval(() => {
    void repository.touchReportGeneration(reportId, new Date().toISOString(), leaseOwner).catch(() => undefined)
  }, REPORT_GENERATION_HEARTBEAT_MS)
  try {
    await processReportChunk(synthesisModels, repository, reportId, judgeBatches, leaseOwner)
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
  if (error instanceof RetryableReportCheckpointError || /OpenRouter Batch|timed out|429|rate limit/i.test(message)) {
    await checkpointRepo.touchReportGeneration(reportId, new Date().toISOString(), leaseOwner)
    return
  }
  const code = error instanceof InvalidModelOutput ? 'invalid-model-output' : message.slice(0, 80)
  await repository.failReport(reportId, code, leaseOwner)
}
